/**
 * Knowledge Synchronization service (Slice 170).
 *
 * Subscribes to the Session 18 Event Bus and projects relevant domain events
 * into the Knowledge Graph + Memory Platform (so, e.g. every user.created
 * becomes a KG entity and an episodic memory). Also exposes on-demand sync
 * jobs with run status for backfills and manual re-syncs.
 */
import { randomUUID } from "node:crypto";
import { EventBusService } from "../events/eventBus.service.js";
import { KnowledgeGraphService } from "../knowledgeGraph/knowledgeGraph.service.js";
import { MemoryService } from "../memory/memory.service.js";
import { SchemaGovernanceService } from "../dataArchitecture/schemaGovernance.service.js";
import { logger } from "../../observability/logger.js";
import type { SyncJob, SyncRunResult } from "@windels/shared/dataPlatform";

const jobs = new Map<string, SyncJob>();
const recentRuns: SyncRunResult[] = [];
const MAX_RUNS = 50;

function defaultJobs(): SyncJob[] {
  return [
    {
      id: "job:event:service-registered",
      name: "Event → KG: service lifecycle",
      source: "service.registered,service.deregistered",
      target: "kg",
      status: "idle", runs: 0, entitiesCreated: 0, memoriesCreated: 0, enabled: true,
    },
    {
      id: "job:event:user-domain",
      name: "Event → KG/Memory: user domain",
      source: "user.created,user.deleted,user.updated",
      target: "both",
      status: "idle", runs: 0, entitiesCreated: 0, memoriesCreated: 0, enabled: true,
    },
    {
      id: "job:catalog:sync-assets",
      name: "Data Catalog ↔ KG",
      source: "data-catalog-scan",
      target: "kg",
      status: "idle", runs: 0, entitiesCreated: 0, memoriesCreated: 0, enabled: true,
    },
    {
      id: "job:event:test-events",
      name: "Event → Memory: test.e2e",
      source: "e2e.test.event,test.event",
      target: "memory",
      status: "idle", runs: 0, entitiesCreated: 0, memoriesCreated: 0, enabled: true,
    },
  ];
}

// ── Wire up event subscribers ───────────────────────────────────────
function wire() {
  // Subscribe to wildcard event bus — filter in handler to avoid per-type loops.
  try {
    EventBusService.subscribe("*", "data-sync", async (evt: any) => {
      const type = evt?.type as string | undefined;
      if (!type) return;
      const job = [...jobs.values()].find(j => j.enabled && j.source.split(",").map(s => s.trim()).includes(type));
      if (!job) return;
      await runJob(job.id, { trigger: "event", event: evt }).catch((e) => {
        logger.warn("sync job failed on event", { job: job.id, err: e });
      });
    });
  } catch (e) {
    logger.warn("sync service failed to subscribe to event bus", { err: e });
  }
}

setTimeout(wire, 1000);

// ── Individual runners ──────────────────────────────────────────────
async function processServiceEvent(evt: any, job: SyncJob, startedAt: string): Promise<Omit<SyncRunResult, "jobId"|"startedAt"|"finishedAt"|"durationMs">> {
  let entitiesUpserted = 0, relationsUpserted = 0, memoriesUpserted = 0, processed = 0, errors: string[] = [];
  try {
    const serviceId = evt.payload?.serviceId ?? "unknown";
    if (job.target === "kg" || job.target === "both") {
      const entity = await KnowledgeGraphService.upsertEntity({
        id: `service:${serviceId}`, kind: "service",
        name: evt.payload?.name ?? serviceId,
        attributes: { version: evt.payload?.version, producer: evt.producer },
        tags: ["service"],
        provenance: { source: "event-bus", sourceId: evt.id },
      });
      entitiesUpserted++;
      // Link to platform
      await KnowledgeGraphService.addRelation({
        from: "service:windels-api", to: entity.id, kind: evt.type === "service.deregistered" ? "related_to" : "related_to",
        provenance: { source: "event-bus", sourceId: evt.id },
      }); relationsUpserted++;
    }
    if (job.target === "memory" || job.target === "both") {
      await MemoryService.remember({
        namespace: "global", scopeId: "platform",
        type: "episode",
        content: `Event ${evt.type} from ${evt.producer}: ${JSON.stringify(evt.payload ?? {}).slice(0, 400)}`,
        tags: ["event", evt.type], importance: 0.4, source: `event:${evt.id}`,
        metadata: { eventType: evt.type, correlationId: evt.correlationId },
      });
      memoriesUpserted++;
    }
    processed = 1;
  } catch (e: any) { errors.push(String(e?.message ?? e)); }
  return { entitiesUpserted, relationsUpserted, memoriesUpserted, processed, errors };
}

async function processUserEvent(evt: any, _job: SyncJob): Promise<Omit<SyncRunResult,"jobId"|"startedAt"|"finishedAt"|"durationMs"|"errors"> & {errors:string[]}> {
  let entitiesUpserted = 0, relationsUpserted = 0, memoriesUpserted = 0, processed = 1, errors: string[] = [];
  try {
    const uid = evt.payload?.userId ?? evt.payload?.id ?? evt.producer;
    await KnowledgeGraphService.upsertEntity({
      id: `user:${uid}`, kind: "user",
      name: evt.payload?.name ?? evt.payload?.email ?? String(uid),
      attributes: { email: evt.payload?.email },
      tags: ["user"],
      provenance: { source: "event-bus", sourceId: evt.id },
    }); entitiesUpserted++;
    await MemoryService.remember({
      namespace: "global", scopeId: "platform",
      type: "episode",
      content: `User event ${evt.type}: ${JSON.stringify(evt.payload ?? {}).slice(0,300)}`,
      tags: ["event","user",evt.type], importance: 0.35, source: `event:${evt.id}`,
    }); memoriesUpserted++;
  } catch (e: any) { errors.push(String(e?.message ?? e)); }
  return { entitiesUpserted, relationsUpserted, memoriesUpserted, processed, errors };
}

