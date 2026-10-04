import Link from "next/link";
import { Panel } from "@sanenod/ui";
export default function Home() {
  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">Twój ekosystem narzędzi</span>
          <h1>
            Mniej granic.
            <br />
            Więcej możliwości.
          </h1>
          <p className="lead">
            Jedno konto dla Twoich aplikacji. Telefon i komputer, które pracują
            razem. Wszystko w Twojej przestrzeni.
          </p>
          <div className="actions">
            <Link className="button" href="/dashboard">
              Otwórz swoją przestrzeń ↗
            </Link>
            <Link className="button secondary" href="/auth?mode=register">
              Utwórz konto
            </Link>
          </div>
          <p className="muted">W przeglądarce · Na telefonie · Na komputerze</p>
        </div>
        <div className="orbit" aria-label="Połączone urządzenia">
          <span className="eyebrow">Wszystko połączone</span>
          <div className="node">◉ Twoje konto SaneNod</div>
          <div className="node">▣ Komputer — Twoja przestrzeń pracy</div>
          <div className="node">▯ Telefon — Twój mobilny towarzysz</div>
        </div>
      </section>
      <div className="grid">
        <Panel>
          <span className="large-icon">◎</span>
          <h2>Jedno konto</h2>
          <p>Wspólna tożsamość i sesja we wszystkich aplikacjach ekosystemu.</p>
        </Panel>
        <Panel>
          <span className="large-icon">⇄</span>
          <h2>Dwa urządzenia</h2>
          <p>
            Połącz telefon z komputerem za pomocą kodu QR, w ramach własnego
            konta.
          </p>
        </Panel>
        <Panel>
          <span className="large-icon">↗</span>
          <h2>Miejsce na więcej</h2>
          <p>
            Nowe aplikacje pojawią się na pulpicie. Twoje konto pozostaje z
            Tobą.
          </p>
        </Panel>
      </div>
    </>
  );
}
