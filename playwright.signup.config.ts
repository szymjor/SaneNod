import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
if (existsSync("apps/portal/.env.local"))
  process.loadEnvFile("apps/portal/.env.local");
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/signup.spec.ts",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://localhost:3001" },
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
    command: "pnpm --filter @sanenod/portal dev --port 3001",
    url: "http://localhost:3001",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      BETTER_AUTH_URL: "http://localhost:3001",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3001",
    },
  },
});
