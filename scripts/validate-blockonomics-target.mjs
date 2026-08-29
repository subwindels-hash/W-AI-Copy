#!/usr/bin/env node
/**
 * Non-destructive Blockonomics target-runtime preflight.
 *
 * This command never allocates an address, creates a payment, invokes a
 * callback, or prints a credential. It checks only configuration posture,
 * database/cache TCP reachability, public quote reachability, and authenticated
 * read-only provider history. Full Stage 15 acceptance remains manual/operational.
 */
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";

// Keep the script dependency-free at the repository root. Process environment
// wins; local deployment files are read only when present.
for (const file of [".env.server", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });
const present = (name) => typeof process.env[name] === "string" && process.env[name].trim().length > 0;
const bool = (name) => process.env[name]?.trim().toLowerCase() === "true";

function endpoint(value) {
  try {
    const url = new URL(value);
    return { host: url.hostname, port: Number(url.port || (url.protocol === "redis:" || url.protocol === "rediss:" ? 6379 : 5432)) };
  } catch {
    return null;
  }
}

function tcp(name, target) {
  return new Promise((resolve) => {
    if (!target) {
      add(name, false, "URL is missing or invalid");
      return resolve();
    }
    const socket = net.createConnection(target);
    const finish = (ok, detail) => {
      socket.removeAllListeners();
      socket.destroy();
      add(name, ok, detail);
      resolve();
    };
    socket.setTimeout(5000);
    socket.once("connect", () => finish(true, `reachable at ${target.host}:${target.port}`));
    socket.once("timeout", () => finish(false, `timeout reaching ${target.host}:${target.port}`));
    socket.once("error", (error) => finish(false, `${error.code ?? "NETWORK_ERROR"} reaching ${target.host}:${target.port}`));
  });
}

async function providerRequest(name, path, authenticated = false) {
  const headers = { accept: "application/json" };
  if (authenticated) {
    const key = process.env.BLOCKONOMICS_API_KEY?.trim();
    if (!key) {
      add(name, false, "API key is not configured");
      return;
    }
    headers.authorization = `Bearer ${key}`;
  }
  const started = Date.now();
  try {
    const response = await fetch(new URL(path, "https://www.blockonomics.co/api/"), {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) {
      add(name, false, `provider returned HTTP ${response.status} in ${Date.now() - started}ms`);
      return;
    }
    if (path.startsWith("price?")) {
      const price = Number(body?.price);
      add(name, Number.isFinite(price) && price > 0, `HTTP ${response.status}; positive numeric price=${Number.isFinite(price) && price > 0}; ${Date.now() - started}ms`);
      return;
    }
    add(name, Array.isArray(body?.data), `HTTP ${response.status}; payment history array=${Array.isArray(body?.data)}; ${Date.now() - started}ms`);
  } catch (error) {
    add(name, false, `${error.cause?.code ?? error.name ?? "NETWORK_ERROR"}: ${error.cause?.message ?? error.message}`);
  }
}

const required = [
  "DATABASE_URL",
  "REDIS_URL",
  "WINDELS_ENCRYPTION_KEY",
  "BLOCKONOMICS_API_KEY",
  "BLOCKONOMICS_CALLBACK_SECRET",
  "BLOCKONOMICS_MATCH_CALLBACK",
];
for (const name of required) add(`config:${name}`, present(name), present(name) ? "configured" : "missing");
add("config:WINDELS_ENCRYPTION_KEY_FORMAT", /^[0-9a-fA-F]{64}$/.test(process.env.WINDELS_ENCRYPTION_KEY ?? ""), "must be exactly 64 hexadecimal characters");
add("config:BLOCKONOMICS_CALLBACK_SECRET_STRENGTH", (process.env.BLOCKONOMICS_CALLBACK_SECRET?.trim().length ?? 0) >= 32, "must contain at least 32 characters");
add("config:BLOCKONOMICS_ENABLED", bool("BLOCKONOMICS_ENABLED"), bool("BLOCKONOMICS_ENABLED") ? "enabled" : "not enabled");
add("config:BLOCKONOMICS_TEST_MODE", bool("BLOCKONOMICS_TEST_MODE"), bool("BLOCKONOMICS_TEST_MODE") ? "WINDELS Test Mode enabled" : "WINDELS Test Mode is not enabled");

await Promise.all([
  tcp("network:postgresql", endpoint(process.env.DATABASE_URL ?? "")),
  tcp("network:redis", endpoint(process.env.REDIS_URL ?? "")),
  providerRequest("provider:BTC_USD_PRICE", "price?crypto=BTC&currency=USD"),
  providerRequest("provider:USDT_USD_PRICE", "price?crypto=USDT&currency=USD"),
  providerRequest("provider:AUTHENTICATED_HISTORY", "v2/payments?limit=1&timeframe=1W", true),
]);

console.log(JSON.stringify({
  validator: "blockonomics-target-preflight",
  destructive: false,
  passed: checks.every((check) => check.ok),
  checks,
  next: "After this preflight passes, execute the real migration/callback/settlement/browser checklist in docs/BLOCKONOMICS_API_SETUP_DEPLOYMENT.md#15-stage-15-target-runtime-acceptance-checklist",
}, null, 2));

if (checks.some((check) => !check.ok)) process.exitCode = 1;
