/**
 * Session 68 — Enterprise Scientific Research Platform.
 *
 * Session 160 — honesty pass:
 * - Reads never call ensureBootstrapped (a GET is not a seeder).
 * - Demo seed is gated and writes planned/proposed records with null
 *   citations, relevance and confidence — no RNG progress or citation counts.
 * - knowledgeGraphNodes/Edges, collaborators, simulationsRun30d are null
 *   when unmeasured (0 would be a measured empty graph / 0 collaborators).
 * - publicationsInProgress is 0: there is no publication ledger. It is not
 *   a count of hypotheses in "testing".
 * - topDomains counts only records that carry a domain (no round-robin).
 *
 * Keys: sci:exp / sci:exps / sci:pap / sci:paps / sci:hyp / sci:hyps / sci:meta
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import {
  ScientificDashboard, Experiment, LiteratureRef, Hypothesis, RESEARCH_DOMAINS, ResearchDomain,
} from "@windels/shared";

const K = {
  exp: (oid: string, id: string) => `sci:exp:${oid}:${id}`, exps: (oid: string) => `sci:exps:${oid}`,
  pap: (oid: string, id: string) => `sci:pap:${oid}:${id}`, paps: (oid: string) => `sci:paps:${oid}`,
  hyp: (oid: string, id: string) => `sci:hyp:${oid}:${id}`, hyps: (oid: string) => `sci:hyps:${oid}`,
  meta: (oid: string) => `sci:meta:${oid}`,
};
const s2 = (o: unknown) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

const LIT: Array<Omit<LiteratureRef, "id" | "citations" | "relevanceScore"> & { domain: ResearchDomain }> = [
  { title: "Attention Is All You Need", authors: ["Vaswani et al."], year: 2017, venue: "NeurIPS", doi: "10.48550/arXiv.1706.03762", abstract: "Dominant sequence transduction models are based on recurrent/convolutional nets; the Transformer uses attention alone.", domain: "computer_science" },
  { title: "Large Language Models in Scientific Discovery", authors: ["Chen et al."], year: 2024, venue: "Nature", abstract: "Survey of LLM applications across scientific disciplines with open benchmarks.", domain: "computer_science" },
  { title: "Scaling Laws for Neural Language Models", authors: ["Kaplan et al."], year: 2020, venue: "arXiv", abstract: "Empirical laws for model performance vs compute, data, parameters.", domain: "computer_science" },
  { title: "CRISPR-Cas9 Off-Target Effects at Single-Molecule Resolution", authors: ["Park et al."], year: 2023, venue: "Science", abstract: "High-fidelity profiling of Cas9 binding dynamics reveals novel off-target mechanisms.", domain: "biology" },
  { title: "Topological Quantum Computing with Majorana Zero Modes", authors: ["Nayak et al."], year: 2022, venue: "PRX Quantum", abstract: "Recent advances realizing non-Abelian anyons for fault-tolerant QC.", domain: "physics" },
  { title: "Climate Tipping Points in Earth System Models", authors: ["Armstrong et al."], year: 2024, venue: "Nature Climate Change", abstract: "Ensemble simulations indicate AMOC tipping risk on current trajectories.", domain: "climate" },
  { title: "Protein Structure Prediction Beyond AlphaFold", authors: ["Jumper et al."], year: 2024, venue: "Cell", abstract: "Integrating conformational dynamics and ligand binding into de novo structure prediction.", domain: "biology" },
  { title: "Neural-Symbolic Reasoning for Drug Repurposing", authors: ["Rossi et al."], year: 2024, venue: "Nature Mach Intell", abstract: "LLMs + KGs for principled drug candidate selection.", domain: "medicine" },
  { title: "Quantum Error Correction with Surface Codes", authors: ["Fowler et al."], year: 2012, venue: "PRA", abstract: "Surface code error thresholds and resource estimates.", domain: "physics" },
  { title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP", authors: ["Lewis et al."], year: 2020, venue: "NeurIPS", abstract: "RAG combines parametric and non-parametric memories for fact grounding.", domain: "computer_science" },
  { title: "Federated Learning at Scale", authors: ["Kairouz et al."], year: 2021, venue: "Foundations & Trends", abstract: "Comprehensive survey of federated learning challenges and methods.", domain: "computer_science" },
  { title: "Direct Air Capture Economics", authors: ["Sanz-Perez et al."], year: 2016, venue: "Energy Environ Sci", abstract: "Techno-economic analysis of DAC technologies.", domain: "chemistry" },
];

const EXP_SEEDS: Array<Pick<Experiment, "title" | "hypothesis" | "domain">> = [
  { title: "LLM-driven protein binder design for KRAS-G12D", hypothesis: "Fine-tuned ESM-3 identifies 3 novel high-affinity binders (IC50<50nM)", domain: "biology" },
  { title: "Post-quantum TLS handshake benchmarking", hypothesis: "CRYSTALS-Kyber adds <10ms p95 latency", domain: "computer_science" },
  { title: "Perovskite-silicon tandem cell stability under UV", hypothesis: "ALD Al2O3 retains >90% efficiency after 1000h UV", domain: "materials_science" },
  { title: "RL controllers for tokamak plasma confinement", hypothesis: "RL increases stable shot duration by 35% over PID", domain: "physics" },
  { title: "Microbiome signatures of immunotherapy response", hypothesis: "Akkermansia muciniphila abundance predicts response with AUC>0.78", domain: "medicine" },
  { title: "Carbon capture solvent regeneration energy optimization", hypothesis: "Mixed amine blends cut regen energy by 25%", domain: "chemistry" },
];

const HYP_SEEDS: Array<Pick<Hypothesis, "statement" | "domain">> = [
  { statement: "Multi-agent ensembles beat single models on MATH-500 by >15%", domain: "mathematics" },
  { statement: "Quantum advantage for opto >10k variables arrives in 2027", domain: "physics" },
  { statement: "Microbiome explains 30% of variance in immunotherapy response", domain: "medicine" },
  { statement: "Transformer-based PDE solvers beat FEM for turbulence in 2028", domain: "engineering" },
  { statement: "Federated models match centralized within 2% for EHR readmission prediction", domain: "computer_science" },
];

async function loadAll<T>(ids: string[], keyFn: (id: string) => string): Promise<T[]> {
  const out: T[] = [];
  for (const id of ids) {
    const r = await redis.hget(keyFn(id), "_doc");
    if (r) out.push(JSON.parse(r) as T);
  }
  return out;
}

export const ScientificService = {
  async ensureBootstrapped(logger?: Logger, oid = "org-windels") {
    if (await redis.exists(K.meta(oid))) return;
    if (!demoDataEnabled()) return skipDemoSeed("scientific", logger);
    const now = new Date().toISOString();
    for (const seed of EXP_SEEDS) {
      const id = uid("exp-");
      const e: Experiment & { seed?: boolean } = {
        id, ...seed,
        variables: { independent: ["formulation", "hyperparams"], dependent: ["primary_metric"], controls: ["temperature", "ph"] },
        status: "planned", progressPct: 0, expectedOutcome: "", simulations: 0, createdAt: now, seed: true,
      };
      await redis.hset(K.exp(oid, id), "_doc", s2(e));
      await redis.sadd(K.exps(oid), id);
    }
    for (const p of LIT) {
      const id = uid("pap-");
      const paper: LiteratureRef & { seed?: boolean } = {
        id, ...p, citations: null, relevanceScore: null, seed: true,
      };
      await redis.hset(K.pap(oid, id), "_doc", s2(paper));
      await redis.sadd(K.paps(oid), id);
    }
    for (const h of HYP_SEEDS) {
      const id = uid("hyp-");
      const full: Hypothesis & { seed?: boolean } = {
        id, ...h, confidence: null, supportingEvidence: 0, counterEvidence: 0,
        status: "proposed", updatedAt: now, seed: true,
      };
      await redis.hset(K.hyp(oid, id), "_doc", s2(full));
      await redis.sadd(K.hyps(oid), id);
    }
    await redis.set(K.meta(oid), "1");
    logger?.info({ msg: "[scientific] bootstrap complete", papers: LIT.length, experiments: EXP_SEEDS.length, orgId: oid });
  },

  async dashboard(oid: string): Promise<ScientificDashboard> {
    const [eids, pids, hids] = await Promise.all([
      redis.smembers(K.exps(oid)), redis.smembers(K.paps(oid)), redis.smembers(K.hyps(oid)),
    ]);
    const [exps, paps, hyps] = await Promise.all([
      loadAll<Experiment>(eids, (id) => K.exp(oid, id)),
      loadAll<LiteratureRef>(pids, (id) => K.pap(oid, id)),
      loadAll<Hypothesis>(hids, (id) => K.hyp(oid, id)),
    ]);
    const byDomain: Record<string, { domain: ResearchDomain; papers: number; experiments: number }> = {};
    for (const d of RESEARCH_DOMAINS) byDomain[d] = { domain: d, papers: 0, experiments: 0 };
    for (const e of exps) if (byDomain[e.domain]) byDomain[e.domain].experiments++;
    for (const p of paps) if (p.domain && byDomain[p.domain]) byDomain[p.domain].papers++;
    const now = Date.now();
    const within30d = (iso?: string) => !!iso && now - new Date(iso).getTime() < 30 * 86_400_000;
    const recordedCitations = paps.map((p) => p.citations).filter((c): c is number => c != null);
    return {
      papersIndexed: paps.length,
      experimentsActive: exps.filter((e) => e.status === "running" || e.status === "planned").length,
      experimentsCompleted30d: exps.filter((e) => e.status === "completed" && within30d(e.completedAt)).length,
      hypothesesActive: hyps.filter((h) => h.status !== "refuted" && h.status !== "published").length,
      hypothesesSupported30d: hyps.filter((h) => h.status === "supported" && within30d(h.updatedAt)).length,
      publicationsInProgress: 0,
      publicationsPublished30d: 0,
      collaborators: null,
      citationsTracked: recordedCitations.length ? recordedCitations.reduce((s, c) => s + c, 0) : null,
      simulationsRun30d: null,
      topDomains: RESEARCH_DOMAINS.map((d) => byDomain[d]).filter((b) => b.papers + b.experiments > 0).slice(0, 8),
      recentExperiments: [...exps].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
      recentPapers: [...paps].slice(0, 8),
      recentHypotheses: [...hyps].slice(0, 8),
      knowledgeGraphNodes: null,
      knowledgeGraphEdges: null,
      provenance: {
        papersIndexed: "Count of literature records this organization stored. Not a live Crossref/PubMed/arXiv index.",
        knowledgeGraph: "There is no research knowledge graph. Nodes and edges are null, never 0 and never millions.",
        publications: "No publication ledger. publicationsInProgress / publicationsPublished30d stay 0 and are not a count of testing hypotheses.",
        simulationsRun30d: "No timestamped simulation event ledger. Experiment.simulations is an operator-entered lifetime total, not a 30-day figure.",
        collaborators: "No collaborator register. Null, not 0.",
        citationsTracked: "Sum of operator-entered paper.citations, or null when none are recorded.",
      },
    };
  },

  async searchPapers(oid: string, q: string): Promise<LiteratureRef[]> {
    const paps = await this.listPapers(oid);
    if (!q) return paps;
    const qq = q.toLowerCase();
    return paps.filter((p) => p.title.toLowerCase().includes(qq) || p.abstract.toLowerCase().includes(qq));
  },

  async listPapers(oid: string): Promise<LiteratureRef[]> {
    const ids = await redis.smembers(K.paps(oid));
    return loadAll<LiteratureRef>(ids, (id) => K.pap(oid, id));
  },

  async listExperiments(oid: string): Promise<Experiment[]> {
    const ids = await redis.smembers(K.exps(oid));
    const out = await loadAll<Experiment>(ids, (id) => K.exp(oid, id));
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async listHypotheses(oid: string): Promise<Hypothesis[]> {
    const ids = await redis.smembers(K.hyps(oid));
    return loadAll<Hypothesis>(ids, (id) => K.hyp(oid, id));
  },

  async createExperiment(oid: string, input: {
    title: string; hypothesis: string; domain: ResearchDomain; expectedOutcome?: string;
  }): Promise<Experiment> {
    const id = uid("exp-");
    const e: Experiment = {
      id, title: input.title, hypothesis: input.hypothesis, domain: input.domain,
      variables: { independent: [], dependent: [], controls: [] },
      status: "planned", progressPct: 0, expectedOutcome: input.expectedOutcome ?? "",
      simulations: 0, createdAt: new Date().toISOString(),
    };
    await redis.hset(K.exp(oid, id), "_doc", s2(e));
    await redis.sadd(K.exps(oid), id);
    return e;
  },

  async updateExperimentStatus(oid: string, id: string, status: Experiment["status"]): Promise<Experiment | null> {
    const raw = await redis.hget(K.exp(oid, id), "_doc");
    if (!raw) return null;
    const e: Experiment = JSON.parse(raw);
    e.status = status;
    if (status === "completed") e.completedAt = new Date().toISOString();
    if (status === "planned" || status === "running") delete e.completedAt;
    await redis.hset(K.exp(oid, id), "_doc", s2(e));
    return e;
  },

  async createPaper(oid: string, input: {
    title: string; authors: string[]; year: number; venue: string;
    abstract?: string; doi?: string; citations?: number; domain?: ResearchDomain;
  }): Promise<LiteratureRef> {
    const id = uid("pap-");
    const paper: LiteratureRef = {
      id, title: input.title, authors: input.authors, year: input.year, venue: input.venue,
      doi: input.doi, abstract: input.abstract ?? "",
      citations: input.citations ?? null, relevanceScore: null, domain: input.domain,
    };
    await redis.hset(K.pap(oid, id), "_doc", s2(paper));
    await redis.sadd(K.paps(oid), id);
    return paper;
  },

  async createHypothesis(oid: string, input: {
    statement: string; domain: ResearchDomain; confidence?: number;
  }): Promise<Hypothesis> {
    const id = uid("hyp-");
    const now = new Date().toISOString();
    const h: Hypothesis = {
      id, statement: input.statement, domain: input.domain,
      confidence: input.confidence == null ? null : Math.max(0, Math.min(1, input.confidence)),
      supportingEvidence: 0, counterEvidence: 0, status: "proposed", updatedAt: now,
    };
    await redis.hset(K.hyp(oid, id), "_doc", s2(h));
    await redis.sadd(K.hyps(oid), id);
    return h;
  },
};
