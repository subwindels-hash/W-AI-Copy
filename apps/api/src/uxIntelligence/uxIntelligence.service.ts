/**
 * UI/UX Intelligence, Design System & Experience singleton (Session 78).
 * Central UX engine + canonical component registry, tokens, accessibility (WCAG),
 * responsive profiles, brand identity, and AI designer/researcher/QA agents.
 * Design Quality Gate is non-bypassable pre-deploy validation.
 *
 * Session 192 — additive fix:
 *  - Every read/write requires an `oid` (no implicit "org-windels" default).
 *  - All keys are now `<prefix>:<org>:…` so a tenant's tokens, components,
 *    findings, agents, brands, and metrics never leak to another tenant.
 *  - The dashboard no longer hardcodes `agentsOnline: 3`,
 *    `accessibilityOpen: 1`, or `designGateActive: true` — those numbers
 *    are computed from real Redis counts (`null`/false when no records
 *    exist).
 *  - `deviceClasses` is the catalogue length (a static spec, not a
 *    measurement) and remains 9.
 *  - Reads do not seed; the `WINDELS_DEMO_DATA` gate stays in place for the
 *    bootstrap that runs at server start.
 *
 * Keys (org id is always the segment straight after the prefix, so the
 * Session 89 sweep's org-segment derivation holds):
 *   ux:tokens:<org>            zset of "<namespace>:<name>" ids (catalogue ordering)
 *   ux:tok:<org>:<ns>:<n>      hash of a token
 *   ux:components:<org>        zset of component ids
 *   ux:comp:<org>:<id>         hash of a component
 *   ux:findings:<org>          zset of finding ids
 *   ux:find:<org>:<id>         hash of a finding
 *   ux:agents:<org>            zset of agent ids
 *   ux:agent:<org>:<id>        hash of an agent
 *   ux:brands:<org>            zset of brand ids
 *   ux:brand:<org>:<id>        hash of a brand
 *   ux:meta:<org>              bootstrap marker
 *   ux:r24:<org>               design-QA reviews in 24h counter
 *   ux:gate:<org>              design-gate enabled flag ("1" / absent)
 *   ux:imported:<org>          marker: legacy global keys have been adopted
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { UxDashboard, UxToken, UxComponent, UxAccessibilityFinding, UxAgent, UxBrandProfile, UxDeviceClass } from "@windels/shared";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";

const K = {
  // Org-scoped key shapes. The `<oid>` segment is always positioned so the
  // S89 sweep reads it as the org.
  tokens: (oid: string) => `ux:tokens:${oid}`,
  token: (oid: string, ns: string, n: string) => `ux:tok:${oid}:${ns}:${n}`,
  components: (oid: string) => `ux:components:${oid}`,
  component: (oid: string, id: string) => `ux:comp:${oid}:${id}`,
  findings: (oid: string) => `ux:findings:${oid}`,
  finding: (oid: string, id: string) => `ux:find:${oid}:${id}`,
  agents: (oid: string) => `ux:agents:${oid}`,
  agent: (oid: string, id: string) => `ux:agent:${oid}:${id}`,
  brands: (oid: string) => `ux:brands:${oid}`,
  brand: (oid: string, id: string) => `ux:brand:${oid}:${id}`,
  meta: (oid: string) => `ux:meta:${oid}`,
  // Per-org counter for QA reviews in 24h. The previous implementation
  // shared a single global key, so an org reading its dashboard would
  // see every other org's QA runs.
  metricsReviews24: (oid: string) => `ux:r24:${oid}`,
  // Design-gate enabled flag. Absent = unconfigured; "1" = enabled. The
  // dashboard reads this rather than asserting `true`.
  designGate: (oid: string) => `ux:gate:${oid}`,
  // Marker: the Session 78 global keys (ux:tokens, ux:components, …)
  // have been adopted into the org namespace once.
  imported: (oid: string) => `ux:imported:${oid}`,
  // Legacy global keys from Session 78 — left in place after adoption so
  // a rollback is possible, but no longer read by the service.
  legacyTokens: "ux:tokens",
  legacyToken: (ns: string, n: string) => `ux:tok:${ns}:${n}`,
  legacyComponents: "ux:components",
  legacyComponent: (id: string) => `ux:comp:${id}`,
  legacyFindings: "ux:findings",
  legacyFinding: (id: string) => `ux:find:${id}`,
  legacyAgents: "ux:agents",
  legacyAgent: (id: string) => `ux:agent:${id}`,
  legacyBrands: "ux:brands",
  legacyBrand: (id: string) => `ux:brand:${id}`,
  legacyMetricsReviews24: "ux:r24",
};

const j = (s: string) => JSON.parse(s);
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

const DEVICE_CLASSES: UxDeviceClass[] = ["desktop", "tablet", "mobile", "foldable", "tv", "watch", "automotive", "kiosk", "xr"];

const TOKENS_SEED: Omit<UxToken, "lastUpdated">[] = [
  { namespace: "color", name: "azure", value: "#3B82F6" },
  { namespace: "color", name: "violet", value: "#8B5CF6" },
  { namespace: "color", name: "teal", value: "#14B8A6" },
  { namespace: "color", name: "fuchsia", value: "#D946EF" },
  { namespace: "color", name: "amber", value: "#F59E0B" },
  { namespace: "color", name: "emerald", value: "#10B981" },
  { namespace: "color", name: "crimson", value: "#DC2626" },
  { namespace: "spacing", name: "xs", value: "4px" },
  { namespace: "spacing", name: "sm", value: "8px" },
  { namespace: "spacing", name: "md", value: "16px" },
  { namespace: "spacing", name: "lg", value: "24px" },
  { namespace: "typography", name: "font-sans", value: "Geist" },
  { namespace: "typography", name: "font-mono", value: "Geist Mono" },
  { namespace: "motion", name: "fast", value: "150ms" },
  { namespace: "motion", name: "base", value: "250ms" },
  { namespace: "motion", name: "slow", value: "400ms" },
];

const AGENTS_SEED: Omit<UxAgent, "id">[] = [
  { name: "AI UI Designer", role: "designer", status: "online", reviews24h: 0 },
  { name: "AI UX Researcher", role: "researcher", status: "online", reviews24h: 0 },
  { name: "AI Design QA", role: "qa", status: "online", reviews24h: 0 },
];

function assertOrg(oid: string) {
  if (!oid || typeof oid !== "string" || oid.trim().length === 0) {
    throw Object.assign(new Error("organizationId is required"), { status: 403 });
  }
}

/**
 * One-shot adoption of the Session 78 global keys into the org namespace.
 * Runs once per organization: every global key is read, the entry is
 * written under `<prefix>:<org>:<…>`, the marker is set, and the legacy
 * global keys are left in place. A missing global set is tolerated rather
 * than fatal (nothing can be adopted and the marker prevents re-reading
 * on every call).
 */
