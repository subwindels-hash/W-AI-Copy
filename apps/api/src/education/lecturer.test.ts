import { describe, it, expect, beforeAll } from "vitest";
import { LecturerService } from "../education/lecturer.service.js";

// Use a unique pseudo userId to avoid collisions across runs.
const UID = "lecturer-test-" + Date.now();

describe("lecturer adaptive tutor", () => {
  beforeAll(async () => {
    // Ensure service is importable; no bootstrap needed (Redis is running).
  });

  it("starts a session, returns a question, and tracks mastery across answers", async () => {
    const start = await LecturerService.start(UID, "Supply and Demand", "beginner");
    expect(start.sessionId).toMatch(/^ls-/);
    expect(start.stage).toBe("question");
    expect(start.masteryPct).toBeGreaterThanOrEqual(0);
    expect(start.question).toBeTruthy();
    expect(start.question!.choices).toHaveLength(4);

    // Answer correctly (index 0 is always the first choice, which for fallback is "A definition...").
    const after1 = await LecturerService.answer(UID, start.sessionId, 0, "Definitions matter.");
    expect(["question","complete"]).toContain(after1.responseType);
    expect(after1.masteryPct).toBeGreaterThan(0);

    // Answer incorrectly (random wrong index)
    const after2 = await LecturerService.answer(UID, start.sessionId, 2, "");
    expect(typeof after2.masteryPct).toBe("number");

    // Ask follow-up
    const ask = await LecturerService.ask(UID, start.sessionId, "Give me an example.", "examples");
    expect(ask.text.length).toBeGreaterThan(10);

    // Session retrieval
    const s = await LecturerService.getSession(UID, start.sessionId);
    expect(s).not.toBeNull();
    expect(s!.questionsAsked).toBeGreaterThanOrEqual(2);
  }, 30_000);
});
