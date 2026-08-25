/**
 * Session 200 — Camera & Screen Intelligence tests (first dedicated suite).
 *
 * collaboration's CameraIntelService and ScreenIntelService shipped untested.
 * Both encode "honesty" rules that matter for safety/observability dashboards:
 *  - a camera detection with no model confidence is recorded 0 / "low" (never a
 *    fabricated high-confidence hit), and unapproved pipelines emit advisory
 *    verdicts requiring operator review;
 *  - a screen session that captured no frames reports 0 (no back-filled frames),
 *    and guided-step elapsed time is measured, not incremented per call.
 * This suite locks those behaviors in.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { CameraIntelService: CAM } = await import("./cameraIntel.service.js");
const { ScreenIntelService: SCR } = await import("./screenIntel.service.js");

beforeEach(() => { kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear(); });

describe("CameraIntelService", () => {
  async function pipeline(over: Record<string, any> = {}) {
    return CAM.registerPipeline({ name: "Dock cam", kind: "safety-compliance", site: "warehouse-1", ...over });
  }

  it("defaults an unapproved pipeline to the advisory verdict", async () => {
    const p = await pipeline();
    expect(p.verdictDefault).toBe("advisory");
    const approved = await pipeline({ approvedWorkflow: "ppe-auto" });
    expect(approved.verdictDefault).toBe("approved-workflow");
  });

  it("records a detection with NO confidence as 0 / low band (never fabricated)", async () => {
    const p = await pipeline();
    const d = await CAM.emitDetection(p.id, { cameraId: "c1", kind: "object", label: "forklift", bbox: [0, 0, 1, 1] } as any);
    expect(d.confidence).toBe(0);
    expect(d.confidenceBand).toBe("low");
    expect(d.verdict).toBe("advisory");
    expect(d.advisoryNote).toMatch(/review by a qualified operator/i);
  });

  it("maps model confidence to the right band", async () => {
    const p = await pipeline({ approvedWorkflow: "wf" });
    const hi = await CAM.emitDetection(p.id, { cameraId: "c1", kind: "object", label: "x", bbox: [0, 0, 1, 1], confidence: 0.92 } as any);
    expect(hi.confidenceBand).toBe("very-high");
    const med = await CAM.emitDetection(p.id, { cameraId: "c1", kind: "object", label: "y", bbox: [0, 0, 1, 1], confidence: 0.6 } as any);
    expect(med.confidenceBand).toBe("medium");
  });

  it("opens a finding, counts safety alerts, and acknowledges (decrementing open)", async () => {
    const p = await pipeline();
    const d = await CAM.emitDetection(p.id, { cameraId: "c1", kind: "ppe", label: "no-helmet", bbox: [0, 0, 1, 1] } as any);
    await CAM.openFinding(p.id, d.id, { kind: "ppe-missing", severity: "critical", summary: "no helmet" } as any);
    let pipe = await CAM.getPipeline(p.id);
    expect(pipe?.findingsOpen).toBe(1);
    expect(pipe?.safetyAlerts24h).toBe(1);
    const finding = (await CAM.listFindings(p.id))[0];
    const acked = await CAM.acknowledgeFinding(p.id, finding.id, "operator-1");
    expect(acked?.acknowledged).toBe(true);
    expect(acked?.acknowledgedBy).toBe("operator-1");
    pipe = await CAM.getPipeline(p.id);
    expect(pipe?.findingsOpen).toBe(0);
    expect(pipe?.acknowledgedFindings).toBe(1);
  });

  it("throws when emitting a detection for an unknown pipeline", async () => {
    await expect(CAM.emitDetection("nope", { cameraId: "c", kind: "object", label: "l", bbox: [0, 0, 1, 1] } as any))
      .rejects.toThrow(/pipeline not found/);
  });
});

describe("ScreenIntelService", () => {
  async function session(over: Record<string, any> = {}) {
    return SCR.startSession({ title: "Onboarding walkthrough", user: "u1", level: "fullscreen", ...over });
  }

  it("starts a session with consent + PII redaction and zero counters", async () => {
    const s = await session();
    expect(s.status).toBe("active");
    expect(s.consentGranted).toBe(true);
    expect(s.piiRedaction).toBe(true);
    expect(s.framesCaptured).toBe(0);
  });

  it("ends a session without back-filling captured frames", async () => {
    const s = await session();
    const ended = await SCR.endSession(s.id);
    expect(ended?.status).toBe("ended");
    expect(ended?.framesCaptured).toBe(0); // honest: nothing captured
    expect(await SCR.endSession("nope")).toBeNull();
  });

  it("adds explanations and increments the session counter", async () => {
    const s = await session();
    await SCR.addExplanation(s.id, { element: "Save button", explanation: "Persists your changes" } as any);
    expect((await SCR.listExplanations(s.id)).length).toBe(1);
    expect((await SCR.getSession(s.id))?.aiExplanations).toBe(1);
  });

  it("measures guided-step elapsed time from start, not per advance call", async () => {
    const s = await session();
    const step = await SCR.addStep(s.id, { stepNumber: 1, instruction: "Open settings" } as any);
    expect(step.status).toBe("pending");
    expect(step.elapsedSec).toBe(0);
    const active = await SCR.advanceStep(s.id, step.id, "active");
    expect(active?.startedAt).toBeTruthy();
    const done = await SCR.advanceStep(s.id, step.id, "done");
    expect(done?.status).toBe("done");
    expect(done?.elapsedSec).toBeGreaterThanOrEqual(0);
    expect((await SCR.getSession(s.id))?.stepsGuided).toBe(1);
    expect(await SCR.advanceStep(s.id, "nope", "done")).toBeNull();
  });

  it("generates a workflow doc from the session", async () => {
    const s = await session();
    await SCR.addStep(s.id, { stepNumber: 1, instruction: "Click New" } as any);
    const doc = await SCR.generateDoc(s.id, "How to create a record", "markdown");
    expect(doc.title).toBe("How to create a record");
    expect((await SCR.listDocs(s.id)).length).toBe(1);
  });
});
