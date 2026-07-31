/**
 * Enterprise Professional Intelligence Platform singleton (Session 77, Part A).
 * Domain expert agents (gov/healthcare/pharmacy/engineering/legal), lecturer AI with
 * course library, and expert marketplace packages. Agents extend ExpertAgent contract.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { EpExpertAgent, EpCourse, EpExpertPackage, EpDashboard, EpExpertDomain } from "@windels/shared";
const K = { agents:"ep:agents", agent:(id:string)=>`ep:agent:${id}`, courses:"ep:courses", course:(id:string)=>`ep:course:${id}`, packs:"ep:packs", pack:(id:string)=>`ep:pack:${id}`, q24:"ep:q24" };
const j=(s:string)=>JSON.parse(s); const s=(o:any)=>JSON.stringify(o); const uid=(p:string)=>p+randomUUID().slice(0,8);

const EXPERT_SEEDS: Array<Omit<EpExpertAgent,"id"|"lastHeartbeat"|"queries24h">> = [
  { name:"Government Intelligence", domain:"government", specialization:"Policy, regulation, public administration", status:"online", disclaimer:"informational-not-official-advice", accuracyScore:0.89 },
  { name:"Healthcare Intelligence", domain:"healthcare", specialization:"Symptoms, triage, wellness guidance", status:"online", disclaimer:"informational-not-official-advice", accuracyScore:0.86 },
  { name:"Pharmacy Intelligence", domain:"pharmacy", specialization:"Drug interactions, dosage guidance, OTC info", status:"online", disclaimer:"consult-professional", accuracyScore:0.91 },
  { name:"Engineering Intelligence", domain:"engineering", specialization:"Civil/mechanical/electrical/structural reference", status:"online", disclaimer:"informational-not-official-advice", accuracyScore:0.88 },
  { name:"Legal Intelligence", domain:"legal", specialization:"Contract review, compliance, jurisdictional reference", status:"online", disclaimer:"consult-professional", accuracyScore:0.84 },
  { name:"Lecturer AI", domain:"lecturer", specialization:"Personalized multilingual course delivery", status:"online", disclaimer:"educational-only", accuracyScore:0.9 },
];

const COURSE_SEEDS: Array<Omit<EpCourse,"id">> = [
  { title:"Introduction to AI for Enterprise", author:"WINDELS", language:"en", level:"beginner", lessons:12, enrolled:4280, rating:4.7 },
  { title:"Prompt Engineering Masterclass", author:"WINDELS", language:"en", level:"intermediate", lessons:18, enrolled:3102, rating:4.8 },
  { title:"AI Safety & Governance", author:"WINDELS", language:"en", level:"advanced", lessons:22, enrolled:1540, rating:4.6 },
  { title:"Multilingual Business Communication", author:"WINDELS", language:"multi", level:"intermediate", lessons:14, enrolled:980, rating:4.5 },
];

export const ExpertsPlatformService = {
  async ensureBootstrapped() {
    if (await redis.zcard(K.agents) > 0) return;
    for (const seed of EXPERT_SEEDS) {
      const id = uid("ep-");
      const a: EpExpertAgent = { ...seed, id, lastHeartbeat: new Date().toISOString(), queries24h: 0 };
      await redis.zadd(K.agents, 0, id);
      await redis.hset(K.agent(id), "_doc", s(a));
    }
    for (const sc of COURSE_SEEDS) {
      const id = uid("c-");
      await redis.zadd(K.courses, 0, id);
      await redis.hset(K.course(id), "_doc", s({ ...sc, id }));
    }
    const packs = [
      { id: uid("epk-"), name:"Medical Specialist Pack", domain:"healthcare" as EpExpertDomain, description:"Cardiology, neurology, pediatric sub-specialists", sizeMb:240, premium:true, installed:true, author:"windels" },
      { id: uid("epk-"), name:"Engineering Disciplines Bundle", domain:"engineering" as EpExpertDomain, description:"Civil/mechanical/electrical/chemical", sizeMb:180, premium:false, installed:true, author:"windels" },
      { id: uid("epk-"), name:"Legal Jursidictions Pack", domain:"legal" as EpExpertDomain, description:"Multi-jurisdiction legal reference", sizeMb:120, premium:true, installed:false, author:"windels" },
    ];
    for (const p of packs) { await redis.zadd(K.packs, 0, p.id); await redis.hset(K.pack(p.id), "_doc", s(p)); }
  },
  async dashboard(): Promise<EpDashboard> {
    const ids = await redis.zrange(K.agents, 0, -1);
    let online=0; for (const id of ids) { const r=await redis.hgetall(K.agent(id)); if(r._doc && j(r._doc).status==="online") online++; }
    return { experts: ids.length, expertsOnline: online, courses: await redis.zcard(K.courses), packages: await redis.zcard(K.packs), queries24h: Number(await redis.get(K.q24)??0), disclaimerEnforced: true };
  },
  async listAgents(domain?: EpExpertDomain): Promise<EpExpertAgent[]> {
    const ids = await redis.zrange(K.agents, 0, -1);
    const out: EpExpertAgent[]=[]; for(const id of ids){const r=await redis.hgetall(K.agent(id)); if(r._doc){const a=j(r._doc); if(!domain||a.domain===domain) out.push(a);}} return out;
  },
  async query(id: string, _q: string) { await redis.incr(K.q24); return { response:"[expert response placeholder — consult professional disclaimer enforced]", disclaimer:"informational-not-official-advice", expertId: id }; },
  async listCourses(): Promise<EpCourse[]> {
    const ids = await redis.zrange(K.courses,0,-1); const out:EpCourse[]=[]; for(const id of ids){const r=await redis.hgetall(K.course(id)); if(r._doc) out.push(j(r._doc));} return out;
  },
  async listPackages(): Promise<EpExpertPackage[]> {
    const ids = await redis.zrange(K.packs,0,-1); const out:EpExpertPackage[]=[]; for(const id of ids){const r=await redis.hgetall(K.pack(id)); if(r._doc) out.push(j(r._doc));} return out;
  },
};
