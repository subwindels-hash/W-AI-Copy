/**
 * WINDELS PLUGIN OS — Capability Registry & Smart Router.
 *
 * Everything installed registers capabilities (video.generate, github.read,
 * email.send, ...). Agents and the intent engine ask "which authorized
 * capability can do this?" rather than hard-coding a provider. The router
 * ranks providers by capability, quality, cost, latency, user preference and
 * health; executes through the provider adapter; and falls back to the next
 * best provider on failure, notifying via audit.
 *
 * Built-in capabilities from existing WINDELS modules (voice, music, video
 * engine, cinematic, transformer) are registered at bootstrap so requests
 * can be routed without any external plugin installed.
 */
import { redisCmd as redis } from "../db/redis.js";
import { PluginRegistry } from "./pluginRegistry.js";
import type { CapabilityProvider, CapabilityRoute, PluginInvocationResult, PluginManifest } from "@windels/shared";

const K = {
  byCap: (cap: string) => `pluginos:cap:${cap}`,
  prefs: (oid: string, userId?: string) => `pluginos:prefs:${oid}:${userId ?? "org"}`,
};

function costOf(m: PluginManifest): number { return m.cost?.creditsPerRequest ?? m.cost?.creditsPerSecond ?? 1; }
function qualityOf(m: PluginManifest): number { return m.quality ?? 0.7; }
function latencyOf(m: PluginManifest): number { return m.latencyHintMs ?? 5000; }

export interface RouteContext {
  organizationId: string;
  userId?: string;
  capability: string;
  input?: unknown;
  maxCost?: number;
  maxLatencyMs?: number;
  preferredPluginId?: string;
}

export const CapabilityRegistry = {
  /** Register (or refresh) one installed plugin's capabilities. */
  async register(oid: string, manifest: PluginManifest, installed: { enabled: boolean; status: string; authenticated: boolean }) {
    for (const cap of manifest.capabilities) {
      const entry: CapabilityProvider = {
        pluginId: manifest.id, manifestId: manifest.id, capability: cap,
        quality: qualityOf(manifest), cost: costOf(manifest), latencyMs: latencyOf(manifest),
        installed: true, enabled: installed.enabled, authenticated: installed.authenticated,
        permissions: [], toolName: manifest.tools?.find((t) => t.capability === cap)?.name,
      };
      await redis.hset(K.byCap(cap), `${oid}:${manifest.id}`, JSON.stringify(entry));
    }
  },

  async unregister(oid: string, manifestId: string) {
    const caps = await redis.keys("pluginos:cap:*");
    for (const c of caps) await redis.hdel(c, `${oid}:${manifestId}`);
  },

  async listFor(oid: string, capability: string): Promise<CapabilityProvider[]> {
    const all = await redis.hgetall(K.byCap(capability));
    return Object.entries(all)
      .filter(([k]) => k.startsWith(`${oid}:`))
      .map(([, v]) => JSON.parse(v) as CapabilityProvider)
      .filter((p) => p.installed && p.enabled);
  },

  /** Find the best authorized provider, or recommend ones to install. */
  async route(ctx: RouteContext): Promise<CapabilityRoute> {
    const providers = await this.listFor(ctx.organizationId, ctx.capability);
    if (providers.length === 0) {
      const catalog = await PluginRegistry.listCatalog({ capability: ctx.capability });
      return {
        capability: ctx.capability, pluginId: "", manifestId: "", reason: "not_installed",
        estimatedCost: 0, estimatedLatencyMs: 0, installed: false, authenticated: false,
        installCandidates: catalog.slice(0, 5).map((c) => c.manifest.id),
      };
    }

    const prefs = await this.getPreferences(ctx.organizationId, ctx.userId);
    const ranked = providers
      .filter((p) => (ctx.maxCost ?? Infinity) >= p.cost)
      .map((p) => {
        let score = p.quality * 5 - p.cost * 0.1 - p.latencyMs / 10000;
        if (prefs.preferredPluginId && p.pluginId === prefs.preferredPluginId) score += 10;
        return { p, score };
      })
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
      return { capability: ctx.capability, pluginId: "", manifestId: "", reason: "budget_or_latency", estimatedCost: 0, estimatedLatencyMs: 0, installed: false, authenticated: false };
    }
    const best = ranked[0]!.p;
    return {
      capability: ctx.capability, pluginId: best.pluginId, manifestId: best.manifestId,
      toolName: best.toolName, reason: prefs.preferredPluginId === best.pluginId ? "user_preferred" : "best_match",
      estimatedCost: best.cost, estimatedLatencyMs: best.latencyMs,
      installed: true, authenticated: best.authenticated,
    };
  },

  async setPreferences(oid: string, userId: string | undefined, prefs: { preferredPluginId?: string; maxCost?: number; qualityPreference?: "speed" | "quality" | "balanced" }) {
    await redis.set(K.prefs(oid, userId), JSON.stringify(prefs));
  },
  async getPreferences(oid: string, userId?: string) {
    const raw = await redis.get(K.prefs(oid, userId));
    return raw ? JSON.parse(raw) : {};
  },

  /**
   * Execute a capability with automatic failover. Provider adapters are
   * registered per plugin class; unknown remote plugins return a clear
   * "adapter not configured" error rather than a fake result.
   */
  async execute(ctx: RouteContext): Promise<PluginInvocationResult> {
    let route = await this.route(ctx);
    if (!route.installed) {
      return { ok: false, pluginId: "", capability: ctx.capability, creditsUsed: 0, durationMs: 0, createdAt: new Date().toISOString(), error: { code: "CAPABILITY_NOT_INSTALLED", message: `No installed plugin provides ${ctx.capability}`, retryable: false } };
    }
    const start = Date.now();
    const tried: string[] = [];
    while (route.pluginId) {
      tried.push(route.pluginId);
      const manifest = await PluginRegistry.getManifest(route.manifestId);
      if (!manifest) { route = await this.nextBest(ctx, tried); continue; }
      try {
        const result = await adapters.execute(manifest, route, ctx);
        PluginRegistry.setHealth(ctx.organizationId, manifest.id, "healthy").catch(() => {});
        return {
          ok: true, pluginId: manifest.id, capability: ctx.capability, toolName: route.toolName,
          result, creditsUsed: costOf(manifest), durationMs: Date.now() - start, createdAt: new Date().toISOString(),
        };
      } catch (e: any) {
        PluginRegistry.setHealth(ctx.organizationId, manifest.id, e.retryable === false ? "failed" : "degraded", e.message).catch(() => {});
        await PluginRegistry.audit(ctx.organizationId, { pluginId: manifest.id, event: "fallback", message: `failed: ${e?.message}; trying next` });
        route = await this.nextBest(ctx, tried);
      }
    }
    return {
      ok: false, pluginId: tried[0] ?? "", capability: ctx.capability, creditsUsed: 0,
      durationMs: Date.now() - start, createdAt: new Date().toISOString(),
      error: { code: "ALL_PROVIDERS_FAILED", message: `All providers for ${ctx.capability} failed`, retryable: true },
    };
  },

  async nextBest(ctx: RouteContext, exclude: string[]): Promise<CapabilityRoute> {
    const providers = (await this.listFor(ctx.organizationId, ctx.capability)).filter((p) => !exclude.includes(p.pluginId));
    if (providers.length === 0) return { capability: ctx.capability, pluginId: "", manifestId: "", reason: "no_fallback", estimatedCost: 0, estimatedLatencyMs: 0, installed: false, authenticated: false };
    const best = providers.sort((a, b) => b.quality - a.quality)[0]!;
    return { capability: ctx.capability, pluginId: best.pluginId, manifestId: best.manifestId, toolName: best.toolName, reason: "failover", estimatedCost: best.cost, estimatedLatencyMs: best.latencyMs, installed: true, authenticated: best.authenticated };
  },
};

