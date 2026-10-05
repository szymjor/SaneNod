import type { Run } from "../../lib/calibrator/store";
export async function api(path: string, body?: object) {
  const response = await fetch(path, {
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error ?? "Nie udało się połączyć. Spróbuj ponownie.",
    );
  return result;
}
export async function command(body: object): Promise<Run> {
  return (await api("/api/calibrator", body)).run;
}
export const message = (e: unknown) =>
  e instanceof Error ? e.message : "Nie udało się wykonać operacji.";
