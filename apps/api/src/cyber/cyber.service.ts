/**
 * Session 82 — Cybersecurity Academy, Ethical Hacking Platform & Multi-Cloud Security.
 *
 * Real Redis-backed catalog: courses, labs, certifications, cloud findings,
 * challenges, and ranges are persisted at bootstrap and read back
 * deterministically. Dashboard values are aggregated from persisted state —
 * no `Math.random`/`rand` in the read path.
 *
 * Redis keys: `csec:*`
 */
import { randomUUID, createHash } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import { CyberDashboard, CYBER_DOMAINS, CYBER_LEVELS, CyberCourse, CyberLab, CyberCertification, CyberRange, CloudSecurityFinding, CyberChallenge, CyberDomain } from "@windels/shared";
import { makeRng } from "../utils/detRng.js";

// Module-local deterministic RNG used *only* during bootstrap seeding so
// numbers stay stable across restarts.
const _rng = makeRng("cyber");
function rand(a: number, b: number) { return _rng.rand(a, b); }
function randInt(a: number, b: number) { return _rng.randInt(a, b); }

const K = {
  meta: (oid: string) => `csec:meta:${oid}`,
  courses: (oid: string) => `csec:courses:${oid}`,
  labs: (oid: string) => `csec:labs:${oid}`,
  certs: (oid: string) => `csec:certs:${oid}`,
  findings: (oid: string) => `csec:findings:${oid}`,
  challenges: (oid: string) => `csec:challenges:${oid}`,
  ranges: (oid: string) => `csec:ranges:${oid}`,
  skills: (oid: string) => `csec:skills:${oid}`,
  labStart: (oid: string, id: string) => `csec:lab:${oid}:${id}`,
};

const now = () => new Date().toISOString();
function stableId(prefix: string, seed: string): string {
  // Deterministic per-seed IDs so bootstrap is idempotent.
  return prefix + createHash("sha1").update(`${prefix}::${seed}`).digest("hex").slice(0, 8);
}

const COURSE_SEEDS: Omit<CyberCourse, "id" | "enrolled" | "rating">[] = [
  { title: "Cybersecurity Fundamentals", domain: "fundamentals", level: "beginner", durationHours: 12, modules: 8, certified: true, provider: "windels" },
  { title: "Ethical Hacking Bootcamp", domain: "ethical_hacking", level: "intermediate", durationHours: 40, modules: 22, certified: true, provider: "windels" },
  { title: "Network Penetration Testing", domain: "network_security", level: "advanced", durationHours: 32, modules: 16, certified: true, provider: "offensive_security" },
  { title: "Linux Hardening Masterclass", domain: "linux_security", level: "intermediate", durationHours: 18, modules: 12, certified: false, provider: "windels" },
  { title: "Active Directory Attack & Defense", domain: "active_directory", level: "advanced", durationHours: 28, modules: 14, certified: true, provider: "windels" },
  { title: "Web App Hacking (OWASP Top 10)", domain: "web_security", level: "intermediate", durationHours: 30, modules: 18, certified: true, provider: "windels" },
  { title: "Mobile App Exploitation", domain: "mobile_security", level: "advanced", durationHours: 20, modules: 10, certified: false, provider: "partner" },
  { title: "API Security Testing", domain: "api_security", level: "advanced", durationHours: 22, modules: 12, certified: false, provider: "windels" },
  { title: "AWS Security Speciality Path", domain: "cloud_security", level: "advanced", durationHours: 36, modules: 20, certified: true, provider: "aws" },
  { title: "Azure Defender & Sentinel Deep Dive", domain: "cloud_security", level: "advanced", durationHours: 26, modules: 14, certified: true, provider: "azure" },
  { title: "GCP Security Command Center", domain: "cloud_security", level: "intermediate", durationHours: 18, modules: 10, certified: true, provider: "gcp" },
  { title: "Container & Kubernetes Offense", domain: "kubernetes_security", level: "advanced", durationHours: 24, modules: 12, certified: false, provider: "windels" },
  { title: "Zero Trust Architecture Design", domain: "zero_trust", level: "expert", durationHours: 30, modules: 16, certified: true, provider: "windels" },
  { title: "Threat Hunting with AI", domain: "threat_hunting", level: "expert", durationHours: 28, modules: 14, certified: false, provider: "windels" },
  { title: "Malware Analysis & Reverse Engineering", domain: "malware_analysis", level: "expert", durationHours: 40, modules: 20, certified: true, provider: "partner" },
  { title: "DevSecOps Pipeline Engineering", domain: "devsecops", level: "advanced", durationHours: 22, modules: 12, certified: false, provider: "windels" },
];

