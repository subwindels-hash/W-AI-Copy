/**
 * Phase Voice-2 — Multi-Wake-Word Voice Activation tests.
 *
 * Verifies:
 *   - Voice activation config CRUD with defaults
 *   - Custom wake phrase add/remove
 *   - Wake phrase detection (exact, prefix, fuzzy)
 *   - Command extraction after wake phrase
 *   - Deactivation phrase detection
 *   - Voice session lifecycle
 *   - Voice activation logging
 *   - Voice center dashboard rollup
 *
 * WINDELS is an AI Operating System, not a broker.
 */
import { describe, it, expect } from "vitest";
import { WakeIntelligenceService as Wi } from "./wakeIntelligence.service.js";
import { redisCmd as redis } from "../db/redis.js";

const ORG = `voice-test-${Date.now()}`;
const USER = `user-voice-${Date.now()}`;

async function wipeVoiceKeys() {
  const keys = [
    `wi:voice-config:${ORG}`, `wi:voice-config:${ORG}:${USER}`,
    `wi:voice-profiles:${ORG}`, `wi:voice-sessions:${ORG}`,
    `wi:voice-logs:${ORG}`,
  ];
  for (const k of keys) {
    // Get members of sorted sets
    const members = await redis.zrange(k, 0, -1);
    for (const m of members) {
      // Delete hash items
      const pattern = `${k}:${m}`;
      await redis.del(pattern);
    }
    await redis.del(k);
  }
}

describe("Voice Activation — Config", () => {
  it("returns default config on first access", async () => {
    await wipeVoiceKeys();
    const cfg = await Wi.getVoiceConfig(ORG, USER);
    expect(cfg.enabled).toBe(true);
    expect(cfg.primaryWakePhrase).toBe("Hey Windels");
    expect(cfg.wakePhrases).toContain("Hey Windels");
    expect(cfg.wakePhrases).toContain("Windels");
    expect(cfg.wakePhrases.length).toBeGreaterThanOrEqual(16);
    expect(cfg.continuousConversation).toBe(true);
    expect(cfg.localProcessingOnly).toBe(true);
    expect(cfg.microphoneDisabled).toBe(false);
    expect(cfg.requireConfirmationForHighRisk).toBe(true);
  });

  it("persists and retrieves config changes", async () => {
    const cfg = await Wi.getVoiceConfig(ORG, USER);
    const updated = await Wi.updateVoiceConfig(ORG, USER, {
      activationResponse: "At your service.",
      continuousTimeoutSec: 45,
      minConfidence: 0.7,
    });
    expect(updated.activationResponse).toBe("At your service.");
    expect(updated.continuousTimeoutSec).toBe(45);
    expect(updated.minConfidence).toBe(0.7);

    // Verify persistence
    const reloaded = await Wi.getVoiceConfig(ORG, USER);
    expect(reloaded.activationResponse).toBe("At your service.");
  });

  it("can disable voice activation", async () => {
    const updated = await Wi.updateVoiceConfig(ORG, USER, { enabled: false });
    expect(updated.enabled).toBe(false);
    // Re-enable for other tests
    await Wi.updateVoiceConfig(ORG, USER, { enabled: true });
  });
});

describe("Voice Activation — Custom Wake Phrases", () => {
  it("adds and removes custom wake phrases", async () => {
    await wipeVoiceKeys();
    // Initialize config
    await Wi.getVoiceConfig(ORG, USER);

    const withCustom = await Wi.addCustomWakePhrase(ORG, USER, "Hey Assistant");
    expect(withCustom.customWakePhrases).toContain("Hey Assistant");
    expect(withCustom.wakePhrases).toContain("Hey Assistant");

    const withSecond = await Wi.addCustomWakePhrase(ORG, USER, "My Windels");
    expect(withSecond.customWakePhrases).toHaveLength(2);

    // Remove one
    const afterRemove = await Wi.removeCustomWakePhrase(ORG, USER, "Hey Assistant");
    expect(afterRemove.customWakePhrases).not.toContain("Hey Assistant");
    expect(afterRemove.customWakePhrases).toContain("My Windels");
  });

  it("rejects duplicate phrases", async () => {
    await Wi.getVoiceConfig(ORG, USER);
    await expect(Wi.addCustomWakePhrase(ORG, USER, "Hey Windels"))
      .rejects.toThrow("already exists");
  });

  it("ensures at least one phrase remains after removal", async () => {
    const cfg = await Wi.getVoiceConfig(ORG, USER);
    // Remove all custom phrases (built-ins remain)
    for (const p of [...cfg.customWakePhrases]) {
      await Wi.removeCustomWakePhrase(ORG, USER, p);
    }
    const final = await Wi.getVoiceConfig(ORG, USER);
    expect(final.wakePhrases.length).toBeGreaterThan(0);
  });
});

