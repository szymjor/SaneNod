import { configured, pool } from "../../../lib/auth";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!configured())
    return Response.json({ status: "configuration_required" }, { status: 503 });
  try {
    await pool().query('select 1 from "user" limit 1');
    await pool().query("select 1 from pairing_sessions limit 1");
    await pool().query("select 1 from calibrations limit 1");
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "database_unavailable" }, { status: 503 });
  }
}
