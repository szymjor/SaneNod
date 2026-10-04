import { chromium, devices, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";

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
  ? { "x-vercel-protection-bypass": process.env.DEPLOYMENT_PROTECTION_BYPASS }
  : {};
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
});
const desktop = await browser.newContext({ baseURL: origin, extraHTTPHeaders });
const phone = await browser.newContext({
  ...devices["Pixel 7"],
  baseURL: origin,
  extraHTTPHeaders,
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
  stage = "test registration";
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
  stage = "mobile login";
  await b.goto("/auth");
  await b.getByLabel("Adres e-mail").fill(email);
  await b.getByLabel("Hasło", { exact: true }).fill(password);
  await b.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(b).toHaveURL(`${origin}/dashboard`);
  stage = "pairing";
  await a.goto("/pair");
  const created = a.waitForResponse(
    (r) => r.url().endsWith("/api/pair") && r.request().method() === "POST",
  );
  await a.getByRole("button", { name: "Utwórz kod QR" }).click();
  const pairing = await (await created).json();
  assert.equal(pairing.token.length, 64);
  await b.goto(`/pair/claim#${pairing.token}`);
  await b.getByRole("button", { name: "Połącz z komputerem" }).click();
  await expect(b.getByText("Urządzenia połączone.")).toBeVisible();
  await expect(a.getByText("Urządzenia połączone.")).toBeVisible();
  assert.equal(await b.evaluate(() => location.hash), "");
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
  await a.getByRole("button", { name: "Sprawdź połączenie" }).click();
  await expect(
    a.getByText("Drugie urządzenie odpowiedziało. Komunikacja działa."),
  ).toBeVisible();
  await b.getByRole("button", { name: "Zakończ połączenie" }).click();
  await expect(a.getByText("Sesja zakończona", { exact: true })).toBeVisible();
  stage = "logout isolation";
  await a.goto("/dashboard");
  await a.getByRole("button", { name: "Wyloguj to urządzenie" }).click();
  await expect(a).toHaveURL(`${origin}/auth`);
  await a.goto("/dashboard");
  await expect(a).toHaveURL(/\/auth\?next=/);
  await b.goto("/dashboard");
  await expect(b.getByText(`Zalogowano jako ${email}`)).toBeVisible();
  stage = "PWA offline and cache privacy";
  await b.evaluate(async () => {
    await navigator.serviceWorker.ready;
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
        path.startsWith("/pair"),
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
      ],
    }),
  );
} catch (error) {
  console.error(`Deployment verification failed at ${stage} (${error.name}).`);
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
