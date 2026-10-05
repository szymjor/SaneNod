import { auth, configured, pool, authOrigin } from "../../../lib/auth";
import { PairingError } from "../../../lib/pairing";
import {
  createRun,
  mutateRun,
  history,
  readRun,
  phoneRun,
} from "../../../lib/calibrator/store";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function handle(request: Request) {
  try {
    if (!configured())
      return reply({ error: "Usługa kont nie jest skonfigurowana." }, 503);
    if (
      request.method !== "GET" &&
      request.headers.get("origin") !== authOrigin()
    )
      return reply({ error: "Nieprawidłowe źródło żądania." }, 403);
    const session = await auth().api.getSession({ headers: request.headers });
    if (!session) return reply({ error: "Zaloguj się." }, 401);
    const identity = { userId: session.user.id, sessionId: session.session.id },
      db = pool();
    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      if (params.has("pairId"))
        return reply({
          run: await phoneRun(db, identity, params.get("pairId")),
        });
      if (params.has("id"))
        return reply({ run: await readRun(db, identity, params.get("id")) });
      return reply({ runs: await history(db, identity) });
    }
    if (Number(request.headers.get("content-length") ?? 0) > 40000)
      return reply({ error: "Żądanie jest zbyt duże." }, 413);
    const text = await request.text();
    if (Buffer.byteLength(text) > 40000)
      return reply({ error: "Żądanie jest zbyt duże." }, 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
    } catch {
      return reply({ error: "Nieprawidłowy JSON." }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return reply({ error: "Nieprawidłowe żądanie." }, 400);
    return reply(
      {
        run:
          body.action === "create"
            ? await createRun(db, identity, body)
            : await mutateRun(db, identity, body),
      },
      body.action === "create" ? 201 : 200,
    );
  } catch (error) {
    if (error instanceof PairingError)
      return reply({ error: error.message }, error.status);
    if ((error as { code?: string }).code === "23505")
      return reply(
        {
          error: "Połączenie ma już aktywną serię. Zakończ ją przed następną.",
        },
        409,
      );
    return reply({ error: "Usługa pomiarów jest chwilowo niedostępna." }, 503);
  }
}
export const GET = handle;
export const POST = handle;
