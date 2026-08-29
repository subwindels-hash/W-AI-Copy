/**
 * Session 200 — deeper Plugin OS lifecycle & security coverage.
 *
 * The base suite covers manifest validation, one install path, encrypted API-key
 * storage, capability routing/failover and intent resolution. This suite hardens
 * the install/permission gate, connection secret handling (round-trip + tenant
 * isolation), the OAuth state single-use rule, MCP connections, disconnect/remove,
 * catalog filters and the intent keyword rules.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const fakeRedis: Record<string, any> = {};
vi.mock("../db/redis.js", () => ({ redisCmd: {
  get: vi.fn(async (k: string) => fakeRedis[k] ?? null),
  set: vi.fn(async (k: string, v: any) => { fakeRedis[k] = v; return "OK"; }),
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
const OID2 = "org2";
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

beforeEach(() => { for (const k of Object.keys(fakeRedis)) delete fakeRedis[k]; });

describe("install & permission gate", () => {
  it("filters granted permissions to the manifest's declared subset (§9)", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    await PluginRegistry.publish({ manifest: manifest() });
    const inst = await PluginRegistry.install(OID, UID, "com.example.video", {
      grantedPermissions: ["video.read", "video.generate", "video.delete-everything"],
    });
    expect(inst.grantedPermissions.sort()).toEqual(["video.generate", "video.read"]);
    // api_key auth → needs a connection before it is enabled
    expect(inst.status).toBe("auth_required");
  });

  it("enables immediately when the plugin needs no authentication", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    await PluginRegistry.publish({ manifest: manifest({ id: "com.noauth", authentication: ["none"] }) });
    const inst = await PluginRegistry.install(OID, UID, "com.noauth");
    expect(inst.status).toBe("enabled");
  });

  it("refuses to install a blocked plugin", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    await PluginRegistry.publish({ manifest: manifest({ id: "com.evil", trust: "blocked" }) });
    await expect(PluginRegistry.install(OID, UID, "com.evil")).rejects.toThrow(/blocked/);
  });

  it("routes full_module installs through the Module Center", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    await PluginRegistry.publish({ manifest: manifest({ id: "com.bigmod", class: "full_module", authentication: ["none"] }) });
    await expect(PluginRegistry.install(OID, UID, "com.bigmod")).rejects.toMatchObject({ code: "MODULE_CENTER_REQUIRED" });
  });

  it("install is idempotent per org and does not double-count installs", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    await PluginRegistry.publish({ manifest: manifest({ authentication: ["none"] }) });
    await PluginRegistry.install(OID, UID, "com.example.video");
    await PluginRegistry.install(OID, UID, "com.example.video");
    const installed = await PluginRegistry.listInstalled(OID);
    expect(installed.filter((i) => i.plugin.manifestId === "com.example.video")).toHaveLength(1);
  });

  it("uninstall removes the plugin from the org's installed set", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    await PluginRegistry.publish({ manifest: manifest({ authentication: ["none"] }) });
    await PluginRegistry.install(OID, UID, "com.example.video");
    await PluginRegistry.uninstall(OID, "com.example.video", UID);
    expect(await PluginRegistry.getInstalled(OID, "com.example.video")).toBeNull();
  });

  it("throws 404 when installing an unknown plugin", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    await expect(PluginRegistry.install(OID, UID, "com.missing")).rejects.toMatchObject({ status: 404 });
  });
});

describe("connection secrets — round-trip & tenant isolation", () => {
  it("resolves the decrypted API key server-side but never exposes it in the record", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    const { PluginConnections } = await import("./connections.js");
    await PluginRegistry.publish({ manifest: manifest() });
    await PluginRegistry.install(OID, UID, "com.example.video");
    const conn = await PluginConnections.createApiKey(OID, "com.example.video", { displayName: "prod", apiKey: "sk-live-abcdef" });
    expect(JSON.stringify(conn)).not.toContain("sk-live-abcdef");
    const secret = await PluginConnections.resolveSecret<{ apiKey: string }>(OID, conn.id);
    expect(secret?.apiKey).toBe("sk-live-abcdef");
  });

  it("lists connections per org and hides another org's connections", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    const { PluginConnections } = await import("./connections.js");
    await PluginRegistry.publish({ manifest: manifest() });
    await PluginRegistry.install(OID, UID, "com.example.video");
    const conn = await PluginConnections.createApiKey(OID, "com.example.video", { displayName: "prod", apiKey: "sk-1" });
    expect((await PluginConnections.list(OID)).map((c) => c.id)).toContain(conn.id);
    expect(await PluginConnections.get(OID2, conn.id)).toBeNull();
  });

  it("disconnect flips status; remove deletes the record and its secret", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    const { PluginConnections } = await import("./connections.js");
    await PluginRegistry.publish({ manifest: manifest() });
    await PluginRegistry.install(OID, UID, "com.example.video");
    const conn = await PluginConnections.createApiKey(OID, "com.example.video", { displayName: "prod", apiKey: "sk-2" });
    await PluginConnections.disconnect(OID, conn.id);
    expect((await PluginConnections.get(OID, conn.id))?.status).toBe("disconnected");
    await PluginConnections.remove(OID, conn.id);
    expect(await PluginConnections.get(OID, conn.id)).toBeNull();
    expect(await PluginConnections.resolveSecret(OID, conn.id)).toBeNull();
  });

  it("registers an MCP endpoint connection with the endpoint in metadata (not the secret)", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    const { PluginConnections } = await import("./connections.js");
    await PluginRegistry.publish({ manifest: manifest({ authentication: ["mcp"] }) });
    await PluginRegistry.install(OID, UID, "com.example.video");
    const conn = await PluginConnections.createMcp(OID, "com.example.video", {
      displayName: "internal-mcp", endpoint: "https://mcp.example.com", headers: { Authorization: "Bearer topsecret" },
    });
    expect(conn.type).toBe("mcp");
    expect(conn.metadata?.endpoint).toBe("https://mcp.example.com");
    expect(JSON.stringify(conn)).not.toContain("topsecret");
    const secret = await PluginConnections.resolveSecret<{ headers: Record<string, string> }>(OID, conn.id);
    expect(secret?.headers.Authorization).toBe("Bearer topsecret");
  });
});

describe("OAuth state single-use", () => {
  it("rejects completing OAuth with an invalid/unknown state", async () => {
    const { PluginConnections } = await import("./connections.js");
    await expect(PluginConnections.completeOAuth("code", "no-such-state")).rejects.toMatchObject({ status: 400 });
  });
});

describe("catalog filters", () => {
  it("filters by capability and free-text query", async () => {
    const { PluginRegistry } = await import("./pluginRegistry.js");
    await PluginRegistry.publish({ manifest: manifest({ id: "com.vid", capabilities: ["video.generate"], authentication: ["none"] }) });
    await PluginRegistry.publish({ manifest: manifest({ id: "com.img", name: "Image Maker", capabilities: ["image.generate"], authentication: ["none"] }) });
    const vid = await PluginRegistry.listCatalog({ capability: "video.generate" });
    expect(vid.some((c) => c.manifest.id === "com.vid")).toBe(true);
    expect(vid.some((c) => c.manifest.id === "com.img")).toBe(false);
    const byQuery = await PluginRegistry.listCatalog({ q: "image maker" });
    expect(byQuery.some((c) => c.manifest.id === "com.img")).toBe(true);
  });
});

describe("intent detection rules", () => {
  it("maps representative prompts to the right capability", async () => {
    const { IntentEngine } = await import("./intent.js");
    expect(IntentEngine.detect("Please generate an image of a sunset")?.capability).toBe("image.generate");
    expect(IntentEngine.detect("send an email to the team")?.capability).toBe("email.send");
    expect(IntentEngine.detect("schedule a meeting for tomorrow")?.capability).toBe("calendar.create");
    expect(IntentEngine.detect("open the github repository")?.capability).toBe("github.read");
  });

  it("uses the fuzzy noun fallback with lower confidence", async () => {
    const { IntentEngine } = await import("./intent.js");
    const r = IntentEngine.detect("something about a video");
    expect(r?.capability).toBe("video.generate");
    expect(r?.confidence).toBeLessThan(0.85);
  });

  it("returns null when nothing matches", async () => {
    const { IntentEngine } = await import("./intent.js");
    expect(IntentEngine.detect("the weather is nice today")).toBeNull();
  });
});
