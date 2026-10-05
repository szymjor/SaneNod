import type { Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
// Local E2E simulates independent devices. Keep production rate limits enabled:
// all browsers on a CI runner otherwise share one /sign-in bucket (3 attempts/10s).
export async function isolateDeviceIP(page: Page) {
  const groups = randomBytes(8).toString("hex").match(/.{4}/g)!.join(":");
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `2001:db8:${groups}::1`,
  });
}
