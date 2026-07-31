# DESKTOP ARCHITECTURE MANUAL — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** Desktop Engineering  

---

## 1. ELECTRON SHELL ARCHITECTURE

The desktop client (`apps/desktop`) runs Electron 33, packaging the web interface into a native application shell.

---

## 2. MAIN & RENDERER BOUNDARIES

*   **Main Process**: Handles operating system commands, tray icons, global hotkeys, and native menus.
*   **Renderer Process**: Runs the React single page application inside an isolated sandbox.
*   **IPC Bridge**: Context-isolated preload scripts enable secure data sharing between React and native OS APIs.

---

## 3. NATIVE DESKTOP API INTEGRATIONS

*   **Filesystem Reads**: Direct access to ingest raw documents for local scanning.
*   **Menu Actions**: Native window frames and status bar icons.
*   **Local Notifications**: Triggers system alerts for camera events.