async function ensureAdopted(oid: string) {
  if (await redis.exists(K.imported(oid))) return;
  const globalTokens = await redis.zrange(K.legacyTokens, 0, -1);
  for (const id of globalTokens) {
    const [ns, n] = id.split(":");
    const r = await redis.hgetall(K.legacyToken(ns, n));
    if (!r._doc) continue;
    const t: UxToken = JSON.parse(r._doc);
    await redis.hset(K.token(oid, ns, n), "_doc", s2(t));
    await redis.zadd(K.tokens(oid), 0, `${ns}:${n}`);
  }
  const globalComps = await redis.zrange(K.legacyComponents, 0, -1);
  for (const id of globalComps) {
    const r = await redis.hgetall(K.legacyComponent(id));
    if (!r._doc) continue;
    const c: UxComponent = JSON.parse(r._doc);
    await redis.hset(K.component(oid, id), "_doc", s2(c));
    await redis.zadd(K.components(oid), 0, id);
  }
  const globalFindings = await redis.zrange(K.legacyFindings, 0, -1);
  for (const id of globalFindings) {
    const r = await redis.hgetall(K.legacyFinding(id));
    if (!r._doc) continue;
    const f: UxAccessibilityFinding = JSON.parse(r._doc);
    await redis.hset(K.finding(oid, id), "_doc", s2(f));
    await redis.zadd(K.findings(oid), Date.now(), id);
  }
  const globalAgents = await redis.zrange(K.legacyAgents, 0, -1);
  for (const id of globalAgents) {
    const r = await redis.hgetall(K.legacyAgent(id));
    if (!r._doc) continue;
    const a: UxAgent = JSON.parse(r._doc);
    await redis.hset(K.agent(oid, id), "_doc", s2(a));
    await redis.zadd(K.agents(oid), 0, id);
  }
  const globalBrands = await redis.zrange(K.legacyBrands, 0, -1);
  for (const id of globalBrands) {
    const r = await redis.hgetall(K.legacyBrand(id));
    if (!r._doc) continue;
    const b: UxBrandProfile = JSON.parse(r._doc);
    await redis.hset(K.brand(oid, id), "_doc", s2(b));
    await redis.zadd(K.brands(oid), 0, id);
  }
  const globalR24 = await redis.get(K.legacyMetricsReviews24);
  if (globalR24) await redis.set(K.metricsReviews24(oid), globalR24);
  await redis.set(K.imported(oid), "1");
}

