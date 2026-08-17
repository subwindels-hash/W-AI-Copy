/**
 * Session 65 — Biomedical & Healthcare Intelligence.
 * Imaging registry, hospital ops, pharmacy alerts, telemedicine.
 * All data uses hashed patient identifiers; access gated behind compliance.
 * Keys: bm:*
 *
 * ── REGISTRY-ONLY SCOPE ──────────────────────────────────────────────
 * This service is an **intake and tracking registry**. It records imaging
 * studies and routes them for human reading. It does NOT interpret images.
 *
 * Previously `submitStudy` waited 1.5s and then attached a randomly chosen
 * finding — "Fracture suspected — correlate clinically", "Pleural effusion
 * left side" — with a fabricated confidence score, and the bootstrap seeded 18
 * such studies against invented patient hashes. Presenting a random draw as an
 * AI radiology finding is unsafe and unusable for any real clinical workflow,
 * so all synthetic diagnostics have been removed.
 *
 * A submitted study now enters status `queued` with an empty `aiFindings`
 * array and stays there until either:
 *   - a real inference provider is configured and returns findings, or
 *   - a radiologist records their read.
 *
 * `aiFindings` is only ever populated from a genuine model or clinician.
 * Hospital-ops metrics, pharmacy alerts and telemedicine sessions are likewise
 * reported from recorded entries only; nothing is simulated.
 *
 * Session 174 (unfinished-module track #9):
 *  - `dashboard()` no longer seeds — it is a pure read. A fresh org returns
 *    empty collections and `avgTurnaroundMin: null` (unmeasured), not 0.
 *  - Tenant is required on every call — no `org-windels` fallback.
 *  - Provenance block explains which numbers are measured.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import {
  BiomedicalDashboard,
  BiomedicalProvenance,
  ImagingStudy,
  HospitalOpsMetric,
  PharmacyAlert,
  TelemedicineSession,
  BIOMED_AREAS,
} from "@windels/shared";

const K = {
  img: (oid: string, id: string) => `bm:img:${oid}:${id}`, imgs: (oid: string) => `bm:imgs:${oid}`,
  ph:  (oid: string, id: string) => `bm:ph:${oid}:${id}`,  phs:  (oid: string) => `bm:phs:${oid}`,
  tl:  (oid: string, id: string) => `bm:tl:${oid}:${id}`,  tls:  (oid: string) => `bm:tls:${oid}`,
  ops: (oid: string) => `bm:ops:${oid}`,
  meta: (oid: string) => `bm:meta:${oid}`,
};
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

/** Patient identifiers are pseudonymous by construction — no PHI is stored. */
const patientHash = () => "pt-" + randomUUID().slice(0, 12);

function assertOrg(oid: string): void {
  if (!oid || typeof oid !== "string" || oid.trim().length === 0) throw new Error("organizationId is required");
}

async function readSet<T>(oid: string, setKey: string, docKey: (id: string) => string): Promise<T[]> {
  const ids = await redis.smembers(setKey);
  const out: T[] = [];
  for (const id of ids) {
    const r = await redis.hgetall(docKey(id));
    if (r._doc) { try { out.push(JSON.parse(r._doc) as T); } catch { /* skip */ } }
  }
  return out;
}

