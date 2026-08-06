#!/usr/bin/env node
/**
 * Prisma client preflight (developer-experience helper).
 *
 * Detects whether the generated Prisma client already exists. If it is missing
 * and generation is possible, runs `prisma generate` automatically so a fresh
 * clone can go straight to `pnpm install && pnpm test` without a manual
 * `prisma generate` step.
 *
 * NON-BLOCKING: if generation is unavailable (e.g. the engine download host is
 * unreachable / offline), this prints a clear message and exits 0 rather than
 * failing the build — the repo must still be usable in air-gapped/restricted
 * environments where the binary cannot be fetched. See scripts/prisma-generate-offline.sh
 * for the offline placeholder path on network-enabled machines.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = path.join(ROOT, "apps/api");
const CLIENT_DIR = path.join(API, "node_modules/.prisma/client");

function clientExists() {
  try {
    if (fs.existsSync(path.join(CLIENT_DIR, "index.js")) || fs.existsSync(path.join(CLIENT_DIR, "index.d.ts"))) {
      return true;
    }
    const pnpmDir = path.join(ROOT, "node_modules/.pnpm");
    if (fs.existsSync(pnpmDir)) {
      for (const entry of fs.readdirSync(pnpmDir)) {
        if (entry.startsWith("@prisma+client@")) {
          const p = path.join(pnpmDir, entry, "node_modules/.prisma/client");
          if (fs.existsSync(path.join(p, "index.js")) || fs.existsSync(path.join(p, "index.d.ts"))) {
            return true;
          }
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

if (clientExists()) {
  console.log("[prisma-preflight] Prisma client present — skipping generation.");
  process.exit(0);
}

// Skip the auto-generation attempt in environments where the engine download
// is known to be unreachable (e.g. air-gapped/restricted sandboxes), so the
// preflight does not stall the build. Set WINDELS_SKIP_PRISMA_GENERATE=1 to
// opt out; on a normal network-enabled host generation proceeds automatically.
if (process.env.WINDELS_SKIP_PRISMA_GENERATE === "1") {
  console.warn(
    "[prisma-preflight] Prisma client missing and auto-generation skipped (WINDELS_SKIP_PRISMA_GENERATE=1). " +
    "Run `pnpm db:generate` on a network-enabled host."
  );
  process.exit(0);
}

console.log("[prisma-preflight] Prisma client missing — attempting generation…");
try {
  execSync("pnpm --filter @windels/api exec prisma generate", { cwd: ROOT, stdio: "inherit" });
  console.log("[prisma-preflight] Prisma client generated successfully.");
} catch (e) {
  console.warn(
    "[prisma-preflight] Prisma generation could not run (likely offline / engine host unreachable). " +
    "This is non-blocking: run `pnpm db:generate` on a network-enabled host, or `pnpm db:generate:offline` where supported."
  );
  process.exit(0);
}
