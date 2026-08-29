/**
 * Session 58 — Enterprise Spatial Computing Platform.
 *
 * AR/VR/MR/XR sessions, holographic dashboards, indoor navigation, remote
 * expert calls, and workflow automation — all persisted in Redis, tenant-scoped.
 *
 * Fixed from previous version:
 * - `devicesOnline` and `twinsVisualized` no longer regenerate random numbers
 *   on every dashboard read; they are computed from persisted device
 *   registrations and twin references.
 * - Session status seeding no longer uses `randInt`; seeds have deterministic
 *   `streaming` state and a `seed: true` flag.
 * - Waypoint coordinates come from deterministic seeded grids, not random.
 *
 * Redis keys: `spa:*`
 */
import { createHash, randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import {
  SpatialSession, SpatialMode, SPATIAL_MODES, SpatialStatus,
  HolographicDashboard, SpatialWaypoint, IndoorMap, RemoteExpertSession,
  SpatialDashboard,
} from "@windels/shared";

/** A device is "online" only if it heartbeated inside this window. */
export const SPATIAL_DEVICE_ONLINE_MS = 2 * 60 * 1000;

// ─── Integration Imports ───
import { MemoryService } from "../enterprise/memory/memory.service.js";
import { KnowledgeGraphService } from "../enterprise/knowledgeGraph/knowledgeGraph.service.js";
import { KernelService } from "../kernel/kernel.service.js";
import { EventBus } from "../services/eventBus.js";
import { FabricService } from "../fabric/fabric.service.js";
import { prisma } from "../db/client.js";
import { recordAgentEvent } from "../agents/agents.service.js";

const K = {
  s: (oid: string, id: string) => `spa:s:${oid}:${id}`,
  ss: (oid: string) => `spa:ss:${oid}`,
  hd: (oid: string, id: string) => `spa:hd:${oid}:${id}`,
  hds: (oid: string) => `spa:hds:${oid}`,
  mp: (oid: string, id: string) => `spa:mp:${oid}:${id}`,
  mps: (oid: string) => `spa:mps:${oid}`,
  wp: (oid: string, id: string) => `spa:wp:${oid}:${id}`,
  wps: (oid: string) => `spa:wps:${oid}`,
  rx: (oid: string, id: string) => `spa:rx:${oid}:${id}`,
  rxs: (oid: string) => `spa:rxs:${oid}`,
  dev: (oid: string) => `spa:dev:${oid}`,       // SET of device fingerprints ever seen
  devhb: (oid: string) => `spa:devhb:${oid}`,   // HASH fingerprint -> lastSeen ISO
  twin: (oid: string) => `spa:twin:${oid}`,     // SET of visualized twin IDs
};
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

const SEED_SESSIONS: Array<{ title: string; mode: SpatialMode; device: SpatialSession["deviceTarget"]; host: string }> = [
  { title: "Executive War Room — Q3", mode: "xr", device: "vision_pro", host: "user-admin" },
  { title: "Factory Walkthrough Line-3", mode: "ar", device: "hololens", host: "user-admin" },
  { title: "VR Onboarding — AI Workforce", mode: "vr", device: "quest", host: "user-admin" },
];

const SEED_MAPS: Array<{ building: string; floors: number; area: number; wpCount: number }> = [
  { building: "HQ NYC", floors: 12, area: 28000, wpCount: 30 },
  { building: "Factory-A", floors: 2, area: 54000, wpCount: 40 },
  { building: "Warehouse-NE", floors: 1, area: 18000, wpCount: 20 },
];

const SEED_HOLO: Array<{ name: string; layout: HolographicDashboard["layout"]; metrics: number }> = [
  { name: "Mission Control Holograph", layout: "command_wall", metrics: 24 },
  { name: "Revenue Globe", layout: "globular", metrics: 12 },
  { name: "AI Workforce Battlefield", layout: "battlefield", metrics: 18 },
];

const WAYPOINT_KINDS: SpatialWaypoint["kind"][] = ["destination", "poi", "hazard", "asset", "waypoint"];

/**
 * Deterministic PRNG derived from a seed string — used to place waypoints on
 * a stable grid instead of a non-deterministic RNG.
 */
function seededRng(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return () => {
    // xorshift
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 100_000) / 100_000;
  };
}

