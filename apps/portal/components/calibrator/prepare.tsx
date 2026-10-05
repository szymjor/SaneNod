"use client";
import { controls } from "../../lib/calibrator/monitor-controls";
import type { Sensor } from "../../lib/calibrator/measurement";
export function Prepare({
  sensor,
  setSensor,
  onNext,
  onBack,
}: {
  sensor: Sensor;
  setSensor: (s: Sensor) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <section className="cal-panel">
      <span className="eyebrow">Krok 3 · Menu monitora</span>
      <h2>Otwórz ustawienia na monitorze.</h2>
      <p>
        Użyj przycisków lub joysticka na obudowie. Zmieniamy ustawienia samego
        monitora; profil ICC wybierzesz na końcu.
      </p>
      <div className="control-list">
        {controls.map((c) => (
          <details key={c.title}>
            <summary>{c.title}</summary>
            <p>{c.help}</p>
            <div className="control-names">
              <strong>Szukaj nazw:</strong> {c.names}
            </div>
            <p className="muted">{c.extra}</p>
          </details>
        ))}
      </div>
      <p className="muted">
        To spotykane nazwy, nie lista menu każdego modelu. Ta sama nazwa może
        działać inaczej. Jeśli masz wątpliwości, sprawdź instrukcję swojego
        monitora.
      </p>
      <details>
        <summary>Wzorzec do sprawdzenia kontrastu i poziomu czerni</summary>
        <p>
          Spójrz na ekran bezpośrednio. Pola przy czerni i bieli powinny być
          rozróżnialne. Nie zmieniaj zakresu sygnału HDMI na chybił trafił —
          komputer i ekran muszą używać zgodnego zakresu.
        </p>
        <div
          className="gray-test"
          aria-label="Skala szarości z ciemnymi i jasnymi stopniami"
        >
          {[0, 4, 8, 12, 16, 32, 64, 128, 192, 235, 240, 245, 250, 255].map(
            (v) => (
              <div
                key={v}
                style={{
                  background: `rgb(${v},${v},${v})`,
                  color: v < 128 ? "white" : "black",
                }}
              >
                {v}
              </div>
            ),
          )}
        </div>
      </details>
      <h3>Jak chcesz sprawdzać efekty?</h3>
      <div className="sensor-options">
        <button
          className={`use-option ${sensor === "camera" ? "selected" : ""}`}
          aria-pressed={sensor === "camera"}
          onClick={() => setSensor("camera")}
        >
          <strong>Telefon + kamera</strong>
          <span>
            Orientacyjne próbki. Bez pomiaru jasności i temperatury bieli.
          </span>
        </button>
        <button
          className={`use-option ${sensor === "external" ? "selected" : ""}`}
          aria-pressed={sensor === "external"}
          onClick={() => setSensor("external")}
        >
          <strong>Mam kolorymetr</strong>
          <span>
            Wpisz wyniki XYZ lub wczytaj CSV z oprogramowania czujnika.
          </span>
        </button>
      </div>
      <div className="actions">
        <button className="button secondary" onClick={onBack}>
          Wstecz
        </button>
        <button className="button" onClick={onNext}>
          Dalej: pomiar →
        </button>
      </div>
    </section>
  );
}
