import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
vi.mock("../config/demoData.js", async (orig) => {
  const actual = await (orig() as Promise<typeof import("../config/demoData.js")>);
  return { ...actual, demoDataEnabled: () => false };
});

const { EducationService } = await import("./education.service.js");

const ORG_A = "org-edu-a";
const ORG_B = "org-edu-b";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("Education — Session 159 completion", () => {
  it("does not seed catalog or skills when demo data is off", async () => {
    await EducationService.ensureBootstrapped(undefined, ORG_A);
    expect(await EducationService.listContent(ORG_A)).toEqual([]);
    expect(await EducationService.listSkills(ORG_A)).toEqual([]);
    expect(await EducationService.listAssessments(ORG_A)).toEqual([]);
  });

  it("dashboard does not seed on read; empty mastery is null not 0%", async () => {
    const d = await EducationService.dashboard(ORG_A);
    expect(d.totalContent).toBe(0);
    expect(d.activeLearners).toBe(0);
    expect(d.avgMasteryPct).toBeNull();
    expect(d.certificationsIssued).toBe(0);
    expect(d.hoursLearned30d).toBe(0);
    expect(d.provenance?.avgMasteryPct).toMatch(/not 0%/);
    expect(await EducationService.listContent(ORG_A)).toEqual([]);
  });

  it("createContent is org-scoped and starts unrated", async () => {
    const c = await EducationService.createContent(ORG_A, "u1", {
      title: "Prompt 101", kind: "lesson", durationMin: 25, difficulty: "beginner",
    });
    expect(c.rating).toBeNull();
    expect(c.enrollments).toBe(0);
    expect(c.completions).toBe(0);
    expect(c.status).toBe("draft");
    expect((await EducationService.listContent(ORG_A)).map((x) => x.id)).toEqual([c.id]);
    expect(await EducationService.listContent(ORG_B)).toEqual([]);
  });

  it("createSkill drives avgMasteryPct; empty org stays null", async () => {
    await EducationService.createSkill(ORG_A, { name: "RAG", category: "Data", level: 2, target: 5 });
    await EducationService.createSkill(ORG_A, { name: "Prompts", category: "AI Fundamentals", level: 4, target: 5 });
    const d = await EducationService.dashboard(ORG_A);
    // (2+4) / 10 * 100 = 60
    expect(d.avgMasteryPct).toBe(60);
    expect(d.skillCategories).toHaveLength(2);
    expect((await EducationService.dashboard(ORG_B)).avgMasteryPct).toBeNull();
    expect(await EducationService.listSkills(ORG_B)).toEqual([]);
  });

  it("assess increments completions on pass and counts unique learners", async () => {
    const c = await EducationService.createContent(ORG_A, "u1", {
      title: "Quiz", kind: "quiz", durationMin: 15, difficulty: "beginner",
    });
    await EducationService.assess(c.id, "u1", 80, 8, 10, 3600, ORG_A);
    await EducationService.assess(c.id, "u1", 40, 4, 10, 600, ORG_A);
    await EducationService.assess(c.id, "u2", 90, 9, 10, 1800, ORG_A);
    const listed = await EducationService.listContent(ORG_A);
    expect(listed[0]!.completions).toBe(2);
    const d = await EducationService.dashboard(ORG_A);
    expect(d.activeLearners).toBe(2);
    expect(d.completions30d).toBe(3);
    expect(d.hoursLearned30d).toBe(1.67);
    expect(d.certificationsIssued).toBe(0);
    expect(await EducationService.listAssessments(ORG_B)).toEqual([]);
  });

  it("certificationsIssued only counts passed certification_prep assessments", async () => {
    const cert = await EducationService.createContent(ORG_A, "u1", {
      title: "Cert prep", kind: "certification_prep", durationMin: 120, difficulty: "advanced",
    });
    const course = await EducationService.createContent(ORG_A, "u1", {
      title: "Course", kind: "course", durationMin: 60, difficulty: "beginner",
    });
    await EducationService.assess(cert.id, "u1", 85, 17, 20, 900, ORG_A);
    await EducationService.assess(cert.id, "u2", 50, 10, 20, 900, ORG_A);
    await EducationService.assess(course.id, "u1", 100, 10, 10, 300, ORG_A);
    const d = await EducationService.dashboard(ORG_A);
    expect(d.certificationsIssued).toBe(1);
  });

  it("startTutor and createPath are org-scoped and do not invent mastery", async () => {
    const t = await EducationService.startTutor("Intro to AI", "u1", ORG_A);
    expect(t.messages).toBe(0);
    expect(t.masteryDelta).toBeUndefined();
    const c = await EducationService.createContent(ORG_A, "u1", {
      title: "Lesson", kind: "lesson", durationMin: 20, difficulty: "beginner",
    });
    const p = await EducationService.createPath({
      title: "Path", goal: "Learn", contentIds: [c.id], userId: "u1", organizationId: ORG_A,
    });
    expect(p.progressPct).toBe(0);
    expect((await EducationService.listTutorSessions(ORG_A)).map((x) => x.id)).toEqual([t.id]);
    expect(await EducationService.listTutorSessions(ORG_B)).toEqual([]);
    expect(await EducationService.listPaths(ORG_B)).toEqual([]);
    const d = await EducationService.dashboard(ORG_A);
    expect(d.activeLearners).toBe(1);
    expect(d.activeTutorSessions).toBe(1);
    expect(d.pathsInProgress).toBe(1);
  });

  it("hoursLearned30d uses recorded time, not catalog duration × completions", async () => {
    const c = await EducationService.createContent(ORG_A, "u1", {
      title: "Long course", kind: "course", durationMin: 480, difficulty: "advanced",
    });
    await EducationService.assess(c.id, "u1", 80, 8, 10, 1800, ORG_A);
    const d = await EducationService.dashboard(ORG_A);
    // 1800s = 0.5h. The old formula would have been 480min × 1 completion / 60 = 8h.
    expect(d.hoursLearned30d).toBe(0.5);
    expect(d.hoursLearned30d).not.toBe(8);
  });
});
