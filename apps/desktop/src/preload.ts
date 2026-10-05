import { contextBridge, ipcRenderer } from "electron";
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld(
    "sanenodDesktop",
    Object.freeze({
      platform: process.platform,
      openColorSettings: () => ipcRenderer.invoke("sanenod:color-settings"),
    }),
  );
}
