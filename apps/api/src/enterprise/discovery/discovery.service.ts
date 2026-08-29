/**
 * Enterprise Service Registry & Discovery (Slices 162 + 163).
 *
 * Provides service registration, heartbeats, discovery by capability/name,
 * version-aware lookup, and a dependency graph with validation.
 *
 * The registry includes the running windels-api itself out of the box and
 * allows both in-process (web, workers sharing the same Node process) and
 * out-of-process (remote microservices) registrations via REST. Storage is
 * in-memory with Redis TTLs so multiple API replicas share state.
 */
import { randomUUID } from "node:crypto";
import { redis } from "../../db/redis.js";
import { logger } from "../../observability/logger.js";
import type {
  ServiceRegistration,
  ServiceHealthReport,
  ServiceStatus,
  ServiceDependency,
  DiscoveryQuery,
  ServiceIdentity,
} from "@windels/shared/enterprise";

const KEY_PREFIX = "enterprise:discovery:";
const HEARTBEAT_TTL = 60; // seconds

// ── In-memory registry ─────────────────────────────────────────────────────
const registry = new Map<string, ServiceRegistration>(); // by instanceId
const dependencies = new Map<string, Set<string>>(); // serviceId -> set of target serviceIds
const identities = new Map<string, ServiceIdentity>(); // instanceId -> identity

function instanceKey(s: Pick<ServiceRegistration, "id"|"instanceId">) {
  return `${s.id}:${s.instanceId || "default"}`;
}

// ── Built-in service: windels-api ──────────────────────────────────────────
async function registerSelf() {
  let apiVersion = process.env.npm_package_version ?? "0.18.0";
  try {
    const pkgUrl = new URL("../../../../package.json", import.meta.url);
    const pkg = await import(pkgUrl.href, { with: { type: "json" } } as any);
    apiVersion = (pkg.default?.version ?? pkg.version ?? apiVersion) as string;
  } catch {
    try {
      // fall back to env-provided version
      apiVersion = process.env.npm_package_version ?? apiVersion;
    } catch { /* ignore */ }
  }
  const self: ServiceRegistration = {
    id: "windels-api",
    name: "WINDELS API",
    version: apiVersion,
    baseUrl: process.env.API_BASE_URL ?? "http://localhost:4000",
    healthUrl: "/api/v1/health",
    status: "healthy",
    capabilities: [
      "auth", "chat", "agents", "workflows", "canvas", "talk",
      "files", "billing", "governance", "discovery", "events", "api-governance",
      "notifications", "mobile", "push", "monitoring",
    ],
    metadata: { runtime: "node", framework: "express" },
    startedAt: new Date().toISOString(),
    lastHeartbeat: new Date().toISOString(),
    region: process.env.REGION ?? "local",
    instanceId: "api-" + randomUUID().slice(0, 8),
  };
  registry.set(instanceKey(self), self);
}

// ── Redis helpers ──────────────────────────────────────────────────────────
async function redisSyncRegister(s: ServiceRegistration) {
  try {
    const k = KEY_PREFIX + "svc:" + instanceKey(s);
    await redis.set(k, JSON.stringify(s), "EX", HEARTBEAT_TTL * 2);
  } catch { /* offline redis ok */ }
}
async function redisLoadAll() {
  try {
    const keys = await redis.keys(KEY_PREFIX + "svc:*");
    for (const k of keys) {
      const raw = await redis.get(k);
      if (!raw) continue;
      try {
        const s: ServiceRegistration = JSON.parse(raw);
        registry.set(instanceKey(s), s);
      } catch { /* ignore bad entry */ }
    }
  } catch { /* ignore */ }
}
setTimeout(() => { void registerSelf(); void redisLoadAll(); }, 500);

// ── Heartbeat sweeper ──────────────────────────────────────────────────────
const HEARTBEAT_INTERVAL = 15_000;
setInterval(() => {
  const now = Date.now();
  for (const [k, s] of registry) {
    if (s.id === "windels-api") {
      // Update self
      s.lastHeartbeat = new Date().toISOString();
      s.status = "healthy";
      continue;
    }
    const last = s.lastHeartbeat ? new Date(s.lastHeartbeat).getTime() : 0;
    if (now - last > HEARTBEAT_TTL * 1000) {
      if (s.status !== "offline") {
        logger.warn(`service ${s.id} (${s.instanceId}) missed heartbeats, marking offline`, { serviceId: s.id });
        s.status = "offline";
      }
    }
  }
}, HEARTBEAT_INTERVAL);

