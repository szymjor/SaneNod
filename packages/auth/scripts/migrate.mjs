import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
export async function migrate(url) {
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const { runMigrations } = await getMigrations({
      database: pool,
      rateLimit: { storage: "database" },
    });
    await runMigrations();
    const directory = new URL("../../../database/", import.meta.url);
    for (const file of (await readdir(directory))
      .filter((name) => /^\d+-.+\.sql$/.test(name))
      .sort()) {
      await pool.query(await readFile(new URL(file, directory), "utf8"));
    }
    console.log("Account, pairing and application schemas are ready.");
  } finally {
    await pool.end();
  }
}
