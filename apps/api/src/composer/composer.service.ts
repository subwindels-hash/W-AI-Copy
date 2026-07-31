/**
 * Session 49 — AI Capability Composer (V8.4 §4).
 * Visual no-code composition of AI capabilities from prior sessions.
 * 11 composable primitives. Keys: cmp:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  ComposedWorkflow,
  ComposerCapabilityType,
  ComposerDashboard,
  ComposerLibraryEntry,
  ComposerRunLog,
  ComposerValidationResult,
} from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('composer:composer');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const K = {
  wf: (oid: string, id: string) => `cmp:wf:${oid}:${id}`,
  wfs: (oid: string) => `cmp:wfs:${oid}`,
  runs: (oid: string) => `cmp:runs:${oid}`,
  metrics: (oid: string) => `cmp:m:${oid}`,
};
const j = (s: string | null) => (s ? JSON.parse(s) : null);
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

export const LIBRARY: ComposerLibraryEntry[] = [
  { type: "ocr", label: "OCR", description: "Extract text from images and PDFs.", sourceSession: "S20", icon: "Scan", inputs: ["image_bytes"], outputs: ["text"] },
  { type: "vision_analysis", label: "Vision Analysis", description: "Detect objects, scenes and text in images.", sourceSession: "S18", icon: "Eye", inputs: ["image"], outputs: ["tags","objects"] },
  { type: "translation", label: "Translation", description: "Translate between 130+ languages.", sourceSession: "S24", icon: "Languages", inputs: ["text","target_lang"], outputs: ["translated_text"] },
  { type: "voice_generation", label: "Voice Generation", description: "Synthesize speech using Foundry voices (S40–41).", sourceSession: "S40/41", icon: "Mic", inputs: ["text","voice_id"], outputs: ["audio_url"] },
  { type: "video_generation", label: "Video Generation", description: "Generate video clips from prompts/images (S42).", sourceSession: "S42", icon: "Film", inputs: ["prompt"], outputs: ["video_url"] },
  { type: "knowledge_retrieval", label: "Knowledge Retrieval", description: "RAG over enterprise knowledge.", sourceSession: "S12", icon: "BookOpen", inputs: ["query"], outputs: ["chunks"] },
  { type: "ai_reasoning", label: "AI Reasoning", description: "LLM reasoning over provided context.", sourceSession: "S8/S43", icon: "Brain", inputs: ["context","question"], outputs: ["answer"] },
  { type: "crm_action", label: "CRM Action", description: "Create/update CRM records.", sourceSession: "S27", icon: "Users", inputs: ["object","payload"], outputs: ["record_id"] },
  { type: "workflow_automation", label: "Workflow Step", description: "Trigger downstream workflow automation.", sourceSession: "S14", icon: "Workflow", inputs: ["workflow_id","data"], outputs: ["run_id"] },
  { type: "notification", label: "Notification", description: "Send email/SMS/in-app notification.", sourceSession: "S22", icon: "Bell", inputs: ["channel","recipient","body"], outputs: ["delivered"] },
  { type: "analytics", label: "Analytics", description: "Emit event to analytics pipeline.", sourceSession: "S23", icon: "BarChart", inputs: ["event","props"], outputs: ["ok"] },
];

async function emitKernel(kind: string, payload: any) {
  try { const { KernelService } = await import("../kernel/kernel.service.js"); await KernelService.dispatch({ source: "composer", kind, payload }); } catch {}
}

function deserialize(r: Record<string,string>): ComposedWorkflow {
  // Support both _doc-wrapped format and legacy flat fields
  if (r._doc) {
    try {
      const parsed = JSON.parse(r._doc) as ComposedWorkflow;
      // Defensive defaults
      if (!parsed.updatedAt) parsed.updatedAt = parsed.createdAt || new Date().toISOString();
      if (!parsed.nodes) parsed.nodes = [];
      if (!parsed.edges) parsed.edges = [];
      return parsed;
    } catch { /* fallthrough */ }
  }
  const nodes = typeof r.nodes === "string" ? JSON.parse(r.nodes || "[]") : [];
  const edges = typeof r.edges === "string" ? JSON.parse(r.edges || "[]") : [];
  return {
    id: r.id, organizationId: r.organizationId, name: r.name, description: r.description,
    nodes, edges,
    status: r.status as ComposedWorkflow["status"], version: Number(r.version),
    createdBy: r.createdBy, createdAt: r.createdAt, updatedAt: r.updatedAt || r.createdAt || new Date().toISOString(),
    lastDeployedAt: r.lastDeployedAt, runs: Number(r.runs || "0"),
    avgDurationMs: Number(r.avgDurationMs || "0"), successRate: Number(r.successRate || "1"),
  };
}

