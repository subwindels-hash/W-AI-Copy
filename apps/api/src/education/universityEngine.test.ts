import { describe, it, expect, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn() }));
vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: { async *guardedStream() { throw new Error("no AI provider configured in test"); } },
}));

const { UniversityEngineService } = await import("../education/universityEngine.service.js");
const UID = "ue-test-" + Date.now();

describe("Universal University & Higher Education Engine", () => {
  it("has a global academic catalog with many domains and fields", () => {
    const domains = UniversityEngineService.domains();
    expect(domains.length).toBeGreaterThan(10);
    const fieldCount = domains.reduce((n, d) => n + d.fields.length, 0);
    expect(fieldCount).toBeGreaterThan(100);
    // Key faculties present.
    const names = domains.map((d) => d.name);
    expect(names).toContain("Engineering & Technology");
    expect(names).toContain("Medicine & Health Sciences");
    expect(names).toContain("Business & Economics");
    expect(names).toContain("Law");
  });

  it("covers all education levels from undergraduate to doctoral and research", () => {
    const groups = UniversityEngineService.educationLevels();
    const all = groups.flatMap((g) => g.levels.map((l) => l.id));
    for (const l of ["associate_degree", "bachelor", "master", "phd", "postdoctoral", "professional_certification", "executive_education"]) {
      expect(all).toContain(l);
    }
  });

  it("searches across domains, fields and careers", () => {
    expect(UniversityEngineService.search("robotics").length).toBeGreaterThan(0);
    expect(UniversityEngineService.search("data scientist").length).toBeGreaterThan(0);
    expect(UniversityEngineService.search("psychology").length).toBeGreaterThan(0);
    expect(UniversityEngineService.search("zzz-nothing").length).toBe(0);
  });

  it("generates deterministic programs and courses from field data", () => {
    const prog = UniversityEngineService.program("engineering", "robotics", "bachelor");
    expect(prog.award).toBe("B.Sc");
    expect(prog.coreModules.length).toBeGreaterThan(0);
    const courses = UniversityEngineService.courses("engineering", "robotics", "bachelor");
    expect(courses.length).toBeGreaterThan(0);
    for (const c of courses) {
      expect(c.code).toBeTruthy();
      expect(c.teachingTopic).toContain("Robotics");
    }
  });

  it("provides a global university directory and country profiles", () => {
    const unis = UniversityEngineService.universities();
    expect(unis.length).toBeGreaterThan(30);
    // Countries span the requested set.
    const countries = new Set(unis.map((u) => u.country));
    for (const c of ["NG", "US", "GB", "CA", "AU", "ZA", "GH", "KE", "DE", "FR", "IN", "CN", "JP", "AE", "SA"]) {
      expect(countries).toContain(c);
    }
    // Country profile for Nigeria exists and describes the education system.
    const ng = UniversityEngineService.country("NG");
    expect(ng).toBeTruthy();
    expect(ng!.bachelorDurationYears).toBe(4);
    const lagos = UniversityEngineService.universities("NG");
    expect(lagos.length).toBeGreaterThan(0);
  });

  it("advises a career goal into a recommended pathway", async () => {
    const rec = await UniversityEngineService.advise("I want to become an AI engineer and build machine learning systems");
    expect(rec.matchedFields.length).toBeGreaterThan(0);
    expect(rec.recommendedPathway.length).toBeGreaterThan(0);
    expect(rec.careerOutcomes.length).toBeGreaterThan(0);
    // Pathway starts at undergraduate and can reach a doctorate.
    expect(rec.recommendedPathway[0].degreeLevel).toBe("undergraduate_certificate");
  });

  it("creates a semester-by-semester study plan", () => {
    const plan = UniversityEngineService.createStudyPlan("computer-science", "bachelor", 4);
    expect(plan.years).toBe(4);
    expect(plan.semesters.length).toBe(8);
    expect(plan.semesters[0].label).toContain("Year 1");
    expect(plan.semesters[0].courses.length).toBeGreaterThan(0);
    expect(plan.totalCredits).toBeGreaterThan(0);
  });

  it("teaches a field through the real Lecturer AI", async () => {
    const { topic, turn } = await UniversityEngineService.teach(UID, { fieldId: "cybersecurity", level: "master" });
    expect(topic).toContain("Cybersecurity");
    expect(turn.sessionId).toMatch(/^ls-/);
    expect(turn.question).toBeTruthy();
  });

  it("provides research & thesis guidance for a field", () => {
    const g = UniversityEngineService.researchGuidance("biology");
    expect(g.suggestedTopics.length).toBeGreaterThan(0);
    expect(g.methodologies.length).toBeGreaterThan(0);
    expect(g.thesisStages).toContain("Defence & submission");
  });

  it("answers academic-intelligence questions", () => {
    const cs = UniversityEngineService.insight("what courses do I need to study computer science");
    expect(cs.category).toBe("pathway");
    expect(cs.answer.length).toBeGreaterThan(10);
    const diff = UniversityEngineService.insight("what is the difference between computer science and software engineering");
    expect(diff.category).toBe("compare");
  });
});
