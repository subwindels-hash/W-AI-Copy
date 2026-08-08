import { describe, it, expect, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

// In-memory Redis so the suite needs no live server. Hoisted before importing
// the service (lecturer.service resolves `redisCmd` at module load).
const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn() }));

// No AI provider in CI → fail fast so the lecturer takes the structured fallback.
vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: {
    // eslint-disable-next-line require-yield
    async *guardedStream() { throw new Error("no AI provider configured in test"); },
  },
}));

const { UniversityService } = await import("../education/university.service.js");
const { LecturerService } = await import("../education/lecturer.service.js");

const UID = "uni-test-" + Date.now();

describe("University Education (Lecturer AI teaching platform)", () => {
  it("exposes a university with many faculties and courses across all degree levels", () => {
    const ov = UniversityService.overview();
    expect(ov.facultiesCount).toBeGreaterThan(5);
    expect(ov.coursesCount).toBeGreaterThan(50);
    expect(ov.degreesOffered).toEqual(["bachelor", "master", "doctor"]);
    // Research work is present (a university does research).
    expect(ov.researchAreasCount).toBeGreaterThan(0);
    // Faculties cover the major disciplines.
    const names = ov.faculties.map((f) => f.name);
    expect(names.some((n) => /Engineering/i.test(n))).toBe(true);
    expect(names.some((n) => /Medicine|Health/i.test(n))).toBe(true);
    expect(names.some((n) => /Business/i.test(n))).toBe(true);
    expect(names.some((n) => /Law/i.test(n))).toBe(true);
  });

  it("catalog contains courses at bachelor, master and doctor levels", () => {
    const cat = UniversityService.catalog();
    const levels = new Set(cat.courses.map((c) => c.level));
    expect(levels).toEqual(new Set(["bachelor", "master", "doctor"]));
    // Every course has a code and a teaching topic.
    for (const c of cat.courses) {
      expect(c.code).toBeTruthy();
      expect(c.teachingTopic.length).toBeGreaterThan(10);
    }
  });

  it("searches courses by title, code and faculty", () => {
    expect(UniversityService.search("Ethical Hacking").length).toBeGreaterThan(0);
    expect(UniversityService.search("CSC").length).toBeGreaterThan(0);
    expect(UniversityService.search("engineering").length).toBeGreaterThan(0);
    expect(UniversityService.search("zzz-nothing")).toEqual([]);
  });

  it("lists courses per faculty with degree-level filtering", () => {
    const all = UniversityService.coursesByFaculty("computing");
    expect(all.length).toBeGreaterThan(0);
    const bachelors = UniversityService.coursesByFaculty("computing", "bachelor");
    expect(bachelors.length).toBeGreaterThan(0);
    expect(bachelors.every((c) => c.level === "bachelor")).toBe(true);
  });

  it("starts a Lecturer AI teaching session on a course (real delegate)", async () => {
    const { course, turn } = await UniversityService.startCourse(UID, "csc-401");
    expect(course.code).toBe("CSC401");
    expect(course.level).toBe("master");
    expect(turn.sessionId).toMatch(/^ls-/);
    expect(turn.question).toBeTruthy();
  });

  it("throws COURSE_NOT_FOUND for an unknown course", async () => {
    await expect(UniversityService.startCourse(UID, "no-such-course")).rejects.toThrow(/not found/);
  });

  it("builds a per-faculty degree plan and completes courses through the lecturer", async () => {
    // No plan for an unknown faculty.
    expect(await UniversityService.degreePlan(UID, "nope")).toBeNull();

    const plan = await UniversityService.degreePlan(UID, "computing");
    expect(plan!.facultyName).toMatch(/Computing/);
    expect(plan!.levels).toEqual(["bachelor", "master", "doctor"]);
    // Nothing started → exactly one next-recommended course.
    const next = plan!.courses.filter((n) => n.nextRecommended);
    expect(next.length).toBe(1);
    expect(next[0].level).toBe("bachelor");

    // Complete CSC101 (prerequisite for the next bachelor course) by answering
    // enough questions to reach mastery >= 85.
    const sid = (await UniversityService.startCourse(UID, "csc-101")).turn.sessionId;
    for (let i = 0; i < 12; i++) {
      await LecturerService.answer(UID, sid, 0, "");
    }
    const plan2 = await UniversityService.degreePlan(UID, "computing");
    const done = plan2!.courses.find((n) => n.courseId === "csc-101");
    expect(done!.completed).toBe(true);
    expect(plan2!.courses.filter((n) => n.nextRecommended).length).toBe(1);
  });
});
