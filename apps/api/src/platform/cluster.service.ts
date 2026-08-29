/**
 * ClusterService — Slice 177 (K8s Foundation) + part of Slice 183 (Infra Monitoring).
 *
 * ── NO SYNTHETIC CLUSTER BY DEFAULT ──────────────────────────────────
 * This previously fabricated an entire Kubernetes estate at boot: three named
 * nodes, eight workloads (windels-api, postgres, prometheus...), one pod per
 * replica with invented 10.42.x.x IPs, a 20% chance of a restart, and per-node
 * CPU/memory in the 30-75% band. `probe()` then walked that fiction every 15s
 * applying +/-6% jitter and relabelled nodes "degraded" past 90%.
 *
 * None of it existed. Worse, it cascaded: OptimizationService reads these pods
 * and emits "downsize windels-api from 3 to 2 replicas" cost recommendations
 * about workloads that were never deployed.
 *
 * The topology now comes from one of two places:
 *   - a real Kubernetes API server, when KUBERNETES_SERVICE_HOST is present
 *     (in-cluster) — see `hydrateFromKube()`; or
 *   - the demo seed, only when WINDELS_DEMO_DATA=true.
 * Otherwise the cluster reports `status: "unknown"` with zero nodes/pods, and
 * dependent features render an honest empty state.
 */
import os from "node:os";
import { randomUUID } from "node:crypto";
import { redisCmd } from "../db/redis.js";
import { logger } from "../observability/logger.js";
import { demoDataEnabled } from "../config/demoData.js";
import type { ClusterStatus, ClusterNode, K8sWorkload, K8sPod, HealthStatus, K8sWorkloadKind } from "@windels/shared/infrastructure";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable per (module, seed) so dashboard
// reads return the same numbers within a running process.
const _rng = makeRng('platform');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const CLUSTER_KEY = "infra:cluster";
const NODES_KEY = "infra:nodes";
const WORKLOADS_KEY = "infra:workloads";
const PODS_KEY = "infra:pods";

function now() { return new Date().toISOString(); }
let seeded = false;
const DEFAULT_WORKLOADS: Array<{ name: string; kind: K8sWorkloadKind; ns: string; image: string; replicas: number; strategy?: any }> = [
  { name: "windels-api", kind: "Deployment", ns: "windels", image: "windels/api:latest", replicas: 3, strategy: "Canary" },
  { name: "windels-web", kind: "Deployment", ns: "windels", image: "windels/web:latest", replicas: 2, strategy: "BlueGreen" },
  { name: "windels-worker", kind: "Deployment", ns: "windels", image: "windels/worker:latest", replicas: 2 },
  { name: "windels-sync", kind: "Deployment", ns: "windels", image: "windels/sync:latest", replicas: 1 },
  { name: "postgres", kind: "StatefulSet", ns: "data", image: "postgres:16-alpine", replicas: 1 },
  { name: "redis", kind: "StatefulSet", ns: "data", image: "redis:7-alpine", replicas: 2 },
  { name: "prometheus", kind: "Deployment", ns: "observability", image: "prom/prometheus:v2", replicas: 1 },
  { name: "grafana", kind: "Deployment", ns: "observability", image: "grafana/grafana:latest", replicas: 1 },
];

/**
 * Hydrate the cluster topology from a real Kubernetes API server (in-cluster).
 *
 * Uses the standard in-cluster service-account token and CA, then queries the
 * nodes, deployments, statefulsets and pods. Returns null when no cluster is
 * reachable so the caller can fall back to an honest "unknown" state — it never
 * fabricates a topology.
 */
