/**
 * Session 58 — Enterprise Spatial Computing Platform.
 * AR/VR/MR/XR sessions, holographic dashboards, indoor navigation/maps,
 * remote expert, spatial workflow automation. Syncs with memory/twin/gcc.
 * Keys: spa:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import {
  SpatialSession, SpatialMode, SPATIAL_MODES, SpatialStatus,
  HolographicDashboard, SpatialWaypoint, IndoorMap, RemoteExpertSession,
  SpatialDashboard,
} from "@windels/shared";

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
};
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0,8);
function rand(min:number,max:number) { return Math.random()*(max-min)+min; }
function randInt(min:number,max:number) { return Math.floor(rand(min,max+1)); }

const SEED_SESSIONS: Array<{title:string;mode:SpatialMode;device:SpatialSession["deviceTarget"];host:string}> = [
  {title:"Executive War Room — Q3", mode:"xr", device:"vision_pro", host:"user-admin"},
  {title:"Factory Walkthrough Line-3", mode:"ar", device:"hololens", host:"user-admin"},
  {title:"VR Onboarding — AI Workforce", mode:"vr", device:"quest", host:"user-admin"},
];

const SEED_MAPS: Array<{building:string;floors:number;area:number}> = [
  {building:"HQ NYC", floors:12, area: 28000},
  {building:"Factory-A", floors:2, area: 54000},
  {building:"Warehouse-NE", floors:1, area: 18000},
];

const SEED_HOLO: Array<{name:string;layout:HolographicDashboard["layout"];metrics:number}> = [
  {name:"Mission Control Holograph", layout:"command_wall", metrics: 24},
  {name:"Revenue Globe", layout:"globular", metrics: 12},
  {name:"AI Workforce Battlefield", layout:"battlefield", metrics: 18},
];

export const SpatialService = {
  async ensureBootstrapped(logger?: any, oid = "org-windels", uid0 = "user-admin") {
    if (await redis.exists(K.ss(oid))) return;
    const now = new Date().toISOString();
    for (const s of SEED_SESSIONS) {
      const id = uid("sps-");
      const sess: SpatialSession = {
        id, organizationId: oid, title: s.title, mode: s.mode, host: s.host, participants: [uid0],
        status: (["streaming","idle","recording"] as SpatialStatus[])[randInt(0,2)],
        deviceTarget: s.device, anchorCount: randInt(6,60),
        startedAt: new Date(Date.now()-randInt(5, 120)*60000).toISOString(),
        createdAt: now,
      };
      await redis.hset(K.s(oid,id),"_doc",s2(sess)); await redis.sadd(K.ss(oid),id);
    }
    for (const m of SEED_MAPS) {
      const id = uid("map-");
      const wps = randInt(30, 180);
      for (let i=0;i<wps;i++) {
        const wpid = uid("wp-");
        const wp: SpatialWaypoint = {
          id: wpid, building: m.building, floor: `${randInt(1,m.floors)}F`,
          x: +rand(0,m.area/10).toFixed(1), y: +rand(0,m.area/10).toFixed(1), z: +rand(0,20).toFixed(1),
          label: `WP-${i+1}`, kind: (["destination","poi","hazard","asset","waypoint"] as SpatialWaypoint["kind"][])[randInt(0,4)],
        };
        await redis.hset(K.wp(oid,wpid),"_doc",s2(wp)); await redis.sadd(K.wps(oid),wpid);
      }
      const mp: IndoorMap = { id, building: m.building, floors: m.floors, areaSqm: m.area, waypoints: wps, updatedAt: now };
      await redis.hset(K.mp(oid,id),"_doc",s2(mp)); await redis.sadd(K.mps(oid),id);
    }
    for (const h of SEED_HOLO) {
      const id = uid("holo-");
      const hd: HolographicDashboard = { id, name: h.name, layout: h.layout, metricCount: h.metrics, createdAt: now, lastOpenedAt: now };
      await redis.hset(K.hd(oid,id),"_doc",s2(hd)); await redis.sadd(K.hds(oid),id);
    }
    // Remote expert
    const rx: RemoteExpertSession = {
      id: uid("rx-"), expertUserId: uid0, fieldUserId: "user-field-1", mode: "ar",
      startedAt: new Date(Date.now()-15*60000).toISOString(), annotationsCount: 7,
    };
    await redis.hset(K.rx(oid,rx.id),"_doc",s2(rx)); await redis.sadd(K.rxs(oid),rx.id);
    logger?.info?.("[spatial] bootstrap complete");
  },

  async dashboard(oid = "org-windels"): Promise<SpatialDashboard> {
    const [sids, mids, hids, wids, rxids] = await Promise.all([
      redis.smembers(K.ss(oid)), redis.smembers(K.mps(oid)), redis.smembers(K.hds(oid)), redis.smembers(K.wps(oid)), redis.smembers(K.rxs(oid)),
    ]);
    const multiGet = async <T,>(ids: string[], keyFn:(id:string)=>string): Promise<T[]> => {
      const out: T[] = [];
      for (const id of ids) { const r = await redis.hgetall(keyFn(id)); if (r._doc) out.push(JSON.parse(r._doc)); }
      return out;
    };
    const [sessions, maps, holos, waypoints, remote] = await Promise.all([
      multiGet<SpatialSession>(sids, (id)=>K.s(oid,id)),
      multiGet<IndoorMap>(mids, (id)=>K.mp(oid,id)),
      multiGet<HolographicDashboard>(hids, (id)=>K.hd(oid,id)),
      multiGet<SpatialWaypoint>(wids, (id)=>K.wp(oid,id)),
      multiGet<RemoteExpertSession>(rxids, (id)=>K.rx(oid,id)),
    ]);
    const today = new Date(); today.setHours(0,0,0,0);
    const byModeMap: Record<string, number> = {};
    for (const s of sessions) byModeMap[s.mode] = (byModeMap[s.mode]||0)+1;
    const byMode = SPATIAL_MODES.map((m: any)=>({mode:m, count:byModeMap[m]||0}));
    return {
      activeSessions: sessions.filter(s=>s.status==="streaming"||s.status==="recording").length,
      totalSessions: sessions.length,
      devicesOnline: randInt(8, 80),
      holoDashboards: holos.length,
      indoorMaps: maps.length,
      waypoints: waypoints.length,
      remoteSessionsToday: remote.filter(r=>new Date(r.startedAt)>=today).length,
      twinsVisualized: randInt(3, 12),
      byMode, recent: sessions.slice(0,6), waypointsRecent: waypoints.slice(0,8),
    };
  },

  async listSessions(oid = "org-windels"): Promise<SpatialSession[]> {
    const ids = await redis.smembers(K.ss(oid));
    const out: SpatialSession[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.s(oid,id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out.sort((a,b)=>(b.startedAt||b.createdAt).localeCompare(a.startedAt||a.createdAt));
  },

  async createSession(input: { title: string; mode: SpatialMode; deviceTarget: SpatialSession["deviceTarget"]; host?: string; twinId?: string; organizationId?: string }): Promise<SpatialSession> {
    const oid = input.organizationId || "org-windels";
    const id = uid("sps-"); const now = new Date().toISOString();
    const s: SpatialSession = {
      id, organizationId: oid, title: input.title, mode: input.mode, host: input.host || "user-admin",
      participants: [input.host || "user-admin"], status: "streaming", deviceTarget: input.deviceTarget,
      twinId: input.twinId, anchorCount: 0, startedAt: now, createdAt: now,
    };
    await redis.hset(K.s(oid,id),"_doc",s2(s)); await redis.sadd(K.ss(oid),id);
    return s;
  },

  async endSession(id: string, oid = "org-windels"): Promise<SpatialSession | null> {
    const r = await redis.hgetall(K.s(oid,id)); if (!r._doc) return null;
    const s: SpatialSession = JSON.parse(r._doc);
    s.status = "idle"; s.endedAt = new Date().toISOString();
    await redis.hset(K.s(oid,id),"_doc",s2(s));
    return s;
  },
};
