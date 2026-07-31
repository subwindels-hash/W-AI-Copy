/**
 * AI Infrastructure (MLOps) routes (Session 30: Phase 29, Slices 258–270).
 * Mounted at /ml-ops behind authenticate + ORG_ADMIN.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { ModelsService } from "../../mlOps/models.service.js";
import { PromptsService } from "../../mlOps/prompts.service.js";
import { RagService } from "../../mlOps/rag.service.js";

const modelCreate = z.object({
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(140),
  description: z.string().min(2).max(600),
  kind: z.enum(["llm","embedding","reranker","vision","audio","custom"]),
  provider: z.enum(["openai","anthropic","google","cohere","mistral","meta","windels-self-hosted","huggingface","azure-openai","bedrock","custom"]),
  framework: z.enum(["pytorch","tensorflow","onnx","gguf","transformers","vllm","triton","custom"]).default("custom"),
  owner: z.string().default("ml-platform"),
  tags: z.array(z.string()).default([]),
  license: z.enum(["proprietary","open-source","apache-2.0","mit","enterprise"]).default("proprietary"),
  contextWindow: z.number().int().optional(),
  parametersB: z.number().optional(),
  modalities: z.array(z.enum(["text","image","audio","video","code"])).default(["text"]),
  color: z.enum(["azure","violet","teal","fuchsia","amber","emerald","crimson","slate"]).default("azure"),
  certified: z.enum(["official","partner","community"]).default("official"),
});
const versionAdd = z.object({
  version: z.string().min(2).max(20),
  metrics: z.array(z.object({ name: z.string(), value: z.number(), threshold: z.number().optional(), unit: z.string().optional(), pass: z.boolean() })).default([]),
  artifactUri: z.string().optional(),
  notes: z.string().optional(),
});
const promote = z.object({ to: z.enum(["registering","staging","approval","production","shadow","canary","deprecated","retired","rejected"]), actor: z.string().default("admin") });
const deploySchema = z.object({
  modelId: z.string(), modelVersionId: z.string(), name: z.string(),
  environment: z.enum(["dev","staging","prod","canary","edge"]),
  strategy: z.enum(["recreate","rolling","blue-green","canary","shadow"]).default("rolling"),
  region: z.string().default("na-east"), replicas: z.number().int().min(1).default(2),
  cpu: z.string().default("2"), memory: z.string().default("8Gi"), gpu: z.string().optional(),
  trafficPct: z.number().min(0).max(100).default(100), deployedBy: z.string().default("admin"),
});
const monitorCreate = z.object({
  name: z.string(), modelId: z.string(), type: z.enum(["drift","latency","error","quality","fairness","cost","safety","usage"]),
  threshold: z.number(), metric: z.string(),
  severity: z.enum(["info","warn","critical"]).default("warn"),
  window: z.enum(["5m","1h","24h","7d"]).default("5m"), enabled: z.boolean().default(true),
});
const metricReport = z.object({ value: z.number() });
const policyCreate = z.object({
  key: z.string().min(2).max(80),
  name: z.string().min(2),
  description: z.string(),
  type: z.enum(["approval-required","red-team","bias-scan","pii-scan","cost-quota","latency-slo","region-lock","model-allowlist","prompt-injection-scan"]),
  enforced: z.boolean().default(true),
  threshold: z.number().optional(),
  appliesToStages: z.array(z.enum(["draft","registering","staging","approval","production","shadow","canary","deprecated","retired","rejected"])).default(["production"]),
  owner: z.string().default("platform"),
});
const promptCreate = z.object({
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2), description: z.string(),
  kind: z.enum(["system","user","few-shot","tool","rag-context","eval"]),
  owner: z.string().default("platform"), tags: z.array(z.string()).default([]),
  color: z.enum(["azure","violet","teal","fuchsia","amber","emerald","crimson","slate"]).default("violet"),
});
const promptVersion = z.object({
  template: z.string().min(1), variables: z.array(z.object({
    name: z.string(), type: z.enum(["string","number","boolean","object"]), required: z.boolean().default(true),
    default: z.string().optional(), description: z.string().default(""),
  })).default([]), temperature: z.number().min(0).max(2).optional(), maxTokens: z.number().int().optional(),
  model: z.string().optional(), author: z.string().default("admin"), changelog: z.string().default("new version"),
});
const testCase = z.object({
  input: z.record(z.string()), expected: z.string().optional(), expectedContains: z.array(z.string()).optional(),
  rubric: z.enum(["exact","contains","llm-judge","semantic"]).default("contains"), tags: z.array(z.string()).default([]),
});
const idxCreate = z.object({
  name: z.string().min(2), dimensions: z.number().int().min(32).max(16384),
  metric: z.enum(["cosine","dot","euclidean"]).default("cosine"),
  embeddingModelId: z.string(), namespace: z.string().default("default"),
  shards: z.number().int().min(1).default(1), replicas: z.number().int().min(1).default(1),
  region: z.string().default("na-east"),
});
const embCreate = z.object({
  slug: z.string().min(2), name: z.string().min(2), provider: z.enum(["openai","cohere","voyage","mistral","windels","huggingface","custom"]),
  dimensions: z.number().int(), contextWindow: z.number().int(), avgLatencyMs: z.number().default(50),
  costPer1kTokens: z.number().default(0), normalized: z.boolean().default(true), multilingual: z.boolean().default(false),
  status: z.enum(["active","deprecated","beta"]).default("active"), benchmarks: z.record(z.number()).default({}),
  color: z.enum(["azure","violet","teal","fuchsia","amber","emerald","crimson","slate"]).default("azure"),
});
const ksCreate = z.object({
  name: z.string(), kind: z.enum(["document","wiki","web","db","s3","api","conversation","workflow"]),
  uri: z.string().url().or(z.string().min(3)), description: z.string(),
  embeddingModelId: z.string(), owner: z.string().default("platform"),
  permissions: z.array(z.string()).default(["read:org"]), freshnessHours: z.number().int().default(24),
});
const policyPatch = z.object({
  enforced: z.boolean().optional(), mode: z.enum(["hybrid","dense","sparse","keyword","graph"]).optional(),
  chunkSize: z.number().int().optional(), chunkOverlap: z.number().int().optional(),
  topK: z.number().int().optional(), minScore: z.number().optional(),
  citationRequired: z.boolean().optional(), piiRedact: z.boolean().optional(),
  maxDocsPerQuery: z.number().int().optional(), sourcesAllowed: z.array(z.string()).optional(),
});

export function registerMlOpsRoutes(router: Router) {
  // Dashboard
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try {
      const [mSum, pSum, rSum, monCount, polCount, depCount] = await Promise.all([
        ModelsService.dashboard(),
        PromptsService.summary(),
        RagService.summary(),
        ModelsService.listMonitors(),
        ModelsService.listPolicies(),
        ModelsService.listDeployments(),
      ]);
      res.json({ ok:true, data: {
        ...mSum, ...pSum, ...rSum,
      }});
    } catch(e){next(e);}
  });

  // Models
  router.get("/models", async (req, res, next) => {
    try {
      const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
      const stage = typeof req.query.stage === "string" ? req.query.stage as any : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      res.json({ ok:true, data: await ModelsService.list({ kind, stage, status, q }) });
    } catch(e){next(e);}
  });
  router.get("/models/:id", async (req, res, next) => {
    try {
      const m = await ModelsService.get(req.params.id);
      if (!m) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data: m });
    } catch(e){next(e);}
  });
  router.post("/models", validate({ body: modelCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await ModelsService.register({ ...req.body, sliceNumber: 259 }) }); }
    catch(e){next(e);}
  });
  router.post("/models/:id/versions", validate({ body: versionAdd }), async (req, res, next) => {
    try {
      const m = await ModelsService.addVersion(req.params.id, req.body.version, req.body.metrics, req.body.artifactUri, req.body.notes);
      if (!m) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:m });
    } catch(e){next(e);}
  });
  router.post("/models/:id/promote/:versionId", validate({ body: promote }), async (req, res, next) => {
    try {
      const m = await ModelsService.promote(req.params.id, req.params.versionId, req.body.to, req.body.actor);
      if (!m) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:m });
    } catch(e:any){
      if (/Invalid lifecycle/.test(e?.message??"")) return res.status(422).json({ ok:false, error:{code:"INVALID_TRANSITION", message:e.message} });
      next(e);
    }
  });

  // Deployments
  router.get("/deployments", async (req, res, next) => {
    try {
      const env = typeof req.query.env === "string" ? req.query.env as any : undefined;
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      const modelId = typeof req.query.modelId === "string" ? req.query.modelId : undefined;
      res.json({ ok:true, data: await ModelsService.listDeployments({ env, status, modelId }) });
    } catch(e){next(e);}
  });
  router.get("/deployments/:id", async (req, res, next) => {
    try {
      const d = await ModelsService.getDeployment(req.params.id);
      if (!d) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:d });
    } catch(e){next(e);}
  });
  router.post("/deployments", validate({ body: deploySchema }), async (req, res, next) => {
    try { res.json({ ok:true, data: await ModelsService.deploy(req.body) }); }
    catch(e){next(e);}
  });
  // Intake for observed serving telemetry. Replaces the qps/p95/error-rate that
  // were previously fabricated at deploy time for a deployment serving nothing.
  router.post("/deployments/:id/metrics", validate({ body: z.object({
    qps: z.number().min(0).optional(),
    p95Ms: z.number().min(0).optional(),
    errorRatePct: z.number().min(0).max(100).optional(),
    costPerHour: z.number().min(0).optional(),
    status: z.enum(["provisioning","scaling","healthy","degraded","rolling-back","scaled-to-zero","failed"]).optional(),
  }) }), async (req, res, next) => {
    try {
      const d = await ModelsService.reportMetrics(req.params.id, req.body);
      if (!d) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:d });
    } catch(e){next(e);}
  });

  // Record the measured size + content hash of a real uploaded artifact.
  router.post("/models/:id/versions/:versionId/artifact", validate({ body: z.object({
    sizeMb: z.number().min(0),
    hash: z.string().min(8).max(200),
  }) }), async (req, res, next) => {
    try {
      const m = await ModelsService.recordArtifact(req.params.id, req.params.versionId, req.body);
      if (!m) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:m });
    } catch(e){next(e);}
  });

  router.post("/deployments/:id/status", validate({ body: z.object({ status: z.enum(["provisioning","scaling","healthy","degraded","rolling-back","scaled-to-zero","failed"]) }) }), async (req, res, next) => {
    try {
      const d = await ModelsService.setDeploymentStatus(req.params.id, req.body.status);
      if (!d) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:d });
    } catch(e){next(e);}
  });

  // Monitors
  router.get("/monitors", async (req, res, next) => {
    try {
      const type = typeof req.query.type === "string" ? req.query.type as any : undefined;
      const modelId = typeof req.query.modelId === "string" ? req.query.modelId : undefined;
      const firing = typeof req.query.firing === "string" ? req.query.firing === "true" : undefined;
      res.json({ ok:true, data: await ModelsService.listMonitors({ type, modelId, firing }) });
    } catch(e){next(e);}
  });
  router.get("/monitors/:id", async (req, res, next) => {
    try {
      const m = await ModelsService.getMonitor(req.params.id);
      if (!m) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:m });
    } catch(e){next(e);}
  });
  router.post("/monitors", validate({ body: monitorCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await ModelsService.createMonitor(req.body) }); }
    catch(e){next(e);}
  });
  router.post("/monitors/:id/metrics", validate({ body: metricReport }), async (req, res, next) => {
    try {
      const m = await ModelsService.recordMetric(req.params.id, req.body.value);
      if (!m) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:m });
    } catch(e){next(e);}
  });
  router.post("/monitors/:id/alerts/:alertId/ack", validate({ body: z.object({ notes: z.string().optional() }) }), async (req, res, next) => {
    try {
      const m = await ModelsService.acknowledgeAlert(req.params.id, req.params.alertId, req.body.notes);
      if (!m) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:m });
    } catch(e){next(e);}
  });

  // Policies
  router.get("/model-policies", async (_req, res, next) => {
    try { res.json({ ok:true, data: await ModelsService.listPolicies() }); } catch(e){next(e);}
  });
  router.post("/model-policies", validate({ body: policyCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await ModelsService.createPolicy(req.body) }); } catch(e){next(e);}
  });
  router.post("/model-policies/:id/enforce", validate({ body: z.object({ enforced: z.boolean() }) }), async (req, res, next) => {
    try {
      const p = await ModelsService.setEnforced(req.params.id, req.body.enforced);
      if (!p) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:p });
    } catch(e){next(e);}
  });

  // Prompts
  router.get("/prompts", async (req, res, next) => {
    try {
      const kind = typeof req.query.kind === "string" ? req.query.kind as any : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      res.json({ ok:true, data: await PromptsService.list({ kind, q }) });
    } catch(e){next(e);}
  });
  router.get("/prompts/:id", async (req, res, next) => {
    try {
      const p = await PromptsService.get(req.params.id);
      if (!p) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:p });
    } catch(e){next(e);}
  });
  router.post("/prompts", validate({ body: promptCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await PromptsService.register(req.body) }); } catch(e){next(e);}
  });
  router.post("/prompts/:id/versions", validate({ body: promptVersion }), async (req, res, next) => {
    try {
      const p = await PromptsService.addVersion(req.params.id, req.body);
      if (!p) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:p });
    } catch(e){next(e);}
  });
  router.post("/prompts/:id/tests", validate({ body: testCase }), async (req, res, next) => {
    try {
      const p = await PromptsService.addTestCase(req.params.id, req.body);
      if (!p) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:p });
    } catch(e){next(e);}
  });
  router.post("/prompts/:id/run-tests", validate({ body: z.object({ model: z.string().default("claude-3.5-sonnet"), result: z.object({ casesPassed: z.number().int().min(0), avgLatencyMs: z.number().int().min(0).optional() }).optional() }) }), async (req, res, next) => {
    try {
      const r = await PromptsService.runTests(req.params.id, req.body.model, req.body.result);
      if (!r.prompt) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data: r });
    } catch(e){next(e);}
  });

  // RAG policy
  router.get("/rag/policy", async (_req, res, next) => {
    try { res.json({ ok:true, data: await RagService.getPolicy() }); } catch(e){next(e);}
  });
  router.patch("/rag/policy", validate({ body: policyPatch }), async (req, res, next) => {
    try { res.json({ ok:true, data: await RagService.updatePolicy(req.body) }); } catch(e){next(e);}
  });

  // Vector indexes
  router.get("/indexes", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      res.json({ ok:true, data: await RagService.listIndexes({ status }) });
    } catch(e){next(e);}
  });
  router.post("/indexes", validate({ body: idxCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await RagService.createIndex(req.body) }); } catch(e){next(e);}
  });
  router.post("/indexes/:id/reindex", async (req, res, next) => {
    try {
      const v = await RagService.reindex(req.params.id);
      if (!v) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:v });
    } catch(e){next(e);}
  });

  // Embeddings
  router.get("/embeddings", async (req, res, next) => {
    try {
      const provider = typeof req.query.provider === "string" ? req.query.provider as any : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      res.json({ ok:true, data: await RagService.listEmbeddings({ provider, status }) });
    } catch(e){next(e);}
  });
  router.post("/embeddings", validate({ body: embCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await RagService.registerEmbedding(req.body) }); } catch(e){next(e);}
  });

  // Knowledge sources
  router.get("/knowledge", async (req, res, next) => {
    try {
      const kind = typeof req.query.kind === "string" ? req.query.kind as any : undefined;
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      res.json({ ok:true, data: await RagService.listKnowledge({ kind, status }) });
    } catch(e){next(e);}
  });
  router.get("/knowledge/:id", async (req, res, next) => {
    try {
      const k = await RagService.getKnowledge(req.params.id);
      if (!k) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:k });
    } catch(e){next(e);}
  });
  router.post("/knowledge", validate({ body: ksCreate }), async (req, res, next) => {
    try { res.json({ ok:true, data: await RagService.addSource(req.body) }); } catch(e){next(e);}
  });
  router.post("/knowledge/:id/quarantine", validate({ body: z.object({ reason: z.string().optional() }) }), async (req, res, next) => {
    try {
      const k = await RagService.quarantineSource(req.params.id, req.body.reason);
      if (!k) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:k });
    } catch(e){next(e);}
  });
  router.post("/knowledge/:id/approve", async (req, res, next) => {
    try {
      const k = await RagService.approveSource(req.params.id);
      if (!k) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:k });
    } catch(e){next(e);}
  });
}
