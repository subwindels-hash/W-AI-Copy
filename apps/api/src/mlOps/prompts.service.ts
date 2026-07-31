/**
 * PromptsService — Slices 264-266:
 * Prompt Registry, Versioning, A/B Testing.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  PromptDef, PromptVersion, PromptTestCase, PromptTestRun, PromptKind,
} from "@windels/shared";

const LIST     = "mlops:prompts";
const DETAIL   = (id: string) => `mlops:prompt:${id}`;
const BY_SLUG  = "mlops:prompt:slug";

const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

export const PromptsService = {
  async list(filter?: { kind?: PromptKind; q?: string }): Promise<PromptDef[]> {
    const ids = await redis.smembers(LIST);
    const out: PromptDef[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (!raw) continue;
      const p = JSON.parse(raw) as PromptDef;
      if (filter?.kind && p.kind !== filter.kind) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.slug.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) continue;
      }
      out.push(p);
    }
    return out.sort((a,b)=>b.uses - a.uses);
  },

  async get(id: string): Promise<PromptDef | null> {
    const raw = await redis.get(DETAIL(id));
    return raw ? (JSON.parse(raw) as PromptDef) : null;
  },

  async findBySlug(slug: string): Promise<PromptDef | null> {
    const id = await redis.hget(BY_SLUG, slug);
    return id ? this.get(id) : null;
  },

  async register(input: Omit<PromptDef, "id"|"versions"|"testCases"|"testRuns"|"stars"|"uses"|"updatedAt">): Promise<PromptDef> {
    const id = randomUUID();
    const now = iso();
    const v0: PromptVersion = {
      id: randomUUID(), version: "0.1.0", template: "",
      variables: [], author: "system", changelog: "initial", createdAt: now, deployed: false,
    };
    const p: PromptDef = {
      id, versions: [v0], testCases: [], testRuns: [],
      stars: 4 + Math.floor(Math.random()*10), uses: Math.floor(50+Math.random()*2000),
      updatedAt: now, ...input,
    };
    await redis.set(DETAIL(id), SER(p));
    await redis.sadd(LIST, id);
    await redis.hset(BY_SLUG, p.slug, id);
    return p;
  },

  async addVersion(id: string, v: Omit<PromptVersion, "id"|"createdAt"|"deployed">): Promise<PromptDef | null> {
    const p = await this.get(id);
    if (!p) return null;
    // mark all other versions undeployed
    for (const pv of p.versions) pv.deployed = false;
    const nv: PromptVersion = { id: randomUUID(), createdAt: iso(), deployed: true, ...v };
    p.versions.unshift(nv);
    p.uses += 1;
    p.updatedAt = iso();
    await redis.set(DETAIL(id), SER(p));
    return p;
  },

  async addTestCase(id: string, tc: Omit<PromptTestCase, "id">): Promise<PromptDef | null> {
    const p = await this.get(id);
    if (!p) return null;
    p.testCases.push({ id: randomUUID(), ...tc });
    p.updatedAt = iso();
    await redis.set(DETAIL(id), SER(p));
    return p;
  },

  /**
   * Record a prompt test run.
   *
   * Previously this invented the result: it passed every case bar a random 0-1
   * of them and reported a random 180-780ms average latency, without executing
   * a single test case. The measured outcome must now be supplied by whatever
   * actually ran the suite.
   */
  async runTests(
    id: string,
    model = "claude-3.5-sonnet",
    result?: { casesPassed: number; avgLatencyMs?: number },
  ): Promise<{ prompt: PromptDef | null; run: PromptTestRun | null }> {
    const p = await this.get(id);
    if (!p) return { prompt: null, run: null };
    const deployed = p.versions[0];
    const total = p.testCases.length || 1;
    // With no supplied result nothing has been verified: report zero passes
    // rather than a flattering near-perfect score.
    const passed = Math.max(0, Math.min(total, result?.casesPassed ?? 0));
    const run: PromptTestRun = {
      id: randomUUID(), versionId: deployed.id, model,
      startedAt: iso(), finishedAt: iso(),
      casesTotal: total, casesPassed: passed, casesFailed: total - passed,
      avgLatencyMs: result?.avgLatencyMs ?? 0,
      passPct: +((passed / total) * 100).toFixed(1),
    };
    p.testRuns.unshift(run);
    p.updatedAt = iso();
    if (p.testRuns.length > 30) p.testRuns.length = 30;
    await redis.set(DETAIL(id), SER(p));
    return { prompt: p, run };
  },

  async summary(): Promise<{ prompts: number; promptVersions: number; promptTests: number }> {
    const all = await this.list();
    return {
      prompts: all.length,
      promptVersions: all.reduce((a,p)=>a+p.versions.length,0),
      promptTests: all.reduce((a,p)=>a+p.testCases.length,0),
    };
  },
};