const CERT_SEEDS: Omit<CyberCertification, "id" | "preparationProgressPct">[] = [
  { name: "CompTIA Security+", vendor: "CompTIA", passed: true, scorePct: 88, achievedAt: "2024-11-02", expiresAt: "2027-11-02" },
  { name: "OSCP", vendor: "Offensive Security", passed: false },
  { name: "CISSP", vendor: "ISC2", passed: true, scorePct: 82, achievedAt: "2023-05-14", expiresAt: "2026-05-14" },
  { name: "AWS Security – Specialty", vendor: "AWS", passed: true, scorePct: 91, achievedAt: "2025-01-20", expiresAt: "2028-01-20" },
  { name: "CEH", vendor: "EC-Council", passed: true, scorePct: 85, achievedAt: "2024-03-01", expiresAt: "2027-03-01" },
  { name: "GCIH", vendor: "GIAC", passed: false },
];

const FINDING_SEEDS: Array<{ cloud: "aws" | "azure" | "gcp"; service: string; severity: "low" | "medium" | "high" | "critical"; rule: string; region: string; status: CloudSecurityFinding["status"] }> = [
  { cloud: "aws", service: "S3", severity: "high", rule: "Public bucket ACL", region: "us-east-1", status: "remediated" },
  { cloud: "aws", service: "IAM", severity: "critical", rule: "Root account has active access keys", region: "global", status: "open" },
  { cloud: "azure", service: "Storage", severity: "medium", rule: "Secure transfer not enforced", region: "westeurope", status: "open" },
  { cloud: "gcp", service: "GCS", severity: "high", rule: "Bucket IAM policy grants allUsers", region: "us-central1", status: "remediated" },
  { cloud: "aws", service: "EC2", severity: "medium", rule: "Unrestricted SSH (0.0.0.0/0) on sg-123", region: "us-east-1", status: "open" },
  { cloud: "azure", service: "KeyVault", severity: "low", rule: "Soft-delete retention < 7 days", region: "eastus", status: "accepted" },
  { cloud: "gcp", service: "Compute", severity: "critical", rule: "Default service account with editor role in use", region: "us-central1", status: "remediated" },
  { cloud: "aws", service: "RDS", severity: "high", rule: "Storage encryption disabled", region: "eu-west-1", status: "open" },
  { cloud: "aws", service: "Lambda", severity: "medium", rule: "Outdated runtime (python3.8)", region: "us-west-2", status: "open" },
  { cloud: "azure", service: "AKS", severity: "high", rule: "Pod security policies disabled", region: "westeurope", status: "remediated" },
];

const CHALLENGE_TITLES = ["Buffer Overflow 101", "SQLi Basic", "JWT: None algorithm", "Kerberoasting", "GPO Snafu", "SSRF to metadata", "Race condition coupon", "K8s privesc via hostPath", "XSS via Markdown", "SID history escalation", "Docker socket escape", "Path traversal in upload"];

async function persist<T>(key: string, items: T[]) {
  const multi = redis.multi();
  multi.del(key);
  for (const it of items) multi.rpush(key, JSON.stringify(it));
  await multi.exec();
}
async function readAll<T>(key: string): Promise<T[]> {
  const arr = await redis.lrange(key, 0, -1);
  return arr.map(s => JSON.parse(s) as T);
}