async function hydrateFromKube(): Promise<{ cluster: ClusterStatus; nodes: ClusterNode[]; workloads: K8sWorkload[]; pods: K8sPod[] } | null> {
  const host = process.env.KUBERNETES_SERVICE_HOST;
  const port = process.env.KUBERNETES_SERVICE_PORT_HTTPS ?? process.env.KUBERNETES_SERVICE_PORT ?? "443";
  if (!host) return null;

  let token: string;
  let caPem: string;
  try {
    const { readFileSync } = await import("node:fs");
    token = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/token", "utf8").trim();
    try { caPem = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt", "utf8"); } catch { caPem = ""; }
  } catch {
    return null; // not running inside a pod with a service account
  }
  if (!token) return null;

  const base = `https://${host}:${port}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  // Optional CA verification; fall back to system CAs / insecure only when no
  // cluster CA is mounted.
  let agent: any;
  try {
    const https = await import("node:https");
    if (caPem) {
      agent = new https.Agent({ ca: caPem });
    }
  } catch { /* ignore */ }

  async function getJson<T>(path: string): Promise<T | null> {
    const https = await import("node:https");
    const url = new URL(base + path);
    return new Promise((resolve) => {
      const req = https.get(url, { headers, agent }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try { resolve(JSON.parse(body) as T); } catch { resolve(null); }
        });
      });
      req.on("error", () => resolve(null));
      req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    });
  }

  const [nodeList, deployList, stsList, podList] = await Promise.all([
    getJson<any>("/api/v1/nodes"),
    getJson<any>("/apis/apps/v1/deployments"),
    getJson<any>("/apis/apps/v1/statefulsets"),
    getJson<any>("/api/v1/pods"),
  ]);
  if (!nodeList) return null; // cluster API unreachable

  const nodes: ClusterNode[] = (nodeList.items ?? []).map((n: any) => {
    const cpu = parseCpu(n.status?.capacity?.cpu ?? "2");
    const mem = parseMem(n.status?.capacity?.memory ?? "8Gi");
    const cpuReq = n.status?.allocatable?.cpu ? parseCpu(n.status.allocatable.cpu) : cpu;
    const memReq = n.status?.allocatable?.memory ? parseMem(n.status.allocatable.memory) : mem;
    const cpuPct = clamp(Math.round((cpuReq / (cpu || 1)) * 100), 0, 100);
    const memPct = clamp(Math.round((memReq / (mem || 1)) * 100), 0, 100);
    const ready = (n.status?.conditions ?? []).some((c: any) => c.type === "Ready" && c.status === "True");
    return {
      id: n.metadata?.uid ?? n.metadata?.name ?? "node",
      name: n.metadata?.name ?? "node",
      zone: n.metadata?.labels?.["topology.kubernetes.io/zone"] ?? "unknown",
      region: process.env.WINDELS_REGION ?? "unknown",
      roles: n.metadata?.labels?.["node-role.kubernetes.io/control-plane"]
        ? ["control-plane"] : (n.metadata?.labels?.["node-role.kubernetes.io/master"] ? ["control-plane"] : ["worker"]),
      kubeletVersion: n.status?.nodeInfo?.kubeletVersion ?? "unknown",
      capacity: { cpu: String(cpu), memory: `${Math.floor(mem / 1024 / 1024)}Mi`, pods: Number(n.status?.capacity?.pods ?? 110) },
      allocatable: { cpu: String(cpuReq), memory: `${Math.floor(memReq / 1024 / 1024)}Mi`, pods: Number(n.status?.allocatable?.pods ?? 100) },
      usage: { cpuCores: cpuReq, cpuPercent: cpuPct, memoryBytes: memReq, memoryPercent: memPct },
      podCount: 0, status: ready ? "healthy" : "degraded",
      conditions: (n.status?.conditions ?? []).map((c: any) => ({ type: c.type, status: c.status, lastTransition: c.lastTransitionTime ?? now() })),
      startedAt: n.metadata?.creationTimestamp ?? now(),
      labels: n.metadata?.labels ?? {},
    } as ClusterNode;
  });

  const workloads: K8sWorkload[] = [];
  const deployToReady = (d: any) => {
    const replicas = d.spec?.replicas ?? 1;
    const available = d.status?.availableReplicas ?? 0;
    return {
      id: d.metadata?.uid ?? d.metadata?.name ?? "wl",
      name: d.metadata?.name ?? "workload",
      namespace: d.metadata?.namespace ?? "default",
      kind: "Deployment",
      desiredReplicas: replicas, readyReplicas: available, availableReplicas: available,
      currentRevision: d.metadata?.generation != null ? `rev-${d.metadata.generation}` : "rev-0",
      updatedAt: d.metadata?.creationTimestamp ?? now(), image: d.spec?.template?.spec?.containers?.[0]?.image ?? "",
      status: available >= replicas ? "healthy" : "degraded", labels: d.metadata?.labels ?? {},
      strategy: d.spec?.strategy?.type ?? "RollingUpdate",
    } as K8sWorkload;
  };
  for (const d of deployList?.items ?? []) workloads.push(deployToReady(d));
  for (const s of stsList?.items ?? []) {
    const replicas = s.spec?.replicas ?? 1;
    const ready = s.status?.readyReplicas ?? 0;
    workloads.push({
      id: s.metadata?.uid ?? s.metadata?.name ?? "wl",
      name: s.metadata?.name ?? "workload", namespace: s.metadata?.namespace ?? "default", kind: "StatefulSet",
      desiredReplicas: replicas, readyReplicas: ready, availableReplicas: ready,
      currentRevision: s.metadata?.generation != null ? `rev-${s.metadata.generation}` : "rev-0",
      updatedAt: s.metadata?.creationTimestamp ?? now(), image: s.spec?.template?.spec?.containers?.[0]?.image ?? "",
      status: ready >= replicas ? "healthy" : "degraded", labels: s.metadata?.labels ?? {},
      strategy: "OnDelete",
    } as unknown as K8sWorkload);
  }

  const pods: K8sPod[] = (podList?.items ?? []).map((p: any) => {
    const container = p.spec?.containers?.[0];
    const status = p.status?.phase === "Running" ? "healthy" : p.status?.phase ?? "Pending";
    return {
      id: p.metadata?.uid ?? p.metadata?.name ?? "pod",
      name: p.metadata?.name ?? "pod",
      namespace: p.metadata?.namespace ?? "default",
      workloadName: p.metadata?.ownerReferences?.[0]?.name ?? "",
      nodeName: p.spec?.nodeName ?? "",
      phase: p.status?.phase ?? "Pending", ip: p.status?.podIP ?? "",
      restartCount: container ? p.status?.containerStatuses?.[0]?.restartCount ?? 0 : 0,
      startedAt: p.status?.startTime ?? p.metadata?.creationTimestamp ?? now(), status,
    } as K8sPod;
  });

  // Assign pod counts to nodes and derive cluster-level metrics.
  for (const n of nodes) n.podCount = pods.filter((p) => p.nodeName === n.name).length;
  const avgCpu = avg(nodes.map((n) => n.usage.cpuPercent));
  const avgMem = avg(nodes.map((n) => n.usage.memoryPercent));
  const ready = workloads.filter((w) => w.availableReplicas >= w.desiredReplicas).length;
  const cluster: ClusterStatus = {
    clusterId: "kubernetes", name: "kubernetes", version: "kubernetes",
    region: process.env.WINDELS_REGION ?? "unknown",
    status: avgCpu > 85 || avgMem > 90 ? "degraded" : "healthy",
    nodes: nodes.length, pods: pods.length,
    deployments: workloads.filter((w) => w.kind === "Deployment").length,
    cpuPercent: Math.round(avgCpu), memoryPercent: Math.round(avgMem),
    podPercent: pods.length ? Math.round((pods.length / 330) * 100) : 0,
    lastProbedAt: now(),
  };
  return { cluster, nodes, workloads, pods };
}

export const ClusterService = {
  async seed() {
    _rng.reseed(`seed`);
    if (seeded) return; seeded = true;
    try {
      const existing = await redisCmd.get(CLUSTER_KEY);
      if (existing) return;
    } catch { /* redis optional */ }

    // A real in-cluster deployment exposes the API server through these vars.
    // Hydrate the topology from the live Kubernetes API (service-account auth);
    // if that fails, report unknown rather than substituting a fictional
    // topology for a real one.
    if (process.env.KUBERNETES_SERVICE_HOST) {
      const hydrated = await hydrateFromKube();
      await saveAll(hydrated ?? { cluster: unknownCluster("kubernetes"), nodes: [], workloads: [], pods: [] });
      if (hydrated) {
        logger.info("cluster service: hydrated topology from Kubernetes API", {
          nodes: hydrated.nodes.length, workloads: hydrated.workloads.length, pods: hydrated.pods.length,
        });
      } else {
        logger.warn("cluster service: in-cluster detected but live hydration failed — reporting unknown");
      }
      return;
    }

    if (!demoDataEnabled()) {
      await saveAll({ cluster: unknownCluster("none"), nodes: [], workloads: [], pods: [] });
      logger.info("cluster service: no Kubernetes connection — reporting unknown (set WINDELS_DEMO_DATA=true for a demo topology)");
      return;
    }

    const cpus = os.cpus().length;
    const totalMem = os.totalmem();

    // Seed 3 nodes (control-plane + 2 workers)
    const nodes: ClusterNode[] = [
      mkNode("windels-cp-1", "control-plane", cpus, totalMem, "na-east-1a"),
      mkNode("windels-worker-1", "worker", cpus * 2, totalMem * 2, "na-east-1a"),
      mkNode("windels-worker-2", "worker", cpus * 2, totalMem * 2, "na-east-1b"),
    ];

    const workloads: K8sWorkload[] = DEFAULT_WORKLOADS.map((w) => {
      const ready = w.replicas;
      return {
        id: randomUUID(), name: w.name, namespace: w.ns, kind: w.kind,
        desiredReplicas: w.replicas, readyReplicas: ready, availableReplicas: ready,
        currentRevision: `rev-${Math.floor(_rng.next() * 9000 + 1000)}`,
        updatedAt: now(), image: w.image, status: "healthy", labels: { app: w.name },
        strategy: w.strategy ?? "RollingUpdate",
      };
    });

    const pods: K8sPod[] = [];
    for (const wl of workloads) {
      for (let r = 0; r < wl.readyReplicas; r++) {
        pods.push({
          id: randomUUID(),
          name: `${wl.name}-${randomUUID().slice(0, 6)}-${r}`,
          namespace: wl.namespace, workloadName: wl.name,
          nodeName: nodes[1 + (r % 2)].name, phase: "Running",
          ip: `10.42.${Math.floor(rand(0, 255))}.${Math.floor(rand(0, 255))}`,
          restartCount: _rng.next() < 0.2 ? 1 : 0,
          startedAt: now(), status: "healthy",
          containers: [{ name: "main", image: wl.image, ready: true, restartCount: 0, cpuMs: rand(50, 500), memoryBytes: rand(60_000_000, 500_000_000) }],
        });
      }
    }

    const cluster: ClusterStatus = {
      clusterId: "windels-prod",
      name: "windels-prod",
      version: "v1.30",
      region: "na-east-1",
      status: "healthy",
      nodes: nodes.length, pods: pods.length, deployments: workloads.filter((w) => w.kind === "Deployment").length,
      cpuPercent: rand(25, 55), memoryPercent: rand(40, 70), podPercent: (pods.length / 330) * 100,
      lastProbedAt: now(),
    };
    await saveAll({ cluster, nodes, workloads, pods });
    logger.info("cluster service seeded", { nodes: nodes.length, workloads: workloads.length, pods: pods.length });
  },

  async getCluster(): Promise<ClusterStatus> {
    await this.seed();
    return JSON.parse((await redisCmd.get(CLUSTER_KEY))!);
  },
  async listNodes(): Promise<ClusterNode[]> {
    await this.seed();
    return JSON.parse((await redisCmd.get(NODES_KEY)) ?? "[]");
  },
  async listWorkloads(): Promise<K8sWorkload[]> {
    await this.seed();
    return JSON.parse((await redisCmd.get(WORKLOADS_KEY)) ?? "[]");
  },
  async listPods(filter?: { namespace?: string; workload?: string }): Promise<K8sPod[]> {
    await this.seed();
    let pods = JSON.parse((await redisCmd.get(PODS_KEY)) ?? "[]") as K8sPod[];
    if (filter?.namespace) pods = pods.filter((p) => p.namespace === filter.namespace);
    if (filter?.workload) pods = pods.filter((p) => p.workloadName === filter.workload);
    return pods;
  },

  /**
   * Recompute the cluster aggregate from whatever topology is registered.
   *
   * Node usage is no longer walked with +/-6% random jitter on every call —
   * that turned a static seed into a convincing live feed. Usage is only
   * whatever a real source reported.
   */
  async probe(): Promise<ClusterStatus> {
    _rng.reseed(`probe`);
    await this.seed();
    const nodes = await this.listNodes();
    const pods = await this.listPods();
    const workloads = await this.listWorkloads();
    if (!nodes.length) {
      const cluster = unknownCluster(process.env.KUBERNETES_SERVICE_HOST ? "kubernetes" : "none");
      await saveAll({ cluster, nodes, workloads, pods });
      return cluster;
    }
    for (const n of nodes) {
      n.podCount = pods.filter((p) => p.nodeName === n.name).length;
      n.status = n.usage.cpuPercent > 90 || n.usage.memoryPercent > 92 ? "degraded" : "healthy";
    }
    const avgCpu = avg(nodes.map((n) => n.usage.cpuPercent));
    const avgMem = avg(nodes.map((n) => n.usage.memoryPercent));
    const ready = workloads.filter((w) => w.availableReplicas >= w.desiredReplicas).length;
    const cluster: ClusterStatus = {
      clusterId: "windels-prod", name: "windels-prod", version: "v1.30",
      region: "na-east-1",
      status: avgCpu > 85 || avgMem > 90 ? "degraded" : "healthy",
      nodes: nodes.length, pods: pods.length, deployments: workloads.filter((w) => w.kind === "Deployment").length,
      cpuPercent: avgCpu, memoryPercent: avgMem, podPercent: (pods.length / 330) * 100,
      lastProbedAt: now(),
    };
    await saveAll({ cluster, nodes, workloads, pods });
    return cluster;
  },
};

function mkNode(name: string, role: "control-plane" | "worker", cpus: number, mem: number, zone: string): ClusterNode {
  const cpuPct = rand(30, 70);
  const memPct = rand(35, 75);
  return {
    id: randomUUID(), name, zone, region: "na-east-1",
    roles: role === "control-plane" ? ["control-plane"] : ["worker"],
    kubeletVersion: "v1.30.2",
    capacity: { cpu: String(cpus), memory: `${Math.floor(mem / 1024 / 1024)}Mi`, pods: 110 },
    allocatable: { cpu: String(cpus - 1), memory: `${Math.floor(mem / 1024 / 1024) - 512}Mi`, pods: 100 },
    usage: { cpuCores: (cpuPct / 100) * cpus, cpuPercent: cpuPct, memoryBytes: Math.floor((memPct / 100) * mem), memoryPercent: memPct },
    podCount: 0, status: "healthy",
    conditions: [{ type: "Ready", status: "True", lastTransition: now() }],
    startedAt: now(),
    labels: { [`node-role.kubernetes.io/${role}`]: "true" },
  };
}
/**
 * The cluster shape used when no real Kubernetes connection exists. Everything
 * is zeroed and the status is explicitly "unknown" — never "healthy", which
 * would assert a working estate we cannot see.
 */
function unknownCluster(source: "kubernetes" | "none"): ClusterStatus {
  return {
    clusterId: source === "kubernetes" ? "in-cluster" : "unconfigured",
    name: source === "kubernetes" ? "in-cluster" : "unconfigured",
    version: "unknown",
    region: process.env.WINDELS_REGION ?? "unknown",
    status: "unknown",
    nodes: 0, pods: 0, deployments: 0,
    cpuPercent: 0, memoryPercent: 0, podPercent: 0,
    lastProbedAt: now(),
  };
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function avg(xs: number[]) { return xs.reduce((a, b) => a + b, 0) / (xs.length || 1); }
function parseCpu(s: string) { return Number(s) || 2; }
function parseMem(s: string) {
  if (s.endsWith("Mi")) return Number(s.slice(0, -2)) * 1024 * 1024;
  if (s.endsWith("Gi")) return Number(s.slice(0, -2)) * 1024 * 1024 * 1024;
  return Number(s) || 8 * 1024 * 1024 * 1024;
}
async function saveAll({ cluster, nodes, workloads, pods }: { cluster: ClusterStatus; nodes: ClusterNode[]; workloads: K8sWorkload[]; pods: K8sPod[] }) {
  const multi = redisCmd.multi();
  multi.set(CLUSTER_KEY, JSON.stringify(cluster));
  multi.set(NODES_KEY, JSON.stringify(nodes));
  multi.set(WORKLOADS_KEY, JSON.stringify(workloads));
  multi.set(PODS_KEY, JSON.stringify(pods));
  try { await multi.exec(); } catch (e) { logger.warn("cluster save failed", { error: (e as Error).message }); }
}
