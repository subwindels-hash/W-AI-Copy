/**
 * Session 82 — Cybersecurity Academy, Ethical Hacking Platform & Multi-Cloud Security.
 * Session 161 — completion.
 *
 * The rule this session enforces: a **catalogue** (courses, exams, challenge
 * definitions) is static curriculum and may be served as configuration. A
 * **posture** (cloud findings, held certifications, ranges, labs) describes what
 * an organization actually did, and must be a register that starts empty.
 *
 * Before this session `dashboard()` served ten hard-coded cloud security
 * findings — a public S3 ACL, root access keys, a GCP editor service account —
 * to every organization, including ones that had connected no cloud account at
 * all, and reported `cloudFindingsRemediated30d: 4` for remediation that never
 * happened. It also served six vendor certifications as *held*, with scores and
 * achievement dates. Both are now registers.
 *
 * Keys: csec:meta:<org>        csec:lab:<org>:<id>   csec:labs:<org>
 *       csec:progress:<org>    csec:activity:<org>   csec:find:<org>:<id>
 *       csec:finds:<org>       csec:cert:<org>:<id>  csec:certs:<org>
 *       csec:rng:<org>:<id>    csec:rngs:<org>       csec:learners:<org>
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import {
  CyberDashboard, CYBER_DOMAINS, CyberCourse, CyberLab, CyberCertification,
  CyberCertificationTrack, CyberRange, CloudSecurityFinding, CyberChallenge,
  CyberDomain, CyberConnector, CyberProvenance,
  CreateFindingInput, UpdateFindingInput, CreateCertificationInput,
  CreateRangeInput, UpdateRangeInput, StartLabInput,
} from "@windels/shared";

const K = {
  meta: (oid: string) => `csec:meta:${oid}`,
  lab: (oid: string, id: string) => `csec:lab:${oid}:${id}`,
  labs: (oid: string) => `csec:labs:${oid}`,
  progress: (oid: string) => `csec:progress:${oid}`,
  activity: (oid: string) => `csec:activity:${oid}`,
  find: (oid: string, id: string) => `csec:find:${oid}:${id}`,
  finds: (oid: string) => `csec:finds:${oid}`,
  cert: (oid: string, id: string) => `csec:cert:${oid}:${id}`,
  certs: (oid: string) => `csec:certs:${oid}`,
  rng: (oid: string, id: string) => `csec:rng:${oid}:${id}`,
  rngs: (oid: string) => `csec:rngs:${oid}`,
  learners: (oid: string) => `csec:learners:${oid}`,
};
const uid = (p: string) => p + randomUUID().slice(0, 8);
const nowIso = () => new Date().toISOString();
const s2 = (o: unknown) => JSON.stringify(o);
const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ *
 * Catalogue — static curriculum, served as configuration.
 * ------------------------------------------------------------------ */

