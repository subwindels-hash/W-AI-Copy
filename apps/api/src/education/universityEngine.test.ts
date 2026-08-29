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

describe("Session 154 — University Engine completion: catalog integrity & engine semantics", () => {
  it("catalog integrity: unique domain/field ids, fields resolve to their domain, careers non-empty", () => {
    const domains = UniversityEngineService.domains();
    const domainIds = domains.map((d) => d.id);
    expect(new Set(domainIds).size).toBe(domainIds.length);
    const fieldIds = new Set<string>();
    for (const d of domains) {
      expect(d.name.length).toBeGreaterThan(2);
      for (const f of d.fields) {
        expect(fieldIds.has(f.id), `duplicate field ${f.id}`).toBe(false);
        fieldIds.add(f.id);
        expect(f.description.length).toBeGreaterThan(10);
        expect(f.careers.length).toBeGreaterThan(0);
      }
    }
    // Every FIELD_BY_ID entry resolves to a real domain.
    for (const f of domains.flatMap((d) => d.fields)) {
      const entry = UniversityEngineService.fieldById(f.id);
      expect(entry?.field.id).toBe(f.id);
      expect(domainIds).toContain(entry?.domain.id);
    }
  });

  it("education levels cover the full ladder with the spec's breadth", () => {
    const groups = UniversityEngineService.educationLevels();
    const all = groups.flatMap((g) => g.levels.map((l) => l.id));
    expect(all.length).toBe(16);
    for (const l of ["undergraduate_certificate", "associate_degree", "bachelor", "master", "phd", "postdoctoral", "professional_certification", "executive_education"]) {
      expect(all).toContain(l);
    }
    for (const g of groups) {
      expect(g.label.length).toBeGreaterThan(3);
      expect(g.levels.length).toBeGreaterThan(0);
    }
  });

  it("program generation is deterministic and level-aware", () => {
    const a = UniversityEngineService.program("engineering", "robotics", "bachelor");
    const b = UniversityEngineService.program("engineering", "robotics", "bachelor");
    expect(a).toEqual(b);
    expect(a.award).toBe("B.Sc");
    expect(a.totalCredits).toBe(120);
    const phd = UniversityEngineService.program("engineering", "robotics", "phd");
    expect(phd.award).toBe("Ph.D");
    // Doctoral research programs are research work (0 credits).
    expect(phd.totalCredits).toBe(0);
    // Course codes derive deterministically from the domain.
    const courses = UniversityEngineService.courses("engineering", "robotics", "bachelor");
    expect(courses.length).toBe(a.coreModules.length);
    expect(courses[0]!.code).toMatch(/^ENG\d{3}$/);
  });

  it("university directory integrity: unique ids, valid country codes, full records", () => {
    const unis = UniversityEngineService.universities();
    const ids = unis.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const u of unis) {
      expect(u.country.length).toBe(2);
      expect(u.name.length).toBeGreaterThan(3);
      expect(u.city.length).toBeGreaterThan(2);
      if (u.founded !== undefined) expect(u.founded).toBeGreaterThan(1000);
      expect(["university", "college", "polytechnic", "institute", "professional_school", "technical"]).toContain(u.type);
      expect(u.domains.length).toBeGreaterThan(0);
    }
    // Country filter is case-insensitive and empty for unknown countries.
    expect(UniversityEngineService.universities("ng").length).toBe(UniversityEngineService.universities("NG").length);
    expect(UniversityEngineService.universities("XX").length).toBe(0);
    // Every country profile has the key fields.
    for (const c of UniversityEngineService.countries()) {
      expect(c.country.length).toBe(2);
      expect(c.name.length).toBeGreaterThan(3);
      expect(c.system.length).toBeGreaterThan(3);
      expect(c.bachelorDurationYears).toBeGreaterThan(0);
      expect(c.bachelorYearLabel.length).toBeGreaterThan(2);
      expect(c.gradingSystem.length).toBeGreaterThan(2);
    }
  });

  it("advise is honest when nothing matches (no fabricated pathway)", async () => {
    const rec = await UniversityEngineService.advise("zxqvbn flurb");
    expect(rec.matchedFields).toEqual([]);
    expect(rec.recommendedPathway).toEqual([]);
    expect(rec.rationale).toContain("could not strongly match");
  });

  it("study plan validates field existence and bounds years", () => {
    expect(() => UniversityEngineService.createStudyPlan("no-such-field", "bachelor", 2)).toThrow(/not found/);
    const one = UniversityEngineService.createStudyPlan("computer-science", "bachelor", 1);
    expect(one.semesters.length).toBe(2);
    expect(one.semesters[0]!.label).toContain("Year 1");
    const six = UniversityEngineService.createStudyPlan("computer-science", "bachelor", 6);
    expect(six.semesters.length).toBe(12);
  });

  it("teach requires a field or title and honours level mapping", async () => {
    await expect(UniversityEngineService.teach("ue-x-" + Date.now(), {})).rejects.toThrow(/fieldId or a course title/);
    const byTitle = await UniversityEngineService.teach("ue-x-" + Date.now(), { title: "Advanced Quantum Mechanics", level: "phd" });
    expect(byTitle.topic).toContain("Advanced Quantum Mechanics");
    expect(byTitle.topic).toContain("Doctor of Philosophy");
    const byField = await UniversityEngineService.teach("ue-x-" + Date.now(), { fieldId: "law", level: "bachelor" });
    expect(byField.topic).toContain("Law");
  });

  it("research guidance requires a real field", () => {
    expect(() => UniversityEngineService.researchGuidance("no-such-field")).toThrow(/not found/);
    const g = UniversityEngineService.researchGuidance("medicine");
    expect(g.thesisStages).toContain("Defence & submission");
    expect(g.methodologies.some((m) => m.name.includes("Systematic"))).toBe(true);
  });

  it("insight answers the full category set and falls back honestly", () => {
    const career = UniversityEngineService.insight("what can I do with a degree in economics");
    expect(career.category).toBe("career");
    expect(career.answer.toLowerCase()).toContain("economics");
    const req = UniversityEngineService.insight("what is required to study for a bachelor degree");
    expect(req.category).toBe("requirements");
    const learn = UniversityEngineService.insight("teach me this subject please");
    expect(learn.category).toBe("learning");
    const general = UniversityEngineService.insight("hello world");
    expect(general.category).toBe("general");
    expect(general.answer).toContain("Browse the academic catalog");
  });
});
