import { auth, configured, pool, authOrigin } from "../../../lib/auth";
import {
  createPairing,
  claimPairing,
  pairingStatus,
  events,
  sendEvent,
  revokePairing,
  PairingError,
} from "../../../lib/pairing";
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
    const db = pool();
    const url = new URL(request.url);
    if (request.method === "GET") {
      const id = url.searchParams.get("id") ?? "";
      const after = url.searchParams.get("after");
      if (after !== null) {
        if (!/^\d{1,15}$/.test(after))
          throw new PairingError(400, "Nieprawidłowy numer wiadomości.");
        return reply({ events: await events(db, identity, id, Number(after)) });
      }
      return reply(await pairingStatus(db, identity, id));
    }
    if (Number(request.headers.get("content-length") ?? 0) > 18000)
      return reply({ error: "Wiadomość jest zbyt duża." }, 413);
    const text = await request.text();
    if (Buffer.byteLength(text) > 18000)
      return reply({ error: "Wiadomość jest zbyt duża." }, 413);
    let body: {
      action?: string;
      token?: string;
      id?: string;
      kind?: string;
      payload?: unknown;
    };
    try {
      body = JSON.parse(text);
    } catch {
      return reply({ error: "Nieprawidłowy JSON." }, 400);
    }
    if (!body || typeof body !== "object")
      return reply({ error: "Nieprawidłowe żądanie." }, 400);
    switch (body.action) {
      case "create":
        return reply(await createPairing(db, identity), 201);
      case "claim":
        return reply(
          await claimPairing(db, identity, String(body.token ?? "")),
        );
      case "send":
        return reply(
          await sendEvent(
            db,
            identity,
            String(body.id ?? ""),
            body.kind,
            body.payload,
          ),
        );
      case "revoke":
        await revokePairing(db, identity, String(body.id ?? ""));
        return reply({ ok: true });
      default:
        return reply({ error: "Nieznana operacja." }, 400);
    }
  } catch (error) {
    if (error instanceof PairingError)
      return reply({ error: error.message }, error.status);
    // Never include SQL, credentials, tokens or internal errors in a client response.
    return reply({ error: "Usługa połączeń jest chwilowo niedostępna." }, 503);
  }
}
export const GET = handle;
export const POST = handle;
