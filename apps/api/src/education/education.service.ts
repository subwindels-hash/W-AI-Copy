/**
 * Session 67 — Enterprise Education & Learning Platform.
 * AI tutor, personalized learning paths, course builder, assessments,
 * certification (reuses S56.10 cert logic), corporate learning, skill tracking.
 * Keys: edu:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { EducationDashboard, LearningContent, LearningPath, TutorSession, Assessment, Skill } from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable per (module, seed) so dashboard
// reads return the same numbers within a running process.
const _rng = makeRng('education');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const K = {
  c: (oid:string,id:string)=>`edu:c:${oid}:${id}`, cs:(oid:string)=>`edu:cs:${oid}`,
  p: (oid:string,id:string)=>`edu:p:${oid}:${id}`, ps:(oid:string)=>`edu:ps:${oid}`,
  t: (oid:string,id:string)=>`edu:t:${oid}:${id}`, ts:(oid:string)=>`edu:ts:${oid}`,
  a: (oid:string,id:string)=>`edu:a:${oid}:${id}`, as:(oid:string)=>`edu:as:${oid}`,
  sk: (oid:string,id:string)=>`edu:sk:${oid}:${id}`, sks:(oid:string)=>`edu:sks:${oid}`,
};
const s2=(o:any)=>JSON.stringify(o); const uid=(p:string)=>p+randomUUID().slice(0,8);
const CONTENT_SEED: Array<{title:string;kind:LearningContent["kind"];diff:LearningContent["difficulty"];dur:number;tags:string[];mods?:number}> = [
  {title:"AI Literacy for Leaders",kind:"course",diff:"beginner",dur:90,tags:["ai","leadership"],mods:5},
  {title:"Prompt Engineering 101",kind:"lesson",diff:"beginner",dur:25,tags:["prompts","ai"]},
  {title:"Responsible AI Practices",kind:"course",diff:"intermediate",dur:120,tags:["responsible","governance"],mods:6},
  {title:"Workflow Builder Certification",kind:"certification_prep",diff:"advanced",dur:240,tags:["workflow","certification"],mods:8},
  {title:"Knowledge Graph Essentials",kind:"lesson",diff:"intermediate",dur:45,tags:["kg","data"]},
  {title:"AI Sales Agent Mastery",kind:"course",diff:"intermediate",dur:180,tags:["sales","agents"],mods:7},
  {title:"Intro to Data Privacy",kind:"lesson",diff:"beginner",dur:30,tags:["privacy"]},
  {title:"Capstone — Build Your First Agent",kind:"project",diff:"advanced",dur:360,tags:["agents","project"]},
  {title:"Voice Studio Admin Path",kind:"path",diff:"intermediate",dur:480,tags:["voice","studio"]},
  {title:"Compliance Quiz — AI Act",kind:"quiz",diff:"intermediate",dur:15,tags:["compliance","ai-act"]},
];

const SKILLS = [
  {name:"Prompt Engineering",cat:"AI Fundamentals"},{name:"Agent Design",cat:"AI Fundamentals"},{name:"Workflow Composition",cat:"AI Fundamentals"},
  {name:"Data Analysis",cat:"Data"},{name:"Knowledge Graphs",cat:"Data"},{name:"RAG Patterns",cat:"Data"},
  {name:"Voice Design",cat:"Multimodal"},{name:"Video Production",cat:"Multimodal"},
  {name:"Governance",cat:"Compliance"},{name:"Responsible AI",cat:"Compliance"},{name:"Audit & Review",cat:"Compliance"},
  {name:"Leadership Briefings",cat:"Leadership"},{name:"ROI Measurement",cat:"Leadership"},
];

export const EducationService = {
  async ensureBootstrapped(logger?:any, oid="org-windels", uid0="user-admin"){
    _rng.reseed(`ensureBootstrapped:${logger}`);
    if (await redis.exists(K.cs(oid))) return;
    const now=new Date().toISOString();
    for (const c of CONTENT_SEED){
      const id=uid("lc-");
      const content: LearningContent = {
        id,title:c.title,kind:c.kind,author:uid0,description:`${c.title} — auto-generated course content.`,durationMin:c.dur,difficulty:c.diff,
        tags:c.tags, modulesCount:c.mods, status:"published",
        rating:+rand(3.6,4.9).toFixed(2), enrollments:randInt(20,800), completions:randInt(5,400),
        certificationId: c.kind==="certification_prep" ? "cert-"+randomUUID().slice(0,6) : undefined,
        createdAt:now, updatedAt:now,
      };
      await redis.hset(K.c(oid,id),"_doc",s2(content)); await redis.sadd(K.cs(oid),id);
    }
    for (const s of SKILLS){
      const id=uid("sk-");
      const sk:Skill={id,name:s.name,category:s.cat,level:randInt(0,5),target:5,lastPracticedAt:new Date(Date.now()-randInt(1,30)*86400000).toISOString()};
      await redis.hset(K.sk(oid,id),"_doc",s2(sk)); await redis.sadd(K.sks(oid),id);
    }
    // seed one assessment and one tutor session
    const cid = (await redis.smembers(K.cs(oid)))[0];
    const aid=uid("as-");
    const asmt:Assessment={id:aid,contentId:cid,userId:uid0,scorePct:+rand(55,98).toFixed(1),passed:true,questions:randInt(8,20),correct:randInt(6,20),timeSpentSec:randInt(120,900),takenAt:new Date(Date.now()-randInt(1,5)*86400000).toISOString()};
    await redis.hset(K.a(oid,aid),"_doc",s2(asmt)); await redis.sadd(K.as(oid),aid);
    const tid=uid("ts-");
    const ts:TutorSession={id:tid,userId:uid0,topic:"Intro to AI",startedAt:new Date(Date.now()-30*60000).toISOString(),messages:8,masteryDelta:+rand(0.02,0.15).toFixed(3),adaptiveDifficulty:+rand(0.3,0.9).toFixed(2)};
    await redis.hset(K.t(oid,tid),"_doc",s2(ts)); await redis.sadd(K.ts(oid),tid);
    logger?.info?.("[education] bootstrap complete",{content:CONTENT_SEED.length});
  },

  async dashboard(oid="org-windels"):Promise<EducationDashboard>{
    if (!(await redis.exists(K.cs(oid)))) await this.ensureBootstrapped(undefined, oid);
    const [cids,tids,aids,sids]=await Promise.all([redis.smembers(K.cs(oid)),redis.smembers(K.ts(oid)),redis.smembers(K.as(oid)),redis.smembers(K.sks(oid))]);
    const getArr = async <T,>(ids:string[],keyFn:(id:string)=>string):Promise<T[]>=>{const out:T[]=[]; for(const id of ids){const r=await redis.hgetall(keyFn(id)); if(r._doc) out.push(JSON.parse(r._doc));} return out;};
    const [content,tutors,assessments,skills]=await Promise.all([getArr<LearningContent>(cids,(id)=>K.c(oid,id)),getArr<TutorSession>(tids,(id)=>K.t(oid,id)),getArr<Assessment>(aids,(id)=>K.a(oid,id)),getArr<Skill>(sids,(id)=>K.sk(oid,id))]);
    const published = content.filter(c=>c.status==="published");
    const completions30 = assessments.filter(a=>Date.now()-new Date(a.takenAt).getTime()<30*86400000).length;
    const hours = Math.round(content.filter(c=>c.status==="published").reduce((s,c)=>s+c.durationMin*c.completions,0)/60);
    const mastery = skills.length ? skills.reduce((s,x)=>s+x.level,0)/(skills.length*5) : 0;
    const cats:Record<string,{lvl:number;cnt:number}>={};
    for (const s of skills){ const e = cats[s.category] || {lvl:0,cnt:0}; e.lvl+=s.level; e.cnt++; cats[s.category]=e;}
    const skillCategories = Object.entries(cats).map(([category,v])=>({category,avgLevel:+(v.lvl/v.cnt).toFixed(2),count:v.cnt}));
    const pids = await redis.smembers(K.ps(oid));
    return {
      totalContent:content.length, publishedContent:published.length,
      activeLearners: Math.max(1, Math.round(content.reduce((s,c)=>s+c.enrollments,0)/20)),
      completions30d: completions30, avgMasteryPct: +(mastery*100).toFixed(1),
      certificationsIssued: content.filter(c=>c.kind==="certification_prep" && c.completions>10).length,
      hoursLearned30d: hours,
      popularContent: [...content].sort((a,b)=>b.enrollments-a.enrollments).slice(0,6),
      recentAssessments: assessments.sort((a,b)=>b.takenAt.localeCompare(a.takenAt)).slice(0,6),
      activeTutorSessions: tutors.filter(t=>!t.endedAt).length,
      skillCategories, pathsInProgress: pids.length,
    };
  },

  async startTutor(topic:string, userId:string, oid="org-windels"):Promise<TutorSession>{
    const id=uid("ts-");
    const s: TutorSession={id,userId,topic,startedAt:new Date().toISOString(),messages:0};
    await redis.hset(K.t(oid,id),"_doc",s2(s)); await redis.sadd(K.ts(oid),id);
    return s;
  },

  async createPath(input:{title:string;goal:string;contentIds:string[];userId:string;targetDate?:string;organizationId?:string}):Promise<LearningPath>{
    const oid=input.organizationId||"org-windels"; const id=uid("lp-");
    const p: LearningPath = {id,title:input.title,userId:input.userId,goal:input.goal,contentIds:input.contentIds,progressPct:0,startedAt:new Date().toISOString(),targetDate:input.targetDate};
    await redis.hset(K.p(oid,id),"_doc",s2(p)); await redis.sadd(K.ps(oid),id);
    return p;
  },

  async assess(contentId:string, userId:string, scorePct:number, correct:number, questions:number, timeSpentSec:number, oid="org-windels"):Promise<Assessment>{
    const id=uid("as-");
    const a: Assessment={id,contentId,userId,scorePct,passed:scorePct>=70,questions,correct,timeSpentSec,takenAt:new Date().toISOString()};
    await redis.hset(K.a(oid,id),"_doc",s2(a)); await redis.sadd(K.as(oid),id);
    return a;
  },
};