export const BiomedicalService = {
  /**
   * Marks the organization as initialised. Seeds **no** studies, alerts or
   * sessions — a new organization starts empty and fills from real intake.
   *
   * This is NOT called from any read path. It is called only from
   * `bootstrapBiomedical` at server start.
   */
  async ensureBootstrapped(logger?: any, oid?: string, _uid?: string) {
    if (!oid) return;
    assertOrg(oid);
    if (await redis.exists(K.meta(oid))) return;
    await redis.set(K.meta(oid), "1");
    logger?.info?.("[biomedical] initialized (registry-only; no synthetic studies or findings)");
  },

  /**
   * Pure read — never writes. A fresh org returns empty collections and
   * `avgTurnaroundMin: null` rather than fabricating a 0-minute turnaround.
   */
  async dashboard(oid: string): Promise<BiomedicalDashboard> {
    assertOrg(oid);

    const [studies, pharm, telemed, ops] = await Promise.all([
      readSet<ImagingStudy>(oid, K.imgs(oid), (id) => K.img(oid, id)),
      readSet<PharmacyAlert>(oid, K.phs(oid), (id) => K.ph(oid, id)),
      readSet<TelemedicineSession>(oid, K.tls(oid), (id) => K.tl(oid, id)),
      redis.get(K.ops(oid)).then((r) => { try { return r ? JSON.parse(r) as HospitalOpsMetric[] : []; } catch { return []; } }),
    ]);

    const last24 = studies.filter((s) => Date.now() - new Date(s.createdAt).getTime() < 86_400_000);
    const alerts24h = pharm.filter((a) => Date.now() - new Date(a.at).getTime() < 86_400_000).length;

    // Turnaround is measured over studies that actually completed. Empty → null.
    const completed = studies.filter((s) => s.completedAt);
    const avgTurnaroundMin: number | null = completed.length
      ? Math.round(
          completed.reduce((acc, s) =>
            acc + (new Date(s.completedAt!).getTime() - new Date(s.createdAt).getTime()) / 60_000, 0) / completed.length,
        )
      : null;

    const provenance: BiomedicalProvenance = {
      avgTurnaroundMin: completed.length ? "measured" : "unmeasured_no_completed",
      studiesMeasured: completed.length > 0,
      note: completed.length
        ? `Turnaround measured over ${completed.length} completed studies`
        : "No completed studies — turnaround is unmeasured (null, not 0)",
    };

    // Per-area counters are derived from recorded studies, not invented.
    const areas = {} as BiomedicalDashboard["areas"];
    for (const a of BIOMED_AREAS) {
      areas[a] = { enabled: true, models: 0, reviewed24h: 0, escalations24h: 0 };
    }
    areas.medical_imaging.reviewed24h = last24.filter((s) => s.radiologistReviewed).length;
    areas.medical_imaging.escalations24h = last24.filter((s) => s.status === "escalated").length;
    areas.pharmacy.escalations24h = pharm.filter(
      (a) => a.severity === "critical" && Date.now() - new Date(a.at).getTime() < 86_400_000,
    ).length;
    areas.telemedicine.reviewed24h = telemed.filter(
      (t) => Date.now() - new Date(t.startedAt).getTime() < 86_400_000,
    ).length;

    // Compliance posture is an attested control state, not a guess. Until a
    // control has been formally assessed it is reported as a gap.
    const complianceStatus: BiomedicalDashboard["complianceStatus"] = {
      HIPAA: "gap", HITECH: "gap", "FDA-AI-AAP": "gap", "CE-MDR": "gap",
      "ISO-13485": "gap", "21 CFR Part 11": "gap", "GDPR-H": "gap",
    };

    return {
      areas,
      imaging: {
        studies24h: last24.length,
        // "AI assisted" counts studies that carry at least one real finding.
        aiAssisted: last24.filter((s) => s.aiFindings.length > 0).length,
        pendingReview: studies.filter((s) => s.status === "review" || s.status === "queued").length,
        avgTurnaroundMin,
      },
      ops,
      alerts24h,
      pharmacyAlerts: pharm.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20),
      telemetryActive: telemed.filter((t) => !t.endedAt).length,
      complianceStatus,
      recentStudies: studies.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
      provenance,
    };
  },

  /**
   * Register an imaging study for reading.
   *
   * The study is queued with no findings. This service performs no image
   * interpretation: findings are attached only by `recordFindings`, from a
   * configured inference provider or a radiologist's read.
   */
  async submitStudy(input: {
    modality: ImagingStudy["modality"];
    bodyPart: string;
    organizationId: string;
  }): Promise<ImagingStudy> {
    const oid = input.organizationId;
    assertOrg(oid);
    const id = uid("img-");
    const study: ImagingStudy = {
      id,
      patientHash: patientHash(),
      modality: input.modality,
      bodyPart: input.bodyPart,
      aiFindings: [],
      radiologistReviewed: false,
      status: "queued",
      createdAt: new Date().toISOString(),
    };
    await redis.hset(K.img(oid, id), "_doc", s2(study));
    await redis.sadd(K.imgs(oid), id);
    return study;
  },

  async getStudy(oid: string, id: string): Promise<ImagingStudy | null> {
    assertOrg(oid);
    const r = await redis.hgetall(K.img(oid, id));
    if (!r._doc) return null;
    try { return JSON.parse(r._doc) as ImagingStudy; } catch { return null; }
  },

  async listStudies(oid: string, limit = 50): Promise<ImagingStudy[]> {
    assertOrg(oid);
    const all = await readSet<ImagingStudy>(oid, K.imgs(oid), (id) => K.img(oid, id));
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  },

  /**
   * Attach findings from a real reader (model or clinician) and close the study.
   * `reviewedByRadiologist` records that a human signed the read.
   */
  async recordFindings(
    oid: string,
    id: string,
    findings: ImagingStudy["aiFindings"],
    opts?: { reviewedByRadiologist?: boolean },
  ): Promise<ImagingStudy | null> {
    assertOrg(oid);
    const study = await this.getStudy(oid, id);
    if (!study) return null;
    study.aiFindings = findings;
    study.radiologistReviewed = opts?.reviewedByRadiologist ?? study.radiologistReviewed;
    // Anything flagged priority is escalated; a signed human read finalises.
    study.status = findings.some((f) => f.priority)
      ? "escalated"
      : study.radiologistReviewed ? "signed_off" : "review";
    study.completedAt = new Date().toISOString();
    await redis.hset(K.img(oid, id), "_doc", s2(study));
    return study;
  },

  // ── pharmacy alerts (recorded by integrations / staff) ────────────
  async addPharmacyAlert(oid: string, input: Omit<PharmacyAlert, "id" | "at"> & { at?: string }): Promise<PharmacyAlert> {
    assertOrg(oid);
    const id = uid("ph-");
    const alert: PharmacyAlert = { ...input, id, at: input.at ?? new Date().toISOString() };
    await redis.hset(K.ph(oid, id), "_doc", s2(alert));
    await redis.sadd(K.phs(oid), id);
    return alert;
  },

  // ── telemedicine sessions ─────────────────────────────────────────
  async startTelemedSession(
    oid: string,
    input: { providerId: string; modality: TelemedicineSession["modality"]; language?: string; aiScribeActive?: boolean },
  ): Promise<TelemedicineSession> {
    assertOrg(oid);
    const id = uid("tl-");
    const session: TelemedicineSession = {
      id,
      providerId: input.providerId,
      patientHash: patientHash(),
      startedAt: new Date().toISOString(),
      modality: input.modality,
      language: input.language ?? "en",
      aiScribeActive: input.aiScribeActive ?? false,
      summaryGenerated: false,
    };
    await redis.hset(K.tl(oid, id), "_doc", s2(session));
    await redis.sadd(K.tls(oid), id);
    return session;
  },

  async endTelemedSession(oid: string, id: string): Promise<TelemedicineSession | null> {
    assertOrg(oid);
    const r = await redis.hgetall(K.tl(oid, id));
    if (!r._doc) return null;
    const session = JSON.parse(r._doc) as TelemedicineSession;
    session.endedAt = new Date().toISOString();
    await redis.hset(K.tl(oid, id), "_doc", s2(session));
    return session;
  },

  /** Replace the recorded hospital-ops metric set (from a real ops feed). */
  async setOpsMetrics(oid: string, metrics: HospitalOpsMetric[]): Promise<HospitalOpsMetric[]> {
    assertOrg(oid);
    await redis.set(K.ops(oid), s2(metrics));
    return metrics;
  },
};
