import Link from "next/link";
import { redirect } from "next/navigation";
import { Panel } from "@sanenod/ui";
import { configured, auth } from "../../lib/auth";
import { headers } from "next/headers";
import { signOut } from "../auth/actions";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  if (!configured())
    return (
      <>
        <h1>Twoja przestrzeń</h1>
        <p className="notice">Podłącz usługę kont, aby otworzyć swój pulpit.</p>
        <Link className="button" href="/">
          Wróć na stronę główną
        </Link>
      </>
    );
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) redirect("/auth?next=/dashboard");
  const user = session.user;
  return (
    <>
      <span className="eyebrow">Twój pulpit</span>
      <h1>Wszystko w jednym miejscu.</h1>
      <p className="lead">Zalogowano jako {user.email}</p>
      <div className="actions">
        <Link className="button secondary" href="/pair">
          Połącz urządzenia ⇄
        </Link>
        <form action={signOut}>
          <button className="button">Wyloguj to urządzenie</button>
        </form>
      </div>
      <div className="section-head">
        <h2>Twoje aplikacje</h2>
        <span className="badge">Ekosystem w budowie</span>
      </div>
      <div className="grid">
        <Panel>
          <span className="large-icon">▣</span>
          <h2>Kalibrator Monitora</h2>
          <p>
            Planowana pierwsza aplikacja. Będzie dostępna po weryfikacji
            infrastruktury.
          </p>
          <span className="badge">W przygotowaniu</span>
        </Panel>
        <Panel>
          <h2>Kolejne narzędzia</h2>
          <p>Ta przestrzeń będzie rosła razem z ekosystemem.</p>
        </Panel>
      </div>
    </>
  );
}