describe("Voice Activation — Wake Detection", () => {
  it("detects exact wake phrase", async () => {
    await Wi.getVoiceConfig(ORG, USER);
    const result = await Wi.detectWakePhrase(ORG, USER, "Hey Windels");
    expect(result.detected).toBe(true);
    expect(result.phrase).toBe("Hey Windels");
    expect(result.confidence).toBe(1.0);
  });

  it("detects wake phrase at start of command and extracts command", async () => {
    const result = await Wi.detectWakePhrase(ORG, USER, "Hey Windels, show me today's revenue");
    expect(result.detected).toBe(true);
    expect(result.phrase).toBe("Hey Windels");
    expect(result.confidence).toBe(0.95);
    expect(result.commandAfterWake).toBe("show me today's revenue");
  });

  it("detects 'Windels' alone as wake phrase", async () => {
    const result = await Wi.detectWakePhrase(ORG, USER, "Windels");
    expect(result.detected).toBe(true);
    expect(result.phrase).toBe("Windels");
  });

  it("detects 'Windels, activate'", async () => {
    const result = await Wi.detectWakePhrase(ORG, USER, "Windels, activate");
    expect(result.detected).toBe(true);
  });

  it("does not detect random text as wake phrase", async () => {
    const result = await Wi.detectWakePhrase(ORG, USER, "What time is it?");
    expect(result.detected).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("does not detect when voice activation is disabled", async () => {
    await Wi.updateVoiceConfig(ORG, USER, { enabled: false });
    const result = await Wi.detectWakePhrase(ORG, USER, "Hey Windels");
    expect(result.detected).toBe(false);
    await Wi.updateVoiceConfig(ORG, USER, { enabled: true });
  });

  it("does not detect when microphone is disabled", async () => {
    await Wi.updateVoiceConfig(ORG, USER, { microphoneDisabled: true });
    const result = await Wi.detectWakePhrase(ORG, USER, "Hey Windels");
    expect(result.detected).toBe(false);
    await Wi.updateVoiceConfig(ORG, USER, { microphoneDisabled: false });
  });
});

describe("Voice Activation — Deactivation Detection", () => {
  it("detects deactivation phrases", async () => {
    await Wi.getVoiceConfig(ORG, USER);
    expect(await Wi.detectDeactivation(ORG, USER, "Go to sleep, Windels.")).toBe(true);
    expect(await Wi.detectDeactivation(ORG, USER, "That's all, Windels.")).toBe(true);
    expect(await Wi.detectDeactivation(ORG, USER, "Goodbye, Windels.")).toBe(true);
  });

  it("does not detect non-deactivation phrases", async () => {
    expect(await Wi.detectDeactivation(ORG, USER, "Show me revenue")).toBe(false);
    expect(await Wi.detectDeactivation(ORG, USER, "Hey Windels")).toBe(false);
  });
});

describe("Voice Activation — Sessions", () => {
  it("starts and ends voice sessions", async () => {
    const session = await Wi.startVoiceSession(ORG, USER, "web-1", "Hey Windels", 0.95);
    expect(session.status).toBe("listening");
    expect(session.wakePhrase).toBe("Hey Windels");
    expect(session.continuousMode).toBe(true);

    const active = await Wi.listActiveSessions(ORG);
    expect(active).toHaveLength(1);

    await Wi.endVoiceSession(ORG, session.id, "Goodbye, Windels.");
    const afterEnd = await Wi.listActiveSessions(ORG);
    expect(afterEnd).toHaveLength(0);
  });
});

describe("Voice Activation — Logging", () => {
  it("logs and retrieves voice activations", async () => {
    const log = await Wi.logVoiceActivation({
      organizationId: ORG, userId: USER, deviceId: "web-1",
      wakePhrase: "Hey Windels", confidence: 0.95,
      commandText: "show me revenue", intentDetected: "navigation",
      outcome: "accepted", processingMode: "local", latencyMs: 120,
      timestamp: new Date().toISOString(),
    });
    expect(log.id).toBeTruthy();
    expect(log.wakePhrase).toBe("Hey Windels");

    const logs = await Wi.listVoiceLogs(ORG, 10);
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].wakePhrase).toBe("Hey Windels");
  });
});

describe("Voice Activation — Dashboard", () => {
  it("returns voice center dashboard rollup", async () => {
    const dash = await Wi.voiceCenterDashboard(ORG, USER);
    expect(dash.voiceActivationEnabled).toBe(true);
    expect(dash.primaryWakePhrase).toBe("Hey Windels");
    expect(dash.totalWakePhrases).toBeGreaterThanOrEqual(16);
    expect(dash.microphoneStatus).toBe("enabled");
    expect(dash.localProcessingOnly).toBe(true);
    expect(dash.recentActivations.length).toBeGreaterThanOrEqual(1);
  });
});
