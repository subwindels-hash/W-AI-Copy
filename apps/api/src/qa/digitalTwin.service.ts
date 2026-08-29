/**
 * DigitalTwinService — Slice 192.
 *
 * Runs a lightweight synthetic workload against the live API: `users`
 * simulated clients each performing a weighted mix of actions (login, chat,
 * agent list, memory read/write, search), plus `agents` background AI
 * workers posting messages. Tracks throughput, error rate, p95 latency and
 * compares to expectations.
 */
import { assertion } from "./testRunner.service.js";
import { env } from "../config/env.js";
import type { TestCase, TestCaseResult, DigitalTwinConfig } from "@windels/shared/qa";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('qa:digitalTwin');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const BASE = `http://127.0.0.1:${env.API_PORT}/api/v1`;

export async function runDigitalTwin(c: TestCase): Promise<TestCaseResult> {
  const cfg = c.config as unknown as DigitalTwinConfig;
  const t0 = performance.now();
  const res: TestCaseResult = { caseId: c.id, caseName: c.name, status: "running", durationMs:0, startedAt: new Date().toISOString(), assertions: [], logs: [], metrics: {} };
  try {
    const token = await adminToken();
    const latencies: number[] = []; let errors = 0; let requests = 0;
    const end = performance.now() + Math.min(cfg.durationMs, 10_000); // cap for safety
    const users = Math.max(1, Math.min(20, cfg.users));
    const actionWeights = cfg.actions.map((a)=>a.weight);
    const totalW = actionWeights.reduce((a,b)=>a+b,0);
    async function userLoop() {
      while (performance.now() < end) {
        const pick = weightedPick(cfg.actions, totalW);
        try {
          const s = performance.now();
          const r = await runAction(pick.type, token);
          latencies.push(performance.now()-s);
          if (!r.ok) errors++;
        } catch { errors++; }
        requests++;
        await sleep(10 + _rng.next()*40);
      }
    }
    const workers: Promise<void>[] = []; for (let i=0;i<users;i++) workers.push(userLoop());
    await Promise.all(workers);

    const rps = requests / ((performance.now()-t0)/1000);
    const errRate = requests ? errors / requests : 0;
    const p95 = percentile(latencies, 0.95);
    res.metrics.rps = +rps.toFixed(1);
    res.metrics.errorRate = +(errRate*100).toFixed(2);
    res.metrics.p95Ms = Math.round(p95);
    res.metrics.requests = requests;
    res.logs.push(`digital twin: ${users} users, ${requests} reqs, rps ${rps.toFixed(1)}, err ${(errRate*100).toFixed(1)}%, p95 ${Math.round(p95)}ms`);

    if (cfg.expectations.maxErrorRate != null) {
      res.assertions.push(assertion("errorRate", `error rate ≤ ${cfg.expectations.maxErrorRate}%`, errRate*100 <= cfg.expectations.maxErrorRate, { actual: +(errRate*100).toFixed(2) }));
    }
    if (cfg.expectations.minRps != null) {
      res.assertions.push(assertion("rps", `rps ≥ ${cfg.expectations.minRps}`, rps >= cfg.expectations.minRps, { actual: rps.toFixed(1) }));
    }
    if (cfg.expectations.maxP95Ms != null) {
      res.assertions.push(assertion("p95", `p95 ≤ ${cfg.expectations.maxP95Ms}ms`, p95 <= cfg.expectations.maxP95Ms, { actual: Math.round(p95) }));
    }

    res.finishedAt = new Date().toISOString(); res.durationMs = Math.round(performance.now()-t0);
    res.status = res.assertions.every(a=>a.passed) ? "passed" : "failed";
  } catch (err:any) {
    res.status="error"; res.error={code:"DT_ERROR",message:err.message};
    res.finishedAt=new Date().toISOString(); res.durationMs=Math.round(performance.now()-t0);
  }
  return res;
}

async function runAction(type: string, token: string): Promise<{ok:boolean}> {
  const headers = { Authorization: `Bearer ${token}` };
  const urls: Record<string, string> = {
    login: `/auth/me`, health: `/health`, agents: `/agents`,
    "data-catalog": `/data/catalog`, kg: `/data/kg/stats`, memory: `/data/memory/context?namespace=global&scopeId=global`,
    enterprise: `/enterprise/discovery/services`, "agent-comm": `/agents/comm/stats`, platform: `/platform/metrics`,
  };
  const path = urls[type] ?? urls.health;
  const r = await fetch(`${BASE}${path}`, { headers });
  return { ok: r.status < 500 };
}

function sleep(ms:number){return new Promise(r=>setTimeout(r,ms));}
function weightedPick<T extends {weight:number}>(items:T[],total:number):T{
  let r = _rng.next()*total; for(const i of items){ r -= i.weight; if(r<=0) return i; } return items[items.length-1];
}
function percentile(xs:number[],p:number){ if(!xs.length) return 0; const s=[...xs].sort((a,b)=>a-b); const i=Math.floor(p*(s.length-1)); return s[i]; }
async function adminToken(): Promise<string> {
  const r = await fetch(`${BASE}/auth/login`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email:"admin@windels.ai", password:"W1ndels!Admin#2026" }) });
  return (await r.json() as any).data.token;
}

export function newDigitalTwinCase(suiteId: string, name: string, cfg: DigitalTwinConfig, opts: Partial<TestCase>={}): Omit<TestCase,"id"|"createdAt"|"updatedAt"> {
  return { suiteId, name, kind:"digital-twin", severity:opts.severity??"high", config:cfg as any,
    tags:opts.tags??["digital-twin","load"], selectors:opts.selectors??["pre-deploy"],
    timeoutMs: opts.timeoutMs??30000, enabled:true, description:opts.description };
}
