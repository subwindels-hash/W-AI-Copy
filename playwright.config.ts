/**
 * WINDELS AI OS — Playwright end-to-end tests (Session 17).
 *
 * Run against Vite preview of production build (CI), or dev server:
 *   BASE_URL=http://localhost:5173 API_BASE_URL=http://localhost:4000/api/v1 pnpm exec playwright test
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.WEB_PORT ?? 4173);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const API_BASE = process.env.API_BASE_URL ?? `http://127.0.0.1:4000/api/v1`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html", { open: "never", outputFolder: "tests/reports/playwright" }], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    extraHTTPHeaders: { "x-e2e": "1" },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(process.env.CI ? [] : [
      { name: "firefox", use: { ...devices["Desktop Firefox"] } },
      { name: "webkit", use: { ...devices["Desktop Safari"] } },
    ]),
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
  ],
  webServer: process.env.SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: "cd apps/web && npx vite preview --host 127.0.0.1 --port 4173",
          port: 4173,
          timeout: 60_000,
          reuseExistingServer: !process.env.CI,
          cwd: __dirname,
        },
      ],
  globalSetup: require.resolve("./tests/e2e/global-setup.ts"),
});
export { API_BASE };
