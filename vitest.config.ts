import { defineConfig } from "vitest/config";
import { existsSync } from "node:fs";
if (existsSync("apps/portal/.env.local"))
  process.loadEnvFile("apps/portal/.env.local");
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], fileParallelism: false },
});
