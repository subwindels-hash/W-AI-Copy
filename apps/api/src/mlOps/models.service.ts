/**
 * ModelsService — Slices 259-263:
 * Model Registry, Lifecycle, Deployment, Monitoring, Governance.
 *
 * Covers the full ML model lifecycle: register -> staging -> approval -> prod
 * (with shadow/canary variants) -> monitor (drift/latency/error/quality) -> retire.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  ModelArtifact, ModelVersionRec, ModelStage, ModelDeployment, ModelMetric,
  MlDeploymentEnv, MlDeploymentStatus, MlDeploymentStrategy,
  ModelMonitor, ModelAlert, MonitorType, ModelPolicy, ModelPolicyType,
  MlOpsDashboard,
} from "@windels/shared";

const MODELS     = "mlops:models";
const MODEL      = (id: string) => `mlops:model:${id}`;
const MODEL_SLUG = "mlops:model:slug";
const DEPS       = "mlops:deps";
const DEP        = (id: string) => `mlops:dep:${id}`;
const MONITORS   = "mlops:monitors";
const MON        = (id: string) => `mlops:mon:${id}`;
const POLICIES   = "mlops:policies";
const POL        = (id: string) => `mlops:pol:${id}`;

const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

const LIFECYCLE: Record<ModelStage, ModelStage[]> = {
  draft: ["registering","retired"],
  registering: ["staging","rejected"],
  staging: ["approval","rejected"],
  approval: ["production","canary","shadow","rejected"],
  production: ["canary","deprecated"],
  shadow: ["production","staging"],
  canary: ["production","staging"],
  deprecated: ["retired"],
  retired: [],
  rejected: ["draft"],
};

// ── Registry / lifecycle ────────────────────────────────────────
export const ModelsService = {
  async list(filter?: { kind?: string; stage?: ModelStage; status?: string; q?: string }): Promise<ModelArtifact[]> {
    const ids = await redis.smembers(MODELS);
    const out: ModelArtifact[] = [];
    for (const id of ids) {
      const raw = await redis.get(MODEL(id));
      if (!raw) continue;
      const m = JSON.parse(raw) as ModelArtifact;
      if (filter?.kind && m.kind !== filter.kind) continue;
      if (filter?.stage && m.currentStage !== filter.stage) continue;
      if (filter?.status && m.status !== filter.status) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        if (!m.name.toLowerCase().includes(q) && !m.slug.toLowerCase().includes(q) && !m.description.toLowerCase().includes(q)) continue;
      }
      out.push(m);
    }
    return out.sort((a,b) => b.installs - a.installs);
  },

  async get(id: string): Promise<ModelArtifact | null> {
    const raw = await redis.get(MODEL(id));
    return raw ? JSON.parse(raw) as ModelArtifact : null;
  },

  async findBySlug(slug: string): Promise<ModelArtifact | null> {
    const id = await redis.hget(MODEL_SLUG, slug);
    return id ? this.get(id) : null;
  },

  async register(input: Omit<ModelArtifact, "id"|"versions"|"stars"|"installs"|"currentStage"|"status"|"avgLatencyMs"|"errorRatePct"|"updatedAt">): Promise<ModelArtifact> {
    const id = randomUUID();
    const now = iso();
    const v0: ModelVersionRec = {
      id: randomUUID(), version: "0.1.0", stage: "draft",
      artifactUri: `mlops://models/${input.slug}/0.1.0`,
      sizeMb: 120 + Math.floor(Math.random()*800),
      hash: "sha256:" + randomUUID().replace(/-/g,""),
      metrics: [], createdAt: now,
    };
    const m: ModelArtifact = {
      id, versions: [v0], stars: 8 + Math.floor(Math.random()*40), installs: 0,
      currentStage: "draft", status: "active", avgLatencyMs: 240 + Math.floor(Math.random()*1800),
      errorRatePct: Math.random()*0.8, updatedAt: now, ...input,
    };
    m.currentVersion = v0.id;
    await redis.set(MODEL(id), SER(m));
    await redis.sadd(MODELS, id);
    await redis.hset(MODEL_SLUG, m.slug, id);
    return m;
  },

  async addVersion(id: string, version: string, metrics: ModelMetric[] = [], artifactUri?: string, notes?: string, stage: ModelStage = "draft"): Promise<ModelArtifact | null> {
    const m = await this.get(id);
    if (!m) return null;
    const v: ModelVersionRec = {
      id: randomUUID(), version, stage,
      artifactUri: artifactUri ?? `mlops://models/${m.slug}/${version}`,
      sizeMb: 120 + Math.floor(Math.random()*800),
      hash: "sha256:" + randomUUID().replace(/-/g,""),
      metrics, createdAt: iso(), notes,
    };
    m.versions.unshift(v);
    m.currentVersion = v.id;
    m.currentStage = stage;
    m.updatedAt = iso();
    await redis.set(MODEL(id), SER(m));
    return m;
  },

  async promote(id: string, versionId: string, to: ModelStage, actor = "admin"): Promise<ModelArtifact | null> {
    const m = await this.get(id);
    if (!m) return null;
    const v = m.versions.find(x => x.id === versionId);
    if (!v) return null;
    const allowed = LIFECYCLE[v.stage] ?? [];
    if (!allowed.includes(to)) throw new Error(`Invalid lifecycle transition ${v.stage} -> ${to}`);
    v.stage = to;
    v.promotedAt = iso();
    v.promotedBy = actor;
    m.currentStage = to;
    if (to === "production") m.installs += 1;
    m.updatedAt = iso();
    await redis.set(MODEL(id), SER(m));
    return m;
  },

  async reject(id: string, reason: string): Promise<ModelArtifact | null> {
    const m = await this.get(id);
    if (!m) return null;
    m.currentStage = "rejected";
    m.status = "paused";
    m.updatedAt = iso();
    await redis.set(MODEL(id), SER(m));
    return m;
  },

  // ── Deployments ───────────────────────────────────────────────
  async listDeployments(filter?: { env?: MlDeploymentEnv; status?: MlDeploymentStatus; modelId?: string }): Promise<ModelDeployment[]> {
    const ids = await redis.smembers(DEPS);
    const out: ModelDeployment[] = [];
    for (const id of ids) {
      const raw = await redis.get(DEP(id));
      if (!raw) continue;
      const d = JSON.parse(raw) as ModelDeployment;
      if (filter?.env && d.environment !== filter.env) continue;
      if (filter?.status && d.status !== filter.status) continue;
      if (filter?.modelId && d.modelId !== filter.modelId) continue;
      out.push(d);
    }
    return out.sort((a,b) => b.qps - a.qps);
  },

  async getDeployment(id: string): Promise<ModelDeployment | null> {
    const raw = await redis.get(DEP(id));
    return raw ? JSON.parse(raw) as ModelDeployment : null;
  },

  async deploy(input: {
    modelId: string; modelVersionId: string; name: string;
    environment: MlDeploymentEnv; strategy?: MlDeploymentStrategy;
    region?: string; replicas?: number; cpu?: string; memory?: string; gpu?: string;
    trafficPct?: number; deployedBy?: string;
  }): Promise<ModelDeployment> {
    const id = randomUUID();
    const now = iso();
    const d: ModelDeployment = {
      id, modelId: input.modelId, modelVersionId: input.modelVersionId,
      name: input.name, environment: input.environment,
      strategy: input.strategy ?? "rolling",
      status: "healthy", region: input.region ?? "na-east",
      replicas: input.replicas ?? 2, cpu: input.cpu ?? "2", memory: input.memory ?? "8Gi",
      gpu: input.gpu, endpoint: `https://inference.windels.ai/${input.environment}/${input.name}`,
      trafficPct: input.trafficPct ?? 100, qps: Math.floor(50+Math.random()*2000),
      p95Ms: 80+Math.floor(Math.random()*500), errorRatePct: Math.random()*0.5,
      costPerHour: +(1.2 + Math.random()*8).toFixed(2),
      deployedAt: now, updatedAt: now, deployedBy: input.deployedBy ?? "admin",
    };
    await redis.set(DEP(id), SER(d));
    await redis.sadd(DEPS, id);
    // Auto-promote model through staging->approval->production if it's not already past staging,
    // but only for non-canary/shadow prod environments.
    try {
      const model = await this.get(input.modelId);
      const v = model?.versions.find(x => x.id === input.modelVersionId);
      if (model && v && d.environment === "prod" && !["canary","shadow"].includes(d.strategy)) {
        const path: ModelStage[] = [];
        if (v.stage === "draft") path.push("registering","staging","approval","production");
        else if (v.stage === "registering") path.push("staging","approval","production");
        else if (v.stage === "staging") path.push("approval","production");
        else if (v.stage === "approval") path.push("production");
        else if (v.stage === "canary" || v.stage === "shadow") path.push("production");
        let cur = model;
        let vv = v;
        for (const st of path) {
          const next = await this.promote(cur.id, vv.id, st, d.deployedBy);
          if (next) { cur = next; vv = cur.versions.find(x=>x.id===vv.id) ?? vv; }
        }
      }
    } catch { /* non-fatal */ }
    return d;
  },

  async setDeploymentStatus(id: string, status: MlDeploymentStatus): Promise<ModelDeployment | null> {
    const d = await this.getDeployment(id);
    if (!d) return null;
    d.status = status; d.updatedAt = iso();
    await redis.set(DEP(id), SER(d));
    return d;
  },

  async setCanaryTraffic(id: string, pct: number): Promise<ModelDeployment | null> {
    const d = await this.getDeployment(id);
    if (!d) return null;
    d.trafficPct = Math.max(0, Math.min(100, pct)); d.updatedAt = iso();
    await redis.set(DEP(id), SER(d));
    return d;
  },

  // ── Monitors ──────────────────────────────────────────────────
  async listMonitors(filter?: { type?: MonitorType; modelId?: string; firing?: boolean }): Promise<ModelMonitor[]> {
    const ids = await redis.smembers(MONITORS);
    const out: ModelMonitor[] = [];
    for (const id of ids) {
      const raw = await redis.get(MON(id));
      if (!raw) continue;
      const mm = JSON.parse(raw) as ModelMonitor;
      if (filter?.type && mm.type !== filter.type) continue;
      if (filter?.modelId && mm.modelId !== filter.modelId) continue;
      if (filter?.firing !== undefined && mm.firing !== filter.firing) continue;
      out.push(mm);
    }
    return out;
  },

  async getMonitor(id: string): Promise<ModelMonitor | null> {
    const raw = await redis.get(MON(id));
    return raw ? JSON.parse(raw) as ModelMonitor : null;
  },

  async createMonitor(input: Omit<ModelMonitor, "id"|"alerts"|"currentValue"|"firing">): Promise<ModelMonitor> {
    const id = randomUUID();
    const mm: ModelMonitor = { id, currentValue: 0, firing: false, alerts: [], ...input };
    await redis.set(MON(id), SER(mm));
    await redis.sadd(MONITORS, id);
    return mm;
  },

  async recordMetric(id: string, value: number): Promise<ModelMonitor | null> {
    const mm = await this.getMonitor(id);
    if (!mm) return null;
    mm.currentValue = value;
    const wasFiring = mm.firing;
    mm.firing = value > mm.threshold;
    if (mm.firing && !wasFiring) {
      const alert: ModelAlert = {
        id: randomUUID(), monitorId: id, value, threshold: mm.threshold,
        severity: mm.severity, status: "open", openedAt: iso(),
      };
      mm.alerts.unshift(alert);
      mm.lastFiredAt = alert.openedAt;
      if (mm.alerts.length > 50) mm.alerts.length = 50;
    }
    await redis.set(MON(id), SER(mm));
    return mm;
  },

  async acknowledgeAlert(monitorId: string, alertId: string, notes?: string): Promise<ModelMonitor | null> {
    const mm = await this.getMonitor(monitorId);
    if (!mm) return null;
    const a = mm.alerts.find(x => x.id === alertId);
    if (a) { a.status = "acknowledged"; a.acknowledgedAt = iso(); a.notes = notes; }
    await redis.set(MON(monitorId), SER(mm));
    return mm;
  },

  // ── Governance policies ───────────────────────────────────────
  async listPolicies(): Promise<ModelPolicy[]> {
    const ids = await redis.smembers(POLICIES);
    const out: ModelPolicy[] = [];
    for (const id of ids) {
      const raw = await redis.get(POL(id));
      if (raw) out.push(JSON.parse(raw) as ModelPolicy);
    }
    return out.sort((a,b) => a.key.localeCompare(b.key));
  },

  async createPolicy(input: Omit<ModelPolicy, "id"|"failures24h"|"passes24h"|"updatedAt">): Promise<ModelPolicy> {
    const id = randomUUID();
    const p: ModelPolicy = { id, failures24h: 0, passes24h: 0, updatedAt: iso(), ...input };
    await redis.set(POL(id), SER(p));
    await redis.sadd(POLICIES, id);
    return p;
  },

  async setEnforced(id: string, enforced: boolean): Promise<ModelPolicy | null> {
    const ids = await redis.smembers(POLICIES);
    for (const pid of ids) {
      if (pid === id) {
        const raw = await redis.get(POL(pid));
        if (!raw) return null;
        const p = JSON.parse(raw) as ModelPolicy;
        p.enforced = enforced;
        p.updatedAt = iso();
        await redis.set(POL(id), SER(p));
        return p;
      }
    }
    return null;
  },

  // ── Summaries ─────────────────────────────────────────────────
  async dashboard(): Promise<Pick<MlOpsDashboard, "models"|"modelsInProduction"|"deployments"|"deploymentsHealthy"|"activeMonitors"|"alertsOpen"|"policies"|"policiesEnforced">> {
    const [models, deps, mons, pols] = await Promise.all([
      this.list(), this.listDeployments(), this.listMonitors(), this.listPolicies(),
    ]);
    return {
      models: models.length,
      modelsInProduction: models.filter(m=>m.currentStage==="production"||m.currentStage==="canary").length,
      deployments: deps.length,
      deploymentsHealthy: deps.filter(d=>d.status==="healthy").length,
      activeMonitors: mons.filter(m=>m.enabled).length,
      alertsOpen: mons.reduce((a,m)=>a+m.alerts.filter(x=>x.status==="open").length, 0),
      policies: pols.length,
      policiesEnforced: pols.filter(p=>p.enforced).length,
    };
  },
};
