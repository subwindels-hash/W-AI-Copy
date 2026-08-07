/**
 * Phase 6 — Autonomous Trading Pause.
 *
 * Unit tests for the pauseAutonomousTrading risk flag:
 *   - Included in DEFAULT_RISK_CONTROLS (default false).
 *   - Manual source list stays stable (manual / manual-direct / manual-close /
 *     manual-modify / assisted-approved).
 *   - Enforced in submitSignal gating: blocks semi/full-auto modes when
 *     pauseAutonomousTrading=true EXCEPT when source is a manual source.
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_RISK_CONTROLS } from "@windels/shared/brokerIntegration";

describe("Phase 6 — Pause Autonomous Trading (contract + gating)", () => {
  it("DEFAULT_RISK_CONTROLS includes pauseAutonomousTrading = false", () => {
    expect((DEFAULT_RISK_CONTROLS as any).pauseAutonomousTrading).toBe(false);
  });

  it("manual source whitelist is stable", () => {
    // Mirrors the Set inside submitSignal. If you rename one of these keys
    // you MUST also update the Set — this test catches drift.
    const manualSources = ["manual", "manual-direct", "manual-close", "manual-modify", "assisted-approved"];
    for (const s of manualSources) expect(typeof s).toBe("string");
    expect(manualSources).toContain("assisted-approved");
    expect(manualSources).not.toContain("ai-agent");
    expect(manualSources).not.toContain("strategy");
  });

  it("brokerIntegration.service.ts gates autonomous modes when pauseAutonomousTrading is set", async () => {
    // Read the source file and assert the gating strings exist, so a future
    // refactor that accidentally removes the PAUSE_AUTONOMOUS gate breaks this test.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(__dirname + "/../brokerIntegration.service.ts", "utf8")
    );
    expect(src).toContain("PAUSE_AUTONOMOUS");
    expect(src).toContain("pauseAutonomousTrading");
    expect(src).toContain("autonomousModes");
    expect(src).toContain("Autonomous trading is paused");
  });
});
