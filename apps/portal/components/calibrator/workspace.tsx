"use client";
import { useEffect, useState } from "react";
import {
  defaults,
  standards,
  type Settings,
} from "../../lib/calibrator/standards";
import type { Sensor } from "../../lib/calibrator/measurement";
import type { Run } from "../../lib/calibrator/store";
import { api, message } from "./api";
import { Onboarding } from "./onboarding";
import { Prepare } from "./prepare";
import { Measurement, type Pair } from "./measurement";
import { Results } from "./results";
import { Sources } from "./sources";
const steps = ["Cel", "Warunki", "Monitor", "Pomiar", "Wynik"];
export function CalibratorWorkspace() {
  const [step, setStep] = useState(0),
    [settings, setSettings] = useState<Settings>(defaults),
    [sensor, setSensor] = useState<Sensor>("camera"),
    [pair, setPair] = useState<Pair | null>(null),
    [run, setRun] = useState<Run | null>(null),
    [runs, setRuns] = useState<Run[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const pairId = pair?.id,
    runId = run?.id,
    runStatus = run?.status;
  useEffect(() => {
    let stopped = false;
    api("/api/calibrator")
      .then((data) => {
        if (!stopped) setRuns(data.runs);
      })
      .catch((e) => {
        if (!stopped) setNotice(message(e));
      });
    return () => {
      stopped = true;
    };
  }, [runStatus]);
  useEffect(() => {
    if (!pairId && !runId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        if (pairId) {
          const current = await api(`/api/pair?id=${pairId}`);
          if (!stopped) setPair(current);
        }
        if (runId && runStatus === "measuring") {
          const current = await api(`/api/calibrator?id=${runId}`);
          if (!stopped) setRun(current.run);
        }
      } catch (e) {
        if (!stopped) setNotice(message(e));
      }
      if (!stopped) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pairId, runId, runStatus]);
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  function repeat() {
    setRun(null);
    setStep(2);
    setNotice("");
  }
  return (
    <div className="calibrator">
      <div className="cal-heading">
        <div>
          <span className="eyebrow">SaneNod · Kalibrator Monitora</span>
          <h1>
            Dobry obraz.
            <br />
            <span>Po Twojemu.</span>
          </h1>
          <p>Wybierz cel. Ustaw monitor. Sprawdź efekt.</p>
        </div>
        <span className="badge">Ręczna regulacja · SDR</span>
      </div>
      <ol className="stepper" aria-label="Etapy kalibracji">
        {steps.map((name, i) => (
          <li
            key={name}
            aria-current={step === i ? "step" : undefined}
            className={step === i ? "current" : step > i ? "done" : ""}
          >
            <span>{step > i ? "✓" : i + 1}</span>
            {name}
          </li>
        ))}
      </ol>
      <div className="cal-layout">
        <div>
          {step <= 1 && (
            <Onboarding
              settings={settings}
              setSettings={setSettings}
              stage={step}
              onNext={() => setStep(step + 1)}
              onBack={() => setStep(step - 1)}
            />
          )}
          {step === 2 && (
            <Prepare
              sensor={sensor}
              setSensor={setSensor}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <Measurement
              key={run?.id ?? "new"}
              settings={settings}
              setSettings={setSettings}
              sensor={sensor}
              pair={pair}
              setPair={setPair}
              run={run}
              setRun={setRun}
              onBack={() => setStep(2)}
              onResult={() => setStep(4)}
              setNotice={setNotice}
              busy={busy}
              perform={perform}
            />
          )}
          {step === 4 && run && (
            <Results key={run.id} run={run} runs={runs} onRepeat={repeat} />
          )}
          {notice && (
            <p role="status" className="notice error">
              {notice}
            </p>
          )}
        </div>
        <aside className="cal-sidebar">
          <div className="panel">
            <span className="eyebrow">Twój cel</span>
            <h3>{standards[settings.standard].name}</h3>
            <p>
              {settings.white} · {settings.brightness} cd/m²
              <br />
              gamma {settings.gamma.toFixed(2)}
              <br />
              {sensor === "camera"
                ? "Kamera: orientacyjnie"
                : "Kolorymetr: wyniki XYZ"}
            </p>
            <p className="muted">
              Kalibrator pomaga ustawić menu monitora. ICC wybierasz z gotowych
              standardów.
            </p>
          </div>
          <div className="panel">
            <h3>Historia pomiarów</h3>
            <p className="muted">
              Ostatnie 50 serii na Twoim koncie. Zapis jest automatyczny.
            </p>
            {runs.length === 0 ? (
              <p>Tu pojawi się pierwsza seria.</p>
            ) : (
              <div className="history-list">
                {runs.map((r) => (
                  <button
                    key={r.id}
                    className="history-item"
                    disabled={
                      busy ||
                      run?.status === "measuring" ||
                      run?.status === "ready" ||
                      (r.status !== "complete" &&
                        (!r.can_control || r.status === "cancelled"))
                    }
                    onClick={() =>
                      perform(async () => {
                        const { run: fresh } = await api(
                          `/api/calibrator?id=${r.id}`,
                        );
                        const currentPair =
                          fresh.pairing_id && fresh.status !== "complete"
                            ? await api(`/api/pair?id=${fresh.pairing_id}`)
                            : null;
                        setSettings(fresh.settings);
                        setSensor(fresh.sensor);
                        setRun(fresh);
                        if (currentPair) setPair(currentPair);
                        setStep(fresh.status === "complete" ? 4 : 3);
                      })
                    }
                  >
                    <strong>
                      {r.settings.monitor ||
                        standards[r.settings.standard].name}
                    </strong>
                    <span>
                      {new Date(r.created_at).toLocaleString("pl-PL")}
                    </span>
                    <span>
                      {r.sensor === "camera" ? "Kamera" : "Kolorymetr"} ·{" "}
                      {r.status === "complete"
                        ? "Zakończona"
                        : r.status === "cancelled"
                          ? "Przerwana"
                          : "W trakcie"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {run?.status === "cancelled" && (
              <button className="button secondary" onClick={repeat}>
                Nowa seria
              </button>
            )}
          </div>
        </aside>
      </div>
      <Sources />
    </div>
  );
}
