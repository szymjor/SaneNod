import { app, BrowserWindow, session, ipcMain } from "electron";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const raw = process.env.SANENOD_PORTAL_URL ?? "https://sanenod.vercel.app";
const portal = new URL(raw);
const local =
  portal.protocol === "http:" &&
  ["localhost", "127.0.0.1"].includes(portal.hostname) &&
  !app.isPackaged;
if (
  (!local && portal.protocol !== "https:") ||
  portal.username ||
  portal.password
)
  throw new Error(
    "Portal must use HTTPS. Local HTTP is allowed only during development.",
  );
function trusted(url: string) {
  try {
    return new URL(url).origin === portal.origin;
  } catch {
    return false;
  }
}
app.whenReady().then(() => {
  const isolated = session.fromPartition("persist:sanenod");
  isolated.setPermissionCheckHandler(
    (_webContents, permission, origin, details) =>
      permission === "media" &&
      trusted(origin) &&
      details.mediaType === "video",
  );
  isolated.setPermissionRequestHandler(
    (_webContents, permission, callback, details) =>
      callback(
        permission === "media" &&
          trusted(details.requestingUrl) &&
          "mediaTypes" in details &&
          Array.isArray(details.mediaTypes) &&
          details.mediaTypes.length > 0 &&
          details.mediaTypes.every((type) => type === "video"),
      ),
  );
  ipcMain.handle(
    "sanenod:color-settings",
    async (event, ...args: unknown[]) => {
      if (
        args.length ||
        event.senderFrame !== event.sender.mainFrame ||
        !event.senderFrame ||
        !trusted(event.senderFrame.url) ||
        !BrowserWindow.fromWebContents(event.sender)
      )
        throw new Error("Only the trusted main frame can open color settings.");
      if (process.platform === "win32")
        await promisify(execFile)("colorcpl.exe", []);
      else if (process.platform === "darwin")
        await promisify(execFile)("/usr/bin/open", ["-a", "ColorSync Utility"]);
      else
        throw new Error(
          "Open your system color settings manually. Supported desktop platforms: Windows and macOS.",
        );
    },
  );
  function createWindow() {
    const win = new BrowserWindow({
      width: 1200,
      height: 820,
      minWidth: 700,
      minHeight: 550,
      backgroundColor: "#f5f4ef",
      webPreferences: {
        preload: join(__dirname, "preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: "persist:sanenod",
        webSecurity: true,
      },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event, url) => {
      if (!trusted(url)) event.preventDefault();
    });
    win.webContents.on("will-redirect", (event, url) => {
      if (!trusted(url)) event.preventDefault();
    });
    void win.loadURL(portal.toString());
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
// The bridge only opens a fixed OS color panel. It cannot write profiles, files, or monitor settings.
