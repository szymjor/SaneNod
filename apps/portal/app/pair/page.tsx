import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, configured } from "../../lib/auth";
import { Pairing } from "../../components/pairing";
export const dynamic = "force-dynamic";
export default async function Pair() {
  if (!configured())
    return (
      <p className="notice">
        Parowanie będzie dostępne po podłączeniu usługi kont.
      </p>
    );
  if (!(await auth().api.getSession({ headers: await headers() })))
    redirect("/auth?next=/pair");
  return (
    <div className="narrow">
      <span className="eyebrow">Połączone urządzenia</span>
      <h1>Telefon i komputer. Razem.</h1>
      <Pairing />
    </div>
  );
}