const COURSE_SEEDS: Array<Omit<CyberCourse, "id" | "enrolled" | "rating" | "kind">> = [
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

/**
 * Exams that exist and can be attempted. These are *tracks*, not achievements —
 * they carry no `passed` or `scorePct`. Recording that someone passed one is a
 * write to the certification register.
 */
const CERT_TRACK_SEEDS: Array<Omit<CyberCertificationTrack, "id" | "kind">> = [
  { name: "CompTIA Security+", vendor: "CompTIA", domain: "fundamentals", level: "beginner" },
  { name: "OSCP", vendor: "Offensive Security", domain: "ethical_hacking", level: "advanced" },
  { name: "CISSP", vendor: "ISC2", domain: "compliance", level: "expert" },
  { name: "AWS Security – Specialty", vendor: "AWS", domain: "cloud_security", level: "advanced" },
  { name: "CEH", vendor: "EC-Council", domain: "ethical_hacking", level: "intermediate" },
  { name: "GCIH", vendor: "GIAC", domain: "incident_response", level: "intermediate" },
];

/**
 * Challenge definitions. Domain, points and difficulty are **authored** here.
 * They used to be assigned by `i % 26`, `i % 6` and `i % 4`, so a challenge's
 * subject matter depended on its position in a title array.
 */
const CHALLENGE_SEEDS: Array<Omit<CyberChallenge, "id" | "solvedBy" | "kind">> = [
  { title: "Buffer Overflow 101", domain: "malware_analysis", points: 100, difficulty: "beginner", category: "lab" },
  { title: "SQLi Basic", domain: "web_security", points: 50, difficulty: "beginner", category: "quiz" },
  { title: "JWT: None algorithm", domain: "api_security", points: 150, difficulty: "intermediate", category: "ctf" },
  { title: "Kerberoasting", domain: "active_directory", points: 250, difficulty: "advanced", category: "lab" },
  { title: "GPO Snafu", domain: "active_directory", points: 200, difficulty: "intermediate", category: "lab" },
  { title: "SSRF to metadata", domain: "cloud_security", points: 300, difficulty: "advanced", category: "ctf" },
  { title: "Race condition coupon", domain: "web_security", points: 200, difficulty: "intermediate", category: "ctf" },
  { title: "K8s privesc via hostPath", domain: "kubernetes_security", points: 350, difficulty: "advanced", category: "lab" },
  { title: "XSS via Markdown", domain: "web_security", points: 100, difficulty: "beginner", category: "quiz" },
  { title: "SID history escalation", domain: "active_directory", points: 400, difficulty: "expert", category: "lab" },
  { title: "Docker socket escape", domain: "container_security", points: 350, difficulty: "advanced", category: "king_of_the_hill" },
  { title: "Path traversal in upload", domain: "web_security", points: 150, difficulty: "intermediate", category: "ctf" },
  { title: "ROP chaining", domain: "malware_analysis", points: 500, difficulty: "expert", category: "ctf" },
  { title: "Bypassing ASLR", domain: "malware_analysis", points: 450, difficulty: "expert", category: "lab" },
  { title: "LDAP injection", domain: "network_security", points: 200, difficulty: "intermediate", category: "ctf" },
];

/** Demo-only findings. Gated, and tagged `demo_seed` when written. */
const DEMO_FINDING_SEEDS: Array<Omit<CloudSecurityFinding, "id"|"organizationId"|"source"|"detectedAt"|"createdAt"|"updatedAt"|"remediatedAt">> = [
  {cloud:"aws",service:"S3",severity:"high",rule:"Public bucket ACL",region:"us-east-1",resource:"demo-bucket-1",status:"open"},
  {cloud:"aws",service:"IAM",severity:"critical",rule:"Root account has active access keys",region:"global",resource:"demo-root",status:"open"},
  {cloud:"azure",service:"Storage",severity:"medium",rule:"Secure transfer not enforced",region:"westeurope",resource:"demo-sa-1",status:"open"},
  {cloud:"gcp",service:"GCS",severity:"high",rule:"Bucket IAM policy grants allUsers",region:"us-central1",resource:"demo-gcs-1",status:"open"},
  {cloud:"aws",service:"EC2",severity:"medium",rule:"Unrestricted SSH (0.0.0.0/0)",region:"us-east-1",resource:"demo-sg-123",status:"open"},
];

export const CYBER_CATALOG = {
  courses(): CyberCourse[] {
    // Stable ids derived from the seed index so they do not churn between
    // reads. enrolled/rating are registry statistics we do not collect.
    return COURSE_SEEDS.map((c, i) => ({ id: `crs-${i}`, enrolled: null, rating: null, kind: "catalog" as const, ...c }));
  },
  challenges(): CyberChallenge[] {
    return CHALLENGE_SEEDS.map((c, i) => ({ id: `ch-${i}`, solvedBy: null, kind: "catalog" as const, ...c }));
  },
  certificationTracks(): CyberCertificationTrack[] {
    return CERT_TRACK_SEEDS.map((c, i) => ({ id: `cert-track-${i}`, kind: "catalog" as const, ...c }));
  },
};

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

async function readAll<T>(setKey: string, itemKey: (id: string) => string): Promise<T[]> {
  const ids = await redis.smembers(setKey);
  const out: T[] = [];
  for (const id of ids) {
    const raw = await redis.hget(itemKey(id), "_doc");
    if (raw) { try { out.push(JSON.parse(raw) as T); } catch { /* skip malformed */ } }
  }
  return out;
}

/** A lab whose TTL has passed is expired, whatever the stored status says. */
function decorateLab(l: CyberLab): CyberLab {
  if (l.status === "stopped" || l.status === "expired") return l;
  if (l.expiresAt && Date.parse(l.expiresAt) <= Date.now()) return { ...l, status: "expired" };
  return l;
}

/**
 * Connector posture. No CSPM integration is opened by this process, so no
 * connector is ever reported as `connected` — the S157 rule.
 */
export function cyberConnectors(): CyberConnector[] {
  const cspm = process.env.WINDELS_CYBER_CSPM_URL?.trim();
  return [
    {
      id: "http-findings",
      name: "HTTP findings ingest",
      status: "ready",
      requiresConfig: false,
      note: "POST /api/v1/cyber/findings — an operator or an external scanner posts a finding. This is the live connector.",
    },
    {
      id: "cspm",
      name: "Cloud Security Posture Management (AWS/Azure/GCP)",
      status: cspm ? "configured_not_connected" : "not_configured",
      requiresConfig: true,
      note: cspm
        ? "WINDELS_CYBER_CSPM_URL is set but this process opens no scanner session — findings must still be posted."
        : "Set WINDELS_CYBER_CSPM_URL to declare a scanner. No cloud account is scanned by WINDELS; the findings register is what was reported to it.",
    },
  ];
}

export const CyberService = {
  /**
   * Demo seed. Gated behind WINDELS_DEMO_DATA and never invoked from a read —
   * the S156 rule. Everything written here is tagged `demo_seed`.
   */
  async ensureBootstrapped(logger?: Logger | { info?: (...a: any[]) => void }, oid = "org-windels") {
    if (await redis.exists(K.meta(oid))) return;
    if (!demoDataEnabled()) return skipDemoSeed("cyber", logger);
    await redis.set(K.meta(oid), "1");
    const now = nowIso();
    for (const f of DEMO_FINDING_SEEDS) {
      const id = uid("f-");
      const rec: CloudSecurityFinding = {
        ...f, id, organizationId: oid, source: "demo_seed",
        detectedAt: now, createdAt: now, updatedAt: now,
      };
      await redis.hset(K.find(oid, id), "_doc", s2(rec));
      await redis.sadd(K.finds(oid), id);
    }
    (logger as any)?.info?.({
      msg: "[cyber] demo seed written",
      findings: DEMO_FINDING_SEEDS.length,
      note: "tagged demo_seed; certifications and ranges are never seeded",
    });
  },

  /**
   * Learner-facing academy rollup.
   *
   * Reads never seed. The catalogue is configuration; findings, certifications,
   * ranges and labs are this organization's own records and are empty until it
   * creates some.
   */
  async dashboard(oid: string): Promise<CyberDashboard> {
    const [labsRaw, findings, certifications, ranges, progress, activityRaw, learnerIds] = await Promise.all([
      readAll<CyberLab>(K.labs(oid), (id) => K.lab(oid, id)),
      readAll<CloudSecurityFinding>(K.finds(oid), (id) => K.find(oid, id)),
      readAll<CyberCertification>(K.certs(oid), (id) => K.cert(oid, id)),
      readAll<CyberRange>(K.rngs(oid), (id) => K.rng(oid, id)),
      redis.hgetall(K.progress(oid)),
      redis.lrange(K.activity(oid), 0, 19),
      redis.smembers(K.learners(oid)),
    ]);

    const labs = labsRaw.map(decorateLab);
    const num = (k: string) => Number(progress?.[k] ?? "0");

    // Skill scores are only reported for domains that were actually scored.
    const skillScores = {} as Record<CyberDomain, number>;
    for (const d of CYBER_DOMAINS) {
      const v = progress?.[`skill:${d}`];
      if (v !== undefined && v !== null && v !== "") skillScores[d] = Number(v);
    }

    const since = Date.now() - 30 * DAY_MS;
    const courses = CYBER_CATALOG.courses();

    const provenance: CyberProvenance = {
      learners: "distinct users with recorded academy activity in this organization",
      findings: findings.length
        ? "records posted to POST /findings (operator, scanner or demo_seed — see finding.source)"
        : "no findings recorded — WINDELS scans no cloud account itself",
      certifications: certifications.length
        ? "credentials recorded via POST /certifications"
        : "no credentials recorded; certificationTracks are available exams, not achievements",
      challenges: "static catalogue; solvedBy is not collected across tenants (null)",
      ranges: ranges.length ? "range register" : "no ranges scheduled",
      labs: "register entries — no container or VM is provisioned by this process",
    };

    return {
      learners: learnerIds.length,
      coursesAvailable: courses.length,
      coursesEnrolled: num("coursesEnrolled"),
      labsActive: labs.filter((l) => l.status === "running").length,
      challengesSolved: num("challengesSolved"),
      certificationsHeld: certifications.filter((c) => c.passed).length,
      // There is no leaderboard. Rank 0 is not a rank.
      leaderboardRank: null,
      ctfWins: num("ctfWins"),
      totalPoints: num("totalPoints"),
      bugBountiesEarnedUsd: num("bugBountiesEarnedUsd"),
      cloudFindingsOpen: findings.filter((f) => f.status === "open").length,
      cloudFindingsCritical: findings.filter((f) => f.severity === "critical" && f.status === "open").length,
      // A true 30-day window over when remediation was recorded.
      cloudFindingsRemediated30d: findings.filter(
        (f) => f.status === "remediated" && f.remediatedAt && Date.parse(f.remediatedAt) >= since,
      ).length,
      upcomingRanges: ranges.filter((r) => r.status === "scheduled").length,
      activeRanges: ranges.filter((r) => r.status === "live").length,
      courses,
      challenges: CYBER_CATALOG.challenges(),
      certificationTracks: CYBER_CATALOG.certificationTracks(),
      labs,
      certifications,
      ranges,
      findings,
      recentActivity: activityRaw.flatMap((r) => {
        try { return [JSON.parse(r)]; } catch { return []; }
      }),
      skillScores,
      provenance,
    };
  },

  /** Append a real academy event (lab completed, challenge solved, ...). */
  async recordActivity(oid: string, what: string, points?: number, userId?: string) {
    await redis.lpush(K.activity(oid), s2({ at: nowIso(), what, points }));
    await redis.ltrim(K.activity(oid), 0, 199);
    if (points) await redis.hincrby(K.progress(oid), "totalPoints", points);
    if (userId) await redis.sadd(K.learners(oid), userId);
  },

  /* ---------------------------- labs ---------------------------- */

  async listLabs(oid: string): Promise<CyberLab[]> {
    const labs = await readAll<CyberLab>(K.labs(oid), (id) => K.lab(oid, id));
    return labs.map(decorateLab).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  },

  /**
   * Provision a lab. `provisioning: "local_state_only"` is stamped so a UI
   * cannot present a register entry as a live cyber range — the S155 rule.
   */
  async startLab(oid: string, input: StartLabInput, userId?: string): Promise<CyberLab> {
    const now = nowIso();
    const lab: CyberLab = {
      id: uid("lab-"),
      organizationId: oid,
      name: `Lab: ${input.domain} (${input.difficulty})`,
      domain: input.domain,
      difficulty: input.difficulty,
      cloud: input.cloud,
      status: "provisioning",
      expiresAt: new Date(Date.now() + 7_200_000).toISOString(),
      createdAt: now,
      provisioning: "local_state_only",
    };
    await redis.hset(K.lab(oid, lab.id), "_doc", s2(lab));
    await redis.sadd(K.labs(oid), lab.id);
    await this.recordActivity(oid, `Provisioned lab '${lab.name}'`, undefined, userId);
    return lab;
  },

  /** Update a lab's status/score from the real range controller. */
  async updateLab(oid: string, id: string, patch: Partial<Pick<CyberLab, "status"|"scorePct"|"flagsCaptured"|"flagsTotal">>): Promise<CyberLab | null> {
    const raw = await redis.hget(K.lab(oid, id), "_doc");
    if (!raw) return null;
    const lab = { ...JSON.parse(raw), ...patch } as CyberLab;
    await redis.hset(K.lab(oid, id), "_doc", s2(lab));
    return decorateLab(lab);
  },

  async stopLab(oid: string, id: string): Promise<CyberLab | null> {
    return this.updateLab(oid, id, { status: "stopped" });
  },

  /* -------------------------- findings -------------------------- */

  async listFindings(oid: string): Promise<CloudSecurityFinding[]> {
    const all = await readAll<CloudSecurityFinding>(K.finds(oid), (id) => K.find(oid, id));
    return all.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  },

  /**
   * Record a cloud security finding. WINDELS does not scan any cloud account —
   * this is what an operator or an external scanner reported, and `source`
   * says which.
   */
  async createFinding(oid: string, input: CreateFindingInput): Promise<CloudSecurityFinding> {
    const now = nowIso();
    const rec: CloudSecurityFinding = {
      id: uid("f-"),
      organizationId: oid,
      cloud: input.cloud,
      service: input.service,
      severity: input.severity,
      rule: input.rule,
      resource: input.resource,
      region: input.region,
      status: "open",
      source: input.source ?? "operator_entered",
      detectedAt: input.detectedAt ?? now,
      createdAt: now,
      updatedAt: now,
    };
    await redis.hset(K.find(oid, rec.id), "_doc", s2(rec));
    await redis.sadd(K.finds(oid), rec.id);
    return rec;
  },

  /** Stamps `remediatedAt` on transition to remediated so the 30d window is real. */
  async updateFinding(oid: string, id: string, patch: UpdateFindingInput): Promise<CloudSecurityFinding | null> {
    const raw = await redis.hget(K.find(oid, id), "_doc");
    if (!raw) return null;
    const cur = JSON.parse(raw) as CloudSecurityFinding;
    const next: CloudSecurityFinding = { ...cur, ...patch, updatedAt: nowIso() };
    if (patch.status === "remediated" && cur.status !== "remediated") next.remediatedAt = nowIso();
    if (patch.status && patch.status !== "remediated") delete next.remediatedAt;
    await redis.hset(K.find(oid, id), "_doc", s2(next));
    return next;
  },

  /* ----------------------- certifications ----------------------- */

  async listCertifications(oid: string): Promise<CyberCertification[]> {
    const all = await readAll<CyberCertification>(K.certs(oid), (id) => K.cert(oid, id));
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /**
   * Record a credential. A certification is only "held" once someone records
   * that it was passed — inferring one from course activity would be a
   * fabricated credential (the S159 rule).
   */
  async createCertification(oid: string, input: CreateCertificationInput): Promise<CyberCertification> {
    const now = nowIso();
    const rec: CyberCertification = {
      id: uid("cert-"),
      organizationId: oid,
      name: input.name,
      vendor: input.vendor,
      passed: input.passed ?? false,
      scorePct: input.scorePct,
      achievedAt: input.achievedAt,
      expiresAt: input.expiresAt,
      preparationProgressPct: input.preparationProgressPct ?? null,
      holderUserId: input.holderUserId,
      source: "operator_entered",
      createdAt: now,
      updatedAt: now,
    };
    await redis.hset(K.cert(oid, rec.id), "_doc", s2(rec));
    await redis.sadd(K.certs(oid), rec.id);
    if (input.holderUserId) await redis.sadd(K.learners(oid), input.holderUserId);
    return rec;
  },

  /* --------------------------- ranges --------------------------- */

  async listRanges(oid: string): Promise<CyberRange[]> {
    const all = await readAll<CyberRange>(K.rngs(oid), (id) => K.rng(oid, id));
    return all.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  },

  async createRange(oid: string, input: CreateRangeInput): Promise<CyberRange> {
    const now = nowIso();
    const rec: CyberRange = {
      id: uid("rng-"),
      organizationId: oid,
      name: input.name,
      kind: input.kind,
      cloudTargets: input.cloudTargets ?? [],
      players: input.players ?? 0,
      durationHours: input.durationHours ?? 2,
      status: "scheduled",
      startsAt: input.startsAt ?? now,
      createdAt: now,
      updatedAt: now,
    };
    await redis.hset(K.rng(oid, rec.id), "_doc", s2(rec));
    await redis.sadd(K.rngs(oid), rec.id);
    return rec;
  },

  async updateRange(oid: string, id: string, patch: UpdateRangeInput): Promise<CyberRange | null> {
    const raw = await redis.hget(K.rng(oid, id), "_doc");
    if (!raw) return null;
    const next = { ...JSON.parse(raw), ...patch, updatedAt: nowIso() } as CyberRange;
    await redis.hset(K.rng(oid, id), "_doc", s2(next));
    return next;
  },

  /* -------------------------- catalogue ------------------------- */

  courses(): CyberCourse[] { return CYBER_CATALOG.courses(); },
  challenges(): CyberChallenge[] { return CYBER_CATALOG.challenges(); },
  certificationTracks(): CyberCertificationTrack[] { return CYBER_CATALOG.certificationTracks(); },
  connectors(): CyberConnector[] { return cyberConnectors(); },

  async health(oid: string) {
    const [findings, certifications] = await Promise.all([
      this.listFindings(oid),
      this.listCertifications(oid),
    ]);
    const scanner = findings.filter((f) => f.source === "scanner_reported").length;
    return {
      findings: findings.length,
      scannerReportedFindings: scanner,
      openFindings: findings.filter((f) => f.status === "open").length,
      certificationsRecorded: certifications.length,
      connectors: cyberConnectors(),
      note: "WINDELS scans no cloud account. Findings are what was posted to it.",
    };
  },
};
