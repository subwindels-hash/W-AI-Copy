/**
 * Global Playwright setup: ensure API is reachable and a test user exists.
 * If SKIP_API_START is set, we assume the API is already running (CI case).
 */
import { execSync, spawn } from "node:child_process";
import * as net from "node:net";

const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:4000/api/v1";

async function waitPort(port: number, host = "127.0.0.1", timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise<boolean>((resolve) => {
      const sock = net.createConnection({ host, port }, () => { sock.end(); resolve(true); });
      sock.on("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${host}:${port}`);
}

async function waitHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${API_BASE}/health`);
      const j = await r.json();
      if (j?.data?.status === "ok") return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("API not healthy");
}

async function globalSetup() {
  if (process.env.SKIP_API_START) {
    await waitHealth();
    return;
  }
  // Try to start API if not already running
  try {
    await fetch(`${API_BASE}/health`);
    return;
  } catch { /* not running — start it */ }

  const env = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://windels:windels@localhost:5432/windels",
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    JWT_SECRET: process.env.JWT_SECRET ?? "ci-secret-please-change-123456",
    NODE_ENV: "test",
    PORT: "4000",
  };
  spawn("node", ["apps/api/dist/index.js"], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    detached: true,
  });
  await waitPort(4000);
  await waitHealth();
}

export default globalSetup;
