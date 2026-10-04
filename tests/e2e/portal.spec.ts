import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
// @ts-expect-error Plain Node fixture deliberately sits outside application sources.
import { testUser } from "../../packages/auth/scripts/test-user.mjs";
test("landing, manifest, offline fallback, and database health", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Mniej granic/ }),
  ).toBeVisible();
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });
  const manifest = await request.get("/manifest.webmanifest");
  expect((await manifest.json()).display).toBe("standalone");
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
    return registration.active?.state;
  });
  await page.context().setOffline(true);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Wrócimy, gdy wróci połączenie." }),
  ).toBeVisible();
  await page.context().setOffline(false);
});
test("unauthenticated requests cannot pair or open dashboard", async ({
  page,
  request,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\?next=/);
  expect(
    (
      await request.get("/api/pair?id=00000000-0000-0000-0000-000000000000")
    ).status(),
  ).toBe(401);
});
test("two browser devices share account, pair once, exchange ping, and revoke", async ({
  browser,
}) => {
  const email = `e2e-${randomUUID()}@example.test`,
    password = `Test-${randomUUID()}`;
  const user = await testUser(email, password);
  const desktop = await browser.newContext(),
    phone = await browser.newContext();
  const a = await desktop.newPage(),
    b = await phone.newPage();
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const page of [a, b]) {
      await page.goto("/auth");
      await page.getByLabel("Adres e-mail").fill(email);
      await page.getByLabel("Hasło", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Zaloguj się" }).click();
      await expect(page).toHaveURL("/dashboard");
      await expect(page.getByText(email)).toBeVisible();
    }
    // Same persistent browser context retains its common ecosystem session.
    await a.goto("/pair");
    const created = a.waitForResponse(
      (response) =>
        response.url().endsWith("/api/pair") &&
        response.request().method() === "POST",
    );
    await a.getByRole("button", { name: "Utwórz kod QR" }).click();
    const pair = await (await created).json();
    expect(pair.token).toHaveLength(64);
    await b.goto(`/pair/claim#${pair.token}`);
    await b.getByRole("button", { name: "Połącz z komputerem" }).click();
    await expect(b.getByText("Urządzenia połączone.")).toBeVisible();
    await expect(a.getByText("Urządzenia połączone.")).toBeVisible();
    expect(await b.evaluate(() => location.hash)).toBe("");
    await a.getByRole("button", { name: "Sprawdź połączenie" }).click();
    await expect(
      a.getByText("Drugie urządzenie odpowiedziało. Komunikacja działa."),
    ).toBeVisible({ timeout: 15000 });
    const csrf = await a.request.post("/api/pair", {
      headers: { origin: "https://evil.example" },
      data: { action: "create" },
    });
    expect(csrf.status()).toBe(403);
    const replay = await b.request.post("/api/pair", {
      headers: { origin: "http://localhost:3000" },
      data: { action: "claim", token: pair.token },
    });
    expect(replay.status()).toBe(409);
    await b.getByRole("button", { name: "Zakończ połączenie" }).click();
    await expect(a.getByText("Sesja zakończona", { exact: true })).toBeVisible({
      timeout: 10000,
    });
    await a.goto("/dashboard");
    await a.getByRole("button", { name: "Wyloguj to urządzenie" }).click();
    // Wait for the server action to clear the cookie before a new navigation.
    await expect(a).toHaveURL(/\/auth/);
    await a.goto("/dashboard");
    await expect(a).toHaveURL(/\/auth/);
    await b.goto("/dashboard");
    await expect(b.getByText(email)).toBeVisible();
  } finally {
    await desktop.close();
    await phone.close();
    await db.query('DELETE FROM "user" WHERE id=$1', [user]);
    await db.end();
  }
});
