/**
 * Enterprise Digital Twin Platform (Slice 292) singleton.
 */
import { randomUUID } from "node:crypto";
import type {
  DigitalTwin, TwinEntity, TwinTelemetry,
  TwinKind, TwinStatus, MkEntityKind,
} from "@windels/shared";
import { redisCmd as redis } from "../db/redis.js";

const K = {
  twins: "mk:twins",
  entities: (tid: string) => `mk:twin:${tid}:entities`,
  telemetry: (tid: string) => `mk:twin:${tid}:telemetry`,
};

function hydrateTwin(raw: Record<string, string>): DigitalTwin {
  return {
    id: raw.id, name: raw.name, kind: raw.kind as TwinKind, description: raw.description,
    status: raw.status as TwinStatus, owner: raw.owner, location: raw.location || undefined,
    entitiesCount: Number(raw.entitiesCount), sensorsLive: Number(raw.sensorsLive),
    alertsCount: Number(raw.alertsCount), uptimePct: Number(raw.uptimePct),
    tags: raw.tags ? JSON.parse(raw.tags) : [], iconColor: raw.iconColor,
    createdAt: raw.createdAt, lastSyncAt: raw.lastSyncAt,
  };
}
function dehydrateTwin(t: DigitalTwin): Record<string, string> {
  return {
    id: t.id, name: t.name, kind: t.kind, description: t.description, status: t.status,
    owner: t.owner, location: t.location ?? "", entitiesCount: String(t.entitiesCount),
    sensorsLive: String(t.sensorsLive), alertsCount: String(t.alertsCount),
    uptimePct: String(t.uptimePct), tags: JSON.stringify(t.tags), iconColor: t.iconColor,
    createdAt: t.createdAt, lastSyncAt: t.lastSyncAt,
  };
}
function hydrateEntity(raw: Record<string, string>): TwinEntity {
  return {
    id: raw.id, twinId: raw.twinId, externalId: raw.externalId || undefined, name: raw.name,
    kind: raw.kind as MkEntityKind,
    metadata: raw.metadata ? JSON.parse(raw.metadata) : {}, tags: raw.tags ? JSON.parse(raw.tags) : [],
    position: raw.position ? JSON.parse(raw.position) : undefined,
    parentEntityId: raw.parentEntityId || undefined,
    liveTelemetry: raw.liveTelemetry ? JSON.parse(raw.liveTelemetry) : [],
    status: raw.status as TwinEntity["status"], lastUpdate: raw.lastUpdate,
  };
}

