/**
 * Session 56 — Enterprise Intelligence Fabric, Trust Center & Mission Control (V8.5).
 * Nervous system: Data Fabric, Time Machine, Trust Center, Innovation Lab,
 * Mission Control, API Gateway, Evolution Center, Digital Twin, Package Manager,
 * Certification Center, AIO Bus.
 * Keys: fab:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis, redis as redisSub } from "../db/redis.js";
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
function rand(min:number,max:number) { return Math.random()*(max-min)+min; }
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
    startBus(logger);

    // Sources
    for (const s of DATA_SOURCES_SEED) {
      const id = uid("src-");
      const now = new Date().toISOString();
      const src: DataSource = {
        id, name: s.name, kind: s.kind,
        status: Math.random() > 0.1 ? "healthy" : "degraded",
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
        status: Math.random()>0.7?"simulating":"idle",
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
      pipelinesRunning: randInt(8, 60),
      dataQualityScore: +(healthySrcs/Math.max(1,sources.length) * rand(0.85,0.98)).toFixed(3),
      lineageEdges: randInt(400, 4800),
      catalogEntries: randInt(1200, 9600),
      governancePoliciesEnforced: randInt(18, 96),
      throughputRps: +rand(120, 1800).toFixed(0),
    };

    // Trust
    const signals: TrustSignal[] = TRUST_CATEGORIES.map(cat => {
      const score = +rand(0.55, 0.99).toFixed(2);
      const status: TrustSignal["status"] = score >= 0.85 ? "good" : score >= 0.7 ? "warn" : "bad";
      return { id: uid("tsi-"), category: cat, label: TRUST_LABELS[cat], score, status };
    });
    const overall = Math.round(signals.reduce((s,x)=>s+x.score,0)/signals.length*100);
    const trust: TrustCenterReport = {
      overallScore: overall,
      level: overall>=85?"trusted":overall>=70?"watch":overall>=55?"review":"blocked",
      signals, lastEvaluatedAt: new Date().toISOString(),
    };

    // Mission control live
    const mission: MissionControlStatus = {
      workforceActive: randInt(120, 800),
      agentsBusy: randInt(40, 350),
      workflowsRunning: randInt(15, 180),
      gpuUtilPct: randInt(20, 92),
      cpuUtilPct: randInt(22, 78),
      securityIncidentsOpen: randInt(0, 4),
      globalAlerts: alerts.filter(a=>!a.acknowledged).length,
      businessKpis: [
        {name:"Revenue / day", value: +rand(40000, 280000).toFixed(0), target: 200000, unit:"USD"},
        {name:"Customer Satisfaction", value: +rand(82, 97).toFixed(1), target: 92, unit:"%"},
        {name:"Tickets Auto-Resolved", value: +rand(55, 88).toFixed(1), target: 70, unit:"%"},
        {name:"SLA On-Time", value: +rand(94, 99.8).toFixed(2), target: 99, unit:"%"},
      ],
      autonomousDecisionsPerMin: randInt(20, 400),
      digitalTwinsOnline: twins.filter(t=>t.status!=="idle").length,
      regionsOnline: 5, regionsTotal: 5,
    };

    // Evolution trends (12 weeks)
    const trends: EvolutionTrend[] = [];
    for (let i=11;i>=0;i--) {
      const d = new Date(Date.now()-i*7*86400000);
      trends.push({
        period: d.toISOString().slice(0,10),
        performanceScore: +(70 + (11-i)*1.4 + rand(-1.5,1.5)).toFixed(1),
        productivityIndex: +(60 + (11-i)*1.8 + rand(-2,2)).toFixed(1),
        automationPct: +(0.25 + (11-i)*0.025 + rand(-0.01,0.01)).toFixed(3),
        modelObsolescenceRisk: +Math.max(0.05, 0.4 - (11-i)*0.01 + rand(-0.03,0.03)).toFixed(3),
      });
    }
    const maturity: MaturityScore[] = DEPARTMENTS.map((d,i)=>({
      department: d,
      score: Math.round(rand(55+i*2, 88+i)),
      level: (["emerging","developing","mature","leading"] as const)[Math.min(3, Math.floor(rand(1,4)))],
    }));

    // Endpoints (API gateway synthetic)
    const endpointCount = randInt(36, 140);

    // Bus stats
    const meta = await redis.hgetall(K.busMeta(oid));
    const startedAt = meta.startedAt ? new Date(meta.startedAt).getTime() : Date.now();
    const events = Number(meta.events || 0);
    const uptimeSec = Math.max(1, Math.floor((Date.now()-startedAt)/1000));
    const bus: BusStats = { eventsPerSec: +(events/Math.max(1,uptimeSec)).toFixed(2), topics: randInt(24,80), subscribers: randInt(40,240), deadLetters: randInt(0,5), avgLatencyMs: randInt(4,32), uptimeSec };

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
    setTimeout(async () => {
      t.status = "idle"; t.healthPct = +Math.min(100, Math.max(40, t.healthPct + rand(-3,3))).toFixed(1);
      t.predictionAccuracyPct = +Math.min(99, Math.max(70, t.predictionAccuracyPct + rand(-1,1.5))).toFixed(1);
      await redis.hset(K.twin(oid,twinId),"_doc",s2(t));
      publishEvent("twin.telemetry", "fabric", { organizationId: oid, twinId, healthPct: t.healthPct });
    }, 1500);
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
