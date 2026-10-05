import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import {
  createPairing,
  claimPairing,
  revokePairing,
} from "../apps/portal/lib/pairing";
import {
  createRun,
  mutateRun,
  readRun,
  phoneRun,
  history,
} from "../apps/portal/lib/calibrator/store";
import {
  readGuide,
  mutateGuide,
} from "../apps/portal/lib/calibrator/guide-store";
import { summarizeGrid } from "../apps/portal/lib/calibrator/guide";
import { defaults } from "../apps/portal/lib/calibrator/standards";
import { patches } from "../apps/portal/lib/calibrator/measurement";
const url = process.env.DATABASE_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error(
    "Calibration database tests require local isolated PostgreSQL.",
  );
const db = new Pool({ connectionString: url }),
  owner = randomUUID(),
  stranger = randomUUID();
const desktop = { userId: owner, sessionId: randomUUID() },
  phone = { userId: owner, sessionId: randomUUID() },
  third = { userId: owner, sessionId: randomUUID() },
  foreign = { userId: stranger, sessionId: randomUUID() };
beforeAll(async () => {
  for (const id of [owner, stranger])
    await db.query(
      `INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt")VALUES($1,'Test',$2,true,now(),now())`,
      [id, `${id}@example.test`],
    );
  for (const v of [desktop, phone, third, foreign])
    await db.query(
      `INSERT INTO "session"(id,token,"userId","expiresAt","createdAt","updatedAt")VALUES($1,$1,$2,now()+interval '1 hour',now(),now())`,
      [v.sessionId, v.userId],
    );
});
afterAll(async () => {
  await db.query('DELETE FROM "user" WHERE id=ANY($1)', [[owner, stranger]]);
  await db.query(
    "DELETE FROM api_rate_limits WHERE bucket LIKE $1 OR bucket LIKE $2",
    [`%${owner}%`, `%${stranger}%`],
  );
  await db.end();
});
it("binds camera samples to the paired phone and nonce, atomically rejects replay, blocks revoked sessions", async () => {
  const pair = await createPairing(db, desktop);
  await claimPairing(db, phone, pair.token);
  let run = await createRun(db, desktop, {
    settings: defaults(),
    sensor: "camera",
    pairingId: pair.id,
  });
  await expect(
    createRun(db, phone, {
      settings: defaults(),
      sensor: "camera",
      pairingId: pair.id,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(readRun(db, foreign, run.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(phoneRun(db, third, pair.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    mutateRun(db, third, { action: "start", id: run.id }),
  ).rejects.toMatchObject({ status: 403 });
  run = await mutateRun(db, desktop, { action: "start", id: run.id });
  await expect(
    mutateRun(db, desktop, {
      action: "next",
      id: run.id,
      nonce: run.sample_nonce,
    }),
  ).rejects.toMatchObject({ status: 409 });
  const sample = {
    action: "sample",
    id: run.id,
    nonce: run.sample_nonce,
    reading: { patch: "black", values: [1, 2, 3], clipped: 0, spread: 2 },
  };
  await expect(mutateRun(db, desktop, sample)).rejects.toMatchObject({
    status: 403,
  });
  await expect(mutateRun(db, third, sample)).rejects.toMatchObject({
    status: 403,
  });
  const results = await Promise.allSettled([
    mutateRun(db, phone, sample),
    mutateRun(db, phone, sample),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  run = await mutateRun(db, desktop, {
    action: "next",
    id: run.id,
    nonce: run.sample_nonce,
  });
  expect(run.current_index).toBe(1);
  await expect(mutateRun(db, phone, sample)).rejects.toMatchObject({
    status: 409,
  });
  await revokePairing(db, phone, pair.id);
  await expect(
    mutateRun(db, phone, {
      action: "sample",
      id: run.id,
      nonce: run.sample_nonce,
      reading: { patch: "gray-5", values: [2, 2, 2], clipped: 0, spread: 0 },
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    mutateRun(db, desktop, {
      action: "next",
      id: run.id,
      nonce: run.sample_nonce,
    }),
  ).rejects.toMatchObject({ status: 409 });
});
it("syncs live patterns, binds camera feedback to revision and phone, and isolates other sessions", async () => {
  const pair = await createPairing(db, desktop);
  await claimPairing(db, phone, pair.token);
  await expect(
    mutateGuide(db, phone, { action: "start", pairingId: pair.id }),
  ).rejects.toMatchObject({ status: 403 });
  let guide = await mutateGuide(db, desktop, {
    action: "start",
    pairingId: pair.id,
  });
  expect((await readGuide(db, phone, pair.id))?.test).toBe("shadows");
  for (const identity of [third, foreign])
    await expect(readGuide(db, identity, pair.id)).rejects.toMatchObject({
      status: 404,
    });
  const reading = summarizeGrid(new Uint8ClampedArray(100 * 4), 10, 10, false);
  await expect(
    mutateGuide(db, desktop, {
      action: "reading",
      pairingId: pair.id,
      revision: guide.revision,
      reading,
    }),
  ).rejects.toMatchObject({ status: 403 });
  const oldRevision = guide.revision;
  guide = await mutateGuide(db, phone, {
    action: "select",
    pairingId: pair.id,
    revision: oldRevision,
    test: "uniform",
  });
  await expect(
    mutateGuide(db, phone, {
      action: "reading",
      pairingId: pair.id,
      revision: oldRevision,
      reading,
    }),
  ).rejects.toMatchObject({ status: 409 });
  guide = await mutateGuide(db, phone, {
    action: "reading",
    pairingId: pair.id,
    revision: guide.revision,
    reading,
  });
  expect(guide.reading?.cells).toHaveLength(25);
  guide = await mutateGuide(db, phone, {
    action: "note",
    pairingId: pair.id,
    revision: guide.revision,
    note: "Backlight 30",
  });
  expect((await readGuide(db, desktop, pair.id))?.observations.uniform).toBe(
    "Backlight 30",
  );
  await expect(
    createRun(db, desktop, {
      settings: defaults(),
      sensor: "camera",
      pairingId: pair.id,
    }),
  ).rejects.toMatchObject({ status: 409 });
  const switches = await Promise.allSettled(
    [desktop, phone].map((identity) =>
      mutateGuide(db, identity, {
        action: "select",
        pairingId: pair.id,
        revision: guide.revision,
        test: "black",
      }),
    ),
  );
  expect(switches.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  guide = (await readGuide(db, desktop, pair.id))!;
  expect(guide.test).toBe("black");
  expect(guide.reading).toBeNull();
  guide = await mutateGuide(db, desktop, {
    action: "stop",
    pairingId: pair.id,
    revision: guide.revision,
  });
  expect(guide.test).toBeNull();
  expect(guide.reading).toBeNull();
  const run = await createRun(db, desktop, {
    settings: defaults(),
    sensor: "camera",
    pairingId: pair.id,
  });
  await expect(
    mutateGuide(db, desktop, { action: "start", pairingId: pair.id }),
  ).rejects.toMatchObject({ status: 409 });
  await mutateRun(db, desktop, { action: "cancel", id: run.id });
  await revokePairing(db, phone, pair.id);
  await expect(readGuide(db, desktop, pair.id)).rejects.toMatchObject({
    status: 409,
  });
});

it("saves complete external series, retains history after logout, and isolates account ownership", async () => {
  let run = await createRun(db, desktop, {
    settings: { ...defaults(), sensorName: "Test instrument / WLED" },
    sensor: "external",
  });
  await expect(
    mutateRun(db, foreign, { action: "import", id: run.id, readings: [] }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    mutateRun(db, desktop, {
      action: "import",
      id: run.id,
      readings: [{ patch: "black", values: [0, 0, 0] }],
    }),
  ).rejects.toMatchObject({ status: 400 });
  run = await mutateRun(db, desktop, {
    action: "import",
    id: run.id,
    readings: patches.map((p) => ({
      patch: p.id,
      values: [1, 120 * p.rgb[1] + 0.01, 1],
    })),
  });
  expect(run.status).toBe("complete");
  expect(await history(db, foreign)).toHaveLength(0);
  expect((await history(db, third)).some((r) => r.id === run.id)).toBe(true);
  await expect(
    mutateRun(db, desktop, {
      action: "next",
      id: run.id,
      nonce: run.sample_nonce,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await db.query('DELETE FROM "session" WHERE id=$1', [desktop.sessionId]);
  expect((await readRun(db, third, run.id)).measurements).toHaveLength(10);
});
