/**
 * Session 66 — Enterprise Legal Intelligence Suite.
 * Matters, regulatory updates, contracts (CLM), legal research, compliance checks, risk, legal KG.
 * Keys: leg:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { LegalDashboard, LegalMatter, RegulatoryUpdate, Contract, LegalResearchItem, LegalComplianceCheck } from "@windels/shared";

const K = {
  m:(oid:string,id:string)=>`leg:m:${oid}:${id}`, ms:(oid:string)=>`leg:ms:${oid}`,
  u:(oid:string,id:string)=>`leg:u:${oid}:${id}`, us:(oid:string)=>`leg:us:${oid}`,
  c:(oid:string,id:string)=>`leg:c:${oid}:${id}`, cs:(oid:string)=>`leg:cs:${oid}`,
  r:(oid:string,id:string)=>`leg:r:${oid}:${id}`, rs:(oid:string)=>`leg:rs:${oid}`,
  chk:(oid:string,id:string)=>`leg:chk:${oid}:${id}`, chks:(oid:string)=>`leg:chks:${oid}`,
};
const s2=(o:any)=>JSON.stringify(o); const uid=(p:string)=>p+randomUUID().slice(0,8);
function rand(min:number,max:number){return (min+max)/2;} // deterministic
function randInt(min:number,max:number){return Math.floor(rand(min,max+1));}

const MATTER_SEED = [
  {title:"Acme Corp patent dispute",kind:"litigation",risk:78},
  {title:"Q2 vendor contract negotiation",kind:"contract",risk:28},
  {title:"EU AI Act compliance review",kind:"regulatory",risk:62},
  {title:"Employee IP assignment review",kind:"employment",risk:18},
  {title:"Board governance advisory",kind:"advisory",risk:12},
];
const REG_SEED = [
  {jur:"EU",title:"AI Act — general purpose AI provisions",topic:"ai",impact:"high"},
  {jur:"US-FTC",title:"Data broker disclosure rule",topic:"privacy",impact:"medium"},
  {jur:"CA",title:"CPRA amendments 2026",topic:"privacy",impact:"medium"},
  {jur:"UK",title:"Online Safety Act phase 2",topic:"platform-safety",impact:"low"},
  {jur:"Global",title:"ISO 42001 AI management systems",topic:"ai",impact:"medium"},
];
const CONTRACTS_SEED = [
  {title:"MSA — Globex Logistics",type:"msa",value:480000,party:"Globex"},
  {title:"NDA — Initech partners",type:"nda",party:"Initech"},
  {title:"SOW — Platform v2 rollout",type:"sow",value:120000,party:"Hooli"},
  {title:"Office lease — HQ NYC",type:"lease",value:2400000,party:"REIT Holdings"},
  {title:"Enterprise license — Acme",type:"license",value:320000,party:"Acme"},
  {title:"Employment — CTO offer",type:"employment",party:"Individual"},
];
const FRAMEWORKS = ["SOC2","GDPR","HIPAA","ISO27001","SOX","PCI-DSS"];

export const LegalService = {
  async ensureBootstrapped(logger?:any, oid="org-windels", uid0="user-admin"){
    if (await redis.exists(K.ms(oid))) return;
    const now=new Date().toISOString();
    for (const m of MATTER_SEED){
      const id=uid("mat-");
      const mt: LegalMatter = {
        id,title:m.title, kind:m.kind as any,
        status:(["open","active","review"] as LegalMatter["status"][])[randInt(0,2)],
        riskScore:m.risk, owner:uid0,
        dueDate: new Date(Date.now()+randInt(7,120)*86400000).toISOString(),
        openedAt: new Date(Date.now()-randInt(5,200)*86400000).toISOString(), updatedAt:now,
        summary: m.title + " — pre-seeded matter.",
      };
      await redis.hset(K.m(oid,id),"_doc",s2(mt)); await redis.sadd(K.ms(oid),id);
    }
    for (const u of REG_SEED){
      const id=uid("reg-");
      const ru: RegulatoryUpdate={id,jurisdiction:u.jur,title:u.title,topic:u.topic,effectiveAt:new Date(Date.now()+120*86400000).toISOString(),impact:u.impact as any,summary:u.title,publishedAt:new Date(Date.now()-7*86400000).toISOString(),acknowledged:false};
      await redis.hset(K.u(oid,id),"_doc",s2(ru)); await redis.sadd(K.us(oid),id);
    }
    for (const c of CONTRACTS_SEED){
      const id=uid("ctr-");
      const ct: Contract = {
        id,title:c.title,counterparty:c.party,type:c.type as any,
        status:(["signed","negotiating","review","draft"] as Contract["status"][])[randInt(0,3)],
        valueUsd:c.value, startDate:new Date(Date.now()-randInt(30,500)*86400000).toISOString(),
        endDate:new Date(Date.now()+randInt(60,800)*86400000).toISOString(),
        riskFlags: [], clausesCount: 22,
        owner:uid0, version:randInt(1,5), updatedAt:now,
      };
      await redis.hset(K.c(oid,id),"_doc",s2(ct)); await redis.sadd(K.cs(oid),id);
    }
    for (const f of FRAMEWORKS){
      for (let i=0;i<3;i++){
        const id=uid("chk-");
        const ch: LegalComplianceCheck={id,framework:f,control:`${f}-${i+1}`,status:(["pass","gap","fail"] as const)[randInt(0,2)],lastCheckedAt:now};
        await redis.hset(K.chk(oid,id),"_doc",s2(ch)); await redis.sadd(K.chks(oid),id);
      }
    }
    logger?.info?.("[legal] bootstrap complete");
  },

  async dashboard(oid="org-windels"):Promise<LegalDashboard>{
    if (!(await redis.exists(K.ms(oid)))) await this.ensureBootstrapped(undefined, oid);
    const [mids,uids,cids,rids,chkIds]=await Promise.all([redis.smembers(K.ms(oid)),redis.smembers(K.us(oid)),redis.smembers(K.cs(oid)),redis.smembers(K.rs(oid)),redis.smembers(K.chks(oid))]);
    const get = async <T,>(ids:string[],keyFn:(id:string)=>string): Promise<T[]>=>{const out:T[]=[]; for(const id of ids){const r=await redis.hgetall(keyFn(id)); if(r._doc) out.push(JSON.parse(r._doc));} return out;};
    const [matters,updates,contracts,research,checks] = await Promise.all([
      get<LegalMatter>(mids,(id)=>K.m(oid,id)), get<RegulatoryUpdate>(uids,(id)=>K.u(oid,id)),
      get<Contract>(cids,(id)=>K.c(oid,id)), get<LegalResearchItem>(rids,(id)=>K.r(oid,id)),
      get<LegalComplianceCheck>(chkIds,(id)=>K.chk(oid,id)),
    ]);
    const now=Date.now();
    const byStatus:Record<string,number>={}; for(const m of matters){byStatus[m.status]=(byStatus[m.status]||0)+1;}
    const passRate = checks.length? checks.filter(c=>c.status==="pass").length/checks.length : 1;
    const upcoming = [...matters.filter(m=>m.dueDate)].sort((a,b)=> (a.dueDate||"").localeCompare(b.dueDate||"")).slice(0,6).map(m=>({id:m.id,title:m.title,dueDate:m.dueDate!,kind:m.kind}));
    const risks = [
      {topic:"IP exposure",score:randInt(20,70)},{topic:"Regulatory change",score:randInt(30,85)},
      {topic:"Contract liability",score:randInt(15,60)},{topic:"Data privacy",score:randInt(20,75)},
      {topic:"Employment compliance",score:randInt(10,55)},
    ].sort((a,b)=>b.score-a.score);
    return {
      mattersOpen: matters.filter(m=>m.status!=="closed").length,
      mattersAtRisk: matters.filter(m=>m.riskScore>=60).length,
      contractsActive: contracts.filter(c=>c.status==="signed").length,
      contractsExpiring90d: contracts.filter(c=>c.endDate && new Date(c.endDate).getTime()-now<90*86400000 && c.status==="signed").length,
      regulatoryUpdates7d: updates.filter(u=>Date.now()-new Date(u.publishedAt).getTime()<7*86400000).length,
      openResearchTasks: research.length, compliancePassRate: +passRate.toFixed(2),
      riskAvg: Math.round(matters.reduce((s,m)=>s+m.riskScore,0)/Math.max(1,matters.length)),
      mattersByStatus:byStatus,
      recentMatters: matters.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,6),
      recentUpdates: updates.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,6),
      recentContracts: contracts.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,6),
      upcomingDeadlines: upcoming, topRisks: risks,
    };
  },

  async research(query:string, oid="org-windels"):Promise<LegalResearchItem>{
    const id=uid("res-"); const now=new Date().toISOString();
    const item: LegalResearchItem={id,query,sources:randInt(6,40),citations:Array.from({length:randInt(2,8)},(_,i)=>`Case-${randomUUID().slice(0,6)}`),summary:`Research summary for "${query}": identified ${randInt(2,6)} relevant precedents and regulatory references.`,createdAt:now};
    await redis.hset(K.r(oid,id),"_doc",s2(item)); await redis.sadd(K.rs(oid),id);
    return item;
  },

  async acknowledgeUpdate(id:string, oid="org-windels"):Promise<RegulatoryUpdate|null>{
    const r=await redis.hgetall(K.u(oid,id)); if(!r._doc) return null;
    const u:RegulatoryUpdate=JSON.parse(r._doc); u.acknowledged=true;
    await redis.hset(K.u(oid,id),"_doc",s2(u)); return u;
  },
};