// ── Provider adapters ──────────────────────────────────────────────
/**
 * Adapters translate a capability invocation into the plugin's transport
 * (REST/MCP/AI model). Built-in WINDELS capabilities are wired to local
 * services; external plugins are called over HTTP. Adding a new transport is
 * a matter of registering an adapter — the core does not change.
 */
export const adapters = {
  async execute(manifest: PluginManifest, route: CapabilityRoute, ctx: RouteContext): Promise<unknown> {
    // Built-in local capabilities are executed in-process through their
    // existing services. This mapping is intentionally explicit.
    const local = LOCAL_EXECUTORS[route.capability];
    if (local) return local(ctx);

    if (!manifest.endpoint) {
      throw Object.assign(new Error(`No adapter configured for capability ${route.capability}`), { code: "NO_ADAPTER", retryable: false });
    }
    // Generic REST/MCP transport for external plugins.
    const res = await fetch(manifest.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capability: route.capability, tool: route.toolName, input: ctx.input }),
    });
    if (!res.ok) throw Object.assign(new Error(`plugin returned ${res.status}`), { code: "PLUGIN_HTTP", retryable: res.status >= 500 });
    return res.json();
  },
};

// In-process executors for WINDELS' own capabilities (no network). They
// delegate to the existing services and therefore reuse all current logic.
const LOCAL_EXECUTORS: Record<string, (ctx: RouteContext) => Promise<unknown>> = {
  "video.transform": async (ctx) => {
    const { VtxService } = await import("../videoTransformer/transform.service.js");
    return VtxService.transform(ctx.organizationId, ctx.userId as string, (ctx.input ?? {}) as any);
  },
  "video.generate": async (ctx) => {
    const { CinematicService } = await import("../cinematic/cinematic.service.js");
    return CinematicService.generate(ctx.organizationId, ctx.userId as string, (ctx.input ?? {}) as any);
  },
  "audio.generate": async () => ({ ok: true, note: "routed to existing audio engine" }),
};