export const ComposerService = {
  async ensureBootstrapped(logger?: any, oid = "org-windels", uid = "user-admin") {
    const existing = await redis.smembers(K.wfs(oid));
    // If set exists but is empty or all referenced wfs are missing, drop and reseed
    let needsSeed = existing.length === 0;
    if (!needsSeed) {
      let valid = 0;
      for (const id of existing) {
        const r = await redis.hgetall(K.wf(oid, id));
        if (r && r._doc) {
          try { const p = JSON.parse(r._doc); if (p && p.id && p.name) valid++; } catch { /* ignore */ }
        }
      }
      if (valid === 0) needsSeed = true;
    }
    if (!needsSeed) return;
    // Clean any stale keys
    for (const id of existing) { await redis.del(K.wf(oid, id)); }
    await redis.del(K.wfs(oid), K.metrics(oid));
    const id = randomUUID().slice(0,10);
    const wf: ComposedWorkflow = {
      id, organizationId: oid,
      name: "Customer Inquiry Auto-Responder (Example)",
      description: "OCR inbound → retrieve KB → reason → voice reply + notify agent.",
      nodes: [
        { id: "t1", kind: "trigger", label: "Email arrives", x: 40, y: 120, config: { channel: "email" } },
        { id: "c1", kind: "capability", type: "ocr", label: "OCR attachment", x: 200, y: 120, config: {} },
        { id: "c2", kind: "capability", type: "knowledge_retrieval", label: "Retrieve KB", x: 380, y: 60, config: {} },
        { id: "c3", kind: "capability", type: "ai_reasoning", label: "Draft response", x: 560, y: 120, config: {} },
        { id: "c4", kind: "capability", type: "voice_generation", label: "Voice reply", x: 740, y: 60, config: { voiceId: "default" } },
        { id: "c5", kind: "capability", type: "notification", label: "Notify agent", x: 740, y: 200, config: { channel: "in_app" } },
        { id: "o1", kind: "output", label: "Send", x: 920, y: 120, config: {} },
      ],
      edges: [
        { id: "e1", source: "t1", target: "c1" }, { id: "e2", source: "c1", target: "c2" },
        { id: "e3", source: "c1", target: "c3" }, { id: "e4", source: "c2", target: "c3" },
        { id: "e5", source: "c3", target: "c4" }, { id: "e6", source: "c3", target: "c5" },
        { id: "e7", source: "c4", target: "o1" }, { id: "e8", source: "c5", target: "o1" },
      ],
      status: "draft", version: 1, createdBy: uid,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      runs: 0, avgDurationMs: 0, successRate: 1,
    };
    await redis.hset(K.wf(oid, id), "_doc", s2(wf));
    await redis.sadd(K.wfs(oid), id);
    await redis.hset(K.metrics(oid), "totalRuns", "0", "success", "0");
    logger?.info?.("[composer] bootstrap complete");
  },

  async dashboard(oid = "org-windels"): Promise<ComposerDashboard> {
    const wfs = await this.list(oid);
    const totalRuns = wfs.reduce((s, w) => s + w.runs, 0);
    const succ = wfs.reduce((s, w) => s + w.successRate * w.runs, 0);
    const capUse = new Map<ComposerCapabilityType, number>();
    for (const w of wfs) for (const n of w.nodes) if (n.kind === "capability" && n.type) capUse.set(n.type, (capUse.get(n.type)||0) + 1);
    const popular = Array.from(capUse.entries()).map(([type, uses]) => ({ type, uses })).sort((a,b)=>b.uses-a.uses).slice(0,8);
    return {
      totalWorkflows: wfs.length,
      deployedWorkflows: wfs.filter((w)=>w.status==="deployed").length,
      draftWorkflows: wfs.filter((w)=>w.status==="draft").length,
      totalRuns, successRate: totalRuns ? succ/totalRuns : 1,
      popularCapabilities: popular, library: LIBRARY,
    };
  },

  async list(oid = "org-windels"): Promise<ComposedWorkflow[]> {
    const ids = await redis.smembers(K.wfs(oid));
    const out: ComposedWorkflow[] = [];
    for (const id of ids) {
      try {
        const r = await redis.hgetall(K.wf(oid, id));
        if (!r || !r._doc) continue;
        const wf = deserialize(r);
        if (!wf || !wf.id || !wf.name) continue;
        wf.updatedAt = wf.updatedAt || wf.createdAt || new Date().toISOString();
        out.push(wf);
      } catch { /* skip corrupted entries */ }
    }
    return out.sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
  },

  async get(id: string, oid = "org-windels"): Promise<ComposedWorkflow | null> {
    const r = await redis.hgetall(K.wf(oid, id));
    return r._doc ? deserialize(r) : null;
  },

  async upsert(input: { id?: string; organizationId?: string; createdBy: string; name: string; description?: string; nodes: ComposedWorkflow["nodes"]; edges: ComposedWorkflow["edges"] }): Promise<ComposedWorkflow> {
    const oid = input.organizationId || "org-windels";
    const id = input.id || randomUUID().slice(0,10);
    const now = new Date().toISOString();
    let existing: ComposedWorkflow | null = input.id ? await this.get(input.id, oid) : null;
    const wf: ComposedWorkflow = {
      id, organizationId: oid, name: input.name, description: input.description || "",
      nodes: input.nodes, edges: input.edges, status: "draft",
      version: (existing?.version || 0) + 1, createdBy: existing?.createdBy || input.createdBy,
      createdAt: existing?.createdAt || now, updatedAt: now,
      lastDeployedAt: existing?.lastDeployedAt, runs: existing?.runs || 0,
      avgDurationMs: existing?.avgDurationMs || 0, successRate: existing?.successRate ?? 1,
    };
    await redis.hset(K.wf(oid, id), "_doc", s2(wf));
    await redis.sadd(K.wfs(oid), id);
    return wf;
  },

  async validate(id: string, oid = "org-windels"): Promise<ComposerValidationResult> {
    const wf = await this.get(id, oid);
    const errors: ComposerValidationResult["errors"] = []; const warnings: string[] = [];
    if (!wf) return { valid: false, errors: [{ message: "workflow not found" }], warnings: [], capabilityCount: 0, estimatedCostPerRun: 0 };
    const ids = new Set(wf.nodes.map(n=>n.id));
    if (!wf.nodes.some(n=>n.kind==="trigger")) errors.push({ message: "Workflow needs at least one trigger node." });
    if (!wf.nodes.some(n=>n.kind==="output")) errors.push({ message: "Workflow needs at least one output node." });
    for (const n of wf.nodes) if (n.kind==="capability" && !n.type) errors.push({ nodeId: n.id, message: `Capability node "${n.label}" missing type.` });
    for (const e of wf.edges) { if (!ids.has(e.source)) errors.push({ edgeId: e.id, message: `Edge source ${e.source} not found.` }); if (!ids.has(e.target)) errors.push({ edgeId: e.id, message: `Edge target ${e.target} not found.` }); }
    const caps = wf.nodes.filter(n=>n.kind==="capability").length;
    if (caps===0) warnings.push("No capabilities wired yet.");
    return { valid: errors.length===0, errors, warnings, capabilityCount: caps, estimatedCostPerRun: caps*0.002 };
  },

  async deploy(id: string, oid = "org-windels"): Promise<ComposedWorkflow> {
    const v = await this.validate(id, oid);
    if (!v.valid) throw Object.assign(new Error("workflow has validation errors"), { status: 400 });
    const wf = (await this.get(id, oid))!;
    const now = new Date().toISOString();
    wf.status = "deployed"; wf.lastDeployedAt = now; wf.updatedAt = now;
    await redis.hset(K.wf(oid, id), "_doc", s2(wf));
    emitKernel("composer.workflow.deployed", { organizationId: oid, workflowId: id });
    return wf;
  },

  async run(id: string, userId: string, oid = "org-windels", _input?: Record<string,unknown>): Promise<ComposerRunLog> {
    _rng.reseed(`run:${id}`);
    const wf = await this.get(id, oid);
    if (!wf) throw Object.assign(new Error("not found"), { status: 404 });
    const start = Date.now();
    let fail = false;
    for (let i=0;i<wf.nodes.length;i++) { await new Promise(r=>setTimeout(r, 15+_rng.next()*30)); if (_rng.next()<0.01) fail = true; }
    const dur = Date.now()-start;
    const log: ComposerRunLog = { id: uid("run-"), workflowId: id, startedAt: new Date(start).toISOString(), completedAt: new Date().toISOString(), status: fail ? "failed" : "succeeded", durationMs: dur, stepCount: wf.nodes.length, triggeredBy: userId };
    await redis.zadd(K.runs(oid), Date.now(), s2(log));
    await redis.zremrangebyrank(K.runs(oid), 0, -501);
    wf.runs += 1; wf.successRate = (wf.successRate*(wf.runs-1) + (fail?0:1))/wf.runs; wf.avgDurationMs = Math.round((wf.avgDurationMs*(wf.runs-1) + dur)/wf.runs);
    await redis.hset(K.wf(oid, id), "_doc", s2(wf));
    await redis.hincrby(K.metrics(oid), "totalRuns", 1);
    if (!fail) await redis.hincrby(K.metrics(oid), "success", 1);
    return log;
  },

  async getRuns(oid = "org-windels", limit = 50): Promise<ComposerRunLog[]> {
    const rows = await redis.zrange(K.runs(oid), -limit, -1, "REV");
    return rows.map(r => JSON.parse(r) as ComposerRunLog);
  },
};

export default ComposerService;
