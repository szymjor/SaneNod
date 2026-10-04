import { mkdirSync, writeFileSync } from "node:fs";
const token = process.env.VERCEL_TOKEN;
if (!token)
  throw new Error(
    "VERCEL_TOKEN is missing. Supply it securely in environment settings, never in chat.",
  );
const team = process.env.VERCEL_TEAM_ID;
const suffix = team ? `?teamId=${encodeURIComponent(team)}` : "";
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};
let response = await fetch(
  `https://api.vercel.com/v9/projects/sanenod${suffix}`,
  { headers },
);
const created = response.status === 404;
if (response.status === 404)
  response = await fetch(`https://api.vercel.com/v11/projects${suffix}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "sanenod",
      framework: "nextjs",
      rootDirectory: "apps/portal",
      installCommand: "pnpm install --frozen-lockfile",
      buildCommand: "pnpm --filter @sanenod/portal build",
    }),
  });
if (!response.ok)
  throw new Error(
    `Vercel project operation failed (${response.status}). Check token scope, team access, and egress policy.`,
  );
const project = await response.json();
if (!project.id || !project.accountId)
  throw new Error("Vercel returned incomplete project metadata");
if (project.rootDirectory !== "apps/portal")
  throw new Error(
    "An existing sanenod project has a different root directory. Preserve it and review project settings.",
  );
if (created) {
  const settings = await fetch(
    `https://api.vercel.com/v9/projects/${project.id}${suffix}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        nodeVersion: "24.x",
        sourceFilesOutsideRootDirectory: true,
      }),
    },
  );
  if (!settings.ok)
    throw new Error(`Vercel project settings failed (${settings.status}).`);
}
mkdirSync(".vercel", { recursive: true });
writeFileSync(
  ".vercel/project.json",
  JSON.stringify({ projectId: project.id, orgId: project.accountId }, null, 2) +
    "\n",
);
console.log(
  `Project ${project.name} is linked. Set GitHub variable VERCEL_PROJECT_ID=${project.id} and VERCEL_ORG_ID=${project.accountId}.`,
);
