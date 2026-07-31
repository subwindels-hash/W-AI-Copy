/**
 * QualityService — Slices 281+282: AI Quality Intelligence + Evaluation Metrics.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { AiQualityScorecard, EvalRun, EvalDimension } from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('enterpriseFoundation:quality');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const CARDS = "ef:cards";
const CARD  = (id: string) => `ef:card:${id}`;
const RUNS  = "ef:runs";
const RUN   = (id: string) => `ef:run:${id}`;

const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

export const QualityService = {
  async listScorecards(filter?: { modelId?: string; regression?: boolean }): Promise<AiQualityScorecard[]> {
    const ids = await redis.smembers(CARDS);
    const out: AiQualityScorecard[] = [];
    for (const id of ids) {
      const raw = await redis.get(CARD(id));
      if (!raw) continue;
      const c = JSON.parse(raw) as AiQualityScorecard;
      if (filter?.modelId && c.modelId !== filter.modelId) continue;
      if (filter?.regression !== undefined && c.regression !== filter.regression) continue;
      out.push(c);
    }
    return out.sort((a,b)=>new Date(b.evaluatedAt).getTime()-new Date(a.evaluatedAt).getTime());
  },
  async addScorecard(c: Omit<AiQualityScorecard,"id"|"evaluatedAt">): Promise<AiQualityScorecard> {
    const id = randomUUID();
    const rec: AiQualityScorecard = { id, evaluatedAt: iso(), ...c };
    await redis.set(CARD(id), SER(rec));
    await redis.sadd(CARDS, id);
    return rec;
  },
  async listRuns(filter?: { modelId?: string; status?: string }): Promise<EvalRun[]> {
    const ids = await redis.smembers(RUNS);
    const out: EvalRun[] = [];
    for (const id of ids) {
      const raw = await redis.get(RUN(id));
      if (!raw) continue;
      const r = JSON.parse(raw) as EvalRun;
      if (filter?.modelId && r.modelId !== filter.modelId) continue;
      if (filter?.status && r.status !== filter.status) continue;
      out.push(r);
    }
    return out.sort((a,b)=>new Date(b.startedAt).getTime()-new Date(a.startedAt).getTime());
  },
  async startRun(input: { name: string; modelId: string; dataset: string; dimensions: EvalDimension[]; triggeredBy?: string }): Promise<EvalRun> {
    _rng.reseed(`startRun:${input}`);
    const id = randomUUID();
    const r: EvalRun = {
      id, name: input.name, modelId: input.modelId, dataset: input.dataset,
      startedAt: iso(), status:"queued", samples:0, passedSamples:0, passPct:0,
      dimensions: input.dimensions, triggeredBy: input.triggeredBy ?? "manual",
    };
    await redis.set(RUN(id), SER(r));
    await redis.sadd(RUNS, id);
    // simulate completion
    r.status = "running";
    r.samples = 200 + Math.floor(_rng.next()*800);
    r.passedSamples = Math.floor(r.samples * (0.78 + _rng.next()*0.2));
    r.passPct = +((r.passedSamples / r.samples) * 100).toFixed(1);
    r.finishedAt = iso();
    r.status = r.passPct >= 90 ? "passed" : "failed";
    await redis.set(RUN(id), SER(r));
    return r;
  },
  async summary() {
    const cards = await this.listScorecards();
    const runs = await this.listRuns();
    const dims = ["accuracy","groundedness","relevance","safety","hallucination"] as EvalDimension[];
    const avg: Record<string, number> = {};
    for (const d of dims) {
      const vals = cards.map(c=>c.scores[d]).filter((x):x is number=>typeof x==="number");
      avg[d] = vals.length ? +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : 0;
    }
    return {
      qualityScorecards: cards.length,
      evalRuns: runs.length,
      avgQualityScore: cards.length ? +(Object.values(avg).reduce((a,b)=>a+b,0)/Object.values(avg).length).toFixed(1) : 0,
      qualityRegressions: cards.filter(c=>c.regression).length,
      passRate7d: runs.length ? +(runs.reduce((a,r)=>a+r.passPct,0)/runs.length).toFixed(1) : 0,
      avgScore: avg,
    };
  },
};
