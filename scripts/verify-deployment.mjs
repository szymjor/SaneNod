import { chromium, devices, expect as baseExpect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
const expect = baseExpect.configure({ timeout: 30000 });

const origin = new URL(process.env.DEPLOYMENT_TEST_URL).origin;
if (!origin.startsWith("https://"))
  throw new Error("An HTTPS test deployment is required");
const target = process.env.DEPLOYMENT_TARGET ?? "production";
if (!["production", "preview"].includes(target))
  throw new Error("Invalid deployment target");
const project =
  process.env.VERCEL_PROJECT_ID ?? "prj_fq3PbZQCuXaej0XAHCRz2ENvSF2v";
const team = process.env.VERCEL_TEAM_ID ?? "team_T7AfBn4j1kIvKRiuLz4lXlSZ";
const extraHTTPHeaders = process.env.DEPLOYMENT_PROTECTION_BYPASS
  ? {
      "x-vercel-protection-bypass": process.env.DEPLOYMENT_PROTECTION_BYPASS,
      "x-vercel-set-bypass-cookie": "true",
    }
  : {};
const proxyURL = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
const parsedProxy = proxyURL ? new URL(proxyURL) : undefined;
const proxy = parsedProxy
  ? {
      server: `${parsedProxy.protocol}//${parsedProxy.host}`,
      username: decodeURIComponent(parsedProxy.username),
      password: decodeURIComponent(parsedProxy.password),
    }
  : undefined;
const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream"],
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  proxy,
});
const desktop = await browser.newContext({
  baseURL: origin,
  extraHTTPHeaders,
  proxy,
});
const phone = await browser.newContext({
  ...devices["Pixel 7"],
  permissions: ["camera"],
  baseURL: origin,
  extraHTTPHeaders,
  proxy,
});
const a = await desktop.newPage(),
  b = await phone.newPage();
for (const page of [a, b]) {
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(60000);
}
const email = `smoke-${randomUUID()}@example.test`,
  password = `Test-${randomUUID()}`;
let accountId,
  stage = "health";
