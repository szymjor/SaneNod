"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { authClient } from "@sanenod/auth/client";
import { patches, summarizePixels } from "../../lib/calibrator/measurement";
import type { Run } from "../../lib/calibrator/store";
import { api, command, message } from "./api";
import {
  useGuide,
  GuideInstructions,
  GuideNavigation,
  GuideNote,
  CameraGrid,
} from "./live-guide";
import {
  guideTests,
  defaultRegion,
  summarizeGrid,
  type Region,
  type GridReading,
} from "../../lib/calibrator/guide";
export function CalibratorPhone() {
  const { data: session, isPending } = authClient.useSession();
  const [token] = useState(() =>
    typeof window !== "undefined"
      ? location.hash.slice(1) ||
        sessionStorage.getItem("sanenod-calibrator-token") ||
        ""
      : "",
  );
  const [pairId, setPairId] = useState(() =>
    typeof window !== "undefined"
      ? sessionStorage.getItem("sanenod-calibrator-pair") || ""
      : "",
  );
  const [run, setRun] = useState<Run | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [camera, setCamera] = useState(false),
    [cameraNote, setCameraNote] = useState("");
  const [locked, setLocked] = useState(false),
    [lockBusy, setLockBusy] = useState(false);
  const [connectionNotice, setConnectionNotice] = useState("");
  const [aspect, setAspect] = useState("16 / 9");
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    wake = useRef<WakeLockSentinel | null>(null);
  const {
    guide: storedGuide,
    send: sendGuide,
    busy: guideBusy,
    error: guideError,
  } = useGuide(
    pairId,
    Boolean(session) && run?.status !== "measuring" && run?.status !== "ready",
  );
  const guide =
    run?.status === "measuring" || run?.status === "ready" ? null : storedGuide;
  const guideTest = guideTests.find((t) => t.id === guide?.test);
  const [region, setRegion] = useState<Region>(defaultRegion);
  const [liveResult, setLiveResult] = useState<{
    key: string;
    reading: GridReading | null;
    at: string | null;
    error: string;
  }>({ key: "", reading: null, at: null, error: "" });
  const selection = useRef<{ x: number; y: number } | null>(null);
  const cameraFrame = useRef<HTMLDivElement>(null);
  const guideRevision = guide?.revision,
    guideTestId = guideTest?.id;
  const liveKey = JSON.stringify([
    pairId,
    guideRevision,
    region,
    locked,
    camera,
  ]);
  const liveReading = liveResult.key === liveKey ? liveResult.reading : null;
  const liveAt = liveResult.key === liveKey ? liveResult.at : null;
  const liveError = liveResult.key === liveKey ? liveResult.error : "";
  useEffect(() => {
    if (!camera || !guideTestId || !guideRevision || !pairId) return;
    let stopped = false;
    let lastFrameTime = -1;
    let timer: ReturnType<typeof setTimeout>;
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    async function update() {
      if (stopped) return;
      try {
        const v = video.current;
        if (!context || !v || v.readyState < 2 || !v.videoWidth)
          throw new Error("Poczekaj na obraz kamery.");
        const track = stream.current?.getVideoTracks()[0];
        if (
          document.visibilityState !== "visible" ||
          !track ||
          track.readyState !== "live" ||
          track.muted ||
          v.currentTime === lastFrameTime
        )
          throw new Error(
            "Brak nowej klatki. Wróć do widoku telefonu lub uruchom kamerę ponownie.",
          );
        lastFrameTime = v.currentTime;
        context.drawImage(
          v,
          v.videoWidth * region.x,
          v.videoHeight * region.y,
          v.videoWidth * region.width,
          v.videoHeight * region.height,
          0,
          0,
          100,
          100,
        );
        const reading = summarizeGrid(
          context.getImageData(0, 0, 100, 100).data,
          100,
          100,
          locked,
        );
        const result = await api("/api/calibrator/guide", {
          action: "reading",
          pairingId: pairId,
          revision: guideRevision,
          reading,
        });
        if (!stopped) {
          setLiveResult({
            key: liveKey,
            reading,
            at: result.guide.reading_at,
            error: "",
          });
        }
      } catch (e) {
        if (!stopped)
          setLiveResult({
            key: liveKey,
            reading: null,
            at: null,
            error: message(e),
          });
      }
      if (!stopped) timer = setTimeout(update, 2000);
    }
    // Settle after changing the pattern; never label an old frame as the new test.
    timer = setTimeout(update, 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [camera, guideTestId, guideRevision, pairId, region, locked, liveKey]);
  function point(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    };
  }
  function selectRegion(event: React.PointerEvent<HTMLDivElement>) {
    if (!selection.current) return;
    const end = point(event),
      start = selection.current;
    const width = Math.abs(end.x - start.x),
      height = Math.abs(end.y - start.y);
    if (width >= 0.1 && height >= 0.1)
      setRegion({
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width,
        height,
      });
  }
  const patch = run ? patches[run.current_index] : null;
  const sampled = run?.measurements.some((r) => r.patch === patch?.id) ?? false;
  useEffect(() => {
    if (location.hash) {
      sessionStorage.setItem(
        "sanenod-calibrator-token",
        location.hash.slice(1),
      );
      history.replaceState(null, "", location.pathname);
    }
    return () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      void wake.current?.release();
    };
  }, []);
  useEffect(() => {
    if (!pairId || !session) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const data = await api(`/api/calibrator?pairId=${pairId}`);
        if (!stopped) {
          setRun(data.run);
          setConnectionNotice("");
        }
      } catch (e) {
        if (!stopped) setConnectionNotice(message(e));
      }
      if (!stopped) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pairId, session]);
  async function connect() {
    setBusy(true);
    try {
      const pair = await api("/api/pair", { action: "claim", token });
      sessionStorage.removeItem("sanenod-calibrator-token");
      sessionStorage.setItem("sanenod-calibrator-pair", pair.id);
      setPairId(pair.id);
      setNotice("");
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function startCamera() {
    setBusy(true);
    try {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (video.current) {
        video.current.srcObject = stream.current;
        await video.current.play();
        if (video.current.videoWidth && video.current.videoHeight)
          setAspect(
            `${video.current.videoWidth} / ${video.current.videoHeight}`,
          );
      }
      setCamera(true);
      setLocked(false);
      setCameraNote(
        "Automatyczna ekspozycja i balans bieli mogą zmieniać próbki. Spróbuj je zablokować przed serią.",
      );
      if (navigator.wakeLock)
        try {
          wake.current = await navigator.wakeLock.request("screen");
        } catch {
          /* Camera still works without wake lock. */
        }
      setNotice("");
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setCamera(false);
      setNotice(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Zezwól na kamerę w ustawieniach przeglądarki. Pomiar wymaga HTTPS i Twojej zgody."
          : e instanceof DOMException && e.name === "NotSupportedError"
            ? "Przeglądarka nie obsługuje tej kamery. Spróbuj aktualnej pełnej przeglądarki Chrome lub Safari."
            : message(e),
      );
    } finally {
      setBusy(false);
    }
  }
  async function lockCamera() {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    setLockBusy(true);
    try {
      const caps = track.getCapabilities() as MediaTrackCapabilities & {
        exposureMode?: string[];
        whiteBalanceMode?: string[];
        focusMode?: string[];
      };
      const settings = track.getSettings() as MediaTrackSettings & {
        exposureTime?: number;
        colorTemperature?: number;
        focusDistance?: number;
      };
      const advanced: Record<string, string | number> = {};
      for (const [key, numberKey] of [
        ["exposureMode", "exposureTime"],
        ["whiteBalanceMode", "colorTemperature"],
        ["focusMode", "focusDistance"],
      ] as const) {
        if (
          caps[key]?.includes("manual") &&
          typeof settings[numberKey] === "number"
        ) {
          advanced[key] = "manual";
          advanced[numberKey] = settings[numberKey]!;
        }
      }
      if (!Object.keys(advanced).length) {
        setCameraNote(
          "Ta przeglądarka nie udostępnia blokady aktualnej ekspozycji/balansu bieli. Serie mogą być nieporównywalne; użyj kolorymetru do wiarygodnego pomiaru.",
        );
        return;
      }
      await track.applyConstraints({ advanced: [advanced] });
      const actual = track.getSettings() as MediaTrackSettings & {
        exposureMode?: string;
        whiteBalanceMode?: string;
      };
      const both =
        actual.exposureMode === "manual" &&
        actual.whiteBalanceMode === "manual";
      setLocked(both);
      setCameraNote(
        both
          ? "Przeglądarka zgłasza ręczną ekspozycję i balans bieli. Nie zmieniaj pozycji ani oświetlenia. To nadal nie jest kolorymetr."
          : "Zablokowano dostępne ustawienia, ale nie potwierdzono obu blokad. Traktuj porównania jako orientacyjne.",
      );
    } catch {
      setCameraNote(
        "Telefon nie pozwolił zablokować ustawień. Wyniki pozostają orientacyjne.",
      );
    } finally {
      setLockBusy(false);
    }
  }
  async function capture() {
    if (!run || !video.current || !stream.current) return;
    const current = run;
    setBusy(true);
    try {
      const v = video.current;
      if (v.readyState < 2 || !v.videoWidth)
        throw new Error("Poczekaj na obraz kamery.");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Brak dostępu do klatki.");
      const samples: ReturnType<typeof summarizePixels>[] = [];
      for (let i = 0; i < 3; i++) {
        context.drawImage(
          v,
          v.videoWidth * 0.4,
          v.videoHeight * 0.4,
          v.videoWidth * 0.2,
          v.videoHeight * 0.2,
          0,
          0,
          64,
          64,
        );
        samples.push(summarizePixels(context.getImageData(0, 0, 64, 64).data));
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      const values = [0, 1, 2].map(
        (i) => samples.reduce((n, s) => n + s.values[i], 0) / samples.length,
      );
      const track = stream.current.getVideoTracks()[0];
      setRun(
        await command({
          action: "sample",
          id: current.id,
          nonce: current.sample_nonce,
          reading: {
            patch: patches[current.current_index].id,
            values,
            clipped:
              samples.reduce((n, s) => n + s.clipped, 0) / samples.length,
            spread: Math.max(...samples.map((s) => s.spread)),
            camera: JSON.stringify({
              locked,
              settings: track.getSettings(),
            }).slice(0, 300),
          },
        }),
      );
      setNotice("Próbka wysłana. Czekaj na kolejny wzorzec na komputerze.");
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    try {
      await api("/api/pair", { action: "revoke", id: pairId });
      sessionStorage.removeItem("sanenod-calibrator-pair");
      setPairId("");
      setRun(null);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setCamera(false);
      await wake.current?.release();
      setNotice("Połączenie zakończone. Zeskanuj nowy QR z komputera.");
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (isPending) return <p role="status">Sprawdzanie konta…</p>;
  if (!session)
    return (
      <section className="cal-panel">
        <h2>Zaloguj telefon na to samo konto.</h2>
        <p>Po logowaniu wrócisz do połączenia z komputerem.</p>
        <Link className="button" href="/auth?next=/apps/calibrator/phone">
          Zaloguj telefon
        </Link>
      </section>
    );
  return (
    <section className="cal-panel phone-panel">
      <span className="eyebrow">Telefon · Czujnik orientacyjny</span>
      <h1>{guideTest ? "Ustaw monitor." : "Zmierz ekran."}</h1>
      {!pairId ? (
        <>
          <p>
            Zeskanuj nowy QR z Kalibratora na komputerze. Telefon i komputer
            muszą być zalogowane na to samo konto.
          </p>
          <button
            className="button"
            onClick={connect}
            disabled={!token || busy}
          >
            Połącz z komputerem
          </button>
        </>
      ) : (
        <>
          <p className="notice">
            Telefon połączony.{" "}
            {guideTest
              ? `Test ${guideTests.indexOf(guideTest) + 1}/6: ${guideTest.short}.`
              : run?.status === "complete"
                ? "Seria zakończona — wynik jest na komputerze."
                : !run || run.status === "ready"
                  ? "Czekaj, aż komputer uruchomi serię."
                  : run.status === "cancelled"
                    ? "Seria została przerwana."
                    : `Wzorzec ${run.current_index + 1}/${patches.length}: ${patch?.name}.`}
          </p>
          {guideTest && guide && (
            <div className="phone-guide">
              <h2>{guideTest.name}</h2>
              <GuideInstructions test={guideTest} compact />
              <GuideNavigation
                guide={guide}
                send={sendGuide}
                busy={guideBusy}
              />
            </div>
          )}
          <p>
            {guideTest ? (
              "Zaznacz ekran w podglądzie palcem: od narożnika do narożnika, bez ramki i menu. Ustaw telefon prostopadle."
            ) : (
              <>
                Wypełnij zaznaczony kwadrat wzorcem z monitora. Trzymaj telefon
                nieruchomo, bez odblasków.
              </>
            )}
          </p>
          <div
            ref={cameraFrame}
            className={`camera-frame ${guideTest ? "camera-select" : ""}`}
            style={{ aspectRatio: aspect }}
            onPointerDown={(e) => {
              if (!guideTest || !camera) return;
              selection.current = point(e);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (guideTest) selectRegion(e);
            }}
            onPointerUp={(e) => {
              if (!guideTest) return;
              selectRegion(e);
              selection.current = null;
            }}
            onPointerCancel={() => {
              selection.current = null;
            }}
          >
            <video
              ref={video}
              muted
              playsInline
              autoPlay
              aria-label="Podgląd kamery"
            />
            <div
              className="camera-crop"
              style={
                guideTest
                  ? {
                      left: `${region.x * 100}%`,
                      top: `${region.y * 100}%`,
                      width: `${region.width * 100}%`,
                      height: `${region.height * 100}%`,
                      pointerEvents: "none",
                    }
                  : undefined
              }
              aria-hidden="true"
            />
            {!camera && <span>Podgląd po włączeniu kamery</span>}
          </div>
          {guideTest && (
            <details>
              <summary>Dopasuj obszar bez przeciągania</summary>
              {(
                [
                  ["x", "Lewy brzeg"],
                  ["y", "Górny brzeg"],
                  ["width", "Szerokość"],
                  ["height", "Wysokość"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label htmlFor={`region-${key}`}>
                    {label}: {Math.round(region[key] * 100)}%
                  </label>
                  <input
                    id={`region-${key}`}
                    type="range"
                    step="0.01"
                    min={key === "x" || key === "y" ? 0 : 0.1}
                    max={
                      key === "x"
                        ? 1 - region.width
                        : key === "y"
                          ? 1 - region.height
                          : key === "width"
                            ? 1 - region.x
                            : 1 - region.y
                    }
                    value={region[key]}
                    onChange={(e) =>
                      setRegion({ ...region, [key]: Number(e.target.value) })
                    }
                  />
                </div>
              ))}
            </details>
          )}
          {guideTest && (
            <button
              className="text-button"
              onClick={() => setRegion(defaultRegion)}
            >
              Przywróć domyślny obszar
            </button>
          )}
          {guideTest && camera && (
            <details>
              <summary>Mapa 5×5 i jakość odczytu</summary>
              <CameraGrid reading={liveReading} readingAt={liveAt} />
            </details>
          )}
          {guideTest && guide && (
            <GuideNote
              key={guideTest.id}
              guide={guide}
              send={sendGuide}
              busy={guideBusy}
            />
          )}
          {liveError && guideTest && (
            <p className="notice error" role="status">
              {liveError}
            </p>
          )}
          {guideError && (
            <p className="notice error" role="status">
              {guideError}
            </p>
          )}
          {run?.status === "measuring" && (
            <button
              className="button measure-button"
              onClick={capture}
              disabled={!camera || busy || sampled}
            >
              {busy
                ? "Stabilizacja i pomiar…"
                : sampled
                  ? "Próbka odebrana — czekaj na komputer"
                  : `Zmierz: ${patch?.name}`}
            </button>
          )}
          <div className="actions">
            <button
              className="button secondary"
              onClick={startCamera}
              disabled={busy}
            >
              {camera ? "Uruchom kamerę ponownie" : "Włącz kamerę"}
            </button>
            {camera && (
              <button
                className="button secondary"
                onClick={lockCamera}
                disabled={busy || lockBusy}
              >
                Zablokuj dostępne automatyki
              </button>
            )}
          </div>
          {cameraNote && <p className="muted">{cameraNote}</p>}
          <p className="muted">
            Kamera nie mierzy cd/m² ani punktu bieli. Automatyka i
            charakterystyka sensora mogą zmieniać wynik. Zdjęcia nie są wysyłane
            — tylko liczby RGB i ustawienia kamery.
          </p>
          <button className="text-button" onClick={disconnect} disabled={busy}>
            Zakończ połączenie
          </button>
        </>
      )}
      {connectionNotice && (
        <p className="notice error" role="status">
          {connectionNotice}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
