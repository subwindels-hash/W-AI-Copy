/**
 * PromptsService — Slices 264-266:
 * Prompt Registry, Versioning, A/B Testing.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  PromptDef, PromptVersion, PromptTestCase, PromptTestRun, PromptKind,
} from "@windels/shared";
// Deterministic demo RNG — stable within a running process.



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
      // A prompt registered a second ago has not been used 50-2050 times and
      // has no stars. Both were minted at registration and shown as adoption.
      stars: 0, uses: 0,
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

  async runTests(id: string, model = "claude-3.5-sonnet"): Promise<{ prompt: PromptDef | null; run: PromptTestRun | null }> {
    const p = await this.get(id);
    if (!p) return { prompt: null, run: null };
    const deployed = p.versions[0];
    const start = Date.now();
    // No model is invoked here — this books a test run. It previously decided
    // the outcome with `total - randomInt(0, 2)`, so a prompt "passed" roughly
    // 90-100% of its cases without a single case being executed, and that
    // passPct is what gates a version for deployment. An unexecuted run now
    // records zero cases passed and is explicitly marked not-run, so it can
    // never read as a green test result.
    const total = p.testCases.length;
    const run: PromptTestRun = {
      id: randomUUID(), versionId: deployed.id, model,
      startedAt: iso(), finishedAt: iso(),
      casesTotal: total, casesPassed: 0, casesFailed: 0,
      avgLatencyMs: Date.now() - start,
      passPct: 0,
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