function progress(value) {
  stage = value;
  console.log(`Verification: ${value}`);
}
async function cleanup() {
  if (!accountId || !process.env.VERCEL_TOKEN) return;
  const r = await fetch(
    `https://api.vercel.com/v3/env/pull/${project}/${target}?teamId=${team}`,
    {
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
    },
  );
  if (!r.ok) throw new Error("Cannot obtain cleanup database connection");
  const { env } = await r.json();
  const db = env.DATABASE_URL;
  const q = await fetch(`https://${new URL(db).hostname}/sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Neon-Connection-String": db,
    },
    // Delete only the disposable account this script just registered.
    body: JSON.stringify({
      query: 'DELETE FROM "user" WHERE id=$1 AND email=$2',
      params: [accountId, email],
    }),
  });
  if (!q.ok) throw new Error("Disposable account cleanup failed");
}
try {
  const health = await a.request.get("/api/health");
  assert.equal(health.status(), 200);
  assert.deepEqual(await health.json(), { status: "ok" });
  assert.equal(
    (
      await a.request.get("/api/pair?id=00000000-0000-0000-0000-000000000000")
    ).status(),
    401,
  );
  const manifest = await a.request.get("/manifest.webmanifest");
  assert.equal((await manifest.json()).display, "standalone");
  progress("test registration");
  await a.goto("/auth?mode=register");
  await expect(a.getByText(/Środowisko testowe: adresów e-mail/)).toBeVisible();
  await a.getByLabel("Twoje imię").fill("SaneNod smoke");
  await a.getByLabel("Adres e-mail").fill(email);
  await a.getByLabel("Hasło", { exact: true }).fill(password);
  await a.getByRole("button", { name: "Utwórz konto" }).click();
  await expect(a).toHaveURL(`${origin}/dashboard`);
  const session = await (await a.request.get("/api/auth/get-session")).json();
  accountId = session.user.id;
  assert.equal(session.user.emailVerified, false);
  const cookie = (await desktop.cookies()).find((c) =>
    c.name.endsWith("session_token"),
  );
  assert.equal(cookie?.secure, true);
  assert.equal(cookie?.httpOnly, true);
  await a.reload();
  await expect(a.getByText(`Zalogowano jako ${email}`)).toBeVisible();
  progress("mobile login");
  await b.goto("/auth");
  await b.getByLabel("Adres e-mail").fill(email);
  await b.getByLabel("Hasło", { exact: true }).fill(password);
  await b.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(b).toHaveURL(`${origin}/dashboard`);
  progress("pairing");
  await a.goto("/pair");
  const created = a.waitForResponse(
    (r) => r.url().endsWith("/api/pair") && r.request().method() === "POST",
  );
  await a.getByRole("button", { name: "Utwórz kod QR" }).click();
  const pairing = await (await created).json();
  assert.equal(pairing.token.length, 64);
  progress("phone claim");
  await b.goto(`/pair/claim#${pairing.token}`);
  await b.getByRole("button", { name: "Połącz z komputerem" }).click();
  await expect(b.getByText("Urządzenia połączone.")).toBeVisible();
  progress("desktop observes pairing");
  await expect(a.getByText("Urządzenia połączone.")).toBeVisible();
  assert.equal(await b.evaluate(() => location.hash), "");
  progress("replay and CSRF");
  assert.equal(
    (
      await b.request.post("/api/pair", {
        headers: { origin },
        data: { action: "claim", token: pairing.token },
      })
    ).status(),
    409,
  );
  assert.equal(
    (
      await a.request.post("/api/pair", {
        headers: { origin: "https://evil.example" },
        data: { action: "create" },
      })
    ).status(),
    403,
  );
  progress("ping/pong");
  await a.getByRole("button", { name: "Sprawdź połączenie" }).click();
  await expect(
    a.getByText("Drugie urządzenie odpowiedziało. Komunikacja działa."),
  ).toBeVisible();
  progress("revocation");
  await b.getByRole("button", { name: "Zakończ połączenie" }).click();
  await expect(a.getByText("Sesja zakończona", { exact: true })).toBeVisible();
  progress("calibrator onboarding and external import");
  await a.goto("/apps/calibrator");
  await a.getByRole("button", { name: "Dalej: warunki pracy" }).click();
  await a
    .getByLabel("Monitor / nazwa stanowiska")
    .fill("Synthetic deployment verification");
  await a.getByRole("button", { name: "Dalej: ustawienia monitora" }).click();
  await a.getByRole("button", { name: /Mam kolorymetr/ }).click();
  await a.getByRole("button", { name: "Dalej: pomiar" }).click();
  await a
    .getByLabel("Kolorymetr i korekcja dla typu ekranu")
    .fill("Synthetic test data, not an instrument");
  const ids = [
    "black",
    "gray-5",
    "gray-10",
    "gray-25",
    "gray-50",
    "gray-75",
    "white",
    "red",
    "green",
    "blue",
  ];
  const levels = [0, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 0.2126, 0.7152, 0.0722];
  const csv =
    "patch,X,Y,Z\n" +
    ids
      .map((id, i) => {
        const y = 120 * levels[i] ** 2.2;
        return `${id},${y * 0.9504},${y},${y * 1.0888}`;
      })
      .join("\n");
  await a.getByText("Wczytaj całą serię z CSV", { exact: true }).click();
  await a.getByLabel("Lub wklej CSV").fill(csv);
  await a.getByRole("button", { name: "Sprawdź i zapisz CSV" }).click();
  await expect(
    a.getByRole("heading", { name: "Seria zapisana. Co teraz?" }),
  ).toBeVisible();
  await expect(a.getByText("120.0 cd/m²", { exact: true })).toBeVisible();
  await a.getByLabel(/Rozumiem różnicę/).check();
  for (const standard of [
    "srgb",
    "adobe-rgb",
    "display-p3",
    "dci-p3",
    "rec709",
    "rec2020",
  ]) {
    const profileResponse = await a.request.get(
      `/api/calibrator/profile?standard=${standard}`,
    );
    assert.equal(profileResponse.status(), 200);
    const icc = await profileResponse.body();
    assert.equal(icc.toString("ascii", 36, 40), "acsp");
    assert.equal(icc.readUInt32BE(0), icc.length);
  }
  assert.equal(
    (
      await a.request.post("/api/calibrator", {
        headers: { origin: "https://evil.example" },
        data: { action: "create" },
      })
    ).status(),
    403,
  );
  progress("calibrator mobile camera pairing");
  await a
    .getByRole("button", { name: "Nowa seria po zmianie ustawień" })
    .click();
  await a.getByRole("button", { name: /Telefon \+ kamera/ }).click();
  await a.getByRole("button", { name: "Dalej: pomiar" }).click();
  const calibrationPairResponse = a.waitForResponse(
    (r) => r.url().endsWith("/api/pair") && r.request().method() === "POST",
  );
  await a.getByRole("button", { name: "Utwórz kod QR" }).click();
  const calibrationPair = await (await calibrationPairResponse).json();
  await b.goto(`/apps/calibrator/phone#${calibrationPair.token}`);
  await b.getByRole("button", { name: "Połącz z komputerem" }).click();
  await expect(
    a.getByText("Telefon połączony. Możesz uruchomić serię."),
  ).toBeVisible();
  assert.equal(await b.evaluate(() => location.hash), "");
  await b.getByRole("button", { name: "Włącz kamerę" }).click();
  await expect(
    b.getByRole("button", { name: "Zablokuj dostępne automatyki" }),
  ).toBeVisible();
  await a.getByRole("button", { name: "Rozpocznij serię 10 wzorców" }).click();
  const names = [
    "Czerń",
    "Szarość 5%",
    "Szarość 10%",
    "Szarość 25%",
    "Szarość 50%",
    "Szarość 75%",
    "Biel",
    "Czerwień",
    "Zieleń",
    "Niebieski",
  ];
  for (const [i, name] of names.entries()) {
    progress(`calibrator camera patch ${i + 1}/10`);
    await expect(
      b.getByRole("button", { name: `Zmierz: ${name}`, exact: true }),
    ).toBeEnabled();
    await b
      .getByRole("button", { name: `Zmierz: ${name}`, exact: true })
      .click();
    await expect(a.getByText("Próbka odebrana", { exact: true })).toBeVisible();
    await a
      .getByRole("button", {
        name: i === 9 ? "Zakończ serię →" : "Następny wzorzec →",
        exact: true,
      })
      .last()
      .click();
  }
  await expect(
    a.getByRole("heading", { name: "Seria zapisana. Co teraz?" }),
  ).toBeVisible();
  await expect(a.getByText("Bez pomiaru", { exact: true })).toHaveCount(3);
  const calibrations = await (await a.request.get("/api/calibrator")).json();
  assert.equal(calibrations.runs.length, 2);
  assert.equal(calibrations.runs[0].measurements.length, 10);
  assert.equal(calibrations.runs[0].analysis.brightness, null);
  await b.getByRole("button", { name: "Zakończ połączenie" }).click();
  progress("logout isolation");
  await a.goto("/dashboard");
  await a.getByRole("button", { name: "Wyloguj to urządzenie" }).click();
  await expect(a).toHaveURL(`${origin}/auth`);
  await a.goto("/dashboard");
  await expect(a).toHaveURL(/\/auth\?next=/);
  await b.goto("/dashboard");
  await expect(b.getByText(`Zalogowano jako ${email}`)).toBeVisible();
  progress("PWA offline and cache privacy");
  await b.evaluate(async () => {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Service worker activation timed out")),
          30000,
        ),
      ),
    ]);
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
  });
  const cached = await b.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (key) =>
          (await (await caches.open(key)).keys()).map(
            (r) => new URL(r.url).pathname,
          ),
        ),
      )
    ).flat(),
  );
  assert.equal(
    cached.some(
      (path) =>
        path.startsWith("/api/") ||
        path === "/dashboard" ||
        path.startsWith("/pair") ||
        path.startsWith("/apps/"),
    ),
    false,
  );
  await phone.setOffline(true);
  await b.goto("/dashboard");
  await expect(
    b.getByRole("heading", { name: "Wrócimy, gdy wróci połączenie." }),
  ).toBeVisible();
  await phone.setOffline(false);
  console.log(
    JSON.stringify({
      origin,
      target,
      result: "passed",
      checks: [
        "health",
        "registration",
        "secure session",
        "mobile login",
        "pairing",
        "replay and CSRF protection",
        "ping/pong",
        "revocation",
        "logout isolation",
        "PWA offline",
        "private cache exclusion",
        "calibrator onboarding and external CSV",
        "six fixed ICC exports",
        "mobile camera samples and saved history",
      ],
    }),
  );
} catch (error) {
  const reason =
    error.message?.match(/net::[A-Z_]+|Timeout \d+ms exceeded/)?.[0] ??
    error.message?.split("\n")[0];
  console.error(
    `Deployment verification failed at ${stage} (${reason ?? error.name}).`,
  );
  process.exitCode = 1;
} finally {
  await browser.close();
  try {
    await cleanup();
  } catch {
    console.error("Disposable test account cleanup needs attention.");
    process.exitCode = 1;
  }
}
