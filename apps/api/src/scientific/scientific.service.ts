/**
 * Session 68 — Enterprise Scientific Research Platform.
 * Literature review, citation analysis, experiment planning, research KG,
 * hypothesis generation, simulations, publication assistance, collaboration.
 * Keys: sci:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import {
  ScientificDashboard, Experiment, LiteratureRef, Hypothesis, RESEARCH_DOMAINS, ResearchDomain,
} from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('scientific:scientific');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const K = {
  exp:(oid:string,id:string)=>`sci:exp:${oid}:${id}`, exps:(oid:string)=>`sci:exps:${oid}`,
  pap:(oid:string,id:string)=>`sci:pap:${oid}:${id}`, paps:(oid:string)=>`sci:paps:${oid}`,
  hyp:(oid:string,id:string)=>`sci:hyp:${oid}:${id}`, hyps:(oid:string)=>`sci:hyps:${oid}`,
  meta:(oid:string)=>`sci:meta:${oid}`,
};
const s2=(o:any)=>JSON.stringify(o);
const uid=(p:string)=>p+randomUUID().slice(0,8);
function rnd(a:number,b:number){return _rng.next()*(b-a)+a;}
function rndInt(a:number,b:number){return Math.floor(rnd(a,b+1));}
function pick<T>(a:T[]):T{return a[Math.floor(_rng.next()*a.length)];}
const now=()=>new Date().toISOString();

const LIT: Omit<LiteratureRef,"id"|"citations"|"relevanceScore">[] = [
  {title:"Attention Is All You Need",authors:["Vaswani et al."],year:2017,venue:"NeurIPS",doi:"10.48550/arXiv.1706.03762",abstract:"Dominant sequence transduction models are based on recurrent/convolutional nets; the Transformer uses attention alone."},
  {title:"Large Language Models in Scientific Discovery",authors:["Chen et al."],year:2024,venue:"Nature",abstract:"Survey of LLM applications across scientific disciplines with open benchmarks."},
  {title:"Scaling Laws for Neural Language Models",authors:["Kaplan et al."],year:2020,venue:"arXiv",abstract:"Empirical laws for model performance vs compute, data, parameters."},
  {title:"CRISPR-Cas9 Off-Target Effects at Single-Molecule Resolution",authors:["Park et al."],year:2023,venue:"Science",abstract:"High-fidelity profiling of Cas9 binding dynamics reveals novel off-target mechanisms."},
  {title:"Topological Quantum Computing with Majorana Zero Modes",authors:["Nayak et al."],year:2022,venue:"PRX Quantum",abstract:"Recent advances realizing non-Abelian anyons for fault-tolerant QC."},
  {title:"Climate Tipping Points in Earth System Models",authors:["Armstrong et al."],year:2024,venue:"Nature Climate Change",abstract:"Ensemble simulations indicate AMOC tipping risk on current trajectories."},
  {title:"Protein Structure Prediction Beyond AlphaFold",authors:["Jumper et al."],year:2024,venue:"Cell",abstract:"Integrating conformational dynamics and ligand binding into de novo structure prediction."},
  {title:"Neural-Symbolic Reasoning for Drug Repurposing",authors:["Rossi et al."],year:2024,venue:"Nature Mach Intell",abstract:"LLMs + KGs for principled drug candidate selection."},
  {title:"Quantum Error Correction with Surface Codes",authors:["Fowler et al."],year:2012,venue:"PRA",abstract:"Surface code error thresholds and resource estimates."},
  {title:"Retrieval-Augmented Generation for Knowledge-Intensive NLP",authors:["Lewis et al."],year:2020,venue:"NeurIPS",abstract:"RAG combines parametric and non-parametric memories for fact grounding."},
  {title:"Federated Learning at Scale",authors:["Kairouz et al."],year:2021,venue:"Foundations & Trends",abstract:"Comprehensive survey of federated learning challenges and methods."},
  {title:"Direct Air Capture Economics",authors:["Sanz-Perez et al."],year:2016,venue:"Energy Environ Sci",abstract:"Techno-economic analysis of DAC technologies."},
];

const EXP_SEEDS: Array<Omit<Experiment,"id"|"status"|"progressPct"|"simulations"|"createdAt"|"variables"|"expectedOutcome"|"results">> = [
  {title:"LLM-driven protein binder design for KRAS-G12D",hypothesis:"Fine-tuned ESM-3 identifies 3 novel high-affinity binders (IC50<50nM)",domain:"biology"},
  {title:"Post-quantum TLS handshake benchmarking",hypothesis:"CRYSTALS-Kyber adds <10ms p95 latency",domain:"computer_science"},
  {title:"Perovskite-silicon tandem cell stability under UV",hypothesis:"ALD Al2O3 retains >90% efficiency after 1000h UV",domain:"materials_science"},
  {title:"RL controllers for tokamak plasma confinement",hypothesis:"RL increases stable shot duration by 35% over PID",domain:"physics"},
  {title:"Microbiome signatures of immunotherapy response",hypothesis:"Akkermansia muciniphila abundance predicts response with AUC>0.78",domain:"medicine"},
  {title:"Carbon capture solvent regeneration energy optimization",hypothesis:"Mixed amine blends cut regen energy by 25%",domain:"chemistry"},
];

export const ScientificService = {
  async ensureBootstrapped(logger?:Logger, oid="org-windels") {
    _rng.reseed(`ensureBootstrapped:${logger}`);
    if (await redis.exists(K.meta(oid))) return;
    for (const seed of EXP_SEEDS) {
      const id=uid("exp-"); const e: Experiment = {
        id, ...seed,
        variables:{independent:["formulation","hyperparams"],dependent:["primary_metric"],controls:["temperature","ph"]},
        status: pick(["running","planned","completed","running"]), progressPct: rndInt(8,92),
        expectedOutcome:"Reproducible +10–40% improvement", simulations: rndInt(40,800), createdAt: now(),
      };
      await redis.hset(K.exp(oid,id),"_doc",s2(e)); await redis.sadd(K.exps(oid),id);
    }
    for (const p of LIT) {
      const id=uid("pap-"); const paper: LiteratureRef = { id, ...p, citations: rndInt(50,8000), relevanceScore: rnd(0.5,1) };
      await redis.hset(K.pap(oid,id),"_doc",s2(paper)); await redis.sadd(K.paps(oid),id);
    }
    const hypSeeds: Array<Omit<Hypothesis,"id"|"confidence"|"supportingEvidence"|"counterEvidence"|"status">> = [
      {statement:"Multi-agent ensembles beat single models on MATH-500 by >15%",domain:"mathematics"},
      {statement:"Quantum advantage for opto >10k variables arrives in 2027",domain:"physics"},
      {statement:"Microbiome explains 30% of variance in immunotherapy response",domain:"medicine"},
      {statement:"Transformer-based PDE solvers beat FEM for turbulence in 2028",domain:"engineering"},
      {statement:"Federated models match centralized within 2% for EHR readmission prediction",domain:"computer_science"},
    ];
    for (const h of hypSeeds) {
      const id=uid("hyp-"); const full: Hypothesis = { id, ...h, confidence: rnd(0.4,0.85), supportingEvidence: rndInt(5,30), counterEvidence: rndInt(1,12), status: pick(["proposed","testing","supported","testing","proposed"]) as any };
      await redis.hset(K.hyp(oid,id),"_doc",s2(full)); await redis.sadd(K.hyps(oid),id);
    }
    await redis.set(K.meta(oid),"1");
    logger?.info({ msg:"[scientific] bootstrap complete", papers:LIT.length, experiments: EXP_SEEDS.length });
  },
  async _load<T>(key:string): Promise<T[]> {
    const oid=key.split(":")[2]||"org-windels";
    const ids = await redis.smembers(key);
    const out: T[]=[]; for (const id of ids){ const r=await redis.hget(this._pk(key,oid,id),"_doc"); if(r) out.push(JSON.parse(r)); }
    return out;
  },
  _pk(key:string, oid:string, id:string) { return key.replace(/s$/,`:`).replace(`:${oid}`,`:`+oid+":"+id) as any; },
  async dashboard(oid:string): Promise<ScientificDashboard> {
    _rng.reseed(`dashboard:${oid}`);
    if (!(await redis.exists(K.meta(oid)))) await this.ensureBootstrapped(undefined, oid);
    const [eids,pids,hids] = [await redis.smembers(K.exps(oid)), await redis.smembers(K.paps(oid)), await redis.smembers(K.hyps(oid))];
    const exps:Experiment[] = []; for (const id of eids){ const r=await redis.hget(K.exp(oid,id),"_doc"); if(r) exps.push(JSON.parse(r)); }
    const paps:LiteratureRef[]=[]; for (const id of pids){ const r=await redis.hget(K.pap(oid,id),"_doc"); if(r) paps.push(JSON.parse(r)); }
    const hyps:Hypothesis[]=[]; for (const id of hids){ const r=await redis.hget(K.hyp(oid,id),"_doc"); if(r) hyps.push(JSON.parse(r)); }
    const byDomain: Record<string,{domain:ResearchDomain;papers:number;experiments:number}> = {};
    for (const d of RESEARCH_DOMAINS) byDomain[d]={domain:d,papers:0,experiments:0};
    exps.forEach(e=>{ if(byDomain[e.domain]) byDomain[e.domain].experiments++; });
    paps.slice(0, RESEARCH_DOMAINS.length).forEach((_,i)=>{ const d=RESEARCH_DOMAINS[i%RESEARCH_DOMAINS.length]; byDomain[d].papers++; });
    return {
      papersIndexed: 148_000_000 + rndInt(0,2_000_000),
      experimentsActive: exps.filter(e=>e.status==="running"||e.status==="planned").length,
      experimentsCompleted30d: rndInt(20,60),
      hypothesesActive: hyps.filter(h=>h.status!=="refuted"&&h.status!=="published").length,
      hypothesesSupported30d: rndInt(3,12),
      publicationsInProgress: rndInt(4,12),
      publicationsPublished30d: rndInt(1,4),
      collaborators: rndInt(20,200),
      citationsTracked: rndInt(5000,50000),
      simulationsRun30d: rndInt(2000,20000),
      topDomains: RESEARCH_DOMAINS.slice(0,8).map(d=>byDomain[d]),
      recentExperiments: exps, recentPapers: paps.slice(0,8), recentHypotheses: hyps,
      knowledgeGraphNodes: 2_400_000+rndInt(0,100_000), knowledgeGraphEdges: 18_000_000+rndInt(0,500_000),
    };
  },
  async searchPapers(oid:string, q:string): Promise<LiteratureRef[]> {
    const pids = await redis.smembers(K.paps(oid));
    const paps: LiteratureRef[]=[];
    for (const id of pids){ const r=await redis.hget(K.pap(oid,id),"_doc"); if(r) paps.push(JSON.parse(r)); }
    if (!q) return paps;
    const qq=q.toLowerCase(); return paps.filter(p=>p.title.toLowerCase().includes(qq)||p.abstract.toLowerCase().includes(qq));
  },
};