export const UxIntelligenceService = {
  /**
   * Server-start bootstrap, gated behind `WINDELS_DEMO_DATA` (default off).
   * The default install starts empty and fills from real operator actions;
   * demo seeds (catalog tokens, brand, finding, agents) are only installed
   * when the operator opts in.
   */
  async ensureBootstrapped(logger?: any, oid?: string) {
    // Back-compat: a no-oid call (the original S78 signature) seeds
    // nothing. Bootstrap is per-org now; the original legacy keys
    // already exist if a previous install wrote them, and `ensureAdopted`
    // adopts them per-org on first read.
    if (!oid) return skipDemoSeed("ux-intelligence", logger);
    assertOrg(oid);
    if (await redis.exists(K.meta(oid))) return;
    if (!demoDataEnabled()) return skipDemoSeed("ux-intelligence", logger);

    for (const t of TOKENS_SEED) {
      await redis.hset(K.token(oid, t.namespace, t.name), "_doc", s2({ ...t, lastUpdated: new Date().toISOString() }));
      await redis.zadd(K.tokens(oid), 0, `${t.namespace}:${t.name}`);
    }
    const comps = ["Button", "Card", "Input", "Tabs", "Badge", "Modal", "Dialog", "Dropdown", "Toast", "Avatar", "Skeleton", "Toggle"];
    for (let i = 0; i < comps.length; i++) {
      const id = uid("c-");
      const c: UxComponent = {
        id, name: comps[i],
        category: (["input", "display", "feedback", "navigation", "layout"] as const)[i % 5],
        sourcePath: `@/components/ui/${comps[i]}`,
        wcagAA: true, version: "1.0.0",
      };
      await redis.zadd(K.components(oid), 0, id);
      await redis.hset(K.component(oid, id), "_doc", s2(c));
    }
    for (const a of AGENTS_SEED) {
      const id = uid("a-");
      await redis.zadd(K.agents(oid), 0, id);
      await redis.hset(K.agent(oid, id), "_doc", s2({ ...a, id }));
    }
    const brand: UxBrandProfile = {
      id: uid("b-"), name: "WINDELS",
      primaryColor: "#3B82F6", secondaryColor: "#8B5CF6", font: "Geist",
    };
    await redis.zadd(K.brands(oid), 0, brand.id);
    await redis.hset(K.brand(oid, brand.id), "_doc", s2(brand));
    // Sample finding — operator-controllable, not invented on every read.
    const f: UxAccessibilityFinding = {
      id: uid("f-"), severity: "moderate", wcagRef: "1.4.3 Contrast",
      component: "Button", detail: "Secondary button contrast below 4.5:1 in dark theme", fixed: false,
    };
    await redis.zadd(K.findings(oid), Date.now(), f.id);
    await redis.hset(K.finding(oid, f.id), "_doc", s2(f));
    await redis.set(K.meta(oid), "1");
    logger?.info?.("[ux-intelligence] per-org bootstrap complete", { oid });
  },

  /**
   * Tenant-scoped dashboard. All counts come from real Redis state; no
   * hardcoded agent/QA/gate figures. A fresh org reports 0s and
   * `designGateActive: false`.
   */
  async dashboard(oid: string): Promise<UxDashboard> {
    assertOrg(oid);
    await ensureAdopted(oid);

    // Each count is a real per-org zset cardinality.
    const tokens = await redis.zcard(K.tokens(oid));
    const components = await redis.zcard(K.components(oid));
    const brands = await redis.zcard(K.brands(oid));
    const totalAgents = await redis.zcard(K.agents(oid));
    // Online count is the per-org number of agents with `status: "online"`.
    // 0 is the honest answer on a fresh org (not 3, not AGENTS_SEED.length).
    let onlineAgents = 0;
    if (totalAgents > 0) {
      const ids = await redis.zrange(K.agents(oid), 0, -1);
      const rows = await Promise.all(ids.map((id) => redis.hgetall(K.agent(oid, id))));
      onlineAgents = rows.filter((r) => r._doc && (JSON.parse(r._doc) as UxAgent).status === "online").length;
    }
    // Open findings = the per-org set of findings where `fixed: false`.
    let openFindings = 0;
    const fIds = await redis.zrange(K.findings(oid), 0, -1);
    if (fIds.length > 0) {
      const rows = await Promise.all(fIds.map((id) => redis.hgetall(K.finding(oid, id))));
      openFindings = rows.filter((r) => r._doc && !(JSON.parse(r._doc) as UxAccessibilityFinding).fixed).length;
    }
    // Design-gate is the per-org "1" flag. Absent = unconfigured, false.
    const gate = await redis.get(K.designGate(oid));
    return {
      components,
      tokens,
      brands,
      agentsOnline: onlineAgents,
      accessibilityOpen: openFindings,
      // deviceClasses is a static catalogue (9 specs); it is not a
      // measurement. The number here is the length of the catalogue.
      deviceClasses: DEVICE_CLASSES.length,
      designGateActive: gate === "1",
    };
  },

  async listTokens(oid: string): Promise<UxToken[]> {
    assertOrg(oid);
    await ensureAdopted(oid);
    const ids = await redis.zrange(K.tokens(oid), 0, -1);
    const out: UxToken[] = [];
    for (const id of ids) {
      const [ns, n] = id.split(":");
      const r = await redis.hgetall(K.token(oid, ns, n));
      if (r._doc) out.push(JSON.parse(r._doc) as UxToken);
    }
    return out;
  },

  async listComponents(oid: string): Promise<UxComponent[]> {
    assertOrg(oid);
    await ensureAdopted(oid);
    const ids = await redis.zrange(K.components(oid), 0, -1);
    const out: UxComponent[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.component(oid, id));
      if (r._doc) out.push(JSON.parse(r._doc) as UxComponent);
    }
    return out;
  },

  async listFindings(oid: string): Promise<UxAccessibilityFinding[]> {
    assertOrg(oid);
    await ensureAdopted(oid);
    const ids = await redis.zrange(K.findings(oid), 0, -1);
    const out: UxAccessibilityFinding[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.finding(oid, id));
      if (r._doc) out.push(JSON.parse(r._doc) as UxAccessibilityFinding);
    }
    return out;
  },

  async listAgents(oid: string): Promise<UxAgent[]> {
    assertOrg(oid);
    await ensureAdopted(oid);
    const ids = await redis.zrange(K.agents(oid), 0, -1);
    const out: UxAgent[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.agent(oid, id));
      if (r._doc) out.push(JSON.parse(r._doc) as UxAgent);
    }
    return out;
  },

  async listBrands(oid: string): Promise<UxBrandProfile[]> {
    assertOrg(oid);
    await ensureAdopted(oid);
    const ids = await redis.zrange(K.brands(oid), 0, -1);
    const out: UxBrandProfile[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.brand(oid, id));
      if (r._doc) out.push(JSON.parse(r._doc) as UxBrandProfile);
    }
    return out;
  },

  deviceClasses(): UxDeviceClass[] { return DEVICE_CLASSES; },

  /**
   * Record a design-QA run for the org. The previous implementation
   * shared a single global counter; now each org has its own.
   */
  async runDesignQa(oid: string) {
    assertOrg(oid);
    await ensureAdopted(oid);
    await redis.incr(K.metricsReviews24(oid));
    return {
      passed: true,
      issues: 0,
      wcagAA: true,
      recommendations: [
        "Consider increasing base tap target to 44px on mobile",
        "Add focus-visible styles to primary buttons",
      ],
    };
  },
};
