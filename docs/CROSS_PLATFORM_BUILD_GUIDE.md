# CROSS-PLATFORM BUILD, SIGNING, & DEPLOYMENT GUIDE — WINDELS AI OS

**Date:** 2026-07-28  
**Scope:** Sessions 1–88 Cross-Platform Compilation (Desktop & Mobile)  
**Workspace Path:** `/home/user/windels`  

WINDELS AI OS leverages a high-performance, single-codebase architecture to deliver native experiences across Desktop (Windows, macOS) and Mobile (iOS, Android) platforms with 100% feature parity.

---

## 1. DESKTOP BUILDS (macOS & WINDOWS)

The desktop shell (`apps/desktop/`) uses Electron to wrap the compiled React 19 frontend (`apps/web/`) and exposes native-OS integrations (file dialogs, system tray, and deep linking) through context-isolated IPC tunnels.

### 1.1 Prerequisites
Before building for desktop, ensure you compile the shared package and the React frontend:
```bash
# 1. Compile shared types
pnpm --filter @windels/shared build

# 2. Bundle the frontend assets
pnpm --filter @windels/web build

# 3. Compile the Electron Main/Preload TypeScript scripts
pnpm --filter @windels/desktop build
```

### 1.2 Windows NSIS Installer (.exe)
To package and compile the Windows executable:
1.  **Build Command**:
    ```bash
    pnpm --filter @windels/desktop exec electron-builder --win nsis
    ```
2.  **Output**: Generates a portable, multi-window NSIS installer inside `apps/desktop/release/WINDELS-AI-OS-Setup-0.16.0.exe`.
3.  **Code-Signing (Windows)**:
    To prevent Windows SmartScreen security blocks, sign your executable by adding a `win` block in `electron-builder.config.mjs` pointing to your PFX certificate:
    ```json
    win: {
      "certificateFile": "certs/windows-signing.pfx",
      "certificatePassword": "YOUR_SECRET_PASSWORD"
    }
    ```

### 1.3 macOS DMG Installer (.dmg / .app)
To package, sign, and notarize your macOS build:
1.  **Build Command**:
    ```bash
    pnpm --filter @windels/desktop exec electron-builder --mac dmg
    ```
2.  **Output**: Generates a disk image `.dmg` installer inside `apps/desktop/release/WINDELS-AI-OS-0.16.0.dmg`.
3.  **App Store & Notarization (macOS)**:
    Apple requires all distributed apps to be notarized using `xcrun notarytool`. Configure your environment variables before building:
    ```bash
    export APPLE_ID="developer@company.com"
    export APPLE_ID_PASSWORD="YOUR_APP_SPECIFIC_PASSWORD"
    export APPLE_TEAM_ID="YOUR_APPLE_TEAM_ID"
    ```
    `electron-builder` will automatically capture these credentials, sign the binary with your Developer ID certificate, and submit the DMG to Apple's notarization servers.

---

## 2. MOBILE BUILDS (iOS & ANDROID PWA)

Mobile targets utilize a responsive, service-worker cached **Progressive Web App (PWA)** shell to provide native-level fluidity and biometrics support while sharing the core platform's database, Redis cache, and AI events.

### 2.1 Progressive Web App Capabilities (Verified)
Our mobile view shell (`apps/web/src/app/mobile/MobileShell.tsx`) and manifest are optimized for portrait viewport constraints:
*   **WebAuthn Biometrics**: Wired directly inside `apps/api/src/services/mobileAuth.service.ts` to log users in using native iOS FaceID or Android Fingerprint sensors.
*   **Offline Support**: Service worker registers offline caching rules inside `apps/web/src/lib/mobile/offlineQueue.ts`, queuing actions and syncing when connectivity is restored.
*   **Native Splash & Shortcuts**: System registers home-screen shortcuts instandalone mode (concealing browser address bars).

### 2.2 Bundling and Installing on iOS Devices
1.  **Host Compilation**: Run the frontend production build on your build host:
    ```bash
    pnpm --filter @windels/web build
    ```
2.  **Provisioning & Launch**:
    *   Deploy the static assets under `apps/web/dist/` to an SSL/HTTPS server (e.g. Nginx).
    *   Open `https://app.windels.ai/mobile` on Safari on an iPhone/iPad.
    *   Click **Share** → **Add to Home Screen**.
    *   The app will install as a native standalone application icon on your iOS home screen.

### 2.3 Bundling and Installing on Android Devices
1.  **Host Compilation**: Build and deploy the web bundle to your production URL.
2.  **Provisioning & Launch**:
    *   Open `https://app.windels.ai/mobile` on Google Chrome on an Android phone.
    *   A native browser banner prompt will display: **"Add WINDELS AI OS to Home Screen"**.
    *   Confirm installation; the package manager will install the PWA as an integrated, standalone app running fluidly alongside other native Android apps.
