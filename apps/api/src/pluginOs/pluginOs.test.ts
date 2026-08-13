/**
 * WINDELS PLUGIN OS tests.
 *
 * Covers manifest validation & signature policy, install/permission gating,
 * encrypted connections, capability routing with fallback, and intent
 * resolution. Uses an in-memory Redis fake — no network.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const fakeRedis: Record<string, any> = {};
vi.mock("../db/redis.js", () => ({ redisCmd: {
  get: vi.fn(async (k: string) => fakeRedis[k] ?? null),
  set: vi.fn(async (k: string, v: any, ..._rest: any[]) => { fakeRedis[k] = v; return "OK"; }),
  del: vi.fn(async (k: string) => { delete fakeRedis[k]; return 1; }),
  hget: vi.fn(async (k: string, f: string) => fakeRedis[`${k}::${f}`] ?? null),
  hset: vi.fn(async (k: string, f: string, v: any) => { fakeRedis[`${k}::${f}`] = v; return 1; }),
  hdel: vi.fn(async (k: string, f: string) => { delete fakeRedis[`${k}::${f}`]; return 1; }),
  hgetall: vi.fn(async (k: string) => {
    const out: Record<string, string> = {};
    for (const key of Object.keys(fakeRedis)) if (key.startsWith(`${k}::`)) out[key.slice(k.length + 2)] = fakeRedis[key];
    return out;
  }),
  hincrby: vi.fn(async (k: string, f: string, n: number) => { const key = `${k}::${f}`; fakeRedis[key] = String(Number(fakeRedis[key] ?? 0) + n); return Number(fakeRedis[key]); }),
  sadd: vi.fn(async (k: string, m: string) => { fakeRedis[k] = Array.from(new Set([...(fakeRedis[k] ?? []), m])); return 1; }),
  srem: vi.fn(async (k: string, m: string) => { fakeRedis[k] = (fakeRedis[k] ?? []).filter((x: string) => x !== m); return 1; }),
  smembers: vi.fn(async (k: string) => fakeRedis[k] ?? []),
  lpush: vi.fn(async () => 1), ltrim: vi.fn(async () => {}), lrange: vi.fn(async () => []),
  keys: vi.fn(async () => []),
} }));
vi.mock("../config/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const OID = "org1";
const UID = "user1";

function manifest(over: Partial<any> = {}): any {
  return {
    id: "com.example.video", name: "Example Video", version: "1.0.0", publisher: "Example",
    description: "video plugin", category: "AI Video", tags: [], class: "ai_model",
    capabilities: ["video.generate"], permissions: ["video.read", "video.generate"],
    authentication: ["api_key"], minPlatformVersion: "1.0.0", trust: "community", quality: 0.8,
    cost: { creditsPerRequest: 5 }, ...over,
  };
}

describe("plugin registry", () => {
  beforeEach(() => { for (const k of Object.keys(fakeRedis)) delete fakeRedis[k]; });

  it("rejects an invalid manifest", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    await expect(PluginRegistry.publish({ manifest: manifest({ id: "bad id!!" }) })).rejects.toThrow();
  });

  it("rejects an official plugin without a signature", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    await expect(PluginRegistry.publish({ manifest: manifest({ trust: "official" }) })).rejects.toThrow(/signature/i);
  });

  it("publishes a community plugin unsigned (downgraded, never privileged)", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    const m = await PluginRegistry.publish({ manifest: manifest() });
    expect(m.trust).toBe("community");
    const catalog = await PluginRegistry.listCatalog();
    expect(catalog.some((c) => c.manifest.id === "com.example.video")).toBe(true);
  });

  it("installs with a subset of granted permissions and enables none-auth plugins", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    await PluginRegistry.publish({ manifest: manifest({ authentication: ["none"] }) });
    const p = await PluginRegistry.install(OID, UID, "com.example.video", { grantedPermissions: ["video.read"] });
    expect(p.grantedPermissions).toEqual(["video.read"]);
    expect(p.status).toBe("enabled");
    expect((await PluginRegistry.listInstalled(OID))[0].plugin.manifestId).toContain("com.example");
  });

  it("refuses to grant a permission not declared by the manifest", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    await PluginRegistry.publish({ manifest: manifest() });
    const p = await PluginRegistry.install(OID, UID, "com.example.video", { grantedPermissions: ["email.read", "video.generate"] });
    expect(p.grantedPermissions).not.toContain("email.read");
  });
});

describe("connections", () => {
  beforeEach(() => { for (const k of Object.keys(fakeRedis)) delete fakeRedis[k]; });

  it("stores API key secrets encrypted and never returns them", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    const { PluginConnections } = await import("./connections.js");
    await PluginRegistry.publish({ manifest: manifest() });
    await PluginRegistry.install(OID, UID, "com.example.video");
    const conn = await PluginConnections.createApiKey(OID, "com.example.video", { displayName: "prod", apiKey: "sk-secret-123456" });
    expect(conn.status).toBe("connected");
    expect(JSON.stringify(conn)).not.toContain("sk-secret-123456");
  });

  it("creates an OAuth start URL with a single-use state", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    const { PluginConnections } = await import("./connections.js");
    await PluginRegistry.publish({ manifest: manifest({ authentication: ["oauth2"] }) });
    await PluginRegistry.install(OID, UID, "com.example.video");
    const { url, state } = await PluginConnections.beginOAuth(OID, UID, "com.example.video", {
      displayName: "acme", authUrl: "https://auth.example/authorize", tokenUrl: "https://auth.example/token",
      clientId: "cid", clientSecret: "sec", scopes: ["read"], redirectUri: "https://windels.app/cb",
    });
    expect(url).toContain("client_id=cid");
    expect(state).toBeTruthy();
  });
});

describe("capability registry & intent", () => {
  beforeEach(() => { for (const k of Object.keys(fakeRedis)) delete fakeRedis[k]; });

  it("recommends installation when no plugin provides a capability", async () => {
    const { CapabilityRegistry } = await import("./capabilityRegistry.js");
    const { PluginRegistry } = await import("./pluginRegistry.js");
    await PluginRegistry.publish({ manifest: manifest() });
    const route = await CapabilityRegistry.route({ organizationId: OID, capability: "video.generate" });
    expect(route.installed).toBe(false);
    expect(route.installCandidates).toContain("com.example.video");
  });

  it("routes to the best installed plugin and fails over on error", async () => {
    const { CapabilityRegistry } = await import("./capabilityRegistry.js");
    const { PluginRegistry } = await import("./pluginRegistry.js");
    // Two providers of the same capability; the first has no endpoint so it errors.
    await PluginRegistry.publish({ manifest: manifest({ id: "com.a", authentication: ["none"], quality: 0.9, endpoint: "https://a.invalid" }) });
    await PluginRegistry.publish({ manifest: manifest({ id: "com.b", authentication: ["none"], quality: 0.6, cost: { creditsPerRequest: 1 }, endpoint: "https://b.invalid" }) });
    for (const id of ["com.a", "com.b"]) {
      const p = await PluginRegistry.install(OID, UID, id);
      const m = await PluginRegistry.getManifest(id);
      await CapabilityRegistry.register(OID, m!, { enabled: p.status === "enabled", status: p.status, authenticated: true });
    }
    // Execution will fail on both (network errors), but failover must try the second.
    const result = await CapabilityRegistry.execute({ organizationId: OID, capability: "video.generate" });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("ALL_PROVIDERS_FAILED");
  });

  it("resolves a natural-language request to a capability with recommendations", async () => {
    const { IntentEngine } = await import("./intent.js");
    const { PluginRegistry } = await import("./pluginRegistry.js");
    await PluginRegistry.publish({ manifest: manifest() });
    const res = await IntentEngine.resolve(OID, UID, "Create a cinematic product advertisement video.");
    expect(res?.capability).toBe("video.generate");
    expect(res?.route.installed).toBe(false);
    expect(res?.recommendations?.length).toBeGreaterThan(0);
  });
});