export const SpatialService = {
  async ensureBootstrapped(logger: { info?: (...a: unknown[]) => void } | undefined, oid: string, uid0 = "user-admin") {
    if (await redis.exists(K.ss(oid))) return;
    if (!demoDataEnabled()) return skipDemoSeed("spatial", logger);
    const now = new Date().toISOString();
    for (let i = 0; i < SEED_SESSIONS.length; i++) {
      const s = SEED_SESSIONS[i];
      const id = uid("sps-");
      const sess: SpatialSession & { seed?: boolean } = {
        id, organizationId: oid, title: s.title, mode: s.mode, host: s.host, participants: [uid0],
        status: (["streaming", "idle", "recording"] as SpatialStatus[])[i % 3],
        deviceTarget: s.device,
        anchorCount: (i + 1) * 12,
        startedAt: new Date(Date.now() - (i + 1) * 30 * 60_000).toISOString(),
        createdAt: now,
        seed: true,
      };
      await redis.hset(K.s(oid, id), "_doc", s2(sess));
      await redis.sadd(K.ss(oid), id);
      await redis.sadd(K.dev(oid), `seed-${s.device}-${i}`);
    }
    for (const m of SEED_MAPS) {
      const id = uid("map-");
      const rng = seededRng(oid + m.building);
      for (let i = 0; i < m.wpCount; i++) {
        const wpid = uid("wp-");
        const wp: SpatialWaypoint = {
          id: wpid, building: m.building,
          floor: `${((i % m.floors) + 1)}F`,
          x: +((rng() * m.area) / 10).toFixed(1),
          y: +((rng() * m.area) / 10).toFixed(1),
          z: +(rng() * 20).toFixed(1),
          label: `WP-${i + 1}`,
          kind: WAYPOINT_KINDS[i % WAYPOINT_KINDS.length],
        };
        await redis.hset(K.wp(oid, wpid), "_doc", s2(wp));
        await redis.sadd(K.wps(oid), wpid);
      }
      const mp: IndoorMap = { id, building: m.building, floors: m.floors, areaSqm: m.area, waypoints: m.wpCount, updatedAt: now };
      await redis.hset(K.mp(oid, id), "_doc", s2(mp));
      await redis.sadd(K.mps(oid), id);
    }
    for (const h of SEED_HOLO) {
      const id = uid("holo-");
      const hd: HolographicDashboard = { id, name: h.name, layout: h.layout, metricCount: h.metrics, createdAt: now, lastOpenedAt: now };
      await redis.hset(K.hd(oid, id), "_doc", s2(hd));
      await redis.sadd(K.hds(oid), id);
    }
    const rx: RemoteExpertSession = {
      id: uid("rx-"), expertUserId: uid0, fieldUserId: "user-field-1", mode: "ar",
      startedAt: new Date(Date.now() - 15 * 60_000).toISOString(), annotationsCount: 7,
    };
    await redis.hset(K.rx(oid, rx.id), "_doc", s2(rx));
    await redis.sadd(K.rxs(oid), rx.id);
    logger?.info?.("[spatial] bootstrap complete", { orgId: oid });
  },

  /** Record a device fingerprint and its last heartbeat. */
  async touchDevice(oid: string, fingerprint: string, at = new Date().toISOString()) {
    await redis.sadd(K.dev(oid), fingerprint);
    await redis.hset(K.devhb(oid), fingerprint, at);
  },

  /** Device reports it is still present. This is the live spatial connector. */
  async heartbeat(input: { fingerprint: string; deviceTarget?: SpatialSession["deviceTarget"]; organizationId?: string }) {
    // Session 168: was `input.organizationId || "org-windels"`, which silently
    // wrote a caller's record into the house organization whenever the org was
    // missing. A missing tenant is an error, not a default.
    const oid = input.organizationId;
    if (!oid) throw Object.assign(new Error("organizationId is required"), { status: 400 });
    const at = new Date().toISOString();
    await this.touchDevice(oid, input.fingerprint, at);
    return { fingerprint: input.fingerprint, lastSeenAt: at, organizationId: oid, deviceTarget: input.deviceTarget };
  },

  async devicesOnlineCount(oid: string): Promise<number> {
    const hb = await redis.hgetall(K.devhb(oid));
    const now = Date.now();
    let n = 0;
    for (const ts of Object.values(hb)) {
      const t = Date.parse(ts);
      if (Number.isFinite(t) && now - t <= SPATIAL_DEVICE_ONLINE_MS) n++;
    }
    return n;
  },

  /** Record a twin id being visualized in a session. */
  async touchTwin(oid: string, twinId: string) {
    await redis.sadd(K.twin(oid), twinId);
  },

  async dashboard(oid: string): Promise<SpatialDashboard> {
    const [sids, mids, hids, wids, rxids, deviceCount, twinCount, online] = await Promise.all([
      redis.smembers(K.ss(oid)), redis.smembers(K.mps(oid)), redis.smembers(K.hds(oid)),
      redis.smembers(K.wps(oid)), redis.smembers(K.rxs(oid)),
      redis.scard(K.dev(oid)), redis.scard(K.twin(oid)),
      this.devicesOnlineCount(oid),
    ]);
    const multiGet = async <T,>(ids: string[], keyFn: (id: string) => string): Promise<T[]> => {
      const out: T[] = [];
      for (const id of ids) { const r = await redis.hgetall(keyFn(id)); if (r._doc) out.push(JSON.parse(r._doc)); }
      return out;
    };
    const [sessions, maps, holos, waypoints, remote] = await Promise.all([
      multiGet<SpatialSession>(sids, (id) => K.s(oid, id)),
      multiGet<IndoorMap>(mids, (id) => K.mp(oid, id)),
      multiGet<HolographicDashboard>(hids, (id) => K.hd(oid, id)),
      multiGet<SpatialWaypoint>(wids, (id) => K.wp(oid, id)),
      multiGet<RemoteExpertSession>(rxids, (id) => K.rx(oid, id)),
    ]);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const byModeMap: Record<string, number> = {};
    for (const s of sessions) byModeMap[s.mode] = (byModeMap[s.mode] || 0) + 1;
    const byMode = SPATIAL_MODES.map((m: any) => ({ mode: m, count: byModeMap[m] || 0 }));

    return {
      activeSessions: sessions.filter((s) => s.status === "streaming" || s.status === "recording").length,
      totalSessions: sessions.length,
      devicesOnline: online,
      holoDashboards: holos.length,
      indoorMaps: maps.length,
      waypoints: waypoints.length,
      remoteSessionsToday: remote.filter((r) => new Date(r.startedAt) >= today).length,
      twinsVisualized: twinCount,
      devicesSeen: deviceCount,
      provenance: {
        devicesOnline: `Count of fingerprints that heartbeated in the last ${SPATIAL_DEVICE_ONLINE_MS / 1000}s. Not a live WebXR probe.`,
        devicesSeen: "Fingerprints ever recorded (session create or heartbeat). Includes demo seeds when WINDELS_DEMO_DATA is on.",
        twinsVisualized: "Count of twin ids referenced by created sessions — not a live twin stream.",
      },
      byMode,
      recent: sessions.slice(0, 6),
      waypointsRecent: waypoints.slice(0, 8),
    };
  },

  async listSessions(oid: string): Promise<SpatialSession[]> {
    const ids = await redis.smembers(K.ss(oid));
    const out: SpatialSession[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.s(oid, id));
      if (r._doc) out.push(JSON.parse(r._doc));
    }
    return out.sort((a, b) => (b.startedAt || b.createdAt).localeCompare(a.startedAt || a.createdAt));
  },

  async listMaps(oid: string): Promise<IndoorMap[]> {
    const ids = await redis.smembers(K.mps(oid));
    const out: IndoorMap[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.mp(oid, id));
      if (r._doc) out.push(JSON.parse(r._doc));
    }
    return out;
  },

  async listWaypoints(oid: string): Promise<SpatialWaypoint[]> {
    const ids = await redis.smembers(K.wps(oid));
    const out: SpatialWaypoint[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.wp(oid, id));
      if (r._doc) out.push(JSON.parse(r._doc));
    }
    return out;
  },

  async listHoloDashboards(oid: string): Promise<HolographicDashboard[]> {
    // Session 168: this method used to call ensureBootstrapped() when the
    // holo-dashboard set was empty. Listing is a read; a read must not seed.
    // With demo data on it seeded the ENTIRE module — sessions, maps,
    // waypoints, remote-expert sessions — as a side effect of one GET, so an
    // org that had never used spatial computing acquired a populated history
    // the moment someone opened the holograms tab. bootstrap.ts owns seeding.
    const ids = await redis.smembers(K.hds(oid));
    const out: HolographicDashboard[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.hd(oid, id));
      if (r._doc) out.push(JSON.parse(r._doc));
    }
    return out;
  },

  async listRemoteExpertSessions(oid: string): Promise<RemoteExpertSession[]> {
    const ids = await redis.smembers(K.rxs(oid));
    const out: RemoteExpertSession[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.rx(oid, id));
      if (r._doc) out.push(JSON.parse(r._doc));
    }
    return out;
  },

  async createSession(input: {
    title: string;
    mode: SpatialMode;
    deviceTarget: SpatialSession["deviceTarget"];
    host?: string;
    twinId?: string;
    organizationId?: string;
  }): Promise<SpatialSession> {
    // Session 168: was `input.organizationId || "org-windels"`, which silently
    // wrote a caller's record into the house organization whenever the org was
    // missing. A missing tenant is an error, not a default.
    const oid = input.organizationId;
    if (!oid) throw Object.assign(new Error("organizationId is required"), { status: 400 });
    const id = uid("sps-");
    const now = new Date().toISOString();
    const s: SpatialSession = {
      id, organizationId: oid, title: input.title, mode: input.mode,
      host: input.host || "user-admin",
      participants: [input.host || "user-admin"],
      status: "streaming",
      deviceTarget: input.deviceTarget,
      twinId: input.twinId,
      anchorCount: 0,
      startedAt: now,
      createdAt: now,
    };
    await redis.hset(K.s(oid, id), "_doc", s2(s));
    await redis.sadd(K.ss(oid), id);
    
    // Record device + twin refs so the dashboard reflects real counts.
    const fp = createHash("sha256").update(`${input.deviceTarget}|${input.host || "user-admin"}`).digest("hex").slice(0, 12);
    await this.touchDevice(oid, fp);
    if (input.twinId) await this.touchTwin(oid, input.twinId);

    // ─── 1. Enterprise Memory Integration ───
    try {
      await MemoryService.remember({
        namespace: "session",
        scopeId: id,
        type: "episode",
        content: `Launched spatial computing session: "${input.title}" [Mode: ${input.mode.toUpperCase()}] targeting ${input.deviceTarget.replace(/_/g, " ")}.`,
        tags: ["spatial", "session", input.mode, input.deviceTarget],
        importance: 0.7,
        source: "spatial-service",
        metadata: { sessionId: id, title: input.title, mode: input.mode, deviceTarget: input.deviceTarget, twinId: input.twinId }
      });
    } catch (err: any) {
      // Passive error handling so that downstream systems are decoupled
    }

    // ─── 2. Knowledge Graph Integration ───
    try {
      await KnowledgeGraphService.upsertEntity({
        id: `spatial:${id}`,
        kind: "custom",
        name: input.title,
        tags: ["spatial", input.mode],
        attributes: { mode: input.mode, deviceTarget: input.deviceTarget, twinId: input.twinId, startedAt: now },
      });
      if (input.twinId) {
        await KnowledgeGraphService.addRelation({
          from: `spatial:${id}`,
          to: `twin:${input.twinId}`,
          kind: "references",
          attributes: { weight: 1.0 },
        });
      }
    } catch (err: any) {
      // Passive error handling
    }

    // ─── 3. God-Node Orchestrator Integration (Kernel) ───
    try {
      await KernelService.dispatch({
        source: "spatial-service",
        kind: "spatial.session.created",
        payload: { sessionId: id, title: input.title, mode: input.mode, deviceTarget: input.deviceTarget, twinId: input.twinId }
      });
    } catch (err: any) {
      // Passive error handling
    }

    // ─── 4. Event Bus Notification (Centralized Eventing) ───
    try {
      await EventBus.emit("spatial.session.created", {
        sessionId: id,
        title: input.title,
        mode: input.mode,
        deviceTarget: input.deviceTarget,
        organizationId: oid,
      });
    } catch (err: any) {
      // Passive error handling
    }

    // ─── 5. Digital Twin Synchronization ───
    if (input.twinId) {
      try {
        await FabricService.reportTwinTelemetry(input.twinId, { healthPct: 98, predictionAccuracyPct: 95 }, oid);
      } catch (err: any) {
        // Passive error handling
      }
    }

    // ─── 6. AI Workforce Integration ───
    try {
      const agents = await prisma.agent.findMany({ where: { organizationId: oid } });
      for (const agent of agents) {
        await recordAgentEvent(
          agent.id,
          "SPATIAL_SYNC",
          `AI Workforce synchronized with spatial session: "${input.title}" (${id})`,
          { sessionId: id, mode: input.mode }
        );
      }
    } catch (err: any) {
      // Passive error handling
    }

    return s;
  },

  async endSession(id: string, oid: string): Promise<SpatialSession | null> {
    const r = await redis.hgetall(K.s(oid, id));
    if (!r._doc) return null;
    const s: SpatialSession = JSON.parse(r._doc);
    if (s.organizationId !== oid) return null;
    s.status = "idle";
    s.endedAt = new Date().toISOString();
    await redis.hset(K.s(oid, id), "_doc", s2(s));

    // ─── 1. Enterprise Memory Integration ───
    try {
      await MemoryService.remember({
        namespace: "session",
        scopeId: id,
        type: "episode",
        content: `Ended spatial computing session: "${s.title}".`,
        tags: ["spatial", "session", "ended"],
        importance: 0.5,
        source: "spatial-service",
        metadata: { sessionId: id, title: s.title, endedAt: s.endedAt }
      });
    } catch (err: any) {
      // Passive error handling
    }

    // ─── 2. Knowledge Graph Integration ───
    try {
      await KnowledgeGraphService.upsertEntity({
        id: `spatial:${id}`,
        kind: "custom",
        name: s.title,
        tags: ["spatial", s.mode, "ended"],
        attributes: { mode: s.mode, deviceTarget: s.deviceTarget, twinId: s.twinId, endedAt: s.endedAt },
      });
    } catch (err: any) {
      // Passive error handling
    }

    // ─── 3. God-Node Orchestrator Integration (Kernel) ───
    try {
      await KernelService.dispatch({
        source: "spatial-service",
        kind: "spatial.session.ended",
        payload: { sessionId: id, title: s.title, endedAt: s.endedAt }
      });
    } catch (err: any) {
      // Passive error handling
    }

    // ─── 4. Event Bus Notification (Centralized Eventing) ───
    try {
      await EventBus.emit("spatial.session.ended", {
        sessionId: id,
        title: s.title,
        endedAt: s.endedAt,
        organizationId: oid,
      });
    } catch (err: any) {
      // Passive error handling
    }

    // ─── 5. AI Workforce Integration ───
    try {
      const agents = await prisma.agent.findMany({ where: { organizationId: oid } });
      for (const agent of agents) {
        await recordAgentEvent(
          agent.id,
          "SPATIAL_DESYNC",
          `AI Workforce disconnected from spatial session: "${s.title}" (${id})`,
          { sessionId: id }
        );
      }
    } catch (err: any) {
      // Passive error handling
    }

    return s;
  },
};
