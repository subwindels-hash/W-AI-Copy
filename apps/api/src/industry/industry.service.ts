/** Session 74 — Semantic Intelligence, Industry Solutions & Digital Operations (V9.3).
 * Ontology + 25 industry packs + governance lifecycle + DOC + maturity.
 * Keys: ind:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import { IndustryDashboard, INDUSTRY_SUITES, IndustryPack, IndMaturityScore } from "@windels/shared";
const K={meta:(oid:string)=>`ind:meta:${oid}`};
const uid=(p:string)=>p+randomUUID().slice(0,8);
const rnd=(a:number,b:number)=>Math.random()*(b-a)+a, rndInt=(a:number,b:number)=>Math.floor(rnd(a,b+1));

/**
 * Maturity is an assessment, not a measurement we can take. Until one is
 * recorded every dimension is 0 — this previously returned a random 55-85
 * overall score with five plausible sub-scores and a benchmark percentile.
 */
function maturity(): IndMaturityScore {
  return {
    overall: 0,
    dimensions: [
      { name: "data", score: 0 }, { name: "ai_capability", score: 0 },
      { name: "governance", score: 0 }, { name: "adoption", score: 0 },
      { name: "ops", score: 0 },
    ],
    benchmarkPct: 0,
    recommendedNext: "Run an industry maturity assessment to populate this score.",
  };
}

function seedIndustries(): IndustryPack[] {
  const names: Record<string,string> = {
    government:"Government",healthcare:"Healthcare",banking:"Banking",insurance:"Insurance",construction:"Construction",manufacturing:"Manufacturing",mining:"Mining",oil_gas:"Oil & Gas",energy_utilities:"Energy & Utilities",agriculture:"Agriculture",education:"Education",retail:"Retail",telecom:"Telecom",aviation:"Aviation",maritime:"Maritime",logistics:"Logistics",smart_cities:"Smart Cities",hospitality:"Hospitality",legal_services:"Legal Services",real_estate:"Real Estate",pharmaceutical:"Pharmaceutical",biotechnology:"Biotechnology",media_entertainment:"Media & Entertainment",non_profit:"Non-Profit",defense_public_safety:"Defense & Public Safety",
  };
  // The 25 industry suites are a catalogue. Their per-tenant counts (workflows
  // installed, knowledge entries, twins, readiness) were invented per request,
  // so refreshing the page showed a different deployment every time. An
  // uninstalled pack reports zeros until real installs are tracked.
  return INDUSTRY_SUITES.map(id=>({
    id, name: names[id]||id, employees: 0, workflows: 0, compliancePacks: 0,
    knowledgeEntries: 0, dashboards: 0, kpis: 0, templates: 0,
    reports: 0, analytics: 0, bestPractices: 0, twins: 0, skills: 0,
    digitalHumans: 0, readinessPct: 0,
  }));
}

export const IndustryService = {
  async ensureBootstrapped(logger?:Logger, oid="org-windels") {
    if (await redis.exists(K.meta(oid))) return;
    await redis.set(K.meta(oid),"1");
    logger?.info({msg:"[industry] bootstrap complete",industries:INDUSTRY_SUITES.length});
  },
  async dashboard(oid:string): Promise<IndustryDashboard> {
    if (!(await redis.exists(K.meta(oid)))) await this.ensureBootstrapped(undefined, oid);
    return {
      // Ontology / governance / operations figures are counted from real
      // registries. They previously claimed up to 50,000,000 ontology entities
      // and a fully staffed 9-region operations centre, re-rolled on every
      // request. Zeroed until those registries are wired up.
      ontology:{terms:0,classes:0,relationships:0,entities:0,mappings:0,evolvingPerDay:0},
      industries:seedIndustries(),
      governance:{activePolicies:0,arbMeetings:0,pendingReviews:0,exceptionsOpen:0,changesMerged30d:0,auditFindings:0},
      doc:{regions:[],workloads:[],oncall:0},
      maturity:maturity(),
      activeTwins:0, semanticSearchLatencyMs:0, businessGlossary:0,
      layerMapping:{
        "Platform One — AI Core":["kernel","superintelligence","synthetic","memory","knowledge_graph","semantic","world_model","reasoning","god_node","governance"],
        "Platform Two — Enterprise Business":["crm","finance","procurement","hr","support","trading","cyber","bi","digital_ops","automation","industry_suites"],
        "Platform Three — AI Studio":["voice_studio","voice_foundry","video","image","animation","music","digital_humans","workflow","agents","model_factory","prompts","training","personality"],
        "Platform Four — Developer & Marketplace":["sdk","apis","connectors","package_mgr","marketplace","certification","plugins","extensions","devops","deployment","testing","docs"],
      },
    };
  },
};
