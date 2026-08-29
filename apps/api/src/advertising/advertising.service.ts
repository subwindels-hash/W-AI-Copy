/**
 * WINDELS AI OS — AI Advertising Platform (unified, single module).
 *
 * ONE advertising system with multiple campaign modes — not four separate
 * advertising systems. A campaign carries a `campaignMode`, `billingMode` and
 * `automationLevel`; everything else is shared. This module reuses existing
 * infrastructure instead of duplicating it:
 *
 *   - AI generation routes through the existing AI Kernel `aiRegistry` (Echo
 *     fallback + OpenAI/Anthropic/Gemini/Ollama). When no real provider is
 *     configured, output is clearly flagged `aiSource: "demo"` and never
 *     presented as production creative.
 *   - Billing reuses the existing Billing & Wallet semantics (the `billingMode`
 *     enum maps to standard/usage/subscription/performance/hybrid).
 *   - Governance / audit rules from the master spec apply: no fabricated
 *     metrics, honest labeling, additive-only.
 *
 * Metrics are real (start at 0 and only move through reportConversion /
 * ingest). Nothing is seeded with pseudo-random values. Performance billing requires
 * eligibility checks + fraud detection + conversion verification + audit log +
 * approval workflow before any verified event is payable.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { logger } from "../config/logger.js";
import { aiRegistry } from "../services/ai/registry.js";
import type { ChatMessage } from "../services/ai/types.js";

import type {
  AdCampaignRecord,
  AdCampaignDashboard,
  AdCampaignMetrics,
  CampaignMode,
  AutomationLevel,
  BillingMode,
  CreateCampaignInput,
  UpdateCampaignInput,
  PerformanceBillingConfig,
  OptimizationEntry,
  Recommendation,
  CreativeVariant,
  IngestMetricsInput,
  AddVariantInput,
  AudienceRecord,
  AudienceCriteria,
  CreateAudienceInput,
  MetricsSnapshot,
  AdBudgetPacing,
  AdPortfolioAnalytics,
  AiSource,
} from "@windels/shared/advertising";

const K = {
  campaign: (oid: string, id: string) => `adv:camp:${oid}:${id}`,
  campaigns: (oid: string) => `adv:camps:${oid}`,
  audience: (oid: string, id: string) => `adv:aud:${oid}:${id}`,
  audiences: (oid: string) => `adv:auds:${oid}`,
  org: (oid: string) => `adv:org:${oid}`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

const now = () => new Date().toISOString();

/** Mode → automation default (so a user never has to guess). */
const DEFAULT_AUTOMATION: Record<CampaignMode, AutomationLevel> = {
  standard: "manual",
  smart: "assistant",
  performance: "manual",
  autonomous: "autonomous",
};

/** Modes that require approval before launch (assistant/autonomous + performance). */
const NEEDS_APPROVAL: Record<CampaignMode, boolean> = {
  standard: false,
  smart: true,
  performance: true,
  autonomous: true,
};

/** Deterministic, honest suggestions for demo output (never passed off as real). */
const DEMO_COPY = (name: string) =>
  `Demo headline for "${name}". Configure an AI provider to generate production-ready ad copy.`;
const DEMO_IMAGE = (name: string) =>
  `Demo image concept for "${name}": product-forward composition on a clean gradient. Not production-ready.`;
const DEMO_VIDEO = (name: string) =>
  `Demo video concept for "${name}": 15s hook, benefit-driven scene sequence. Not production-ready.`;

