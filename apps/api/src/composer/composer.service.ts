/**
 * Session 49 — AI Capability Composer (V8.4 §4).
 * Visual no-code composition of AI capabilities from prior sessions.
 * 11 composable primitives. Keys: cmp:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import type {
  ComposedWorkflow,
  ComposerCapabilityType,
  ComposerDashboard,
  ComposerLibraryEntry,
  ComposerRunLog,
  ComposerRunOutcome,
  ComposerValidationResult,
} from "@windels/shared";

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

/**
 * Rehydrate a stored workflow, or null if the row cannot be read.
 *
 * S166 — returns null rather than throwing or substituting a placeholder. An
 * unreadable row is counted and reported (`unreadableWorkflows`); it is never
 * deleted. `ensureBootstrapped` used to treat "no row parses" as licence to
 * wipe the organization's entire workflow set and reseed the example.
 *
 * The legacy flat-field branch also defaulted `successRate` to `1` and
 * `avgDurationMs` to `0` — inventing a perfect record for a row too damaged to
 * state one. Unmeasured figures are now null.
 */
function deserialize(r: Record<string,string>): ComposedWorkflow | null {
  if (r._doc) {
    try {
      const parsed = JSON.parse(r._doc) as ComposedWorkflow;
      if (!parsed || !parsed.id || !parsed.name) return null;
      if (!parsed.updatedAt) parsed.updatedAt = parsed.createdAt || new Date().toISOString();
      if (!parsed.nodes) parsed.nodes = [];
      if (!parsed.edges) parsed.edges = [];
      if (parsed.successRate === undefined) parsed.successRate = null;
      if (parsed.avgDurationMs === undefined) parsed.avgDurationMs = null;
      if (parsed.queuedRuns === undefined) parsed.queuedRuns = 0;
      if (!parsed.source) parsed.source = "operator_created";
      // `validated` was a status nothing could assign; migrate stragglers.
      if ((parsed.status as string) === "validated") parsed.status = "draft";
      return parsed;
    } catch { return null; }
  }
  if (!r.id || !r.name) return null;
  let nodes: ComposedWorkflow["nodes"] = [];
  let edges: ComposedWorkflow["edges"] = [];
  try {
    nodes = typeof r.nodes === "string" ? JSON.parse(r.nodes || "[]") : [];
    edges = typeof r.edges === "string" ? JSON.parse(r.edges || "[]") : [];
  } catch { return null; }
  const runs = Number(r.runs || "0");
  return {
    id: r.id, organizationId: r.organizationId, name: r.name, description: r.description || "",
    nodes, edges,
    status: ((r.status as string) === "validated" ? "draft" : r.status) as ComposedWorkflow["status"],
    version: Number(r.version || "1"),
    createdBy: r.createdBy, createdAt: r.createdAt, updatedAt: r.updatedAt || r.createdAt || new Date().toISOString(),
    lastDeployedAt: r.lastDeployedAt,
    runs,
    // No resolved run means no measurement — not a zero and not a perfect score.
    avgDurationMs: runs > 0 && r.avgDurationMs !== undefined ? Number(r.avgDurationMs) : null,
    successRate: runs > 0 && r.successRate !== undefined ? Number(r.successRate) : null,
    queuedRuns: Number(r.queuedRuns || "0"),
    source: (r.source as ComposedWorkflow["source"]) || "operator_created",
  };
}

