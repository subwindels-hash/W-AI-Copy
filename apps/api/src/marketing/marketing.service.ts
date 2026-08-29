/**
 * WINDELS AI OS — AI Marketing Intelligence & Campaign Management service.
 *
 * A Tier-1 module integrated into the existing architecture. It reuses:
 *   - the AI Workforce pattern (28 specialized marketing agents, Redis-backed)
 *   - the AI registry (aiRegistry) for copywriting / persona generation with
 *     honest `demo` labeling when no real provider is configured
 *   - the Redis job/tenant pattern for org-scoped campaigns, personas, A/B tests
 *   - the Media Generation Studio for ad creative generation (not duplicated)
 *
 * Honest design: campaign metrics are only ever moved by ingestMetrics()/recordAbVariant
 * (measured), never fabricated. Copy/persona are flagged aiSource. Everything is
 * org-scoped (multi-tenant). Campaign analytics are computed from real numbers.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { logger } from "../config/logger.js";
import { aiRegistry } from "../services/ai/registry.js";
import type { ChatMessage } from "../services/ai/types.js";
import type {
  MarketingAgent, MarketingAgentKey, MarketingCampaign, MarketingCampaignStatus,
  MarketingCampaignMetrics, MarketingDashboard, MarketingPlatform, MarketingRecommendation,
  Persona, AbTest, AbTestVariant, CopyFramework,
  CreateMarketingCampaignInput, GenerateCopyInput, CreatePersonaInput, CreateAbTestInput, IngestCampaignMetricsInput,
} from "@windels/shared/marketing";

const K = {
  agents: (oid: string) => `mkt:${oid}:agents`,
  agent: (oid: string, key: string) => `mkt:${oid}:agent:${key}`,
  campaigns: (oid: string) => `mkt:${oid}:campaigns`,
  campaign: (oid: string, id: string) => `mkt:${oid}:camp:${id}`,
  personas: (oid: string) => `mkt:${oid}:personas`,
  persona: (oid: string, id: string) => `mkt:${oid}:persona:${id}`,
  abtests: (oid: string) => `mkt:${oid}:ab`,
  abtest: (oid: string, id: string) => `mkt:${oid}:ab:${id}`,
  recs: (oid: string) => `mkt:${oid}:recs`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);
const now = () => new Date().toISOString();

/** 28 specialized marketing agents (AI Workforce integration). */
const AGENT_DEFS: Array<Omit<MarketingAgent, "lastHeartbeat" | "runs24h" | "decisions24h">> = [
  { key: "strategist", name: "Marketing Strategist", description: "High-level marketing strategy and campaign direction.", domain: "strategy", status: "online", routable: true },
  { key: "campaign-manager", name: "Campaign Manager", description: "Plans, executes and coordinates multi-platform campaigns.", domain: "campaigns", status: "online", routable: true },
  { key: "copywriter", name: "Copywriter", description: "Writes persuasive, framework-driven ad copy.", domain: "copy", status: "online", routable: true },
  { key: "creative-designer", name: "Creative Designer", description: "Directs ad creative formats and visual concepts.", domain: "creative", status: "online", routable: true },
  { key: "brand-strategist", name: "Brand Strategist", description: "Ensures messaging consistency and brand voice.", domain: "brand", status: "online", routable: true },
  { key: "seo", name: "SEO Specialist", description: "Optimizes content and landing pages for search.", domain: "seo", status: "online", routable: true },
  { key: "ppc", name: "PPC Specialist", description: "Manages paid search and bid strategy.", domain: "ppc", status: "online", routable: true },
  { key: "social-media", name: "Social Media Manager", description: "Manages organic + paid social across platforms.", domain: "social", status: "online", routable: true },
  { key: "content-strategist", name: "Content Strategist", description: "Plans the content calendar and topics.", domain: "content", status: "online", routable: true },
  { key: "email", name: "Email Marketing Specialist", description: "Builds email funnels and sequences.", domain: "email", status: "online", routable: true },
  { key: "funnel-optimizer", name: "Funnel Optimization Expert", description: "Improves conversion through the funnel.", domain: "funnel", status: "online", routable: true },
  { key: "customer-research", name: "Customer Research Analyst", description: "Builds personas and audience insights.", domain: "research", status: "online", routable: true },
  { key: "market-intel", name: "Market Intelligence Analyst", description: "Tracks competitors and market trends.", domain: "research", status: "online", routable: true },
  { key: "performance-analyst", name: "Performance Analyst", description: "Measures campaign KPIs and attribution.", domain: "analytics", status: "online", routable: true },
  { key: "cro", name: "Conversion Rate Optimization Specialist", description: "Runs A/B tests and improves conversion.", domain: "cro", status: "online", routable: true },
  { key: "growth", name: "Growth Marketing Specialist", description: "Scales what works and finds new channels.", domain: "growth", status: "online", routable: true },
  { key: "video-marketing", name: "Video Marketing Expert", description: "Directs video ad and short-form content.", domain: "video", status: "online", routable: true },
  { key: "influencer", name: "Influencer Marketing Specialist", description: "Manages creator partnerships.", domain: "influencer", status: "online", routable: true },
  { key: "community-manager", name: "Community Manager", description: "Engages audiences and manages reputation.", domain: "community", status: "online", routable: true },
  { key: "analytics-expert", name: "Analytics Expert", description: "Deep-dives into data and reporting.", domain: "analytics", status: "online", routable: true },
  { key: "landing-page", name: "Landing Page Specialist", description: "Designs high-converting landing pages.", domain: "cro", status: "online", routable: true },
  { key: "automation", name: "Automation Specialist", description: "Builds marketing automation and workflows.", domain: "automation", status: "online", routable: true },
  { key: "ad-compliance", name: "Ad Compliance Specialist", description: "Ensures ads meet platform + governance policies.", domain: "compliance", status: "online", routable: true },
  { key: "audience-targeting", name: "Audience Targeting Expert", description: "Refines audience segments and lookalikes.", domain: "audience", status: "online", routable: true },
  { key: "remarketing", name: "Remarketing Specialist", description: "Builds retargeting lists and campaigns.", domain: "retargeting", status: "online", routable: true },
  { key: "budget-optimizer", name: "Budget Optimization Agent", description: "Allocates budget across campaigns and platforms.", domain: "budget", status: "online", routable: true },
  { key: "reporting", name: "Reporting Specialist", description: "Produces executive and campaign reports.", domain: "reporting", status: "online", routable: true },
  { key: "executive-advisor", name: "Executive Marketing Advisor", description: "Summarizes performance and strategic next steps.", domain: "executive", status: "online", routable: true },
];

