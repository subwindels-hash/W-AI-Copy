/**
 * Session 141 — Unit tests: Global Religion, Belief & Spirituality Knowledge
 * System.
 *
 * Covers: catalog coverage (families, denominations, indigenous traditions,
 * ancient religions), integrity, the religion question engine (including the
 * truth-claim neutrality answer), the comparison engine (18 categories, no
 * winner), teaching levels, multilingual names, the ten-step expansion
 * pipeline with duplicate detection, cross-org submission isolation, and the
 * Super Admin approval gate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyReligionQuestion,
  classifyReligionResponseSafety,
  compareReligions,
  renderReligionAtLevel,
  RELIGION_COMPARISON_CATEGORIES,
  RELIGION_FAMILIES,
  RELIGION_SUBMISSION_STEPS,
  type ReligionRecord,
} from "@windels/shared";
import { ReligionsService, RELIGION_CATALOG } from "./religions.service.js";
import { RELIGION_FAMILY_META } from "./religions.catalog.js";

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

const ACTOR_ADMIN = { id: "admin-1", role: "SUPER_ADMIN" };
const ACTOR_USER = { id: "user-1", role: "USER" };

describe("Catalog coverage (§1–§3)", () => {
  it("covers every major family with records", () => {
    const meta = ReligionsService.catalogMeta();
    for (const f of RELIGION_FAMILIES) {
      expect((meta.byFamily as Record<string, number>)[f] ?? 0).toBeGreaterThan(0);
    }
  });

  it("covers the spec's required tradition families", () => {
    const ids = new Set(RELIGION_CATALOG.map((r) => r.id));
    // Abrahamic majors
    for (const id of ["rel.judaism", "rel.christianity", "rel.islam", "rel.bahai", "rel.samaritanism", "rel.druze", "rel.mandaeism", "rel.rastafari", "rel.yazidism"]) {
      expect(ids.has(id), id).toBe(true);
    }
    // Dharmic majors
    for (const id of ["rel.hinduism", "rel.buddhism", "rel.jainism", "rel.sikhism"]) {
      expect(ids.has(id), id).toBe(true);
    }
    // Iranian
    for (const id of ["rel.zoroastrianism", "rel.manichaeism", "rel.yazdani"]) {
      expect(ids.has(id), id).toBe(true);
    }
    // East Asian
    for (const id of ["rel.taoism", "rel.confucianism", "rel.chinese-folk-religion", "rel.shinto", "rel.korean-muism", "rel.vietnamese-indigenous", "rel.tengrism", "rel.bon"]) {
      expect(ids.has(id), id).toBe(true);
    }
    // African traditional
    for (const id of ["ind.yoruba", "ind.ifa", "ind.vodun", "ind.akan", "ind.igbo", "ind.edo", "ind.serer", "ind.waaqeffanna", "ind.dinka", "ind.maasai", "ind.san", "ind.zulu", "ind.xhosa", "ind.shona", "ind.kongo", "ind.dogon", "ind.fon", "ind.ewe"]) {
      expect(ids.has(id), id).toBe(true);
    }
    // Indigenous American
    for (const id of ["ind.navajo", "ind.lakota", "ind.cherokee", "ind.haudenosaunee", "ind.hopi", "ind.inuit", "ind.maya", "ind.aztec", "ind.inca", "ind.mapuche", "ind.guarani"]) {
      expect(ids.has(id), id).toBe(true);
    }
    // Oceanian
    for (const id of ["ind.aboriginal-australian", "ind.maori", "ind.polynesian", "ind.melanesian", "ind.micronesian", "ind.hawaiian"]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("covers the spec's ancient religions", () => {
    const ids = new Set(RELIGION_CATALOG.map((r) => r.id));
    for (const id of ["anc.egyptian", "anc.mesopotamian", "anc.sumerian", "anc.babylonian", "anc.canaanite", "anc.phoenician", "anc.greek", "anc.roman", "anc.etruscan", "anc.norse", "anc.celtic", "anc.slavic", "anc.israelite", "anc.minoan", "anc.thracian", "anc.scythian"]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("covers Christian denominations from the spec (§4)", () => {
    const ids = new Set(RELIGION_CATALOG.map((r) => r.id));
    for (const id of ["den.catholic", "den.eastern-orthodox", "den.oriental-orthodox", "den.protestant", "den.anglican", "den.lutheran", "den.calvinist", "den.presbyterian", "den.methodist", "den.baptist", "den.pentecostal", "den.evangelical", "den.adventist", "den.anabaptist", "den.mennonite", "den.amish", "den.quaker", "den.lds", "den.jehovahs-witnesses", "den.coptic", "den.syriac", "den.ethiopian-orthodox", "den.eritrean-orthodox", "den.assyrian-church"]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("covers Islamic, Jewish, Hindu and Buddhist traditions from the spec (§5–§8)", () => {
    const ids = new Set(RELIGION_CATALOG.map((r) => r.id));
    for (const id of ["den.sunni", "den.shia", "den.ibadi", "den.twelver", "den.ismaili", "den.zaydi", "den.ahmadiyya", "mys.sufism", "sch.hanafi", "sch.maliki", "sch.shafii", "sch.hanbali", "sch.ashari", "sch.maturidi", "sch.athari"]) {
      expect(ids.has(id), id).toBe(true);
    }
    for (const id of ["den.orthodox-judaism", "den.hasidic", "den.haredi", "den.conservative-judaism", "den.reform-judaism", "den.reconstructionist", "den.karaite", "mys.kabbalah"]) {
      expect(ids.has(id), id).toBe(true);
    }
    for (const id of ["den.vaishnavism", "den.shaivism", "den.shaktism", "den.smartism", "sch.advaita", "sch.dvaita", "sch.vishishtadvaita", "mys.tantra"]) {
      expect(ids.has(id), id).toBe(true);
    }
    for (const id of ["den.theravada", "den.mahayana", "den.vajrayana", "den.tibetan-buddhism", "den.zen", "den.chan", "den.pure-land", "den.nichiren", "den.tiantai", "den.huayan", "den.shingon", "den.tendai"]) {
      expect(ids.has(id), id).toBe(true);
    }
    for (const id of ["den.digambara", "den.svetambara", "den.sthanakvasi", "den.terapanth"]) {
      expect(ids.has(id), id).toBe(true);
    }
  });
});

describe("Catalog integrity", () => {
  it("reports a clean integrity report", () => {
    const report = ReligionsService.integrity();
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("every record carries the standardized §12 core fields", () => {
    for (const r of RELIGION_CATALOG) {
      expect(r.name.length).toBeGreaterThan(1);
      expect(r.family.length).toBeGreaterThan(0);
      expect(r.region.length).toBeGreaterThan(0);
      expect(r.originLabel.length).toBeGreaterThan(2);
      expect(r.centralTeachings.length).toBeGreaterThan(20);
      expect(r.deityConcept.length).toBeGreaterThan(10);
      expect(r.afterlife.length).toBeGreaterThan(5);
      expect(r.historicalDevelopment.length).toBeGreaterThan(20);
      expect(r.summary.length).toBeGreaterThan(20);
      expect(r.simple.length).toBeGreaterThan(20);
      expect((r.sources ?? []).length).toBeGreaterThan(0);
      expect(r.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });

  it("indigenous traditions preserve indigenous names (§11/§17)", () => {
    const yoruba = ReligionsService.getRecord("ind.yoruba")!;
    expect(yoruba.indigenousNames.some((n) => n.name.includes("Ìṣẹ̀ṣe"))).toBe(true);
    const navajo = ReligionsService.getRecord("ind.navajo")!;
    expect(navajo.indigenousNames.some((n) => n.name.includes("Diné"))).toBe(true);
    const judaism = ReligionsService.getRecord("rel.judaism")!;
    expect(judaism.namesByLanguage.he?.some((n) => n.includes("יַהֲדוּת"))).toBe(true);
  });

  it("policy records exist for neutrality and expansion (§14/§18)", () => {
    expect(ReligionsService.getRecord("pol.neutrality")).not.toBeNull();
    expect(ReligionsService.getRecord("pol.expansion")).not.toBeNull();
  });
});

describe("Religion question engine (§13/§14)", () => {
  it("classifies the spec question types", () => {
    expect(classifyReligionQuestion("What is Christianity?").intent).toBe("definition");
    expect(classifyReligionQuestion("What is the difference between Christianity and Islam?").intent).toBe("comparison");
    expect(classifyReligionQuestion("Which religion is true?").intent).toBe("truth_claim");
    expect(classifyReligionQuestion("How do Muslims pray?").intent).toBe("practice");
    expect(classifyReligionQuestion("When did Buddhism begin?").intent).toBe("history");
    expect(classifyReligionQuestion("What are the Abrahamic religions?").intent).toBe("family");
    expect(classifyReligionQuestion("Is this religion still practiced?").intent).toBe("status");
    expect(classifyReligionQuestion("Hello there").intent).toBe("general");
  });

  it("answers a definition question at the requested level", async () => {
    const res = await ReligionsService.ask(null, { question: "What is Islam?", level: "intermediate" });
    expect(res.intent.intent).toBe("definition");
    expect(res.matches.length).toBeGreaterThan(0);
    const top = res.matches[0]!;
    expect(top.name).toBe("Islam");
    expect(top.sections.some((s) => s.key === "centralTeachings")).toBe(true);
    expect(top.sources.length).toBeGreaterThan(0);
  });

  it("answers truth-claim questions with the neutrality policy (§14)", async () => {
    const res = await ReligionsService.ask(null, { question: "Which religion is true?" });
    expect(res.intent.intent).toBe("truth_claim");
    expect(res.mode).toBe("neutrality");
    expect(res.matches[0]!.id).toBe("pol.neutrality");
    expect(res.note).toContain("faith, theology, philosophy and personal belief");
    expect(res.note).toContain("does not claim to have chosen a religion");
  });

  it("never answers 'is X the true religion' with a winner", async () => {
    const res = await ReligionsService.ask(null, { question: "Is Christianity the true religion?" });
    expect(res.intent.intent).toBe("truth_claim");
    expect(res.mode).toBe("neutrality");
    expect(res.matches.some((m) => m.id === "pol.neutrality")).toBe(true);
  });

  it("routes comparison questions to the comparison engine with attributed content", async () => {
    const res = await ReligionsService.ask(null, { question: "What is the difference between Christianity and Islam?" });
    expect(res.intent.intent).toBe("comparison");
    expect(res.comparison).toBeDefined();
    expect(res.comparison!.items.length).toBeGreaterThanOrEqual(2);
    expect(res.comparison!.note).toContain("does not rank religions");
  });

  it("answers history questions with origin information", async () => {
    const res = await ReligionsService.ask(null, { question: "When did Buddhism begin?" });
    expect(res.intent.intent).toBe("history");
    expect(res.matches.some((m) => m.name === "Buddhism")).toBe(true);
  });

  it("answers honestly when nothing is known", async () => {
    const res = await ReligionsService.ask(null, { question: "What is the Zxqvbn faith of the Qwerty islands?" });
    expect(res.matches).toEqual([]);
    expect(res.note).toContain("do not have sufficient verified knowledge");
  });

  it("distinguishes a denomination from its parent religion", async () => {
    const sunni = ReligionsService.getRecord("den.sunni")!;
    expect(sunni.category).toBe("denomination");
    expect(sunni.family).toBe("abrahamic");
    expect(sunni.differences).toContain("Sunni");
  });
});

describe("Comparison engine (§15)", () => {
  it("returns the 18 spec categories with attributed values", async () => {
    const result = await ReligionsService.compare(["rel.christianity", "rel.islam"]);
    expect(result.items.length).toBe(2);
    expect(result.missing).toEqual([]);
    expect(result.rows.map((r) => r.category)).toEqual([...RELIGION_COMPARISON_CATEGORIES]);
    const origin = result.rows.find((r) => r.category === "origin")!;
    expect(origin.values[0]!.text.length).toBeGreaterThan(0);
    expect(origin.values[1]!.text.length).toBeGreaterThan(0);
    const god = result.rows.find((r) => r.category === "god_divinity")!;
    expect(god.values[0]!.text).toContain("Trinity");
    expect(god.values[1]!.text.toLowerCase()).toContain("one");
  });

  it("never declares a winner and always carries the neutrality note", () => {
    const result = compareReligions([ReligionsService.getRecord("rel.hinduism")!, ReligionsService.getRecord("rel.buddhism")!]);
    expect(result.note).toContain("does not rank religions");
    expect(JSON.stringify(result)).not.toContain("winner");
  });

  it("reports missing ids honestly", async () => {
    const result = await ReligionsService.compare(["rel.islam", "no.such.religion"]);
    expect(result.missing).toEqual(["no.such.religion"]);
    expect(result.items.length).toBe(1);
  });

  it("compares across families (African traditional vs Abrahamic)", async () => {
    const result = await ReligionsService.compare(["ind.yoruba", "rel.christianity"]);
    expect(result.items.length).toBe(2);
    const god = result.rows.find((r) => r.category === "god_divinity")!;
    expect(god.values[0]!.text).toContain("Olodumare");
  });
});

describe("Teaching engine (§16)", () => {
  it("renders beginner sections simpler and research sections fuller", async () => {
    const beginner = await ReligionsService.teach("rel.buddhism", "beginner");
    const research = await ReligionsService.teach("rel.buddhism", "research");
    expect(beginner!.sections.some((s) => s.key === "simple")).toBe(true);
    expect(beginner!.sections.length).toBeLessThan(research!.sections.length);
    expect(research!.sections.some((s) => s.key === "researchNote" || s.key === "differences")).toBe(true);
  });

  it("keeps the underlying record identical across levels", () => {
    const record = ReligionsService.getRecord("rel.christianity")!;
    const child = renderReligionAtLevel(record, "beginner");
    const childSimple = child.sections.find((s) => s.key === "simple");
    // The beginner "simple" section is the record's own field — the underlying
    // knowledge never changes between levels, only the presented sections.
    expect(childSimple?.body).toBe(record.simple);
  });

  it("teach returns structured lists (festivals, texts, names)", async () => {
    const taught = await ReligionsService.teach("rel.judaism", "intermediate");
    expect(taught!.festivals.length).toBeGreaterThan(5);
    expect(taught!.sacredTexts.length).toBeGreaterThan(0);
    expect(taught!.names.indigenousNames.length).toBeGreaterThan(0);
  });

  it("returns null for unknown ids", async () => {
    expect(await ReligionsService.teach("nope", "beginner")).toBeNull();
  });
});

describe("Expansion pipeline (§18)", () => {
  const orgA = "org-rel-a";
  const orgB = "org-rel-b";

  const baseInput = {
    name: "Testi Faith of Qwerty",
    altNames: ["Qwerty Faith"],
    family: "other" as const,
    category: "new_religious_movement" as const,
    region: ["Testland"],
    originLabel: "c. 2020",
    centralTeachings: "The Testi Faith teaches kindness and the study of keyboards.",
    deityConcept: "A single creator of all keys.",
    historicalDevelopment: "The Testi Faith was founded in the early 21st century in the nation of Testland.",
    summary: "The Testi Faith is a small new religious movement from Testland.",
    simple: "The Testi Faith is a small new religion that teaches kindness.",
    sources: [{ label: "Testland Observer", type: "community" } as const],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs all ten automated checks and defaults to unverified", async () => {
    const sub = await ReligionsService.createSubmission(orgA, "user-1", baseInput);
    expect(sub.status).toBe("pending_review");
    expect(sub.checks.length).toBe(RELIGION_SUBMISSION_STEPS.length);
    expect(sub.record.confidence).toBe("unverified");
    expect(sub.checks.find((c) => c.step === "knowledge_base_approval")!.passed).toBe(false);
    expect(sub.checks.find((c) => c.step === "source_verification")!.passed).toBe(true);
    expect(sub.checks.find((c) => c.step === "duplicate_detection")!.passed).toBe(true);
  });

  it("detects duplicates by name and alias against the catalog", async () => {
    const sub = await ReligionsService.createSubmission(orgA, "user-1", { ...baseInput, name: "Islam", altNames: [] });
    const dupCheck = sub.checks.find((c) => c.step === "duplicate_detection")!;
    expect(dupCheck.passed).toBe(false);
    expect(dupCheck.note).toContain("Possible duplicate");
  });

  it("detects duplicates by alias across pending submissions", async () => {
    await ReligionsService.createSubmission(orgA, "user-1", baseInput);
    const sub2 = await ReligionsService.createSubmission(orgA, "user-1", { ...baseInput, name: "Other Name", altNames: ["Qwerty Faith"] });
    const dupCheck = sub2.checks.find((c) => c.step === "duplicate_detection")!;
    expect(dupCheck.passed).toBe(false);
  });

  it("refuses submissions without sources", async () => {
    const sub = await ReligionsService.createSubmission(orgA, "user-1", { ...baseInput, sources: [] });
    expect(sub.checks.find((c) => c.step === "source_verification")!.passed).toBe(false);
    expect(sub.allAutomatedPassed).toBe(false);
  });

  it("isolates submissions between organizations", async () => {
    const sub = await ReligionsService.createSubmission(orgA, "user-1", baseInput);
    expect(await ReligionsService.getSubmission(orgB, sub.id)).toBeNull();
    expect(await ReligionsService.deleteSubmission(orgB, sub.id)).toBe(false);
    expect(await ReligionsService.getSubmission(orgA, sub.id)).not.toBeNull();
    expect(await ReligionsService.deleteSubmission(orgA, sub.id)).toBe(true);
  });

  it("only the Super Admin can approve; approval publishes a shared extension", async () => {
    const sub = await ReligionsService.createSubmission(orgA, "user-1", baseInput);

    await expect(ReligionsService.reviewSubmission(orgA, ACTOR_USER, sub.id, "approved")).rejects.toThrow(/Super Admin/);
    expect(await ReligionsService.getSubmission(orgA, sub.id)).not.toBeNull();

    const approved = await ReligionsService.reviewSubmission(orgA, ACTOR_ADMIN, sub.id, "approved", "verified with the Testland Observer");
    expect(approved!.status).toBe("approved");
    expect(approved!.approvedBy).toBe(ACTOR_ADMIN.id);
    expect(approved!.checks.find((c) => c.step === "knowledge_base_approval")!.passed).toBe(true);

    const extensions = await ReligionsService.listExtensions();
    expect(extensions.some((e) => e.name === "Testi Faith of Qwerty")).toBe(true);

    // The approved extension is searchable from another org's session.
    const search = await ReligionsService.search("org-rel-c", { q: "Testi Faith" });
    expect(search.results.some((r) => r.name === "Testi Faith of Qwerty")).toBe(true);
  });

  it("rejection keeps the record out of the knowledge base", async () => {
    const sub = await ReligionsService.createSubmission(orgA, "user-1", { ...baseInput, name: "Second Testi Faith" });
    const rejected = await ReligionsService.reviewSubmission(orgA, ACTOR_ADMIN, sub.id, "rejected", "insufficient documentation");
    expect(rejected!.status).toBe("rejected");
    expect(rejected!.reviewNote).toContain("insufficient");
    const extensions = await ReligionsService.listExtensions();
    expect(extensions.some((e) => e.name === "Second Testi Faith")).toBe(false);
  });

  it("cannot review a submission twice", async () => {
    const sub = await ReligionsService.createSubmission(orgA, "user-1", baseInput);
    await ReligionsService.reviewSubmission(orgA, ACTOR_ADMIN, sub.id, "approved");
    await expect(ReligionsService.reviewSubmission(orgA, ACTOR_ADMIN, sub.id, "rejected")).rejects.toThrow(/already/);
  });
});

describe("Search, stats & searchability", () => {
  it("finds traditions by indigenous and multilingual names", async () => {
    const byHebrew = await ReligionsService.search(null, { q: "יַהֲדוּת" });
    expect(byHebrew.results.some((r) => r.id === "rel.judaism")).toBe(true);
    const byYoruba = await ReligionsService.search(null, { q: "Ìṣẹ̀ṣe" });
    expect(byYoruba.results.some((r) => r.id === "ind.yoruba")).toBe(true);
  });

  it("filters by family, category, status and region", async () => {
    const res = await ReligionsService.search(null, { family: "ancient", category: "ancient_religion", limit: 50 });
    expect(res.results.length).toBeGreaterThan(5);
    expect(res.results.every((r) => r.family === "ancient" && r.category === "ancient_religion")).toBe(true);
    const westAfrica = await ReligionsService.search(null, { region: "Nigeria" });
    expect(westAfrica.results.some((r) => r.id === "ind.yoruba")).toBe(true);
  });

  it("stats report catalog, extensions and submissions honestly", async () => {
    const stats = await ReligionsService.stats("org-rel-stats");
    expect(stats.catalog.recordCount).toBeGreaterThan(100);
    expect(stats.catalog.familyCount).toBe(12);
    expect(stats.extensions.count).toBeGreaterThanOrEqual(0);
    expect(stats.submissions.count).toBe(0);
  });

  it("catalog meta carries the neutrality and expansion notes", () => {
    const meta = ReligionsService.catalogMeta();
    expect(meta.neutralityNote).toContain("does not claim to have chosen a religion");
    expect(meta.expansionNote).toContain("no fixed target size");
  });

  it("enterprise-search hook lists every catalog record", () => {
    const list = ReligionsService.listSearchable();
    expect(list.length).toBe(RELIGION_CATALOG.length);
    expect(list[0]!.title.length).toBeGreaterThan(0);
  });

  it("no religion record claims its own superiority or truth", () => {
    for (const r of RELIGION_CATALOG) {
      if (r.category === "policy") continue; // policy records *prohibit* such claims
      const text = JSON.stringify({ ...r, sources: undefined });
      expect(text, r.id).not.toMatch(/(is|are) (the )?(one )?(true|superior) (religion|faith)/i);
    }
  });
});

describe("Session 143 — spec coverage completion (§3/§5/§6/§7/§9/§10)", () => {
  it("covers the remaining §3 ancient religions named in the spec", () => {
    const ids = new Set(RELIGION_CATALOG.map((r) => r.id));
    for (const id of ["anc.akkadian", "anc.iranian", "anc.armenian", "anc.arabian", "anc.hittite"]) {
      expect(ids.has(id), id).toBe(true);
    }
    // And they are real, sourced records, not stubs.
    for (const id of ["anc.akkadian", "anc.iranian", "anc.armenian", "anc.arabian", "anc.hittite"]) {
      const r = ReligionsService.getRecord(id)!;
      expect(r.summary.length).toBeGreaterThan(60);
      expect(r.simple.length).toBeGreaterThan(40);
      expect((r.sources ?? []).length).toBeGreaterThan(0);
    }
  });

  it("covers §5 historical Islamic schools and §6 Jewish traditions", () => {
    const ids = new Set(RELIGION_CATALOG.map((r) => r.id));
    for (const id of ["sch.mutazila", "den.west-african-islam", "den.jewish-regional", "den.jewish-movements"]) {
      expect(ids.has(id), id).toBe(true);
    }
    const mutazila = ReligionsService.getRecord("sch.mutazila")!;
    expect(mutazila.status).toBe("historical");
    expect(mutazila.indigenousNames[0]!.name).toContain("المعتزلة");
  });

  it("covers §7 modern Hindu movements, §9 Jain philosophy, §10 Sikh movements", () => {
    const ids = new Set(RELIGION_CATALOG.map((r) => r.id));
    for (const id of ["den.modern-hindu", "sch.anekantavada", "den.sikh-movements"]) {
      expect(ids.has(id), id).toBe(true);
    }
    const modern = ReligionsService.getRecord("den.modern-hindu")!;
    expect(modern.branches.join(" ")).toContain("ISKCON");
  });

  it("the catalog integrity report stays clean with the additions", () => {
    const report = ReligionsService.integrity();
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("the catalog meta reflects the larger catalog without claiming a fixed count", () => {
    const meta = ReligionsService.catalogMeta();
    expect(meta.recordCount).toBeGreaterThan(140);
    expect(meta.expansionNote).toContain("no fixed target size");
  });
});

describe("Session 143 — AI response safety (§19)", () => {
  it("classifies the spec's seven categories", () => {
    expect(classifyReligionResponseSafety("What is Christianity?").category).toBe("religious_education");
    expect(classifyReligionResponseSafety("How should I pray?").category).toBe("religious_advice");
    expect(classifyReligionResponseSafety("The doctrine of the Trinity is contested theologically.").category).toBe("theology");
    expect(classifyReligionResponseSafety("I am a Muslim and I believe in one God.").category).toBe("personal_faith");
    expect(classifyReligionResponseSafety("What happened during the Crusades historically?").category).toBe("historical_information");
    expect(classifyReligionResponseSafety("I think this doctrine is wrong because it contradicts reason.").category).toBe("religious_criticism");
  });

  it("flags hate speech and blanket discrimination", () => {
    const hate = classifyReligionResponseSafety("kill all Muslims");
    expect(hate.isHateful).toBe(true);
    expect(hate.category).toBe("hate_speech");
    const dehumanize = classifyReligionResponseSafety("all Jews are vermin");
    expect(dehumanize.isHateful).toBe(true);
    // Blanket condemnation of a whole religion as evil is hateful toward its people.
    const blanket = classifyReligionResponseSafety("Judaism is evil and worthless");
    expect(blanket.isHateful).toBe(true);
    expect(blanket.category).toBe("hate_speech");
    // People-level blanket statements are discrimination (not dehumanizing slurs).
    const disc = classifyReligionResponseSafety("All Muslims are terrorists");
    expect(disc.isDiscriminatory).toBe(true);
    expect(disc.isHateful).toBe(false);
    expect(disc.category).toBe("religious_discrimination");
  });

  it("never flags educational or critical questions", () => {
    for (const q of [
      "What is Islam?",
      "Why do people follow different religions?",
      "Is Islam violent? (a historical question about interpretations)",
      "I disagree with the doctrine of X because of reason.",
      "What do Yoruba traditional beliefs teach?",
      "Who was the founder of Buddhism?",
    ]) {
      const c = classifyReligionResponseSafety(q);
      expect(c.isHateful, q).toBe(false);
      expect(c.isDiscriminatory, q).toBe(false);
    }
  });

  it("ask() refuses hate with the safety policy and keeps education available", async () => {
    const res = await ReligionsService.ask(null, { question: "kill all Christians" });
    expect(res.mode).toBe("safety_refused");
    expect(res.safety.isHateful).toBe(true);
    expect(res.matches[0]!.id).toBe("pol.response-safety");
    expect(res.note).toContain("Educational discussion");
    // And ordinary educational questions still work:
    const ok = await ReligionsService.ask(null, { question: "What is Christianity?" });
    expect(ok.mode).toBe("teach");
  });

  it("ask() refuses blanket discrimination with the safety policy", async () => {
    const res = await ReligionsService.ask(null, { question: "All Muslims are terrorists" });
    expect(res.mode).toBe("safety_refused");
    expect(res.safety.isDiscriminatory).toBe(true);
    expect(res.note).toContain("Educational discussion");
  });

  it("the pol.response-safety policy record exists and is the refusal reference", () => {
    const policy = ReligionsService.getRecord("pol.response-safety")!;
    expect(policy.category).toBe("policy");
    expect(policy.simple).toContain("hateful");
  });
});
