/**
 * Session 30 bootstrap — seed AI Infrastructure (MLOps, Models, Prompts, RAG).
 * Slices 258–270: MLOps platform, Model Registry/Lifecycle/Deploy/Monitoring/Governance,
 * Prompt Registry/Versioning/Testing, RAG + Vector/Embedding/Knowledge.
 */
import { logger } from "../observability/logger.js";
import { redisCmd as redis } from "../db/redis.js";
import { ModelsService } from "./models.service.js";
import { PromptsService } from "./prompts.service.js";
import { RagService } from "./rag.service.js";

function iso() { return new Date().toISOString(); }

export async function bootstrapMlOps() {
  const existing = await ModelsService.list();
  if (existing.length > 0) {
    const prompts = await PromptsService.list();
    const idx = await RagService.listIndexes();
    const embs = await RagService.listEmbeddings();
    const ks = await RagService.listKnowledge();
    logger.info("ml ops already seeded", {
      models: existing.length, prompts: prompts.length, indexes: idx.length,
      embeddings: embs.length, knowledge: ks.length,
    });
    return;
  }

  // ── Models (259–263) ────────────────────────────────────────
  const modelSeeds = [
    { slug:"windels-routing-llm", name:"WINDELS Routing LLM", desc:"Smart model router that picks the right LLM per request.", kind:"llm", prov:"windels-self-hosted", fw:"transformers", ctx:32768, params:8, mods:["text"], col:"azure", lic:"enterprise", cert:"official" as const, lat:180, cost:0 },
    { slug:"claude-3.5-sonnet", name:"Claude 3.5 Sonnet", desc:"Flagship Anthropic model for reasoning & code.", kind:"llm", prov:"anthropic", fw:"custom", ctx:200_000, params:180, mods:["text","image"], col:"violet", lic:"proprietary", cert:"official" as const, lat:420, cost:3.0 },
    { slug:"gpt-4o", name:"GPT-4o", desc:"OpenAI multimodal model.", kind:"llm", prov:"openai", fw:"custom", ctx:128_000, params:1200, mods:["text","image","audio"], col:"teal", lic:"proprietary", cert:"official" as const, lat:380, cost:2.5 },
    { slug:"gemini-1.5-pro", name:"Gemini 1.5 Pro", desc:"Google long-context multimodal.", kind:"llm", prov:"google", fw:"custom", ctx:1_000_000, params:120, mods:["text","image","audio","video"], col:"fuchsia", lic:"proprietary", cert:"official" as const, lat:520, cost:1.25 },
    { slug:"mistral-large-2", name:"Mistral Large 2", desc:"Mistral flagship European LLM.", kind:"llm", prov:"mistral", fw:"custom", ctx:128_000, params:123, mods:["text","code"], col:"amber", lic:"proprietary", cert:"partner" as const, lat:280, cost:2.0 },
    { slug:"text-embedding-3-large", name:"OpenAI Ada-3 Large", desc:"OpenAI's high-dim embedding.", kind:"embedding", prov:"openai", fw:"custom", ctx:8191, params:0, mods:["text"], col:"emerald", lic:"proprietary", cert:"official" as const, lat:70, cost:0.13 },
    { slug:"cohere-embed-v3", name:"Cohere Embed v3", desc:"Strong MTEB embedding.", kind:"embedding", prov:"cohere", fw:"custom", ctx:512, params:0, mods:["text"], col:"teal", lic:"proprietary", cert:"partner" as const, lat:90, cost:0.1 },
    { slug:"cohere-rerank-v3", name:"Cohere Rerank v3", desc:"Cross-encoder reranker.", kind:"reranker", prov:"cohere", fw:"custom", ctx:4096, params:0, mods:["text"], col:"slate", lic:"proprietary", cert:"partner" as const, lat:120, cost:0.5 },
    { slug:"whisper-large-v3", name:"Whisper Large v3", desc:"OpenAI speech-to-text.", kind:"audio", prov:"openai", fw:"pytorch", ctx:30_000, params:1.5, mods:["audio"], col:"crimson", lic:"mit", cert:"official" as const, lat:800, cost:0.6 },
    { slug:"flux-schnell", name:"FLUX.1 Schnell", desc:"Fast text-to-image.", kind:"vision", prov:"huggingface", fw:"gguf", ctx:0, params:12, mods:["image"], col:"fuchsia", lic:"apache-2.0", cert:"community" as const, lat:1500, cost:0.4 },
    { slug:"windels-code-7b", name:"WINDELS Code 7B", desc:"Self-hosted code assistant.", kind:"llm", prov:"windels-self-hosted", fw:"gguf", ctx:32768, params:7, mods:["code","text"], col:"azure", lic:"enterprise", cert:"official" as const, lat:60, cost:0 },
    { slug:"llama-3.1-70b", name:"Llama 3.1 70B", desc:"Meta open-weight LLM.", kind:"llm", prov:"meta", fw:"vllm", ctx:128_000, params:70, mods:["text","code"], col:"emerald", lic:"open-source", cert:"partner" as const, lat:240, cost:0.9 },
  ];
  const createdModels: Record<string, any> = {};
  for (const m of modelSeeds) {
    const mm = await ModelsService.register({
      slug:m.slug, name:m.name, description:m.desc, kind:m.kind as any, provider:m.prov as any, framework:m.fw as any,
      owner:"ml-platform", tags:["bootstrap",m.kind], license:m.lic as any, contextWindow:m.ctx, parametersB:m.params,
      modalities:m.mods as any, color:m.col as any, certified:m.cert, sliceNumber: 259,
    });
    // add version (in draft) & metrics
    await ModelsService.addVersion(mm.id, "1.0.0", [
      { name:"mmlu", value: 70 + Math.floor(Math.random()*20), pass:true, unit:"%" },
      { name:"humaneval", value: 50 + Math.floor(Math.random()*40), pass:true, unit:"%" },
      { name:"latency_p95", value: m.lat, threshold: m.lat*1.5, unit:"ms", pass:true },
    ], undefined, undefined, "draft");
    // advance flagship models through staging -> approval; production promotion happens via deploy()
    if (["claude-3.5-sonnet","gpt-4o","text-embedding-3-large","windels-routing-llm","whisper-large-v3"].includes(m.slug)) {
      let cur = (await ModelsService.get(mm.id))!;
      let v = cur.versions[0];
      for (const stage of ["registering","staging","approval"] as const) {
        cur = (await ModelsService.promote(cur.id, v.id, stage, "bootstrap"))!;
        v = cur.versions.find(x=>x.id===v.id)!;
      }
    }
    createdModels[m.slug] = (await ModelsService.get(mm.id))!;
  }

  // ── Deployments (261) ───────────────────────────────────────
  const deployments = [
    { model:"claude-3.5-sonnet", name:"claude-prod", env:"prod", replicas:6, cpu:"8", mem:"32Gi", gpu:"H100", region:"na-east", traffic:100 },
    { model:"gpt-4o", name:"gpt4o-prod", env:"prod", replicas:4, cpu:"4", mem:"16Gi", region:"na-east", traffic:100 },
    { model:"text-embedding-3-large", name:"embed-prod", env:"prod", replicas:3, cpu:"4", mem:"8Gi", region:"na-east", traffic:100 },
    { model:"windels-routing-llm", name:"router-prod", env:"prod", replicas:4, cpu:"4", mem:"16Gi", region:"na-east", traffic:100 },
    { model:"claude-3.5-sonnet", name:"claude-canary", env:"canary", replicas:1, cpu:"4", mem:"16Gi", gpu:"A10", region:"na-east", traffic:5, strategy:"canary" },
    { model:"gpt-4o", name:"gpt4o-staging", env:"staging", replicas:2, cpu:"4", mem:"16Gi", region:"na-east", traffic:100, strategy:"blue-green" },
    { model:"whisper-large-v3", name:"whisper-prod", env:"prod", replicas:2, cpu:"8", mem:"16Gi", gpu:"T4", region:"na-east", traffic:100 },
    { model:"mistral-large-2", name:"mistral-eu", env:"prod", replicas:2, cpu:"4", mem:"16Gi", region:"eu-west", traffic:100 },
    { model:"windels-code-7b", name:"code-edge", env:"edge", replicas:4, cpu:"4", mem:"8Gi", region:"na-edge", traffic:100 },
  ];
  for (const d of deployments) {
    const model = createdModels[d.model];
    if (!model) continue;
    const prodVersion = model.versions.find((v:any)=>v.stage==="production") || model.versions[0];
    await ModelsService.deploy({
      modelId: model.id, modelVersionId: prodVersion.id, name: d.name, environment: d.env as any,
      strategy: (d as any).strategy ?? "rolling", region: d.region, replicas: d.replicas,
      cpu: d.cpu, memory: d.mem, gpu: d.gpu, trafficPct: d.traffic, deployedBy:"bootstrap",
    });
  }

  // ── Monitors (262) ──────────────────────────────────────────
  const monitorSeeds: Array<[string,string,number,string,string]> = [
    ["claude-p95","latency",800,"p95_ms","warn"],
    ["claude-err","error",2.0,"error_rate_pct","critical"],
    ["gpt4o-p95","latency",800,"p95_ms","warn"],
    ["embed-err","error",1.0,"error_rate_pct","warn"],
    ["router-drift","drift",0.15,"kl_div","critical"],
    ["safety-pii","safety",0.01,"pii_leak_rate","critical"],
    ["cost-budget","cost",200,"usd_per_hour","warn"],
    ["whisper-err","error",3.0,"error_rate_pct","warn"],
  ];
  for (const [name,type,thr,metric,sev] of monitorSeeds) {
    const modelKey = name.startsWith("claude")?"claude-3.5-sonnet":name.startsWith("gpt")?"gpt-4o":name.startsWith("embed")?"text-embedding-3-large":name.startsWith("router")?"windels-routing-llm":name.startsWith("safety")||name.startsWith("cost")?"claude-3.5-sonnet":"whisper-large-v3";
    const model = createdModels[modelKey];
    await ModelsService.createMonitor({
      name, type: type as any, threshold: thr, metric, severity: sev as any,
      enabled: true, window: "5m", modelId: model.id,
    });
  }

  // ── Model governance policies (263) ─────────────────────────
  for (const p of [
    { key:"promotion-approval", name:"Promotion approval gate", desc:"prod promotions require human approval.", type:"approval-required", enforced:true, applies:["staging","approval","production"] as any, owner:"ml-governance" },
    { key:"red-team-before-prod", name:"Red-team before prod", desc:"Models must pass red-team eval before production.", type:"red-team", enforced:true, threshold:90, applies:["staging","production"] as any, owner:"ml-safety" },
    { key:"pii-scan-outputs", name:"PII output scan", desc:"Scan outputs for PII leakage <0.01%.", type:"pii-scan", enforced:true, threshold:0.01, applies:["production"] as any, owner:"privacy" },
    { key:"llm-cost-quota", name:"Daily LLM cost quota", desc:"Halt routing when $50k/day exceeded.", type:"cost-quota", enforced:false, threshold:50000, applies:["production"] as any, owner:"finops" },
    { key:"latency-slo-prod", name:"Prod latency SLO", desc:"Page when p95 latency exceeds 800ms for 5m.", type:"latency-slo", enforced:true, threshold:800, applies:["production"] as any, owner:"sre" },
    { key:"region-lock-eu", name:"EU region lock", desc:"EU tenants must serve from EU.", type:"region-lock", enforced:true, applies:["production"] as any, owner:"compliance" },
    { key:"model-allowlist", name:"Model allowlist", desc:"Only approved models may serve prod.", type:"model-allowlist", enforced:true, applies:["production"] as any, owner:"platform" },
    { key:"prompt-injection-scan", name:"Prompt injection scan", desc:"Block prompt-injection inputs.", type:"prompt-injection-scan", enforced:true, threshold:0.9, applies:["production"] as any, owner:"security" },
  ]) {
    await ModelsService.createPolicy({
      key:p.key, name:p.name, description:p.desc, type:p.type as any, enforced:p.enforced,
      threshold:p.threshold, appliesToStages:p.applies, owner:p.owner,
    });
  }

  // ── Prompts (264-266) ───────────────────────────────────────
  const promptSeeds = [
    { slug:"exec-briefing-system", name:"Executive Briefing System", desc:"System prompt for morning exec briefings.", kind:"system", tags:["exec","briefing"], col:"violet" },
    { slug:"sdr-outreach", name:"SDR Outreach", desc:"Outbound SDR personalization.", kind:"user", tags:["sales"], col:"azure" },
    { slug:"ticket-resolve", name:"Support Ticket Resolver", desc:"Tier-1 support resolution.", kind:"system", tags:["support"], col:"teal" },
    { slug:"contract-review", name:"Contract Review", desc:"Identify risky clauses.", kind:"user", tags:["legal"], col:"fuchsia" },
    { slug:"code-review", name:"Code Reviewer", desc:"Senior PR reviewer.", kind:"system", tags:["eng"], col:"crimson" },
    { slug:"fpna-variance", name:"FP&A Variance", desc:"Variance analysis narrative.", kind:"user", tags:["finance"], col:"emerald" },
    { slug:"rag-context", name:"RAG Context Assembly", desc:"Assemble context passages into a coherent block.", kind:"rag-context", tags:["rag"], col:"amber" },
    { slug:"tool-planner", name:"Tool Calling Planner", desc:"Plan tool calls for agents.", kind:"tool", tags:["agents"], col:"azure" },
    { slug:"eval-rubric", name:"Eval LLM Judge Rubric", desc:"Generic LLM-judge rubric prompt.", kind:"eval", tags:["eval"], col:"slate" },
    { slug:"meeting-summary", name:"Meeting Summary", desc:"Extract summary, decisions, action items.", kind:"user", tags:["meetings"], col:"teal" },
  ];
  for (const pp of promptSeeds) {
    const p = await PromptsService.register({
      slug:pp.slug, name:pp.name, description:pp.desc, kind:pp.kind as any, owner:"platform",
      tags:pp.tags, color:pp.col as any,
    });
    await PromptsService.addVersion(p.id, {
      version: "1.0.0",
      template: `You are a helpful assistant for ${pp.name}. Follow the WINDELS style: concise, cited, factual.`,
      variables: [{ name:"context", type:"string", required:false, description:"background context", default:"" }],
      temperature: 0.3, maxTokens: 1024, model: "claude-3.5-sonnet",
      author: "bootstrap", changelog: "initial version",
    });
    // add a couple test cases
    await PromptsService.addTestCase(p.id, {
      input: { context: "Sample context", query: "Summarize Q3 performance." },
      expectedContains: ["summary"], rubric: "contains", tags: ["smoke"],
    });
    await PromptsService.addTestCase(p.id, {
      input: { context: "empty", query: "Say hello." },
      expected: "Hello! How can I help?", rubric: "contains", tags: ["smoke"],
    });
    await PromptsService.runTests(p.id);
  }

  // ── RAG governance default policy (267) ─────────────────────
  await RagService.updatePolicy({ enforced: true, mode:"hybrid" });

  // ── Embedding models (269) ──────────────────────────────────
  const embSeeds = [
    { slug:"openai-ada3", name:"OpenAI text-embedding-3-large", prov:"openai", dims:3072, ctx:8191, lat:35, cost:0.13, norm:true, multi:true, bench:{mteb:67.8, beir:59.3}, col:"azure" },
    { slug:"cohere-embed-m3", name:"Cohere Embed Multilingual v3", prov:"cohere", dims:1024, ctx:512, lat:60, cost:0.1, norm:true, multi:true, bench:{mteb:66.5, beir:57.9}, col:"teal" },
    { slug:"bge-m3", name:"BGE-M3", prov:"huggingface", dims:1024, ctx:8192, lat:90, cost:0.05, norm:true, multi:true, bench:{mteb:65.2, beir:56.8}, col:"violet" },
    { slug:"voyage-large-2", name:"Voyage Large 2", prov:"voyage", dims:1536, ctx:16000, lat:110, cost:0.09, norm:true, multi:false, bench:{mteb:68.1, beir:60.0}, col:"emerald" },
    { slug:"windels-embed-small", name:"WINDELS Embed Small (self-hosted)", prov:"windels", dims:384, ctx:2048, lat:12, cost:0.00, norm:true, multi:true, bench:{mteb:60.0, beir:52.1}, col:"fuchsia" },
    { slug:"mistral-embed", name:"Mistral Embed", prov:"mistral", dims:1024, ctx:8192, lat:70, cost:0.1, norm:true, multi:true, bench:{mteb:64.9, beir:56.0}, col:"amber" },
  ];
  for (const e of embSeeds) {
    await RagService.registerEmbedding({
      slug:e.slug, name:e.name, provider:e.prov as any, dimensions:e.dims, contextWindow:e.ctx,
      avgLatencyMs:e.lat, costPer1kTokens:e.cost, normalized:e.norm, multilingual:e.multi,
      status:"active", benchmarks:e.bench, color:e.col as any,
    });
  }

  // ── Vector indexes (268) ────────────────────────────────────
  const embsAll = await RagService.listEmbeddings();
  const defaultEmb = embsAll.find(e=>e.slug==="openai-ada3") ?? embsAll[0];
  const indexSeeds = [
    { name:"kb-general", dims: defaultEmb.dimensions, region:"na-east", shards:3 },
    { name:"kb-docs", dims: defaultEmb.dimensions, region:"na-east", shards:2 },
    { name:"kb-conversations", dims: defaultEmb.dimensions, region:"na-east", shards:4 },
    { name:"kb-contracts", dims: defaultEmb.dimensions, region:"na-east", shards:1 },
    { name:"kb-eu-general", dims: defaultEmb.dimensions, region:"eu-west", shards:2 },
    { name:"kb-code", dims: defaultEmb.dimensions, region:"na-east", shards:3 },
    { name:"kb-products", dims: defaultEmb.dimensions, region:"na-east", shards:1 },
  ];
  for (const idx of indexSeeds) {
    const created = await RagService.createIndex({
      name:idx.name, dimensions:idx.dims, embeddingModelId:defaultEmb.id,
      namespace:"default", shards:idx.shards, replicas:1, region:idx.region,
    });
    // backfill document counts
    created.documents = Math.floor(100+Math.random()*10000);
    created.vectors = created.documents * 8;
    created.sizeMb = Math.floor(created.vectors * 0.004);
    created.lastIndexedAt = iso();
    await redis.set(`mlops:vec:${created.id}`, JSON.stringify(created));
  }

  // ── Knowledge sources (270) ─────────────────────────────────
  const ksSeeds: Array<[string,string,string,string]> = [
    ["Product Docs", "document", "s3://windels-docs/production", "Official product documentation."],
    ["Confluence Wiki", "wiki", "https://wiki.windels.ai", "Internal engineering wiki."],
    ["Public Web Research", "web", "https://research.windels.ai", "Curated public web corpus."],
    ["Support Tickets", "db", "postgres://support/tickets", "Historical support tickets."],
    ["Contracts Repository", "document", "s3://windels-legal/contracts", "Executed NDA/MSA/contracts."],
    ["CRM Customers", "db", "postgres://crm/customers", "Customer records for agents."],
    ["Conversation History", "conversation", "postgres://talk/messages", "Anonymized chat history."],
    ["Workflow Specs", "api", "https://workflows.windels.ai/specs", "Published workflow definitions."],
  ];
  for (const [name, kind, uri, desc] of ksSeeds) {
    await RagService.addSource({
      name, kind: kind as any, uri, description: desc,
      embeddingModelId: defaultEmb.id,
      owner:"platform", permissions:["read:org"], freshnessHours: 24,
    });
  }

  // ── Summaries ───────────────────────────────────────────────
  const [models, prompts, idxFinal, embsFinal, ksFinal] = await Promise.all([
    ModelsService.list(), PromptsService.list(), RagService.listIndexes(),
    RagService.listEmbeddings(), RagService.listKnowledge(),
  ]);
  logger.info("ml ops bootstrapped", {
    models: models.length, deployments: (await ModelsService.listDeployments()).length,
    monitors: (await ModelsService.listMonitors()).length,
    policies: (await ModelsService.listPolicies()).length,
    prompts: prompts.length, promptVersions: prompts.reduce((a,p)=>a+p.versions.length,0),
    ragIndexes: idxFinal.length, vectors: idxFinal.reduce((a,v)=>a+v.vectors,0),
    embeddings: embsFinal.length, knowledge: ksFinal.length,
  });
}
