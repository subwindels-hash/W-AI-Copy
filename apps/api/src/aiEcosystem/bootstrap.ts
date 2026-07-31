/**
 * AI Ecosystem bootstrap (Slice 288/289/290) — 9500ms slot
 *
 * Seeds EXAMPLE providers / models / routing policies / personality
 * profiles / voices / avatars / dept bindings / trust scores. The
 * provider set is illustrative; the abstraction layer never hard-codes
 * this list at runtime.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { ProviderAbstractionService } from "./providerAbstraction.service.js";
import { PersonalityStudioService } from "./personalityStudio.service.js";
import { TrustExplainabilityService } from "./trustExplainability.service.js";

export async function bootstrapAiEcosystem(logger?: any): Promise<void> {
  ProviderAbstractionService.init(logger);
  PersonalityStudioService.init(logger);
  TrustExplainabilityService.init(logger);

  const existing = await redis.zrange("ae:providers", 0, -1);
  if (existing.length > 0) {
    logger.info("[aiEcosystem] bootstrap skipped — already seeded", { providers: existing.length });
    return;
  }

  const providerSvc = ProviderAbstractionService;
  const personaSvc = PersonalityStudioService;
  const trustSvc = TrustExplainabilityService;

  // --- Providers (EXAMPLES — not a hard-coded list) ------------------
  const seedProviders = [
    {
      name: "OpenAI",
      vendor: "openai",
      tier: "cloud",
      residency: ["global", "us", "eu"],
      costPer1kInputUsd: 0.005,
      costPer1kOutputUsd: 0.015,
      avgLatencyMs: 420,
      p95LatencyMs: 900,
      supportsStreaming: true,
      supportsFineTuning: true,
      labels: ["general", "chat", "code"],
    },
    {
      name: "Anthropic",
      vendor: "anthropic",
      tier: "cloud",
      residency: ["global", "us", "eu"],
      costPer1kInputUsd: 0.003,
      costPer1kOutputUsd: 0.015,
      avgLatencyMs: 460,
      p95LatencyMs: 1100,
      supportsStreaming: true,
      supportsFineTuning: false,
      labels: ["reasoning", "long-context", "safety"],
    },
    {
      name: "Google AI",
      vendor: "google",
      tier: "cloud",
      residency: ["global", "us", "eu", "apac"],
      costPer1kInputUsd: 0.00125,
      costPer1kOutputUsd: 0.00375,
      avgLatencyMs: 380,
      p95LatencyMs: 800,
      supportsStreaming: true,
      supportsFineTuning: true,
      labels: ["multimodal", "gemini"],
    },
    {
      name: "Mistral AI",
      vendor: "mistral",
      tier: "cloud",
      residency: ["global", "eu"],
      costPer1kInputUsd: 0.002,
      costPer1kOutputUsd: 0.006,
      avgLatencyMs: 340,
      p95LatencyMs: 700,
      supportsStreaming: true,
      supportsFineTuning: true,
      labels: ["open-weights", "eu"],
    },
    {
      name: "Azure OpenAI",
      vendor: "azure",
      tier: "cloud",
      residency: ["global", "eu", "us", "apac"],
      costPer1kInputUsd: 0.005,
      costPer1kOutputUsd: 0.015,
      avgLatencyMs: 500,
      p95LatencyMs: 1000,
      supportsStreaming: true,
      supportsFineTuning: true,
      labels: ["enterprise", "compliance"],
    },
    {
      name: "AWS Bedrock",
      vendor: "bedrock",
      tier: "cloud",
      residency: ["global", "us", "eu", "apac"],
      costPer1kInputUsd: 0.003,
      costPer1kOutputUsd: 0.015,
      avgLatencyMs: 520,
      p95LatencyMs: 1100,
      supportsStreaming: true,
      supportsFineTuning: true,
      labels: ["enterprise", "multi-model"],
    },
    {
      name: "WINDELS Local (Ollama)",
      vendor: "ollama",
      tier: "self-hosted",
      residency: ["on-prem"],
      baseUrl: "http://localhost:11434",
      costPer1kInputUsd: 0.0001,
      costPer1kOutputUsd: 0.0001,
      avgLatencyMs: 280,
      p95LatencyMs: 600,
      supportsStreaming: true,
      supportsFineTuning: false,
      labels: ["on-prem", "privacy"],
    },
    {
      name: "WINDELS Private Model",
      vendor: "windels",
      tier: "private",
      residency: ["on-prem", "eu"],
      costPer1kInputUsd: 0.0002,
      costPer1kOutputUsd: 0.0004,
      avgLatencyMs: 220,
      p95LatencyMs: 480,
      supportsStreaming: true,
      supportsFineTuning: true,
      labels: ["sovereign", "custom"],
    },
  ] as const;

  const providers = [];
  for (const seed of seedProviders as unknown as any[]) {
    const p = await providerSvc.registerProvider({
      name: seed.name,
      vendor: seed.vendor,
      tier: seed.tier,
      residency: seed.residency,
      status: "healthy",
      baseUrl: seed.baseUrl,
      apiKeyConfigured: seed.vendor !== "ollama",
      costPer1kInputUsd: seed.costPer1kInputUsd,
      costPer1kOutputUsd: seed.costPer1kOutputUsd,
      avgLatencyMs: seed.avgLatencyMs,
      p95LatencyMs: seed.p95LatencyMs,
      supportsStreaming: seed.supportsStreaming,
      supportsFineTuning: seed.supportsFineTuning,
      labels: seed.labels,
    });
    providers.push(p);
  }

  // --- Models --------------------------------------------------------
  const modelSeeds = [
    { vendor: "openai", modelId: "gpt-4o", name: "GPT-4o", modalities: ["text", "image"], caps: ["chat", "vision", "function-calling", "reasoning"], ctx: 128000, out: 4096, i: 0.005, o: 0.015, lat: 420 },
    { vendor: "openai", modelId: "gpt-4o-mini", name: "GPT-4o Mini", modalities: ["text", "image"], caps: ["chat", "vision"], ctx: 128000, out: 4096, i: 0.00015, o: 0.0006, lat: 260 },
    { vendor: "anthropic", modelId: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", modalities: ["text", "image"], caps: ["chat", "reasoning", "long-context", "vision"], ctx: 200000, out: 8192, i: 0.003, o: 0.015, lat: 460 },
    { vendor: "anthropic", modelId: "claude-3-haiku", name: "Claude 3 Haiku", modalities: ["text", "image"], caps: ["chat", "vision"], ctx: 200000, out: 4096, i: 0.00025, o: 0.00125, lat: 280 },
    { vendor: "google", modelId: "gemini-1.5-pro", name: "Gemini 1.5 Pro", modalities: ["text", "image", "audio", "video"], caps: ["chat", "multimodal", "long-context", "reasoning"], ctx: 1000000, out: 8192, i: 0.00125, o: 0.00375, lat: 520 },
    { vendor: "google", modelId: "gemini-1.5-flash", name: "Gemini 1.5 Flash", modalities: ["text", "image", "audio", "video"], caps: ["chat", "multimodal"], ctx: 1000000, out: 8192, i: 0.000075, o: 0.0003, lat: 240 },
    { vendor: "mistral", modelId: "mistral-large", name: "Mistral Large", modalities: ["text"], caps: ["chat", "reasoning"], ctx: 128000, out: 4096, i: 0.002, o: 0.006, lat: 340 },
    { vendor: "mistral", modelId: "mistral-small", name: "Mistral Small", modalities: ["text"], caps: ["chat"], ctx: 32000, out: 4096, i: 0.0002, o: 0.0006, lat: 220 },
    { vendor: "azure", modelId: "gpt-4o-azure", name: "Azure GPT-4o", modalities: ["text", "image"], caps: ["chat", "vision", "compliance"], ctx: 128000, out: 4096, i: 0.005, o: 0.015, lat: 500 },
    { vendor: "bedrock", modelId: "claude-3-sonnet-bedrock", name: "Bedrock Claude 3", modalities: ["text", "image"], caps: ["chat", "vision", "reasoning"], ctx: 200000, out: 4096, i: 0.003, o: 0.015, lat: 520 },
    { vendor: "ollama", modelId: "llama3.1", name: "Llama 3.1 70B (local)", modalities: ["text"], caps: ["chat", "code", "reasoning"], ctx: 128000, out: 4096, i: 0.0001, o: 0.0001, lat: 280 },
    { vendor: "ollama", modelId: "mistral-nemo", name: "Mistral Nemo 12B (local)", modalities: ["text"], caps: ["chat", "code"], ctx: 128000, out: 4096, i: 0.0001, o: 0.0001, lat: 180 },
    { vendor: "windels", modelId: "windels-core-v2", name: "WINDELS Core v2 (private)", modalities: ["text", "image"], caps: ["chat", "reasoning", "vision", "code"], ctx: 256000, out: 8192, i: 0.0002, o: 0.0004, lat: 220 },
    { vendor: "windels", modelId: "windels-embed-v1", name: "WINDELS Embeddings v1", modalities: ["embedding"], caps: ["embedding"], ctx: 8192, out: 1536, i: 0.00005, o: 0, lat: 80 },
    { vendor: "openai", modelId: "text-embedding-3-large", name: "Text Embedding 3 Large", modalities: ["embedding"], caps: ["embedding"], ctx: 8192, out: 3072, i: 0.00013, o: 0, lat: 120 },
  ] as const;

  const models = [];
  for (const seed of modelSeeds as unknown as any[]) {
    const provider = providers.find((p) => p.vendor === seed.vendor);
    if (!provider) continue;
    const m = await providerSvc.registerModel({
      providerId: provider.id,
      modelId: seed.modelId,
      displayName: seed.name,
      version: "1.0.0",
      modalities: seed.modalities,
      capabilities: seed.caps,
      contextWindowTokens: seed.ctx,
      maxOutputTokens: seed.out,
      enabled: true,
      costPer1kInputUsd: seed.i,
      costPer1kOutputUsd: seed.o,
      avgLatencyMs: seed.lat,
      benchmarks: [],
    });
    models.push(m);
  }

  // --- Routing policies ---------------------------------------------
  const policies = [
    {
      name: "Balanced (Default)",
      description: "Balanced cost/latency/quality tradeoff",
      strategy: "balanced",
      fallbackProviderIds: [providers.find((p) => p.vendor === "anthropic")!.id, providers.find((p) => p.vendor === "ollama")!.id],
      costWeight: 0.33,
      latencyWeight: 0.33,
      qualityWeight: 0.34,
      enabled: true,
    },
    {
      name: "Lowest Cost",
      description: "Cheapest available model with acceptable quality",
      strategy: "lowest-cost",
      fallbackProviderIds: [providers.find((p) => p.vendor === "ollama")!.id],
      costWeight: 0.8,
      latencyWeight: 0.1,
      qualityWeight: 0.1,
      enabled: true,
    },
    {
      name: "EU Residency Only",
      description: "Restrict to EU-residency providers (GDPR/sovereignty)",
      strategy: "residency",
      requiredResidency: "eu",
      allowedProviderTiers: ["cloud", "self-hosted", "private"],
      fallbackProviderIds: [providers.find((p) => p.vendor === "mistral")!.id, providers.find((p) => p.vendor === "windels")!.id],
      costWeight: 0.2,
      latencyWeight: 0.3,
      qualityWeight: 0.5,
      enabled: true,
    },
    {
      name: "Lowest Latency",
      description: "Fastest available response",
      strategy: "lowest-latency",
      fallbackProviderIds: [providers.find((p) => p.vendor === "windels")!.id, providers.find((p) => p.vendor === "ollama")!.id],
      costWeight: 0.1,
      latencyWeight: 0.8,
      qualityWeight: 0.1,
      enabled: true,
    },
  ] as const;
  for (const p of policies as unknown as any[]) {
    await providerSvc.createPolicy({
      name: p.name,
      description: p.description,
      strategy: p.strategy,
      requiredResidency: p.requiredResidency,
      allowedProviderTiers: p.allowedProviderTiers,
      requiredCapabilities: p.requiredCapabilities,
      fallbackProviderIds: p.fallbackProviderIds,
      enabled: p.enabled,
      costWeight: p.costWeight,
      latencyWeight: p.latencyWeight,
      qualityWeight: p.qualityWeight,
    });
  }

  // --- Personality profiles -----------------------------------------
  const profileSeeds = [
    { name: "WINDELS Default", desc: "Friendly, professional default persona", tone: "warm-professional", f: 0.6, e: 0.7, h: 0.2, v: 0.5, a: 0.6, ba: 95, uc: ["general", "chat"], voice: 0, avatar: 0, overrides: [] as any[] },
    { name: "Executive Assistant", desc: "Concise, authoritative executive support", tone: "executive-crisp", f: 0.85, e: 0.5, h: 0.05, v: 0.3, a: 0.85, ba: 90, uc: ["executive", "briefing"], voice: 2, avatar: 1, overrides: [] as any[] },
    { name: "Customer Support", desc: "Empathetic, patient customer-facing persona", tone: "warm-supportive", f: 0.5, e: 0.9, h: 0.3, v: 0.6, a: 0.4, ba: 96, uc: ["support"], voice: 0, avatar: 0, overrides: [{ region: "jp", formality: 0.9, empathy: 0.9, humor: 0.05, verbosity: 0.4, assertiveness: 0.3, greeting: "いつもお世話になっております。" }] as any[] },
    { name: "Engineering", desc: "Precise technical persona", tone: "technical-precise", f: 0.5, e: 0.4, h: 0.2, v: 0.7, a: 0.7, ba: 92, uc: ["engineering", "code"], voice: 3, avatar: 2, overrides: [{ region: "de", formality: 0.75, empathy: 0.35, humor: 0.1, verbosity: 0.8, assertiveness: 0.8 }] as any[] },
    { name: "Sales", desc: "Enthusiastic, persuasive sales persona", tone: "energetic-persuasive", f: 0.45, e: 0.75, h: 0.4, v: 0.6, a: 0.8, ba: 88, uc: ["sales", "outbound"], voice: 1, avatar: 1, overrides: [] as any[] },
    { name: "Legal", desc: "Cautious, precise legal review persona", tone: "formal-precise", f: 0.95, e: 0.35, h: 0.0, v: 0.8, a: 0.75, ba: 94, uc: ["legal", "review"], voice: 2, avatar: 2, overrides: [] as any[] },
  ] as const;
  const profiles = [];
  for (const seed of profileSeeds as unknown as any[]) {
    const p = await personaSvc.createProfile({
      name: seed.name,
      description: seed.desc,
      tone: seed.tone,
      formality: seed.f,
      empathy: seed.e,
      humor: seed.h,
      verbosity: seed.v,
      assertiveness: seed.a,
      brandAlignment: seed.ba,
      useCases: seed.uc,
      regionalOverrides: seed.overrides,
    });
    profiles.push(p);
  }

  // --- Voices -------------------------------------------------------
  const voiceSeeds = [
    { name: "WINDELS Aria", gender: "feminine", lang: "en", accent: "General American", pace: 150, pitch: 2, warmth: 0.7, clarity: 0.9 },
    { name: "WINDELS Rio", gender: "masculine", lang: "en", accent: "Neutral", pace: 155, pitch: -1, warmth: 0.65, clarity: 0.92 },
    { name: "WINDELS Atlas", gender: "masculine", lang: "en", accent: "British RP", pace: 145, pitch: -2, warmth: 0.45, clarity: 0.95 },
    { name: "WINDELS Nova", gender: "feminine", lang: "en", accent: "Neutral", pace: 160, pitch: 3, warmth: 0.55, clarity: 0.88 },
  ] as const;
  const voices = [];
  for (const seed of voiceSeeds as unknown as any[]) {
    const v = await personaSvc.createVoicePersona({
      name: seed.name,
      gender: seed.gender,
      language: seed.lang,
      accent: seed.accent,
      paceWpm: seed.pace,
      pitch: seed.pitch,
      warmth: seed.warmth,
      clarity: seed.clarity,
      sampleText: "Hello. I'm " + seed.name + ", a WINDELS AI voice persona.",
    });
    voices.push(v);
  }

  // --- Avatars ------------------------------------------------------
  const avatarSeeds = [
    { name: "WINDELS Core", style: "abstract", color: "#3B82F6" },
    { name: "Executive", style: "3d", color: "#8B5CF6" },
    { name: "Engineering", style: "illustrated", color: "#14B8A6" },
  ] as const;
  const avatars = [];
  for (const seed of avatarSeeds as unknown as any[]) {
    const a = await personaSvc.createAvatar({
      name: seed.name,
      style: seed.style,
      accentColor: seed.color,
    });
    avatars.push(a);
  }

  // --- Department bindings ------------------------------------------
  const deptSeeds = [
    { dept: "executive", pi: 1, vi: 2, ai: 1, wfs: ["Executive Assistant Workforce"] },
    { dept: "support", pi: 2, vi: 0, ai: 0, wfs: ["Customer Support Workforce"] },
    { dept: "engineering", pi: 3, vi: 3, ai: 2, wfs: ["Engineering Workforce", "DevOps Workforce"] },
    { dept: "sales", pi: 4, vi: 1, ai: 1, wfs: ["Sales Workforce"] },
    { dept: "legal", pi: 5, vi: 2, ai: 2, wfs: ["Legal Workforce"] },
  ] as const;
  for (const seed of deptSeeds as unknown as any[]) {
    await personaSvc.setDepartment({
      department: seed.dept,
      profileId: profiles[seed.pi].id,
      voicePersonaId: voices[seed.vi].id,
      avatarId: avatars[seed.ai].id,
      inheritedByWorkforces: seed.wfs,
      enabled: true,
    });
  }

  // --- Trust scores (sample) ----------------------------------------
  const baseEv = [
    { source: "WINDELS KB", sourceType: "knowledge-base" as const, sourceQuality: "high" as const, dataFreshness: "fresh" as const, excerpt: "Pricing table 2026-Q3", supportsClaim: true },
    { source: "ERP API", sourceType: "api" as const, sourceQuality: "high" as const, dataFreshness: "fresh" as const, supportsClaim: true },
  ];
  const baseReport = {
    reasoningSummary: "Aggregated from real-time ERP and KB sources",
    keySteps: ["Fetch pricing", "Compute discount", "Apply tax"],
    dataSourcesUsed: ["ERP", "KB"],
    assumptions: ["Default discount tier applies"],
    limitations: ["Excludes promotional bundles"],
    uncertaintySources: [],
    modelVersion: "windels-core-v2",
  };
  await trustSvc.scoreResponse({
    responseId: "resp-" + randomUUID(),
    overallConfidence: 0.94,
    evidence: baseEv,
    report: baseReport,
    alternatives: [
      { perspective: "Promotional pricing might apply", summary: "If the customer qualifies for Q3 promo, price could be 12% lower", confidence: 0.4, supportingSources: ["Marketing Promo Sheet"] },
    ],
    compliance: [{ policyId: "pol-pricing", policyName: "Pricing Accuracy v2", passed: true, violations: [], riskLevel: "none" as const }],
  });
  await trustSvc.scoreResponse({
    responseId: "resp-" + randomUUID(),
    overallConfidence: 0.82,
    evidence: [
      { source: "CRM", sourceType: "api" as const, sourceQuality: "medium" as const, dataFreshness: "recent" as const, supportsClaim: true },
      { source: "Sales rep notes", sourceType: "document" as const, sourceQuality: "low" as const, dataFreshness: "stale" as const, supportsClaim: false },
    ],
    report: { ...baseReport, reasoningSummary: "Mixed-quality evidence; recommend disclaimer" },
    uncertainty: [{ type: "conflicting-sources", severity: "medium", description: "CRM vs rep notes conflict" }],
    compliance: [{ policyId: "pol-sales", policyName: "Sales Claims", passed: true, violations: [], riskLevel: "low" as const }],
  });
  await trustSvc.scoreResponse({
    responseId: "resp-hr-queue",
    overallConfidence: 0.55,
    evidence: [
      { source: "HR Policy Draft", sourceType: "document" as const, sourceQuality: "medium" as const, dataFreshness: "stale" as const, supportsClaim: true },
    ],
    report: { ...baseReport, reasoningSummary: "Low confidence HR policy response — requires review" },
    uncertainty: [
      { type: "low-evidence", severity: "high", description: "Single stale source" },
      { type: "ambiguous-input", severity: "medium", description: "Policy clause ambiguous" },
    ],
    compliance: [{ policyId: "pol-hr", policyName: "HR Policy Guardrails", passed: true, violations: [], riskLevel: "medium" as const }],
  });
  await trustSvc.scoreResponse({
    responseId: "resp-" + randomUUID(),
    overallConfidence: 0.78,
    evidence: [
      { source: "Legal DB", sourceType: "knowledge-base" as const, sourceQuality: "high" as const, dataFreshness: "recent" as const, supportsClaim: true },
      { source: "Case Law API", sourceType: "api" as const, sourceQuality: "high" as const, dataFreshness: "fresh" as const, supportsClaim: true },
    ],
    report: { ...baseReport, reasoningSummary: "Pre-approved legal reference response" },
    compliance: [{ policyId: "pol-legal", policyName: "Legal Citations", passed: true, violations: [], riskLevel: "low" as const }],
  });
  await trustSvc.scoreResponse({
    responseId: "resp-" + randomUUID(),
    overallConfidence: 0.88,
    evidence: [
      { source: "Engineering KB", sourceType: "knowledge-base" as const, sourceQuality: "high" as const, dataFreshness: "fresh" as const, supportsClaim: true },
      { source: "Internal wiki", sourceType: "document" as const, sourceQuality: "medium" as const, dataFreshness: "recent" as const, supportsClaim: true },
    ],
    report: { ...baseReport, reasoningSummary: "Engineering reference response" },
    compliance: [{ policyId: "pol-eng", policyName: "Engineering Accuracy", passed: true, violations: [], riskLevel: "low" as const }],
  });

  // Seed synthetic 24h traffic (scaled down via loadFactor for realistic dashboards)
  const loadFactor = 0.005; // keep cost realistic ~$15k/24h
  const baseReqs = 800_000;
  const baseToks = 1_200_000_000;
  await redis.set("ae:metrics:req24h", String(Math.floor(baseReqs * loadFactor)));
  await redis.set("ae:metrics:tokens24h", String(Math.floor(baseToks * loadFactor)));
  await redis.set("ae:metrics:fallback24h", "10");
  await redis.set("ae:metrics:errors24h", "8");
  for (let i = 0; i < 50; i++) {
    await redis.lpush("ae:metrics:latencies", String(420));
  }

  logger.info("[aiEcosystem] bootstrap complete", {
    providers: providers.length,
    models: models.length,
    policies: policies.length,
    profiles: profiles.length,
    voices: voices.length,
    avatars: avatars.length,
  });
}
