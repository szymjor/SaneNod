// Additive application migrations using Neon HTTPS. Secrets remain in process memory.
import { readdir, readFile } from "node:fs/promises";
const target = process.env.MIGRATION_TARGET;
if (!["preview", "production"].includes(target))
  throw new Error("Set MIGRATION_TARGET explicitly to preview or production.");
const project =
  process.env.VERCEL_PROJECT_ID ?? "prj_fq3PbZQCuXaej0XAHCRz2ENvSF2v";
const team = process.env.VERCEL_ORG_ID ?? "team_T7AfBn4j1kIvKRiuLz4lXlSZ";
async function run() {
  if (!process.env.VERCEL_TOKEN)
    throw new Error("VERCEL_TOKEN is required in secure environment settings.");
  const envResponse = await fetch(
    `https://api.vercel.com/v3/env/pull/${encodeURIComponent(project)}/${target}?teamId=${encodeURIComponent(team)}`,
    { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` } },
  );
  if (!envResponse.ok)
    throw new Error(`Vercel env pull failed (${envResponse.status}).`);
  const { env } = await envResponse.json();
  const connection = env.DATABASE_URL;
  if (!connection) throw new Error("Target has no DATABASE_URL.");
  const url = new URL(connection);
  if (!url.hostname.endsWith(".neon.tech"))
    throw new Error("HTTPS migration requires a Neon database.");
  const directory = new URL("../database/", import.meta.url);
  const files = (await readdir(directory))
    .filter((name) => /^\d+-.+\.sql$/.test(name))
    .sort();
  for (const file of files) {
    const raw = await readFile(new URL(file, directory), "utf8");
    // The current migrations contain no procedures or quoted semicolons. Do not use this splitter for general SQL.
    const queries = raw
      .replace(/^BEGIN;\s*/, "")
      .replace(/COMMIT;\s*$/, "")
      .split(";")
      .map((query) => query.trim())
      .filter(Boolean)
      .map((query) => ({ query, params: [] }));
    const response = await fetch(`https://${url.hostname}/sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Neon-Connection-String": connection,
        "Neon-Batch-Isolation-Level": "Serializable",
      },
      body: JSON.stringify({ queries }),
    });
    if (!response.ok)
      throw new Error(
        `Migration ${file} failed (${response.status}); details withheld to protect credentials.`,
      );
    console.log(`${target}: ${file} committed`);
  }
  const verified = await fetch(`https://${url.hostname}/sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Neon-Connection-String": connection,
    },
    body: JSON.stringify({
      query:
        "SELECT to_regclass('public.calibrations') IS NOT NULL AND to_regclass('public.calibration_guides') IS NOT NULL AS ready",
      params: [],
    }),
  });
  if (!verified.ok || !(await verified.json()).rows[0]?.ready)
    throw new Error("Calibration schema verification failed.");
  console.log(`${target}: calibration and guide schemas verified`);
}
try {
  await run();
} catch (error) {
  console.error(
    error instanceof Error && !/url|fetch|connect/i.test(error.message)
      ? error.message
      : "Migration failed. Inspect target configuration without printing secrets.",
  );
  process.exitCode = 1;
}
