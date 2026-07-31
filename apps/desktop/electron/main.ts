/**
 * WINDELS AI OS — Desktop App main process.
 *
 * Session 16 slices:
 *  - 141 Authentication (deep-link windels://auth, persisted sessions)
 *  - 142 Dashboard (primary window)
 *  - 143 Chat (dedicated chat window)
 *  - 144 Workflow Builder (pop-out workflow editor)
 *  - 145 Canvas (floating/always-on-top canvas window)
 *  - 146 File System (native open/save dialogs, drag-drop)
 *  - 147 Notifications (native OS notifications via Electron)
 *  - 148 Multi-window (window manager, create/close/focus)
 *  - 149 Auto Update (electron-updater)
 *  - 150 Offline Cache (leverages PWA service worker + local storage)
 *  - 151 Native Integrations (deep links, tray, dock badge)
 *  - 152 Desktop packaging (electron-builder config)
 */
import { app, BrowserWindow, ipcMain, dialog, shell, Notification, Tray, Menu, nativeImage } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { autoUpdater } from "electron-updater";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const WEB_URL = process.env.WINDELS_WEB_URL || (isDev ? "http://localhost:5173" : `file://${path.join(__dirname, "../../web/dist/index.html")}`);

// Singleton lock (prevent multiple instances).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// ─── Window manager ───────────────────────────────────────────────────────
type WindelsWindow = BrowserWindow & { _windels?: { kind: WindowKind; id?: string } };
type WindowKind = "main" | "chat" | "workflow" | "canvas" | "settings" | "auth";
const windows = new Map<number, WindelsWindow>();
let mainWindow: WindelsWindow | null = null;
let tray: Tray | null = null;

function createWindow(kind: WindowKind, opts: Electron.BrowserWindowConstructorOptions = {}, query = ""): WindelsWindow {
  const preload = path.join(__dirname, "preload.js");
  const defaults: Electron.BrowserWindowConstructorOptions = {
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0A0F1A",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 16 } : undefined,
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
    ...opts,
  };
  const win = new BrowserWindow(defaults) as WindelsWindow;
  win._windels = { kind };

  const route = kindToRoute(kind);
  const url = isDev
    ? `${WEB_URL}${route}${query ? `?${query}` : ""}`
    : `${WEB_URL}#${route}${query ? `?${query}` : ""}`;
  win.loadURL(url);

  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in default browser
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("closed", () => windows.delete(win.id));
  windows.set(win.id, win);
  if (kind === "main") mainWindow = win;
  return win;
}

function kindToRoute(k: WindowKind): string {
  switch (k) {
    case "main": return "/d";
    case "chat": return "/d/chat";
    case "workflow": return "/d/workflow";
    case "canvas": return "/d/canvas";
    case "settings": return "/d/settings";
    case "auth": return "/auth/login";
  }
}

function showOrFocus(kind: WindowKind) {
  for (const w of windows.values()) {
    if (w._windels?.kind === kind) { w.show(); w.focus(); return w; }
  }
  const opts: Partial<Electron.BrowserWindowConstructorOptions> = {};
  if (kind === "chat") { opts.width = 480; opts.height = 720; opts.minWidth = 380; }
  if (kind === "canvas") { opts.width = 1440; opts.height = 900; }
  return createWindow(kind, opts);
}

// ─── App lifecycle ────────────────────────────────────────────────────────
app.whenReady().then(() => {
  registerIpc();
  buildTray();
  buildMenu();
  createWindow("main");

  // Deep link (windels://) handling — Slices 141 + 151
  if (process.defaultApp && process.argv.length >= 2) {
    handleDeepLink(process.argv[process.argv.length - 1]);
  }

  // Auto-updater (Slice 149) — only in packaged builds.
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    autoUpdater.on("update-downloaded", () => {
      for (const w of windows.values()) w.webContents.send("desktop:update-downloaded");
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow("main");
  });
});

