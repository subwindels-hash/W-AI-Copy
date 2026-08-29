/**
 * FAKE-VERDICT GUARD — the successor to noRandomData.guard.test.ts.
 *
 * WHY THIS EXISTS
 * ---------------
 * `noRandomData.guard.test.ts` enforces "no Math.random in dashboards". That
 * closed one failure mode, but the more damaging one turned out to be
 * different and kept recurring across this codebase:
 *
 *   **code that reports an outcome for work it never performed.**
 *
 * Every instance found so far was individually plausible and individually
 * caught only by a human reading the file:
 *
 *   - `composer.run()` marked runs "succeeded" on trigger, having executed
 *     nothing, and fed that into successRate.
 *   - `expertsPlatform.query()` returned "[expert response placeholder …]" as
 *     healthcare/legal guidance and counted it as a served query.
 *   - `toolkit.runTests()` / `deploy()` invented pass counts and a log
 *     transcript for runs that never happened.
 *   - `drTest` slept, invented a snapshot size, hardcoded `rpoMs`, and
 *     reported the drill "passed" against the caller's SLA thresholds.
 *
 * Finding these one at a time does not scale, and each fix is one careless
 * edit away from returning. This guard turns the pattern into a build failure:
 * a source file may not pair a *simulation marker* (a sleep whose comment says
 * "simulate", or a returned placeholder string) with a *success claim* in the
 * same function-sized window.
 *
 * It is deliberately narrow. It does not try to prove code does real work —
 * that is what the per-module tests are for. It only catches the specific
 * shape that has now bitten this repo four times.
 */
import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "src");

/**
 * Excluded from the sweep:
 *   - `services/`      bulk-generated scaffolds, excluded from the build gate
 *                      (tsconfig.orphans.json) and unreachable from index.ts
 *   - `*.test.ts`      tests legitimately describe the patterns they assert on
 *   - `testUtils/`     fakes exist precisely to stand in for real systems
 *   - `config/demoData.ts` the opt-in demo-seed gate itself
 */
const EXCLUDED_DIRS = [
  path.join("services"),
  path.join("testUtils"),
  path.join("mediaFactory", "publishing", "fakeKv.ts"),
];

/** Text that marks deliberately fabricated output. */
const SIMULATION_MARKERS = [
  /\/\/[^\n]*\bsimulate\b/i,          // "// simulate backup"
  /\bplaceholder\b[^\n]*["'`]/i,       // a placeholder string literal
  /\blorem ipsum\b/i,
  /\bfake (?:data|result|response)\b/i,
  /\bmock (?:data|result|response)\b/i,
];

/** Text that claims a successful outcome. */
const SUCCESS_CLAIMS = [
  /status\s*[:=]\s*["'`](?:succeeded|passed|completed|healthy)["'`]/,
  /\bsuccess\s*=\s*true\b/,
  /\bok\s*:\s*true\b/,
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

/**
 * Scan a file in overlapping windows so a marker and a claim only count when
 * they are close enough to plausibly belong to the same operation. A file that
 * simulates something in one function and legitimately reports success in
 * another, far away, is not flagged.
 */
const WINDOW_LINES = 12;

function findOffences(text: string): Array<{ line: number; marker: string; claim: string }> {
  const lines = text.split("\n");
  const hits: Array<{ line: number; marker: string; claim: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const marker = SIMULATION_MARKERS.find((re) => re.test(lines[i]!));
    if (!marker) continue;

    const window = lines.slice(i, Math.min(lines.length, i + WINDOW_LINES)).join("\n");
    const claim = SUCCESS_CLAIMS.find((re) => re.test(window));
    if (claim) {
      hits.push({ line: i + 1, marker: String(marker), claim: String(claim) });
    }
  }
  return hits;
}

describe("no-fake-verdict guard (simulated work reported as a real outcome)", () => {
  it("finds no source file claiming success next to a simulation marker", async () => {
    const files = await walk(SRC);
    const offences: string[] = [];

    for (const f of files) {
      const rel = path.relative(SRC, f);
      if (EXCLUDED_DIRS.some((d) => rel === d || rel.startsWith(d + path.sep))) continue;

      const text = await fs.readFile(f, "utf8");
      for (const hit of findOffences(text)) {
        offences.push(`${rel}:${hit.line} — simulation marker ${hit.marker} within ${WINDOW_LINES} lines of ${hit.claim}`);
      }
    }

    expect(
      offences,
      offences.length
        ? "Simulated work must not be reported as a real outcome. Either perform the " +
          "work, or report it honestly (see qa/drTest.service.ts 'DR_SCENARIO_NOT_IMPLEMENTED' " +
          "and composer.run()'s 'queued' status for the accepted patterns).\n" +
          offences.join("\n")
        : undefined,
    ).toEqual([]);
  });

  /**
   * Proves the guard can actually fail. A guard that cannot detect its own
   * target is worse than no guard, because it reads as assurance.
   */
  it("detects the pattern it exists to prevent", () => {
    const bad = [
      "async function runDrill() {",
      "  await sleep(200); // simulate backup",
      "  const bytes = 5_000_000;",
      '  return { status: "passed", bytes };',
      "}",
    ].join("\n");
    expect(findOffences(bad).length).toBeGreaterThan(0);
  });

  it("does not flag an honest not-performed report", () => {
    // The shape drTest now uses: the word appears in a message explaining that
    // nothing ran, and the verdict is false.
    const good = [
      "async function runDrill() {",
      '  res.logs.push("backup-restore: not performed — no integration configured");',
      '  res.assertions.push(assertion("success", "drill completed", false));',
      '  res.error = { code: "DR_SCENARIO_NOT_IMPLEMENTED", message: "no drill was performed" };',
      "}",
    ].join("\n");
    expect(findOffences(good)).toEqual([]);
  });

  it("does not flag success reported far from an unrelated simulation", () => {
    const spaced = [
      "function a() {",
      "  await sleep(10); // simulate latency",
      "}",
      ...Array.from({ length: 20 }, () => "// filler"),
      "function b() {",
      '  return { status: "passed" };',
      "}",
    ].join("\n");
    expect(findOffences(spaced)).toEqual([]);
  });
});
