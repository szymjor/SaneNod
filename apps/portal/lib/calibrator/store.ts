import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  PairingError,
  pairingStatus,
  rateLimit,
  type Identity,
} from "../pairing";
import { validateSettings, type Settings } from "./standards";
import {
  patches,
  validateReading,
  analyze,
  type Reading,
  type Sensor,
} from "./measurement";
export type Run = {
  id: string;
  settings: Settings;
  sensor: Sensor;
  measurements: Reading[];
  current_index: number;
  sample_nonce: string;
  status: "ready" | "measuring" | "complete" | "cancelled";
  adjustments: string;
  created_at: string;
  completed_at: string | null;
  pairing_id: string | null;
  can_control?: boolean;
};
type StoredRun = Run & { owner_id: string; desktop_session_id: string | null };
const idPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function validID(id: unknown): asserts id is string {
  if (typeof id !== "string" || !idPattern.test(id))
    throw new PairingError(400, "Nieprawidłowy identyfikator pomiaru.");
}
function expose(row: StoredRun, identity: Identity) {
  const { owner_id, desktop_session_id, ...run } = row;
  void owner_id;
  void desktop_session_id;
  return {
    ...run,
    can_control: desktop_session_id === identity.sessionId,
    analysis: analyze(run.measurements, run.sensor, run.settings),
  };
}
export async function history(db: Pool, identity: Identity) {
  const result = await db.query<StoredRun>(
    "SELECT * FROM calibrations WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 50",
    [identity.userId],
  );
  return result.rows.map((row) => expose(row, identity));
}
export async function readRun(db: Pool, identity: Identity, id: unknown) {
  validID(id);
  const result = await db.query<StoredRun>(
    "SELECT * FROM calibrations WHERE id=$1 AND owner_id=$2",
    [id, identity.userId],
  );
  if (!result.rowCount)
    throw new PairingError(404, "Nie ma takiego pomiaru na Twoim koncie.");
  return expose(result.rows[0], identity);
}
export async function phoneRun(db: Pool, identity: Identity, pairID: unknown) {
  validID(pairID);
  const status = await pairingStatus(db, identity, pairID);
  if (!status.active || !status.paired_at || status.role !== "phone")
    throw new PairingError(
      409,
      "Połączenie telefonu wygasło lub zostało zakończone.",
    );
  const result = await db.query<StoredRun>(
    "SELECT * FROM calibrations WHERE pairing_id=$1 AND owner_id=$2 ORDER BY created_at DESC LIMIT 1",
    [pairID, identity.userId],
  );
  return result.rowCount ? expose(result.rows[0], identity) : null;
}
export async function createRun(
  db: Pool,
  identity: Identity,
  body: Record<string, unknown>,
) {
  let settings: Settings;
  try {
    settings = validateSettings(body.settings);
  } catch (error) {
    throw new PairingError(400, (error as Error).message);
  }
  if (body.sensor !== "camera" && body.sensor !== "external")
    throw new PairingError(400, "Wybierz metodę pomiaru.");
  if (body.sensor === "external" && settings.sensorName.length < 3)
    throw new PairingError(
      400,
      "Podaj nazwę kolorymetru i tryb korekcji dla swojego ekranu.",
    );
  await rateLimit(db, `calibration:${identity.userId}`, 5);
  let pairID: string | null = null;
  if (body.sensor === "camera") {
    validID(body.pairingId);
    pairID = body.pairingId;
    const status = await pairingStatus(db, identity, pairID);
    if (!status.active || !status.paired_at || status.role !== "desktop")
      throw new PairingError(409, "Najpierw połącz telefon z tym komputerem.");
  }
  const result = await db.query<StoredRun>(
    `INSERT INTO calibrations(id,owner_id,desktop_session_id,pairing_id,settings,sensor,sample_nonce) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING *`,
    [
      randomUUID(),
      identity.userId,
      identity.sessionId,
      pairID,
      JSON.stringify(settings),
      body.sensor,
      randomUUID(),
    ],
  );
  return expose(result.rows[0], identity);
}
export async function mutateRun(
  db: Pool,
  identity: Identity,
  body: Record<string, unknown>,
) {
  validID(body.id);
  await rateLimit(db, `measurement:${identity.sessionId}`, 120);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<StoredRun>(
      "SELECT * FROM calibrations WHERE id=$1 AND owner_id=$2 FOR UPDATE",
      [body.id, identity.userId],
    );
    if (!result.rowCount) throw new PairingError(404, "Pomiar nie istnieje.");
    const row = result.rows[0],
      phoneSample = body.action === "sample" && row.sensor === "camera";
    if (phoneSample) {
      const pair = await client.query(
        `SELECT id FROM pairing_sessions WHERE id=$1 AND owner_id=$2 AND phone_session_id=$3 AND desktop_session_id=$4 AND revoked_at IS NULL AND expires_at>now() FOR SHARE`,
        [
          row.pairing_id,
          identity.userId,
          identity.sessionId,
          row.desktop_session_id,
        ],
      );
      if (!pair.rowCount)
        throw new PairingError(
          403,
          "Tylko połączony telefon może przesłać próbkę kamery.",
        );
    } else if (row.desktop_session_id !== identity.sessionId)
      throw new PairingError(
        403,
        "Tę serię obsługuje inna sesja komputera. Rozpocznij własną serię.",
      );
    if (
      row.sensor === "camera" &&
      !phoneSample &&
      ["start", "next"].includes(String(body.action))
    ) {
      const pair = await client.query(
        "SELECT id FROM pairing_sessions WHERE id=$1 AND desktop_session_id=$2 AND phone_session_id IS NOT NULL AND revoked_at IS NULL AND expires_at>now() FOR SHARE",
        [row.pairing_id, identity.sessionId],
      );
      if (!pair.rowCount)
        throw new PairingError(
          409,
          "Połącz ponownie telefon; sesja parowania wygasła.",
        );
    }
    switch (body.action) {
      case "start":
        if (row.status !== "ready")
          throw new PairingError(409, "Seria została już rozpoczęta.");
        await client.query(
          "UPDATE calibrations SET status='measuring',sample_nonce=$2 WHERE id=$1",
          [row.id, randomUUID()],
        );
        break;
      case "sample": {
        if (
          row.status !== "measuring" ||
          body.nonce !== row.sample_nonce ||
          row.measurements.some(
            (r) => r.patch === patches[row.current_index].id,
          )
        )
          throw new PairingError(
            409,
            "Wzorzec zmienił się lub próbka została już odebrana.",
          );
        let reading: Reading;
        try {
          reading = validateReading(
            body.reading,
            row.sensor,
            row.current_index,
          );
        } catch (error) {
          throw new PairingError(400, (error as Error).message);
        }
        await client.query(
          "UPDATE calibrations SET measurements=measurements || $2::jsonb WHERE id=$1",
          [row.id, JSON.stringify([reading])],
        );
        break;
      }
      case "next":
        if (
          row.status !== "measuring" ||
          body.nonce !== row.sample_nonce ||
          !row.measurements.some(
            (r) => r.patch === patches[row.current_index].id,
          )
        )
          throw new PairingError(409, "Najpierw zmierz bieżący wzorzec.");
        if (row.current_index === patches.length - 1)
          await client.query(
            "UPDATE calibrations SET status='complete',completed_at=now(),sample_nonce=$2 WHERE id=$1",
            [row.id, randomUUID()],
          );
        else
          await client.query(
            "UPDATE calibrations SET current_index=current_index+1,sample_nonce=$2 WHERE id=$1",
            [row.id, randomUUID()],
          );
        break;
      case "import": {
        if (
          row.sensor !== "external" ||
          !["ready", "measuring"].includes(row.status) ||
          !Array.isArray(body.readings) ||
          body.readings.length !== patches.length
        )
          throw new PairingError(
            400,
            "Import wymaga pełnej serii kolorymetru.",
          );
        let readings: Reading[];
        try {
          readings = body.readings.map((r, i) =>
            validateReading(r, "external", i),
          );
        } catch (error) {
          throw new PairingError(400, (error as Error).message);
        }
        await client.query(
          "UPDATE calibrations SET measurements=$2::jsonb,status='complete',current_index=9,completed_at=now(),sample_nonce=$3 WHERE id=$1",
          [row.id, JSON.stringify(readings), randomUUID()],
        );
        break;
      }
      case "notes":
        if (typeof body.notes !== "string" || body.notes.length > 2000)
          throw new PairingError(400, "Notatka może mieć do 2000 znaków.");
        await client.query(
          "UPDATE calibrations SET adjustments=$2 WHERE id=$1",
          [row.id, body.notes],
        );
        break;
      case "cancel":
        if (!["ready", "measuring"].includes(row.status))
          throw new PairingError(409, "Seria jest już zakończona.");
        await client.query(
          "UPDATE calibrations SET status='cancelled',sample_nonce=$2 WHERE id=$1",
          [row.id, randomUUID()],
        );
        break;
      default:
        throw new PairingError(400, "Nieznana operacja.");
    }
    const updated = await client.query<StoredRun>(
      "SELECT * FROM calibrations WHERE id=$1",
      [row.id],
    );
    await client.query("COMMIT");
    return expose(updated.rows[0], identity);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
