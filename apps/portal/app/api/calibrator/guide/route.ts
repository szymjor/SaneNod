import { auth, configured, pool, authOrigin } from "../../../../lib/auth";
import { PairingError } from "../../../../lib/pairing";
import { readGuide, mutateGuide } from "../../../../lib/calibrator/guide-store";
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
    const identity = { userId: session.user.id, sessionId: session.session.id };
    if (request.method === "GET")
      return reply({
        guide: await readGuide(
          pool(),
          identity,
          new URL(request.url).searchParams.get("pairingId") ?? "",
        ),
      });
    if (Number(request.headers.get("content-length") ?? 0) > 6000)
      return reply({ error: "Wiadomość jest zbyt duża." }, 413);
    const text = await request.text();
    if (Buffer.byteLength(text) > 6000)
      return reply({ error: "Wiadomość jest zbyt duża." }, 413);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return reply({ error: "Nieprawidłowy JSON." }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return reply({ error: "Nieprawidłowe żądanie." }, 400);
    return reply({ guide: await mutateGuide(pool(), identity, body) });
  } catch (e) {
    if (e instanceof PairingError) return reply({ error: e.message }, e.status);
    return reply({ error: "Testy są chwilowo niedostępne." }, 503);
  }
}
export const GET = handle;
export const POST = handle;
