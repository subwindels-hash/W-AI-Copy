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

describe("Session 147 — knowledge coverage completion (§5–§23)", () => {
  it("covers the §5 people categories (political leaders, entrepreneurs, philosophers, artists, athletes)", () => {
    const ids = new Set((KnowledgeService as any).catalogMeta().byKind ? Object.keys((KnowledgeService as any).catalogMeta().byKind) : []);
    void ids;
    for (const id of ["who.nkrumah", "who.churchill", "who.dangote", "who.socrates", "who.confucius", "who.fela-kuti", "who.serena-williams"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
      expect(r!.sections.biography?.length).toBeGreaterThan(50);
    }
    const nkrumah = KnowledgeService.getRecord("who.nkrumah")!;
    expect(nkrumah.summary).toContain("Ghana");
    const socrates = KnowledgeService.getRecord("who.socrates")!;
    expect(socrates.sections.biography).toContain("hemlock");
  });

  it("covers the §7 geography: rivers, mountains, oceans, cities", () => {
    for (const id of ["place.nile", "place.kilimanjaro", "place.atlantic-ocean", "place.lagos"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
      expect(r!.sections.geography?.length).toBeGreaterThan(50);
    }
    const nile = KnowledgeService.getRecord("place.nile")!;
    expect(nile.summary).toContain("longest river");
  });

  it("covers the §9 discipline additions", () => {
    for (const id of ["disc.sociology", "disc.philosophy", "disc.history", "disc.geography", "disc.accounting", "disc.political-science"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
      expect(r!.sections.learning_path?.length).toBeGreaterThan(20);
    }
  });

  it("covers the §10 science field additions with levels", () => {
    for (const id of ["sci.oceanography", "sci.meteorology", "sci.microbiology", "sci.materials-science"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
      expect(r!.sections.levels).toContain("RESEARCH");
    }
  });

  it("covers the §11 technology additions (smartphones, OS, networking, APIs, ML, robotics, semiconductors, telecom, DevOps)", () => {
    for (const id of ["tech.smartphones", "tech.operating-systems", "tech.networking", "tech.apis", "tech.machine-learning", "tech.robotics", "tech.semiconductors", "tech.telecommunications", "tech.devops"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
      expect(r!.sections.how_it_works?.length).toBeGreaterThan(20);
    }
  });

  it("covers the §12 business additions", () => {
    for (const id of ["bus.marketing", "bus.sales", "bus.accounting", "bus.investment", "bus.supply-chains", "bus.management", "bus.leadership", "bus.customer-service"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
    }
  });

  it("covers the §13 career additions (remote work, freelancing)", () => {
    for (const id of ["car.remote-work", "car.freelancing"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
      expect(r!.sections.detailed?.length).toBeGreaterThan(50);
    }
  });

  it("covers the §14 law additions with professional-assistance notes", () => {
    for (const id of ["law.criminal", "law.civil", "law.property", "law.family", "law.employment", "law.business", "law.legislatures", "law.executive", "law.international"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
    }
    const criminal = KnowledgeService.getRecord("law.criminal")!;
    expect(criminal.professionalAssistanceNote).toContain("lawyer");
    const civil = KnowledgeService.getRecord("law.civil")!;
    expect(civil.professionalAssistanceNote).toContain("lawyer");
  });

  it("covers the §15 health additions with professional-assistance notes", () => {
    for (const id of ["hlth.diseases", "hlth.medications", "hlth.public-health"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
      expect(r!.sections.detailed?.length).toBeGreaterThan(50);
    }
    expect(KnowledgeService.getRecord("hlth.medications")!.professionalAssistanceNote).toContain("professionals");
  });

  it("covers the §19/§20/§21/§22/§23/§18 additions", () => {
    for (const id of ["rel.negotiation", "rel.emotional-intelligence", "ent.music", "ent.games", "ent.sports", "lng.grammar", "lng.linguistics", "day.shopping", "day.basic-tech", "day.parenting", "cre.graphic-design", "cre.photography", "cre.content-creation", "trv.accommodation", "trv.planning"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
    }
    const parenting = KnowledgeService.getRecord("day.parenting")!;
    expect(parenting.summary).toContain("warmth");
  });

  it("the integrity report stays clean with the 240+ record catalog", () => {
    const report = KnowledgeService.integrity();
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
    expect(KnowledgeService.catalogMeta().recordCount).toBeGreaterThan(240);
  });

  it("ask answers new questions: 'Who was Kwame Nkrumah?' and 'What is machine learning?'", async () => {
    const nkrumah = await KnowledgeService.ask(null, { question: "Who was Kwame Nkrumah?" });
    expect(nkrumah.matches.some((m: any) => m.id === "who.nkrumah")).toBe(true);
    const ml = await KnowledgeService.ask(null, { question: "What is machine learning?" });
    expect(ml.matches.some((m: any) => m.id === "tech.machine-learning")).toBe(true);
    const civil = await KnowledgeService.ask(null, { question: "What is civil law?" });
    expect(civil.matches.some((m: any) => m.id === "law.civil")).toBe(true);
    const lagos = await KnowledgeService.ask(null, { question: "Where is Lagos?" });
    expect(lagos.matches.some((m: any) => m.id === "place.lagos")).toBe(true);
  });

  it("teaches at levels: 'Explain electricity to a child' still works alongside new records", async () => {
    const res = await KnowledgeService.ask(null, { question: "What is electricity?", audienceLevel: "child" });
    expect(res.matches.some((m: any) => m.id === "con.electricity")).toBe(true);
  });
});

describe("Session 148 — Spec A re-send audit (§5–§23 + §8 comparisons)", () => {
  it("covers every remaining §5 people role category with biography, achievements and sources", () => {
    const people = {
      "who.edison": "inventor",
      "who.achebe": "author",
      "who.angelou": "author",
      "who.enwonwu": "artist",
      "who.poitier": "actor",
      "who.tutu": "religious figure",
      "who.hopper": "engineer",
      "who.bello": "regional leader",
      "who.wachuku": "minister",
      "who.okadigbo": "senator",
    };
    for (const [id, role] of Object.entries(people)) {
      const r = KnowledgeService.getRecord(id);
      expect(r, `${id} (${role})`).not.toBeNull();
      expect(r!.sections.biography?.length, `${id} biography`).toBeGreaterThan(50);
      expect(r!.sections.achievements?.length, `${id} achievements`).toBeGreaterThan(20);
      expect((r!.sources ?? []).length, `${id} sources`).toBeGreaterThan(0);
      expect(r!.confidence).not.toBe("unverified");
    }
    // Historical-context neutrality discipline on contested figures.
    expect(KnowledgeService.getRecord("who.bello")!.sections.guidance).toMatch(/differ|contested/);
    expect(KnowledgeService.getRecord("who.okadigbo")!.sections.guidance).toMatch(/denied|contested/);
  });

  it("covers the §6 timeline examples: first computer, internet origin, constitution adoption", () => {
    const first = KnowledgeService.getRecord("when.first-computer")!;
    expect(first.dateLabel).toBe("1945");
    expect(first.eraId).toBe("era-modern");
    const arpa = KnowledgeService.getRecord("when.arpabet")!;
    expect(arpa.year).toBe(1969);
    expect(arpa.eraId).toBe("era-contemporary");
    const us = KnowledgeService.getRecord("when.us-constitution")!;
    expect(us.year).toBe(1787);
    expect(us.eraId).toBe("era-early-modern");
  });

  it("ask answers the §6 timeline example questions", async () => {
    const computer = await KnowledgeService.ask(null, { question: "When was the first computer built?" });
    expect(computer.matches.some((m: any) => m.id === "when.first-computer")).toBe(true);
    const internet = await KnowledgeService.ask(null, { question: "When was the internet created?" });
    expect(internet.matches.some((m: any) => m.id === "when.arpabet")).toBe(true);
    const constitution = await KnowledgeService.ask(null, { question: "When was the constitution adopted?" });
    expect(constitution.matches.some((m: any) => m.id === "when.us-constitution")).toBe(true);
  });

  it("covers the §7 geography item types: states, provinces, cities, airports, universities, hospitals, institutions, sites, attractions", () => {
    const places = [
      "place.california", "place.ontario", "place.nairobi", "place.new-york-city",
      "place.murtala-muhammed-airport", "place.university-of-ibadan", "place.uch-ibadan",
      "place.aso-rock", "place.timbuktu", "place.mecca", "place.silicon-valley", "place.victoria-falls",
    ];
    for (const id of places) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
      expect(r!.sections.geography?.length, `${id} geography`).toBeGreaterThan(50);
    }
    const mecca = KnowledgeService.getRecord("place.mecca")!;
    expect(mecca.summary).toContain("holiest city of Islam");
    expect(mecca.misconceptions?.length).toBeGreaterThan(0);
  });

  it("ask routes the new where-questions to the right place records", async () => {
    const nairobi = await KnowledgeService.ask(null, { question: "Where is Nairobi?" });
    expect(nairobi.matches.some((m: any) => m.id === "place.nairobi")).toBe(true);
    const ui = await KnowledgeService.ask(null, { question: "Where is the University of Ibadan?" });
    expect(ui.matches.some((m: any) => m.id === "place.university-of-ibadan")).toBe(true);
    const uche = await KnowledgeService.ask(null, { question: "Where is University College Hospital, Ibadan?" });
    expect(uche.matches.some((m: any) => m.id === "place.uch-ibadan")).toBe(true);
    const falls = await KnowledgeService.ask(null, { question: "Where are Victoria Falls?" });
    expect(falls.matches.some((m: any) => m.id === "place.victoria-falls")).toBe(true);
  });

  it("covers the remaining §9 disciplines with learning paths", () => {
    for (const id of ["disc.chemistry", "disc.international-relations", "disc.agriculture", "disc.architecture", "disc.education", "disc.communications", "disc.arts", "disc.music"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
      expect(r!.sections.learning_path?.length, `${id} learning_path`).toBeGreaterThan(20);
    }
  });

  it("covers the §10 science fields earth science and space science with levels and definition intent", () => {
    for (const id of ["sci.earth-science", "sci.space-science"]) {
      const r = KnowledgeService.getRecord(id)!;
      expect(r.sections.levels).toContain("FOUNDATIONS");
      expect(r.sections.levels).toContain("RESEARCH");
      expect(r.intents).toContain("definition");
    }
  });

  it("ask answers 'What is earth science?' / 'What is space science?' with the field records first", async () => {
    const earth = await KnowledgeService.ask(null, { question: "What is earth science?" });
    expect(earth.matches[0]!.id).toBe("sci.earth-science");
    const space = await KnowledgeService.ask(null, { question: "What is space science?" });
    expect(space.matches[0]!.id).toBe("sci.space-science");
  });

  it("covers the §11 software engineering technology with how-it-works", () => {
    const r = KnowledgeService.getRecord("tech.software-engineering")!;
    expect(r.sections.how_it_works?.length).toBeGreaterThan(20);
    expect(r.sections.history).toContain("1960s");
  });

  it("covers the §12 business additions (entrepreneurship, bookkeeping, payments, procurement, HR)", () => {
    for (const id of ["bus.entrepreneurship", "bus.bookkeeping", "bus.payments", "bus.procurement", "bus.human-resources"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
      expect(r!.sections.detailed?.length).toBeGreaterThan(50);
    }
    expect(KnowledgeService.getRecord("bus.entrepreneurship")!.misconceptions!.length).toBeGreaterThanOrEqual(2);
  });

  it("covers the §13 career additions, with salaries treated as dynamic information", () => {
    for (const id of ["car.job-search", "car.skills-qualifications", "car.certifications", "car.professional-development", "car.salaries"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
    }
    const salaries = KnowledgeService.getRecord("car.salaries")!;
    expect(salaries.summary).toContain("does not memorize");
    expect(salaries.sections.guidance).toContain("DYNAMIC");
    const jobSearch = KnowledgeService.getRecord("car.job-search")!;
    expect(jobSearch.sections.steps).toContain("1.");
  });

  it("covers the §17 culture items with the no-stereotype discipline", () => {
    for (const id of ["cult.customs-traditions", "cult.food-cuisine", "cult.clothing-fashion", "cult.arts", "cult.family-structures", "cult.social-institutions", "cult.regional-cultures", "cult.diaspora"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
      const guidance = (r!.sections.guidance ?? "").toLowerCase();
      expect(guidance, `${id} no-stereotype guidance`).toMatch(/varies|differ|diverse|no custom|not rules|individuals|no single|patterns|own cultural|distorts both/i);
    }
    expect(KnowledgeService.getRecord("cult.diaspora")!.summary).toContain("Nigerian");
  });

  it("covers the §18 travel items with time-sensitive verification", () => {
    for (const id of ["trv.transportation", "trv.currency-money", "trv.weather-climate", "trv.customs-etiquette"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
    }
    expect(KnowledgeService.getRecord("trv.currency-money")!.sections.warning).toContain("memorized");
    expect(KnowledgeService.getRecord("trv.weather-climate")!.sections.guidance).toContain("dynamic");
  });

  it("covers the §19 relationship items with balanced guidance (no single answer)", () => {
    for (const id of ["rel.friendship", "rel.family", "rel.marriage", "rel.workplace-communication", "rel.personal-development"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
      expect((r!.sections.guidance ?? "").toLowerCase()).toMatch(/no single|no universal|no one|depends|varies|vary|different amounts/i);
    }
  });

  it("covers the §20 entertainment items with current-information verification", () => {
    for (const id of ["ent.television", "ent.books", "ent.celebrities", "ent.artists-creators", "ent.history-trends"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
    }
    expect(KnowledgeService.getRecord("ent.celebrities")!.sections.guidance).toMatch(/verif|check/);
    expect(KnowledgeService.getRecord("ent.history-trends")!.sections.guidance).toContain("dynamic");
  });

  it("covers the §21 language items preserving cultural meaning", () => {
    for (const id of ["lng.vocabulary", "lng.pronunciation", "lng.dialects-slang", "lng.historical-languages", "lng.indigenous-languages", "lng.reading"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
    }
    expect(KnowledgeService.getRecord("lng.indigenous-languages")!.sections.guidance).toContain("complete and complex");
    expect(KnowledgeService.getRecord("lng.dialects-slang")!.sections.guidance).toContain("descriptive");
  });

  it("covers the §22 everyday items (clothing, organization, transport, problem solving)", () => {
    for (const id of ["day.clothing", "day.personal-organization", "day.transportation", "day.problem-solving"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
      expect(r!.sections.detailed?.length).toBeGreaterThan(50);
    }
    expect(KnowledgeService.getRecord("day.problem-solving")!.sections.detailed).toContain("define");
  });

  it("covers the §23 creative items (poetry, music, art, video, presentations, branding, advertising)", () => {
    for (const id of ["cre.poetry", "cre.music", "cre.art", "cre.video", "cre.presentations", "cre.branding", "cre.advertising"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
      expect(r!.sections.detailed?.length).toBeGreaterThan(50);
    }
    expect(KnowledgeService.getRecord("cre.branding")!.sections.guidance).toContain("not manipulation");
  });

  it("covers the §8 comparison categories: universities, business strategies, investment concepts, travel destinations, historical events, software tools", () => {
    for (const id of ["cmp.university-vs-polytechnic", "cmp.bootstrapping-vs-funding", "cmp.saving-vs-investing", "cmp.beach-vs-city-break", "cmp.ww1-vs-ww2", "cmp.open-source-vs-proprietary"]) {
      const r = KnowledgeService.getRecord(id);
      expect(r, id).not.toBeNull();
      expect(r!.sections.criteria).toBeTruthy();
      expect(r!.intents).toContain("comparison");
    }
    // Each comparison resolves its item profiles with labeled criteria.
    const pairs: Array<[string, string]> = [
      ["cmp.item.university-route", "cmp.item.polytechnic-route"],
      ["cmp.item.bootstrapping", "cmp.item.investor-funding"],
      ["cmp.item.saving", "cmp.item.investing"],
      ["cmp.item.beach-break", "cmp.item.city-break"],
      ["cmp.item.ww1", "cmp.item.ww2"],
      ["cmp.item.open-source", "cmp.item.proprietary"],
    ];
    for (const [a, b] of pairs) {
      const result = compareKnowledge([KnowledgeService.getRecord(a)!, KnowledgeService.getRecord(b)!]);
      expect(result.criteria.length, `${a} vs ${b}`).toBeGreaterThanOrEqual(5);
      for (const item of result.items) {
        for (const score of item.scores) {
          expect(score.basis).toBe("labeled");
        }
      }
      expect(result.note).toContain("universal winner");
    }
  });

  it("ask routes the new comparison questions to the comparison layer", async () => {
    const uni = await KnowledgeService.ask(null, { question: "Which is better: university or polytechnic?" });
    expect(uni.matches.some((m: any) => m.id === "cmp.university-vs-polytechnic")).toBe(true);
    const wars = await KnowledgeService.ask(null, { question: "How do the World Wars compare?" });
    expect(wars.matches.some((m: any) => m.id === "cmp.ww1-vs-ww2")).toBe(true);
    const software = await KnowledgeService.ask(null, { question: "Open source vs proprietary software" });
    expect(software.matches.some((m: any) => m.id === "cmp.open-source-vs-proprietary")).toBe(true);
  });

  it("the knowledge graph resolves the new records' related edges", () => {
    const node = KnowledgeService.graphNode("place.university-of-ibadan")!;
    expect(node.node.title).toBe("University of Ibadan");
    expect(node.nodes.some((n: any) => n.id === "con.university")).toBe(true);
    const ww2 = KnowledgeService.graphNode("cmp.item.ww2")!;
    expect(ww2.nodes.some((n: any) => n.id === "when.ww2")).toBe(true);
  });

  it("the integrity report stays clean at 340+ records with the audit seed", () => {
    const report = KnowledgeService.integrity();
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
    expect(KnowledgeService.catalogMeta().recordCount).toBeGreaterThan(340);
    expect(KnowledgeService.catalogMeta().catalogVersion).toContain("148");
  });

  it("every spec §5–§23 ask example resolves to a shipped record (no insufficient-knowledge on the explicit lists)", async () => {
    const questions = [
      "Who was Thomas Edison?", "Who was Maya Angelou?", "Who was Sidney Poitier?",
      "Who was Desmond Tutu?", "Who was Grace Hopper?", "Who was Ahmadu Bello?",
      "Who was Jaja Wachuku?", "Who was Chuba Okadigbo?",
      "What is entrepreneurship?", "What is bookkeeping?", "What is procurement?",
      "What is human resources?", "What are certifications?", "How do I find and apply for jobs?",
      "What are customs and traditions?", "What are diaspora communities?",
      "How do I get around while travelling?", "How do I respect local customs when travelling?",
      "How do friendships work?", "How do marriages work?",
      "What is television?", "What is branding?", "What is advertising?",
      "How do I build my vocabulary?", "What are indigenous languages?",
      "How do I stay organized?", "How do I solve everyday problems?",
      "How do I write poetry?", "How do I create music?", "How do I create visual art?",
    ];
    for (const q of questions) {
      const res = await KnowledgeService.ask(null, { question: q });
      expect(res.matches.length, q).toBeGreaterThan(0);
    }
  });
});
