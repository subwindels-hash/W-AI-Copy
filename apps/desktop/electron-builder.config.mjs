/**
 * electron-builder config (Slice 152 — Desktop packaging).
 * Produces platform-appropriate bundles: macOS .dmg, Windows .exe (NSIS), Linux .AppImage + .deb.
 */
export default {
  appId: "ai.windels.desktop",
  productName: "WINDELS AI OS",
  directories: {
    output: "release",
    buildResources: "resources",
  },
  files: [
    "dist/**/*",
    "package.json",
  ],
  // PC/SC includes a native Node addon and must remain outside app.asar.
  asarUnpack: ["**/node_modules/@pokusew/pcsclite/**/*"],
  extraResources: [
    { from: "../web/dist", to: "web", filter: ["**/*"] },
  ],
  mac: {
    category: "public.app-category.productivity",
    target: ["dmg", "zip"],
    icon: "resources/icon.icns",
    hardenedRuntime: true,
    entitlements: "resources/entitlements.mac.plist",
    darkModeSupport: true,
  },
  win: {
    target: ["nsis"],
    icon: "resources/icon.ico",
  },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true },
  linux: {
    target: ["AppImage", "deb"],
    category: "Office;Productivity;",
    icon: "resources/icons",
  },
  protocols: [{ name: "WINDELS AI OS", schemes: ["windels"] }],
  publish: { provider: "github", releaseType: "release" },
};
