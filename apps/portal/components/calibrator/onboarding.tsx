"use client";
import {
  standards,
  uses,
  recommended,
  suitability,
  defaults,
  type Settings,
  type Use,
  type StandardId,
} from "../../lib/calibrator/standards";
export function Onboarding({
  settings,
  setSettings,
  stage,
  onNext,
  onBack,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
  stage: number;
  onNext: () => void;
  onBack: () => void;
}) {
  const standard = standards[settings.standard];
  return (
    <section className="cal-panel">
      <span className="eyebrow">
        {stage === 0 ? "Krok 1 · Twój cel" : "Krok 2 · Warunki pracy"}
      </span>
      <h2>
        {stage === 0
          ? "Do czego używasz monitora?"
          : "Dopasuj cel do swojego biurka."}
      </h2>
      {stage === 0 ? (
        <>
          <p>
            Wybierz najważniejsze zastosowanie. Zaproponujemy standard; możesz
            go zmienić.
          </p>
          <div className="use-options">
            {Object.entries(uses).map(([id, label]) => (
              <button
                key={id}
                className={`use-option ${settings.use === id ? "selected" : ""}`}
                aria-pressed={settings.use === id}
                onClick={() =>
                  setSettings({
                    ...defaults(id as Use),
                    monitor: settings.monitor,
                    sensorName: settings.sensorName,
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
          <label htmlFor="standard">Standard kolorystyczny</label>
          <select
            id="standard"
            value={settings.standard}
            onChange={(e) =>
              setSettings({
                ...defaults(settings.use, e.target.value as StandardId),
                monitor: settings.monitor,
                sensorName: settings.sensorName,
              })
            }
          >
            {Object.entries(standards).map(([id, s]) => (
              <option key={id} value={id}>
                {s.name}
                {recommended(settings.use) === id ? " — polecany" : ""}
              </option>
            ))}
          </select>
          <div className="notice">
            <strong>{standard.name}</strong>
            <p>{standard.explanation}</p>
            <p>{suitability(settings.use, settings.standard)}</p>
          </div>
          <p className="muted">
            {standard.caution} Wybór standardu nie zwiększa gamutu monitora.
          </p>
          <details>
            <summary>Co oznaczają pozostałe standardy?</summary>
            {Object.entries(standards).map(([id, s]) => (
              <p key={id}>
                <strong>{s.name}:</strong> {s.explanation} {s.caution}
              </p>
            ))}
          </details>
        </>
      ) : (
        <>
          <p>
            To cele ustawień monitora. Jasność zależy od otoczenia; podane
            wartości są propozycją do SDR, a nie wymogiem każdego standardu.
          </p>
          <div className="form-grid">
            <div>
              <label htmlFor="monitor">Monitor / nazwa stanowiska</label>
              <input
                id="monitor"
                maxLength={120}
                placeholder="np. Dell U2723QE, biurko"
                value={settings.monitor}
                onChange={(e) =>
                  setSettings({ ...settings, monitor: e.target.value })
                }
              />
            </div>
            <div>
              <label htmlFor="ambient">Światło w pomieszczeniu</label>
              <select
                id="ambient"
                value={settings.ambient}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    ambient: e.target.value as Settings["ambient"],
                  })
                }
              >
                <option value="dim">Przyciemnione, bez odblasków</option>
                <option value="office">Zwykłe światło biurowe</option>
                <option value="bright">Jasne / dużo światła dziennego</option>
              </select>
            </div>
            <div>
              <label htmlFor="white">Punkt bieli</label>
              <select
                id="white"
                value={settings.white}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    white: e.target.value as Settings["white"],
                  })
                }
              >
                <option value="D65">
                  D65 — typowa biel ekranowa (~6500 K)
                </option>
                <option value="D50">D50 — ocena druku (~5000 K)</option>
                <option value="DCI">Biel kinowa DCI</option>
              </select>
            </div>
            <div>
              <label htmlFor="brightness">Docelowa jasność (cd/m²)</label>
              <input
                id="brightness"
                type="number"
                min={40}
                max={400}
                value={settings.brightness}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    brightness: Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label htmlFor="gamma">Docelowa gamma</label>
              <input
                id="gamma"
                type="number"
                min={1.8}
                max={2.8}
                step={0.01}
                value={Number(settings.gamma.toFixed(2))}
                onChange={(e) =>
                  setSettings({ ...settings, gamma: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <details>
            <summary>Jak wybrać biel, jasność i gammę?</summary>
            <p>
              D65 jest dobrym początkiem do WWW i większości pracy z ekranem.
              D50 rozważ przy porównywaniu wydruku z oświetleniem D50. Różne
              warunki oświetlenia zmieniają wygląd bieli.
            </p>
            <p>
              Zacznij np. od 100–120 cd/m² przy kontrolowanym świetle. To
              praktyczny punkt wyjścia, nie uniwersalna norma. Referencyjne
              otoczenie sRGB/Display P3 opisuje 80 cd/m². Kamerą nie
              potwierdzisz jasności w cd/m².
            </p>
            <p>
              Typowo: sRGB ma krzywą odcinkową, często przybliżaną gammą 2,2;
              wideo SDR w ciemniejszym otoczeniu około 2,4; kino DCI 2,6. Te
              wartości nie są trybami HDR PQ/HLG.
            </p>
          </details>
          {(settings.white !== standard.white ||
            Math.abs(settings.gamma - standard.gamma) > 0.05) && (
            <p className="notice">
              Wybrana biel lub gamma różni się od profilu {standard.name}.
              Gotowy ICC zachowuje parametry standardu; nie dopasuje się do
              własnych ustawień.
            </p>
          )}
          {settings.ambient === "bright" && (
            <p className="notice">
              Najpierw ogranicz odblaski i ustabilizuj światło. W jasnym
              otoczeniu ekran może wydawać się za ciemny mimo poprawnego
              pomiaru.
            </p>
          )}
        </>
      )}
      <div className="actions">
        {stage > 0 && (
          <button className="button secondary" onClick={onBack}>
            Wstecz
          </button>
        )}
        <button
          className="button"
          disabled={
            stage === 1 &&
            (!Number.isFinite(settings.brightness) ||
              settings.brightness < 40 ||
              settings.brightness > 400 ||
              settings.gamma < 1.8 ||
              settings.gamma > 2.8)
          }
          onClick={onNext}
        >
          {stage === 0 ? "Dalej: warunki pracy" : "Dalej: ustawienia monitora"}{" "}
          →
        </button>
      </div>
    </section>
  );
}
