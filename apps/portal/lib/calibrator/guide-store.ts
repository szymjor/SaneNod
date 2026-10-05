import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  pairingStatus,
  PairingError,
  rateLimit,
  type Identity,
} from "../pairing";
import { validTest, validateGrid, type GuideState } from "./guide";
export async function readGuide(
  db: Pool,
  identity: Identity,
  id: string,
): Promise<GuideState | null> {
  const status = await pairingStatus(db, identity, id);
  if (!status.active || !status.paired_at)
    throw new PairingError(
      409,
      "Połączenie wygasło. Utwórz nowy QR na komputerze.",
    );
  const result = await db.query<GuideState>(
    "SELECT * FROM calibration_guides WHERE pairing_id=$1",
    [id],
  );
  return result.rows[0] ?? null;
}
export async function mutateGuide(
  db: Pool,
  identity: Identity,
  body: Record<string, unknown>,
): Promise<GuideState> {
  const id = String(body.pairingId ?? "");
  const status = await pairingStatus(db, identity, id);
  if (!status.active || !status.paired_at)
    throw new PairingError(409, "Połączenie nie jest aktywne.");
  await rateLimit(db, `guide:${identity.sessionId}`, 90);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // Lock the pair as well: revocation, expiry and starting a measurement cannot race this update.
    const pair = await client.query(
      `SELECT id FROM pairing_sessions WHERE id=$1 AND owner_id=$2 AND (desktop_session_id=$3 OR phone_session_id=$3) AND phone_session_id IS NOT NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`,
      [id, identity.userId, identity.sessionId],
    );
    if (!pair.rowCount)
      throw new PairingError(409, "Połączenie zostało zakończone.");
    const active = await client.query(
      "SELECT id FROM calibrations WHERE pairing_id=$1 AND status IN ('ready','measuring')",
      [id],
    );
    if (active.rowCount)
      throw new PairingError(
        409,
        "Trwa seria pomiarowa. Zakończ ją przed testami ustawień.",
      );
    await client.query(
      "INSERT INTO calibration_guides(pairing_id,revision) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [id, randomUUID()],
    );
    const {
      rows: [current],
    } = await client.query<GuideState>(
      "SELECT * FROM calibration_guides WHERE pairing_id=$1 FOR UPDATE",
      [id],
    );
    if (body.action !== "start" && body.revision !== current.revision)
      throw new PairingError(
        409,
        "Wzorzec się zmienił. Poczekaj na aktualny krok.",
      );
    let query: string, values: unknown[];
    if (
      body.action === "start" ||
      body.action === "select" ||
      body.action === "stop"
    ) {
      if (
        (body.action === "start" || body.action === "stop") &&
        status.role !== "desktop"
      )
        throw new PairingError(
          403,
          "Ten krok rozpocznij lub zakończ na komputerze.",
        );
      if (body.action === "start" && current.test)
        throw new PairingError(409, "Testy już trwają. Odśwież bieżący krok.");
      if (body.action === "select" && (!current.test || !validTest(body.test)))
        throw new PairingError(400, "Wybierz dostępny test.");
      const test =
        body.action === "stop"
          ? null
          : body.action === "start"
            ? "shadows"
            : body.test;
      query =
        "UPDATE calibration_guides SET test=$2,revision=$3,reading=NULL,reading_at=NULL WHERE pairing_id=$1 RETURNING *";
      values = [id, test, randomUUID()];
    } else if (body.action === "reading") {
      if (status.role !== "phone")
        throw new PairingError(403, "Odczyt wysyła sparowany telefon.");
      if (!current.test)
        throw new PairingError(409, "Testy zostały zakończone.");
      let reading;
      try {
        reading = validateGrid(body.reading);
      } catch {
        throw new PairingError(400, "Nieprawidłowe dane kamery.");
      }
      query =
        "UPDATE calibration_guides SET reading=$2::jsonb,reading_at=now() WHERE pairing_id=$1 RETURNING *";
      values = [id, JSON.stringify(reading)];
    } else if (body.action === "note") {
      if (
        !current.test ||
        typeof body.note !== "string" ||
        body.note.length > 1000
      )
        throw new PairingError(400, "Notatka może mieć do 1000 znaków.");
      const notes = { ...current.observations, [current.test]: body.note };
      if (Buffer.byteLength(JSON.stringify(notes)) > 16000)
        throw new PairingError(
          400,
          "Notatki są łącznie zbyt duże. Skróć obserwację.",
        );
      query =
        "UPDATE calibration_guides SET observations=observations || $2::jsonb WHERE pairing_id=$1 RETURNING *";
      values = [id, JSON.stringify({ [current.test]: body.note })];
    } else throw new PairingError(400, "Nieznana operacja testów.");
    const result = await client.query<GuideState>(query, values);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
