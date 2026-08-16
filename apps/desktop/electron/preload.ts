/**
 * Preload script — exposes a typed, narrow API to the renderer via contextBridge.
 * Node integration is OFF; sandbox is ON. The only Node access is through these channels.
 */
import { contextBridge, ipcRenderer } from "electron";
import type { OpenDialogOptions, SaveDialogOptions } from "electron";
import type { DesktopNfcHardwarePlan, DesktopNfcState } from "@windels/shared/desktop";

export const desktopApi = {
  platform: process.platform,
  isDesktop: true,

  window: {
    open: (kind: "main" | "chat" | "workflow" | "canvas" | "settings" | "auth", opts?: any) =>
      ipcRenderer.invoke("window:open", kind, opts),
    show: (kind: "main" | "chat" | "workflow" | "canvas" | "settings" | "auth") =>
      ipcRenderer.invoke("window:show", kind),
    close: () => ipcRenderer.invoke("window:close"),
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    setAlwaysOnTop: (flag: boolean, level?: "floating" | "normal") =>
      ipcRenderer.invoke("window:set-always-on-top", flag, level),
    broadcast: (channel: string, payload: unknown) =>
      ipcRenderer.invoke("window:broadcast", channel, payload),
  },

  fs: {
    openDialog: (opts?: OpenDialogOptions) => ipcRenderer.invoke("fs:open-dialog", opts),
    saveDialog: (opts?: SaveDialogOptions & { dataBase64?: string }) =>
      ipcRenderer.invoke("fs:save-dialog", opts),
    readUserData: (relPath: string) => ipcRenderer.invoke("fs:read-user-data", relPath),
    writeUserData: (relPath: string, dataBase64: string) =>
      ipcRenderer.invoke("fs:write-user-data", relPath, dataBase64),
  },

  notify: {
    send: (payload: { title: string; body?: string; silent?: boolean; url?: string }) =>
      ipcRenderer.invoke("notify:send", payload),
    setBadge: (count: number) => ipcRenderer.invoke("notify:set-badge", count),
  },

  nfc: {
    state: () => ipcRenderer.invoke("nfc:state"),
    refresh: (readerLocalId: string) => ipcRenderer.invoke("nfc:refresh", readerLocalId),
    execute: (plan: DesktopNfcHardwarePlan) => ipcRenderer.invoke("nfc:execute", plan),
    onState: (callback: (state: DesktopNfcState) => void) => {
      const handler = (_event: unknown, state: DesktopNfcState) => callback(state);
      ipcRenderer.on("nfc:state", handler);
      return () => ipcRenderer.removeListener("nfc:state", handler);
    },
  },

  app: {
    info: () => ipcRenderer.invoke("app:info"),
    checkForUpdates: () => ipcRenderer.invoke("updater:check"),
    installUpdateAndRestart: () => ipcRenderer.invoke("updater:install-and-restart"),
    openExternal: (url: string) => ipcRenderer.invoke("native:open-external", url),
    showInFolder: (path: string) => ipcRenderer.invoke("native:show-in-folder", path),
    relaunch: () => ipcRenderer.invoke("native:relaunch"),
  },

  // Events from main process
  onDeepLink: (cb: (data: { path: string; token?: string; url: string }) => void) => {
    const h = (_: unknown, data: any) => cb(data);
    ipcRenderer.on("desktop:deep-link", h);
    return () => ipcRenderer.removeListener("desktop:deep-link", h);
  },
  onAuthToken: (cb: (token: string) => void) => {
    const h = (_: unknown, token: string) => cb(token);
    ipcRenderer.on("desktop:auth-token", h);
    return () => ipcRenderer.removeListener("desktop:auth-token", h);
  },
  onNavigate: (cb: (url: string) => void) => {
    const h = (_: unknown, url: string) => cb(url);
    ipcRenderer.on("desktop:navigate", h);
    return () => ipcRenderer.removeListener("desktop:navigate", h);
  },
  onUpdateDownloaded: (cb: () => void) => {
    const h = () => cb();
    ipcRenderer.on("desktop:update-downloaded", h);
    return () => ipcRenderer.removeListener("desktop:update-downloaded", h);
  },
};

contextBridge.exposeInMainWorld("desktop", desktopApi);
export type DesktopApi = typeof desktopApi;
