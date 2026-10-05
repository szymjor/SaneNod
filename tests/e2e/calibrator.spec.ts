import { test, expect, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { isolateDeviceIP } from "./network";
import { patches } from "../../apps/portal/lib/calibrator/measurement";
// @ts-expect-error Plain Node fixture sits outside application sources.
import { testUser } from "../../packages/auth/scripts/test-user.mjs";
async function login(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await isolateDeviceIP(page);
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
  test.setTimeout(180000);
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
    // A camera failure must stay visible while successful connection polls continue.
    await b.evaluate(() => {
      const media = navigator.mediaDevices;
      const original = media.getUserMedia.bind(media);
      let first = true;
      media.getUserMedia = (constraints) => {
        if (first) {
          first = false;
          return Promise.reject(
            new DOMException("Camera unavailable", "NotSupportedError"),
          );
        }
        return original(constraints);
      };
    });
    await b.getByRole("button", { name: "Włącz kamerę" }).click();
    await expect(
      b.getByText(/Przeglądarka nie obsługuje tej kamery/),
    ).toBeVisible();
    // Observe an actual completed poll rather than adding an arbitrary delay.
    await b.waitForResponse(
      (r) => r.url().includes("/api/calibrator?pairId=") && r.status() === 200,
    );
    await expect(
      b.getByText(/Przeglądarka nie obsługuje tej kamery/),
    ).toBeVisible();
    await b.getByRole("button", { name: "Włącz kamerę" }).click();
    await expect(
      b.getByRole("button", { name: "Zablokuj dostępne automatyki" }),
    ).toBeVisible();
    if (process.env.SANENOD_SCREENSHOTS)
      await b.screenshot({
        path: ".cache/calibrator-phone.png",
        fullPage: true,
      });
    // PC pattern and phone instructions remain synchronized without uploading images.
    await a.getByRole("button", { name: "Uruchom testy z telefonem" }).click();
    await expect(
      b.getByRole("heading", { name: "Rozróżnij ciemne tony" }),
    ).toBeVisible();
    await expect(
      a.getByRole("button", { name: "Rozpocznij serię 10 wzorców" }),
    ).toBeDisabled();
    await a.getByRole("button", { name: "Test na pełnym ekranie" }).click();
    await expect
      .poll(() => a.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(true);
    await b.getByRole("button", { name: "Następny test →" }).click();
    await expect(
      a.getByRole("img", { name: "Test monitora: Zachowaj jasne szczegóły" }),
    ).toBeVisible();
    await b.getByRole("button", { name: "Następny test →" }).click();
    await expect(
      b.getByRole("heading", { name: "Ustaw komfortową biel" }),
    ).toBeVisible();
    await b.getByRole("button", { name: "Następny test →" }).click();
    await expect(
      a.getByRole("img", {
        name: "Test monitora: Sprawdź jednolite szare tło",
      }),
    ).toBeVisible();
    await expect(
      a.getByRole("img", { name: "Mapa kodów RGB kamery, siatka 5 na 5" }),
    ).toBeVisible();
    await b
      .getByText("Dopasuj obszar bez przeciągania", { exact: true })
      .click();
    await b.getByLabel(/Szerokość:/).fill("0.5");
    expect(
      await b
        .locator(".camera-crop")
        .evaluate((el) => (el as HTMLElement).style.width),
    ).toBe("50%");
    await b
      .getByText("Zapisz obserwację i ustawienia monitora", { exact: true })
      .click();
    await b
      .getByLabel("Co widzisz i co zmieniasz?")
      .fill("Backlight 30; kontrola telefonu");
    await b
      .getByRole("button", { name: "Zapisz obserwację", exact: true })
      .click();
    await expect(
      b.getByText("Obserwacja zapisana.", { exact: true }),
    ).toBeVisible();
    await b.reload();
    await expect(
      b.getByRole("heading", { name: "Sprawdź jednolite szare tło" }),
    ).toBeVisible();
    await b
      .getByText("Zapisz obserwację i ustawienia monitora", { exact: true })
      .click();
    await expect(b.getByLabel("Co widzisz i co zmieniasz?")).toHaveValue(
      "Backlight 30; kontrola telefonu",
    );
    await b.getByRole("button", { name: "Włącz kamerę" }).click();
    // Phone changes also work while the PC is fullscreen.
    await b.getByRole("button", { name: "Następny test →" }).click();
    await expect(
      a.getByRole("img", {
        name: "Test monitora: Obejrzyj czerń bez podbijania zdjęcia",
      }),
    ).toBeVisible();
    await b.getByRole("button", { name: "Następny test →" }).click();
    await expect(
      a.getByRole("img", { name: "Test monitora: Sprawdź płynność przejść" }),
    ).toBeVisible();
    await a.evaluate(() => document.exitFullscreen());
    const download = a.waitForEvent("download");
    await a.getByRole("button", { name: "Pobierz obserwacje CSV" }).click();
    expect((await download).suggestedFilename()).toBe(
      "sanenod-testy-monitora.csv",
    );
    await a.getByRole("button", { name: "Zakończ testy ustawień" }).click();
    await expect(
      b.getByRole("heading", { name: "Sprawdź płynność przejść" }),
    ).toBeHidden();
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
