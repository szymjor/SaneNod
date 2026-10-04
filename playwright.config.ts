import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
if (existsSync("apps/portal/.env.local"))
  process.loadEnvFile("apps/portal/.env.local");
export default defineConfig({
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  testDir: "./tests/e2e",
  testMatch: "**/portal.spec.ts",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : {},
      },
    },
  ],
  webServer: {
    command: "pnpm --filter @sanenod/portal start",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