export const DigitalTwinsService = {
  async listTwins(filter?: { kind?: TwinKind; status?: TwinStatus }): Promise<DigitalTwin[]> {
    const ids = await redis.zrange(K.twins, 0, -1);
    const out: DigitalTwin[] = [];
    for (const id of ids) { const raw = await redis.hgetall(`mk:twin:${id}`); if (raw?.id) out.push(hydrateTwin(raw)); }
    if (filter?.kind) return out.filter(t => t.kind === filter.kind);
    if (filter?.status) return out.filter(t => t.status === filter.status);
    return out;
  },
  async getTwin(id: string): Promise<DigitalTwin | null> {
    const raw = await redis.hgetall(`mk:twin:${id}`);
    return raw?.id ? hydrateTwin(raw) : null;
  },
  async createTwin(t: Omit<DigitalTwin,"id"|"createdAt"|"lastSyncAt"|"entitiesCount"|"sensorsLive"|"alertsCount"|"uptimePct">): Promise<DigitalTwin> {
    const id = "tw-" + randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const full: DigitalTwin = { ...t, id, entitiesCount: 0, sensorsLive: 0, alertsCount: 0, uptimePct: 99.9, createdAt: now, lastSyncAt: now };
    const multi = redis.multi();
    multi.zadd(K.twins, 0, id);
    multi.hset(`mk:twin:${id}`, dehydrateTwin(full));
    await multi.exec();
    return full;
  },
  async setTwinStatus(id: string, status: TwinStatus): Promise<DigitalTwin | null> {
    const raw = await redis.hgetall(`mk:twin:${id}`);
    if (!raw?.id) return null;
    await redis.hset(`mk:twin:${id}`, "status", status);
    return this.getTwin(id);
  },
  async listEntities(twinId: string): Promise<TwinEntity[]> {
    const ids = await redis.zrange(K.entities(twinId), 0, -1);
    const out: TwinEntity[] = [];
    for (const id of ids) { const raw = await redis.hgetall(`mk:twin:${twinId}:entity:${id}`); if (raw?.id) out.push(hydrateEntity(raw)); }
    return out;
  },
  async addEntity(twinId: string, e: Omit<TwinEntity,"id"|"twinId"|"liveTelemetry"|"lastUpdate"|"status"> & { initialStatus?: TwinEntity["status"] }): Promise<TwinEntity> {
    const id = "te-" + randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const full: TwinEntity = { id, twinId, liveTelemetry: [], lastUpdate: now, status: e.initialStatus ?? "ok", ...e };
    const multi = redis.multi();
    multi.zadd(K.entities(twinId), 0, id);
    multi.hset(`mk:twin:${twinId}:entity:${id}`, {
      id: full.id, twinId: full.twinId, externalId: full.externalId ?? "", name: full.name, kind: full.kind,
      metadata: JSON.stringify(full.metadata), tags: JSON.stringify(full.tags),
      position: full.position ? JSON.stringify(full.position) : "",
      parentEntityId: full.parentEntityId ?? "",
      liveTelemetry: JSON.stringify(full.liveTelemetry), status: full.status, lastUpdate: full.lastUpdate,
    });
    multi.hincrby(`mk:twin:${twinId}`, "entitiesCount", 1);
    await multi.exec();
    return full;
  },
  async recordTelemetry(twinId: string, entityId: string, metric: string, value: number, unit: string, source: string): Promise<TwinTelemetry> {
    const tel: TwinTelemetry = {
      id: "tl-" + randomUUID().slice(0, 8), twinId, entityId, metric, value, unit, source,
      recordedAt: new Date().toISOString(),
    };
    await redis.zadd(K.telemetry(twinId), Date.now(), JSON.stringify(tel));
    // update entity live telemetry
    const raw = await redis.hgetall(`mk:twin:${twinId}:entity:${entityId}`);
    if (raw?.id) {
      const ent = hydrateEntity(raw);
      const others = ent.liveTelemetry.filter(x => x.metric !== metric);
      others.push({ sensorId: source, metric, value, unit, updatedAt: tel.recordedAt });
      ent.liveTelemetry = others;
      ent.lastUpdate = tel.recordedAt;
      if (metric === "alert" && value > 0) ent.status = "alert";
      await redis.hset(`mk:twin:${twinId}:entity:${entityId}`, "liveTelemetry", JSON.stringify(ent.liveTelemetry), "lastUpdate", ent.lastUpdate, "status", ent.status);
      // rollup counters
      const alerts = (await this.listEntities(twinId)).filter(e => e.status === "alert").length;
      const sensors = (await this.listEntities(twinId)).filter(e => e.kind === "sensor" && e.status !== "offline").length;
      await redis.hset(`mk:twin:${twinId}`, "alertsCount", String(alerts), "sensorsLive", String(sensors), "lastSyncAt", tel.recordedAt);
    }
    return tel;
  },
  async recentTelemetry(twinId: string, limit = 100): Promise<TwinTelemetry[]> {
    const raw = await redis.zrange(K.telemetry(twinId), 0, -1, "REV");
    return raw.slice(0, limit).map(s => JSON.parse(s));
  },
  async summary() {
    const twins = await this.listTwins();
    let entities = 0, sensors = 0, alerts = 0, live = 0;
    for (const t of twins) { entities += t.entitiesCount; sensors += t.sensorsLive; alerts += t.alertsCount; if (t.status === "live") live++; }
    return { twins: twins.length, twinsLive: live, twinEntities: entities, twinSensorsLive: sensors, twinAlerts: alerts };
  },
};
