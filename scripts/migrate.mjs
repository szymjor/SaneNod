import { existsSync } from "node:fs";
import { migrate } from "../packages/auth/scripts/migrate.mjs";
if (existsSync("apps/portal/.env.local"))
  process.loadEnvFile("apps/portal/.env.local");
await migrate(process.env.DATABASE_URL);