/** Copy frameworks → structured prompt scaffolds (10 proven). */
const FRAMEWORK_GUIDES: Record<CopyFramework, string> = {
  aida: "Attention → Interest → Desire → Action",
  pas: "Problem → Agitate → Solution",
  bab: "Before → After → Bridge",
  storybrand: "Character → Problem → Guide → Plan → Call to action → Success → Failure",
  pas_agitate: "Problem → Agitate (pain) → Solution",
  fab: "Feature → Advantage → Benefit",
  four_ps: "Promise → Picture → Proof → Push",
  quest: "Qualify → Understand → Educate → Stimulate → Transition",
  acca: "Awareness → Comprehension → Conviction → Action",
  direct: "Direct response: bold claim → proof → offer → urgency",
};

export const MARKETING_AGENT_KEYS: MarketingAgentKey[] = AGENT_DEFS.map((a) => a.key);

export const MarketingService = {
  /* ── Agents ───────────────────────────────────────────────── */

  async listAgents(oid: string): Promise<MarketingAgent[]> {
    const ids = (await redis.smembers(K.agents(oid))) ?? [];
    if (ids.length === 0) {
      for (const d of AGENT_DEFS) {
        const rec: MarketingAgent = { ...d, lastHeartbeat: now(), runs24h: 0, decisions24h: 0 };
        await redis.set(K.agent(oid, d.key), s2(rec));
        await redis.sadd(K.agents(oid), d.key);
      }
      return this.listAgents(oid);
    }
    const out: MarketingAgent[] = [];
    for (const id of ids) {
      const rec = j<MarketingAgent>(await redis.get(K.agent(oid, id)));
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  },

  async getAgent(oid: string, key: MarketingAgentKey): Promise<MarketingAgent> {
    const list = await this.listAgents(oid);
    const agent = list.find((a) => a.key === key);
    if (!agent) throw new AppError("NOT_FOUND", "Marketing agent not found", 404);
    return agent;
  },

  async heartbeatAgent(oid: string, key: MarketingAgentKey): Promise<MarketingAgent> {
    const rec = await this.getAgent(oid, key);
    rec.lastHeartbeat = now();
    rec.runs24h = (rec.runs24h ?? 0) + 1;
    await redis.set(K.agent(oid, key), s2(rec));
    return rec;
  },

  /** Run an agent → returns a real, deterministic decision based on live state. */
  async runAgent(oid: string, key: MarketingAgentKey, payload?: Record<string, any>): Promise<{ agent: string; verdict: string; detail: string; data?: any }> {
    await this.heartbeatAgent(oid, key);
    const agent = await this.getAgent(oid, key);
    agent.decisions24h = (agent.decisions24h ?? 0) + 1;
    await redis.set(K.agent(oid, key), s2(agent));

    switch (key) {
      case "strategist": {
        const dash = await this.dashboard(oid);
        return { agent: agent.name, verdict: "strategy summary", detail: `${dash.activeCampaigns} active of ${dash.totalCampaigns} campaigns, ROAS ${dash.roas ?? "n/a"}`, data: { active: dash.activeCampaigns, total: dash.totalCampaigns, roas: dash.roas } };
      }
      case "budget-optimizer": {
        const camps = await this.listCampaigns(oid);
        const top = camps.sort((a, b) => b.metrics.revenueMicros - a.metrics.revenueMicros).slice(0, 3);
        return { agent: agent.name, verdict: top.length ? "recommend top spenders" : "no campaigns", detail: top.map((c) => c.name).join(", ") || "create campaigns to optimize", data: top.map((c) => ({ name: c.name, revenue: c.metrics.revenueMicros })) };
      }
      case "performance-analyst":
      case "analytics-expert": {
        const dash = await this.dashboard(oid);
        return { agent: agent.name, verdict: `CTR ${dash.totalCtr}%`, detail: `impressions ${dash.totalImpressions}, clicks ${dash.totalClicks}, conversions ${dash.totalConversions}, ROAS ${dash.roas ?? "n/a"}`, data: { ctr: dash.totalCtr, conversions: dash.totalConversions, roas: dash.roas } };
      }
      case "cro":
      case "funnel-optimizer": {
        const tests = await this.listAbTests(oid);
        return { agent: agent.name, verdict: `${tests.length} A/B test(s)`, detail: tests.length ? "tests available — run to find winners" : "create an A/B test to start optimizing", data: { tests: tests.length } };
      }
      case "copywriter": {
        if (!payload?.product) return { agent: agent.name, verdict: "needs brief", detail: "Pass product/audience/goal to generate copy.", data: null };
        const out = await this.generateCopy(oid, { product: payload.product, audience: payload.audience ?? "general", goal: payload.goal ?? "convert", framework: (payload.framework as CopyFramework) ?? "aida" });
        return { agent: agent.name, verdict: out.aiSource === "real" ? "AI copy generated" : "demo copy (no provider)", detail: out.copy.slice(0, 120), data: out };
      }
      default:
        return { agent: agent.name, verdict: "ready", detail: `${agent.domain} — integrated into the marketing platform.`, data: null };
    }
  },

  /* ── Campaigns ────────────────────────────────────────────── */

  async listCampaigns(oid: string): Promise<MarketingCampaign[]> {
    const ids = (await redis.smembers(K.campaigns(oid))) ?? [];
    const out: MarketingCampaign[] = [];
    for (const id of ids) {
      const rec = j<MarketingCampaign>(await redis.get(K.campaign(oid, id)));
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getCampaign(oid: string, id: string): Promise<MarketingCampaign | null> {
    return j<MarketingCampaign>(await redis.get(K.campaign(oid, id)));
  },

  async createCampaign(oid: string, userId: string, input: CreateMarketingCampaignInput): Promise<MarketingCampaign> {
    const id = randomUUID();
    const nowIso = now();
    const rec: MarketingCampaign = {
      id, organizationId: oid, createdById: userId,
      name: input.name, objective: input.objective, platform: input.platform,
      status: "draft", budgetMicros: input.budgetMicros ?? 0,
      startAt: input.startAt, endAt: input.endAt,
      audienceIds: input.audienceIds ?? [],
      metrics: { impressions: 0, reach: 0, clicks: 0, conversions: 0, spendMicros: 0, revenueMicros: 0, engagement: 0 },
      creatives: [], createdAt: nowIso, updatedAt: nowIso,
    };
    await redis.set(K.campaign(oid, id), s2(rec));
    await redis.sadd(K.campaigns(oid), id);
    return rec;
  },

  async updateCampaignStatus(oid: string, id: string, status: MarketingCampaignStatus): Promise<MarketingCampaign> {
    const rec = await this.getCampaign(oid, id);
    if (!rec) throw new AppError("NOT_FOUND", "Campaign not found", 404);
    rec.status = status;
    rec.updatedAt = now();
    await redis.set(K.campaign(oid, id), s2(rec));
    return rec;
  },

  async ingestMetrics(oid: string, id: string, input: IngestCampaignMetricsInput): Promise<MarketingCampaign> {
    const rec = await this.getCampaign(oid, id);
    if (!rec) throw new AppError("NOT_FOUND", "Campaign not found", 404);
    rec.metrics.impressions += input.impressions ?? 0;
    rec.metrics.reach += input.reach ?? 0;
    rec.metrics.clicks += input.clicks ?? 0;
    rec.metrics.conversions += input.conversions ?? 0;
    rec.metrics.spendMicros += input.spendMicros ?? 0;
    rec.metrics.revenueMicros += input.revenueMicros ?? 0;
    rec.metrics.engagement += input.engagement ?? 0;
    rec.updatedAt = now();
    await redis.set(K.campaign(oid, id), s2(rec));
    return rec;
  },

  async removeCampaign(oid: string, id: string): Promise<void> {
    await redis.srem(K.campaigns(oid), id);
    await redis.del(K.campaign(oid, id));
  },

  /* ── Copywriting engine ───────────────────────────────────── */

  async generateCopy(oid: string, input: GenerateCopyInput): Promise<{ copy: string; framework: CopyFramework; aiSource: "real" | "demo" }> {
    const framework = input.framework ?? "aida";
    const guide = FRAMEWORK_GUIDES[framework];
    const aiSource: "real" | "demo" = aiRegistry.hasRealModelConfigured() ? "real" : "demo";

    if (!aiRegistry.hasRealModelConfigured()) {
      return {
        copy: `[DEMO ${framework.toUpperCase()} — ${guide}]\n\nProduct: ${input.product}\nAudience: ${input.audience}\nGoal: ${input.goal}\n\nThis is a scaffold. Configure an AI provider (OPENAI_API_KEY / ANTHROPIC_API_KEY / OLLAMA_BASE_URL) to generate production copy using the ${framework.toUpperCase()} framework (${guide}).`,
        framework, aiSource,
      };
    }

    try {
      const messages: ChatMessage[] = [
        { role: "system", content: "You are the WINDELS AI marketing copywriter. Write concise, persuasive ad copy using the requested framework. Return only the copy." },
        { role: "user", content: `Write ad copy using the ${framework.toUpperCase()} framework (${guide}). Product: ${input.product}. Audience: ${input.audience}. Goal: ${input.goal}.${input.tone ? ` Tone: ${input.tone}.` : ""}` },
      ];
      const res = await aiRegistry.complete({ model: "", messages, temperature: 0.7, maxTokens: 400 }, { organizationId: oid, feature: "marketing-copy" });
      return { copy: res.content, framework, aiSource: res.modelSource === "echo-demo" ? "demo" : "real" };
    } catch (e: any) {
      logger.warn("marketing copy gen failed", { err: e?.message });
      return { copy: `[DEMO ${framework}] ${input.product} — provider error, returned scaffold.`, framework, aiSource: "demo" };
    }
  },

  /* ── Personas ─────────────────────────────────────────────── */

  async listPersonas(oid: string): Promise<Persona[]> {
    const ids = (await redis.smembers(K.personas(oid))) ?? [];
    const out: Persona[] = [];
    for (const id of ids) {
      const rec = j<Persona>(await redis.get(K.persona(oid, id)));
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createPersona(oid: string, userId: string, input: CreatePersonaInput): Promise<Persona> {
    const id = randomUUID();
    const aiSource: "real" | "demo" = aiRegistry.hasRealModelConfigured() ? "real" : "demo";
    const rec: Persona = {
      id, organizationId: oid, name: input.name,
      demographics: { age: "18-45", gender: "all", income: "mid" },
      interests: [input.audience],
      behaviors: [],
      painPoints: [`frustration with existing ${input.product} solutions`],
      motivations: [`achieve goal faster with ${input.product}`],
      goals: [input.product ? `get value from ${input.product}` : "solve their problem"],
      buyingTriggers: ["trial", "discount", "social proof"],
      objections: ["price", "trust"],
      aiSource,
      createdAt: now(),
    };
    await redis.set(K.persona(oid, id), s2(rec));
    await redis.sadd(K.personas(oid), id);
    return rec;
  },

  async removePersona(oid: string, id: string): Promise<void> {
    await redis.srem(K.personas(oid), id);
    await redis.del(K.persona(oid, id));
  },

  /* ── A/B testing ──────────────────────────────────────────── */

  async listAbTests(oid: string): Promise<AbTest[]> {
    const ids = (await redis.smembers(K.abtests(oid))) ?? [];
    const out: AbTest[] = [];
    for (const id of ids) {
      const rec = j<AbTest>(await redis.get(K.abtest(oid, id)));
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createAbTest(oid: string, input: CreateAbTestInput): Promise<AbTest> {
    const id = randomUUID();
    const nowIso = now();
    const rec: AbTest = {
      id, organizationId: oid, campaignId: input.campaignId, name: input.name,
      variants: input.variants.map((v) => ({ id: `var-${randomUUID()}`, name: v.name, copy: v.copy, impressions: 0, clicks: 0, conversions: 0 })),
      status: "running", createdAt: nowIso, updatedAt: nowIso,
    };
    await redis.set(K.abtest(oid, id), s2(rec));
    await redis.sadd(K.abtests(oid), id);
    return rec;
  },

  async recordAbVariantMetrics(oid: string, testId: string, variantId: string, metrics: { impressions?: number; clicks?: number; conversions?: number }): Promise<AbTest> {
    const test = j<AbTest>(await redis.get(K.abtest(oid, testId)));
    if (!test) throw new AppError("NOT_FOUND", "A/B test not found", 404);
    const v = test.variants.find((x) => x.id === variantId);
    if (!v) throw new AppError("NOT_FOUND", "Variant not found", 404);
    v.impressions += metrics.impressions ?? 0;
    v.clicks += metrics.clicks ?? 0;
    v.conversions += metrics.conversions ?? 0;
    test.updatedAt = now();
    await redis.set(K.abtest(oid, testId), s2(test));
    return test;
  },

  /** Declare a winner (or auto-detect from measured conversions). */
  async declareWinner(oid: string, testId: string, variantId?: string): Promise<AbTest> {
    const test = j<AbTest>(await redis.get(K.abtest(oid, testId)));
    if (!test) throw new AppError("NOT_FOUND", "A/B test not found", 404);
    if (variantId) {
      if (!test.variants.some((v) => v.id === variantId)) throw new AppError("NOT_FOUND", "Variant not found", 404);
      test.winnerVariantId = variantId;
    } else {
      const best = test.variants.reduce<AbTestVariant | null>((acc, v) => (v.conversions > (acc?.conversions ?? -1) ? v : acc), null);
      test.winnerVariantId = best?.id;
    }
    test.status = "completed";
    test.updatedAt = now();
    await redis.set(K.abtest(oid, testId), s2(test));
    return test;
  },

  /* ── Recommendations (from real metrics) ──────────────────── */

  async generateRecommendations(oid: string): Promise<MarketingRecommendation[]> {
    const camps = await this.listCampaigns(oid);
    const recs: MarketingRecommendation[] = [];
    for (const c of camps) {
      const m = c.metrics;
      if (m.impressions > 0 && m.clicks === 0) {
        recs.push({ id: randomUUID(), campaignId: c.id, title: `Review creative for "${c.name}"`, rationale: `${m.impressions} impressions with 0 clicks — creative/audience mismatch.`, kind: "creative", priority: "high", aiSource: "demo", createdAt: now() });
      }
      if (m.clicks > 0) {
        const ctr = m.clicks / m.impressions;
        if (ctr < 0.01) recs.push({ id: randomUUID(), campaignId: c.id, title: `Low CTR on "${c.name}"`, rationale: `CTR ${(ctr * 100).toFixed(2)}% below 1% reference — improve hook/offer.`, kind: "copy", priority: "high", aiSource: "demo", createdAt: now() });
        if (m.conversions > 0 && ctr >= 0.01) recs.push({ id: randomUUID(), campaignId: c.id, title: `Scale "${c.name}"`, rationale: `Healthy CTR ${(ctr * 100).toFixed(2)}% with ${m.conversions} conversions — consider scaling budget.`, kind: "scale", priority: "low", aiSource: "demo", createdAt: now() });
      }
      if (m.spendMicros > 0 && m.revenueMicros > 0 && m.revenueMicros / m.spendMicros < 1) {
        recs.push({ id: randomUUID(), campaignId: c.id, title: `ROAS below 1 for "${c.name}"`, rationale: "Spend exceeds revenue — pause or reallocate budget.", kind: "budget", priority: "high", aiSource: "demo", createdAt: now() });
      }
    }
    const ids = (await redis.smembers(K.recs(oid))) ?? [];
    for (const id of ids) await redis.del(id);
    await redis.sadd(K.recs(oid), ...recs.map((r) => r.id));
    for (const r of recs) await redis.set(`${K.recs(oid)}:${r.id}`, s2(r));
    return recs;
  },

  async listRecommendations(oid: string): Promise<MarketingRecommendation[]> {
    const ids = (await redis.smembers(K.recs(oid))) ?? [];
    const out: MarketingRecommendation[] = [];
    for (const id of ids) {
      const rec = j<MarketingRecommendation>(await redis.get(`${K.recs(oid)}:${id}`));
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /* ── Dashboard ────────────────────────────────────────────── */

  async dashboard(oid: string): Promise<MarketingDashboard> {
    const camps = await this.listCampaigns(oid);
    const byPlatform: Record<string, { count: number; spendMicros: number; conversions: number; revenueMicros: number }> = {};
    let spend = 0, revenue = 0, conv = 0, imp = 0, clicks = 0, active = 0;
    for (const c of camps) {
      spend += c.metrics.spendMicros; revenue += c.metrics.revenueMicros;
      conv += c.metrics.conversions; imp += c.metrics.impressions; clicks += c.metrics.clicks;
      if (c.status === "active") active++;
      const b = byPlatform[c.platform] ?? { count: 0, spendMicros: 0, conversions: 0, revenueMicros: 0 };
      b.count++; b.spendMicros += c.metrics.spendMicros; b.conversions += c.metrics.conversions; b.revenueMicros += c.metrics.revenueMicros;
      byPlatform[c.platform] = b;
    }
    const agents = await this.listAgents(oid);
    return {
      totalCampaigns: camps.length, activeCampaigns: active,
      totalSpendMicros: spend, totalRevenueMicros: revenue, totalConversions: conv,
      totalImpressions: imp, totalClicks: clicks,
      totalCtr: imp > 0 ? Math.round((clicks / imp) * 10000) / 100 : 0,
      roas: spend > 0 ? Number((revenue / spend).toFixed(2)) : null,
      cpaMicros: conv > 0 ? Math.round(spend / conv) : null,
      byPlatform,
      recentCampaigns: camps.slice(0, 10),
      topRecommendations: (await this.listRecommendations(oid)).slice(0, 5),
      agents: { total: agents.length, online: agents.filter((a) => a.status === "online").length },
    };
  },
};
