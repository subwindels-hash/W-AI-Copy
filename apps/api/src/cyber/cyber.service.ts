/**
 * Session 82 — Cybersecurity Academy, Ethical Hacking Platform & Multi-Cloud Security.
 * Learning paths (fundamentals→expert), cyber ranges/labs/CTFs, certifications, multi-cloud
 * security posture (AWS/Azure/GCP), bug bounty program, red/blue/purple team ops.
 * Keys: csec:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import { CyberDashboard, CYBER_DOMAINS, CYBER_LEVELS, CyberCourse, CyberLab, CyberCertification, CyberRange, CloudSecurityFinding, CyberChallenge, CyberDomain } from "@windels/shared";
const K={meta:(oid:string)=>`csec:meta:${oid}`};
const rnd=(a:number,b:number)=>Math.random()*(b-a)+a, rndInt=(a:number,b:number)=>Math.floor(rnd(a,b+1));
const pick=<T>(a:T[])=>a[Math.floor(Math.random()*a.length)];
const uid=(p:string)=>p+randomUUID().slice(0,8);
const now=()=>new Date().toISOString();

const COURSE_SEEDS: Omit<CyberCourse,"id"|"enrolled"|"rating">[] = [
  {title:"Cybersecurity Fundamentals",domain:"fundamentals",level:"beginner",durationHours:12,modules:8,certified:true,provider:"windels"},
  {title:"Ethical Hacking Bootcamp",domain:"ethical_hacking",level:"intermediate",durationHours:40,modules:22,certified:true,provider:"windels"},
  {title:"Network Penetration Testing",domain:"network_security",level:"advanced",durationHours:32,modules:16,certified:true,provider:"offensive_security"},
  {title:"Linux Hardening Masterclass",domain:"linux_security",level:"intermediate",durationHours:18,modules:12,certified:false,provider:"windels"},
  {title:"Active Directory Attack & Defense",domain:"active_directory",level:"advanced",durationHours:28,modules:14,certified:true,provider:"windels"},
  {title:"Web App Hacking (OWASP Top 10)",domain:"web_security",level:"intermediate",durationHours:30,modules:18,certified:true,provider:"windels"},
  {title:"Mobile App Exploitation",domain:"mobile_security",level:"advanced",durationHours:20,modules:10,certified:false,provider:"partner"},
  {title:"API Security Testing",domain:"api_security",level:"advanced",durationHours:22,modules:12,certified:false,provider:"windels"},
  {title:"AWS Security Speciality Path",domain:"cloud_security",level:"advanced",durationHours:36,modules:20,certified:true,provider:"aws"},
  {title:"Azure Defender & Sentinel Deep Dive",domain:"cloud_security",level:"advanced",durationHours:26,modules:14,certified:true,provider:"azure"},
  {title:"GCP Security Command Center",domain:"cloud_security",level:"intermediate",durationHours:18,modules:10,certified:true,provider:"gcp"},
  {title:"Container & Kubernetes Offense",domain:"kubernetes_security",level:"advanced",durationHours:24,modules:12,certified:false,provider:"windels"},
  {title:"Zero Trust Architecture Design",domain:"zero_trust",level:"expert",durationHours:30,modules:16,certified:true,provider:"windels"},
  {title:"Threat Hunting with AI",domain:"threat_hunting",level:"expert",durationHours:28,modules:14,certified:false,provider:"windels"},
  {title:"Malware Analysis & Reverse Engineering",domain:"malware_analysis",level:"expert",durationHours:40,modules:20,certified:true,provider:"partner"},
  {title:"DevSecOps Pipeline Engineering",domain:"devsecops",level:"advanced",durationHours:22,modules:12,certified:false,provider:"windels"},
];

const CERT_SEEDS: Omit<CyberCertification,"id"|"preparationProgressPct">[] = [
  {name:"CompTIA Security+",vendor:"CompTIA",passed:true,scorePct:88,achievedAt:"2024-11-02",expiresAt:"2027-11-02"},
  {name:"OSCP",vendor:"Offensive Security",passed:false},
  {name:"CISSP",vendor:"ISC2",passed:true,scorePct:82,achievedAt:"2023-05-14",expiresAt:"2026-05-14"},
  {name:"AWS Security – Specialty",vendor:"AWS",passed:true,scorePct:91,achievedAt:"2025-01-20",expiresAt:"2028-01-20"},
  {name:"CEH",vendor:"EC-Council",passed:true,scorePct:85,achievedAt:"2024-03-01",expiresAt:"2027-03-01"},
  {name:"GCIH",vendor:"GIAC",passed:false},
];

const RANGE_KINDS = ["red_team","blue_team","purple_team","capture_the_flag","bug_bounty","adversary_emulation"] as const;
const FINDING_SEEDS: Array<{cloud:"aws"|"azure"|"gcp";service:string;severity:"low"|"medium"|"high"|"critical";rule:string;region:string}> = [
  {cloud:"aws",service:"S3",severity:"high",rule:"Public bucket ACL",region:"us-east-1"},
  {cloud:"aws",service:"IAM",severity:"critical",rule:"Root account has active access keys",region:"global"},
  {cloud:"azure",service:"Storage",severity:"medium",rule:"Secure transfer not enforced",region:"westeurope"},
  {cloud:"gcp",service:"GCS",severity:"high",rule:"Bucket IAM policy grants allUsers",region:"us-central1"},
  {cloud:"aws",service:"EC2",severity:"medium",rule:"Unrestricted SSH (0.0.0.0/0) on sg-123",region:"us-east-1"},
  {cloud:"azure",service:"KeyVault",severity:"low",rule:"Soft-delete retention < 7 days",region:"eastus"},
  {cloud:"gcp",service:"Compute",severity:"critical",rule:"Default service account with editor role in use",region:"us-central1"},
  {cloud:"aws",service:"RDS",severity:"high",rule:"Storage encryption disabled",region:"eu-west-1"},
  {cloud:"aws",service:"Lambda",severity:"medium",rule:"Outdated runtime (python3.8)",region:"us-west-2"},
  {cloud:"azure",service:"AKS",severity:"high",rule:"Pod security policies disabled",region:"westeurope"},
];

const CHALLENGE_TITLES = ["Buffer Overflow 101","SQLi Basic","JWT: None algorithm","Kerberoasting","GPO Snafu","SSRF to metadata","Race condition coupon","K8s privesc via hostPath","XSS via Markdown","SID history escalation","Docker socket escape","Path traversal in upload","ROP chaining","Bypassing ASLR","LDAP injection"];

export const CyberService = {
  async ensureBootstrapped(logger?:Logger, oid="org-windels") {
    if (await redis.exists(K.meta(oid))) return; await redis.set(K.meta(oid),"1");
    logger?.info({ msg:"[cyber] bootstrap complete", courses: COURSE_SEEDS.length, certs: CERT_SEEDS.length, findings: FINDING_SEEDS.length });
  },
  async dashboard(oid:string): Promise<CyberDashboard> {
    if (!(await redis.exists(K.meta(oid)))) await this.ensureBootstrapped(undefined, oid);
    const courses: CyberCourse[] = COURSE_SEEDS.map(c=>({id:uid("crs-"),enrolled:rndInt(200,20000),rating:Math.round(rnd(4.1,4.9)*10)/10,...c}));
    const labs: CyberLab[] = [
      {id:uid("lab-"),name:"Kioptrix-style boot2root",domain:"ethical_hacking",difficulty:"intermediate",status:"ready",expiresAt:new Date(Date.now()+7200_000).toISOString()},
      {id:uid("lab-"),name:"AD Forest Persistence",domain:"active_directory",difficulty:"expert",cloud:"multi",status:"running",expiresAt:new Date(Date.now()+3600_000).toISOString(),scorePct:Math.round(rnd(10,95)),flagsCaptured:rndInt(0,7),flagsTotal:7},
      {id:uid("lab-"),name:"S3 misconfiguration CTF",domain:"cloud_security",difficulty:"beginner",cloud:"aws",status:"ready",expiresAt:new Date(Date.now()+7200_000).toISOString()},
      {id:uid("lab-"),name:"K8s cluster compromise",domain:"kubernetes_security",difficulty:"advanced",cloud:"gcp",status:"provisioning",expiresAt:new Date(Date.now()+7200_000).toISOString()},
    ];
    const cd = [...CYBER_DOMAINS];
    const challenges: CyberChallenge[] = CHALLENGE_TITLES.slice(0,12).map((t,i)=>({
      id:uid("ch-"), title:t, domain: pick(cd), points:[50,100,150,200,300,500][i%6],
      difficulty: CYBER_LEVELS[(i%4)] as any, solvedBy: rndInt(50,4000), category:(["ctf","lab","quiz","king_of_the_hill"] as const)[i%4],
    }));
    const certifications: CyberCertification[] = CERT_SEEDS.map(c=>({id:uid("cert-"),preparationProgressPct:c.passed?100:Math.round(rnd(10,85)),...c}));
    const ranges: CyberRange[] = [
      {id:uid("rg-"),name:"Corporate Red Team Engagement #27",kind:"red_team",cloudTargets:["aws","azure"],players:12,durationHours:72,status:"live",startsAt:new Date(Date.now()-3600_000).toISOString(),score:rndInt(1200,3200),rank:rndInt(1,40)},
      {id:uid("rg-"),name:"Weekend CTF: AI Security",kind:"capture_the_flag",cloudTargets:["gcp"],players:248,durationHours:24,status:"scheduled",startsAt:new Date(Date.now()+3*86400_000).toISOString()},
      {id:uid("rg-"),name:"Purple Team — ransomware sim",kind:"purple_team",cloudTargets:["aws","azure","gcp"],players:8,durationHours:8,status:"completed",startsAt:new Date(Date.now()-7*86400_000).toISOString(),score:rndInt(800,2800),rank:rndInt(1,15)},
      {id:uid("rg-"),name:"Public Bug Bounty — Wildcard *.windels.ai",kind:"bug_bounty",cloudTargets:["aws","cloudflare"],players:512,durationHours:720,status:"live",startsAt:new Date(Date.now()-15*86400_000).toISOString(),score:rndInt(0,500)},
    ];
    const findings: CloudSecurityFinding[] = FINDING_SEEDS.map((f,i)=>({id:uid("f-"),resource:"res-"+Math.random().toString(36).slice(2,8),status:(i%3===0?"remediated":i%5===0?"accepted":"open"),...f}));
    const skillScores: any = {}; for (const d of [...CYBER_DOMAINS]) skillScores[d]=Math.round(rnd(10,95));
    return {
      learners: rndInt(800,12000), coursesAvailable: courses.length, coursesEnrolled: rndInt(2,16), labsActive: labs.filter(l=>l.status==="running").length,
      challengesSolved: rndInt(3,400), certificationsHeld: certifications.filter(c=>c.passed).length,
      leaderboardRank: rndInt(1,1200), ctfWins: rndInt(0,15), totalPoints: rndInt(2000,80000),
      bugBountiesEarnedUsd: Math.round(rnd(500, 120000)), cloudFindingsOpen: findings.filter(f=>f.status==="open").length,
      cloudFindingsCritical: findings.filter(f=>f.severity==="critical"&&f.status==="open").length,
      cloudFindingsRemediated30d: rndInt(20,200), upcomingRanges: ranges.filter(r=>r.status==="scheduled").length, activeRanges: ranges.filter(r=>r.status==="live").length,
      courses, labs, challenges, certifications, ranges, findings,
      recentActivity: [
        {at:new Date(Date.now()-12*60_000).toISOString(),what:"Completed lab 'AD Forest Persistence' with score 92%",points:250},
        {at:new Date(Date.now()-2*3600_000).toISOString(),what:"Solved challenge 'JWT: None algorithm'",points:100},
        {at:new Date(Date.now()-1*86400_000).toISOString(),what:"Enrolled in AWS Security Speciality Path"},
        {at:new Date(Date.now()-3*86400_000).toISOString(),what:"Remediated 4 critical AWS findings in us-east-1",points:400},
        {at:new Date(Date.now()-5*86400_000).toISOString(),what:"Bug bounty: XSS in marketing site — $750 award",points:750},
      ],
      skillScores,
    };
  },
  async startLab(oid:string, input:{domain:any, difficulty:any, cloud?:any}): Promise<CyberLab> {
    return { id:uid("lab-"), name:`Lab: ${input.domain} (${input.difficulty})`, domain:input.domain, difficulty:input.difficulty, cloud:input.cloud, status:"provisioning", expiresAt:new Date(Date.now()+7200_000).toISOString() };
  },
};
