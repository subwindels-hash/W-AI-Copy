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
  DhProvenance, DH_PROVENANCE_NOTE,
} from "@windels/shared";
import { makeRng } from "../utils/detRng.js";

// Deterministic demo RNG. Session 168: used ONLY inside the demo-gated seed
// block. It is not reseeded from a logger object, and — critically — it is no
// longer called from endSession(), which is a live user action.
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
  async ensureBootstrapped(logger: any | undefined, oid: string, uid0="user-admin"){
    // Session 168: removed `_rng.reseed(`ensureBootstrapped:${logger}`)`, which
    // seeded the stream from the string interpolation of a logger OBJECT
    // ("ensureBootstrapped:[object Object]") or, from the read paths, the
    // literal "ensureBootstrapped:undefined". It also ran before the exists
    // check and before the demo gate.
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
        totalSessions:randInt(20,400), completedSessions:randInt(20,400), ratedSessions:randInt(10,300),
        avgSessionSec:randInt(90,600),
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

  async dashboard(oid: string): Promise<DigitalHumanDashboard>{
    // Session 168: a read does not seed. bootstrap.ts owns seeding.
    const humans = await this.list(oid);
    const sids = await redis.smembers(K.ss(oid));
    const sessions: DigitalHumanSession[] = [];
    for (const id of sids){const r=await redis.hgetall(K.s(oid,id)); if(r._doc) sessions.push(JSON.parse(r._doc));}
    const byRole:any = Object.fromEntries(AVATAR_ROLES.map(r=>[r,0]));
    const byStyle:any = Object.fromEntries(AVATAR_STYLES.map(s=>[s,0]));
    for (const h of humans){byRole[h.role]++; byStyle[h.style]++;}
    const allLangs = new Set<string>(); humans.forEach(h=>h.languages.forEach(l=>allLangs.add(l)));
    // Session 168 (H3): average over the avatars that actually carry a rating.
    // The prior expression divided by Math.max(1, humans.length), so an org
    // with no avatars — or avatars nobody had rated — reported "0.0%
    // satisfaction", a real-looking score for a product nobody had used.
    // Math.max(1, ...) is how "no denominator" gets silently turned into zero.
    const rated = humans.filter(h=>h.satisfactionPct !== null);
    const timed = humans.filter(h=>h.avgSessionSec !== null && h.completedSessions > 0);

    return {
      total: humans.length,
      ready: humans.filter(h=>h.status==="ready").length,
      live: humans.filter(h=>h.status==="live").length,
      training: humans.filter(h=>h.status==="training").length,
      // Session 168 (H2): counted ONCE, from the session ledger. The prior
      // line was `humans.reduce((s,h)=>s+h.totalSessions,0) + sessions.length`
      // — but startSession() both increments h.totalSessions AND adds a row to
      // the ledger, so every real session was counted twice.
      totalSessions: sessions.length,
      avgSatisfactionPct: rated.length
        ? +(rated.reduce((n,h)=>n+(h.satisfactionPct as number),0)/rated.length).toFixed(1)
        : null,
      avgSessionSec: timed.length
        ? Math.round(timed.reduce((n,h)=>n+(h.avgSessionSec as number),0)/timed.length)
        : null,
      byRole, byStyle, activeSessions: sessions.filter(s=>!s.endedAt).length,
      recent: humans.slice(0,6),
      recentSessions: sessions.sort((a,b)=>(b.startedAt||"").localeCompare(a.startedAt||"")).slice(0,8),
      languagesSupported: allLangs.size,
      provenance: {
        entries: [
          { field: "total / ready / live / training", basis: "measured", detail: "counted from stored avatar documents by status" },
          { field: "totalSessions", basis: "measured", detail: "length of the session ledger, counted once" },
          { field: "activeSessions", basis: "measured", detail: "session rows with no endedAt" },
          { field: "avgSatisfactionPct", basis: "measured", detail: "mean over avatars with at least one rated session; null when none" },
          { field: "avgSessionSec", basis: "measured", detail: "mean over avatars with at least one completed session; null when none" },
          { field: "status", basis: "not_measured", detail: "readiness is declared via markReady(), never inferred from a timer" },
        ],
        note: DH_PROVENANCE_NOTE,
      } satisfies DhProvenance,
    };
  },

  async list(oid: string): Promise<DigitalHuman[]>{
    // Session 168: a read does not seed.
    const ids = await redis.smembers(K.hs(oid));
    const out: DigitalHuman[]=[];
    for (const id of ids){const r=await redis.hgetall(K.h(oid,id)); if(r._doc) out.push(JSON.parse(r._doc));}
    return out.sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
  },

  async create(input:Omit<DigitalHuman,"id"|"organizationId"|"status"|"totalSessions"|"avgSessionSec"|"satisfactionPct"|"createdAt"|"updatedAt"|"lipSyncModel"|"languages"> & {organizationId?:string;languages?:string[]}): Promise<DigitalHuman>{
    // Session 168: was `input.organizationId || "org-windels"`, which silently
    // wrote a caller's record into the house organization whenever the org was
    // missing. A missing tenant is an error, not a default.
    const oid = input.organizationId;
    if (!oid) throw Object.assign(new Error("organizationId is required"), { status: 400 });
    const id=uid("dh-"); const now=new Date().toISOString();
    const h: DigitalHuman = {
      id, organizationId:oid, name:input.name, role:input.role, gender:input.gender, style:input.style,
      appearanceConfig:input.appearanceConfig||{}, voiceId:input.voiceId, personalityProfileId:input.personalityProfileId,
      languages:input.languages||["en"],
      emotionIntensity:input.emotionIntensity??0.6, gestureIntensity:input.gestureIntensity??0.5, eyeContactStrength:input.eyeContactStrength??0.85,
      lipSyncModel:"neural-lipsync-3",
      // Session 168 (H4): a created avatar is a DRAFT. It used to be created as
      // "training" and then flipped to "ready" by a setTimeout(1500ms) commented
      // "simulate training completion" — no model was trained, nothing was
      // rendered or validated; the avatar became "ready" because a timer fired.
      // The timer also died with the process (leaving avatars stuck in
      // "training" forever across a restart) and its Redis write was unawaited
      // and unlogged. A status must be earned: see markReady().
      status:"draft",
      // Session 168 (H5): 0 satisfaction on a brand-new avatar is a 0% rating,
      // not "unmeasured". Both averages are null until something completes.
      totalSessions:0, completedSessions:0, ratedSessions:0,
      avgSessionSec:null, satisfactionPct:null,
      createdAt:now, updatedAt:now, createdBy:input.createdBy,
    };
    await redis.hset(K.h(oid,id),"_doc",s2(h)); await redis.sadd(K.hs(oid),id);
    return h;
  },

  /**
   * Session 168 — the explicit, auditable replacement for the setTimeout that
   * used to fake training completion. Readiness is now something a caller
   * asserts (after a real asset pipeline finishes) rather than something the
   * clock confers.
   */
  async markReady(id:string, oid: string): Promise<DigitalHuman|null>{
    const h = await this.get(id,oid); if(!h) return null;
    h.status = "ready"; h.updatedAt = new Date().toISOString();
    await redis.hset(K.h(oid,id),"_doc",s2(h));
    return h;
  },

  /**
   * Session 168 — the honest way to grow transcriptLength. endSession() used to
   * assign it a random number; a transcript only gets longer because turns
   * happened, so turns are what records it.
   */
  async recordTurn(sid:string, chars:number, oid: string): Promise<DigitalHumanSession|null>{
    const r = await redis.hgetall(K.s(oid,sid)); if(!r._doc) return null;
    const s: DigitalHumanSession = JSON.parse(r._doc);
    if (s.endedAt) throw Object.assign(new Error("session already ended"),{status:409});
    s.transcriptLength += Math.max(0, Math.floor(chars));
    await redis.hset(K.s(oid,sid),"_doc",s2(s));
    return s;
  },

  async startSession(humanId:string, oid: string, participantId?:string, language?:string): Promise<DigitalHumanSession>{
    const h = await this.get(humanId,oid); if(!h) throw Object.assign(new Error("not found"),{status:404});
    const id=uid("ses-"); const now=new Date().toISOString();
    const s: DigitalHumanSession={
      id, humanId, organizationId:oid, startedAt:now, language:language||h.languages[0]||"en", transcriptLength:0, participantId,
    };
    await redis.hset(K.s(oid,id),"_doc",s2(s)); await redis.sadd(K.ss(oid),id);
    h.status="live"; h.totalSessions+=1; h.updatedAt=now; await redis.hset(K.h(oid,humanId),"_doc",s2(h));
    return s;
  },

  /**
   * Session 168 — the most serious fix in this module.
   *
   * This method used to open with `_rng.reseed(`endSession:${sid}`)` and then
   * execute `s.transcriptLength = randInt(20,180)`. endSession is a LIVE USER
   * ACTION: a real person finished a real conversation, and the platform threw
   * away whatever the transcript actually was and wrote an invented number in
   * its place. No demo gate touched it — it ran with WINDELS_DEMO_DATA off, in
   * production, on real sessions. The reseed made the fabrication *stable*
   * (the same session id always produced the same fake length), which is
   * precisely what let it survive review: it looked deterministic, so it
   * looked intentional.
   *
   * transcriptLength is now only ever what recordTurn() measured.
   */
  async endSession(sid:string, oid: string, resolution?:DigitalHumanSession["resolution"], rating?:number): Promise<DigitalHumanSession|null>{
    const r=await redis.hgetall(K.s(oid,sid)); if(!r._doc) return null;
    const s:DigitalHumanSession = JSON.parse(r._doc);
    if (s.endedAt) return s; // already ended — do not double-count
    s.endedAt = new Date().toISOString();
    s.resolution=resolution||"resolved";
    s.satisfactionRating=rating;
    // Measured from the real timestamps, not invented.
    s.durationSec = Math.max(0, Math.round((new Date(s.endedAt).getTime()-new Date(s.startedAt).getTime())/1000));
    await redis.hset(K.s(oid,sid),"_doc",s2(s));

    const h = await this.get(s.humanId, oid); if(h){
      h.status="ready";
      // Session 168 (H6): the average is over sessions that COMPLETED. The old
      // recurrence divided by h.totalSessions, which counts sessions STARTED —
      // start three, end one, and the single real duration was divided by 3.
      const priorCompleted = h.completedSessions;
      h.completedSessions = priorCompleted + 1;
      const priorAvg = h.avgSessionSec ?? 0;
      h.avgSessionSec = Math.round((priorAvg*priorCompleted + s.durationSec)/h.completedSessions);
      if (rating) {
        // Likewise: the satisfaction denominator is the number of RATED
        // sessions, not the number started.
        const priorRated = h.ratedSessions;
        h.ratedSessions = priorRated + 1;
        const priorPct = h.satisfactionPct ?? 0;
        h.satisfactionPct = +(((priorPct*priorRated) + rating*20)/h.ratedSessions).toFixed(1);
      }
      h.updatedAt=s.endedAt;
      await redis.hset(K.h(oid,h.id),"_doc",s2(h));
    }
    return s;
  },

  async get(id:string,oid: string):Promise<DigitalHuman|null>{
    // Session 168: a read does not seed.
    const r=await redis.hgetall(K.h(oid,id)); return r._doc?JSON.parse(r._doc):null;
  },
};
