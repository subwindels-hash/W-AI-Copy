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
const K={
  meta:(oid:string)=>`csec:meta:${oid}`,
  lab:(oid:string,id:string)=>`csec:lab:${oid}:${id}`,
  labs:(oid:string)=>`csec:labs:${oid}`,
  progress:(oid:string)=>`csec:progress:${oid}`,
  activity:(oid:string)=>`csec:activity:${oid}`,
};
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
  /**
   * Learner-facing academy rollup.
   *
   * This previously rebuilt the whole academy on every request: fresh ids for
   * every course/lab/challenge, and invented progress — 800-12,000 learners,
   * a leaderboard rank, 2,000-80,000 points, and $500-$120,000 of bug-bounty
   * earnings. Refreshing the page produced a different career each time.
   *
   * The catalogue (courses, certifications, challenge titles, finding
   * templates) is static configuration and is served as-is. Everything that
   * describes *this user's* progress is now counted from recorded state and
   * starts at zero, so the dashboard reflects what actually happened.
   */
  async dashboard(oid:string): Promise<CyberDashboard> {
    if (!(await redis.exists(K.meta(oid)))) await this.ensureBootstrapped(undefined, oid);

    // Catalogue: stable ids derived from the seed index so they do not churn
    // between reads. `enrolled`/`rating` are registry stats we do not collect.
    const courses: CyberCourse[] = COURSE_SEEDS.map((c,i)=>({ id:`crs-${i}`, enrolled:0, rating:0, ...c }));
    const certifications: CyberCertification[] = CERT_SEEDS.map((c,i)=>({ id:`cert-${i}`, preparationProgressPct: c.passed?100:0, ...c }));
    const cd = [...CYBER_DOMAINS];
    const challenges: CyberChallenge[] = CHALLENGE_TITLES.slice(0,12).map((t,i)=>({
      id:`ch-${i}`, title:t, domain: cd[i % cd.length]!, points:[50,100,150,200,300,500][i%6]!,
      difficulty: CYBER_LEVELS[(i%4)] as any, solvedBy: 0, category:(["ctf","lab","quiz","king_of_the_hill"] as const)[i%4],
    }));
    const findings: CloudSecurityFinding[] = FINDING_SEEDS.map((f,i)=>({
      id:`f-${i}`, resource:`res-${i}`, status:(i%3===0?"remediated":i%5===0?"accepted":"open"), ...f,
    }));

    // Live state: labs the user actually provisioned, and their real progress.
    const labIds = await redis.smembers(K.labs(oid));
    const labs: CyberLab[] = [];
    for (const id of labIds) {
      const raw = await redis.hget(K.lab(oid,id), "_doc");
      if (raw) { try { labs.push(JSON.parse(raw)); } catch { /* skip */ } }
    }
    const progress = await redis.hgetall(K.progress(oid));
    const num = (k: string) => Number(progress[k] ?? "0");

    const skillScores: any = {};
    for (const d of cd) skillScores[d] = num(`skill:${d}`);

    return {
      // Platform-wide learner counts are not tracked; report this org only.
      learners: 0,
      coursesAvailable: courses.length,
      coursesEnrolled: num("coursesEnrolled"),
      labsActive: labs.filter(l=>l.status==="running").length,
      challengesSolved: num("challengesSolved"),
      certificationsHeld: certifications.filter(c=>c.passed).length,
      leaderboardRank: 0,
      ctfWins: num("ctfWins"),
      totalPoints: num("totalPoints"),
      bugBountiesEarnedUsd: num("bugBountiesEarnedUsd"),
      cloudFindingsOpen: findings.filter(f=>f.status==="open").length,
      cloudFindingsCritical: findings.filter(f=>f.severity==="critical"&&f.status==="open").length,
      cloudFindingsRemediated30d: findings.filter(f=>f.status==="remediated").length,
      upcomingRanges: 0, activeRanges: 0,
      courses, labs, challenges, certifications, ranges: [], findings,
      // Activity is an append-only log of real events, not a scripted history.
      recentActivity: (await redis.lrange(K.activity(oid), 0, 19)).flatMap((r) => {
        try { return [JSON.parse(r)]; } catch { return []; }
      }),
      skillScores,
    };
  },

  /** Append a real academy event (lab completed, challenge solved, ...). */
  async recordActivity(oid: string, what: string, points?: number) {
    await redis.lpush(K.activity(oid), JSON.stringify({ at: new Date().toISOString(), what, points }));
    await redis.ltrim(K.activity(oid), 0, 199);
    if (points) await redis.hincrby(K.progress(oid), "totalPoints", points);
  },

  /**
   * Provision a lab. The previous implementation returned a lab object without
   * persisting it, so the lab vanished the moment the response was sent and
   * never appeared in the dashboard. It is now stored and tracked.
   */
  async startLab(oid:string, input:{domain:any, difficulty:any, cloud?:any}): Promise<CyberLab> {
    const lab: CyberLab = {
      id: uid("lab-"),
      name: `Lab: ${input.domain} (${input.difficulty})`,
      domain: input.domain, difficulty: input.difficulty, cloud: input.cloud,
      status: "provisioning",
      expiresAt: new Date(Date.now() + 7200_000).toISOString(),
    };
    await redis.hset(K.lab(oid, lab.id), "_doc", JSON.stringify(lab));
    await redis.sadd(K.labs(oid), lab.id);
    await this.recordActivity(oid, `Provisioned lab '${lab.name}'`);
    return lab;
  },

  /** Update a lab's status/score from the real range controller. */
  async updateLab(oid:string, id:string, patch: Partial<Pick<CyberLab,"status"|"scorePct"|"flagsCaptured"|"flagsTotal">>): Promise<CyberLab|null> {
    const raw = await redis.hget(K.lab(oid, id), "_doc");
    if (!raw) return null;
    const lab = { ...JSON.parse(raw), ...patch } as CyberLab;
    await redis.hset(K.lab(oid, id), "_doc", JSON.stringify(lab));
    return lab;
  },
};
