import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import {
  createPairing,
  claimPairing,
  pairingStatus,
  sendEvent,
  events,
  revokePairing,
} from "../apps/portal/lib/pairing";
const url = process.env.DATABASE_URL;
if (!url)
  throw new Error("Start the test database and run db:migrate before testing.");
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Database tests require an isolated local database.");
const db = new Pool({ connectionString: url });
const user = randomUUID();
const other = randomUUID();
const desktop = { userId: user, sessionId: randomUUID() },
  phone = { userId: user, sessionId: randomUUID() },
  third = { userId: user, sessionId: randomUUID() },
  stranger = { userId: other, sessionId: randomUUID() };
beforeAll(async () => {
  for (const id of [user, other])
    await db.query(
      `INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,'Test',$2,true,now(),now())`,
      [id, `${id}@example.test`],
    );
  for (const identity of [desktop, phone, third, stranger])
    await db.query(
      `INSERT INTO "session"(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES($1,$1,$2,now()+interval '1 hour',now(),now())`,
      [identity.sessionId, identity.userId],
    );
});
afterAll(async () => {
  await db.query('DELETE FROM "user" WHERE id=ANY($1)', [[user, other]]);
  await db.query(
    "DELETE FROM api_rate_limits WHERE bucket LIKE $1 OR bucket LIKE $2",
    [`%${user}%`, `%${other}%`],
  );
  await db.end();
});
describe("pairing with real PostgreSQL", () => {
  it("isolates owners, sessions, and prevents self pairing", async () => {
    const pair = await createPairing(db, desktop);
    await expect(claimPairing(db, stranger, pair.token)).rejects.toMatchObject({
      status: 409,
    });
    await expect(claimPairing(db, desktop, pair.token)).rejects.toMatchObject({
      status: 409,
    });
    await expect(pairingStatus(db, third, pair.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      sendEvent(db, phone, pair.id, "ping", {}),
    ).rejects.toMatchObject({ status: 409 });
    await claimPairing(db, phone, pair.token);
    await expect(claimPairing(db, third, pair.token)).rejects.toMatchObject({
      status: 409,
    });
    await expect(pairingStatus(db, stranger, pair.id)).rejects.toMatchObject({
      status: 404,
    });
    expect((await pairingStatus(db, phone, pair.id)).role).toBe("phone");
    await sendEvent(db, desktop, pair.id, "ping", { test: true });
    expect(await events(db, phone, pair.id, 0)).toMatchObject([
      { kind: "ping", payload: { test: true } },
    ]);
    expect(await events(db, desktop, pair.id, 0)).toEqual([]);
    await revokePairing(db, phone, pair.id);
    await expect(
      sendEvent(db, desktop, pair.id, "ping", {}),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("accepts exactly one of concurrent claims", async () => {
    const pair = await createPairing(db, desktop);
    const results = await Promise.allSettled([
      claimPairing(db, phone, pair.token),
      claimPairing(db, third, pair.token),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
  });
  it("rejects expired tokens and expired sessions", async () => {
    const pair = await createPairing(db, desktop);
    await db.query(
      `UPDATE pairing_sessions SET token_expires_at=now()-interval '1 second' WHERE id=$1`,
      [pair.id],
    );
    await expect(claimPairing(db, phone, pair.token)).rejects.toMatchObject({
      status: 409,
    });
    await db.query(
      `UPDATE pairing_sessions SET expires_at=now()-interval '1 second' WHERE id=$1`,
      [pair.id],
    );
    expect((await pairingStatus(db, desktop, pair.id)).active).toBe(false);
  });
  it("rejects oversized payloads", async () => {
    const pair = await createPairing(db, desktop);
    await claimPairing(db, phone, pair.token);
    await expect(
      sendEvent(db, desktop, pair.id, "signal", { x: "a".repeat(17000) }),
    ).rejects.toMatchObject({ status: 413 });
  });
});
