/**
 * Session 60 — Enterprise AI Training & Fine-Tuning Platform.
 * Dataset management, cleaning, synthetic data, RAG builder, prompt opt,
 * fine-tuning (full/LoRA/QLoRA/DPO/RLHF), benchmark eval, safety testing,
 * governance, canary, rollback, continuous learning pipelines.
 * Keys: tr:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { makeRng } from "../utils/detRng.js";
const _rng = makeRng("training:training");
import {
  TrainingDataset, TrainingJob, TUNING_STRATEGIES, TuningStrategy,
  DATASET_FORMATS, DatasetFormat, TrainingJobStatus, JOB_STATUS,
  SafetyCheck, ContinuousLearningPipeline, TrainingDashboard,
} from "@windels/shared";

const K = {
  d: (oid: string, id: string) => `tr:d:${oid}:${id}`,
  ds: (oid: string) => `tr:ds:${oid}`,
  j: (oid: string, id: string) => `tr:j:${oid}:${id}`,
  js: (oid: string) => `tr:js:${oid}`,
  sc: (oid: string, jid: string, id: string) => `tr:sc:${oid}:${jid}:${id}`,
  scs: (oid: string, jid: string) => `tr:scs:${oid}:${jid}`,
  cl: (oid: string, id: string) => `tr:cl:${oid}:${id}`,
  cls: (oid: string) => `tr:cls:${oid}`,
};
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0,8);
function rand(min:number,max:number) { return _rng.next()*(max-min)+min; }
function randInt(min:number,max:number) { return Math.floor(rand(min,max+1)); }

const SEED_DATASETS: Array<{name:string;fmt:DatasetFormat;rows:number;sizeMb:number;synthPct:number;cleaned:boolean;rag:boolean}> = [
  {name:"Support Tickets Gold", fmt:"jsonl", rows:48000, sizeMb:62, synthPct:12, cleaned:true, rag:true},
  {name:"Sales Conversations", fmt:"csv", rows:22000, sizeMb:28, synthPct:5, cleaned:true, rag:false},
  {name:"Synthetic Policy QA", fmt:"parquet", rows:120000, sizeMb:180, synthPct:100, cleaned:true, rag:true},
  {name:"Finance Reports (corpus)", fmt:"hf_dataset", rows:8000, sizeMb:220, synthPct:0, cleaned:false, rag:true},
];

const BASE_MODELS = ["Aria-7B","Aria-7B-Instruct","Aria-70B","Whisper-WINDELS-v3","Embed-WINDELS-v2"];
/** Categories that must all be evaluated before a job can pass its safety gate. */
export const SAFETY_CATS: SafetyCheck["category"][] = ["toxicity","hallucination","bias","pii","jailbreak","harm"];

