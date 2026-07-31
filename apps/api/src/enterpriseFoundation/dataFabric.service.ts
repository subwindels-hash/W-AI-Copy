/**
 * DataFabricService — Slice 271: Enterprise Data Fabric.
 * Connectors, data products, lineage.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { FabricConnector, DataProduct, DataLineage, ConnectorStatus, FabricConnectorKind } from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('enterpriseFoundation:dataFabric');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const CONNS = "ef:conns";
const CONN  = (id: string) => `ef:conn:${id}`;
const DPS   = "ef:dps";
const DP    = (id: string) => `ef:dp:${id}`;
const LINS  = "ef:lineage";
const LIN   = (id: string) => `ef:lin:${id}`;

const SER = <T>(v: T) => JSON.stringify(v);
function iso() { return new Date().toISOString(); }

export const DataFabricService = {
  // connectors
  async listConnectors(filter?: { kind?: FabricConnectorKind; status?: ConnectorStatus }): Promise<FabricConnector[]> {
    const ids = await redis.smembers(CONNS);
    const out: FabricConnector[] = [];
    for (const id of ids) {
      const raw = await redis.get(CONN(id));
      if (!raw) continue;
      const c = JSON.parse(raw) as FabricConnector;
      if (filter?.kind && c.kind !== filter.kind) continue;
      if (filter?.status && c.status !== filter.status) continue;
      out.push(c);
    }
    return out.sort((a,b) => b.bytesProcessed24h - a.bytesProcessed24h);
  },
  async getConnector(id: string) {
    const raw = await redis.get(CONN(id));
    return raw ? (JSON.parse(raw) as FabricConnector) : null;
  },
  async registerConnector(input: Omit<FabricConnector, "id"|"datasets"|"rowsProcessed24h"|"bytesProcessed24h"|"latencyMs"|"errorRatePct"|"tags"|"encrypted"> & { tags?: string[] }): Promise<FabricConnector> {
    _rng.reseed(`registerConnector`);
    const id = randomUUID();
    const c: FabricConnector = {
      id, datasets: 0, rowsProcessed24h: 0, bytesProcessed24h: 0,
      latencyMs: 40 + Math.floor(_rng.next()*200), errorRatePct: _rng.next()*0.5,
      tags: input.tags ?? [], encrypted: true, ...input,
    };
    await redis.set(CONN(id), SER(c));
    await redis.sadd(CONNS, id);
    return c;
  },
  async setConnectorStatus(id: string, status: ConnectorStatus) {
    const c = await this.getConnector(id);
    if (!c) return null;
    c.status = status; c.lastSyncAt = iso();
    await redis.set(CONN(id), SER(c));
    return c;
  },
  // data products
  async listProducts(): Promise<DataProduct[]> {
    const ids = await redis.smembers(DPS);
    const out: DataProduct[] = [];
    for (const id of ids) {
      const raw = await redis.get(DP(id));
      if (raw) out.push(JSON.parse(raw) as DataProduct);
    }
    return out;
  },
  async publishProduct(input: Omit<DataProduct, "id"|"updatedAt"|"rows"|"consumers">): Promise<DataProduct> {
    const id = randomUUID();
    const dp: DataProduct = { id, rows: 0, consumers: 0, updatedAt: iso(), ...input };
    await redis.set(DP(id), SER(dp));
    await redis.sadd(DPS, id);
    return dp;
  },
  // lineage
  async listLineage(): Promise<DataLineage[]> {
    const ids = await redis.smembers(LINS);
    const out: DataLineage[] = [];
    for (const id of ids) {
      const raw = await redis.get(LIN(id));
      if (raw) out.push(JSON.parse(raw) as DataLineage);
    }
    return out;
  },
  async addLineage(l: Omit<DataLineage,"id">): Promise<DataLineage> {
    const id = randomUUID();
    const rec: DataLineage = { id, ...l };
    await redis.set(LIN(id), SER(rec));
    await redis.sadd(LINS, id);
    return rec;
  },
  async summary() {
    const cs = await this.listConnectors();
    const dps = await this.listProducts();
    return {
      connectors: cs.length,
      connectorsHealthy: cs.filter(c=>c.status==="connected").length,
      dataProducts: dps.length,
      bytes24h: cs.reduce((a,c)=>a+c.bytesProcessed24h,0),
      rows24h: cs.reduce((a,c)=>a+c.rowsProcessed24h,0),
    };
  },
};