export const ComposerService = {
  /**
   * Seed the example workflow, if and only if seeding is enabled and the
   * organization has no workflows at all.
   *
   * S166 — this method previously contained a "recovery" branch that made a
   * bootstrap destructive. It read every workflow in the set, counted how many
   * parsed as valid JSON, and if *none* did it ran:
   *
   *     for (const id of existing) await redis.del(K.wf(oid, id));
   *     await redis.del(K.wfs(oid), K.metrics(oid));
   *
   * A Redis hiccup, a partial write, or any schema change that made `_doc`
   * unparseable therefore caused the next server restart to delete every
   * workflow the organization owned and replace them with a demo example.
   * Recovery was indistinguishable from data loss, and it ran automatically at
   * boot with no operator involved.
   *
   * A bootstrap may create. It must never delete. Unreadable rows are now left
   * exactly where they are and surfaced as `unreadableWorkflows` on the
   * dashboard so a human can decide.
   *
   * The reseed also fired whenever the set was merely empty, so deleting the
   * example workflow brought it back on the next restart.
   */
  async ensureBootstrapped(logger?: any, oid = "org-windels", createdBy = "user-admin") {
    if (!demoDataEnabled()) return skipDemoSeed("composer", logger);

    const existing = await redis.smembers(K.wfs(oid));
    // Only ever seed into genuine emptiness. If ids are present — even ids
    // whose rows we cannot read — this organization has state we did not
    // create, and it is not ours to replace.
    if (existing.length > 0) return;

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
      status: "draft", version: 1, createdBy,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      // A workflow that has never run has no success rate and no average
      // duration to report. Seeded at 1 (100%) originally, then at 0 — both
      // are claims. null is the absence of one.
      runs: 0, queuedRuns: 0, avgDurationMs: null, successRate: null,
      source: "demo_seed",
    };
    await redis.hset(K.wf(oid, id), "_doc", s2(wf));
    await redis.sadd(K.wfs(oid), id);
    logger?.info?.("[composer] demo seed complete");
  },

  /**
   * S166 — reports what has been measured and nothing else.
   *
   * Previously: `successRate: totalRuns ? succ/totalRuns : 1`. An organization
   * that had never run a workflow reported a 100% success rate. It also
   * averaged `w.successRate * w.runs` across workflows whose successRate was a
   * seeded constant rather than an observation.
   *
   * The success rate is now the share of *resolved* runs that succeeded, and is
   * null when nothing has resolved. Queued runs — the normal state here, since
   * nothing in this repo executes composer workflows — are reported separately
   * so the gap between "triggered" and "actually ran" is visible.
   */
  async dashboard(oid: string): Promise<ComposerDashboard> {
    const { workflows: wfs, unreadable } = await this.listWithDiagnostics(oid);

    // `cmp:m` counts triggered runs; the workflow docs count resolved ones.
    // The two deliberately disagree, and the difference is the queue depth.
    const m = await redis.hgetall(K.metrics(oid));
    const triggered = Number(m?.totalRuns || "0");
    const succeeded = Number(m?.success || "0");
    const resolvedRuns = wfs.reduce((n, w) => n + w.runs, 0);
    const queuedRuns = Math.max(0, triggered - resolvedRuns);
    const failedRuns = Math.max(0, resolvedRuns - succeeded);

    const capUse = new Map<ComposerCapabilityType, number>();
    for (const w of wfs) for (const n of w.nodes) if (n.kind === "capability" && n.type) capUse.set(n.type, (capUse.get(n.type)||0) + 1);
    const popular = Array.from(capUse.entries()).map(([type, uses]) => ({ type, uses })).sort((a,b)=>b.uses-a.uses).slice(0,8);

    return {
      totalWorkflows: wfs.length,
      deployedWorkflows: wfs.filter((w)=>w.status==="deployed").length,
      draftWorkflows: wfs.filter((w)=>w.status==="draft").length,
      pausedWorkflows: wfs.filter((w)=>w.status==="paused").length,
      totalRuns: triggered,
      resolvedRuns,
      queuedRuns,
      failedRuns,
      workflowsWithRuns: wfs.filter((w)=>w.runs > 0).length,
      // No resolved run anywhere means there is no rate to report.
      successRate: resolvedRuns > 0 ? succeeded / resolvedRuns : null,
      unreadableWorkflows: unreadable,
      popularCapabilities: popular,
      library: LIBRARY,
    };
  },

  /**
   * List workflows, and say how many rows could not be read.
   *
   * S166 — the unreadable count exists so a damaged row is visible to an
   * operator instead of being silently skipped (the old `list()`) or deleted
   * (the old `ensureBootstrapped()`).
   */
  async listWithDiagnostics(oid: string): Promise<{ workflows: ComposedWorkflow[]; unreadable: number }> {
    const ids = await redis.smembers(K.wfs(oid));
    const out: ComposedWorkflow[] = [];
    let unreadable = 0;
    for (const id of ids) {
      try {
        const r = await redis.hgetall(K.wf(oid, id));
        if (!r || Object.keys(r).length === 0) { unreadable++; continue; }
        const wf = deserialize(r);
        if (!wf) { unreadable++; continue; }
        wf.updatedAt = wf.updatedAt || wf.createdAt || new Date().toISOString();
        out.push(wf);
      } catch { unreadable++; }
    }
    out.sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
    return { workflows: out, unreadable };
  },

  async list(oid: string): Promise<ComposedWorkflow[]> {
    return (await this.listWithDiagnostics(oid)).workflows;
  },

  async get(id: string, oid: string): Promise<ComposedWorkflow | null> {
    const r = await redis.hgetall(K.wf(oid, id));
    if (!r || Object.keys(r).length === 0) return null;
    return deserialize(r);
  },

  /**
   * S166 — `organizationId` is now required and comes from the authenticated
   * caller, never from the request body. Every workflow route used to call this
   * with no org, so it defaulted to `org-windels`; because the body may also
   * carry an `id`, one tenant could overwrite another tenant's workflow
   * definition by guessing an id.
   */
  async upsert(input: { id?: string; organizationId: string; createdBy: string; name: string; description?: string; nodes: ComposedWorkflow["nodes"]; edges: ComposedWorkflow["edges"] }): Promise<ComposedWorkflow> {
    const oid = input.organizationId;
    if (!oid) throw Object.assign(new Error("organizationId is required"), { status: 400 });
    const id = input.id || randomUUID().slice(0,10);
    const now = new Date().toISOString();
    const existing: ComposedWorkflow | null = input.id ? await this.get(input.id, oid) : null;

    // Editing the graph invalidates a deployment: the deployed shape is no
    // longer the stored shape. Returning to draft is the honest state.
    const wf: ComposedWorkflow = {
      id, organizationId: oid, name: input.name, description: input.description || "",
      nodes: input.nodes, edges: input.edges, status: "draft",
      version: (existing?.version || 0) + 1, createdBy: existing?.createdBy || input.createdBy,
      createdAt: existing?.createdAt || now, updatedAt: now,
      lastDeployedAt: existing?.lastDeployedAt,
      runs: existing?.runs || 0,
      queuedRuns: existing?.queuedRuns || 0,
      avgDurationMs: existing?.avgDurationMs ?? null,
      successRate: existing?.successRate ?? null,
      source: existing?.source || "operator_created",
    };
    await redis.hset(K.wf(oid, id), "_doc", s2(wf));
    await redis.sadd(K.wfs(oid), id);
    return wf;
  },

  async validate(id: string, oid: string): Promise<ComposerValidationResult> {
    const wf = await this.get(id, oid);
    const errors: ComposerValidationResult["errors"] = []; const warnings: string[] = [];
    if (!wf) return { valid: false, errors: [{ message: "workflow not found" }], warnings: [], capabilityCount: 0, estimatedCostPerRun: null, costModelConfigured: false };
    const ids = new Set(wf.nodes.map(n=>n.id));
    if (!wf.nodes.some(n=>n.kind==="trigger")) errors.push({ message: "Workflow needs at least one trigger node." });
    if (!wf.nodes.some(n=>n.kind==="output")) errors.push({ message: "Workflow needs at least one output node." });
    for (const n of wf.nodes) if (n.kind==="capability" && !n.type) errors.push({ nodeId: n.id, message: `Capability node "${n.label}" missing type.` });
    for (const e of wf.edges) { if (!ids.has(e.source)) errors.push({ edgeId: e.id, message: `Edge source ${e.source} not found.` }); if (!ids.has(e.target)) errors.push({ edgeId: e.id, message: `Edge target ${e.target} not found.` }); }
    const caps = wf.nodes.filter(n=>n.kind==="capability").length;
    if (caps===0) warnings.push("No capabilities wired yet.");
    return {
      valid: errors.length===0, errors, warnings, capabilityCount: caps,
      // S166 — was `caps * 0.002`, rendered as "est $0.0000/run". There is no
      // pricing table in this module; the formula charged a video-generation
      // node the same as an analytics event. An invented figure denominated in
      // dollars is worse than an absent one.
      estimatedCostPerRun: null,
      costModelConfigured: false,
    };
  },

  async deploy(id: string, oid: string): Promise<ComposedWorkflow> {
    const v = await this.validate(id, oid);
    if (!v.valid) throw Object.assign(new Error("workflow has validation errors"), { status: 400 });
    const wf = (await this.get(id, oid))!;
    const now = new Date().toISOString();
    wf.status = "deployed"; wf.lastDeployedAt = now; wf.updatedAt = now;
    await redis.hset(K.wf(oid, id), "_doc", s2(wf));
    emitKernel("composer.workflow.deployed", { organizationId: oid, workflowId: id });
    return wf;
  },

  /**
   * S166 — `paused` was declared in the status union and no code path could
   * assign it. Unlike `validated` (which was meaningless, since validity is
   * computed on demand and never stored), pausing names a real need: stop
   * accepting triggers without tearing down the deployment. So it is
   * implemented rather than deleted.
   */
  async pause(id: string, oid: string): Promise<ComposedWorkflow> {
    const wf = await this.get(id, oid);
    if (!wf) throw Object.assign(new Error("not found"), { status: 404 });
    if (wf.status !== "deployed") throw Object.assign(new Error("only a deployed workflow can be paused"), { status: 409 });
    wf.status = "paused"; wf.updatedAt = new Date().toISOString();
    await redis.hset(K.wf(oid, id), "_doc", s2(wf));
    emitKernel("composer.workflow.paused", { organizationId: oid, workflowId: id });
    return wf;
  },

  async resume(id: string, oid: string): Promise<ComposedWorkflow> {
    const wf = await this.get(id, oid);
    if (!wf) throw Object.assign(new Error("not found"), { status: 404 });
    if (wf.status !== "paused") throw Object.assign(new Error("only a paused workflow can be resumed"), { status: 409 });
    wf.status = "deployed"; wf.updatedAt = new Date().toISOString();
    await redis.hset(K.wf(oid, id), "_doc", s2(wf));
    emitKernel("composer.workflow.resumed", { organizationId: oid, workflowId: id });
    return wf;
  },

  /**
   * Queue a workflow run.
   *
   * Executing the workflow's nodes is the job of the workflow engine, which
   * reports back through `reportRunOutcome`. This method previously recorded
   * the run as `succeeded` the instant it was triggered — having executed
   * nothing — and fed that verdict into the stored `successRate`, so a
   * workflow that had never done any work displayed 100% success. (An earlier
   * version was worse still: it failed 1% of runs at random.)
   *
   * A triggered run is now `queued`. It contributes to `runs` but not to
   * `successRate` or the success counter until a real outcome arrives.
   */
  async run(id: string, userId: string, oid: string, _input?: Record<string,unknown>): Promise<ComposerRunLog> {
    const wf = await this.get(id, oid);
    if (!wf) throw Object.assign(new Error("not found"), { status: 404 });
    // S166 — the console disabled the Run button for a non-deployed workflow
    // but the endpoint did not check, so a draft or paused workflow could be
    // triggered directly over HTTP. A UI guard is not an authorization rule.
    if (wf.status !== "deployed") {
      throw Object.assign(new Error(`workflow is ${wf.status}; only a deployed workflow can be run`), { status: 409 });
    }
    const start = Date.now();
    const log: ComposerRunLog = {
      id: uid("run-"), workflowId: id,
      startedAt: new Date(start).toISOString(),
      status: "queued",
      durationMs: 0,
      stepCount: wf.nodes.length,
      triggeredBy: userId,
    };
    await redis.zadd(K.runs(oid), Date.now(), s2(log));
    await redis.zremrangebyrank(K.runs(oid), 0, -501);
    await redis.hincrby(K.metrics(oid), "totalRuns", 1);

    // Queue depth is per-workflow as well as per-org, so a workflow card can
    // show that it is waiting on an executor that may never arrive.
    wf.queuedRuns = (wf.queuedRuns || 0) + 1;
    await redis.hset(K.wf(oid, id), "_doc", s2(wf));
    return log;
  },

  /**
   * Record the outcome an executor actually observed.
   *
   * This is the only path that may mark a run succeeded or failed, and the only
   * one that moves `successRate` — keeping the reported figure a measurement
   * rather than an assumption.
   */
  async reportRunOutcome(
    runId: string,
    outcome: ComposerRunOutcome,
    oid: string,
  ): Promise<ComposerRunLog> {
    const rows = await redis.zrange(K.runs(oid), 0, -1);
    const idx = rows.findIndex((r) => {
      try { return (JSON.parse(r) as ComposerRunLog).id === runId; } catch { return false; }
    });
    if (idx < 0) throw Object.assign(new Error("run not found"), { status: 404 });

    const log = JSON.parse(rows[idx]!) as ComposerRunLog;
    if (log.status !== "queued" && log.status !== "running") {
      throw Object.assign(new Error("run already resolved"), { status: 409 });
    }

    const started = Date.parse(log.startedAt);
    log.status = outcome.status;
    log.completedAt = new Date().toISOString();
    log.durationMs = outcome.durationMs ?? Math.max(0, Date.now() - started);
    log.reportedBy = outcome.reportedBy;

    // Rewrite the stored entry in place, preserving its ordering score.
    const score = await redis.zscore(K.runs(oid), rows[idx]!);
    await redis.zrem(K.runs(oid), rows[idx]!);
    await redis.zadd(K.runs(oid), score ? Number(score) : started, s2(log));

    const wf = await this.get(log.workflowId, oid);
    if (wf) {
      const ok = outcome.status === "succeeded" ? 1 : 0;
      const prevRuns = wf.runs;
      wf.runs = prevRuns + 1;
      wf.queuedRuns = Math.max(0, (wf.queuedRuns || 0) - 1);
      // First resolved run establishes the measurement; before that both
      // figures were null, so there is nothing to average against.
      wf.successRate = prevRuns > 0 && wf.successRate !== null
        ? (wf.successRate * prevRuns + ok) / wf.runs
        : ok;
      wf.avgDurationMs = prevRuns > 0 && wf.avgDurationMs !== null
        ? Math.round((wf.avgDurationMs * prevRuns + log.durationMs) / wf.runs)
        : log.durationMs;
      wf.updatedAt = new Date().toISOString();
      await redis.hset(K.wf(oid, log.workflowId), "_doc", s2(wf));
    }
    if (outcome.status === "succeeded") await redis.hincrby(K.metrics(oid), "success", 1);
    return log;
  },

  /**
   * Most recent runs first.
   *
   * S166 — this was `zrange(key, -limit, -1, "REV")`. With REV the list is
   * already ordered newest-first, so index 0 is the newest and `-limit..-1`
   * selects the tail: the panel labelled "Recent Runs" was showing the
   * *oldest* runs, and a newly triggered run never appeared in it until the
   * ledger was short enough. The window is `0 .. limit-1`.
   */
  async getRuns(oid: string, limit = 50): Promise<ComposerRunLog[]> {
    const rows = await redis.zrange(K.runs(oid), 0, limit - 1, "REV");
    const out: ComposerRunLog[] = [];
    for (const r of rows) {
      try { out.push(JSON.parse(r) as ComposerRunLog); } catch { /* skip damaged entry, never delete it */ }
    }
    return out;
  },
};

export default ComposerService;
