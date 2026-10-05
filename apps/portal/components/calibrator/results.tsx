"use client";
import { useState } from "react";
import { standards } from "../../lib/calibrator/standards";
import { analyze, patches } from "../../lib/calibrator/measurement";
import type { Run } from "../../lib/calibrator/store";
import { message } from "./api";
declare global {
  interface Window {
    sanenodDesktop?: {
      platform: string;
      openColorSettings: () => Promise<void>;
    };
  }
}
function Curve({ run, compare }: { run: Run; compare?: Run }) {
  const points = (r: Run) => {
    const scalar = (v: number[]) =>
      r.sensor === "external" ? v[1] : (v[0] + v[1] + v[2]) / 3;
    const white = r.measurements.find((m) => m.patch === "white"),
      black = r.measurements.find((m) => m.patch === "black");
    if (!white || !black) return "";
    const min = scalar(black.values),
      max = scalar(white.values);
    if (max <= min) return "";
    return patches
      .slice(0, 7)
      .flatMap((p) => {
        const m = r.measurements.find((v) => v.patch === p.id);
        return m
          ? [
              `${30 + p.rgb[0] * 430},${190 - Math.max(0, Math.min(1, (scalar(m.values) - min) / (max - min))) * 160}`,
            ]
          : [];
      })
      .join(" ");
  };
  return (
    <figure className="curve">
      <svg
        viewBox="0 0 490 230"
        role="img"
        aria-label={
          run.sensor === "external"
            ? "Porównanie zmierzonej luminancji skali szarości"
            : "Porównanie względnych sygnałów RGB kamery"
        }
      >
        <path d="M30 30 V190 H460" stroke="#8b9690" fill="none" />
        {[0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <path d={`M30 ${190 - v * 160} H460`} stroke="#dde3da" />
            <text x={30 + v * 430} y={210} textAnchor="middle">
              {v * 100}%
            </text>
          </g>
        ))}
        {compare && (
          <polyline
            points={points(compare)}
            fill="none"
            stroke="#bd805e"
            strokeWidth="3"
            strokeDasharray="6 4"
          />
        )}
        <polyline
          points={points(run)}
          fill="none"
          stroke="#234d3a"
          strokeWidth="3"
        />
        <text x="30" y="226">
          Poziom wzorca
        </text>
      </svg>
      <figcaption>
        Zielona: wybrana seria. {compare && "Przerywana: seria porównawcza."}{" "}
        {run.sensor === "camera"
          ? "Względny sygnał kamery po normalizacji czerni i bieli — nie krzywa monitora."
          : "Luminancja Y po normalizacji czerni i bieli."}
      </figcaption>
    </figure>
  );
}
export function Results({
  run,
  runs,
  onRepeat,
}: {
  run: Run;
  runs: Run[];
  onRepeat: () => void;
}) {
  const [comparison, setComparison] = useState(""),
    [ack, setAck] = useState(false),
    [notice, setNotice] = useState("");
  const result = analyze(run.measurements, run.sensor, run.settings),
    s = standards[run.settings.standard];
  const compatible = runs.filter(
    (r) =>
      r.id !== run.id &&
      r.status === "complete" &&
      r.sensor === run.sensor &&
      r.settings.monitor === run.settings.monitor &&
      r.settings.standard === run.settings.standard &&
      r.settings.sensorName === run.settings.sensorName,
  );
  const compare = compatible.find((r) => r.id === comparison);
  async function openSettings() {
    try {
      if (!window.sanenodDesktop)
        throw new Error(
          "W PWA otwórz panel koloru ręcznie zgodnie z instrukcją poniżej.",
        );
      await window.sanenodDesktop.openColorSettings();
    } catch (e) {
      setNotice(message(e));
    }
  }
  return (
    <section className="cal-panel">
      <span className="eyebrow">Krok 5 · Oceń i popraw</span>
      <h2>
        {run.status === "complete"
          ? "Seria zapisana. Co teraz?"
          : "Zapis serii"}
      </h2>
      <p>
        {run.settings.monitor || "Twój monitor"} · {s.name} ·{" "}
        {run.sensor === "camera"
          ? "Kamera — orientacyjnie"
          : `Kolorymetr: ${run.settings.sensorName}`}
      </p>
      <div className="metrics">
        <div>
          <span>Jasność bieli</span>
          <strong>
            {result.brightness !== null
              ? `${result.brightness.toFixed(1)} cd/m²`
              : "Bez pomiaru"}
          </strong>
        </div>
        <div>
          <span>Efektywna gamma (50%)</span>
          <strong>
            {result.gamma !== null ? result.gamma.toFixed(2) : "Bez pomiaru"}
          </strong>
        </div>
        <div>
          <span>Punkt bieli xy</span>
          <strong>
            {result.whiteXY
              ? result.whiteXY.map((v) => v.toFixed(4)).join(" / ")
              : "Bez pomiaru"}
          </strong>
        </div>
      </div>
      <ul className="advice">
        {result.advice.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <div className="notice">
        <strong>Zmień ustawienie → powtórz serię → porównaj.</strong>
        <p>
          Użyj menu monitora. Zmieniaj jeden parametr naraz i zapisz wartości,
          aby móc do nich wrócić. Ta aplikacja pomaga w ręcznej regulacji; nie
          zmienia automatycznie elektroniki monitora.
        </p>
      </div>
      {run.adjustments && (
        <p>
          <strong>Notatka z menu:</strong> {run.adjustments}
        </p>
      )}
      <button className="button" onClick={onRepeat}>
        Nowa seria po zmianie ustawień
      </button>
      <h3>Porównanie przed / po</h3>
      <label htmlFor="comparison">
        Poprzednia seria tego monitora i metody
      </label>
      <select
        id="comparison"
        value={comparison}
        onChange={(e) => setComparison(e.target.value)}
      >
        <option value="">Bez porównania</option>
        {compatible.map((r) => (
          <option key={r.id} value={r.id}>
            {new Date(r.created_at).toLocaleString("pl-PL")} ·{" "}
            {r.adjustments || "Bez notatki"}
          </option>
        ))}
      </select>
      {run.sensor === "camera" && (
        <p className="muted">
          Porównanie ma sens tylko przy tej samej kamerze i zablokowanych,
          niezmienionych ustawieniach, pozycji oraz oświetleniu. Wykres nie
          dowodzi poprawy dokładności koloru.
        </p>
      )}
      <Curve run={run} compare={compare} />
      <details>
        <summary>Wszystkie próbki i jednostki</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Wzorzec</th>
                <th>{run.sensor === "external" ? "X" : "R"}</th>
                <th>{run.sensor === "external" ? "Y (cd/m²)" : "G"}</th>
                <th>{run.sensor === "external" ? "Z" : "B"}</th>
                {run.sensor === "camera" && <th>Prześwietlone piksele</th>}
              </tr>
            </thead>
            <tbody>
              {run.measurements.map((m) => (
                <tr key={m.patch}>
                  <td>{patches.find((p) => p.id === m.patch)?.name}</td>
                  {m.values.map((v, i) => (
                    <td key={i}>{v.toFixed(2)}</td>
                  ))}
                  {run.sensor === "camera" && (
                    <td>{((m.clipped ?? 0) * 100).toFixed(1)}%</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <h3>Wybierz standardowy profil ICC</h3>
      <p>
        Wybrano <strong>{s.name}</strong>. Plik jest stałym profilem
        referencyjnym standardu, identycznym dla wszystkich użytkowników. Nie
        powstaje z Twoich próbek i nie zawiera korekcji monitora.
      </p>
      <p className="notice">
        Przestrzeń robocza zdjęcia i profil monitora to różne rzeczy. Dla
        monitora zwykle właściwszy jest profil producenta lub profil z
        kolorymetru. Referencję {s.name} zastosuj do ekranu tylko wtedy, gdy
        jego wybrany tryb odpowiada temu standardowi. Samo wybranie ICC nie
        rozszerzy gamutu ani nie poprawi ustawień monitora.
      </p>
      {(run.settings.white !== s.white ||
        Math.abs(run.settings.gamma - s.gamma) > 0.05) && (
        <p className="notice error">
          Własna biel/gamma różni się od profilu. Nie przypisuj tej referencji
          jako profilu monitora bez potwierdzenia zgodności trybu. ICC pozostaje
          standardowy.
        </p>
      )}
      <label className="check-label">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
        />
        Rozumiem różnicę między profilem standardu i profilem mojego monitora.
      </label>
      {ack && (
        <div className="actions">
          <a
            className="button secondary"
            href={`/api/calibrator/profile?standard=${run.settings.standard}`}
            download
          >
            Pobierz {s.name} · ICC
          </a>
        </div>
      )}
      <details>
        <summary>Jak zastosować lub cofnąć profil w Windows i macOS?</summary>
        <h4>Windows</h4>
        <p>
          Zapisz ICC. Wyszukaj „Zarządzanie kolorami / Color Management” w menu
          Start (klasyczny panel: colorcpl). Wybierz właściwy monitor w
          „Urządzenia / Devices”, zaznacz „Użyj moich ustawień dla tego
          urządzenia”, dodaj profil i wybierz „Ustaw jako profil domyślny”.
          Przed zmianą zanotuj dotychczasowy profil. W Windows 11 możesz też
          mieć wybór w Ustawienia → System → Ekran → Profil kolorów; zależy to
          od wersji systemu.
        </p>
        <h4>macOS</h4>
        <p>
          Dla własnych profili użyj folderu ~/Library/ColorSync/Profiles.
          Następnie Ustawienia systemowe → Monitory → wybierz ekran → Profil
          kolorów. ColorSync Utility pokazuje dostępne profile. Niektóre ekrany
          Apple mają zamiast tego tryby referencyjne — użyj ich zgodnie z
          dokumentacją urządzenia.
        </p>
        <p>
          Wróć do poprzedniego profilu, aby cofnąć zmianę. Zastosowanie ICC
          dotyczy zarządzania kolorem w systemie/aplikacjach; nie przestawia
          jasności ani suwaków RGB w menu monitora. Po zmianie profilu uruchom
          ponownie aplikacje i wykonaj nową serię.
        </p>
        <button className="button secondary" onClick={openSettings}>
          Otwórz systemowy panel koloru (desktop)
        </button>
        <p className="muted">
          Przycisk działa w wersji Electron. W PWA otwórz panel ręcznie.
        </p>
      </details>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
    </section>
  );
}
