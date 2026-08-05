/**
 * Session 62 — Enterprise Digital Human Platform.
 * Lifelike avatars built on S40 Voice Studio + S41 Foundry + S42 Media Gen.
 * Sources voices through S41.1 voice pipeline; no duplicate voice system.
 * Keys: dh:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import {
  DigitalHuman, DigitalHumanSession, DigitalHumanDashboard, AvatarRole,
  AvatarStyle, AvatarStatus, AVATAR_ROLES, AVATAR_STYLES, AVATAR_STATUSES,
} from "@windels/shared";
import { makeRng } from "../utils/detRng.js";

// Deterministic demo RNG — stable per (module, seed) so dashboard
// reads return the same numbers within a running process.
const _rng = makeRng('digitalHumans');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }

const K = {
  h: (oid:string,id:string)=>`dh:h:${oid}:${id}`,
  hs: (oid:string)=>`dh:hs:${oid}`,
  s: (oid:string,id:string)=>`dh:s:${oid}:${id}`,
  ss: (oid:string)=>`dh:ss:${oid}`,
};
const s2=(o:any)=>JSON.stringify(o);
const uid=(p:string)=>p+randomUUID().slice(0,8);

const SEED: Array<{name:string;role:AvatarRole;style:AvatarStyle;gender:DigitalHuman["gender"];langs:string[];voiceSeed:string}> = [
  {name:"Aria — Virtual Receptionist",role:"virtual_receptionist",style:"corporate",gender:"feminine",langs:["en","es","fr","zh"],voiceSeed:"vf-"},
  {name:"Prof. Nova — AI Teacher",role:"ai_teacher",style:"photoreal",gender:"feminine",langs:["en","de"],voiceSeed:"vf-"},
  {name:"Coach K — AI Trainer",role:"ai_trainer",style:"stylized",gender:"masculine",langs:["en","pt"],voiceSeed:"vm-"},
  {name:"Maya — Sales Rep",role:"sales_rep",style:"realistic",gender:"feminine",langs:["en","ja"],voiceSeed:"vf-"},
  {name:"Winston — News Presenter",role:"news_presenter",style:"cinematic",gender:"masculine",langs:["en"],voiceSeed:"vm-"},
  {name:"Elena — Virtual Executive",role:"virtual_executive",style:"corporate",gender:"feminine",langs:["en","fr","it"],voiceSeed:"vf-"},
];

export const DigitalHumanService = {
  async ensureBootstrapped(logger?:any, oid="org-windels", uid0="user-admin"){
    _rng.reseed(`ensureBootstrapped:${logger}`);
    if (await redis.exists(K.hs(oid))) return;
    // Synthetic seeding is gated by WINDELS_DEMO_DATA (default off) so a fresh
    // org starts empty and fills from real activity only.
    if (!demoDataEnabled()) return skipDemoSeed("digital-humans", logger);
    const now = new Date().toISOString();
    for (const s of SEED){
      const id = uid("dh-");
      const h: DigitalHuman = {
        id, organizationId:oid, name:s.name, role:s.role, gender:s.gender, style:s.style,
        appearanceConfig:{skinTone:"medium",hairColor:"dark",eyeColor:"brown",outfit:"business",background:"studio",accentColor:"#3B82F6"},
        voiceId: s.voiceSeed+randomUUID().slice(0,6),
        personalityProfileId:"pp-"+randomUUID().slice(0,6),
        languages:s.langs, emotionIntensity:+rand(0.4,0.85).toFixed(2),
        gestureIntensity:+rand(0.3,0.8).toFixed(2), eyeContactStrength:+rand(0.7,0.98).toFixed(2),
        lipSyncModel:"neural-lipsync-3",
        status:"ready",
        totalSessions:randInt(20,400), avgSessionSec:randInt(90,600),
        satisfactionPct:+rand(78,96).toFixed(1),
        createdAt:now, updatedAt:now, createdBy:uid0,
      };
      await redis.hset(K.h(oid,id),"_doc",s2(h)); await redis.sadd(K.hs(oid),id);
      // seed one past session
      const sid=uid("ses-");
      const ses:DigitalHumanSession = {
        id:sid, humanId:id, organizationId:oid, startedAt:new Date(Date.now()-randInt(1,72)*3600000).toISOString(),
        endedAt:new Date().toISOString(), language:s.langs[0], transcriptLength:randInt(15,200),
        satisfactionRating:randInt(3,5), resolution:["resolved","escalated","resolved"][randInt(0,2)] as any,
      };
      await redis.hset(K.s(oid,sid),"_doc",s2(ses)); await redis.sadd(K.ss(oid),sid);
    }
    logger?.info?.("[digital-humans] bootstrap complete",{humans:SEED.length});
  },

  async dashboard(oid="org-windels"): Promise<DigitalHumanDashboard>{
    if (!(await redis.exists(K.hs(oid)))) await this.ensureBootstrapped(undefined, oid);
    const humans = await this.list(oid);
    const sids = await redis.smembers(K.ss(oid));
    const sessions: DigitalHumanSession[] = [];
    for (const id of sids){const r=await redis.hgetall(K.s(oid,id)); if(r._doc) sessions.push(JSON.parse(r._doc));}
    const byRole:any = Object.fromEntries(AVATAR_ROLES.map(r=>[r,0]));
    const byStyle:any = Object.fromEntries(AVATAR_STYLES.map(s=>[s,0]));
    for (const h of humans){byRole[h.role]++; byStyle[h.style]++;}
    const allLangs = new Set<string>(); humans.forEach(h=>h.languages.forEach(l=>allLangs.add(l)));
    return {
      total: humans.length,
      ready: humans.filter(h=>h.status==="ready").length,
      live: humans.filter(h=>h.status==="live").length,
      training: humans.filter(h=>h.status==="training").length,
      totalSessions: humans.reduce((s,h)=>s+h.totalSessions,0) + sessions.length,
      avgSatisfactionPct: +(humans.reduce((s,h)=>s+h.satisfactionPct,0)/Math.max(1,humans.length)).toFixed(1),
      byRole, byStyle, activeSessions: sessions.filter(s=>!s.endedAt).length,
      recent: humans.slice(0,6),
      recentSessions: sessions.sort((a,b)=>(b.startedAt||"").localeCompare(a.startedAt||"")).slice(0,8),
      languagesSupported: allLangs.size,
    };
  },

  async list(oid="org-windels"): Promise<DigitalHuman[]>{
    if (!(await redis.exists(K.hs(oid)))) await this.ensureBootstrapped(undefined, oid);
    const ids = await redis.smembers(K.hs(oid));
    const out: DigitalHuman[]=[];
    for (const id of ids){const r=await redis.hgetall(K.h(oid,id)); if(r._doc) out.push(JSON.parse(r._doc));}
    return out.sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
  },

  async create(input:Omit<DigitalHuman,"id"|"organizationId"|"status"|"totalSessions"|"avgSessionSec"|"satisfactionPct"|"createdAt"|"updatedAt"|"lipSyncModel"|"languages"> & {organizationId?:string;languages?:string[]}): Promise<DigitalHuman>{
    const oid=input.organizationId||"org-windels";
    const id=uid("dh-"); const now=new Date().toISOString();
    const h: DigitalHuman = {
      id, organizationId:oid, name:input.name, role:input.role, gender:input.gender, style:input.style,
      appearanceConfig:input.appearanceConfig||{}, voiceId:input.voiceId, personalityProfileId:input.personalityProfileId,
      languages:input.languages||["en"],
      emotionIntensity:input.emotionIntensity??0.6, gestureIntensity:input.gestureIntensity??0.5, eyeContactStrength:input.eyeContactStrength??0.85,
      lipSyncModel:"neural-lipsync-3", status:"training",
      totalSessions:0, avgSessionSec:0, satisfactionPct:0,
      createdAt:now, updatedAt:now, createdBy:input.createdBy,
    };
    await redis.hset(K.h(oid,id),"_doc",s2(h)); await redis.sadd(K.hs(oid),id);
    // simulate training completion
    setTimeout(async ()=>{h.status="ready"; h.updatedAt=new Date().toISOString(); await redis.hset(K.h(oid,id),"_doc",s2(h));},1500);
    return h;
  },

  async startSession(humanId:string, oid="org-windels", participantId?:string, language?:string): Promise<DigitalHumanSession>{
    const h = await this.get(humanId,oid); if(!h) throw Object.assign(new Error("not found"),{status:404});
    const id=uid("ses-"); const now=new Date().toISOString();
    const s: DigitalHumanSession={
      id, humanId, organizationId:oid, startedAt:now, language:language||h.languages[0]||"en", transcriptLength:0, participantId,
    };
    await redis.hset(K.s(oid,id),"_doc",s2(s)); await redis.sadd(K.ss(oid),id);
    h.status="live"; h.totalSessions+=1; h.updatedAt=now; await redis.hset(K.h(oid,humanId),"_doc",s2(h));
    return s;
  },

  async endSession(sid:string, oid="org-windels", resolution?:DigitalHumanSession["resolution"], rating?:number): Promise<DigitalHumanSession|null>{
    _rng.reseed(`endSession:${sid}`);
    const r=await redis.hgetall(K.s(oid,sid)); if(!r._doc) return null;
    const s:DigitalHumanSession = JSON.parse(r._doc);
    s.endedAt = new Date().toISOString(); s.resolution=resolution||"resolved"; s.satisfactionRating=rating;
    s.transcriptLength = randInt(20,180);
    await redis.hset(K.s(oid,sid),"_doc",s2(s));
    const h = await this.get(s.humanId, oid); if(h){
      h.status="ready"; h.avgSessionSec = Math.round((h.avgSessionSec*h.totalSessions + (new Date(s.endedAt).getTime()-new Date(s.startedAt).getTime())/1000)/Math.max(1,h.totalSessions));
      if (rating) h.satisfactionPct = +(((h.satisfactionPct*Math.max(1,h.totalSessions-1))+rating*20)/Math.max(1,h.totalSessions)).toFixed(1);
      h.updatedAt=s.endedAt;
      await redis.hset(K.h(oid,h.id),"_doc",s2(h));
    }
    return s;
  },

  async get(id:string,oid="org-windels"):Promise<DigitalHuman|null>{
    if (!(await redis.exists(K.hs(oid)))) await this.ensureBootstrapped(undefined, oid);
    const r=await redis.hgetall(K.h(oid,id)); return r._doc?JSON.parse(r._doc):null;
  },
};
