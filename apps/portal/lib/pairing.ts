import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
export type Identity = { userId: string; sessionId: string };
export class PairingError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function rateLimit(db: Pool, bucket: string, limit: number) {
  const result = await db.query(
    `INSERT INTO api_rate_limits(bucket,window_start,count) VALUES ($1,date_trunc('minute',now()),1)
 ON CONFLICT(bucket,window_start) DO UPDATE SET count=api_rate_limits.count+1 RETURNING count`,
    [bucket],
  );
  if (result.rows[0].count > limit)
    throw new PairingError(429, "Zbyt wiele prób. Spróbuj za minutę.");
}
async function cleanup(db: Pool) {
  await db.query(
    `DELETE FROM pairing_sessions WHERE expires_at < now() - interval '1 day'`,
  );
  await db.query(
    `DELETE FROM device_events WHERE created_at < now() - interval '1 hour'`,
  );
  await db.query(
    `DELETE FROM api_rate_limits WHERE window_start < now() - interval '1 day'`,
  );
}
export async function createPairing(db: Pool, identity: Identity) {
  await rateLimit(db, `create:${identity.userId}`, 5);
  await cleanup(db);
  const token = randomBytes(32).toString("hex");
  const id = randomUUID();
  const result = await db.query(
    `INSERT INTO pairing_sessions(id,owner_id,desktop_session_id,token_hash) VALUES ($1,$2,$3,$4) RETURNING id,token_expires_at,expires_at`,
    [id, identity.userId, identity.sessionId, tokenHash(token)],
  );
  return { ...result.rows[0], token };
}
export async function claimPairing(
  db: Pool,
  identity: Identity,
  token: string,
) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new PairingError(400, "Nieprawidłowy kod parowania.");
  await rateLimit(db, `claim:${identity.userId}`, 20);
  const result = await db.query(
    `UPDATE pairing_sessions SET phone_session_id=$1,paired_at=now()
 WHERE token_hash=$2 AND owner_id=$3 AND desktop_session_id<>$1 AND phone_session_id IS NULL
 AND revoked_at IS NULL AND token_expires_at>now() AND expires_at>now() RETURNING id,expires_at`,
    [identity.sessionId, tokenHash(token), identity.userId],
  );
  if (!result.rowCount)
    throw new PairingError(
      409,
      "Kod wygasł, jest użyty lub należy do innego konta. Zaloguj telefon na to samo konto.",
    );
  return result.rows[0];
}
export async function pairingStatus(db: Pool, identity: Identity, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id))
    throw new PairingError(400, "Nieprawidłowa sesja.");
  const result = await db.query(
    `SELECT id,paired_at,expires_at,token_expires_at,revoked_at FROM pairing_sessions
 WHERE id=$1 AND owner_id=$2 AND (desktop_session_id=$3 OR phone_session_id=$3)`,
    [id, identity.userId, identity.sessionId],
  );
  if (!result.rowCount) throw new PairingError(404, "Sesja nie istnieje.");
  const row = result.rows[0];
  const expired = new Date(row.expires_at).getTime() < Date.now();
  const tokenExpired =
    !row.paired_at && new Date(row.token_expires_at).getTime() < Date.now();
  return {
    ...row,
    active: !expired && !tokenExpired && !row.revoked_at,
    role: await role(db, identity, id),
  };
}
async function role(db: Pool, identity: Identity, id: string) {
  const result = await db.query(
    "SELECT desktop_session_id=$2 AS desktop FROM pairing_sessions WHERE id=$1",
    [id, identity.sessionId],
  );
  return result.rows[0].desktop ? "desktop" : "phone";
}
export async function events(
  db: Pool,
  identity: Identity,
  id: string,
  after: number,
) {
  const status = await pairingStatus(db, identity, id);
  if (!status.active || !status.paired_at)
    throw new PairingError(409, "Sesja nie jest połączona lub wygasła.");
  const result = await db.query(
    `SELECT id::text,kind,payload,created_at FROM device_events WHERE pairing_id=$1 AND id>$2 AND sender_session_id<>$3 ORDER BY id LIMIT 100`,
    [id, after, identity.sessionId],
  );
  return result.rows;
}
export async function sendEvent(
  db: Pool,
  identity: Identity,
  id: string,
  kind: unknown,
  payload: unknown,
) {
  if (!["ping", "pong", "signal"].includes(String(kind)))
    throw new PairingError(400, "Nieobsługiwany typ wiadomości.");
  const serialized = JSON.stringify(payload ?? {});
  if (Buffer.byteLength(serialized) > 16000)
    throw new PairingError(413, "Wiadomość jest zbyt duża.");
  await rateLimit(db, `event:${identity.sessionId}`, 180);
  const result = await db.query(
    `INSERT INTO device_events(pairing_id,sender_session_id,kind,payload)
 SELECT id,$3,$4,$5::jsonb FROM pairing_sessions WHERE id=$1 AND owner_id=$2
 AND (desktop_session_id=$3 OR phone_session_id=$3) AND phone_session_id IS NOT NULL
 AND revoked_at IS NULL AND expires_at>now() RETURNING id::text`,
    [id, identity.userId, identity.sessionId, kind, serialized],
  );
  if (!result.rowCount) throw new PairingError(409, "Sesja nie jest aktywna.");
  return result.rows[0];
}
export async function revokePairing(db: Pool, identity: Identity, id: string) {
  const result = await db.query(
    `UPDATE pairing_sessions SET revoked_at=now() WHERE id=$1 AND owner_id=$2
 AND (desktop_session_id=$3 OR phone_session_id=$3) RETURNING id`,
    [id, identity.userId, identity.sessionId],
  );
  if (!result.rowCount) throw new PairingError(404, "Sesja nie istnieje.");
}
