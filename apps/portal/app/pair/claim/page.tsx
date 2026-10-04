import { configured } from "../../../lib/auth";
import { ClaimGate } from "../../../components/claim-gate";
export const dynamic = "force-dynamic";
export default function Claim() {
  if (!configured())
    return (
      <p className="notice">
        Parowanie będzie dostępne po podłączeniu usługi kont.
      </p>
    );
  return (
    <div className="narrow">
      <span className="eyebrow">Telefon</span>
      <h1>Dołącz do komputera.</h1>
      <ClaimGate />
    </div>
  );
}
