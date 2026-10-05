"use client";
import { useRef, useState } from "react";
import { standards, type Settings } from "../../lib/calibrator/standards";
import {
  patches,
  parseCSV,
  type Sensor,
} from "../../lib/calibrator/measurement";
import type { Run } from "../../lib/calibrator/store";
import { api, command, message } from "./api";
import QRCode from "qrcode";
import Image from "next/image";
export type Pair = {
  id: string;
  active?: boolean;
  paired_at?: string;
  expires_at?: string;
};
export function Measurement({
  settings,
  setSettings,
  sensor,
  pair,
  setPair,
  run,
  setRun,
  onBack,
  onResult,
  setNotice,
  busy,
  perform,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
  sensor: Sensor;
  pair: Pair | null;
  setPair: (p: Pair) => void;
  run: Run | null;
  setRun: (r: Run) => void;
  onBack: () => void;
  onResult: () => void;
  setNotice: (s: string) => void;
  busy: boolean;
  perform: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [qr, setQR] = useState(""),
    [xyz, setXYZ] = useState([0, 0, 0]),
    [notes, setNotes] = useState(""),
    [csv, setCSV] = useState("");
  const screen = useRef<HTMLDivElement>(null);
  const p = patches[run?.current_index ?? 0],
    received = run?.measurements.some((m) => m.patch === p.id),
    s = standards[settings.standard];
  const space =
    settings.standard === "adobe-rgb"
      ? "a98-rgb"
      : settings.standard === "display-p3" || settings.standard === "dci-p3"
        ? "display-p3"
        : settings.standard === "rec2020"
          ? "rec2020"
          : "srgb";
  const requestedColor = `color(${space} ${p.rgb.join(" ")})`;
  const supported =
    typeof CSS === "undefined" || CSS.supports("color", requestedColor);
  const color = supported
    ? requestedColor
    : `rgb(${p.rgb.map((v) => Math.round(v * 255)).join(",")})`;
  async function createPair() {
    await perform(async () => {
      const created = await api("/api/pair", { action: "create" });
      setPair({ ...created, active: true });
      setQR(
        await QRCode.toDataURL(
          `${location.origin}/apps/calibrator/phone#${created.token}`,
          { width: 280, margin: 2 },
        ),
      );
    });
  }
  async function begin() {
    await perform(async () => {
      const created =
        run?.status === "ready"
          ? run
          : await command({
              action: "create",
              settings,
              sensor,
              pairingId: pair?.id,
            });
      setRun(created);
      setRun(await command({ action: "start", id: created.id }));
    });
  }
  async function next() {
    await perform(async () => {
      const updated = await command({
        action: "next",
        id: run!.id,
        nonce: run!.sample_nonce,
      });
      setRun(updated);
      if (updated.status === "complete") {
        await document.exitFullscreen?.().catch(() => {});
        onResult();
      }
    });
  }
  async function sample() {
    await perform(async () => {
      setRun(
        await command({
          action: "sample",
          id: run!.id,
          nonce: run!.sample_nonce,
          reading: { patch: p.id, values: xyz },
        }),
      );
    });
  }
  async function importCSV() {
    await perform(async () => {
      const readings = parseCSV(csv);
      const current =
        run ??
        (await command({ action: "create", settings, sensor: "external" }));
      setRun(current);
      setRun(await command({ action: "import", id: current.id, readings }));
      onResult();
    });
  }
  async function fullscreen() {
    try {
      await screen.current?.requestFullscreen();
    } catch {
      setNotice(
        "Pełny ekran jest niedostępny. Powiększ okno i wycentruj czujnik na wzorcu.",
      );
    }
  }
  return (
    <section className="cal-panel">
      <span className="eyebrow">
        Krok 4 ·{" "}
        {sensor === "camera" ? "Telefon i ekran" : "Pomiar kolorymetrem"}
      </span>
      <h2>
        {run?.status === "measuring"
          ? `${p.name} · ${run.current_index + 1}/${patches.length}`
          : "Sprawdź ustawienia monitora."}
      </h2>
      {sensor === "camera" && !run && (
        <>
          <p>
            Zaloguj telefon na to samo konto i zeskanuj QR aparatem. Otwórz
            link, potwierdź połączenie i włącz kamerę. Sesja trwa 30 minut.
          </p>
          {!pair || !pair.active ? (
            <button
              className="button secondary"
              onClick={createPair}
              disabled={busy}
            >
              Utwórz kod QR
            </button>
          ) : !pair.paired_at ? (
            <>
              {qr && (
                <Image
                  className="qr"
                  unoptimized
                  src={qr}
                  width={280}
                  height={280}
                  alt="Kod QR do Kalibratora na telefonie"
                />
              )}
              <p className="notice" role="status">
                Oczekiwanie na telefon…
              </p>
            </>
          ) : (
            <p className="notice" role="status">
              Telefon połączony. Możesz uruchomić serię.
            </p>
          )}
        </>
      )}
      {sensor === "external" && !run && (
        <>
          <label htmlFor="sensor-name">
            Kolorymetr i korekcja dla typu ekranu
          </label>
          <input
            id="sensor-name"
            maxLength={120}
            placeholder="np. i1Display Pro, korekcja WLED"
            value={settings.sensorName}
            onChange={(e) =>
              setSettings({ ...settings, sensorName: e.target.value })
            }
          />
          <p className="muted">
            Użyj programu producenta lub ArgyllCMS do odczytu XYZ. Wymagamy
            jednostek absolutnych: Y w cd/m²; X i Z w tej samej skali. Sam plik
            nie potwierdza wzorcowania czujnika. Nie odczytujemy USB
            automatycznie.
          </p>
        </>
      )}
      {(!run || run.status === "ready") && (
        <div className="actions">
          <button className="button secondary" onClick={onBack} disabled={busy}>
            Wstecz
          </button>
          <button
            className="button"
            onClick={begin}
            disabled={
              busy ||
              (sensor === "camera" && (!pair?.active || !pair.paired_at)) ||
              (sensor === "external" && settings.sensorName.trim().length < 3)
            }
          >
            Rozpocznij serię {patches.length} wzorców
          </button>
        </div>
      )}
      {run?.status === "measuring" && (
        <>
          <p>
            Wzorzec jest interpretowany jako {space}. Przeglądarka i bieżący
            profil systemowy mogą go przekształcać — mierzymy aktualny obraz na
            ekranie, nie surowe wyjście karty graficznej. DCI-P3 pokazujemy w
            kodowaniu Display P3; nie jest to tor projekcyjny kina.
          </p>
          {!supported && (
            <p className="notice error">
              Przeglądarka nie obsługuje przestrzeni {space}. Pokazujemy sRGB —
              nie używaj tej serii do oceny wybranego szerokiego gamutu.
            </p>
          )}
          <progress
            value={run.measurements.length}
            max={patches.length}
            aria-label="Postęp pomiaru"
          />
          <div
            ref={screen}
            className="patch-screen"
            style={{ background: color }}
          >
            <div
              className="patch-center"
              style={{
                background: `rgb(${p.rgb.map((v) => Math.round(v * 255)).join(",")})`,
                backgroundColor: color,
              }}
              aria-label={`Wzorzec: ${p.name}`}
            />
            <div className="patch-controls">
              <span>
                {p.name} · {run.current_index + 1}/{patches.length}
              </span>
              <button
                className="button secondary"
                onClick={next}
                disabled={busy || !received}
              >
                {p.id === "blue" ? "Zakończ serię" : "Następny wzorzec"} →
              </button>
              <button
                className="text-button"
                onClick={() => document.exitFullscreen?.()}
              >
                Wyjdź z pełnego ekranu (Esc)
              </button>
            </div>
          </div>
          <div className="actions">
            <button className="button secondary" onClick={fullscreen}>
              Pokaż wzorzec na pełnym ekranie
            </button>
            {received && (
              <span className="badge" role="status">
                Próbka odebrana
              </span>
            )}
          </div>
          {sensor === "camera" ? (
            <p className="notice" role="status">
              {received
                ? "Próbka zapisana. Przejdź do następnego wzorca."
                : "Na telefonie naciśnij „Zmierz”. Zmieniaj wzorzec dopiero po odebraniu próbki."}
            </p>
          ) : (
            <>
              <p>
                Zmierz wyświetlany wzorzec kolorymetrem i wpisz odczyt. Poczekaj
                na stabilizację monitora/czujnika przed pomiarem.
              </p>
              <div className="form-grid">
                {["X", "Y (cd/m²)", "Z"].map((label, i) => (
                  <div key={label}>
                    <label htmlFor={`xyz-${i}`}>{label}</label>
                    <input
                      id={`xyz-${i}`}
                      type="number"
                      min={0}
                      max={10000}
                      step="any"
                      value={xyz[i]}
                      onChange={(e) =>
                        setXYZ(
                          xyz.map((v, j) =>
                            i === j ? Number(e.target.value) : v,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
              <button
                className="button"
                onClick={sample}
                disabled={busy || received}
              >
                Zapisz odczyt kolorymetru
              </button>
            </>
          )}
          <div className="actions">
            <button
              className="button"
              onClick={next}
              disabled={busy || !received}
            >
              {p.id === "blue" ? "Zakończ serię" : "Następny wzorzec"} →
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  setRun(await command({ action: "cancel", id: run.id }));
                  await document.exitFullscreen?.().catch(() => {});
                })
              }
            >
              Przerwij serię
            </button>
          </div>
          <details>
            <summary>Zapisz zmiany w menu monitora</summary>
            <label htmlFor="adjustments">
              Jasność, kontrast, RGB, gamma — Twoje wartości
            </label>
            <textarea
              id="adjustments"
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="np. Brightness 35, Contrast 75, R 98 / G 100 / B 96"
            />
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  setRun(await command({ action: "notes", id: run.id, notes }));
                  setNotice("Notatka zapisana.");
                })
              }
            >
              Zapisz notatkę
            </button>
          </details>
        </>
      )}
      {run?.status === "cancelled" && (
        <p className="notice">
          Seria przerwana. Rozpocznij nową z historii lub ponownie otwórz
          Kalibrator.
        </p>
      )}
      {sensor === "external" &&
        (!run || ["ready", "measuring"].includes(run.status)) && (
          <details>
            <summary>Wczytaj całą serię z CSV</summary>
            <p>
              Dokładnie te same wzorce i warunki. Nagłówek: patch,X,Y,Z.
              Kolejność: {patches.map((p) => p.id).join(", ")}. Kropka
              dziesiętna; jednostki jak wyżej.
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="Plik CSV z pomiarami"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 20000) {
                  setNotice("CSV może mieć maks. 20 kB.");
                  return;
                }
                try {
                  setCSV(await file.text());
                } catch (error) {
                  setNotice(message(error));
                }
              }}
            />
            <label htmlFor="csv">Lub wklej CSV</label>
            <textarea
              id="csv"
              value={csv}
              maxLength={20000}
              onChange={(e) => setCSV(e.target.value)}
              placeholder="patch,X,Y,Z"
            />
            <button
              className="button secondary"
              disabled={busy || !csv || settings.sensorName.trim().length < 3}
              onClick={importCSV}
            >
              Sprawdź i zapisz CSV
            </button>
          </details>
        )}
      <p className="muted">
        Cel: {s.name} · {settings.white} · {settings.brightness} cd/m² · gamma{" "}
        {settings.gamma.toFixed(2)}.
      </p>
    </section>
  );
}
