/**
 * FinOpsService — Slices 275-277: FinOps Platform, Cost Intelligence, Resource Optimization.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { FinOpsAccount, CostAnomaly, Optimization, CloudProvider, CostCategory } from "@windels/shared";

const ACCTS = "ef:fin:accts";
const ACCT  = (id: string) => `ef:fin:acct:${id}`;
const ANOMS = "ef:fin:anoms";
const ANOM  = (id: string) => `ef:fin:anom:${id}`;
const OPTS  = "ef:fin:opts";
const OPT   = (id: string) => `ef:fin:opt:${id}`;

const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

export const FinOpsService = {
  async listAccounts(filter?: { provider?: CloudProvider; status?: string }): Promise<FinOpsAccount[]> {
    const ids = await redis.smembers(ACCTS);
    const out: FinOpsAccount[] = [];
    for (const id of ids) {
      const raw = await redis.get(ACCT(id));
      if (!raw) continue;
      const a = JSON.parse(raw) as FinOpsAccount;
      if (filter?.provider && a.provider !== filter.provider) continue;
      if (filter?.status && a.status !== filter.status) continue;
      out.push(a);
    }
    return out.sort((a,b)=>b.monthToDate - a.monthToDate);
  },
  async addAccount(input: Omit<FinOpsAccount,"id">): Promise<FinOpsAccount> {
    const id = randomUUID();
    const a: FinOpsAccount = { id, ...input };
    await redis.set(ACCT(id), SER(a));
    await redis.sadd(ACCTS, id);
    return a;
  },
  async listAnomalies(filter?: { severity?: string; status?: string }): Promise<CostAnomaly[]> {
    const ids = await redis.smembers(ANOMS);
    const out: CostAnomaly[] = [];
    for (const id of ids) {
      const raw = await redis.get(ANOM(id));
      if (!raw) continue;
      const a = JSON.parse(raw) as CostAnomaly;
      if (filter?.severity && a.severity !== filter.severity) continue;
      if (filter?.status && a.status !== filter.status) continue;
      out.push(a);
    }
    return out.sort((a,b)=>new Date(b.detectedAt).getTime()-new Date(a.detectedAt).getTime());
  },
  async addAnomaly(a: Omit<CostAnomaly,"id"|"detectedAt"|"status">): Promise<CostAnomaly> {
    const id = randomUUID();
    const rec: CostAnomaly = { id, detectedAt: iso(), status:"open", ...a };
    await redis.set(ANOM(id), SER(rec));
    await redis.sadd(ANOMS, id);
    return rec;
  },
  async acknowledge(id: string): Promise<CostAnomaly | null> {
    const raw = await redis.get(ANOM(id));
    if (!raw) return null;
    const a = JSON.parse(raw) as CostAnomaly;
    a.status = "acknowledged";
    await redis.set(ANOM(id), SER(a));
    return a;
  },
  async listOptimizations(filter?: { provider?: CloudProvider; status?: string }): Promise<Optimization[]> {
    const ids = await redis.smembers(OPTS);
    const out: Optimization[] = [];
    for (const id of ids) {
      const raw = await redis.get(OPT(id));
      if (!raw) continue;
      const o = JSON.parse(raw) as Optimization;
      if (filter?.provider && o.provider !== filter.provider) continue;
      if (filter?.status && o.status !== filter.status) continue;
      out.push(o);
    }
    return out.sort((a,b)=>b.savingMonthly - a.savingMonthly);
  },
  async addOptimization(o: Omit<Optimization,"id">): Promise<Optimization> {
    const id = randomUUID();
    const rec: Optimization = { id, ...o };
    await redis.set(OPT(id), SER(rec));
    await redis.sadd(OPTS, id);
    return rec;
  },
  async applyOptimization(id: string): Promise<Optimization | null> {
    const raw = await redis.get(OPT(id));
    if (!raw) return null;
    const o = JSON.parse(raw) as Optimization;
    o.status = "applied";
    await redis.set(OPT(id), SER(o));
    return o;
  },
  async summary() {
    const [accts, anoms, opts] = await Promise.all([this.listAccounts(), this.listAnomalies(), this.listOptimizations()]);
    const mtd = accts.reduce((a,x)=>a+x.monthToDate,0);
    const forecast = accts.reduce((a,x)=>a+x.forecast,0);
    const budget = accts.reduce((a,x)=>a+x.budget,0);
    return {
      providers: accts.length, monthlyCost: mtd, forecast, budgetUsedPct: budget?Math.round(100*mtd/budget):0,
      anomaliesOpen: anoms.filter(a=>a.status==="open").length,
      savingsOpportunity: opts.filter(o=>o.status==="recommended").reduce((a,x)=>a+x.savingMonthly,0),
      optimizationsRecommended: opts.filter(o=>o.status==="recommended").length,
      optimizationsApplied: opts.filter(o=>o.status==="applied").length,
    };
  },
};