app.on("second-instance", (_e, argv) => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  const deep = argv.find((a) => a.startsWith("windels://"));
  if (deep) handleDeepLink(deep);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ─── Deep links ───────────────────────────────────────────────────────────
if (process.defaultApp) {
  if (process.argv.length >= 2) app.setAsDefaultProtocolClient("windels", process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient("windels");
}

function handleDeepLink(url: string) {
  try {
    const u = new URL(url);
    const token = u.searchParams.get("token");
    const path = u.host + u.pathname;
    const win = mainWindow ?? createWindow("main");
    win.webContents.send("desktop:deep-link", { path, token, url: u.toString() });
    if (token) win.webContents.send("desktop:auth-token", token);
    win.show(); win.focus();
  } catch { /* ignore malformed */ }
}

app.on("open-url", (_e, url) => handleDeepLink(url));

// ─── Tray (Slice 151) ────────────────────────────────────────────────────
function buildTray() {
  // Create a minimal 16x16 "W" icon via nativeImage (solid blue) — avoids depending on binary asset.
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAh0lEQVQ4je2TMQ6AIBAE/0hFq4iBO1BF2aQI1hAIqxDX7w/8VQKJCp2ckm9zc/sBIuJ+AJXASJxAI2J6C+AWmC64Q0wAS4j4B6wYgK4g7gGwG8g3A2wAqxfANwFsBrAPYBMALYAXAJwA2ATACwDOAHAHYBPALgCMATAPQArAOACwBMAbgD4kQ4eQBdZ/g3cTt+S8AAAAASUVORK5CYII="
  );
  tray = new Tray(icon);
  tray.setToolTip("WINDELS AI OS");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open WINDELS", click: () => showOrFocus("main") },
    { label: "Open Chat", click: () => showOrFocus("chat") },
    { type: "separator" },
    { label: "Check for Updates…", click: () => autoUpdater.checkForUpdatesAndNotify() },
    { type: "separator" },
    { label: "Quit WINDELS AI OS", role: "quit" },
  ]));
  tray.on("click", () => showOrFocus("main"));
}