async function processCatalogScan(_evt: any, _job: SyncJob): Promise<Omit<SyncRunResult,"jobId"|"startedAt"|"finishedAt"|"durationMs"|"errors"> & {errors:string[]}> {
  let entitiesUpserted = 0, relationsUpserted = 0, memoriesUpserted = 0, processed = 0, errors: string[] = [];
  try {
    const assets = SchemaGovernanceService.list();
    for (const a of assets) {
      await KnowledgeGraphService.upsertEntity({
        id: `asset:${a.id}`, kind: "document", name: a.name,
        attributes: { kind: a.kind, namespace: a.namespace, classification: a.classification },
        tags: ["data-asset", ...a.tags],
        provenance: { source: "data-catalog-scan" },
      }); entitiesUpserted++;
      for (const tgt of a.lineage?.targets ?? []) {
        const to = assets.find(x => x.name === tgt);
        if (to) {
          await KnowledgeGraphService.addRelation({
            from: `asset:${a.id}`, to: `asset:${to.id}`, kind: "depends_on",
            provenance: { source: "data-catalog-scan" },
          }); relationsUpserted++;
        }
      }
      processed++;
    }
  } catch (e: any) { errors.push(String(e?.message ?? e)); }
  return { entitiesUpserted, relationsUpserted, memoriesUpserted, processed, errors };
}

async function processTestEvent(evt: any, _job: SyncJob): Promise<Omit<SyncRunResult,"jobId"|"startedAt"|"finishedAt"|"durationMs"|"errors"> & {errors:string[]}> {
  let entitiesUpserted = 0, relationsUpserted = 0, memoriesUpserted = 0, processed = 1, errors: string[] = [];
  try {
    await MemoryService.remember({
      namespace: "global", scopeId: "platform",
      type: "episode",
      content: `Test event ${evt.type}: ${JSON.stringify(evt.payload ?? {}).slice(0,400)}`,
      tags: ["test", evt.type], importance: 0.2, source: `event:${evt.id}`,
    }); memoriesUpserted++;
  } catch (e: any) { errors.push(String(e?.message ?? e)); }
  return { entitiesUpserted, relationsUpserted, memoriesUpserted, processed, errors };
}

async function runJob(id: string, opts: { trigger?: string; event?: any } = {}): Promise<SyncRunResult> {
  if (jobs.size === 0) for (const j of defaultJobs()) jobs.set(j.id, j);
  const job = jobs.get(id);
  if (!job) throw new Error(`unknown sync job: ${id}`);
  const startedAt = new Date().toISOString();
  job.status = "running";
  let stats;
  try {
    if (id === "job:event:service-registered") stats = await processServiceEvent(opts.event ?? {}, job, startedAt);
    else if (id === "job:event:user-domain") stats = await processUserEvent(opts.event ?? {}, job);
    else if (id === "job:catalog:sync-assets") stats = await processCatalogScan(opts.event ?? {}, job);
    else if (id === "job:event:test-events") stats = await processTestEvent(opts.event ?? {}, job);
    else {
      // Generic: record an episodic memory
      await MemoryService.remember({
        namespace: "global", scopeId: "platform",
        type: "episode", content: `Sync job ${job.name} executed (trigger=${opts.trigger ?? "manual"})`,
        tags: ["sync", job.id], importance: 0.3, source: `sync:${id}`,
      });
      stats = { entitiesUpserted: 0, relationsUpserted: 0, memoriesUpserted: 1, processed: 1, errors: [] };
    }
    const finishedAt = new Date().toISOString();
    const base: Omit<SyncRunResult,"jobId"|"startedAt"|"finishedAt"|"durationMs"> = stats ?? { entitiesUpserted:0, relationsUpserted:0, memoriesUpserted:0, processed:0, errors: [] };
    const result: SyncRunResult = {
      jobId: id, startedAt, finishedAt,
      durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
      ...base,
    };
    job.lastRunAt = finishedAt;
    job.lastDurationMs = result.durationMs;
    job.entitiesCreated += result.entitiesUpserted;
    job.memoriesCreated += result.memoriesUpserted;
    job.runs += 1;
    job.status = result.errors.length ? "error" : "idle";
    job.lastError = result.errors[0];
    recentRuns.unshift(result);
    if (recentRuns.length > MAX_RUNS) recentRuns.length = MAX_RUNS;
    logger.info("sync job finished", { id, durationMs: result.durationMs, entities: result.entitiesUpserted, memories: result.memoriesUpserted, errors: result.errors.length });
    return result;
  } catch (e: any) {
    job.status = "error";
    job.lastError = String(e?.message ?? e);
    throw e;
  }
}

// ── Public API ───────────────────────────────────────────────────────
export const SyncService = {
  listJobs(): SyncJob[] { return [...jobs.values()]; },
  getJob(id: string): SyncJob | undefined { return jobs.get(id); },
  async toggle(id: string, enabled: boolean): Promise<SyncJob | null> {
    const j = jobs.get(id); if (!j) return null;
    j.enabled = enabled; return j;
  },
  runNow: runJob,
  recentRuns(limit = 20): SyncRunResult[] { return recentRuns.slice(0, limit); },
  /** Bootstrap the default catalog sync on boot. */
  async bootstrap() {
    if (jobs.size === 0) for (const j of defaultJobs()) jobs.set(j.id, j);
    try { await runJob("job:catalog:sync-assets", { trigger: "bootstrap" }); }
    catch (e) { logger.warn("catalog bootstrap sync failed", { err: e }); }
  },
};
