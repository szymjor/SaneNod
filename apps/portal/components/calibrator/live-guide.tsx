"use client";
import { useEffect, useRef, useState } from "react";
import {
  guideTests,
  guideCSV,
  type GuideState,
  type GridReading,
} from "../../lib/calibrator/guide";
import { api, message } from "./api";
export function useGuide(pairingId: string, enabled = true) {
  const [guide, setGuide] = useState<GuideState | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  useEffect(() => {
    if (!pairingId || !enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const version = epoch.current;
      try {
        const data = await api(`/api/calibrator/guide?pairingId=${pairingId}`);
        if (!stopped && version === epoch.current) {
          setGuide(data.guide);
          setError("");
        }
      } catch (e) {
        if (!stopped && version === epoch.current) {
          setGuide(null);
          setError(message(e));
        }
      }
      if (!stopped) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pairingId, enabled]);
  async function send(body: object) {
    epoch.current++;
    setBusy(true);
    try {
      const data = await api("/api/calibrator/guide", {
        pairingId,
        revision: guide?.revision,
        ...body,
      });
      epoch.current++;
      setGuide(data.guide);
      setError("");
      return data.guide as GuideState;
    } catch (e) {
      epoch.current++;
      setError(message(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { guide, send, error, busy };
}
export function CameraGrid({
  reading,
  readingAt,
}: {
  reading: GridReading | null;
  readingAt?: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1500);
    return () => clearInterval(timer);
  }, []);
  if (!reading)
    return (
      <p className="muted" role="status">
        Czekamy na odczyt z kamery telefonu…
      </p>
    );
  const stale = readingAt && now - new Date(readingAt).getTime() > 7000;
  const center = reading.cells[12];
  return (
    <div className="live-reading">
      <p className={`notice ${stale ? "error" : ""}`} role="status">
        {stale
          ? "Odczyt jest nieaktualny. Sprawdź telefon i połączenie."
          : "Odczyt z telefonu"}{" "}
        · RGB {reading.values.map((v) => Math.round(v)).join(" / ")} · piksele
        bliskie maksimum kamery: {(reading.clipped * 100).toFixed(1)}%
      </p>
      <div
        className="camera-grid"
        role="img"
        aria-label="Mapa kodów RGB kamery, siatka 5 na 5"
      >
        {reading.cells.map((v, i) => (
          <div
            key={i}
            style={{
              background: `rgb(${Math.round(v)},${Math.round(v)},${Math.round(v)})`,
              color: v > 140 ? "#111" : "#fff",
            }}
          >
            <strong>{Math.round(v)}</strong>
            <small>
              {i === 12
                ? "środek"
                : `${v - center >= 0 ? "+" : ""}${(v - center).toFixed(0)}`}
            </small>
          </div>
        ))}
      </div>
      <p className="muted">
        Wartości 0–255 to średnia kanałów RGB zapisana przez kamerę. Mała liczba
        to różnica względem środka w tych samych kodach, nie procent luminancji
        monitora.
      </p>
      {!reading.locked && (
        <p className="muted">
          Nie potwierdzono blokady ekspozycji i balansu bieli — odczyty mogą
          zmieniać się automatycznie.
        </p>
      )}
      {reading.clipped > 0.02 && (
        <p className="notice">
          Część obrazu kamery osiąga maksimum. Zmniejsz ekspozycję, jeśli
          telefon to umożliwia. Nie jest to dowód obcięcia bieli przez monitor.
        </p>
      )}
    </div>
  );
}
export function GuideInstructions({
  test,
  compact = false,
}: {
  test: (typeof guideTests)[number];
  compact?: boolean;
}) {
  return (
    <>
      <p>{compact ? test.task : test.instruction}</p>
      <details>
        <summary>
          {compact ? "Co sprawdzić i co ustawić?" : "Jakich ustawień szukać?"}
        </summary>
        {compact && <p>{test.instruction}</p>}
        <p className="control-names">{test.controls}</p>
        <p>{test.help}</p>
        {compact && <p className="muted">{test.camera}</p>}
      </details>
    </>
  );
}
export function GuideNavigation({
  guide,
  send,
  busy,
}: {
  guide: GuideState;
  send: (body: object) => Promise<GuideState | null>;
  busy: boolean;
}) {
  const index = guideTests.findIndex((t) => t.id === guide.test);
  return (
    <div className="actions">
      <button
        className="button secondary"
        disabled={busy || index <= 0}
        onClick={() =>
          send({ action: "select", test: guideTests[index - 1].id })
        }
      >
        ← Poprzedni test
      </button>
      <button
        className="button"
        disabled={busy || index >= guideTests.length - 1}
        onClick={() =>
          send({ action: "select", test: guideTests[index + 1].id })
        }
      >
        Następny test →
      </button>
      {index === guideTests.length - 1 && (
        <p className="muted guide-last">
          To ostatni test. Na PC wyjdź z pełnego ekranu klawiszem Esc i wybierz
          „Zakończ testy ustawień”. Potem możesz zapisać serię pomiarową.
        </p>
      )}
    </div>
  );
}
export function GuideNote({
  guide,
  send,
  busy,
}: {
  guide: GuideState;
  send: (body: object) => Promise<GuideState | null>;
  busy: boolean;
}) {
  const [note, setNote] = useState(
      guide.test ? (guide.observations[guide.test] ?? "") : "",
    ),
    [saved, setSaved] = useState(false);
  return (
    <details>
      <summary>Zapisz obserwację i ustawienia monitora</summary>
      <label htmlFor="guide-note">Co widzisz i co zmieniasz?</label>
      <textarea
        id="guide-note"
        value={note}
        maxLength={1000}
        placeholder="np. widzę jasne pola; Contrast 70, Backlight 30"
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
      />
      <button
        className="button secondary"
        disabled={busy}
        onClick={async () => {
          if (await send({ action: "note", note })) setSaved(true);
        }}
      >
        Zapisz obserwację
      </button>
      {saved && <p role="status">Obserwacja zapisana.</p>}
    </details>
  );
}
export function LiveGuide({
  pairingId,
  onActive,
}: {
  pairingId: string;
  onActive: (active: boolean) => void;
}) {
  const { guide, send, error, busy } = useGuide(pairingId);
  const screen = useRef<HTMLDivElement>(null);
  const [fullscreenError, setFullscreenError] = useState("");
  const test = guideTests.find((t) => t.id === guide?.test);
  useEffect(() => {
    onActive(Boolean(guide?.test));
  }, [guide?.test, onActive]);
  async function fullscreen() {
    try {
      await screen.current?.requestFullscreen();
    } catch {
      setFullscreenError(
        "Pełny ekran niedostępny. Powiększ okno przeglądarki i omiń interfejs przy zaznaczaniu ekranu telefonem.",
      );
    }
  }
  function download() {
    if (!guide) return;
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", guideCSV(guide)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "sanenod-testy-monitora.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="live-guide">
      <span className="eyebrow">Telefon + PC · Testy ustawień</span>
      <h3>Najpierw ustaw monitor, potem zapisz serię.</h3>
      <p>
        PC wyświetla wzorzec. Sparowany telefon pokazuje instrukcję, przesyła
        odczyty kamery i działa jako pilot. Aktualizacja zwykle co 1–2 sekundy;
        wymagane połączenie z internetem.
      </p>
      {!test ? (
        <button
          className="button secondary"
          disabled={busy || Boolean(error)}
          onClick={() => send({ action: "start" })}
        >
          Uruchom testy z telefonem
        </button>
      ) : (
        guide && (
          <>
            <ol className="guide-steps" aria-label="Testy ustawień monitora">
              {guideTests.map((t, i) => (
                <li key={t.id}>
                  <button
                    className={t.id === test.id ? "selected" : ""}
                    aria-current={t.id === test.id ? "step" : undefined}
                    disabled={busy}
                    onClick={() => send({ action: "select", test: t.id })}
                  >
                    {i + 1}. {t.short}
                  </button>
                </li>
              ))}
            </ol>
            <h3>{test.name}</h3>
            <GuideInstructions test={test} />
            <div
              className="guide-screen"
              ref={screen}
              role="img"
              aria-label={`Test monitora: ${test.name}`}
              style={{
                background:
                  test.id === "gradient"
                    ? "linear-gradient(to right,#000,#fff)"
                    : test.id === "highlights"
                      ? "#fff"
                      : `rgb(${test.levels[0]},${test.levels[0]},${test.levels[0]})`,
              }}
            >
              {test.id === "gradient" && (
                <svg
                  className="guide-gradient"
                  viewBox="0 0 256 1"
                  preserveAspectRatio="none"
                  shapeRendering="crispEdges"
                  aria-hidden="true"
                >
                  {Array.from({ length: 256 }, (_, v) => (
                    <rect
                      key={v}
                      x={v}
                      y={0}
                      width={1}
                      height={1}
                      fill={`rgb(${v},${v},${v})`}
                    />
                  ))}
                </svg>
              )}
              {test.levels.length > 1 && (
                <div className="guide-bars">
                  {test.levels.map((v) => (
                    <div
                      key={v}
                      style={{ background: `rgb(${v},${v},${v})` }}
                    />
                  ))}
                </div>
              )}
              <button
                className="guide-exit"
                onClick={() => document.exitFullscreen?.()}
              >
                Zamknij pełny ekran · Esc
              </button>
            </div>
            {test.levels.length > 1 && (
              <p className="muted">
                Kody sRGB od lewej: {test.levels.join(" · ")}. Oceniaj ekran na
                pełnym ekranie. Aktywny profil systemowy i przeglądarka mogą
                przekształcać wzorzec.
              </p>
            )}
            <button className="button secondary" onClick={fullscreen}>
              Test na pełnym ekranie
            </button>
            <p className="muted">
              Na pełnym ekranie przełączaj testy telefonem. Przycisk zamknięcia
              znika po chwili; najedź na lewy dolny róg lub naciśnij Esc.
            </p>
            <GuideNavigation guide={guide} send={send} busy={busy} />
            {(test.id === "uniform" ||
              test.id === "black" ||
              test.id === "white") && (
              <CameraGrid
                reading={guide.reading}
                readingAt={guide.reading_at}
              />
            )}
            <GuideNote key={test.id} guide={guide} send={send} busy={busy} />
            <div className="actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={download}
              >
                Pobierz obserwacje CSV
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={async () => {
                  if (await send({ action: "stop" })) {
                    await document.exitFullscreen?.().catch(() => {});
                  }
                }}
              >
                Zakończ testy ustawień
              </button>
            </div>
          </>
        )
      )}
      {fullscreenError && (
        <p className="notice" role="status">
          {fullscreenError}
        </p>
      )}
      {error && (
        <p className="notice error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
