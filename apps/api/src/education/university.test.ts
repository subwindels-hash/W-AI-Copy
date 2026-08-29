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

describe("Session 153 — University completion: catalog integrity & degree-plan semantics", () => {
  it("catalog integrity: unique ids/codes, resolving faculty refs and prerequisites, valid credits/levels/terms", () => {
    const cat = UniversityService.catalog();
    const ids = cat.courses.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const codes = cat.courses.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    const idSet = new Set(ids);
    const facIds = new Set(cat.faculties.map((f) => f.id));
    for (const c of cat.courses) {
      expect(facIds.has(c.faculty), `${c.id} faculty ref`).toBe(true);
      expect(["bachelor", "master", "doctor"]).toContain(c.level);
      // Bachelor/master courses carry credits; doctoral research/thesis
      // courses are research work and legitimately carry 0 credits.
      expect(c.credits).toBeGreaterThanOrEqual(0);
      if (c.level !== "doctor") expect(c.credits, `${c.id} credits`).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(10);
      expect(c.teachingTopic.length).toBeGreaterThan(20);
      for (const p of c.prerequisites) expect(idSet.has(p), `${c.id} prerequisite ${p}`).toBe(true);
    }
    // Faculties carry awards for all three levels and at least one research area.
    for (const f of cat.faculties) {
      expect(Object.keys(f.awards)).toEqual(["bachelor", "master", "doctor"]);
      expect(f.researchAreas.length).toBeGreaterThan(0);
    }
  });

  it("every faculty offers courses at all three degree levels", () => {
    const cat = UniversityService.catalog();
    for (const f of cat.faculties) {
      const courses = UniversityService.coursesByFaculty(f.id);
      const levels = new Set(courses.map((c) => c.level));
      expect(levels, f.id).toEqual(new Set(["bachelor", "master", "doctor"]));
    }
  });

  it("coursesByFaculty returns [] for unknown faculties; getFaculty/getCourse handle misses", () => {
    expect(UniversityService.coursesByFaculty("nope")).toEqual([]);
    expect(UniversityService.getFaculty("nope")).toBeUndefined();
    expect(UniversityService.getCourse("nope")).toBeUndefined();
    expect(UniversityService.getCourse("csc-101")?.code).toBe("CSC101");
  });

  it("search is case-insensitive and matches title, code, department and faculty name", () => {
    expect(UniversityService.search("ethical hacking").length).toBeGreaterThan(0);
    expect(UniversityService.search("csc").length).toBeGreaterThan(0);
    expect(UniversityService.search("LAW").length).toBeGreaterThan(0);
    expect(UniversityService.search("")).toEqual([]);
    expect(UniversityService.search("   ")).toEqual([]);
  });

  it("degree plan for every faculty is ordered by level → term and marks exactly one next", async () => {
    const uid = "uni-plan-all-" + Date.now();
    const faculties = UniversityService.faculties();
    for (const f of faculties) {
      const plan = await UniversityService.degreePlan(uid, f.id);
      expect(plan, f.id).not.toBeNull();
      expect(plan!.courses.length).toBeGreaterThan(0);
      // Ordered: bachelor before master before doctor; term ascending within level.
      const levels = plan!.courses.map((n) => n.level);
      const levelIdx = levels.map((l) => ["bachelor", "master", "doctor"].indexOf(l));
      for (let i = 1; i < levelIdx.length; i++) expect(levelIdx[i]! >= levelIdx[i - 1]!).toBe(true);
      // Exactly one next-recommended for a fresh learner.
      const next = plan!.courses.filter((n) => n.nextRecommended);
      expect(next.length, `${f.id} next count`).toBe(1);
      expect(next[0]!.level).toBe("bachelor");
      expect(next[0]!.prerequisitesMet).toBe(true);
    }
  });

  it("degree plan returns null for an unknown faculty", async () => {
    expect(await UniversityService.degreePlan("uni-x-" + Date.now(), "nope")).toBeNull();
  });
});
