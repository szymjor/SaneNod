import { toNextJsHandler } from "better-auth/next-js";
import { auth, configured } from "../../../../lib/auth";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  if (!configured())
    return Response.json(
      { error: "Account service is not configured" },
      { status: 503 },
    );
  const handler = toNextJsHandler(auth());
  return request.method === "GET"
    ? handler.GET(request)
    : handler.POST(request);
}
export const GET = handle;
export const POST = handle;
