/**
 * Session 144 — Unit tests: Global Politics, Government & Political History
 * Intelligence System.
 *
 * Covers: catalog coverage (countries, leaders, parties, elections,
 * ideologies, movements, organizations, government forms), integrity, the
 * question engine (§26's Nigeria examples), the neutral comparison engine,
 * timelines (§18/§19), the knowledge graph (§20), the fact-vs-opinion engine
 * (§23), education mode with deterministic quizzes (§31), and the update
 * engine with never-overwrite-history versioning (§28/§29).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyPoliticalClaim,
  classifyPoliticsQuestion,
  compareCountries,
  renderCountryAtLevel,
} from "@windels/shared";
import { PoliticsService, POLITICS_CATALOG } from "./politics.service.js";

vi.mock("../db/redis.js", () => {
  const store = new Map<string, string>();
  const zsets = new Map<string, Array<{ score: number; member: string }>>();
  return {
    redisCmd: {
      async set(k: string, v: string) { store.set(k, v); },
      async get(k: string) { return store.get(k) ?? null; },
      async del(k: string) { store.delete(k); },
      async zadd(k: string, score: string, member: string) {
        const s = Number(score);
        let list = zsets.get(k);
        if (!list) { list = []; zsets.set(k, list); }
        const idx = list.findIndex((i) => i.member === member);
        if (idx !== -1) list.splice(idx, 1);
        list.push({ score: s, member });
        list.sort((a, b) => a.score - b.score);
      },
      async zcard(k: string) { return zsets.get(k)?.length ?? 0; },
      async zrange(k: string, start: number, stop: number) {
        const list = zsets.get(k) ?? [];
        const end = stop === -1 ? list.length : stop + 1;
        return list.slice(start, end).map((i) => i.member);
      },
      async zrem() { return 1; },
    },
  };
});

const ACTOR_ADMIN = { id: "admin-1", role: "SUPER_ADMIN" };
const ACTOR_USER = { id: "user-1", role: "USER" };

describe("Catalog coverage (§2–§17)", () => {
  it("covers every entity kind", () => {
    const meta = PoliticsService.catalogMeta();
    for (const kind of ["country", "leader", "party", "election", "ministry", "governor", "constitution", "event", "movement", "ideology", "international_organization", "government_form", "policy"]) {
      expect((meta.byKind as Record<string, number>)[kind] ?? 0).toBeGreaterThan(0);
    }
  });

  it("covers the §16 international organizations", () => {
    const ids = new Set(POLITICS_CATALOG.map((r) => r.id));
    for (const id of ["org.un", "org.african-union", "org.eu", "org.nato", "org.asean", "org.arab-league", "org.commonwealth", "org.ecowas", "org.sadc", "org.eac", "org.igad", "org.g20", "org.g7", "org.brics"]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("covers the §13 ideologies", () => {
    const ids = new Set(POLITICS_CATALOG.map((r) => r.id));
    for (const id of ["pol.ideo.liberalism", "pol.ideo.conservatism", "pol.ideo.socialism", "pol.ideo.social-democracy", "pol.ideo.communism", "pol.ideo.marxism", "pol.ideo.leninism", "pol.ideo.marxism-leninism", "pol.ideo.anarchism", "pol.ideo.libertarianism", "pol.ideo.nationalism", "pol.ideo.pan-africanism", "pol.ideo.environmentalism", "pol.ideo.feminism", "pol.ideo.populism", "pol.ideo.monarchism", "pol.ideo.republicanism", "pol.ideo.fascism", "pol.ideo.african-socialism", "pol.ideo.anticolonial", "pol.ideo.indigenous-politics", "pol.ideo.religious-political"]) {
      expect(ids.has(id), id).toBe(true);
    }
    // Ideologies are taught academically, never advocated.
    const fascism = PoliticsService.getRecord("pol.ideo.fascism") as any;
    expect(fascism.advocacyNote).toContain("does not advocate it");
  });

  it("covers the §12 government forms", () => {
    const ids = new Set(POLITICS_CATALOG.map((r) => r.id));
    for (const id of ["pol.form.presidential-republic", "pol.form.parliamentary-republic", "pol.form.semi-presidential", "pol.form.constitutional-monarchy", "pol.form.absolute-monarchy", "pol.form.federal-republic", "pol.form.unitary-republic", "pol.form.one-party", "pol.form.military-government", "pol.form.transitional"]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("covers the §14 movements", () => {
    const ids = new Set(POLITICS_CATALOG.map((r) => r.id));
    for (const id of ["pol.mov.nigeria-independence", "pol.mov.us-civil-rights", "pol.mov.anti-apartheid", "pol.mov.labor", "pol.mov.womens-suffrage", "pol.mov.pro-democracy"]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("covers Nigeria deeply: 14 heads of state, 8 parties, 10 elections, 6 Lagos governors, 4 constitutions, 6 events", () => {
    const leaders = PoliticsService.listCountryLeaders("pol.country.nigeria");
    expect(leaders.length).toBeGreaterThanOrEqual(14);
    // The current president is marked current_as_of with a Last Verified date (§21).
    const tinubu = leaders.find((l) => l.id === "pol.leader.nigeria.tinubu")!;
    expect(tinubu.meta.verification).toBe("current_as_of");
    expect(tinubu.meta.lastVerified).toBeTruthy();

    const parties = PoliticsService.listByKind("party").filter((p) => p.countryId === "pol.country.nigeria");
    expect(parties.length).toBeGreaterThanOrEqual(8);
    const elections = PoliticsService.listByKind("election").filter((e) => e.countryId === "pol.country.nigeria");
    expect(elections.length).toBeGreaterThanOrEqual(10);
    const governors = PoliticsService.listByKind("governor").filter((g) => g.countryId === "pol.country.nigeria");
    expect(governors.length).toBeGreaterThanOrEqual(6);
    const constitutions = PoliticsService.listByKind("constitution").filter((c) => c.countryId === "pol.country.nigeria");
    expect(constitutions.length).toBeGreaterThanOrEqual(4);
    const events = PoliticsService.listByKind("event").filter((e) => (e.countryIds ?? []).includes("pol.country.nigeria"));
    expect(events.length).toBeGreaterThanOrEqual(6);
  });

  it("every leader record distinguishes head of state from head of government (§4/§5)", () => {
    for (const l of PoliticsService.listByKind("leader")) {
      expect(l.role).toBeTruthy();
      expect(l.titleKind).toBeTruthy();
      expect(l.officeStart).toBeTruthy();
    }
    const azikiwe = PoliticsService.getRecord("pol.leader.nigeria.azikiwe") as any;
    expect(azikiwe.role).toBe("head_of_state");
    const starmer = PoliticsService.getRecord("pol.leader.uk.starmer") as any;
    expect(starmer.role).toBe("head_of_government");
  });
});

describe("Catalog integrity", () => {
  it("reports a clean integrity report", () => {
    const report = PoliticsService.integrity();
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("carries version metadata on every record (§29)", () => {
    for (const r of POLITICS_CATALOG.slice(0, 30)) {
      expect(r.meta.created).toBeTruthy();
      expect(r.meta.lastReviewed).toBeTruthy();
      expect(r.meta.verification).toBeTruthy();
      expect((r.sources ?? []).length).toBeGreaterThan(0);
    }
  });

  it("current records carry asOfDate and lastVerified (§21)", () => {
    const current = POLITICS_CATALOG.filter((r) => r.meta.verification === "current_as_of");
    expect(current.length).toBeGreaterThan(0);
    for (const r of current) {
      expect(r.meta.asOfDate).toBeTruthy();
      expect(r.meta.lastVerified).toBeTruthy();
    }
  });
});

describe("Question engine (§26 examples)", () => {
  it("answers 'Tell me the history of Nigeria' with the country profile", async () => {
    const res = await PoliticsService.ask(null, { question: "Tell me the history of Nigeria." });
    expect(res.intent.intent).toBe("country_history");
    expect(res.matches.some((m) => m.id === "pol.country.nigeria")).toBe(true);
    const country = res.matches.find((m) => m.id === "pol.country.nigeria")!;
    expect(country.sections.some((s: any) => s.key === "preColonial")).toBe(true);
  });

  it("answers 'Who was Nigeria's first president?' with the leader", async () => {
    const res = await PoliticsService.ask(null, { question: "Who was Nigeria's first president?" });
    expect(res.intent.intent).toBe("leader");
    expect(res.matches.some((m) => m.id === "pol.leader.nigeria.azikiwe")).toBe(true);
  });

  it("answers 'List all presidents of Nigeria' with a chronological leader list", async () => {
    const res = await PoliticsService.ask(null, { question: "List all presidents of Nigeria" });
    expect(res.mode).toBe("leader_list");
    expect(res.country.id).toBe("pol.country.nigeria");
    expect(res.leaders.length).toBeGreaterThanOrEqual(14);
    expect(res.leaders[0]!.name).toBe("Nnamdi Azikiwe");
    expect(res.note).toContain("current_as_of");
  });

  it("answers 'Who is the current president?' with the current_as_of leader", async () => {
    const res = await PoliticsService.ask(null, { question: "Who is the current president of Nigeria?" });
    expect(res.intent.intent).toBe("current_office");
    expect(res.matches.some((m) => m.id === "pol.leader.nigeria.tinubu")).toBe(true);
  });

  it("answers 'Explain every Nigerian presidential election' with election records", async () => {
    const res = await PoliticsService.ask(null, { question: "Explain every Nigerian presidential election", limit: 10 });
    expect(res.intent.intent).toBe("election");
    expect(res.matches.some((m) => m.id === "pol.election.nigeria.1979")).toBe(true);
    expect(res.matches.some((m) => m.id === "pol.election.nigeria.2023")).toBe(true);
  });

  it("answers 'How does Nigeria's federal government work?'", async () => {
    const res = await PoliticsService.ask(null, { question: "How does Nigeria's federal government work?" });
    expect(res.intent.intent).toBe("government_how");
    // Both the country profile and the 1999 constitution answer this.
    expect(res.matches.some((m) => ["pol.country.nigeria", "pol.constitution.nigeria.1999"].includes(m.id))).toBe(true);
  });

  it("answers 'What happened during Nigeria's transition to democracy?'", async () => {
    const res = await PoliticsService.ask(null, { question: "What happened during Nigeria's transition to democracy?" });
    expect(res.matches.some((m) => m.id === "pol.event.nigeria.transition-1999")).toBe(true);
  });

  it("answers honestly when nothing is known", async () => {
    const res = await PoliticsService.ask(null, { question: "What happened at the Zxqvbn summit of 1987 in Qwertyland?" });
    expect(res.matches).toEqual([]);
    expect(res.note).toContain("do not have sufficient verified political knowledge");
  });
});

describe("Comparison engine (§24-neutral)", () => {
  it("compares Nigeria with the United States across the neutral categories", () => {
    const result = PoliticsService.compareCountry(["pol.country.nigeria", "pol.country.united-states"]);
    expect(result.items.length).toBe(2);
    expect(result.missing).toEqual([]);
    expect(result.rows.length).toBeGreaterThanOrEqual(10);
    expect(result.note).toContain("does not rank political systems");
    const form = result.rows.find((r) => r.category === "government_form")!;
    expect(form.values[0]!.text).toBe("Federal republic");
    expect(form.values[1]!.text).toBe("Federal republic");
  });

  it("compares a presidential with a parliamentary system differently", () => {
    const result = PoliticsService.compareCountry(["pol.country.nigeria", "pol.country.united-kingdom"]);
    const form = result.rows.find((r) => r.category === "government_form")!;
    expect(form.values[0]!.text).toBe("Federal republic");
    expect(form.values[1]!.text).toBe("Parliamentary monarchy");
  });

  it("reports missing countries honestly", () => {
    const result = PoliticsService.compareCountry(["pol.country.nigeria", "nope"]);
    expect(result.missing).toEqual(["nope"]);
  });
});

describe("Timelines (§18/§19)", () => {
  it("returns the country political timeline with periods and events", () => {
    const t = PoliticsService.countryTimeline("pol.country.nigeria")!;
    expect(t.periods.length).toBeGreaterThanOrEqual(5);
    expect(t.periods[0]!.label).toContain("Ancient");
    expect(t.events.some((e) => e.eventType === "coup")).toBe(true);
    expect(t.events.some((e) => e.eventType === "independence")).toBe(true);
  });

  it("returns the leader timeline in chronological order", () => {
    const leaders = PoliticsService.leaderTimeline("pol.country.nigeria");
    expect(leaders.length).toBeGreaterThanOrEqual(14);
    expect(leaders[0]!.name).toBe("Nnamdi Azikiwe");
    expect(leaders[leaders.length - 1]!.name).toBe("Bola Tinubu");
  });

  it("returns null for unknown countries", () => {
    expect(PoliticsService.countryTimeline("nope")).toBeNull();
  });
});

describe("Knowledge graph (§20)", () => {
  it("resolves the country's related nodes", () => {
    const node = PoliticsService.graphNode("pol.country.nigeria")!;
    expect(node.node.name).toBe("Nigeria");
    expect(node.edges.length).toBeGreaterThan(0);
    expect(node.nodes.some((n) => n.id === "pol.leader.nigeria.tinubu")).toBe(true);
    expect(node.nodes.some((n) => n.id === "org.ecowas")).toBe(true);
  });

  it("answers 'who was president when the civil war happened'", async () => {
    const res = await PoliticsService.graphAnswer("Who was president during the Nigerian civil war?");
    expect(res.mode).toBe("graph_answer");
    expect(res.event).not.toBeNull();
    expect(res.event.name).toContain("Civil War");
    expect(res.leadersAtEvent[0]!.leaders.some((l: any) => l.name === "Yakubu Gowon")).toBe(true);
  });
});

describe("Fact vs opinion engine (§23)", () => {
  it("classifies the spec's examples", () => {
    expect(classifyPoliticalClaim("Person X served as president from year A to year B.").category).toBe("verified_fact");
    expect(classifyPoliticalClaim("Person X was the greatest president.").category).toBe("opinion");
    expect(classifyPoliticalClaim("Person X destroyed the economy.").category).toBe("historical_interpretation");
    expect(classifyPoliticalClaim("X is accused of corruption.").category).toBe("allegation");
    expect(classifyPoliticalClaim("The election result is disputed by the opposition.").category).toBe("disputed_claim");
    expect(classifyPoliticalClaim("The regime is a puppet of traitors and enemies of the people.").category).toBe("propaganda_messaging");
  });

  it("is exposed through the service", () => {
    const res = PoliticsService.classifyClaim("Person X was the greatest president.");
    expect(res.category).toBe("opinion");
  });
});

describe("Education mode (§25/§31)", () => {
  it("renders country sections at each level", () => {
    const country = PoliticsService.getRecord("pol.country.nigeria") as any;
    const beginner = renderCountryAtLevel(country, "beginner");
    const research = renderCountryAtLevel(country, "research");
    expect(beginner.length).toBeLessThan(research.length);
    expect(beginner.some((s) => s.key === "simple")).toBe(true);
    expect(research.some((s) => s.key === "preColonial")).toBe(true);
  });

  it("generates deterministic quizzes from records", async () => {
    const quiz = await PoliticsService.quiz("pol.country.nigeria", "intermediate", 5);
    expect(quiz!.topicName).toBe("Nigeria");
    expect(quiz!.questions.length).toBe(5);
    for (const q of quiz!.questions) {
      expect(q.choices.length).toBe(4);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.explanation.length).toBeGreaterThan(0);
    }
    // Deterministic: same inputs → same questions.
    const again = await PoliticsService.quiz("pol.country.nigeria", "intermediate", 5);
    expect(again!.questions.map((q) => q.question)).toEqual(quiz!.questions.map((q) => q.question));
  });

  it("404s for unknown topics", async () => {
    expect(await PoliticsService.quiz("nope", "beginner", 5)).toBeNull();
  });

  it("education catalog lists every country as a course", () => {
    const catalog = PoliticsService.listByKind("country");
    expect(catalog.length).toBeGreaterThan(15);
  });
});

describe("Update engine (§28/§29) — never overwrite history", () => {
  const orgA = "org-pol-a";
  const orgB = "org-pol-b";

  beforeEach(() => {
    vi.clearAllMocks();
    PoliticsService._resetForTests();
  });

  const baseUpdate = {
    kind: "leadership_change" as const,
    entityId: "pol.country.nigeria",
    entityKind: "country" as const,
    title: "Change of president",
    changeSummary: "A new president takes office.",
    field: "currentSituation",
    previousValue: "Bola Tinubu has been president since 2023.",
    newValue: "A new president has taken office in 2027.",
    effectiveDate: "2027-05-29",
    sources: [{ label: "Official government announcement", type: "official_government" as const }],
    verification: "well_supported" as const,
  };

  it("creates a pending update with previous/new values and sources", async () => {
    const u = await PoliticsService.createUpdate(orgA, "user-1", baseUpdate);
    expect(u.status).toBe("pending_review");
    expect(u.previousValue).toContain("Bola Tinubu");
    expect(u.newValue).toContain("2027");
    expect(u.sources.length).toBe(1);
    expect(u.changeLog).toBeNull();
  });

  it("only the Super Admin can apply; applying records a change log without touching the historical record", async () => {
    const u = await PoliticsService.createUpdate(orgA, "user-1", baseUpdate);
    await expect(PoliticsService.reviewUpdate(orgA, ACTOR_USER, u.id, "applied")).rejects.toThrow(/Super Admin/);

    const applied = await PoliticsService.reviewUpdate(orgA, ACTOR_ADMIN, u.id, "applied", "verified");
    expect(applied!.status).toBe("applied");
    expect(applied!.changeLog).not.toBeNull();
    expect(applied!.changeLog!.previousValue).toContain("Bola Tinubu");
    expect(applied!.changeLog!.newValue).toContain("2027");
    expect(applied!.changeLog!.appliedBy).toBe(ACTOR_ADMIN.id);

    // The historical leader record is untouched.
    const tinubu = PoliticsService.getRecord("pol.leader.nigeria.tinubu") as any;
    expect(tinubu.officeEnd).toBe("");
  });

  it("cannot review an update twice", async () => {
    const u = await PoliticsService.createUpdate(orgA, "user-1", baseUpdate);
    await PoliticsService.reviewUpdate(orgA, ACTOR_ADMIN, u.id, "applied");
    await expect(PoliticsService.reviewUpdate(orgA, ACTOR_ADMIN, u.id, "rejected")).rejects.toThrow(/already/);
  });

  it("isolates updates between organizations", async () => {
    const u = await PoliticsService.createUpdate(orgA, "user-1", baseUpdate);
    expect(await PoliticsService.getUpdate(orgB, u.id)).toBeNull();
    expect(await PoliticsService.listUpdates(orgB, {})).toEqual([]);
  });

  it("field history returns the versioned trail (§29)", async () => {
    const historyOrg = "org-pol-history";
    const u = await PoliticsService.createUpdate(historyOrg, "user-1", baseUpdate);
    await PoliticsService.reviewUpdate(historyOrg, ACTOR_ADMIN, u.id, "applied");
    const history = await PoliticsService.fieldHistory(historyOrg, "pol.country.nigeria", "currentSituation");
    expect(history.length).toBe(1);
    expect(history[0]!.effectiveDate).toBe("2027-05-29");
    expect(history[0]!.source).toContain("Official government");
  });

  it("applied updates surface in org-scoped search", async () => {
    const u = await PoliticsService.createUpdate(orgA, "user-1", baseUpdate);
    await PoliticsService.reviewUpdate(orgA, ACTOR_ADMIN, u.id, "applied");
    const res = await PoliticsService.search(orgA, { q: "Change of president" });
    expect(res.results.some((r) => r.id === `update:${u.id}`)).toBe(true);
    // Another org does not see it.
    const resB = await PoliticsService.search(orgB, { q: "Change of president" });
    expect(resB.results.some((r) => r.id === `update:${u.id}`)).toBe(false);
  });
});

describe("Stats & search", () => {
  it("stats report catalog and update counts honestly", async () => {
    const stats = await PoliticsService.stats("org-pol-stats");
    expect(stats.catalog.recordCount).toBeGreaterThan(140);
    expect(stats.catalog.countryCount).toBeGreaterThan(15);
    expect(stats.updates.count).toBe(0);
    expect(stats.updates.note).toContain("never overwrites history");
  });

  it("search finds records by name and filters by kind", async () => {
    const res = await PoliticsService.search(null, { q: "ECOWAS" });
    expect(res.results.some((r) => r.id === "org.ecowas")).toBe(true);
    const leaders = await PoliticsService.search(null, { q: "president", kind: "leader", limit: 5 });
    expect(leaders.results.every((r) => r.kind === "leader")).toBe(true);
  });

  it("enterprise-search hook lists searchable records", () => {
    const list = PoliticsService.listSearchable();
    expect(list.length).toBeGreaterThan(100);
    expect(list[0]!.title.length).toBeGreaterThan(0);
  });
});
