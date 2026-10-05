import { _electron as electron } from "@playwright/test";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const require = createRequire(
  new URL("../apps/desktop/package.json", import.meta.url),
);
const desktop = fileURLToPath(new URL("../apps/desktop", import.meta.url));
let cookieRestored = false;
const server = createServer((req, res) => {
  cookieRestored = req.headers.cookie?.includes("desktop-smoke=1") ?? false;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Set-Cookie",
    "desktop-smoke=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600",
  );
  res.end(
    "<!doctype html><title>SaneNod desktop smoke</title><h1>Desktop ready</h1>",
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let instance;
async function launch() {
  instance = await electron.launch({
    executablePath: require("electron"),
    args: [desktop, "--use-fake-device-for-media-stream"],
    env: { ...process.env, SANENOD_PORTAL_URL: origin },
    timeout: 30000,
  });
  const page = await instance.firstWindow();
  await page.waitForURL(`${origin}/`);
  await page.locator("h1").waitFor();
  return page;
}
try {
  const page = await launch();
  assert.deepEqual(
    await instance.evaluate(({ BrowserWindow }) => {
      const p =
        BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return {
        sandbox: p.sandbox,
        contextIsolation: p.contextIsolation,
        nodeIntegration: p.nodeIntegration,
        webSecurity: p.webSecurity,
      };
    }),
    {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  );
  assert.deepEqual(
    await page.evaluate(() => [typeof window.require, typeof window.process]),
    ["undefined", "undefined"],
  );
  assert.deepEqual(
    await page.evaluate(() => Object.keys(window.sanenodDesktop).sort()),
    ["openColorSettings", "platform"],
  );
  assert.equal(
    await page.evaluate(() => typeof window.sanenodDesktop.openColorSettings),
    "function",
  );
  assert.equal(
    await page.evaluate(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = stream.getVideoTracks().length;
      stream.getTracks().forEach((track) => track.stop());
      return video;
    }),
    1,
  );
  assert.equal(
    await page.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((track) => track.stop());
        return "allowed";
      } catch (error) {
        return error.name;
      }
    }),
    "NotAllowedError",
  );
  await instance.evaluate(async ({ session }) => {
    await session.fromPartition("persist:sanenod").cookies.flushStore();
  });
  await instance.close();
  instance = undefined;
  cookieRestored = false;
  await launch();
  assert.equal(
    cookieRestored,
    true,
    "Desktop cookies must survive an app restart",
  );
  console.log(
    "Desktop launch, sandbox, camera permission and cookie persistence passed.",
  );
} finally {
  if (instance) await instance.close();
  await new Promise((resolve) => server.close(resolve));
}
