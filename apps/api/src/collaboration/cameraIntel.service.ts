/**
 * CameraIntelService — Slice 287: Enterprise Live Camera Intelligence.
 *
 * IMPORTANT per spec: output is ADVISORY-ONLY by default — every detection/
 * finding carries verdict = "advisory" and a mandatory advisoryNote unless
 * the pipeline is explicitly wired to an approved enterprise workflow
 * (`approvedWorkflow` is set). The UI surfaces an ADVISORY badge and
 * requires acknowledgement before any downstream action.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  CameraPipeline, Detection, CameraFinding, CameraPipelineKind,
  CameraStatus, DetectionVerdict, CameraFindingKind,
} from "@windels/shared";

const K = {
  pSet: "coll:c:pipes", p: (id: string) => `coll:c:p:${id}`,
  dSet: (pid: string) => `coll:c:${pid}:d`, d: (id: string) => `coll:c:d:${id}`,
  fSet: (pid: string) => `coll:c:${pid}:f`, f: (id: string) => `coll:c:f:${id}`,
};
const SER = <T>(v: T) => JSON.stringify(v);
const iso = () => new Date().toISOString();

async function getAll<T>(setKey: string, keyFn: (id: string) => string): Promise<T[]> {
  const ids = await redis.smembers(setKey);
  const out: T[] = [];
  for (const id of ids) { const raw = await redis.get(keyFn(id)); if (raw) out.push(JSON.parse(raw) as T); }
  return out;
}

export const CameraIntelService = {
  async listPipelines(filter?: { kind?: CameraPipelineKind; status?: CameraStatus }): Promise<CameraPipeline[]> {
    const all = await getAll<CameraPipeline>(K.pSet, K.p);
    let out = all;
    if (filter?.kind) out = out.filter(p => p.kind === filter.kind);
    if (filter?.status) out = out.filter(p => p.status === filter.status);
    return out.sort((a, b) => b.detectionsToday - a.detectionsToday);
  },
  async getPipeline(id: string) {
    const raw = await redis.get(K.p(id));
    return raw ? (JSON.parse(raw) as CameraPipeline) : null;
  },
  async registerPipeline(input: {
    name: string; kind: CameraPipelineKind; site: string; cameraCount?: number;
    fps?: number; resolution?: string; owner?: string; approvedWorkflow?: string; tags?: string[];
  }): Promise<CameraPipeline> {
    const id = randomUUID();
    const verdictDefault: DetectionVerdict = input.approvedWorkflow ? "approved-workflow" : "advisory";
    const p: CameraPipeline = {
      id, name: input.name, kind: input.kind, site: input.site,
      cameraCount: input.cameraCount ?? 1, status: "live",
      modelVersion: "vision-v1.3.0", fps: input.fps ?? 8,
      resolution: input.resolution ?? "1920x1080", verdictDefault,
      detectionsToday: 0, findingsOpen: 0, acknowledgedFindings: 0,
      safetyAlerts24h: 0, uptimePct: 99.5 + Math.random() * 0.5,
      latencyMs: 140 + Math.floor(Math.random() * 220),
      owner: input.owner ?? "vision-ops",
      approvedWorkflow: input.approvedWorkflow,
      tags: input.tags ?? [],
    };
    await redis.set(K.p(id), SER(p));
    await redis.sadd(K.pSet, id);
    return p;
  },
  async setPipelineStatus(id: string, status: CameraStatus): Promise<CameraPipeline | null> {
    const p = await this.getPipeline(id);
    if (!p) return null;
    p.status = status;
    await redis.set(K.p(id), SER(p));
    return p;
  },

  async emitDetection(pid: string, d: Omit<Detection, "id" | "pipelineId" | "timestamp" | "verdict" | "advisoryNote" | "confidenceBand" | "frameId"> & { frameId?: string; confidence?: number; verdict?: DetectionVerdict }): Promise<Detection> {
    const p = await this.getPipeline(pid);
    if (!p) throw new Error("pipeline not found");
    const conf = d.confidence ?? 0.6 + Math.random() * 0.35;
    const band = conf >= 0.9 ? "very-high" : conf >= 0.75 ? "high" : conf >= 0.5 ? "medium" : "low";
    const verdict = d.verdict ?? p.verdictDefault;
    const id = randomUUID();
    const rec: Detection = {
      id, pipelineId: pid, cameraId: d.cameraId, frameId: d.frameId ?? `frame_${Date.now()}`,
      kind: d.kind, label: d.label, confidence: conf, confidenceBand: band,
      bbox: d.bbox, timestamp: iso(), verdict,
      advisoryNote: verdict === "advisory"
        ? "Advisory output — review by a qualified operator required before taking action."
        : "Wired to approved enterprise workflow — automation may proceed per policy.",
    };
    await redis.set(K.d(id), SER(rec));
    await redis.sadd(K.dSet(pid), id);
    p.detectionsToday += 1;
    await redis.set(K.p(pid), SER(p));
    return rec;
  },
  async listDetections(pid: string): Promise<Detection[]> {
    return (await getAll<Detection>(K.dSet(pid), K.d)).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },

  async openFinding(pid: string, detectionId: string, f: Omit<CameraFinding, "id" | "pipelineId" | "detectionId" | "acknowledged" | "createdAt" | "verdict">): Promise<CameraFinding> {
    const p = await this.getPipeline(pid);
    if (!p) throw new Error("pipeline not found");
    const id = randomUUID();
    const rec: CameraFinding = {
      id, pipelineId: pid, detectionId, acknowledged: false,
      createdAt: iso(), verdict: p.verdictDefault, ...f,
    };
    await redis.set(K.f(id), SER(rec));
    await redis.sadd(K.fSet(pid), id);
    p.findingsOpen += 1;
    if (f.kind === "safety-violation" || f.kind === "ppe-missing" || f.severity === "critical") p.safetyAlerts24h += 1;
    await redis.set(K.p(pid), SER(p));
    return rec;
  },
  async listFindings(pid: string): Promise<CameraFinding[]> {
    return (await getAll<CameraFinding>(K.fSet(pid), K.f)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async listAllFindings(): Promise<CameraFinding[]> {
    const pipes = await this.listPipelines();
    const all: CameraFinding[] = [];
    for (const p of pipes) all.push(...(await this.listFindings(p.id)));
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async acknowledgeFinding(pid: string, id: string, by: string): Promise<CameraFinding | null> {
    const raw = await redis.get(K.f(id));
    if (!raw) return null;
    const f = JSON.parse(raw) as CameraFinding;
    f.acknowledged = true;
    f.acknowledgedBy = by;
    f.acknowledgedAt = iso();
    await redis.set(K.f(id), SER(f));
    const p = await this.getPipeline(pid);
    if (p) { p.acknowledgedFindings += 1; p.findingsOpen = Math.max(0, p.findingsOpen - 1); await redis.set(K.p(pid), SER(p)); }
    return f;
  },

  async summary() {
    const pipes = await this.listPipelines();
    let dets = 0, open = 0, safety = 0, advisory = 0, total = 0, latency = 0;
    for (const p of pipes) {
      dets += p.detectionsToday;
      open += p.findingsOpen;
      safety += p.safetyAlerts24h;
      latency += p.latencyMs;
      const fs = await this.listFindings(p.id);
      total += fs.length;
      advisory += fs.filter(x => x.verdict === "advisory").length;
    }
    return {
      cameraPipelines: pipes.length,
      camerasLive: pipes.filter(p => p.status === "live").reduce((a, p) => a + p.cameraCount, 0),
      detections24h: dets,
      openFindings: open,
      safetyAlerts24h: safety,
      advisoryFindingsPct: total ? Math.round((advisory / total) * 100) : 100,
      avgCameraLatencyMs: pipes.length ? Math.round(latency / pipes.length) : 0,
    };
  },
};
