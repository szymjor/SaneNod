import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, configured } from "../../../lib/auth";
import { CalibratorWorkspace } from "../../../components/calibrator/workspace";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Kalibrator Monitora — SaneNod",
  description:
    "Prowadzona regulacja monitora, telefon jako czujnik orientacyjny, pomiary kolorymetru i wybór standardowego profilu ICC.",
};
export default async function CalibratorPage() {
  if (!configured())
    return <p className="notice">Usługa kont jest niedostępna.</p>;
  if (!(await auth().api.getSession({ headers: await headers() })))
    redirect("/auth?next=/apps/calibrator");
  return <CalibratorWorkspace />;
}
