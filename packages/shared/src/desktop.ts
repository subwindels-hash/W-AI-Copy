/**
 * Shared types for WINDELS AI OS Desktop (Electron).
 * These types describe the `window.desktop` API injected by the preload script.
 * Imported from both the renderer (web) and the main/preload TypeScript files.
 */
export type DesktopWindowKind = "main" | "chat" | "workflow" | "canvas" | "settings" | "auth";

export interface DesktopWindowAPI {
  open: (kind: DesktopWindowKind, opts?: Record<string, unknown>) => Promise<{ id: number; kind: DesktopWindowKind }>;
  show: (kind: DesktopWindowKind) => Promise<boolean>;
  close: () => Promise<void>;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  setAlwaysOnTop: (flag: boolean, level?: "floating" | "normal") => Promise<void>;
  broadcast: (channel: string, payload: unknown) => Promise<void>;
}

export interface DesktopFSAPI {
  openDialog: (opts?: any) => Promise<{ canceled: boolean; files?: Array<{ path: string; name: string; size: number; dataBase64: string }> }>;
  saveDialog: (opts?: any) => Promise<{ canceled: boolean; path?: string }>;
  readUserData: (relPath: string) => Promise<{ ok: boolean; dataBase64?: string; error?: string }>;
  writeUserData: (relPath: string, dataBase64: string) => Promise<{ ok: boolean; path: string }>;
}

export interface DesktopNotifyAPI {
  send: (payload: { title: string; body?: string; silent?: boolean; url?: string }) => Promise<{ ok: boolean }>;
  setBadge: (count: number) => Promise<boolean>;
}

export interface DesktopAppAPI {
  info: () => Promise<{
    version: string; name: string; platform: string; arch: string; osVersion: string;
    isPackaged: boolean; userDataPath: string; homePath: string; documentsPath: string; downloadsPath: string;
  }>;
  checkForUpdates: () => Promise<{ ok: boolean; dev?: boolean; updateInfo?: any; error?: string }>;
  installUpdateAndRestart: () => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  showInFolder: (path: string) => Promise<boolean>;
  relaunch: () => Promise<void>;
}

export interface DesktopAPI {
  platform: string;
  isDesktop: true;
  window: DesktopWindowAPI;
  fs: DesktopFSAPI;
  notify: DesktopNotifyAPI;
  app: DesktopAppAPI;
  onDeepLink: (cb: (data: { path: string; token?: string; url: string }) => void) => () => void;
  onAuthToken: (cb: (token: string) => void) => () => void;
  onNavigate: (cb: (url: string) => void) => () => void;
  onUpdateDownloaded: (cb: () => void) => () => void;
}

declare global {
  interface Window {
    desktop?: DesktopAPI;
  }
}
