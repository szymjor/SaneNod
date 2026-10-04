import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
export async function migrate(url) {
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const { runMigrations } = await getMigrations({
      database: pool,
      rateLimit: { storage: "database" },
    });
    await runMigrations();
    await pool.query(
      await readFile(
        new URL("../../../database/001-pairing.sql", import.meta.url),
        "utf8",
      ),
    );
    console.log("Account and pairing schema are ready.");
  } finally {
    await pool.end();
  }
}
