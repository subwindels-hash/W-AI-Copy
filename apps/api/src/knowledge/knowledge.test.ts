/**
 * Session 140 — Unit tests: Global Human Knowledge & Everyday Question
 * Intelligence System.
 *
 * Covers the Question Intent Engine (all 13 intents + the general fallback),
 * the personalized teaching engine, the comparison engine (criteria, no
 * winner), the timeline engine, catalog integrity, retrieval/ask honesty,
 * and the org-scoped dynamic layer with cross-organization isolation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyQuestionIntent,
  compareKnowledge,
  confidenceRank,
  defaultTierForKind,
  normalizeQuestionText,
  renderRecordAtLevel,
  sortTimelineEvents,
  teachingPlanFor,
  INTENT_ROUTING,
  type KnowledgeRecord,
  type TimelineEventView,
} from "@windels/shared";
import { KnowledgeService } from "./knowledge.service.js";
import { MASTER_CATEGORIES, HISTORY_ERAS } from "./knowledge.catalog.js";

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
      async zrem(k: string, ...members: string[]) {
        const list = zsets.get(k);
        if (!list) return;
        for (const m of members) {
          const idx = list.findIndex((i) => i.member === m);
          if (idx !== -1) list.splice(idx, 1);
        }
      },
    },
  };
});

describe("Question Intent Engine (spec §24)", () => {
  const cases: Array<[string, string]> = [
    ["What is democracy?", "definition"],
    ["How does AI work?", "explanation"],
    ["When did AI begin?", "history"],
    ["AI vs traditional software?", "comparison"],
    ["How do I build an AI app?", "instruction"],
    ["Which cloud platform should I use?", "recommendation"],
    ["How much will this cost?", "calculation"],
    ["Who is the current president?", "current_information"],
    ["Give me everything about this subject.", "research"],
    ["Teach me mathematics.", "education"],
    ["Write a business plan.", "creative"],
    ["Why isn't my application working?", "troubleshooting"],
    ["What should I do?", "personal_guidance"],
    ["Hello there, how are you?", "general"],
  ];

  it.each(cases)("classifies %j as %s", (text, expected) => {
    const result = classifyQuestionIntent(text);
    expect(result.intent).toBe(expected);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });

  it("is deterministic: identical text yields identical classification", () => {
    const a = classifyQuestionIntent("Why does inflation happen?");
    const b = classifyQuestionIntent("Why does inflation happen?");
    expect(a).toEqual(b);
  });

  it("ranks the more specific intent when patterns overlap", () => {
    // "why do i feel tired" — personal_guidance beats bare explanation
    expect(classifyQuestionIntent("Why do I feel tired?").intent).toBe("personal_guidance");
    // "how do I start a business" — instruction beats explanation
    expect(classifyQuestionIntent("How do I start a business?").intent).toBe("instruction");
    // "what should i do about my job" — personal guidance beats recommendation
    expect(classifyQuestionIntent("What should I do about my job?").intent).toBe("personal_guidance");
  });

  it("explains its routing for every intent", () => {
    for (const intent of ["definition", "explanation", "history", "comparison", "instruction", "recommendation", "calculation", "current_information", "research", "education", "creative", "troubleshooting", "personal_guidance", "general"]) {
      const route = INTENT_ROUTING[intent as keyof typeof INTENT_ROUTING];
      expect(route.domain.length).toBeGreaterThan(0);
      expect(route.note.length).toBeGreaterThan(0);
    }
  });

  it("normalizes punctuation and case", () => {
    expect(normalizeQuestionText("What IS democracy?!")).toBe("what is democracy");
  });
});

describe("Personalized teaching engine (spec §27)", () => {
  const record = KnowledgeService.getRecord("con.electricity");
  it("loads the electricity concept", () => {
    expect(record).not.toBeNull();
  });

  it("renders fewer, simpler sections for a child than for research level", () => {
    const r = record!;
    const child = renderRecordAtLevel(r, "child");
    const research = renderRecordAtLevel(r, "research");
    expect(child.sections.length).toBeLessThan(research.sections.length);
    expect(child.sections.every((s) => ["simple", "examples", "guidance"].includes(s.key))).toBe(true);
    expect(research.sections.some((s) => s.key === "sources" || s.key === "history")).toBe(true);
  });

  it("keeps the underlying knowledge identical across levels", () => {
    const r = record!;
    const child = renderRecordAtLevel(r, "child");
    const highSchool = renderRecordAtLevel(r, "high_school");
    // The simple explanation section is served at both levels; body identical.
    const childSimple = child.sections.find((s) => s.key === "simple");
    const hsSimple = highSchool.sections.find((s) => s.key === "simple");
    expect(childSimple?.body).toBe(hsSimple?.body);
  });

  it("defines a plan for every audience level", () => {
    for (const level of ["child", "high_school", "undergraduate", "graduate", "research"] as const) {
      const plan = teachingPlanFor(level);
      expect(plan.includedSections.length).toBeGreaterThan(0);
      expect(plan.note.length).toBeGreaterThan(0);
    }
  });
});

describe("Comparison engine (spec §8) — criteria, never a winner", () => {
  it("compares labeled records on their criteria union", () => {
    const python = KnowledgeService.getRecord("cmp.item.python")!;
    const js = KnowledgeService.getRecord("cmp.item.javascript")!;
    const result = compareKnowledge([python, js]);
    expect(result.criteria.length).toBeGreaterThanOrEqual(6);
    expect(result.criteria.some((c) => c.key === "data_ai")).toBe(true);
    for (const item of result.items) {
      for (const score of item.scores) {
        expect(typeof score.value).toBe("number");
        expect(score.basis).toBe("labeled");
      }
    }
    expect(result.note).toContain("universal winner");
    expect(Object.keys(result.items[0]!).includes("winner")).toBe(false);
  });

  it("never invents scores for unlabeled criteria", () => {
    const democracy = KnowledgeService.getRecord("con.democracy")!;
    const result = compareKnowledge([democracy, democracy]);
    expect(result.criteria.length).toBe(0);
    expect(result.items[0]!.scores).toEqual([]);
  });

  it("reports not_labeled when a requested criterion has no labeled value", () => {
    const python = KnowledgeService.getRecord("cmp.python-vs-js")!;
    const result = compareKnowledge([python], ["does_not_exist"]);
    expect(result.criteria).toEqual([]);
  });

  it("the compare endpoint resolves missing ids honestly", () => {
    const result = KnowledgeService.compare(["cmp.python-vs-js", "no.such.record"]);
    expect(result.missing).toEqual(["no.such.record"]);
    expect(result.items.length).toBe(1);
  });
});

describe("Timeline engine (spec §6/§16)", () => {
  it("sorts BCE before CE and returns all eras", () => {
    const t = KnowledgeService.timeline();
    expect(t.eras.length).toBe(8);
    expect(t.eras[0]!.id).toBe("era-prehistory");
    const years = t.events.map((e) => e.year);
    expect(years[0]).toBeLessThan(years[years.length - 1]!);
    expect(t.events[0]!.dateLabel).toContain("300 000");
    expect(t.events.some((e) => e.eraId === "era-contemporary")).toBe(true);
  });

  it("filters by era", () => {
    const medieval = KnowledgeService.timeline("era-medieval");
    expect(medieval.events.length).toBeGreaterThan(0);
    expect(medieval.events.every((e) => e.eraId === "era-medieval")).toBe(true);
  });

  it("sorts null-year events last and stable", () => {
    const events: TimelineEventView[] = [
      { id: "x", title: "uncertain", dateLabel: "?", year: null, eraId: null, summary: "", confidence: "uncertain" },
      { id: "a", title: "old", dateLabel: "1000 BCE", year: -1000, eraId: null, summary: "", confidence: "well_supported" },
      { id: "b", title: "new", dateLabel: "500 CE", year: 500, eraId: null, summary: "", confidence: "well_supported" },
    ];
    const sorted = sortTimelineEvents(events);
    expect(sorted.map((e) => e.id)).toEqual(["a", "b", "x"]);
  });
});

describe("Confidence & tier classification (spec §25/§26)", () => {
  it("ranks verified above unverified", () => {
    expect(confidenceRank("verified")).toBeLessThan(confidenceRank("unverified"));
    expect(confidenceRank("disputed")).toBeLessThan(confidenceRank("uncertain"));
  });

  it("defaults current-information kind to the dynamic tier", () => {
    expect(defaultTierForKind("current_information")).toBe("dynamic");
    expect(defaultTierForKind("concept")).toBe("stable");
  });

  it("the catalog contains disputed/uncertain records as labelled examples", () => {
    const confidences = new Set(KnowledgeService.catalogMeta().byConfidence ? Object.keys(KnowledgeService.catalogMeta().byConfidence) : []);
    expect(confidences.has("well_supported")).toBe(true);
    expect(confidences.has("verified") || confidences.has("well_supported")).toBe(true);
  });
});

describe("Master catalog integrity", () => {
  it("contains the 90 master categories from the spec", () => {
    expect(MASTER_CATEGORIES.length).toBe(90);
    const ids = new Set(MASTER_CATEGORIES.map((c) => c.id));
    expect(ids.size).toBe(90);
  });

  it("reports a clean integrity report", () => {
    const report = KnowledgeService.integrity();
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("covers every content layer with records", () => {
    const meta = KnowledgeService.catalogMeta();
    for (const kind of ["concept", "instruction", "explanation", "person", "timeline_event", "place", "comparison", "discipline", "science_field", "technology", "business", "career", "law", "health", "history_era", "culture", "travel", "relationship", "entertainment", "language", "everyday", "creative", "policy"]) {
      expect((meta.byKind as Record<string, number>)[kind] ?? 0).toBeGreaterThan(0);
    }
  });

  it("records every history era id used by timeline events", () => {
    const eraIds = new Set(HISTORY_ERAS.map((e) => e.id));
    const t = KnowledgeService.timeline();
    for (const e of t.events) {
      expect(eraIds.has(e.eraId!)).toBe(true);
    }
  });

  it("person records carry biography, achievements and sources", () => {
    for (const id of ["who.mandela", "who.curie", "who.einstein", "who.lovelace", "who.gandhi", "who.maathai"]) {
      const r = KnowledgeService.getRecord(id)!;
      expect(r.sections.biography?.length).toBeGreaterThan(50);
      expect(r.sections.achievements?.length).toBeGreaterThan(20);
      expect((r.sources ?? []).length).toBeGreaterThan(0);
      expect(r.confidence).not.toBe("unverified");
    }
  });

  it("instruction records provide steps and flag professional assistance", () => {
    const r = KnowledgeService.getRecord("ins.register-company")!;
    expect(r.sections.steps?.length).toBeGreaterThan(50);
    expect(r.sections.guidance?.toLowerCase()).toContain("official");
  });

  it("health and law records carry professional-assistance notes", () => {
    for (const id of ["hlth.first-aid", "law.contracts", "law.immigration", "hlth.mental-health"]) {
      const r = KnowledgeService.getRecord(id)!;
      expect(r.professionalAssistanceNote ?? r.sections.warning ?? r.sections.guidance).toBeTruthy();
    }
  });

  it("dynamic/current facts are deliberately not memorized as catalog records", () => {
    const r = KnowledgeService.getRecord("pol.current-information")!;
    expect(r.kind).toBe("policy");
    expect(r.sections.policy).toContain("SOURCE + DATE + VERIFICATION STATUS + LAST UPDATED");
  });
});

describe("Retrieval & Ask WINDELS (spec §29/§30)", () => {
  it("search finds concepts by alias and title", async () => {
    const res = await KnowledgeService.search(null, { q: "What is democracy?", audienceLevel: "high_school", scope: "catalog" });
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results.some((r) => r.id === "con.democracy")).toBe(true);
  });

  it("ask answers a definition question with the concept layer and sources", async () => {
    const res = await KnowledgeService.ask(null, { question: "What is inflation?", audienceLevel: "undergraduate" });
    expect(res.intent.intent).toBe("definition");
    expect(res.routing.domain).toBe("Concept layer");
    expect(res.matches.length).toBeGreaterThan(0);
    const top = res.matches[0]!;
    expect(top.id).toBe("con.inflation");
    expect(top.sources.length).toBeGreaterThan(0);
    expect(top.sections.length).toBeGreaterThan(0);
  });

  it("ask routes current-information questions to the dynamic layer with a note", async () => {
    const res = await KnowledgeService.ask(null, { question: "Who is the current president of Nigeria?" });
    expect(res.intent.intent).toBe("current_information");
    expect(res.routing.domain).toBe("Dynamic layer");
    expect(res.routing.note).toContain("never memorized");
  });

  it("ask answers an instruction question with steps", async () => {
    const res = await KnowledgeService.ask(null, { question: "How do I register a company?", audienceLevel: "high_school" });
    expect(res.intent.intent).toBe("instruction");
    expect(res.matches.some((m) => m.id === "ins.register-company")).toBe(true);
  });

  it("ask answers a comparison question from the comparison layer", async () => {
    const res = await KnowledgeService.ask(null, { question: "Python vs JavaScript — which is better?" });
    expect(res.intent.intent).toBe("comparison");
    expect(res.matches.some((m) => m.id === "cmp.python-vs-js")).toBe(true);
  });

  it("ask answers a history question from the timeline layer", async () => {
    const res = await KnowledgeService.ask(null, { question: "When did Nigeria gain independence?" });
    expect(res.intent.intent).toBe("history");
    expect(res.matches.some((m) => m.id === "when.nigeria")).toBe(true);
  });

  it("ask is honest when the catalog has no match", async () => {
    const res = await KnowledgeService.ask(null, { question: "Zxqvbn what is the orbital velocity of my left shoe" });
    expect(res.matches).toEqual([]);
    expect(res.note).toContain("do not have sufficient knowledge");
  });

  it("ask never fabricates sections for a level that lacks content", async () => {
    const res = await KnowledgeService.ask(null, { question: "Who was Ada Lovelace?", audienceLevel: "child" });
    expect(res.matches.length).toBeGreaterThan(0);
    const match = res.matches.find((m) => m.id === "who.lovelace")!;
    expect(match.sections.every((s) => s.body.length > 0)).toBe(true);
  });
});

describe("Org-scoped dynamic knowledge layer (spec §25)", () => {
  const orgA = "org-kn-test-a";
  const orgB = "org-kn-test-b";
  const userA = "user-a";
  const userB = "user-b";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a dynamic record with source + confidence + lastUpdated", async () => {
    const record = await KnowledgeService.addDynamicRecord(orgA, userA, {
      title: "Company ABC office hours",
      question: "What are Company ABC's office hours?",
      kind: "current_information",
      categoryIds: ["cat-09"],
      summary: "Company ABC opens at 09:00.",
      sources: [{ label: "Company ABC official website" }],
      asOfDate: "2026-08-08",
    });
    expect(record.provenance).toBe("self_reported");
    expect(record.tier).toBe("dynamic");
    expect(record.confidence).toBe("unverified");
    expect(record.lastUpdated).toBeTruthy();
    expect(record.sources!.length).toBe(1);

    const listed = await KnowledgeService.listDynamicRecords(orgA);
    expect(listed.some((r) => r.id === record.id)).toBe(true);
  });

  it("merges dynamic records into org-scoped search results", async () => {
    await KnowledgeService.addDynamicRecord(orgA, userA, {
      title: "ACME quarterly results",
      question: "What were ACME's quarterly results?",
      kind: "current_information",
      categoryIds: ["cat-09"],
      summary: "ACME reported its quarterly results.",
      sources: [{ label: "ACME investor relations" }],
      asOfDate: "2026-08-01",
    });
    const res = await KnowledgeService.search(orgA, { q: "ACME quarterly results", scope: "all" });
    expect(res.results.some((r) => r.scope === "organization")).toBe(true);
    // Another org must NOT see it
    const resB = await KnowledgeService.search(orgB, { q: "ACME quarterly results", scope: "all" });
    expect(resB.results.some((r) => r.scope === "organization")).toBe(false);
  });

  it("isolates records between organizations on read, update and delete", async () => {
    const record = await KnowledgeService.addDynamicRecord(orgA, userA, {
      title: "Org A internal policy",
      question: "What is Org A's internal policy?",
      categoryIds: ["cat-09"],
      summary: "Org A internal policy summary.",
      sources: [{ label: "Org A handbook" }],
    });

    expect(await KnowledgeService.getDynamicRecord(orgB, record.id)).toBeNull();
    expect(await KnowledgeService.updateDynamicRecord(orgB, userB, record.id, { summary: "hacked" })).toBeNull();
    expect(await KnowledgeService.deleteDynamicRecord(orgB, record.id)).toBe(false);

    const stillThere = await KnowledgeService.getDynamicRecord(orgA, record.id);
    expect(stillThere?.summary).toContain("internal policy");

    expect(await KnowledgeService.deleteDynamicRecord(orgA, record.id)).toBe(true);
    expect(await KnowledgeService.getDynamicRecord(orgA, record.id)).toBeNull();
  });

  it("refuses to update or delete catalog records through the dynamic layer", async () => {
    expect(await KnowledgeService.updateDynamicRecord(orgA, userA, "con.democracy", { summary: "x" })).toBeNull();
    expect(await KnowledgeService.deleteDynamicRecord(orgA, "con.democracy")).toBe(false);
  });

  it("updates lastUpdated on patch and keeps verification metadata", async () => {
    const record = await KnowledgeService.addDynamicRecord(orgA, userA, {
      title: "Exchange rate observation",
      question: "What is the exchange rate?",
      kind: "current_information",
      categoryIds: ["cat-11"],
      summary: "Observed rate on 1 August.",
      sources: [{ label: "Central bank website", url: "https://www.example.com/cbn" }],
      confidence: "unverified",
      asOfDate: "2026-08-01",
    });
    const updated = await KnowledgeService.updateDynamicRecord(orgA, userA, record.id, {
      confidence: "well_supported",
      asOfDate: "2026-08-02",
    });
    expect(updated?.confidence).toBe("well_supported");
    expect(updated?.asOfDate).toBe("2026-08-02");
    expect(updated?.lastUpdated >= record.lastUpdated).toBe(true);
    expect(updated?.sources?.length).toBe(1);
  });

  it("sanitizes unknown section keys on dynamic records", async () => {
    const record = await KnowledgeService.addDynamicRecord(orgA, userA, {
      title: "Sanitized sections test",
      question: "Test?",
      categoryIds: ["cat-90"],
      summary: "Testing section sanitization.",
      sections: { definition: "ok", evil_script: "<script>" },
      sources: [{ label: "test" }],
    });
    expect(record.sections.definition).toBe("ok");
    expect((record.sections as Record<string, string>).evil_script).toBeUndefined();
  });
});

describe("Stats & graph (spec §28)", () => {
  it("stats report catalog and org dynamic counts honestly", async () => {
    const stats = await KnowledgeService.stats("org-kn-stats");
    expect(stats.catalog.recordCount).toBeGreaterThan(100);
    expect(stats.catalog.categoryCount).toBe(90);
    expect(stats.dynamic.count).toBe(0);
    expect(stats.dynamic.note).toContain("self-reported");
  });

  it("graph resolves related nodes and reverse references", () => {
    const node = KnowledgeService.graphNode("con.democracy")!;
    expect(node.node.title).toBe("Democracy");
    expect(node.edges.length).toBeGreaterThan(0);
    expect(node.nodes.some((n) => n.id === "con.constitution")).toBe(true);
  });

  it("graph returns null for unknown ids", () => {
    expect(KnowledgeService.graphNode("nope")).toBeNull();
  });
});