// ─── App menu (Slice 148/151) ────────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === "darwin";
  const template: any[] = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { label: "New Main Window", accelerator: "CmdOrCtrl+N", click: () => createWindow("main") },
        { label: "Chat Window", accelerator: "CmdOrCtrl+Shift+C", click: () => showOrFocus("chat") },
        { label: "Workflow Builder", accelerator: "CmdOrCtrl+Shift+W", click: () => showOrFocus("workflow") },
        { label: "Canvas", accelerator: "CmdOrCtrl+Shift+B", click: () => showOrFocus("canvas") },
        { type: "separator" },
        { role: "minimize" },
        { role: "close" },
      ],
    },
    { role: "help" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Dock badge (macOS) — Slice 147 Notifications
function setBadgeCount(n: number) {
  try {
    if (typeof (app as any).setBadgeCount === "function") {
      (app as any).setBadgeCount(n);
      return;
    }
  } catch { /* fall through */ }
  if (process.platform === "darwin") {
    try { app.dock.setBadge(n > 0 ? String(n) : ""); } catch { /* ignore */ }
  }
}

// ─── IPC handlers (slices 146/147/148/150) ──────────────────────────────
function registerIpc() {
  // Window management (Slice 148 Multi-window)
  ipcMain.handle("window:open", (_e, kind: WindowKind, opts?: any) => {
    const w = createWindow(kind, opts ?? {});
    return { id: w.id, kind };
  });
  ipcMain.handle("window:show", (_e, kind: WindowKind) => { showOrFocus(kind); return true; });
  ipcMain.handle("window:close", (e) => BrowserWindow.fromWebContents(e.sender)?.close());
  ipcMain.handle("window:minimize", (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.handle("window:toggle-maximize", (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return;
    w.isMaximized() ? w.unmaximize() : w.maximize();
  });
  ipcMain.handle("window:set-always-on-top", (e, flag: boolean, level?: "floating" | "normal") => {
    const w = BrowserWindow.fromWebContents(e.sender);
    w?.setAlwaysOnTop(!!flag, level === "floating" ? "floating" : "normal");
  });
  ipcMain.handle("window:broadcast", (_e, channel: string, payload: unknown) => {
    for (const w of windows.values()) w.webContents.send(channel, payload);
  });

  // File System (Slice 146) — native open/save dialogs
  ipcMain.handle("fs:open-dialog", async (_e, opts: Electron.OpenDialogOptions) => {
    const w = BrowserWindow.fromWebContents(_e.sender);
    const r = await dialog.showOpenDialog(w!, opts || { properties: ["openFile"] });
    if (r.canceled) return { canceled: true };
    const contents = await Promise.all(
      r.filePaths.map(async (p) => {
        try {
          const buf = await fs.readFile(p);
          return { path: p, name: path.basename(p), size: buf.byteLength, dataBase64: buf.toString("base64") };
        } catch { return null; }
      })
    );
    return { canceled: false, files: contents.filter(Boolean) };
  });
  ipcMain.handle("fs:save-dialog", async (_e, opts: Electron.SaveDialogOptions & { dataBase64?: string }) => {
    const w = BrowserWindow.fromWebContents(_e.sender);
    const { dataBase64, ...dialogOpts } = opts;
    const r = await dialog.showSaveDialog(w!, dialogOpts);
    if (r.canceled || !r.filePath) return { canceled: true };
    if (dataBase64) {
      const buf = Buffer.from(dataBase64, "base64");
      await fs.writeFile(r.filePath, buf);
    }
    return { canceled: false, path: r.filePath };
  });
  ipcMain.handle("fs:read-user-data", async (_e, relPath: string) => {
    const p = path.join(app.getPath("userData"), relPath);
    try {
      const buf = await fs.readFile(p);
      return { ok: true, dataBase64: buf.toString("base64") };
    } catch (e: any) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle("fs:write-user-data", async (_e, relPath: string, dataBase64: string) => {
    const p = path.join(app.getPath("userData"), relPath);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, Buffer.from(dataBase64, "base64"));
    return { ok: true, path: p };
  });

  // Notifications (Slice 147) — native OS notifications
  ipcMain.handle("notify:send", (_e, payload: { title: string; body?: string; silent?: boolean; url?: string }) => {
    if (!Notification.isSupported()) return { ok: false };
    const n = new Notification({ title: payload.title, body: payload.body, silent: !!payload.silent });
    n.on("click", () => {
      const w = mainWindow ?? createWindow("main");
      w.show(); w.focus();
      if (payload.url) w.webContents.send("desktop:navigate", payload.url);
    });
    n.show();
    return { ok: true };
  });
  ipcMain.handle("notify:set-badge", (_e, count: number) => { setBadgeCount(count); return true; });

  // App info
  ipcMain.handle("app:info", () => ({
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
    arch: process.arch,
    osVersion: os.release(),
    isPackaged: app.isPackaged,
    userDataPath: app.getPath("userData"),
    homePath: app.getPath("home"),
    documentsPath: app.getPath("documents"),
    downloadsPath: app.getPath("downloads"),
  }));

  // Auto-update (Slice 149)
  ipcMain.handle("updater:check", async () => {
    if (isDev) return { ok: true, dev: true };
    try {
      const r = await autoUpdater.checkForUpdatesAndNotify();
      return { ok: true, updateInfo: r?.updateInfo };
    } catch (e: any) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle("updater:install-and-restart", () => { autoUpdater.quitAndInstall(false, true); return true; });

  // Clipboard / native integrations (Slice 151)
  ipcMain.handle("native:open-external", (_e, target: string) => { shell.openExternal(target); return true; });
  ipcMain.handle("native:show-in-folder", (_e, p: string) => { shell.showItemInFolder(p); return true; });
  ipcMain.handle("native:relaunch", () => { app.relaunch(); app.exit(0); });
}
