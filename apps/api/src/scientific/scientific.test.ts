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

const { ScientificService } = await import("./scientific.service.js");

const ORG_A = "org-sci-a";
const ORG_B = "org-sci-b";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("Scientific — Session 160 completion", () => {
  it("does not seed experiments, papers or hypotheses when demo data is off", async () => {
    await ScientificService.ensureBootstrapped(undefined, ORG_A);
    expect(await ScientificService.listExperiments(ORG_A)).toEqual([]);
    expect(await ScientificService.listPapers(ORG_A)).toEqual([]);
    expect(await ScientificService.listHypotheses(ORG_A)).toEqual([]);
  });

  it("dashboard does not seed on read; KG/collaborators/simulations30d are null", async () => {
    const d = await ScientificService.dashboard(ORG_A);
    expect(d.papersIndexed).toBe(0);
    expect(d.experimentsActive).toBe(0);
    expect(d.publicationsInProgress).toBe(0);
    expect(d.publicationsPublished30d).toBe(0);
    expect(d.knowledgeGraphNodes).toBeNull();
    expect(d.knowledgeGraphEdges).toBeNull();
    expect(d.collaborators).toBeNull();
    expect(d.simulationsRun30d).toBeNull();
    expect(d.citationsTracked).toBeNull();
    expect(d.provenance?.knowledgeGraph).toMatch(/no research knowledge graph/i);
    expect(await ScientificService.listExperiments(ORG_A)).toEqual([]);
  });

  it("createExperiment is org-scoped and starts planned at 0 progress", async () => {
    const e = await ScientificService.createExperiment(ORG_A, {
      title: "Binder design", hypothesis: "ESM-3 finds a binder", domain: "biology",
    });
    expect(e.status).toBe("planned");
    expect(e.progressPct).toBe(0);
    expect(e.simulations).toBe(0);
    expect(e.completedAt).toBeUndefined();
    expect((await ScientificService.listExperiments(ORG_A)).map((x) => x.id)).toEqual([e.id]);
    expect(await ScientificService.listExperiments(ORG_B)).toEqual([]);
  });

  it("updateExperimentStatus stamps completedAt; org B cannot see it", async () => {
    const e = await ScientificService.createExperiment(ORG_A, {
      title: "TLS bench", hypothesis: "Kyber adds <10ms", domain: "computer_science",
    });
    const done = await ScientificService.updateExperimentStatus(ORG_A, e.id, "completed");
    expect(done?.status).toBe("completed");
    expect(done?.completedAt).toMatch(/T/);
    const d = await ScientificService.dashboard(ORG_A);
    expect(d.experimentsCompleted30d).toBe(1);
    expect(await ScientificService.updateExperimentStatus(ORG_B, e.id, "failed")).toBeNull();
    expect((await ScientificService.dashboard(ORG_B)).experimentsCompleted30d).toBe(0);
  });

  it("createPaper starts citations/relevance null and drives papersIndexed", async () => {
    const p = await ScientificService.createPaper(ORG_A, {
      title: "Attention Is All You Need", authors: ["Vaswani et al."],
      year: 2017, venue: "NeurIPS", domain: "computer_science",
    });
    expect(p.citations).toBeNull();
    expect(p.relevanceScore).toBeNull();
    const d = await ScientificService.dashboard(ORG_A);
    expect(d.papersIndexed).toBe(1);
    expect(d.topDomains.some((t) => t.domain === "computer_science" && t.papers === 1)).toBe(true);
    expect(await ScientificService.listPapers(ORG_B)).toEqual([]);
    expect((await ScientificService.dashboard(ORG_B)).papersIndexed).toBe(0);
  });

  it("citationsTracked only sums recorded citations", async () => {
    await ScientificService.createPaper(ORG_A, {
      title: "Uncited note", authors: ["A"], year: 2024, venue: "lab",
    });
    await ScientificService.createPaper(ORG_A, {
      title: "Cited survey", authors: ["B"], year: 2024, venue: "Nature", citations: 12,
    });
    await ScientificService.createPaper(ORG_A, {
      title: "Also cited", authors: ["C"], year: 2023, venue: "Cell", citations: 3,
    });
    const d = await ScientificService.dashboard(ORG_A);
    expect(d.citationsTracked).toBe(15);
    expect((await ScientificService.dashboard(ORG_B)).citationsTracked).toBeNull();
  });

  it("createHypothesis confidence is null; publicationsInProgress stays 0", async () => {
    const h = await ScientificService.createHypothesis(ORG_A, {
      statement: "Ensembles beat singles on MATH-500", domain: "mathematics",
    });
    expect(h.confidence).toBeNull();
    expect(h.status).toBe("proposed");
    expect(h.supportingEvidence).toBe(0);
    const d = await ScientificService.dashboard(ORG_A);
    expect(d.publicationsInProgress).toBe(0);
    expect(d.hypothesesActive).toBe(1);
    expect(await ScientificService.listHypotheses(ORG_B)).toEqual([]);
  });

  it("searchPapers filters; empty q returns all", async () => {
    await ScientificService.createPaper(ORG_A, {
      title: "CRISPR off-target", authors: ["Park"], year: 2023, venue: "Science",
      abstract: "Cas9 binding dynamics",
    });
    await ScientificService.createPaper(ORG_A, {
      title: "Climate tipping points", authors: ["Armstrong"], year: 2024, venue: "NCC",
    });
    const all = await ScientificService.searchPapers(ORG_A, "");
    expect(all).toHaveLength(2);
    const hit = await ScientificService.searchPapers(ORG_A, "crispr");
    expect(hit.map((p) => p.title)).toEqual(["CRISPR off-target"]);
    expect(await ScientificService.searchPapers(ORG_B, "crispr")).toEqual([]);
  });
});
