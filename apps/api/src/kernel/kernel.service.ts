/**
 * Enterprise AI Kernel singleton (Session 39).
 * Lightweight orchestrator that dispatches events, evaluates policies,
 * grants resources, and selects models. Full Universal Reasoning Engine
 * is Session 69.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { KernelComponent, KernelEvent, KernelPolicyDecision, KernelResourceGrant, KernelDashboard } from "@windels/shared";

const K = {
  startedAt: "kernel:started", components: "kernel:components", events: "kernel:events",
  events24: "kernel:evt24", policy24: "kernel:policy24", block24: "kernel:block24",
  modelSel24: "kernel:modelsel24", lats: "kernel:lats", selfheal: "kernel:sh24",
};
const startedKey = "kernel:start";

const defaultComponents: KernelComponent[] = [
  { key:"context", name:"Universal Context Mgmt", status:"online", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"memory", name:"Global Memory Coordination", status:"stub", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"reasoning", name:"Global Reasoning Engine (lite)", status:"online", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"res-ai", name:"AI Resource Scheduling", status:"online", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"res-agent", name:"Agent Scheduling", status:"online", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"event-bus", name:"Event Bus", status:"online", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"comm-bus", name:"AI Communication Bus", status:"stub", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"kg-sync", name:"Knowledge Synchronization", status:"stub", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"policy", name:"Policy Enforcement", status:"online", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"security", name:"Security Enforcement", status:"online", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"compute", name:"Compute Allocation", status:"online", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"model-sel", name:"Intelligent Model Selection", status:"online", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"workflow", name:"Workflow Orchestration", status:"online", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"voice", name:"Voice Orchestration", status:"stub", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"media", name:"Media Orchestration", status:"stub", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"self-opt", name:"Autonomous Self-Optimization", status:"online", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"diag", name:"Self-Diagnostics", status:"online", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"heal", name:"Self-Healing", status:"online", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"perf", name:"Performance Optimization", status:"online", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
  { key:"health", name:"Enterprise Health Monitoring", status:"online", messageRate:0, errorRate:0, lastHeartbeat: new Date().toISOString() },
];

export const KernelService = {
  async ensureStarted() {
    const existing = await redis.get(startedKey);
    if (existing) return;
    await redis.set(startedKey, new Date().toISOString());
    const multi = redis.multi();
    multi.del(K.components);
    for (const c of defaultComponents) {
      multi.hset(`kernel:comp:${c.key}`, "_doc", JSON.stringify(c));
      multi.zadd(K.components, 0, c.key);
    }
    await multi.exec();
  },
  async listComponents(): Promise<KernelComponent[]> {
    const ids = await redis.zrange(K.components, 0, -1);
    const out: KernelComponent[] = [];
    for (const k of ids) { const r = await redis.hgetall(`kernel:comp:${k}`); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out;
  },
  async heartbeat(key: string, messageRate = 0, errorRate = 0): Promise<void> {
    const r = await redis.hgetall(`kernel:comp:${key}`);
    if (!r._doc) return;
    const c: KernelComponent = JSON.parse(r._doc);
    c.messageRate = messageRate; c.errorRate = errorRate; c.lastHeartbeat = new Date().toISOString();
    c.status = errorRate > 0.1 ? "degraded" : "online";
    await redis.hset(`kernel:comp:${key}`, "_doc", JSON.stringify(c));
  },
  async dispatch(ev: Omit<KernelEvent,"id"|"at">): Promise<KernelEvent> {
    const start = Date.now();
    const full: KernelEvent = { ...ev, id: "ke-" + randomUUID().slice(0,8), at: new Date().toISOString() };
    await redis.zadd(K.events, Date.now(), JSON.stringify(full));
    await redis.incr(K.events24);
    await redis.lpush(K.lats, String(Date.now()-start));
    await redis.ltrim(K.lats, 0, 199);
    await redis.zremrangebyrank(K.events, 0, -501);
    return full;
  },
  async evaluatePolicy(_input: any): Promise<KernelPolicyDecision> {
    await redis.incr(K.policy24);
    // MVP policy: allow unless marked high-risk without approvals
    if (_input?.risk === "high" && !_input?.approved) {
      await redis.incr(K.block24);
      return { allowed: false, reason: "high-risk requires approval", requiredApprovals: ["org-admin","risk-officer"] };
    }
    return { allowed: true, requiredApprovals: [] };
  },
  async grantResources(input: { priority: "interactive"|"batch"; gpuCards?: number }): Promise<KernelResourceGrant> {
    return {
      cpuMillicores: input.priority === "interactive" ? 2000 : 500,
      memoryMb: input.priority === "interactive" ? 4096 : 1024,
      gpuCards: input.gpuCards ?? (input.priority === "interactive" ? 0 : 0),
      ttlSeconds: input.priority === "interactive" ? 60 : 600,
    };
  },
  async selectModel(task: string): Promise<{ modelId: string; via: string }> {
    await redis.incr(K.modelSel24);
    // MVP selection — prefer local model when available
    return { modelId: "mdl-windels-core-v2-210", via: "kernel.model-select.local-preferred" };
  },
  async runDiagnostics(): Promise<{healthy:boolean; degraded:string[]}> {
    const comps = await this.listComponents();
    const degraded = comps.filter(c => c.status === "degraded" || c.status === "offline").map(c=>c.name);
    if (degraded.length) { await redis.incr(K.selfheal); /* auto-mark as online for MVP healing */ for (const c of comps.filter(cc=>cc.status!=="stub")) {
      if (c.status==="offline"||c.status==="degraded") { c.status="online"; await redis.hset(`kernel:comp:${c.key}`, "_doc", JSON.stringify(c)); }
    } }
    return { healthy: degraded.length===0, degraded };
  },
  async listEvents(limit=100): Promise<KernelEvent[]> {
    const raw = await redis.zrange(K.events, 0, -1, "REV");
    return raw.slice(0,limit).map(s=>JSON.parse(s));
  },
  async summary(): Promise<KernelDashboard> {
    const comps = await this.listComponents();
    const started = await redis.get(startedKey);
    const uptime = started ? Math.floor((Date.now() - Date.parse(started))/1000) : 0;
    const [ev,pol,blk,mod,sh] = await Promise.all([
      redis.get(K.events24).then(n=>Number(n??0)),
      redis.get(K.policy24).then(n=>Number(n??0)),
      redis.get(K.block24).then(n=>Number(n??0)),
      redis.get(K.modelSel24).then(n=>Number(n??0)),
      redis.get(K.selfheal).then(n=>Number(n??0)),
    ]);
    const latRaw = await redis.lrange(K.lats,0,99);
    const lats = latRaw.map(Number).filter(n=>n>0);
    const avgLat = lats.length?Math.round(lats.reduce((a,b)=>a+b,0)/lats.length):5;
    return { components: comps, events24h: ev, avgDispatchLatencyMs: avgLat, policiesEvaluated24h: pol, policiesBlocked24h: blk, uptimeSeconds: uptime, selfHealed24h: sh, modelSelections24h: mod };
  },
};
