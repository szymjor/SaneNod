import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
mkdirSync(".cache", { recursive: true });
const name = "sanenod-postgres";
const envFile = ".cache/postgres.env";
if (!existsSync(envFile)) {
  writeFileSync(
    envFile,
    `POSTGRES_USER=sanenod\nPOSTGRES_DB=sanenod\nPOSTGRES_PASSWORD=${randomBytes(32).toString("hex")}\n`,
    { mode: 0o600 },
  );
}
let exists = false;
try {
  execFileSync("docker", ["container", "inspect", name], { stdio: "ignore" });
  exists = true;
} catch {
  /* Not started yet. */
}
if (exists) {
  const label = execFileSync(
    "docker",
    ["inspect", "-f", '{{index .Config.Labels "dev.sanenod.local"}}', name],
    { encoding: "utf8" },
  ).trim();
  if (label !== "true")
    throw new Error("Container name is already used by an unrelated container");
  execFileSync("docker", ["start", name], { stdio: "inherit" });
} else {
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      name,
      "--label",
      "dev.sanenod.local=true",
      "--env-file",
      envFile,
      "-p",
      "127.0.0.1:54329:5432",
      "-v",
      "sanenod-postgres-data:/var/lib/postgresql",
      "postgres:18.4",
    ],
    { stdio: "inherit" },
  );
}
if (!existsSync("apps/portal/.env.local")) {
  const password = readFileSync(envFile, "utf8").match(
    /^POSTGRES_PASSWORD=(.+)$/m,
  )?.[1];
  writeFileSync(
    "apps/portal/.env.local",
    `NEXT_PUBLIC_SITE_URL=http://localhost:3000\nBETTER_AUTH_URL=http://localhost:3000\nBETTER_AUTH_SECRET=${randomBytes(48).toString("hex")}\nDATABASE_URL=postgresql://sanenod:${password}@127.0.0.1:54329/sanenod\n`,
    { mode: 0o600 },
  );
}
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    execFileSync("docker", ["exec", name, "pg_isready", "-U", "sanenod"], {
      stdio: "ignore",
    });
    console.log(
      "Local PostgreSQL is ready; existing .env.local was preserved.",
    );
    process.exit(0);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
throw new Error("PostgreSQL did not become ready");