// ── Public API ────────────────────────────────────────────────────────────
export const DiscoveryService = {
  // Register or refresh a service instance.
  async register(reg: Omit<ServiceRegistration, "startedAt"|"lastHeartbeat"|"instanceId"> & { instanceId?: string }): Promise<ServiceRegistration> {
    const existing = [...registry.values()].find(
      (s) => s.id === reg.id && s.instanceId === (reg.instanceId ?? "default"),
    );
    const s: ServiceRegistration = {
      ...reg,
      instanceId: reg.instanceId ?? existing?.instanceId ?? randomUUID().slice(0, 8),
      startedAt: existing?.startedAt ?? new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      status: reg.status ?? "healthy",
    };
    registry.set(instanceKey(s), s);
    await redisSyncRegister(s);
    return s;
  },

  // Heartbeat from a live instance.
  async heartbeat(instanceId: string, report?: Omit<ServiceHealthReport, "instanceId"|"reportedAt">): Promise<ServiceRegistration | null> {
    const [s] = [...registry.values()].filter((x) => x.instanceId === instanceId);
    if (!s) return null;
    s.lastHeartbeat = new Date().toISOString();
    s.status = report?.status ?? "healthy";
    if (report?.version) s.version = report.version;
    await redisSyncRegister(s);
    return s;
  },

  // Unregister.
  async deregister(id: string, instanceId?: string): Promise<boolean> {
    let removed = false;
    for (const [k, s] of registry) {
      if (s.id === id && (!instanceId || s.instanceId === instanceId)) {
        registry.delete(k);
        removed = true;
        try { await redis.del(KEY_PREFIX + "svc:" + k); } catch { /* ignore */ }
      }
    }
    return removed;
  },

  // Lookup services matching a query.
  query(q: DiscoveryQuery = {}): ServiceRegistration[] {
    let list = [...registry.values()].filter((s) => s.status !== "offline" || q.status === "offline");
    if (q.name) list = list.filter((s) => s.name.toLowerCase().includes(q.name!.toLowerCase()) || s.id === q.name);
    if (q.capability) list = list.filter((s) => s.capabilities.includes(q.capability!));
    if (q.status) list = list.filter((s) => s.status === q.status);
    if (q.region) list = list.filter((s) => s.region === q.region);
    if (q.minVersion) list = list.filter((s) => semverGte(s.version, q.minVersion!));
    // Prefer healthy instances
    list.sort((a, b) => {
      const rank: Record<ServiceStatus, number> = { healthy: 0, starting: 1, degraded: 2, unhealthy: 3, offline: 4 };
      return rank[a.status] - rank[b.status];
    });
    return list;
  },

  // Resolve one healthy instance (simple client-side round-robin-ish by taking first healthy).
  resolve(name: string): ServiceRegistration | null {
    const matches = this.query({ name });
    return matches[0] ?? null;
  },

  list(): ServiceRegistration[] {
    return [...registry.values()].sort((a, b) => a.id.localeCompare(b.id));
  },

  // ── Dependency graph ───────────────────────────────────────────────────
  addDependency(dep: ServiceDependency) {
    if (!dependencies.has(dep.from)) dependencies.set(dep.from, new Set());
    dependencies.get(dep.from)!.add(dep.to);
  },
  removeDependency(from: string, to: string) {
    dependencies.get(from)?.delete(to);
  },
  getDependencies(serviceId?: string): ServiceDependency[] {
    const out: ServiceDependency[] = [];
    const services = serviceId ? [serviceId] : [...dependencies.keys()];
    for (const from of services) {
      const targets = dependencies.get(from);
      if (!targets) continue;
      for (const to of targets) {
        out.push({ from, to, kind: "http", criticality: "required" });
      }
    }
    return out;
  },
  /** Validate dependency graph: returns list of unresolved (missing) services that are depended on. */
  validateDependencies(): { missing: string[]; healthy: boolean } {
    const registered = new Set([...registry.values()].filter((s) => s.status === "healthy").map((s) => s.id));
    const missing = new Set<string>();
    for (const [from, targets] of dependencies) {
      if (!registered.has(from)) missing.add(from);
      for (const to of targets) if (!registered.has(to)) missing.add(to);
    }
    return { missing: [...missing], healthy: missing.size === 0 };
  },

  // ── Service identity tokens (minting) ─────────────────────────────────
  mintIdentity(serviceId: string, instanceId: string, ttlSeconds = 86_400): ServiceIdentity {
    const token = randomUUID();
    const id: ServiceIdentity = {
      serviceId, instanceId,
      tokenHash: token, // Note: store hash in real impl; MVP passes raw token for demo.
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
    identities.set(instanceId, id);
    return id;
  },
  verifyIdentity(instanceId: string, token: string): boolean {
    const id = identities.get(instanceId);
    if (!id) return false;
    if (id.expiresAt && new Date(id.expiresAt) < new Date()) return false;
    return id.tokenHash === token;
  },
};

// ── Semver comparison (major.minor.patch, supports v-prefix, missing patch/minor) ──
function semverGte(a: string, b: string): boolean {
  const pa = parseSemver(a), pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return true;
}
function parseSemver(s: string): [number, number, number] {
  const m = s.replace(/^v/, "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1]!), parseInt(m[2] ?? "0"), parseInt(m[3] ?? "0")];
}
