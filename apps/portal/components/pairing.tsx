"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import { Button } from "@sanenod/ui";
import { pairingUrl } from "@sanenod/auth";
type Connection = {
  id: string;
  active?: boolean;
  paired_at?: string;
  expires_at?: string;
  token_expires_at?: string;
};
async function call(body: object) {
  const response = await fetch("/api/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
export function Pairing({ claim = false }: { claim?: boolean }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [qr, setQr] = useState("");
  const [token, setToken] = useState(() =>
    claim && typeof window !== "undefined"
      ? location.hash.slice(1) ||
        sessionStorage.getItem("sanenod-pair-token") ||
        ""
      : "",
  );
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [pong, setPong] = useState(false);
  useEffect(() => {
    if (!connection) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let cursor = 0;
    async function poll() {
      try {
        const statusResponse = await fetch(`/api/pair?id=${connection!.id}`, {
          cache: "no-store",
        });
        const status = await statusResponse.json();
        if (statusResponse.status === 404) {
          if (!stopped) {
            setConnection(null);
            setQr("");
            setNotice("Połączenie zakończone. Utwórz nowe.");
          }
          return;
        }
        if (!statusResponse.ok) throw new Error(status.error);
        if (stopped) return;
        setConnection(status);
        if (!status.active) {
          setNotice("Sesja zakończona. Utwórz nowe połączenie.");
          return;
        }
        if (status.paired_at) {
          const eventResponse = await fetch(
            `/api/pair?id=${connection!.id}&after=${cursor}`,
            { cache: "no-store" },
          );
          const data = await eventResponse.json();
          if (!eventResponse.ok) throw new Error(data.error);
          for (const event of data.events) {
            cursor = Number(event.id);
            if (event.kind === "ping")
              await call({
                action: "send",
                id: connection!.id,
                kind: "pong",
                payload: {},
              });
            if (event.kind === "pong" && !stopped) setPong(true);
          }
        }
      } catch (error) {
        if (!stopped)
          setNotice(
            error instanceof Error ? error.message : "Przerwane połączenie.",
          );
      }
      if (!stopped) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // Stable ID keeps one polling loop and one event cursor per connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection?.id]);
  async function connect() {
    setPending(true);
    setNotice("");
    setPong(false);
    try {
      if (claim) {
        const result = await call({ action: "claim", token });
        sessionStorage.removeItem("sanenod-pair-token");
        setToken("");
        setConnection({
          ...result,
          paired_at: new Date().toISOString(),
          active: true,
        });
      } else {
        const result = await call({ action: "create" });
        setConnection({ ...result, active: true });
        setQr(
          await QRCode.toDataURL(pairingUrl(location.origin, result.token), {
            width: 280,
            margin: 2,
          }),
        );
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Nie udało się połączyć.",
      );
    } finally {
      setPending(false);
    }
  }
  async function ping() {
    setPong(false);
    try {
      await call({
        action: "send",
        id: connection!.id,
        kind: "ping",
        payload: {},
      });
      setNotice("Wysłano test. Oczekiwanie na odpowiedź…");
    } catch (error) {
      setNotice(String(error));
    }
  }
  async function revoke() {
    try {
      await call({ action: "revoke", id: connection!.id });
      setConnection(null);
      setQr("");
      setNotice("Połączenie zakończone.");
    } catch (error) {
      setNotice(String(error));
    }
  }
  return (
    <>
      <p>
        {claim
          ? "Zaloguj telefon na to samo konto co komputer. Skanowanie kodu potwierdza połączenie na 30 minut."
          : "Otwórz SaneNod na telefonie, zaloguj się na to samo konto i zeskanuj kod QR aparatem. Kod jest jednorazowy i ważny przez 5 minut."}
      </p>
      {claim && !connection && (
        <>
          <label htmlFor="pair-token">Kod połączenia (z linku QR)</label>
          <input
            id="pair-token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
          />
        </>
      )}
      {!connection && (
        <Button disabled={pending || (claim && !token)} onClick={connect}>
          {pending
            ? "Łączenie…"
            : claim
              ? "Połącz z komputerem"
              : "Utwórz kod QR"}
        </Button>
      )}
      {qr && !connection?.paired_at && (
        <Image
          unoptimized
          className="qr"
          src={qr}
          width={280}
          height={280}
          alt="Kod QR do połączenia telefonu"
        />
      )}
      {connection && (
        <>
          <p className="notice" role="status">
            {!connection.active
              ? "Sesja zakończona"
              : connection.paired_at
                ? "Urządzenia połączone."
                : "Oczekiwanie na telefon…"}
          </p>
          <div className="actions">
            {connection.paired_at && connection.active && (
              <Button onClick={ping}>Sprawdź połączenie</Button>
            )}
            <Button className="secondary" onClick={revoke}>
              Zakończ połączenie
            </Button>
          </div>
        </>
      )}
      {pong && (
        <p className="notice" role="status">
          Drugie urządzenie odpowiedziało. Komunikacja działa.
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