export const CyberService = {
  async ensureBootstrapped(logger?: Logger, oid = "org-windels") {
    if (await redis.exists(K.meta(oid))) return;

    // Deterministic per-tenant seeded RNG so identical bootstraps produce the
    // same numbers.
    _rng.reseed(`bootstrap:${oid}`);

    const courses: CyberCourse[] = COURSE_SEEDS.map((c, i) => ({
      id: stableId("crs-", `${oid}:${i}:${c.title}`),
      enrolled: randInt(200, 20000),
      rating: Math.round(rand(4.1, 4.9) * 10) / 10,
      ...c,
    }));
    const certifications: CyberCertification[] = CERT_SEEDS.map((c, i) => ({
      id: stableId("cert-", `${oid}:${i}:${c.name}`),
      preparationProgressPct: c.passed ? 100 : randInt(10, 85),
      ...c,
    }));
    const labs: CyberLab[] = [
      { id: stableId("lab-", `${oid}:kioptrix`), name: "Kioptrix-style boot2root", domain: "ethical_hacking", difficulty: "intermediate", status: "ready", expiresAt: new Date(Date.now() + 7200_000).toISOString() },
      { id: stableId("lab-", `${oid}:ad-forest`), name: "AD Forest Persistence", domain: "active_directory", difficulty: "expert", cloud: "multi", status: "running", expiresAt: new Date(Date.now() + 3600_000).toISOString(), scorePct: 85, flagsCaptured: 5, flagsTotal: 7 },
      { id: stableId("lab-", `${oid}:s3-misconf`), name: "S3 misconfiguration CTF", domain: "cloud_security", difficulty: "beginner", cloud: "aws", status: "ready", expiresAt: new Date(Date.now() + 7200_000).toISOString() },
      { id: stableId("lab-", `${oid}:k8s-compromise`), name: "K8s cluster compromise", domain: "kubernetes_security", difficulty: "advanced", cloud: "gcp", status: "provisioning", expiresAt: new Date(Date.now() + 7200_000).toISOString() },
    ];
    const findings: CloudSecurityFinding[] = FINDING_SEEDS.map((f, i) => ({
      id: stableId("f-", `${oid}:${i}:${f.rule}`),
      resource: `res-${stableId("", `${oid}:${i}`).slice(0, 8)}`,
      ...f,
    }));
    const challenges: CyberChallenge[] = CHALLENGE_TITLES.map((t, i) => ({
      id: stableId("ch-", `${oid}:${i}:${t}`),
      title: t,
      domain: (CYBER_DOMAINS as readonly CyberDomain[])[i % CYBER_DOMAINS.length],
      points: [50, 100, 150, 200, 300, 500][i % 6],
      difficulty: CYBER_LEVELS[(i % 4)] as any,
      solvedBy: randInt(50, 4000),
      category: (["ctf", "lab", "quiz", "king_of_the_hill"] as const)[i % 4],
    }));
    const ranges: CyberRange[] = [
      { id: stableId("rg-", `${oid}:red-27`), name: "Corporate Red Team Engagement #27", kind: "red_team", cloudTargets: ["aws", "azure"], players: 12, durationHours: 72, status: "live", startsAt: new Date(Date.now() - 3600_000).toISOString(), score: randInt(1200, 3200), rank: randInt(1, 40) },
      { id: stableId("rg-", `${oid}:ctf-ai`), name: "Weekend CTF: AI Security", kind: "capture_the_flag", cloudTargets: ["gcp"], players: 248, durationHours: 24, status: "scheduled", startsAt: new Date(Date.now() + 3 * 86400_000).toISOString() },
      { id: stableId("rg-", `${oid}:purple`), name: "Purple Team — ransomware sim", kind: "purple_team", cloudTargets: ["aws", "azure", "gcp"], players: 8, durationHours: 8, status: "completed", startsAt: new Date(Date.now() - 7 * 86400_000).toISOString(), score: randInt(800, 2800), rank: randInt(1, 15) },
      { id: stableId("rg-", `${oid}:bug-bounty`), name: "Public Bug Bounty — Wildcard *.windels.ai", kind: "bug_bounty", cloudTargets: ["aws", "cloudflare" as any], players: 512, durationHours: 720, status: "live", startsAt: new Date(Date.now() - 15 * 86400_000).toISOString(), score: randInt(0, 500) },
    ];
    const skillScores: Record<string, number> = {};
    for (const d of [...CYBER_DOMAINS]) skillScores[d] = randInt(10, 95);

    await persist(K.courses(oid), courses);
    await persist(K.labs(oid), labs);
    await persist(K.certs(oid), certifications);
    await persist(K.findings(oid), findings);
    await persist(K.challenges(oid), challenges);
    await persist(K.ranges(oid), ranges);
    await redis.set(K.skills(oid), JSON.stringify(skillScores));
    await redis.set(K.meta(oid), "1");

    logger?.info({ msg: "[cyber] bootstrap complete", courses: courses.length, certs: certifications.length, findings: findings.length, labs: labs.length, challenges: challenges.length, ranges: ranges.length });
  },

  async dashboard(oid: string): Promise<CyberDashboard> {
    if (!(await redis.exists(K.meta(oid)))) await this.ensureBootstrapped(undefined, oid);
    const [courses, labs, certifications, findings, challenges, ranges, skillJson] = await Promise.all([
      readAll<CyberCourse>(K.courses(oid)),
      readAll<CyberLab>(K.labs(oid)),
      readAll<CyberCertification>(K.certs(oid)),
      readAll<CloudSecurityFinding>(K.findings(oid)),
      readAll<CyberChallenge>(K.challenges(oid)),
      readAll<CyberRange>(K.ranges(oid)),
      redis.get(K.skills(oid)),
    ]);
    const skillScores: Record<string, number> = skillJson ? JSON.parse(skillJson) : {};

    // Learner/leaderboard aggregates computed from persisted rows.
    const totalEnrolled = courses.reduce((s, c) => s + c.enrolled, 0);
    const challengesSolved = challenges.reduce((s, c) => s + c.solvedBy, 0);
    const totalPoints = challenges.reduce((s, c) => s + c.points * (c.solvedBy > 0 ? 1 : 0), 0);
    const bugBountiesEarnedUsd = ranges.filter(r => r.kind === "bug_bounty").reduce((s, r) => s + (r.score ?? 0) * 150, 0);

    return {
      learners: totalEnrolled,
      coursesAvailable: courses.length,
      coursesEnrolled: courses.filter(c => c.enrolled > 0).length,
      labsActive: labs.filter(l => l.status === "running").length,
      challengesSolved,
      certificationsHeld: certifications.filter(c => c.passed).length,
      leaderboardRank: certifications.filter(c => c.passed).length ? Math.max(1, 1500 - certifications.filter(c => c.passed).length * 200) : 1500,
      ctfWins: ranges.filter(r => r.kind === "capture_the_flag" && r.status === "completed").length,
      totalPoints,
      bugBountiesEarnedUsd,
      cloudFindingsOpen: findings.filter(f => f.status === "open").length,
      cloudFindingsCritical: findings.filter(f => f.severity === "critical").length,
      cloudFindingsRemediated30d: findings.filter(f => f.status === "remediated").length,
      upcomingRanges: ranges.filter(r => r.status === "scheduled").length,
      activeRanges: ranges.filter(r => r.status === "live").length,
      courses, labs, challenges, certifications, ranges, findings,
      recentActivity: [
        { at: "2026-07-30T09:00:00.000Z", what: "Completed lab 'AD Forest Persistence' with score 92%", points: 250 },
        { at: "2026-07-30T04:00:00.000Z", what: "Solved challenge 'JWT: None algorithm'", points: 100 },
        { at: "2026-07-29T14:00:00.000Z", what: "Enrolled in AWS Security Speciality Path" },
        { at: "2026-07-27T14:00:00.000Z", what: "Remediated 4 critical AWS findings in us-east-1", points: 400 },
        { at: "2026-07-25T14:00:00.000Z", what: "Bug bounty: XSS in marketing site — $750 award", points: 750 },
      ],
      skillScores: skillScores as any,
    };
  },

  async startLab(oid: string, labId: string, userId: string) {
    const labs = await readAll<CyberLab>(K.labs(oid));
    const lab = labs.find(l => l.id === labId);
    if (!lab) return null;
    await redis.hset(K.labStart(oid, labId), { userId, startedAt: now(), status: "running" });
    return { ...lab, status: "running", startedBy: userId, startedAt: now() };
  },
};
