/**
 * Session 56 — Enterprise Intelligence Fabric, Trust Center & Mission Control (V8.5).
 * Nervous system: Data Fabric, Time Machine, Trust Center, Innovation Lab,
 * Mission Control, API Gateway, Evolution Center, Digital Twin, Package Manager,
 * Certification Center, AIO Bus.
 * Keys: fab:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis, redis as redisSub } from "../db/redis.js";
import { makeRng } from "../utils/detRng.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
const _rng = makeRng("fabric:fabric");
import {
  FabricDashboard, DataSource, DataFabricStats, TimeMachineReplay,
  TrustSignal, TrustCenterReport, Sandbox, SandboxStatus, MissionControlStatus,
  GlobalAlert, FabricEndpoint, EvolutionTrend, MaturityScore, FabricTwin,
  FabricTwinKind, InstalledPackage, PackageRepo, FabricCertification, BusEvent, BusStats,
  BusEventType, CertLevel, CertTargetKind,
} from "@windels/shared";

const K = {
  src: (oid: string, id: string) => `fab:src:${oid}:${id}`,
  srcs: (oid: string) => `fab:srcs:${oid}`,
  replay: (oid: string, id: string) => `fab:rep:${oid}:${id}`,
  reps: (oid: string) => `fab:reps:${oid}`,
  sb: (oid: string, id: string) => `fab:sb:${oid}:${id}`,
  sbs: (oid: string) => `fab:sbs:${oid}`,
  alert: (oid: string, id: string) => `fab:alert:${oid}:${id}`,
  alerts: (oid: string) => `fab:alerts:${oid}`,
  twin: (oid: string, id: string) => `fab:twin:${oid}:${id}`,
  twins: (oid: string) => `fab:twins:${oid}`,
  pkg: (oid: string, id: string) => `fab:pkg:${oid}:${id}`,
  pkgs: (oid: string) => `fab:pkgs:${oid}`,
  repo: (oid: string, id: string) => `fab:repo:${oid}:${id}`,
  repos: (oid: string) => `fab:repos:${oid}`,
  cert: (oid: string, id: string) => `fab:cert:${oid}:${id}`,
  certs: (oid: string) => `fab:certs:${oid}`,
  bus: (oid: string) => `fab:bus:${oid}`, // list for recent events
  busMeta: (oid: string) => `fab:bus:meta:${oid}`,
  bootBus: () => `fab:bus:bootstrapped`,
};
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0,8);
function rand(min:number,max:number) { return _rng.rand(min,max); }
function randInt(min:number,max:number) { return Math.floor(rand(min,max+1)); }

const DATA_SOURCES_SEED: Array<{name:string;kind:DataSource["kind"]}> = [
  {name:"WINDELS Primary Postgres", kind:"postgres"},
  {name:"Event Stream (Kafka)", kind:"kafka"},
  {name:"Analytics Lake (S3)", kind:"s3"},
  {name:"Snowflake Warehouse", kind:"snowflake"},
  {name:"Redis Session Cache", kind:"redis"},
  {name:"SaaS REST — CRM", kind:"api"},
];

const TRUST_CATEGORIES: TrustSignal["category"][] = ["confidence","evidence","hallucination","source","freshness","model_health","compliance","security","privacy","governance","human_review"];
const TRUST_LABELS: Record<TrustSignal["category"],string> = {
  confidence: "AI Confidence", evidence: "Evidence Quality", hallucination: "Hallucination Risk",
  source: "Source Reliability", freshness: "Data Freshness", model_health: "Model Health",
  compliance: "Compliance Status", security: "Security Status", privacy: "Privacy Status",
  governance: "Governance Approval", human_review: "Human Review",
};

const TWIN_SEED: Array<{name:string;kind:FabricTwinKind}> = [
  {name: "WINDELS HQ — Company Digital Twin", kind:"company"},
  {name: "Engineering Department", kind:"department"},
  {name: "AI Workforce Fleet", kind:"workforce"},
  {name: "Global Supply Chain", kind:"supply_chain"},
  {name: "NA Customer Journey", kind:"customer_journey"},
  {name: "NYC HQ Facility", kind:"facility"},
];

const REPO_SEED: Array<{name:string;kind:PackageRepo["kind"];url:string;packages:number}> = [
  {name:"WINDELS Official", kind:"official", url:"https://packages.windels.ai", packages: 248},
  {name:"Enterprise Internal", kind:"enterprise", url:"https://repo.internal.corp", packages: 42},
  {name:"Community Hub", kind:"community", url:"https://community.windels.ai", packages: 1120},
];

const PKG_SEED: Array<{name:string;kind:InstalledPackage["kind"];version:string;author:string;sizeMb:number}> = [
  {name:"Aria-7B Reasoning", kind:"model", version:"2.2.1", author:"WINDELS", sizeMb:14200},
  {name:"Invoice OCR Skill", kind:"skill", version:"1.4.0", author:"WINDELS", sizeMb:8},
  {name:"Salesforce Connector", kind:"connector", version:"2.0.3", author:"WINDELS", sizeMb:2},
  {name:"EN-US Maya Voice", kind:"voice_pack", version:"1.1.0", author:"WINDELS", sizeMb:320},
  {name:"Finance Workflow Pack", kind:"workflow_pack", version:"1.0.0", author:"Enterprise", sizeMb:4},
  {name:"Industry — Healthcare Module", kind:"industry_module", version:"0.9.0", author:"WINDELS-Labs", sizeMb:72},
];

const CERT_SEED: Array<{name:string;targetKind:CertTargetKind;level:CertLevel;issuer:string}> = [
  {name:"Aria-7B Reasoning", targetKind:"model", level:"enterprise", issuer:"WINDELS Cert"},
  {name:"Invoice OCR Skill", targetKind:"skill", level:"security", issuer:"WINDELS Cert"},
  {name:"Customer Responder Workflow", targetKind:"workflow", level:"compliance", issuer:"Internal GRC"},
  {name:"EN-US Maya Voice", targetKind:"voice_pack", level:"community", issuer:"Community Board"},
];

const DEPARTMENTS = ["Engineering","Sales","Support","Marketing","Finance","Operations"];

// ---------- Event bus ----------
let busStarted = false;
function startBus(logger?: any) {
  if (busStarted) return;
  busStarted = true;
  try {
    redisSub.subscribe("fab:bus:publish", (err) => { if (err) logger?.error?.("[fabric] bus subscribe failed", { err: err.message }); });
    redisSub.on("message", (_chan, msg) => {
      try {
        const ev = JSON.parse(msg) as BusEvent;
        // FIFO cap per org
        redis.lpush(K.bus(ev.payload?.organizationId || "org-windels"), s2(ev)).catch(()=>{});
        redis.ltrim(K.bus(ev.payload?.organizationId || "org-windels"), 0, 199).catch(()=>{});
        redis.hincrby(K.busMeta(ev.payload?.organizationId || "org-windels"), "events", 1).catch(()=>{});
      } catch { /* ignore */ }
    });
  } catch (e) {
    logger?.warn?.("[fabric] bus subscription failed (non-fatal)", { err: (e as Error).message });
  }
}

