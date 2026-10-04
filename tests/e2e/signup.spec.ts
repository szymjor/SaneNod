import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
test("development registration, cookie session, refresh and login", async ({
  page,
}) => {
  const url = process.env.DATABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error("Local database required");
  const db = new Pool({ connectionString: url });
  const email = `signup-${randomUUID()}@example.test`;
  const password = `Test-${randomUUID()}`;
  try {
    await page.goto("/auth?mode=register");
    await page.getByLabel("Twoje imię").fill("Test");
    await page.getByLabel("Adres e-mail").fill(email);
    await page.getByLabel("Hasło", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Utwórz konto" }).click();
    await expect(page).toHaveURL("/dashboard", { timeout: 30000 });
    await page.reload();
    await expect(page.getByText(email)).toBeVisible();
    await page.getByRole("button", { name: "Wyloguj to urządzenie" }).click();
    await expect(page).toHaveURL("/auth");
    await page.getByLabel("Adres e-mail").fill(email);
    await page.getByLabel("Hasło", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await expect(page).toHaveURL("/dashboard");
    const stored = await db.query(
      'SELECT password FROM account WHERE "userId"=(SELECT id FROM "user" WHERE email=$1)',
      [email],
    );
    expect(stored.rows[0].password).not.toBe(password);
  } finally {
    await db.query('DELETE FROM "user" WHERE email=$1', [email]);
    await db.end();
  }
});