export const TrainingService = {
  async ensureBootstrapped(logger?: any, oid = "org-windels", uid0 = "user-admin") {
    if (await redis.exists(K.ds(oid))) return;
    const now = new Date().toISOString();
    // seed datasets
    const dsIds: string[] = [];
    for (const d of SEED_DATASETS) {
      const id = uid("ds-");
      const ds: TrainingDataset = {
        id, organizationId: oid, name: d.name, format: d.fmt, rows: d.rows,
        sizeBytes: d.sizeMb*1024*1024, syntheticPct: d.synthPct, cleaned: d.cleaned,
        ragbuilderIncluded: d.rag, governanceApproved: d.cleaned, createdAt: now, updatedAt: now,
      };
      await redis.hset(K.d(oid,id),"_doc",s2(ds)); await redis.sadd(K.ds(oid),id);
      dsIds.push(id);
    }
    // seed some jobs
    for (let i=0;i<5;i++) {
      const id = uid("job-");
      const statuses: TrainingJobStatus[] = ["queued","training","evaluating","governance_review","canary","deployed","failed"];
      const status = statuses[i];
      const strategy: TuningStrategy = TUNING_STRATEGIES[i % TUNING_STRATEGIES.length];
      const base = BASE_MODELS[i % BASE_MODELS.length];
      const job: TrainingJob = {
        id, organizationId: oid, name: `tune-${base}-${i+1}`, baseModel: base,
        datasetId: dsIds[i % dsIds.length], strategy,
        hyperparams: { lr: +(1e-4 + rand(0,3e-4)).toFixed(6), epochs: randInt(1,4), batchSize: [8,16,32,4][i%4], loraRank: strategy.includes("lora")? 8 : undefined },
        status, progressPct: status==="deployed"?100:randInt(5,95),
        evalScore: status==="deployed"||status==="canary" ? +rand(0.72,0.94).toFixed(3) : undefined,
        safetyPassed: status==="deployed"||status==="canary"? true : status==="failed" ? false : undefined,
        canaryPct: status==="canary"? 5 : 0, targetModelId: status==="deployed"||status==="canary"? uid("mdl-") : undefined,
        gpuHours: +rand(0.8, 24).toFixed(2), costEstimateUsd: +rand(2, 220).toFixed(2),
        createdBy: uid0,
        startedAt: status!=="queued" ? new Date(Date.now()-randInt(1,48)*3600000).toISOString() : undefined,
        completedAt: status==="deployed"||status==="failed" ? new Date(Date.now()-randInt(1,12)*3600000).toISOString() : undefined,
        createdAt: new Date(Date.now()-randInt(1,72)*3600000).toISOString(), updatedAt: now,
      };
      await redis.hset(K.j(oid,id),"_doc",s2(job)); await redis.sadd(K.js(oid),id);
      // safety checks for evaluated+
      if (["evaluating","governance_review","canary","deployed","failed"].includes(status)) {
        for (const cat of SAFETY_CATS) {
          const scId = uid("sc-");
          const thresh = cat==="pii"?0.01:cat==="jailbreak"?0.02:0.05;
          const score = +rand(0, thresh*1.2).toFixed(4);
          const passed = score <= thresh;
          const sc: SafetyCheck = { id: scId, jobId: id, category: cat, score, threshold: thresh, passed, ranAt: now };
          await redis.hset(K.sc(oid,id,scId),"_doc",s2(sc)); await redis.sadd(K.scs(oid,id),scId);
          if (job.safetyPassed===undefined) job.safetyPassed = true;
          if (!passed) job.safetyPassed = false;
        }
        await redis.hset(K.j(oid,id),"_doc",s2(job));
      }
    }
    // CL pipelines
    for (let i=0;i<2;i++) {
      const id = uid("cl-");
      const cl: ContinuousLearningPipeline = {
        id, name: i===0?"Support Ticket CLP":"Sales CLP",
        modelId: uid("mdl-"), cadenceHours: [24,48][i], datasetSource: ["production-logs","support-feedback"][i],
        lastRanAt: new Date(Date.now()-i*86400000).toISOString(),
        nextRunAt: new Date(Date.now()+(24-i*12)*3600000).toISOString(),
        enabled: i===0, status: i===0?"idle":"paused",
      };
      await redis.hset(K.cl(oid,id),"_doc",s2(cl)); await redis.sadd(K.cls(oid),id);
    }
    logger?.info?.("[training] bootstrap complete", { datasets: SEED_DATASETS.length });
  },

  async dashboard(oid = "org-windels"): Promise<TrainingDashboard> {
    const dids = await redis.smembers(K.ds(oid));
    const jids = await redis.smembers(K.js(oid));
    const cids = await redis.smembers(K.cls(oid));
    const datasets: TrainingDataset[] = []; const jobs: TrainingJob[] = [];
    let pass=0, totalSc=0;
    for (const id of dids) { const r = await redis.hgetall(K.d(oid,id)); if (r._doc) datasets.push(JSON.parse(r._doc)); }
    for (const id of jids) {
      const r = await redis.hgetall(K.j(oid,id)); if (!r._doc) continue;
      const j: TrainingJob = JSON.parse(r._doc); jobs.push(j);
      const scIds = await redis.smembers(K.scs(oid,id));
      for (const sid of scIds) { const rr = await redis.hgetall(K.sc(oid,id,sid)); if (rr._doc) { const sc: SafetyCheck = JSON.parse(rr._doc); totalSc++; if (sc.passed) pass++; } }
    }
    const running = jobs.filter(j=>["queued","preparing","training","evaluating","governance_review","canary"].includes(j.status)).length;
    const completed30 = jobs.filter(j=>j.completedAt && (Date.now()-new Date(j.completedAt).getTime())<30*86400000 && j.status==="deployed").length;
    const failed30 = jobs.filter(j=>j.completedAt && (Date.now()-new Date(j.completedAt).getTime())<30*86400000 && j.status==="failed").length;
    const canary = jobs.filter(j=>j.status==="canary").length;
    const deployed = jobs.filter(j=>j.status==="deployed");
    const avgScore = deployed.length && deployed.some(j=>j.evalScore!=null) ? +(deployed.reduce((s,j)=>s+(j.evalScore||0),0)/deployed.filter(j=>j.evalScore!=null).length).toFixed(3) : 0;
    return {
      datasets: datasets.length, jobsRunning: running, jobsQueued: jobs.filter(j=>j.status==="queued").length,
      jobsCompleted30d: completed30, jobsFailed30d: failed30,
      safetyChecksPassRate: totalSc ? +(pass/totalSc).toFixed(3) : 1,
      canaryDeployments: canary, clPipelines: cids.length,
      gpuHoursUsed30d: +jobs.filter(j=>j.startedAt && (Date.now()-new Date(j.startedAt).getTime())<30*86400000).reduce((s,j)=>s+j.gpuHours,0).toFixed(2),
      costUsd30d: +jobs.filter(j=>j.startedAt && (Date.now()-new Date(j.startedAt).getTime())<30*86400000).reduce((s,j)=>s+j.costEstimateUsd,0).toFixed(2),
      avgEvalScore: avgScore,
      recentJobs: jobs.sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||"")).slice(0,8),
      recentDatasets: datasets.sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||"")).slice(0,6),
    };
  },

  async listDatasets(oid = "org-windels"): Promise<TrainingDataset[]> {
    const ids = await redis.smembers(K.ds(oid)); const out: TrainingDataset[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.d(oid,id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  },

  async createDataset(input: { name: string; format: DatasetFormat; rows?: number; sizeBytes?: number; syntheticPct?: number; cleaned?: boolean; ragbuilderIncluded?: boolean; organizationId?: string }): Promise<TrainingDataset> {
    const oid = input.organizationId || "org-windels"; const id = uid("ds-"); const now = new Date().toISOString();
    const ds: TrainingDataset = {
      id, organizationId: oid, name: input.name, format: input.format,
      rows: input.rows || 0, sizeBytes: input.sizeBytes || 0, syntheticPct: input.syntheticPct || 0,
      cleaned: !!input.cleaned, ragbuilderIncluded: !!input.ragbuilderIncluded, governanceApproved: false,
      createdAt: now, updatedAt: now,
    };
    await redis.hset(K.d(oid,id),"_doc",s2(ds)); await redis.sadd(K.ds(oid),id);
    return ds;
  },

  async startJob(input: { name: string; baseModel: string; datasetId: string; strategy: TuningStrategy; hyperparams: TrainingJob["hyperparams"]; createdBy: string; organizationId?: string }): Promise<TrainingJob> {
    const oid = input.organizationId || "org-windels"; const id = uid("job-"); const now = new Date().toISOString();
    const gpuHours = { full: 24, lora: 4, qlora: 2, dpo: 8, rlhf: 18, rag_only: 0.2, prompt_only: 0.1 }[input.strategy] || 4;
    const job: TrainingJob = {
      id, organizationId: oid, name: input.name, baseModel: input.baseModel, datasetId: input.datasetId,
      strategy: input.strategy, hyperparams: input.hyperparams, status: "queued", progressPct: 0,
      canaryPct: 0, gpuHours, costEstimateUsd: +(gpuHours * 4.2).toFixed(2),
      createdBy: input.createdBy, createdAt: now, updatedAt: now,
    };
    await redis.hset(K.j(oid,id),"_doc",s2(job)); await redis.sadd(K.js(oid),id);
    // The job is queued for a real trainer. It previously auto-advanced
    // through every stage on a timer — see _simulateJob below.
    return job;
  },

  /**
   * Advance a training job to a reported stage.
   *
   * This replaces `_simulateJob`, which walked every job through
   * preparing -> training -> evaluating -> governance_review -> canary ->
   * deployed on a ~450ms-per-stage timer. Along the way it invented an
   * evaluation score (0.70-0.95) and, more seriously, generated the safety
   * checks themselves: each category's score was drawn from
   * `rand(0, threshold * 0.9)`, i.e. **always below its own threshold**, so
   * `safetyPassed` was true by construction and every model reached "deployed"
   * with a clean safety record it had never earned.
   *
   * Stages now advance only when a trainer reports one, and safety results must
   * be recorded explicitly via `recordSafetyCheck`.
   */
  async reportStage(
    id: string,
    input: { status: TrainingJobStatus; progressPct?: number; evalScore?: number; targetModelId?: string },
    oid = "org-windels",
  ): Promise<TrainingJob | null> {
    const r = await redis.hgetall(K.j(oid, id));
    if (!r._doc) return null;
    const j: TrainingJob = JSON.parse(r._doc);
    j.status = input.status;
    if (input.progressPct !== undefined) j.progressPct = input.progressPct;
    if (input.evalScore !== undefined) j.evalScore = input.evalScore;
    if (input.targetModelId) j.targetModelId = input.targetModelId;
    if (input.status === "training" && !j.startedAt) j.startedAt = new Date().toISOString();
    if (input.status === "deployed") j.completedAt = new Date().toISOString();
    j.updatedAt = new Date().toISOString();
    await redis.hset(K.j(oid, id), "_doc", s2(j));
    return j;
  },

  /**
   * Record a real safety-evaluation result. `safetyPassed` flips to true only
   * once every category has been evaluated and each one passed — it is never
   * assumed.
   */
  async recordSafetyCheck(
    id: string,
    input: { category: (typeof SAFETY_CATS)[number]; score: number; threshold: number },
    oid = "org-windels",
  ): Promise<SafetyCheck | null> {
    const r = await redis.hgetall(K.j(oid, id));
    if (!r._doc) return null;
    const j: TrainingJob = JSON.parse(r._doc);
    const scId = uid("sc-");
    const sc: SafetyCheck = {
      id: scId, jobId: id, category: input.category,
      score: input.score, threshold: input.threshold,
      passed: input.score <= input.threshold,
      ranAt: new Date().toISOString(),
    };
    await redis.hset(K.sc(oid, id, scId), "_doc", s2(sc));
    await redis.sadd(K.scs(oid, id), scId);

    // Re-derive the overall verdict from every recorded check.
    const ids = await redis.smembers(K.scs(oid, id));
    const checks: SafetyCheck[] = [];
    for (const cid of ids) {
      const raw = await redis.hget(K.sc(oid, id, cid), "_doc");
      if (raw) { try { checks.push(JSON.parse(raw)); } catch { /* skip */ } }
    }
    const covered = new Set(checks.map((c) => c.category));
    const allCategoriesRun = SAFETY_CATS.every((c) => covered.has(c));
    j.safetyPassed = allCategoriesRun && checks.every((c) => c.passed);
    j.updatedAt = new Date().toISOString();
    await redis.hset(K.j(oid, id), "_doc", s2(j));
    return sc;
  },

  async promoteToCanary(id: string, pct: number, oid = "org-windels"): Promise<TrainingJob | null> {
    const r = await redis.hgetall(K.j(oid,id)); if (!r._doc) return null;
    const j: TrainingJob = JSON.parse(r._doc);
    // Require a positive result. The old check only blocked an explicit false,
    // so a job whose safety checks had never run (undefined) was promotable.
    if (j.safetyPassed !== true) {
      throw Object.assign(new Error("safety checks have not passed for this job"), { status: 400 });
    }
    j.canaryPct = Math.max(1, Math.min(50, pct));
    j.status = "canary"; j.updatedAt = new Date().toISOString();
    await redis.hset(K.j(oid,id),"_doc",s2(j)); return j;
  },

  async rollback(id: string, oid = "org-windels"): Promise<TrainingJob | null> {
    const r = await redis.hgetall(K.j(oid,id)); if (!r._doc) return null;
    const j: TrainingJob = JSON.parse(r._doc); j.status = "rolled_back" as TrainingJobStatus; j.updatedAt = new Date().toISOString();
    await redis.hset(K.j(oid,id),"_doc",s2(j)); return j;
  },

  /** Fetch a single job. The service previously exposed only listJobs(). */
  async getJob(id: string, oid = "org-windels"): Promise<TrainingJob | null> {
    const r = await redis.hgetall(K.j(oid, id));
    if (!r._doc) return null;
    try { return JSON.parse(r._doc) as TrainingJob; } catch { return null; }
  },

  async listJobs(oid = "org-windels"): Promise<TrainingJob[]> {
    const ids = await redis.smembers(K.js(oid)); const out: TrainingJob[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.j(oid,id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out.sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
  },
};
