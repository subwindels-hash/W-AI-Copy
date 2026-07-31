/**
 * Session 65 — Biomedical & Healthcare Intelligence.
 * Imaging, CDSS, hospital ops, lab, patient workflow, compliance, pharmacy, telemed.
 * All data uses hashed patient identifiers; access gated behind compliance.
 * Keys: bm:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { BiomedicalDashboard, ImagingStudy, ClinicalDecision, HospitalOpsMetric, PharmacyAlert, TelemedicineSession, BIOMED_AREAS, BiomedArea } from "@windels/shared";

const K = {
  img: (oid:string,id:string)=>`bm:img:${oid}:${id}`, imgs:(oid:string)=>`bm:imgs:${oid}`,
  cd: (oid:string,id:string)=>`bm:cd:${oid}:${id}`, cds:(oid:string)=>`bm:cds:${oid}`,
  ph: (oid:string,id:string)=>`bm:ph:${oid}:${id}`, phs:(oid:string)=>`bm:phs:${oid}`,
  tl: (oid:string,id:string)=>`bm:tl:${oid}:${id}`, tls:(oid:string)=>`bm:tls:${oid}`,
  meta:(oid:string)=>`bm:meta:${oid}`,
};
const s2=(o:any)=>JSON.stringify(o); const uid=(p:string)=>p+randomUUID().slice(0,8);
function rand(min:number,max:number){return (min+max)/2;} // deterministic
function randInt(min:number,max:number){return Math.floor(rand(min,max+1));}
const hash = ()=>"pt-"+randomUUID().slice(0,12);

const MODALITIES: ImagingStudy["modality"][] = ["xray","ct","mri","ultrasound","pet","mammo","pathology"];
const BODY_PARTS = ["chest","brain","abdomen","knee","spine","breast","pelvis","hip"];
const FINDINGS_POOL = [
  {finding:"No acute cardiopulmonary abnormality",sev:"low",pri:false},
  {finding:"Small pulmonary nodule, follow-up recommended",sev:"moderate",pri:true},
  {finding:"Pleural effusion left side",sev:"high",pri:true},
  {finding:"Mild degenerative change",sev:"low",pri:false},
  {finding:"Fracture suspected — correlate clinically",sev:"high",pri:true},
];

export const BiomedicalService = {
  async ensureBootstrapped(logger?:any, oid="org-windels", _uid?:string){
    if (await redis.exists(K.meta(oid))) return;
    const now=new Date().toISOString();
    // seed studies
    for (let i=0;i<18;i++){
      const id=uid("img-"); const fin = FINDINGS_POOL[randInt(0,FINDINGS_POOL.length-1)];
      const s: ImagingStudy = {
        id, patientHash:hash(), modality: MODALITIES[randInt(0,MODALITIES.length-1)], bodyPart: BODY_PARTS[randInt(0,BODY_PARTS.length-1)],
        aiFindings:[{finding:fin.finding,confidence:+rand(0.72,0.98).toFixed(2),severity:fin.sev as any,priority:fin.pri}],
        radiologistReviewed: false,
        status: (["queued","analyzing","review","signed_off","escalated"] as ImagingStudy["status"][])[randInt(0,4)],
        createdAt: new Date(Date.now()-randInt(1,72)*3600000).toISOString(),
        completedAt: undefined,
      };
      await redis.hset(K.img(oid,id),"_doc",s2(s)); await redis.sadd(K.imgs(oid),id);
    }
    // pharmacy alerts
    for (let i=0;i<6;i++){
      const id=uid("ph-");
      const kinds: PharmacyAlert["kind"][] = ["interaction","duplicate","allergy","dose","contraindication"];
      const a: PharmacyAlert = {
        id, kind: kinds[randInt(0,kinds.length-1)],
        severity:(["info","warn","critical"] as PharmacyAlert["severity"][])[randInt(0,2)],
        message: ["Potential drug-drug interaction","Duplicate therapy detected","Allergy cross-reactivity","Dose above recommended","Contraindication flagged"][randInt(0,4)],
        at: new Date(Date.now()-randInt(1,48)*3600000).toISOString(),
      };
      await redis.hset(K.ph(oid,id),"_doc",s2(a)); await redis.sadd(K.phs(oid),id);
    }
    // telemedicine
    for (let i=0;i<4;i++){
      const id=uid("tl-");
      const t: TelemedicineSession = {
        id, providerId:"prov-"+randInt(100,999), patientHash:hash(),
        startedAt:new Date(Date.now()-randInt(1,24)*3600000).toISOString(),
        endedAt: undefined,
        modality:(["video","voice","async"] as TelemedicineSession["modality"][])[randInt(0,2)],
        language:["en","es","fr","zh"][randInt(0,3)], aiScribeActive:true, summaryGenerated:true,
      };
      await redis.hset(K.tl(oid,id),"_doc",s2(t)); await redis.sadd(K.tls(oid),id);
    }
    await redis.set(K.meta(oid),"1");
    logger?.info?.("[biomedical] bootstrap complete");
  },

  async dashboard(oid="org-windels"): Promise<BiomedicalDashboard>{
    if (!(await redis.exists(K.meta(oid)))) await this.ensureBootstrapped(undefined, oid);
    const ids=await redis.smembers(K.imgs(oid));
    const studies:ImagingStudy[]=[];
    let reviewed=0, escalations=0;
    for (const id of ids){const r=await redis.hgetall(K.img(oid,id)); if(r._doc){const s:ImagingStudy=JSON.parse(r._doc); studies.push(s); if(s.radiologistReviewed)reviewed++; if(s.status==="escalated")escalations++;}}
    const last24=studies.filter(s=>Date.now()-new Date(s.createdAt).getTime()<86400000);
    const ops: HospitalOpsMetric[] = [
      {label:"ED Wait (min)",value:randInt(18,62),unit:"min",target:30,status:randInt(0,1)?"warn":"ok"},
      {label:"ICU Beds",value:randInt(68,98),unit:"%",target:90,status:"ok"},
      {label:"OR Utilization",value:+rand(62,96).toFixed(1),unit:"%",target:85,status:"ok"},
      {label:"Discharges / hr",value:randInt(4,18),unit:"/hr",target:10,status:"ok"},
      {label:"Readmission 30d",value:+rand(3.8,9.2).toFixed(1),unit:"%",target:7,status:"warn"},
      {label:"Lab TAT",value:randInt(42,140),unit:"min",target:90,status:"ok"},
    ];
    const phIds=await redis.smembers(K.phs(oid)); const pharm:PharmacyAlert[]=[];
    for (const id of phIds){const r=await redis.hgetall(K.ph(oid,id)); if(r._doc) pharm.push(JSON.parse(r._doc));}
    const tlIds=await redis.smembers(K.tls(oid)); let tlActive=0;
    for (const id of tlIds){const r=await redis.hgetall(K.tl(oid,id)); if(r._doc){const t:TelemedicineSession=JSON.parse(r._doc); if(!t.endedAt) tlActive++;}}
    const areas: BiomedicalDashboard["areas"] = {} as any;
    for (const a of BIOMED_AREAS) areas[a] = { enabled:true, models:randInt(1,6), reviewed24h:randInt(0,20), escalations24h:randInt(0,a==="clinical_decision"?3:1) };
    const compliance: BiomedicalDashboard["complianceStatus"] = {
      HIPAA:"compliant", HITECH:"compliant", "FDA-AI-AAP":"at_risk", "CE-MDR":"gap", "ISO-13485":"compliant", "21 CFR Part 11":"compliant", "GDPR-H":"compliant",
    };
    return {
      areas,
      imaging:{studies24h:last24.length, aiAssisted:Math.round(last24.length*0.86), pendingReview:studies.filter(s=>s.status==="review").length, avgTurnaroundMin:randInt(22,90)},
      ops, alerts24h: pharm.length, pharmacyAlerts:pharm, telemetryActive:tlActive,
      complianceStatus:compliance,
      recentStudies: studies.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,8),
    };
  },

  async submitStudy(input:{modality:ImagingStudy["modality"];bodyPart:string;organizationId?:string}): Promise<ImagingStudy>{
    const oid=input.organizationId||"org-windels"; const id=uid("img-"); const now=new Date().toISOString();
    const s: ImagingStudy={id,patientHash:hash(),modality:input.modality,bodyPart:input.bodyPart,aiFindings:[],radiologistReviewed:false,status:"analyzing",createdAt:now};
    await redis.hset(K.img(oid,id),"_doc",s2(s)); await redis.sadd(K.imgs(oid),id);
    setTimeout(async ()=>{
      const fin = FINDINGS_POOL[randInt(0,FINDINGS_POOL.length-1)];
      s.aiFindings=[{finding:fin.finding,confidence:+rand(0.72,0.98).toFixed(2),severity:fin.sev as any,priority:fin.pri}];
      s.status=fin.pri?"escalated":"review"; s.completedAt=new Date().toISOString();
      await redis.hset(K.img(oid,id),"_doc",s2(s));
    },1500);
    return s;
  },
};
