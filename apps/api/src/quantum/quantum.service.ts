/**
 * Session 63 — Quantum Readiness Framework.
 * Post-quantum crypto inventory, hybrid classical/quantum optimization jobs,
 * vendor connectors (IBM/AWS Braket/Azure Quantum/Google Cirq/D-Wave/local simulator).
 * Keys: q:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { QuantumDashboard, CryptoInventoryEntry, QuantumOptimizationJob, QuantumConnector, PQ_ALGORITHMS, QuantumReadiness } from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";

// Deterministic demo RNG — stable per (module, seed) so dashboard
// reads return the same numbers within a running process.
const _rng = makeRng('quantum');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }

const K = {
  inv: (oid:string,id:string)=>`q:inv:${oid}:${id}`, invs:(oid:string)=>`q:invs:${oid}`,
  job: (oid:string,id:string)=>`q:j:${oid}:${id}`, jobs:(oid:string)=>`q:js:${oid}`,
  con: (oid:string,id:string)=>`q:c:${oid}:${id}`, meta:(oid:string)=>`q:meta:${oid}`,
};
const s2=(o:any)=>JSON.stringify(o); const uid=(p:string)=>p+randomUUID().slice(0,8);
const VENDORS: QuantumConnector["vendor"][] = ["ibm","aws_braket","azure_quantum","google_cirq","dwave","local_simulator"];
const VULNERABLE = ["RSA-2048","RSA-4096","ECDSA-P256","ECDH-P256","ECDSA-P384"];
const PQ_MAP: Record<string,typeof PQ_ALGORITHMS[number]> = {
  "RSA-2048":"CRYSTALS-Kyber","ECDSA-P256":"CRYSTALS-Dilithium","ECDH-P256":"CRYSTALS-Kyber",
  "RSA-4096":"CRYSTALS-Kyber","ECDSA-P384":"Falcon",
};

const SYSTEMS = [
  "Auth Service","API Gateway","Payment Processing","VPN Concentrator","TLS Terminator",
  "Document Signing","Code Signing CA","IoT Device Fleet","S/MIME Email","SSH CA",
  "Customer Data at Rest","Inter-service mTLS",
];

export const QuantumService = {
  async ensureBootstrapped(logger?:any, oid="org-windels"){
    if (!demoDataEnabled()) return skipDemoSeed("quantum", logger);
    _rng.reseed(`ensureBootstrapped:${logger}`);
    if (await redis.exists(K.meta(oid))) return;
    const now = new Date().toISOString();
    let migratedCount = 0;
    // inventory
    for (const sys of SYSTEMS){
      const algo = VULNERABLE[randInt(0,VULNERABLE.length-1)];
      const vulnerable = VULNERABLE.includes(algo);
      const statuses: CryptoInventoryEntry["migrationStatus"][] = ["identified","planned","in_progress","migrated","deferred"];
      const status = vulnerable?statuses[randInt(0,3)]:"migrated";
      if (status === "migrated") migratedCount++;
      const id = uid("inv-");
      const e: CryptoInventoryEntry = {
        id, system: sys, algorithm: algo, keyBits: algo.startsWith("RSA")?2048:256, quantumVulnerable: vulnerable,
        replacement: vulnerable?PQ_MAP[algo]||"CRYSTALS-Kyber":undefined,
        migrationStatus: status,
        targetDate: vulnerable?new Date(Date.now()+randInt(60,540)*86400000).toISOString():undefined,
        owner: ["Security","Platform","Infra","IT"][randInt(0,3)],
      };
      await redis.hset(K.inv(oid,id),"_doc",s2(e)); await redis.sadd(K.invs(oid),id);
    }
    // connectors
    for (const v of VENDORS){
      const c: QuantumConnector = {
        id: uid("qc-"), vendor:v,
        status: v==="local_simulator"?"simulating":v==="ibm"?"connected":"disconnected",
        queueDepth: randInt(0,24), qubitsAvailable: v==="local_simulator"?32:v==="ibm"?127:v==="dwave"?5000:randInt(20,80),
      };
      await redis.hset(K.con(oid,c.id),"_doc",s2(c));
    }
    // seed a few completed jobs
    for (let i=0;i<4;i++){
      const id=uid("qj-"); const kinds: QuantumOptimizationJob["kind"][] = ["qaoa","vqe","annealer","hybrid_solver"];
      const problems: QuantumOptimizationJob["problem"][] = ["portfolio","routing","scheduling","supply_chain"];
      const j: QuantumOptimizationJob = {
        id, kind: kinds[i%kinds.length], problem: problems[i%problems.length], status:"completed",
        qubits: randInt(20,200), startedAt: new Date(Date.now()-randInt(1,30)*86400000).toISOString(),
        completedAt: new Date().toISOString(), objectiveValue: +rand(0.85,0.99).toFixed(4),
      };
      await redis.hset(K.job(oid,id),"_doc",s2(j)); await redis.sadd(K.jobs(oid),id);
    }
    const readiness: QuantumReadiness = migratedCount/SYSTEMS.length > 0.75 ? "hybrid" : migratedCount/SYSTEMS.length>0.3? "migrating":"planning";
    await redis.hset(K.meta(oid),"readiness",readiness);
    logger?.info?.("[quantum] bootstrap complete",{systems:SYSTEMS.length});
  },
  async inventory(oid="org-windels"):Promise<CryptoInventoryEntry[]>{
    if (!(await redis.exists(K.meta(oid)))) await this.ensureBootstrapped(undefined, oid);
    const ids=await redis.smembers(K.invs(oid)); const out:CryptoInventoryEntry[]=[];
    for (const id of ids){const r=await redis.hgetall(K.inv(oid,id)); if(r._doc) out.push(JSON.parse(r._doc));}
    return out;
  },
  async connectors(oid="org-windels"):Promise<QuantumConnector[]>{
    if (!demoDataEnabled()) {
      return VENDORS.map((v,i)=>({
        id:"qc-"+i, vendor:v, status:"disconnected",
        queueDepth: 0, qubitsAvailable: 0,
      }));
    }
    _rng.reseed(`connectors:${oid}`);
    // connectors aren't stored as a set to avoid adding a new key; scan meta? instead we just re-seed on demand by returning deterministic connectors
    return VENDORS.map((v,i)=>({
      id:"qc-"+i, vendor:v, status:(v==="local_simulator"?"simulating":v==="ibm"?"connected":"disconnected"),
      queueDepth: randInt(0,24), qubitsAvailable: v==="local_simulator"?32:v==="ibm"?127:v==="dwave"?5000:randInt(20,80),
    }));
  },
  async jobs(oid="org-windels"):Promise<QuantumOptimizationJob[]>{
    if (!(await redis.exists(K.meta(oid)))) await this.ensureBootstrapped(undefined, oid);
    const ids=await redis.smembers(K.jobs(oid)); const out:QuantumOptimizationJob[]=[];
    for (const id of ids){const r=await redis.hgetall(K.job(oid,id)); if(r._doc) out.push(JSON.parse(r._doc));}
    return out.sort((a,b)=>(b.completedAt||b.startedAt||"").localeCompare(a.completedAt||a.startedAt||""));
  },
  async submitJob(input:{kind:QuantumOptimizationJob["kind"];problem:QuantumOptimizationJob["problem"];vendor?:QuantumConnector["vendor"];organizationId?:string}):Promise<QuantumOptimizationJob>{
    _rng.reseed(`submitJob:${input}`);
    const oid=input.organizationId||"org-windels"; const id=uid("qj-"); const now=new Date().toISOString();
    const j: QuantumOptimizationJob={
      id, kind:input.kind, problem:input.problem, status:"queued", qubits:randInt(20,200), startedAt:now,
    };
    await redis.hset(K.job(oid,id),"_doc",s2(j)); await redis.sadd(K.jobs(oid),id);
    // The job stays queued until a real quantum/hybrid backend returns a
    // result. It previously "completed" after 1.8s with an objective value of
    // 0.8-0.99 — a solution quality for an optimisation that never ran.
    return j;
  },
  async dashboard(oid="org-windels"):Promise<QuantumDashboard>{
    if (!(await redis.exists(K.meta(oid)))) await this.ensureBootstrapped(undefined, oid);
    const inv=await this.inventory(oid); const jobs=await this.jobs(oid);
    const vulnerable = inv.filter(e=>e.quantumVulnerable).length;
    const migrated = inv.filter(e=>e.migrationStatus==="migrated").length;
    const migrationPct = inv.length? Math.round(migrated/inv.length*100):0;
    const readiness: QuantumReadiness = migrationPct>75?"hybrid":migrationPct>30?"migrating":"planning";
    return {
      readiness, cryptoInventory: inv.length, vulnerableCount: vulnerable, migratedCount: migrated,
      migrationPct, hybridJobs: jobs.length, completedJobs30d: jobs.filter(j=>j.completedAt && Date.now()-new Date(j.completedAt).getTime()<30*86400000).length,
      connectors: await this.connectors(oid), entries: inv, recentJobs: jobs.slice(0,8),
      pqAlgorithmsSupported: [...PQ_ALGORITHMS],
    };
  },
};