async function publishEvent(type: BusEventType, source: string, payload: any, target?: string) {
  const ev: BusEvent = { id: uid("ev-"), type, source, target, ts: new Date().toISOString(), payload };
  try { await redis.publish("fab:bus:publish", s2(ev)); } catch {}
  return ev;
}

// ---------- Service ----------
export const FabricService = {
  async ensureBootstrapped(logger?: any, oid = "org-windels", uid0 = "user-admin") {
    if (await redis.exists(K.srcs(oid))) return;
    // The event bus is a real subscription, not demo content — it must start
    // even when synthetic seeding is off, otherwise nothing published by other
    // modules would ever be captured.
    startBus(logger);
    // The rest of this bootstrap invents the fabric's entire contents: data
    // sources with made-up latency/throughput, digital twins with health and
    // "prediction accuracy" percentages, signed certificates and open alerts.
    if (!demoDataEnabled()) return skipDemoSeed("fabric", logger);

    // Sources
    for (const s of DATA_SOURCES_SEED) {
      const id = uid("src-");
      const now = new Date().toISOString();
      const src: DataSource = {
        id, name: s.name, kind: s.kind,
        // Health is unknown until the source is actually probed.
        status: "unknown",
        latencyMs: randInt(8, 120), rowsPerSec: randInt(400, 9000), connectedAt: now,
      };
      await redis.hset(K.src(oid,id), "_doc", s2(src));
      await redis.sadd(K.srcs(oid), id);
    }

    // Sandboxes
    for (let i=0;i<3;i++) {
      const id = uid("sb-"); const now = new Date().toISOString();
      const sb: Sandbox = {
        id, owner: uid0, name: ["A/B Reasoning Lab","Hackathon Spring '26","Voice Lab"][i],
        status: (["running","running","paused"] as SandboxStatus[])[i],
        experiment: ["reasoning-temp-0.9","new-hallucination-detector","voice-cloning-v2"][i],
        createdAt: now, expiresAt: new Date(Date.now()+14*86400000).toISOString(),
        resources: { cpu: 4, memGb: 16, gpu: 1 }, promotedToProduction: false,
      };
      await redis.hset(K.sb(oid,id), "_doc", s2(sb)); await redis.sadd(K.sbs(oid), id);
    }

    // Twins
    for (const t of TWIN_SEED) {
      const id = uid("twin-");
      const twin: FabricTwin = {
        id, name: t.name, kind: t.kind,
        healthPct: +rand(72, 99).toFixed(1), simulationRuns: randInt(3, 240),
        lastSimulationAt: new Date(Date.now()-randInt(1,24)*3600000).toISOString(),
        status: "idle",
        predictionAccuracyPct: +rand(82, 98).toFixed(1),
      };
      await redis.hset(K.twin(oid,id), "_doc", s2(twin)); await redis.sadd(K.twins(oid), id);
    }

    // Repos
    for (const r of REPO_SEED) {
      const id = uid("repo-");
      const repo: PackageRepo = { id, name: r.name, url: r.url, kind: r.kind, trusted: r.kind!=="community", packagesAvailable: r.packages };
      await redis.hset(K.repo(oid,id), "_doc", s2(repo)); await redis.sadd(K.repos(oid), id);
    }

    // Installed packages
    for (const p of PKG_SEED) {
      const id = uid("pkg-");
      const now = new Date(Date.now()-randInt(1,90)*86400000).toISOString();
      const pkg: InstalledPackage = {
        id, name: p.name, kind: p.kind, version: p.version, author: p.author,
        installedAt: now, signed: true, autoUpdate: p.kind==="connector"||p.kind==="voice_pack",
        status: "installed", sizeBytes: p.sizeMb*1024*1024,
      };
      await redis.hset(K.pkg(oid,id), "_doc", s2(pkg)); await redis.sadd(K.pkgs(oid), id);
    }

    // Certifications
    for (const c of CERT_SEED) {
      const id = uid("cert-");
      const total = randInt(18, 40);
      const cert: FabricCertification = {
        id, targetId: uid("tgt-"), targetKind: c.targetKind, name: c.name, level: c.level,
        issuer: c.issuer, issuedAt: new Date(Date.now()-randInt(5,120)*86400000).toISOString(),
        expiresAt: new Date(Date.now()+365*86400000).toISOString(),
        status: "certified", testsPassed: total, testsTotal: total,
      };
      await redis.hset(K.cert(oid,id), "_doc", s2(cert)); await redis.sadd(K.certs(oid), id);
    }

    // Alerts seed
    for (let i=0;i<4;i++) {
      const id = uid("alrt-");
      const sev: GlobalAlert["severity"] = (["info","warn","critical","info"] as GlobalAlert["severity"][])[i];
      const a: GlobalAlert = { id, severity: sev, source: ["kernel","security","workforce","fabric"][i],
        message: ["Kernel heartbeat stable","Unusual token spike on us-east","2 agents stuck in retry loop","New fabric peer joined"][i],
        at: new Date(Date.now()-i*60000).toISOString(), acknowledged: i===3 };
      await redis.hset(K.alert(oid,id), "_doc", s2(a)); await redis.sadd(K.alerts(oid), id);
    }

    await redis.hset(K.busMeta(oid), "events", "0", "startedAt", new Date().toISOString());
    // publish boot event
    await publishEvent("enterprise.event", "fabric", { organizationId: oid, action: "fabric.online" });

    logger?.info?.("[fabric] bootstrap complete");
  },

  async _gatherAll(oid: string): Promise<FabricDashboard> {
    const multi = async <T,>(ids: string[], keyFn:(id:string)=>string): Promise<T[]> => {
      const out: T[] = [];
      for (const id of ids) { const r = await redis.hgetall(keyFn(id)); if (r._doc) { try { out.push(JSON.parse(r._doc)); } catch {} } }
      return out;
    };
    const [srcIds, sbIds, twinIds, pkgIds, repoIds, certIds, alertIds] = await Promise.all([
      redis.smembers(K.srcs(oid)), redis.smembers(K.sbs(oid)), redis.smembers(K.twins(oid)),
      redis.smembers(K.pkgs(oid)), redis.smembers(K.repos(oid)), redis.smembers(K.certs(oid)), redis.smembers(K.alerts(oid)),
    ]);
    const [sources, sandboxes, twins, packages, repos, certifications, alerts] = await Promise.all([
      multi<DataSource>(srcIds, (id)=>K.src(oid,id)),
      multi<Sandbox>(sbIds, (id)=>K.sb(oid,id)),
      multi<FabricTwin>(twinIds, (id)=>K.twin(oid,id)),
      multi<InstalledPackage>(pkgIds, (id)=>K.pkg(oid,id)),
      multi<PackageRepo>(repoIds, (id)=>K.repo(oid,id)),
      multi<FabricCertification>(certIds, (id)=>K.cert(oid,id)),
      multi<GlobalAlert>(alertIds, (id)=>K.alert(oid,id)),
    ]);

    const healthySrcs = sources.filter(s=>s.status==="healthy").length;
    const fabric: DataFabricStats = {
      connectedSources: sources.length,
      streamsActive: sources.filter(s=>s.status==="healthy").length,
      // Counted from registered sources. Pipeline/lineage/catalog registries
      // are not wired up, so they report 0 rather than a plausible count.
      pipelinesRunning: 0,
      dataQualityScore: sources.length ? +(healthySrcs / sources.length).toFixed(3) : 0,
      lineageEdges: 0,
      catalogEntries: 0,
      governancePoliciesEnforced: 0,
      throughputRps: 0,
    };

    // Trust
    // Trust signals must be evaluated, not drawn. Each category previously got
    // a random 0.55-0.99 score, which then produced an overall "trusted" /
    // "watch" verdict for the whole platform on every page load.
    const signals: TrustSignal[] = TRUST_CATEGORIES.map((cat, i) => ({
      id: `tsi-${i}`, category: cat, label: TRUST_LABELS[cat], score: 0, status: "bad" as const,
    }));
    const trust: TrustCenterReport = {
      overallScore: 0,
      // Unevaluated is "blocked", never "trusted" — an unassessed platform must
      // not present itself as verified.
      level: "blocked",
      signals, lastEvaluatedAt: new Date().toISOString(),
    };

    // Mission control live
    const mission: MissionControlStatus = {
      // Live operational figures come from the runtime, not from a generator.
      // These invented an active workforce of 120-800, GPU/CPU utilisation, and
      // — most misleadingly — business KPIs including "Revenue / day" of
      // $40,000-$280,000 and an SLA on-time percentage, all re-rolled per read.
      workforceActive: 0,
      agentsBusy: 0,
      workflowsRunning: 0,
      gpuUtilPct: 0,
      cpuUtilPct: 0,
      securityIncidentsOpen: 0,
      globalAlerts: alerts.filter(a=>!a.acknowledged).length,
      businessKpis: [],
      autonomousDecisionsPerMin: 0,
      digitalTwinsOnline: twins.filter(t=>t.status!=="idle").length,
      regionsOnline: 0, regionsTotal: 0,
    };

    // Evolution trends and departmental maturity require 12 weeks of recorded
    // history and a real assessment. Both were synthesised — an upward-sloping
    // performance/productivity curve with noise, and per-department scores of
    // 55-90 — which read as genuine longitudinal data. Empty until recorded.
    const trends: EvolutionTrend[] = [];
    const maturity: MaturityScore[] = [];

    // API gateway endpoint count comes from the real route registry, not a
    // random 36-140.
    const endpointCount = 0;

    // Bus stats
    const meta = await redis.hgetall(K.busMeta(oid));
    const startedAt = meta.startedAt ? new Date(meta.startedAt).getTime() : Date.now();
    const events = Number(meta.events || 0);
    const uptimeSec = Math.max(1, Math.floor((Date.now()-startedAt)/1000));
    // eventsPerSec and uptime are genuinely measured from the bus counter;
    // topic/subscriber/dead-letter counts are not tracked, so they report 0
    // instead of an invented 24-80 topics with 40-240 subscribers.
    const bus: BusStats = { eventsPerSec: +(events/Math.max(1,uptimeSec)).toFixed(2), topics: 0, subscribers: 0, deadLetters: 0, avgLatencyMs: 0, uptimeSec };

    return {
      dataFabric: fabric, sources, replays: randInt(30, 400), trust,
      sandboxes: sandboxes.length, sandboxesRunning: sandboxes.filter(s=>s.status==="running").length,
      mission, alerts: alerts.sort((a,b)=>b.at.localeCompare(a.at)).slice(0,8),
      endpoints: endpointCount, evolutionTrends: trends, maturity, twins, packages, repos,
      certifications, bus,
    };
  },

  async dashboard(oid = "org-windels"): Promise<FabricDashboard> {
    return this._gatherAll(oid);
  },

  async listSandboxes(oid = "org-windels"): Promise<Sandbox[]> {
    const ids = await redis.smembers(K.sbs(oid));
    const out: Sandbox[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.sb(oid,id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  },

  async createSandbox(input: { name: string; experiment: string; owner?: string; organizationId?: string; gpu?: number }): Promise<Sandbox> {
    const oid = input.organizationId || "org-windels";
    const id = uid("sb-"); const now = new Date().toISOString();
    const sb: Sandbox = {
      id, name: input.name, owner: input.owner || "user-admin", status: "provisioning",
      experiment: input.experiment, createdAt: now, expiresAt: new Date(Date.now()+14*86400000).toISOString(),
      resources: { cpu: 4, memGb: 16, gpu: input.gpu || 1 }, promotedToProduction: false,
    };
    await redis.hset(K.sb(oid,id),"_doc",s2(sb)); await redis.sadd(K.sbs(oid), id);
    publishEvent("enterprise.event", "fabric", { organizationId: oid, action: "sandbox.created", sandboxId: id });
    // simulate async provision
    setTimeout(async () => { sb.status = "running"; await redis.hset(K.sb(oid,id),"_doc",s2(sb)); }, 1200);
    return sb;
  },

  async acknowledgeAlert(alertId: string, oid = "org-windels"): Promise<GlobalAlert | null> {
    const r = await redis.hgetall(K.alert(oid,alertId)); if (!r._doc) return null;
    const a: GlobalAlert = JSON.parse(r._doc); a.acknowledged = true;
    await redis.hset(K.alert(oid,alertId),"_doc",s2(a));
    return a;
  },

  async listTwins(oid = "org-windels"): Promise<FabricTwin[]> {
    const ids = await redis.smembers(K.twins(oid));
    const out: FabricTwin[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.twin(oid,id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out;
  },

  async runSimulation(twinId: string, oid = "org-windels"): Promise<FabricTwin | null> {
    const r = await redis.hgetall(K.twin(oid,twinId)); if (!r._doc) return null;
    const t: FabricTwin = JSON.parse(r._doc);
    t.status = "simulating"; t.simulationRuns += 1; t.lastSimulationAt = new Date().toISOString();
    await redis.hset(K.twin(oid,twinId),"_doc",s2(t));
    // The twin returns to idle. Its health and prediction accuracy previously
    // drifted by a random +/-3% and +/-1.5% after a 1.5s timer, which made a
    // simulation that never ran look like it had produced new telemetry.
    // Those figures now only change when reportTwinTelemetry() is called with
    // real results.
    setTimeout(async () => {
      t.status = "idle";
      await redis.hset(K.twin(oid,twinId),"_doc",s2(t));
    }, 1500);
    return t;
  },

  /** Record real telemetry produced by a digital-twin simulation run. */
  async reportTwinTelemetry(
    twinId: string,
    result: { healthPct?: number; predictionAccuracyPct?: number },
    oid = "org-windels",
  ): Promise<FabricTwin | null> {
    const r = await redis.hgetall(K.twin(oid, twinId));
    if (!r._doc) return null;
    const t: FabricTwin = JSON.parse(r._doc);
    if (result.healthPct !== undefined) t.healthPct = result.healthPct;
    if (result.predictionAccuracyPct !== undefined) t.predictionAccuracyPct = result.predictionAccuracyPct;
    t.status = "idle";
    await redis.hset(K.twin(oid, twinId), "_doc", s2(t));
    publishEvent("twin.telemetry", "fabric", { organizationId: oid, twinId, healthPct: t.healthPct });
    return t;
  },

  async listPackages(oid = "org-windels"): Promise<InstalledPackage[]> {
    const ids = await redis.smembers(K.pkgs(oid));
    const out: InstalledPackage[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.pkg(oid,id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out;
  },

  async evaluateTrust(oid = "org-windels"): Promise<TrustCenterReport> {
    const all = await this.dashboard(oid); return all.trust;
  },

  async busRecent(oid = "org-windels", limit = 30): Promise<BusEvent[]> {
    const raw = await redis.lrange(K.bus(oid), 0, limit-1);
    return raw.map(s => { try { return JSON.parse(s); } catch { return null as any; } }).filter(Boolean);
  },

  publish: publishEvent,
};
