import { test, expect, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { patches } from "../../apps/portal/lib/calibrator/measurement";
// @ts-expect-error Plain Node fixture sits outside application sources.
import { testUser } from "../../packages/auth/scripts/test-user.mjs";
async function login(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/auth");
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page).toHaveURL("/dashboard");
}
async function prepare(page: import("@playwright/test").Page) {
  await page.goto("/apps/calibrator");
  await page.getByRole("button", { name: "Dalej: warunki pracy" }).click();
  await page.getByLabel("Monitor / nazwa stanowiska").fill("E2E monitor");
  await page
    .getByRole("button", { name: "Dalej: ustawienia monitora" })
    .click();
}
test("guided external measurement saves history, compares repeats and downloads a fixed ICC", async ({
  page,
}) => {
  const email = `calibration-${randomUUID()}@example.test`,
    password = `Test-${randomUUID()}`,
    user = await testUser(email, password);
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await login(page, email, password);
    await prepare(page);
    if (process.env.SANENOD_SCREENSHOTS)
      await page.screenshot({
        path: ".cache/calibrator-desktop.png",
        fullPage: true,
      });
    await page.getByText("4. Ustaw biel", { exact: true }).click();
    await expect(page.getByText(/RGB Offset/)).toBeHidden();
    await expect(page.getByText(/RGB Gain \/ Wzmocnienie RGB/)).toBeVisible();
    await page.getByRole("button", { name: /Mam kolorymetr/ }).click();
    await page.getByRole("button", { name: "Dalej: pomiar" }).click();
    await page
      .getByLabel("Kolorymetr i korekcja dla typu ekranu")
      .fill("Test colorimeter / WLED");
    const csv =
      "patch,X,Y,Z\n" +
      patches
        .map((p) => {
          const y = p.id === "black" ? 0 : 120 * p.rgb[1] ** 2.2 || 1;
          return `${p.id},${y * 0.9504},${y},${y * 1.0888}`;
        })
        .join("\n");
    await page.getByText("Wczytaj całą serię z CSV", { exact: true }).click();
    await page.getByLabel("Lub wklej CSV").fill(csv);
    await page.getByRole("button", { name: "Sprawdź i zapisz CSV" }).click();
    await expect(
      page.getByRole("heading", { name: "Seria zapisana. Co teraz?" }),
    ).toBeVisible();
    await expect(page.getByText("120.0 cd/m²", { exact: true })).toBeVisible();
    if (process.env.SANENOD_SCREENSHOTS)
      await page.screenshot({
        path: ".cache/calibrator-result.png",
        fullPage: true,
      });
    await expect(page.getByText("2.20", { exact: true })).toBeVisible();
    await page.getByLabel(/Rozumiem różnicę/).check();
    const response = await page.request.get(
      "/api/calibrator/profile?standard=srgb",
    );
    expect(response.status()).toBe(200);
    const profile = await response.body();
    expect(profile.toString("ascii", 36, 40)).toBe("acsp");
    expect(profile.readUInt32BE(0)).toBe(profile.length);
    await page
      .getByRole("button", { name: "Nowa seria po zmianie ustawień" })
      .click();
    await page.getByRole("button", { name: "Dalej: pomiar" }).click();
    await page.getByText("Wczytaj całą serię z CSV", { exact: true }).click();
    await page.getByLabel("Lub wklej CSV").fill(csv);
    await page.getByRole("button", { name: "Sprawdź i zapisz CSV" }).click();
    await expect(
      page.getByRole("heading", { name: "Seria zapisana. Co teraz?" }),
    ).toBeVisible();
    await expect(
      page
        .getByLabel("Poprzednia seria tego monitora i metody")
        .locator("option"),
    ).toHaveCount(2);
    await page
      .getByLabel("Poprzednia seria tego monitora i metody")
      .selectOption({ index: 1 });
    await expect(
      page.getByRole("img", { name: /Porównanie zmierzonej/ }),
    ).toBeVisible();
    const csrf = await page.request.post("/api/calibrator", {
      headers: { origin: "https://evil.example" },
      data: { action: "create" },
    });
    expect(csrf.status()).toBe(403);
  } finally {
    await db.query('DELETE FROM "user" WHERE id=$1', [user]);
    await db.end();
  }
});
test("paired phone captures real video frames, computer advances and camera result stays relative", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const email = `camera-${randomUUID()}@example.test`,
    password = `Test-${randomUUID()}`,
    user = await testUser(email, password);
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const desktop = await browser.newContext(),
    phone = await browser.newContext({
      ...devices["Pixel 7"],
      permissions: ["camera"],
    });
  const a = await desktop.newPage(),
    b = await phone.newPage();
  try {
    await login(a, email, password);
    await login(b, email, password);
    await prepare(a);
    await a.getByRole("button", { name: "Dalej: pomiar" }).click();
    const created = a.waitForResponse(
      (r) => r.url().endsWith("/api/pair") && r.request().method() === "POST",
    );
    await a.getByRole("button", { name: "Utwórz kod QR" }).click();
    const pair = await (await created).json();
    await b.goto(`/apps/calibrator/phone#${pair.token}`);
    await b.getByRole("button", { name: "Połącz z komputerem" }).click();
    await expect(
      a.getByText("Telefon połączony. Możesz uruchomić serię."),
    ).toBeVisible();
    expect(await b.evaluate(() => location.hash)).toBe("");
    await b.getByRole("button", { name: "Włącz kamerę" }).click();
    await expect(
      b.getByRole("button", { name: "Zablokuj dostępne automatyki" }),
    ).toBeVisible();
    if (process.env.SANENOD_SCREENSHOTS)
      await b.screenshot({
        path: ".cache/calibrator-phone.png",
        fullPage: true,
      });
    await a
      .getByRole("button", { name: "Rozpocznij serię 10 wzorców" })
      .click();
    for (const p of patches) {
      await expect(
        b.getByRole("button", { name: `Zmierz: ${p.name}`, exact: true }),
      ).toBeEnabled();
      await b
        .getByRole("button", { name: `Zmierz: ${p.name}`, exact: true })
        .click();
      await expect(
        a.getByText("Próbka odebrana", { exact: true }),
      ).toBeVisible();
      await a
        .getByRole("button", {
          name: p.id === "blue" ? "Zakończ serię →" : "Następny wzorzec →",
          exact: true,
        })
        .last()
        .click();
    }
    await expect(
      a.getByRole("heading", { name: "Seria zapisana. Co teraz?" }),
    ).toBeVisible();
    await expect(a.getByText("Bez pomiaru", { exact: true })).toHaveCount(3);
    await expect(b.getByText(/Seria zakończona/)).toBeVisible();
    const stored = await a.request.get("/api/calibrator");
    const run = (await stored.json()).runs[0];
    expect(run.measurements).toHaveLength(10);
    expect(run.sensor).toBe("camera");
    expect(run.analysis.brightness).toBeNull();
    await b.getByRole("button", { name: "Zakończ połączenie" }).click();
  } finally {
    await desktop.close();
    await phone.close();
    await db.query('DELETE FROM "user" WHERE id=$1', [user]);
    await db.end();
  }
});