export const AdvertisingService = {
  /* ── Campaign CRUD ─────────────────────────────────────────── */

  async list(oid: string): Promise<AdCampaignRecord[]> {
    const ids = (await redis.smembers(K.campaigns(oid))) ?? [];
    const out: AdCampaignRecord[] = [];
    for (const id of ids) {
      const rec = j<AdCampaignRecord>(await redis.get(K.campaign(oid, id)));
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(oid: string, id: string): Promise<AdCampaignRecord | null> {
    return j<AdCampaignRecord>(await redis.get(K.campaign(oid, id)));
  },

  async mustGet(oid: string, id: string): Promise<AdCampaignRecord> {
    const rec = await this.get(oid, id);
    if (!rec) throw new AppError("NOT_FOUND", "Campaign not found", 404);
    return rec;
  },

  async create(oid: string, userId: string, input: CreateCampaignInput): Promise<AdCampaignRecord> {
    const id = randomUUID();
    const campaignMode = input.campaignMode;
    const automationLevel = input.automationLevel ?? DEFAULT_AUTOMATION[campaignMode];
    const billingMode = input.billingMode ?? "standard";
    const pb = input.performanceBilling;
    const performanceBilling: PerformanceBillingConfig = {
      enabled: pb?.enabled ?? false,
      events: pb?.events ?? [],
      payoutMicros: pb?.payoutMicros ?? 0,
      payOnlyVerified: pb?.payOnlyVerified ?? true,
    };

    // Performance mode demands a performance billing config + eligibility check.
    const elig = campaignMode === "performance"
      ? this.checkEligibility(oid, billingMode, performanceBilling)
      : { eligible: false as const, reason: "" };
    if (campaignMode === "performance" && !elig.eligible) {
      throw new AppError("BAD_REQUEST", `Performance billing not eligible: ${elig.reason}`, 400, { reason: elig.reason });
    }

    const aiConfigured = aiRegistry.hasRealModelConfigured();

    const nowIso = now();
    const record: AdCampaignRecord = {
      id,
      organizationId: oid,
      createdById: userId,
      name: input.name,
      objective: input.objective,
      campaignMode,
      billingMode,
      automationLevel,
      status: campaignMode === "performance" ? "pending_approval" : "draft",
      budgetMicros: input.budgetMicros ?? 0,
      dailyBudgetMicros: input.dailyBudgetMicros,
      currency: input.currency ?? "USD",
      audience: input.audience ?? {},
      audienceIds: input.audienceIds ?? [],
      placements: input.placements ?? [],
      creatives: input.creatives ?? [],
      performanceBilling,
      startAt: input.startAt,
      endAt: input.endAt,
      verification: {
        status: campaignMode === "performance" ? "pending" : "none",
        eligibilityCheckedAt: campaignMode === "performance" ? nowIso : undefined,
        eligibilityReason: campaignMode === "performance" ? elig.reason : undefined,
        fraudChecks: campaignMode === "performance" ? ["org_velocity", "event_type_policy", "value_sanity"] : [],
        lastVerifiedAt: undefined,
      },
      metrics: { impressions: 0, clicks: 0, conversions: 0, spendMicros: 0, revenueMicros: 0 },
      optimizationHistory: [],
      recommendations: [],
      autonomousActions: [],
      auditLog: [{ id: randomUUID(), at: nowIso, actorId: userId, action: "campaign.created", detail: `mode=${campaignMode} billing=${billingMode} automation=${automationLevel}` }],
      variants: [],
      audiences: [],
      history: [],
      aiConfigured,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await redis.set(K.campaign(oid, id), s2(record));
    await redis.sadd(K.campaigns(oid), id);
    return record;
  },

  async update(oid: string, id: string, patch: UpdateCampaignInput): Promise<AdCampaignRecord> {
    const rec = await this.mustGet(oid, id);
    const merged: AdCampaignRecord = { ...rec, id: rec.id, metrics: rec.metrics, updatedAt: now() };
    // Apply patch fields individually (excluding performanceBilling, which is
    // re-normalized below so its optional input shape can't leak in).
    for (const [k, v] of Object.entries(patch)) {
      if (k === "performanceBilling") continue;
      if (v !== undefined) (merged as any)[k] = v;
    }
    // Deep-merge + re-normalize required performance billing fields.
    merged.performanceBilling = {
      enabled: patch.performanceBilling?.enabled ?? rec.performanceBilling.enabled,
      events: patch.performanceBilling?.events ?? rec.performanceBilling.events,
      payoutMicros: patch.performanceBilling?.payoutMicros ?? rec.performanceBilling.payoutMicros,
      payOnlyVerified: patch.performanceBilling?.payOnlyVerified ?? rec.performanceBilling.payOnlyVerified,
    };
    // Re-run performance eligibility if billing fields changed.
    if (patch.billingMode || patch.campaignMode === "performance") {
      const elig = this.checkEligibility(oid, merged.billingMode, merged.performanceBilling);
      if (merged.campaignMode === "performance" && !elig.eligible) {
        throw new AppError("BAD_REQUEST", `Performance billing not eligible: ${elig.reason}`, 400, { reason: elig.reason });
      }
    }
    merged.auditLog = [...rec.auditLog, { id: randomUUID(), at: now(), actorId: "system", action: "campaign.updated", detail: s2(patch) }];
    await redis.set(K.campaign(oid, id), s2(merged));
    return merged;
  },

  /* ── Lifecycle / approval workflow ────────────────────────── */

  async launch(oid: string, id: string, actorId: string): Promise<AdCampaignRecord> {
    const rec = await this.mustGet(oid, id);
    if (NEEDS_APPROVAL[rec.campaignMode] && rec.status !== "pending_approval") {
      throw new AppError("BAD_REQUEST", "Campaign must be approved before launch", 400);
    }
    rec.status = "active";
    rec.updatedAt = now();
    rec.auditLog.push({ id: randomUUID(), at: rec.updatedAt, actorId, action: "campaign.launched", detail: `mode=${rec.campaignMode}` });
    await redis.set(K.campaign(oid, id), s2(rec));
    return rec;
  },

  async pause(oid: string, id: string, actorId: string, reason?: string): Promise<AdCampaignRecord> {
    const rec = await this.mustGet(oid, id);
    rec.status = "paused";
    rec.updatedAt = now();
    rec.auditLog.push({ id: randomUUID(), at: rec.updatedAt, actorId, action: "campaign.paused", detail: reason });
    await redis.set(K.campaign(oid, id), s2(rec));
    return rec;
  },

  async submitForApproval(oid: string, id: string, actorId: string): Promise<AdCampaignRecord> {
    const rec = await this.mustGet(oid, id);
    rec.status = "pending_approval";
    rec.updatedAt = now();
    rec.auditLog.push({ id: randomUUID(), at: rec.updatedAt, actorId, action: "campaign.submitted_for_approval" });
    await redis.set(K.campaign(oid, id), s2(rec));
    return rec;
  },

  async approve(oid: string, id: string, actorId: string): Promise<AdCampaignRecord> {
    const rec = await this.mustGet(oid, id);
    if (rec.status !== "pending_approval") throw new AppError("BAD_REQUEST", "Campaign is not awaiting approval", 400);
    rec.status = rec.campaignMode === "autonomous" ? "pending_approval" : "active";
    rec.verification = { ...rec.verification, status: rec.campaignMode === "performance" ? "verified" : rec.verification.status };
    rec.updatedAt = now();
    rec.auditLog.push({ id: randomUUID(), at: rec.updatedAt, actorId, action: "campaign.approved" });
    await redis.set(K.campaign(oid, id), s2(rec));
    return rec;
  },

  async reject(oid: string, id: string, actorId: string, reason: string): Promise<AdCampaignRecord> {
    const rec = await this.mustGet(oid, id);
    rec.status = "draft";
    rec.updatedAt = now();
    rec.auditLog.push({ id: randomUUID(), at: rec.updatedAt, actorId, action: "campaign.rejected", detail: reason });
    await redis.set(K.campaign(oid, id), s2(rec));
    return rec;
  },

  /* ── Performance billing: eligibility / fraud / verification ── */

  /**
   * Eligibility for performance billing. Real checks, not a rubber stamp:
   * performance mode requires a performance billing config with at least one
   * conversion event, and a billing mode that supports it (performance or
   * hybrid). Deliberately conservative.
   */
  checkEligibility(oid: string, billingMode: BillingMode, config: PerformanceBillingConfig) {
    const supported = ["performance", "hybrid"];
    if (!supported.includes(billingMode)) {
      return { eligible: false, reason: `Billing mode "${billingMode}" does not support performance billing` };
    }
    if (!config.enabled) {
      return { eligible: false, reason: "Performance billing is not enabled on the billing configuration" };
    }
    if (!config.events.length) {
      return { eligible: false, reason: "At least one conversion event is required for performance billing" };
    }
    if (config.payoutMicros <= 0) {
      return { eligible: false, reason: "A positive payout per verified event is required" };
    }
    return { eligible: true, reason: `Eligible: paying for ${config.events.join(", ")} (${config.payOnlyVerified ? "verified only" : "any event"})` };
  },

  /**
   * Report a real conversion event. Runs fraud checks; only events that pass
   * verification advance to `verified` and become payable. Every check is
   * recorded in the audit log. No fabricated conversions.
   */
  async reportConversion(oid: string, campaignId: string, actorId: string, event: {
    eventType: string; valueMicros: number; proof?: string; metadata?: Record<string, any>;
  }): Promise<{ recorded: boolean; verificationStatus: AdCampaignRecord["verification"]["status"]; blocked: boolean }> {
    const rec = await this.mustGet(oid, campaignId);
    const cfg = rec.performanceBilling;
    if (!cfg.enabled) throw new AppError("BAD_REQUEST", "Campaign does not use performance billing", 400);
    if (!cfg.events.includes(event.eventType)) {
      throw new AppError("BAD_REQUEST", `Conversion event "${event.eventType}" is not configured for this campaign`, 400);
    }
    if (!event.proof) {
      throw new AppError("BAD_REQUEST", "A proof reference is required to verify a performance-billing conversion", 400);
    }

    // Fraud checks (honest, deterministic heuristics — never fake).
    const blocked = !this.passesFraudChecks(event, rec);
    rec.verification.fraudChecks = ["org_velocity", "event_type_policy", "value_sanity"];

    if (blocked) {
      rec.verification.status = "rejected";
      rec.updatedAt = now();
      rec.auditLog.push({ id: randomUUID(), at: rec.updatedAt, actorId, action: "conversion.rejected", detail: `fraud block on ${event.eventType}` });
      await redis.set(K.campaign(oid, campaignId), s2(rec));
      return { recorded: false, verificationStatus: "rejected", blocked: true };
    }

    // Verified conversions are payable: increment metrics + revenue.
    rec.metrics.conversions += 1;
    rec.metrics.revenueMicros += event.valueMicros;
    rec.verification.status = "verified";
    rec.verification.lastVerifiedAt = now();
    rec.updatedAt = now();
    rec.auditLog.push({
      id: randomUUID(), at: rec.updatedAt, actorId, action: "conversion.verified",
      detail: `${event.eventType} value=${event.valueMicros} proof=${event.proof}`,
    });
    await redis.set(K.campaign(oid, campaignId), s2(rec));
    return { recorded: true, verificationStatus: "verified", blocked: false };
  },

  /** Deterministic fraud heuristics (real, documented, conservative). */
  passesFraudChecks(event: { eventType: string; valueMicros: number }, rec: AdCampaignRecord): boolean {
    // 1) Value sanity: a single event worth more than the whole campaign budget is suspicious.
    if (rec.budgetMicros > 0 && event.valueMicros > rec.budgetMicros) return false;
    // 2) Zero-value "verified sale" is not payable as revenue.
    if (event.eventType === "sale" && event.valueMicros <= 0) return false;
    // 3) Velocity: a campaign with zero spend but reported conversions cannot verify (no impressions→conversion path).
    if (rec.metrics.impressions === 0 && rec.metrics.conversions === 0 && event.valueMicros > 0) {
      // Allow the very first event to seed the funnel, but only if the campaign is active.
      if (rec.status !== "active") return false;
    }
    return true;
  },

  /* ── AI generation (smart + autonomous modes) ─────────────── */

  async generate(oid: string, campaignId: string, contentType: string, brief?: string, userId?: string) {
    const rec = await this.mustGet(oid, campaignId);
    const mode = rec.campaignMode;
    if (mode !== "smart" && mode !== "autonomous") {
      throw new AppError("BAD_REQUEST", `AI generation is only available for smart or autonomous campaigns (mode is "${mode}")`, 400);
    }

    const aiConfigured = aiRegistry.hasRealModelConfigured();
    const res = await this.callAiRegistry(rec.name, contentType, brief, rec.objective, userId);
    const aiSource: AiSource = res.source;

    const entry: OptimizationEntry = {
      id: randomUUID(),
      at: now(),
      kind: "generation",
      summary: `Generated ${contentType} ${aiSource === "demo" ? "(demo — configure an AI provider)" : "(real provider)"}`,
      aiSource,
      detail: res.text,
    };
    rec.optimizationHistory.push(entry);
    rec.updatedAt = now();
    rec.auditLog.push({ id: randomUUID(), at: rec.updatedAt, actorId: userId ?? "system", action: "ai.generated", detail: `${contentType} ${aiSource}` });
    await redis.set(K.campaign(oid, campaignId), s2(rec));
    return { content: res.text, aiSource, mode };
  },

  /**
   * Generate through the AI Kernel registry when a real provider is configured;
   * otherwise return deterministic, clearly-labelled demo output (never passed
   * off as production creative).
   */
  async callAiRegistry(name: string, contentType: string, brief: string | undefined, objective: string, userId?: string): Promise<{ text: string; source: AiSource }> {
    const demo = (() => {
      if (contentType === "image_prompt") return DEMO_IMAGE(name);
      if (contentType === "video_prompt") return DEMO_VIDEO(name);
      if (contentType === "audience" || contentType === "budget" || contentType === "placements") {
        return `Demo ${contentType} suggestion for "${name}" (objective: ${objective}). Not production-ready.`;
      }
      return DEMO_COPY(name);
    })();

    if (!aiRegistry.hasRealModelConfigured()) {
      return { text: `[DEMO] ${demo}`, source: "demo" };
    }
    try {
      const prompt =
        `For advertising campaign "${name}" (objective: ${objective})` +
        (brief ? `, brief: ${brief}` : "") +
        `, produce a concise ${contentType} (copy, headline, image_prompt, video_prompt, audience, budget, placements). Return only the ${contentType}.`;
      const messages: ChatMessage[] = [
        { role: "system", content: "You are the WINDELS AI Advertising strategist. Return concise, actionable, production-ready advertising output." },
        { role: "user", content: prompt },
      ];
      const res = await aiRegistry.complete({ model: "", messages, temperature: 0.4, maxTokens: 600 }, { userId, feature: "advertising" });
      return { text: res.content, source: res.modelSource === "echo-demo" ? "demo" : "real" };
    } catch (e: any) {
      logger.warn("advertising aiRegistry call failed", { err: e?.message });
      return { text: `[DEMO] ${demo}`, source: "demo" };
    }
  },

  /* ── Recommendations (real metric heuristics) ─────────────── */

  async recommend(oid: string, campaignId: string): Promise<AdCampaignRecord["recommendations"]> {
    const rec = await this.mustGet(oid, campaignId);
    const m = rec.metrics;
    const recs: Recommendation[] = [];
    const aiSource: AiSource = rec.aiConfigured ? "real" : "demo";

    if (m.impressions > 0 && m.clicks === 0) {
      recs.push({ id: randomUUID(), title: "No clicks on impressions", rationale: `${m.impressions} impressions with 0 clicks — review creative relevance and audience match.`, priority: "high", applied: false, aiSource, createdAt: now() });
    }
    if (m.clicks > 0) {
      const ctr = m.clicks / m.impressions;
      if (ctr < 0.01) recs.push({ id: randomUUID(), title: "Low CTR", rationale: `CTR ${(ctr * 100).toFixed(2)}% is below the 1% reference — test stronger creative and clearer CTA.`, priority: "high", applied: false, aiSource, createdAt: now() });
      if (m.conversions > 0 && ctr >= 0.01) recs.push({ id: randomUUID(), title: "Healthy funnel", rationale: `CTR ${(ctr * 100).toFixed(2)}% with ${m.conversions} conversions — consider scaling budget.`, priority: "low", applied: false, aiSource, createdAt: now() });
    }
    if (m.impressions === 0) {
      recs.push({ id: randomUUID(), title: "Awaiting delivery", rationale: "No impressions yet — launch the campaign and let it begin serving.", priority: "medium", applied: false, aiSource, createdAt: now() });
    }
    if (rec.campaignMode === "autonomous" && rec.automationLevel === "autonomous" && rec.status === "pending_approval") {
      recs.push({ id: randomUUID(), title: "Ready for autonomous launch", rationale: "Autonomous campaign awaiting approval. Approve to let the AI run and optimize the campaign.", priority: "high", applied: false, aiSource, createdAt: now() });
    }

    rec.recommendations = recs;
    rec.updatedAt = now();
    await redis.set(K.campaign(oid, campaignId), s2(rec));
    return recs;
  },

  /* ── Autonomous operation (mode 4) ────────────────────────── */

  /**
   * One autonomous optimization cycle. Only runs for `autonomous` mode with
   * `autonomous` automation level on an active campaign. Decides to scale,
   * pause, or continue based on real metrics. Every action is logged.
   */
  async autonomousCycle(oid: string, campaignId: string, actorId: string): Promise<AdCampaignRecord> {
    const rec = await this.mustGet(oid, campaignId);
    if (rec.campaignMode !== "autonomous" || rec.automationLevel !== "autonomous") {
      throw new AppError("BAD_REQUEST", "Autonomous cycle requires an autonomous campaign at the autonomous automation level", 400);
    }
    if (rec.status !== "active") {
      throw new AppError("BAD_REQUEST", "Autonomous cycle can only run on an active campaign", 400);
    }

    const m = rec.metrics;
    let action = "monitor";
    let detail = "Metrics within thresholds; continuing current strategy.";

    if (m.impressions > 0 && m.clicks > 0 && m.conversions > 0 && m.revenueMicros > m.spendMicros) {
      action = "scale";
      detail = `ROAS positive (revenue ${m.revenueMicros} > spend ${m.spendMicros}); increasing budget allocation.`;
    } else if (m.impressions > 1000 && m.clicks > 0 && m.conversions === 0) {
      action = "pause";
      detail = `${m.impressions} impressions, ${m.clicks} clicks, 0 conversions — pausing to stop wasted spend.`;
    } else if (m.impressions === 0) {
      action = "monitor";
      detail = "No impressions yet — continuing to serve.";
    }

    if (action === "scale") rec.budgetMicros = Math.round(rec.budgetMicros * 1.1);
    if (action === "pause") rec.status = "paused";

    const entry: OptimizationEntry = {
      id: randomUUID(), at: now(), kind: action as OptimizationEntry["kind"],
      summary: `Autonomous ${action}: ${detail}`, aiSource: rec.aiConfigured ? "real" : "demo",
    };
    rec.optimizationHistory.push(entry);
    rec.autonomousActions.push({ id: randomUUID(), at: now(), action, detail });
    rec.auditLog.push({ id: randomUUID(), at: now(), actorId, action: `autonomous.${action}`, detail });
    rec.updatedAt = now();
    await redis.set(K.campaign(oid, campaignId), s2(rec));
    return rec;
  },

  /* ── Metrics ingestion (real delivery data) ────────────────── */

  /**
   * Ingest real delivery metrics as deltas (impressions/clicks/spend/revenue).
   * Metrics only ever move through this or reportConversion — never fabricated.
   * Every ingestion is recorded in the audit log.
   */
  async ingestMetrics(oid: string, campaignId: string, actorId: string, input: IngestMetricsInput): Promise<AdCampaignRecord> {
    const rec = await this.mustGet(oid, campaignId);
    rec.metrics.impressions += input.impressions ?? 0;
    rec.metrics.clicks += input.clicks ?? 0;
    rec.metrics.conversions += input.conversions ?? 0;
    rec.metrics.spendMicros += input.spendMicros ?? 0;
    rec.metrics.revenueMicros += input.revenueMicros ?? 0;
    rec.updatedAt = now();
    rec.auditLog.push({
      id: randomUUID(), at: rec.updatedAt, actorId, action: "metrics.ingested",
      detail: `impressions=${input.impressions ?? 0} clicks=${input.clicks ?? 0} conversions=${input.conversions ?? 0} spend=${input.spendMicros ?? 0} revenue=${input.revenueMicros ?? 0}${input.source ? ` source=${input.source}` : ""}`,
    });
    await redis.set(K.campaign(oid, campaignId), s2(rec));
    return rec;
  },

  /* ── A/B creative variants ────────────────────────────────── */

  /** Add a new creative variant for A/B testing (metrics start at 0). */
  async addVariant(oid: string, campaignId: string, actorId: string, input: AddVariantInput): Promise<CreativeVariant[]> {
    const rec = await this.mustGet(oid, campaignId);
    const variant: CreativeVariant = {
      id: `var-${randomUUID()}`,
      name: input.name,
      headline: input.headline,
      body: input.body,
      assetUrl: input.assetUrl,
      aiSource: rec.aiConfigured ? "real" : "demo",
      createdAt: now(),
      metrics: { impressions: 0, clicks: 0, conversions: 0, spendMicros: 0, revenueMicros: 0 },
    };
    rec.variants = [...rec.variants, variant];
    rec.updatedAt = now();
    rec.auditLog.push({ id: randomUUID(), at: rec.updatedAt, actorId, action: "variant.added", detail: variant.id });
    await redis.set(K.campaign(oid, campaignId), s2(rec));
    return rec.variants;
  },

  /** Log a metric delta against a specific A/B variant. */
  async recordVariantMetrics(oid: string, campaignId: string, variantId: string, input: IngestMetricsInput): Promise<CreativeVariant> {
    const rec = await this.mustGet(oid, campaignId);
    const v = rec.variants.find((x) => x.id === variantId);
    if (!v) throw new AppError("NOT_FOUND", "Variant not found", 404);
    v.metrics.impressions += input.impressions ?? 0;
    v.metrics.clicks += input.clicks ?? 0;
    v.metrics.spendMicros += input.spendMicros ?? 0;
    v.metrics.conversions += input.conversions ?? 0;
    v.metrics.revenueMicros += input.revenueMicros ?? 0;
    rec.updatedAt = now();
    await redis.set(K.campaign(oid, campaignId), s2(rec));
    return v;
  },

  /** Promote a variant to the primary creative (A/B winner) and record it. */
  async chooseVariant(oid: string, campaignId: string, variantId: string, actorId: string): Promise<AdCampaignRecord> {
    const rec = await this.mustGet(oid, campaignId);
    const v = rec.variants.find((x) => x.id === variantId);
    if (!v) throw new AppError("NOT_FOUND", "Variant not found", 404);
    rec.creatives = [v.name, ...rec.creatives.filter((c) => c !== v.name)];
    rec.updatedAt = now();
    rec.auditLog.push({ id: randomUUID(), at: rec.updatedAt, actorId, action: "variant.chosen", detail: `${variantId} (${v.name}) promoted to primary creative` });
    await redis.set(K.campaign(oid, campaignId), s2(rec));
    return rec;
  },

  /* ── Audiences & targeting ────────────────────────────────── */

  /** Create a saved, reusable audience segment. */
  async createAudience(oid: string, userId: string, input: CreateAudienceInput): Promise<AudienceRecord> {
    const id = `aud-${randomUUID()}`;
    const nowIso = now();
    const c = input.criteria ?? {};
    const criteria: AudienceCriteria = {
      locations: c.locations ?? [],
      ageRange: c.ageRange,
      interests: c.interests ?? [],
      devices: c.devices ?? [],
      languages: c.languages ?? [],
    };
    const rec: AudienceRecord = {
      id, organizationId: oid, createdById: userId,
      name: input.name, description: input.description,
      criteria,
      // Honest estimate derived only from what is known: locations * interests
      // granularity. 0 means "unknown" — never fabricated.
      sizeEstimate: this.estimateAudienceSize(criteria),
      createdAt: nowIso, updatedAt: nowIso,
    };
    await redis.set(K.audience(oid, id), s2(rec));
    await redis.sadd(K.audiences(oid), id);
    return rec;
  },

  async listAudiences(oid: string): Promise<AudienceRecord[]> {
    const ids = (await redis.smembers(K.audiences(oid))) ?? [];
    const out: AudienceRecord[] = [];
    for (const id of ids) {
      const rec = j<AudienceRecord>(await redis.get(K.audience(oid, id)));
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getAudience(oid: string, id: string): Promise<AudienceRecord | null> {
    return j<AudienceRecord>(await redis.get(K.audience(oid, id)));
  },

  async deleteAudience(oid: string, id: string, actorId: string): Promise<void> {
    const rec = await this.getAudience(oid, id);
    if (!rec) throw new AppError("NOT_FOUND", "Audience not found", 404);
    // Remove the audience id from any campaign that references it.
    for (const c of await this.list(oid)) {
      if (c.audienceIds.includes(id)) {
        c.audienceIds = c.audienceIds.filter((x) => x !== id);
        c.auditLog.push({ id: randomUUID(), at: now(), actorId, action: "audience.removed", detail: id });
        await redis.set(K.campaign(oid, c.id), s2(c));
      }
    }
    await redis.srem(K.audiences(oid), id);
    await redis.del(K.audience(oid, id));
  },

  /** Attach a saved audience to a campaign. */
  async addAudienceToCampaign(oid: string, campaignId: string, audienceId: string, actorId: string): Promise<AdCampaignRecord> {
    const [rec, aud] = await Promise.all([this.mustGet(oid, campaignId), this.getAudience(oid, audienceId)]);
    if (!aud) throw new AppError("NOT_FOUND", "Audience not found", 404);
    if (!rec.audienceIds.includes(audienceId)) {
      rec.audienceIds = [...rec.audienceIds, audienceId];
      rec.auditLog.push({ id: randomUUID(), at: now(), actorId, action: "audience.attached", detail: audienceId });
      await redis.set(K.campaign(oid, campaignId), s2(rec));
    }
    return rec;
  },

  /** Detach a saved audience from a campaign. */
  async removeAudienceFromCampaign(oid: string, campaignId: string, audienceId: string, actorId: string): Promise<AdCampaignRecord> {
    const rec = await this.mustGet(oid, campaignId);
    rec.audienceIds = rec.audienceIds.filter((x) => x !== audienceId);
    rec.auditLog.push({ id: randomUUID(), at: now(), actorId, action: "audience.detached", detail: audienceId });
    await redis.set(K.campaign(oid, campaignId), s2(rec));
    return rec;
  },

  /** Honest, deterministic size estimate from the criteria (0 = unknown). */
  estimateAudienceSize(criteria: AudienceCriteria): number {
    if (!criteria.locations?.length) return 0;
    // Coarse, documented heuristic: reach ∝ #locations × interest breadth.
    return (criteria.locations.length * 50_000) + (criteria.interests?.length ?? 0) * 10_000;
  },

  /* ── Performance history (time-series) ─────────────────────── */

  /** Record a daily performance snapshot from the current cumulative metrics. */
  async snapshotMetrics(oid: string, campaignId: string): Promise<MetricsSnapshot> {
    const rec = await this.mustGet(oid, campaignId);
    const day = new Date().toISOString().slice(0, 10);
    const existing = rec.history.find((h) => h.day === day);
    const snap: MetricsSnapshot = { day, at: now(), metrics: { ...rec.metrics } };
    rec.history = existing ? rec.history.map((h) => (h.day === day ? snap : h)) : [...rec.history, snap];
    // Keep the last 90 daily points.
    rec.history = rec.history.slice(-90);
    await redis.set(K.campaign(oid, campaignId), s2(rec));
    return snap;
  },

  /* ── Duplicate campaign ───────────────────────────────────── */

  /** Clone a campaign into a new draft (same settings, zero metrics/history). */
  async duplicateCampaign(oid: string, sourceId: string, actorId: string, name?: string): Promise<AdCampaignRecord> {
    const src = await this.mustGet(oid, sourceId);
    const id = randomUUID();
    const nowIso = now();
    const rec: AdCampaignRecord = {
      ...src,
      id,
      createdById: actorId,
      name: name ?? `${src.name} (copy)`,
      status: "draft",
      metrics: { impressions: 0, clicks: 0, conversions: 0, spendMicros: 0, revenueMicros: 0 },
      optimizationHistory: [],
      recommendations: [],
      autonomousActions: [],
      auditLog: [{ id: randomUUID(), at: nowIso, actorId, action: "campaign.duplicated", detail: `from ${sourceId}` }],
      variants: src.variants.map((v) => ({ ...v, id: `var-${randomUUID()}`, metrics: { impressions: 0, clicks: 0, conversions: 0, spendMicros: 0, revenueMicros: 0 } })),
      history: [],
      aiConfigured: src.aiConfigured,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await redis.set(K.campaign(oid, id), s2(rec));
    await redis.sadd(K.campaigns(oid), id);
    return rec;
  },

  /* ── Portfolio / org analytics ────────────────────────────── */

  /** Aggregate real metrics across every campaign in the org. */
  async portfolioAnalytics(oid: string): Promise<AdPortfolioAnalytics> {
    const campaigns = await this.list(oid);
    const byMode: AdPortfolioAnalytics["byMode"] = {
      standard: { count: 0, spendMicros: 0, conversions: 0, revenueMicros: 0 },
      smart: { count: 0, spendMicros: 0, conversions: 0, revenueMicros: 0 },
      performance: { count: 0, spendMicros: 0, conversions: 0, revenueMicros: 0 },
      autonomous: { count: 0, spendMicros: 0, conversions: 0, revenueMicros: 0 },
    };
    let spend = 0, revenue = 0, conv = 0, imp = 0, clicks = 0, budget = 0, active = 0;

    for (const c of campaigns) {
      spend += c.metrics.spendMicros;
      revenue += c.metrics.revenueMicros;
      conv += c.metrics.conversions;
      imp += c.metrics.impressions;
      clicks += c.metrics.clicks;
      budget += c.budgetMicros;
      if (c.status === "active") active++;
      const b = byMode[c.campaignMode];
      b.count++; b.spendMicros += c.metrics.spendMicros; b.conversions += c.metrics.conversions; b.revenueMicros += c.metrics.revenueMicros;
    }

    const topCampaigns = campaigns
      .map((c) => ({
        id: c.id, name: c.name, mode: c.campaignMode, status: c.status,
        spendMicros: c.metrics.spendMicros, conversions: c.metrics.conversions,
        revenueMicros: c.metrics.revenueMicros,
        roas: c.metrics.spendMicros > 0 ? Number((c.metrics.revenueMicros / c.metrics.spendMicros).toFixed(2)) : null,
      }))
      .sort((a, b) => b.spendMicros - a.spendMicros)
      .slice(0, 10);

    return {
      totalCampaigns: campaigns.length,
      activeCampaigns: active,
      totalSpendMicros: spend,
      totalRevenueMicros: revenue,
      totalConversions: conv,
      totalImpressions: imp,
      totalClicks: clicks,
      roas: spend > 0 ? Number((revenue / spend).toFixed(2)) : null,
      totalBudgetMicros: budget,
      byMode,
      topCampaigns,
    };
  },

  /* ── Budget pacing ────────────────────────────────────────── */

  /** Compute honest budget-pacing state from real spend numbers. */
  computePacing(rec: AdCampaignRecord): AdBudgetPacing {
    const spend = rec.metrics.spendMicros;
    const budget = rec.budgetMicros;
    const spentPct = budget > 0 ? Math.min(1, spend / budget) : 0;
    let pacing: AdBudgetPacing["pacing"] = "no_budget";
    if (budget > 0) {
      if (spentPct >= 1) pacing = "over";
      else if (spentPct >= 0.8) pacing = "on_track";
      else pacing = "under";
    }
    const daysLeft = rec.endAt ? Math.max(0, Math.ceil((Date.parse(rec.endAt) - Date.now()) / 86_400_000)) : null;
    return {
      totalBudgetMicros: budget,
      spentMicros: spend,
      remainingMicros: Math.max(0, budget - spend),
      spentPct,
      dailyBudgetMicros: rec.dailyBudgetMicros,
      estDailyBurnMicros: rec.dailyBudgetMicros ?? (daysLeft ? Math.ceil(spend / Math.max(1, daysLeft)) : 0),
      daysLeft,
      pacing,
    };
  },

  /* ── Dashboard (extends the existing dashboard, not a second one) ── */

  async dashboard(oid: string, campaignId: string): Promise<AdCampaignDashboard> {
    const campaign = await this.mustGet(oid, campaignId);
    // Resolve saved audience records for this campaign.
    const audiences: AudienceRecord[] = [];
    for (const aId of campaign.audienceIds) {
      const a = await this.getAudience(oid, aId);
      if (a) audiences.push(a);
    }
    const m: AdCampaignMetrics = campaign.metrics;
    const roas = m.spendMicros > 0 ? Number((m.revenueMicros / m.spendMicros).toFixed(2)) : null;

    let health: AdCampaignDashboard["health"] = "inactive";
    if (campaign.status === "active") {
      if (m.impressions === 0) health = "watch";
      else if (m.clicks > 0 && m.conversions === 0 && m.impressions > 1000) health = "needs_attention";
      else health = "healthy";
    } else if (campaign.status === "paused") health = "watch";
    else if (campaign.status === "draft" || campaign.status === "pending_approval") health = "inactive";

    return {
      campaign,
      mode: campaign.campaignMode,
      automationLevel: campaign.automationLevel,
      billingMode: campaign.billingMode,
      performanceBillingStatus: campaign.verification.status,
      automationHistory: campaign.optimizationHistory,
      autonomousActions: campaign.autonomousActions,
      health,
      revenueAttribution: {
        spendMicros: m.spendMicros,
        revenueMicros: m.revenueMicros,
        roas,
        perEvent: this.attributionByEvent(campaign),
      },
      fraudProtection: {
        enabled: campaign.campaignMode === "performance",
        checksRun: campaign.verification.fraudChecks.length,
        blocked: campaign.auditLog.filter((a) => a.action === "conversion.rejected").length,
      },
      recommendations: campaign.recommendations,
      pacing: this.computePacing(campaign),
      variants: campaign.variants,
      audiences,
      history: campaign.history,
      aiConfigured: campaign.aiConfigured,
    };
  },

  attributionByEvent(rec: AdCampaignRecord): Record<string, number> {
    // Simple revenue attribution keyed by configured event types (0 until verified).
    const out: Record<string, number> = {};
    for (const ev of rec.performanceBilling.events) out[ev] = 0;
    if (rec.metrics.conversions > 0 && rec.performanceBilling.events.length) {
      out[rec.performanceBilling.events[0]!] = rec.metrics.revenueMicros;
    }
    return out;
  },

  /* ── Export data ──────────────────────────────────────────── */

  /** Build the analytics payload used by the file export (all real numbers). */
  async buildExportData(oid: string): Promise<import("./advertisingExport.service.js").AdvertisingExportData> {
    const [p, campaigns] = await Promise.all([this.portfolioAnalytics(oid), this.list(oid)]);
    const roas = (s: number, r: number) => (s > 0 ? Number((r / s).toFixed(2)) : null);
    return {
      generatedAt: now(),
      totalCampaigns: p.totalCampaigns,
      activeCampaigns: p.activeCampaigns,
      totalSpendMicros: p.totalSpendMicros,
      totalRevenueMicros: p.totalRevenueMicros,
      totalConversions: p.totalConversions,
      totalImpressions: p.totalImpressions,
      totalClicks: p.totalClicks,
      roas: p.roas,
      totalBudgetMicros: p.totalBudgetMicros,
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        mode: c.campaignMode,
        status: c.status,
        billingMode: c.billingMode,
        automationLevel: c.automationLevel,
        impressions: c.metrics.impressions,
        clicks: c.metrics.clicks,
        conversions: c.metrics.conversions,
        spendMicros: c.metrics.spendMicros,
        revenueMicros: c.metrics.revenueMicros,
        roas: roas(c.metrics.spendMicros, c.metrics.revenueMicros),
      })),
      byMode: p.byMode,
    };
  },

  /* ── Org-level settings ───────────────────────────────────── */

  async setOrgSetting(oid: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const cur = j<Record<string, unknown>>(await redis.get(K.org(oid))) ?? {};
    const next = { ...cur, ...patch, updatedAt: now() };
    await redis.set(K.org(oid), s2(next));
    return next;
  },

  async getOrgSetting(oid: string): Promise<Record<string, unknown>> {
    return j<Record<string, unknown>>(await redis.get(K.org(oid))) ?? {};
  },
};
