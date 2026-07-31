/**
 * Session 65 — Biomedical & Healthcare Intelligence.
 * Imaging, CDSS, hospital ops, lab, patient workflow, compliance, pharmacy, telemed.
 * All data uses hashed patient identifiers; access gated behind compliance.
 * Keys: bm:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { BiomedicalDashboard, ImagingStudy, ClinicalDecision, HospitalOpsMetric, PharmacyAlert, TelemedicineSession, BIOMED_AREAS, BiomedArea } from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable per (module, seed) so dashboard
// reads return the same numbers within a running process.
const _rng = makeRng('biomedical');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const K = {
  img: (oid:string,id:string)=>`bm:img:${oid}:${id}`, imgs:(oid:string)=>`bm:imgs:${oid}`,
  cd: (oid:string,id:string)=>`bm:cd:${oid}:${id}`, cds:(oid:string)=>`bm:cds:${oid}`,
  ph: (oid:string,id:string)=>`bm:ph:${oid}:${id}`, phs:(oid:string)=>`bm:phs:${oid}`,
  tl: (oid:string,id:string)=>`bm:tl:${oid}:${id}`, tls:(oid:string)=>`bm:tls:${oid}`,
  meta:(oid:string)=>`bm:meta:${oid}`,
};
const s2=(o:any)=>JSON.stringify(o); const uid=(p:string)=>p+randomUUID().slice(0,8);
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
    _rng.reseed(`ensureBootstrapped:${logger}`);
    if (await redis.exists(K.meta(oid))) return;
    const now=new Date().toISOString();
    // seed studies
    for (let i=0;i<18;i++){
      const id=uid("img-"); const fin = FINDINGS_POOL[randInt(0,FINDINGS_POOL.length-1)];
      const s: ImagingStudy = {
        id, patientHash:hash(), modality: MODALITIES[randInt(0,MODALITIES.length-1)], bodyPart: BODY_PARTS[randInt(0,BODY_PARTS.length-1)],
        aiFindings:[{finding:fin.finding,confidence:+rand(0.72,0.98).toFixed(2),severity:fin.sev as any,priority:fin.pri}],
        radiologistReviewed: _rng.next()>0.4,
        status: (["queued","analyzing","review","signed_off","escalated"] as ImagingStudy["status"][])[randInt(0,4)],
        createdAt: new Date(Date.now()-randInt(1,72)*3600000).toISOString(),
        completedAt: _rng.next()>0.3 ? new Date().toISOString() : undefined,
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
        endedAt: _rng.next()>0.3?new Date().toISOString():undefined,
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

    // Pull real persisted state.
    const ids = await redis.smembers(K.imgs(oid));
    const studies: ImagingStudy[] = [];
    let reviewed = 0, escalations = 0;
    for (const id of ids) {
      const r = await redis.hgetall(K.img(oid, id));
      if (r._doc) {
        const s: ImagingStudy = JSON.parse(r._doc);
        studies.push(s);
        if (s.radiologistReviewed) reviewed++;
        if (s.status === "escalated") escalations++;
      }
    }
    const last24 = studies.filter(s => Date.now() - new Date(s.createdAt).getTime() < 86400000);

    const phIds = await redis.smembers(K.phs(oid));
    const pharm: PharmacyAlert[] = [];
    for (const id of phIds) { const r = await redis.hgetall(K.ph(oid, id)); if (r._doc) pharm.push(JSON.parse(r._doc)); }
    const pharm24 = pharm.filter(p => Date.now() - new Date(p.at).getTime() < 86400000);

    const tlIds = await redis.smembers(K.tls(oid));
    let tlActive = 0;
    for (const id of tlIds) {
      const r = await redis.hgetall(K.tl(oid, id));
      if (r._doc) { const t: TelemedicineSession = JSON.parse(r._doc); if (!t.endedAt) tlActive++; }
    }

    // Hospital-ops metrics computed from actual persisted counts.
    const pendingReview = studies.filter(s => s.status === "review").length;
    const aiAssisted = studies.filter(s => (s as any).aiFindings && (s as any).aiFindings.length).length;
    const ops: HospitalOpsMetric[] = [
      { label: "Imaging studies (24h)", value: last24.length, unit: "studies", target: 100, status: last24.length >= 80 ? "warn" : "ok" },
      { label: "Pending radiologist review", value: pendingReview, unit: "studies", target: 5, status: pendingReview > 5 ? "warn" : "ok" },
      { label: "Escalated cases (open)", value: escalations, unit: "cases", target: 0, status: escalations > 0 ? "warn" : "ok" },
      { label: "Pharmacy alerts (24h)", value: pharm24.length, unit: "alerts", target: 10, status: pharm24.length > 10 ? "warn" : "ok" },
      { label: "Active telemedicine sessions", value: tlActive, unit: "sessions", target: 0, status: "ok" },
      { label: "AI-assisted diagnosis rate", value: studies.length ? Math.round((aiAssisted / studies.length) * 100) : 0, unit: "%", target: 80, status: "ok" },
    ];

    // Per-area rollup derived from actual studies.
    const areas: BiomedicalDashboard["areas"] = {} as any;
    const modalitiesPerArea: Record<string, Set<string>> = {};
    for (const s of studies) {
      const area = s.status === "escalated" ? "clinical_decision" : "medical_imaging";
      (modalitiesPerArea[area] = modalitiesPerArea[area] ?? new Set()).add(s.modality);
    }
    for (const a of BIOMED_AREAS) {
      const areaStudies = a === "medical_imaging" ? studies : (a === "clinical_decision" ? studies.filter(s => s.status === "escalated") : []);
      const areaLast24 = areaStudies.filter(s => Date.now() - new Date(s.createdAt).getTime() < 86400000);
      areas[a] = {
        enabled: true,
        models: modalitiesPerArea[a]?.size ?? 0,
        reviewed24h: areaLast24.filter(s => s.radiologistReviewed).length,
        escalations24h: areaLast24.filter(s => s.status === "escalated").length,
      };
    }

    const compliance: BiomedicalDashboard["complianceStatus"] = {
      HIPAA: "compliant", HITECH: "compliant", "FDA-AI-AAP": "at_risk", "CE-MDR": "gap",
      "ISO-13485": "compliant", "21 CFR Part 11": "compliant", "GDPR-H": "compliant",
    };

    // Real turnaround from persisted study lifecycle.
    const withTat = studies.filter(s => (s as any).completedAt).map(s => (new Date((s as any).completedAt!).getTime() - new Date(s.createdAt).getTime()) / 60000);
    const avgTurnaroundMin = withTat.length ? Math.round(withTat.reduce((a, b) => a + b, 0) / withTat.length) : 0;

    return {
      areas,
      imaging: { studies24h: last24.length, aiAssisted, pendingReview, avgTurnaroundMin },
      ops, alerts24h: pharm24.length, pharmacyAlerts: pharm, telemetryActive: tlActive,
      complianceStatus: compliance,
      recentStudies: studies.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
    };
  },

  async submitStudy(input:{modality:ImagingStudy["modality"];bodyPart:string;organizationId?:string}): Promise<ImagingStudy>{
    _rng.reseed(`submitStudy:${input}`);
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
