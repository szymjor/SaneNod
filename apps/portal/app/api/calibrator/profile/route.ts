import { auth, configured } from "../../../../lib/auth";
import {
  standards,
  type StandardId,
} from "../../../../lib/calibrator/standards";
import { standardICC } from "../../../../lib/calibrator/icc";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!configured())
    return Response.json(
      { error: "Usługa kont niedostępna." },
      { status: 503, headers },
    );
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "Zaloguj się." }, { status: 401, headers });
  const id = new URL(request.url).searchParams.get("standard") ?? "";
  if (!Object.hasOwn(standards, id))
    return Response.json(
      { error: "Nieznany standard." },
      { status: 400, headers },
    );
  return new Response(new Uint8Array(standardICC(id as StandardId)), {
    headers: {
      ...headers,
      "Content-Type": "application/vnd.iccprofile",
      "Content-Disposition": `attachment; filename="SaneNod-${id}-reference.icc"`,
    },
  });
}
