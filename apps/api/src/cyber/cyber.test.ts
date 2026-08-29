/**
 * Session 161 — Cyber completion.
 *
 * These tests pin the distinction the session exists to enforce: a catalogue is
 * curriculum and may be served; a posture is a register and starts empty.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
vi.mock("../config/demoData.js", async (orig) => {
  const actual = await (orig() as Promise<typeof import("../config/demoData.js")>);
  return { ...actual, demoDataEnabled: () => false };
});

const { CyberService } = await import("./cyber.service.js");

const ORG_A = "org-cyb-a";
const ORG_B = "org-cyb-b";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("Cyber — Session 161 completion", () => {
  it("a fresh org has NO cloud security findings", async () => {
    // The headline defect: ten hard-coded findings (public S3 ACL, root access
    // keys, GCP editor SA) used to be served to every organization.
    const d = await CyberService.dashboard(ORG_A);
    expect(d.findings).toEqual([]);
    expect(d.cloudFindingsOpen).toBe(0);
    expect(d.cloudFindingsCritical).toBe(0);
    expect(d.cloudFindingsRemediated30d).toBe(0);
    expect(d.provenance.findings).toMatch(/no findings recorded/i);
  });

  it("a fresh org holds NO certifications", async () => {
    const d = await CyberService.dashboard(ORG_A);
    expect(d.certifications).toEqual([]);
    expect(d.certificationsHeld).toBe(0);
    // The exams still exist as a catalogue — but as tracks, not achievements.
    expect(d.certificationTracks.length).toBeGreaterThan(0);
    for (const t of d.certificationTracks) {
      expect(t.kind).toBe("catalog");
      expect(t).not.toHaveProperty("passed");
      expect(t).not.toHaveProperty("scorePct");
    }
  });

  it("reads never seed, even when demo data would be on", async () => {
    await CyberService.dashboard(ORG_A);
    await CyberService.dashboard(ORG_A);
    expect(await CyberService.listFindings(ORG_A)).toEqual([]);
    expect(await CyberService.listLabs(ORG_A)).toEqual([]);
  });

  it("ensureBootstrapped writes nothing when demo data is off", async () => {
    await CyberService.ensureBootstrapped(undefined, ORG_A);
    expect(await CyberService.listFindings(ORG_A)).toEqual([]);
  });

  it("uncollected statistics are null, never 0", async () => {
    const d = await CyberService.dashboard(ORG_A);
    // rank 0 is not a rank
    expect(d.leaderboardRank).toBeNull();
    for (const c of d.courses) {
      expect(c.enrolled).toBeNull();
      expect(c.rating).toBeNull();
    }
    for (const ch of d.challenges) {
      expect(ch.solvedBy).toBeNull();
    }
  });

  it("challenge domain/points/difficulty are authored, not positional", async () => {
    const chs = CyberService.challenges();
    const sqli = chs.find((c) => c.title === "SQLi Basic")!;
    const kerb = chs.find((c) => c.title === "Kerberoasting")!;
    const rop = chs.find((c) => c.title === "ROP chaining")!;
    expect(sqli.domain).toBe("web_security");
    expect(kerb.domain).toBe("active_directory");
    expect(rop.domain).toBe("malware_analysis");
    // difficulty tracks the subject, not `i % 4`
    expect(sqli.difficulty).toBe("beginner");
    expect(rop.difficulty).toBe("expert");
    expect(rop.points).toBeGreaterThan(sqli.points);
  });

  it("a recorded finding is operator_entered and counts honestly", async () => {
    const f = await CyberService.createFinding(ORG_A, {
      cloud: "aws", service: "S3", severity: "critical",
      rule: "Public bucket ACL", resource: "prod-assets", region: "us-east-1",
    });
    expect(f.source).toBe("operator_entered");
    expect(f.status).toBe("open");
    expect(f.remediatedAt).toBeUndefined();

    const d = await CyberService.dashboard(ORG_A);
    expect(d.cloudFindingsOpen).toBe(1);
    expect(d.cloudFindingsCritical).toBe(1);
    expect(d.provenance.findings).toMatch(/posted/i);
  });

  it("scanner_reported is distinguishable from operator_entered", async () => {
    await CyberService.createFinding(ORG_A, {
      cloud: "gcp", service: "GCS", severity: "high", rule: "allUsers",
      resource: "b1", region: "us-central1", source: "scanner_reported",
    });
    const h = await CyberService.health(ORG_A);
    expect(h.scannerReportedFindings).toBe(1);
    expect(h.note).toMatch(/scans no cloud account/i);
  });

  it("remediated30d is a real window stamped on transition", async () => {
    const f = await CyberService.createFinding(ORG_A, {
      cloud: "azure", service: "Storage", severity: "medium",
      rule: "Secure transfer off", resource: "sa1", region: "westeurope",
    });
    let d = await CyberService.dashboard(ORG_A);
    expect(d.cloudFindingsRemediated30d).toBe(0);

    const upd = await CyberService.updateFinding(ORG_A, f.id, { status: "remediated" });
    expect(upd!.remediatedAt).toBeTruthy();

    d = await CyberService.dashboard(ORG_A);
    expect(d.cloudFindingsRemediated30d).toBe(1);
    expect(d.cloudFindingsOpen).toBe(0);
  });

  it("an 'accepted' finding is not counted as remediated", async () => {
    const f = await CyberService.createFinding(ORG_A, {
      cloud: "aws", service: "EC2", severity: "low", rule: "x",
      resource: "i-1", region: "us-east-1",
    });
    await CyberService.updateFinding(ORG_A, f.id, { status: "accepted" });
    const d = await CyberService.dashboard(ORG_A);
    expect(d.cloudFindingsRemediated30d).toBe(0);
    expect(d.cloudFindingsOpen).toBe(0);
  });

  it("reverting a remediated finding clears remediatedAt", async () => {
    const f = await CyberService.createFinding(ORG_A, {
      cloud: "aws", service: "RDS", severity: "high", rule: "unencrypted",
      resource: "db1", region: "eu-west-1",
    });
    await CyberService.updateFinding(ORG_A, f.id, { status: "remediated" });
    const back = await CyberService.updateFinding(ORG_A, f.id, { status: "open" });
    expect(back!.remediatedAt).toBeUndefined();
    const d = await CyberService.dashboard(ORG_A);
    expect(d.cloudFindingsRemediated30d).toBe(0);
  });

  it("certificationsHeld counts only recorded passes", async () => {
    await CyberService.createCertification(ORG_A, { name: "OSCP", vendor: "OffSec", passed: false });
    let d = await CyberService.dashboard(ORG_A);
    expect(d.certificationsHeld).toBe(0);

    await CyberService.createCertification(ORG_A, {
      name: "CompTIA Security+", vendor: "CompTIA", passed: true, scorePct: 88,
    });
    d = await CyberService.dashboard(ORG_A);
    expect(d.certificationsHeld).toBe(1);
  });

  it("preparation progress is null when not supplied, never 0", async () => {
    const c = await CyberService.createCertification(ORG_A, { name: "CISSP", vendor: "ISC2" });
    expect(c.preparationProgressPct).toBeNull();
  });

  it("a lab is a register entry, stamped local_state_only", async () => {
    const lab = await CyberService.startLab(ORG_A, { domain: "web_security", difficulty: "intermediate" });
    expect(lab.provisioning).toBe("local_state_only");
    expect(lab.status).toBe("provisioning");
    const labs = await CyberService.listLabs(ORG_A);
    expect(labs).toHaveLength(1);
  });

  it("a lab past its TTL reads as expired", async () => {
    const lab = await CyberService.startLab(ORG_A, { domain: "iam", difficulty: "beginner" });
    // Force the stored expiry into the past.
    await CyberService.updateLab(ORG_A, lab.id, { status: "running" });
    const raw = kv.hashes.get(`csec:lab:${ORG_A}:${lab.id}`)!;
    const doc = JSON.parse(raw["_doc"]!);
    doc.expiresAt = new Date(Date.now() - 1000).toISOString();
    raw["_doc"] = JSON.stringify(doc);

    const labs = await CyberService.listLabs(ORG_A);
    expect(labs[0]!.status).toBe("expired");
    const d = await CyberService.dashboard(ORG_A);
    expect(d.labsActive).toBe(0);
  });

  it("stopping a lab keeps it stopped, not expired", async () => {
    const lab = await CyberService.startLab(ORG_A, { domain: "forensics", difficulty: "advanced" });
    const stopped = await CyberService.stopLab(ORG_A, lab.id);
    expect(stopped!.status).toBe("stopped");
  });

  it("ranges are a real register with a lifecycle", async () => {
    const r = await CyberService.createRange(ORG_A, { name: "Q3 Purple", kind: "purple_team" });
    expect(r.status).toBe("scheduled");
    let d = await CyberService.dashboard(ORG_A);
    expect(d.upcomingRanges).toBe(1);
    expect(d.activeRanges).toBe(0);

    await CyberService.updateRange(ORG_A, r.id, { status: "live" });
    d = await CyberService.dashboard(ORG_A);
    expect(d.upcomingRanges).toBe(0);
    expect(d.activeRanges).toBe(1);
  });

  it("learners are counted from recorded activity, not invented", async () => {
    let d = await CyberService.dashboard(ORG_A);
    expect(d.learners).toBe(0);
    await CyberService.recordActivity(ORG_A, "Solved SQLi Basic", 50, "user-1");
    await CyberService.recordActivity(ORG_A, "Solved XSS", 100, "user-1");
    await CyberService.recordActivity(ORG_A, "Solved JWT", 150, "user-2");
    d = await CyberService.dashboard(ORG_A);
    expect(d.learners).toBe(2);
    expect(d.totalPoints).toBe(300);
  });

  it("skill scores only report domains that were actually scored", async () => {
    const d = await CyberService.dashboard(ORG_A);
    expect(Object.keys(d.skillScores)).toHaveLength(0);
  });

  it("no connector is ever reported as connected", async () => {
    const cs = CyberService.connectors();
    for (const c of cs) expect(c.status).not.toBe("connected");
    expect(cs.find((c) => c.id === "cspm")!.status).toBe("not_configured");
  });

  it("findings and certifications are tenant-isolated", async () => {
    await CyberService.createFinding(ORG_A, {
      cloud: "aws", service: "S3", severity: "high", rule: "r",
      resource: "x", region: "us-east-1",
    });
    await CyberService.createCertification(ORG_A, { name: "CEH", vendor: "EC", passed: true });
    await CyberService.startLab(ORG_A, { domain: "iam", difficulty: "beginner" });

    const b = await CyberService.dashboard(ORG_B);
    expect(b.findings).toEqual([]);
    expect(b.certifications).toEqual([]);
    expect(b.labs).toEqual([]);
    expect(b.certificationsHeld).toBe(0);
  });

  it("the course catalogue is still served and labelled as catalogue", async () => {
    const d = await CyberService.dashboard(ORG_A);
    expect(d.coursesAvailable).toBeGreaterThan(10);
    for (const c of d.courses) expect(c.kind).toBe("catalog");
  });
});
