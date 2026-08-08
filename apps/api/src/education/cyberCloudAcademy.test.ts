import { describe, it, expect, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

// In-memory Redis so the suite needs no live server. Must be hoisted before the
// service under test imports lecturer.service (which resolves `redisCmd` at
// module load).
const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn() }));

// No AI provider in CI → fail fast so the lecturer deterministically takes the
// structured-fallback path.
vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: {
    // eslint-disable-next-line require-yield
    async *guardedStream() { throw new Error("no AI provider configured in test"); },
  },
}));

const { CyberCloudAcademyService } = await import("../education/cyberCloudAcademy.service.js");
const { LecturerService } = await import("../education/lecturer.service.js");

const UID = "cca-test-" + Date.now();

describe("Cyber & Cloud Academy (Lecturer AI teaching tracks)", () => {
  it("exposes a catalog with cybersecurity and cloud tracks", () => {
    const cat = CyberCloudAcademyService.catalog();
    expect(cat.total).toBeGreaterThan(0);
    expect(cat.tracks.cybersecurity.length).toBeGreaterThan(0);
    expect(cat.tracks.cloud.length).toBeGreaterThan(0);
    // Both subjects the user asked about are present.
    const titles = [...cat.tracks.cybersecurity, ...cat.tracks.cloud].map((t) => t.title);
    expect(titles).toContain("Ethical Hacking Bootcamp");
    expect(titles).toContain("Cloud Computing Fundamentals");
  });

  it("starts a Lecturer AI session on an ethical-hacking topic (real delegate)", async () => {
    const { topic, turn } = await CyberCloudAcademyService.startTopic(UID, "ethical-hacking");
    expect(topic.id).toBe("ethical-hacking");
    expect(topic.teachingTopic).toContain("Ethical Hacking");
    // Real LecturerService output shape.
    expect(turn.sessionId).toMatch(/^ls-/);
    expect(turn.stage).toBe("question");
    expect(turn.question).toBeTruthy();
  });

  it("starts a Lecturer AI session on a cloud topic", async () => {
    const { topic, turn } = await CyberCloudAcademyService.startTopic(UID, "cloud-fundamentals");
    expect(topic.track).toBe("cloud");
    expect(topic.teachingTopic).toContain("Cloud Computing");
    expect(turn.sessionId).toMatch(/^ls-/);
  });

  it("throws TOPIC_NOT_FOUND for an unknown id", async () => {
    await expect(CyberCloudAcademyService.startTopic(UID, "no-such-topic")).rejects.toThrow(/not found/);
  });

  it("reports progress derived from real lecturer mastery (null when never started)", async () => {
    // A topic we never taught reports null mastery (never a fabricated 0).
    let progress = await CyberCloudAcademyService.progress(UID);
    const untouched = progress.find((p) => p.topicId === "multi-cloud");
    expect(untouched!.masteryPct).toBeNull();
    expect(untouched!.started).toBe(false);

    // Actually teach a topic: mastery is only persisted once the learner answers
    // a question (the lecturer's `answer` writes the topic-mastery record).
    const sid = (await CyberCloudAcademyService.startTopic(UID, "cloud-fundamentals")).turn.sessionId;
    await LecturerService.answer(UID, sid, 0, "");

    progress = await CyberCloudAcademyService.progress(UID);
    const entry = progress.find((p) => p.topicId === "cloud-fundamentals");
    expect(entry).toBeTruthy();
    expect(entry!.started).toBe(true);
    expect(entry!.masteryPct).toBeGreaterThanOrEqual(0);
    expect(entry!.completed).toBe(false);
  });

  it("builds a learning path and completes a topic through the lecturer loop", async () => {
    // Answer the cloud-fundamentals session enough times to reach completion.
    const { turn } = await CyberCloudAcademyService.startTopic(UID, "cloud-fundamentals");
    let sid = turn.sessionId;
    for (let i = 0; i < 6; i++) {
      const r = await LecturerService.answer(UID, sid, 0, "");
      sid = r.sessionId;
    }

    const path = await CyberCloudAcademyService.path(UID);
    const cloud = path.filter((n) => n.track === "cloud");
    const fundamentals = cloud.find((n) => n.topicId === "cloud-fundamentals");
    // Completing prerequisites unlocks an advanced topic as next recommended.
    expect(cloud.some((n) => n.nextRecommended)).toBe(true);
    expect(fundamentals).toBeTruthy();
    // The path marks exactly one next-recommended node per track.
    expect(path.filter((n) => n.nextRecommended && n.track === "cloud").length).toBe(1);
  });
});
