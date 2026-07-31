/**
 * DEMO-DATA GUARD — enforces the no-fabricated-data rule at the source level.
 *
 * Every routed session module must be free of `Math.random()` in its service
 * code: dashboards either derive from real persisted records or use
 * deterministic seeds — never per-request random metrics presented as real.
 *
 * Allowlist (legitimate randomness, not demo data):
 *   - src/services/         bulk-generated AI-platform services (debt, unmounted)
 *   - tools/builtin         the user-facing "random" tool is a real feature
 *   - ai/echo.provider      latency jitter for the echo AI provider
 *   - observability         request-id hex generation
 *   - routes/camera         webrtc session token generation
 *   - projectIntake         pattern-match (detects Math.random IN source text)
 *   - tradingIntel/marketData  synthetic-candle noise (flagged synthetic)
 */
import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "src");
const ALLOWLIST = [
  path.join("services"),
  path.join("services", "tools", "builtin"),
  path.join("services", "ai", "echo.provider.ts"),
  path.join("http", "middleware", "observability.ts"),
  path.join("http", "routes", "camera.ts"),
  path.join("projectContinuity", "projectIntake.service.ts"),
  path.join("tradingIntel", "marketData.ts"),
];

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("no-fabricated-data guard (Math.random in session modules)", () => {
  it("finds zero Math.random usages outside the allowlist", async () => {
    const files = await walk(SRC);
    const offenders: string[] = [];
    for (const f of files) {
      const rel = path.relative(SRC, f);
      if (ALLOWLIST.some((a) => rel === a || rel.startsWith(a + path.sep))) continue;
      const text = await fs.readFile(f, "utf8");
      if (/Math\.random\s*\(/.test(text)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
