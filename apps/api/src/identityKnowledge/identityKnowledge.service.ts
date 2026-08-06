/**
 * Session 125 — Super Admin Biography, Identity Memory & AI Knowledge System.
 *
 * The platform's centralized enterprise knowledge system for its owner,
 * organizations, companies, brands and products. Every record is governed:
 *
 *   - **Super Admin is the only authority.** create/update/approve/publish/
 *     archive/delete/import/grant are super-admin-only (route-level
 *     requireSuperAdmin + service-level superAdminOnly checks, so a
 *     mis-wired route still cannot bypass it).
 *   - **Classification.** private (Super Admin + explicitly granted
 *     administrators), organization (org members), public (any
 *     authenticated caller). `verified` is set ONLY by a Super Admin
 *     publish.
 *   - **Lifecycle + versions + audit.** draft → pending_approval → approved
 *     → published | archived. Every mutation appends a version and writes an
 *     AuditLog row (the existing Prisma model).
 *   - **Continuous synchronization.** On publish (and on manual sync) each
 *     record is written into the Enterprise Memory Fabric via
 *     `MemoryEvolutionService.add` (content-deduplicated by the fabric, so
 *     re-syncs never duplicate) and dispatched as a Kernel (God-Node) event.
 *   - **AI response engine.** `ask()` answers only from records the caller
 *     may see, ranks Verified highest, labels the AI-generated summary as
 *     such, returns its sources for full traceability, and says it does not
 *     have sufficient approved knowledge rather than fabricating.
 *   - **Knowledge agents** (AI Workforce): 8 specialized roles whose runs
 *     are deterministic, audit-logged and kernel-dispatched.
 *
 * Keys (org id always in the segment straight after `ik:`):
 *   ik:rec:<org>:<id> / ik:recidx:<org>
 *   ik:ver:<org>:<recId>:<n> / ik:veridx:<org>:<recId>
 *   ik:grant:<org>:<recId>        (set of user ids)
 *   ik:act:<org>                  activity ledger (capped)
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { logger } from "../config/logger.js";
import {
  IK_AGENTS,
  IDENTITY_KNOWLEDGE_STATUSES,
} from "@windels/shared/identityKnowledge";
import type {
  IkAgentId,
  IkAgentRun,
  IkAnswer,
  IkDashboard,
  IkGraph,
  IkKnowledgeRecord,
  IkRecordCreateInput,
  IkRecordUpdateInput,
  IkRecordVersion,
  IdentityKnowledgeClassification,
  IdentityKnowledgeKind,
  IdentityKnowledgeStatus,
} from "@windels/shared/identityKnowledge";

const K = {
  rec: (oid: string, id: string) => `ik:rec:${oid}:${id}`,
  recidx: (oid: string) => `ik:recidx:${oid}`,
  ver: (oid: string, rid: string, n: number) => `ik:ver:${oid}:${rid}:${n}`,
  veridx: (oid: string, rid: string) => `ik:veridx:${oid}:${rid}`,
  grant: (oid: string, rid: string) => `ik:grant:${oid}:${rid}`,
  act: (oid: string) => `ik:act:${oid}`,
};

const MAX_RECORDS = 5000;
const MAX_VERSIONS = 100;
const ACT_CAP = 500;

const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

/** Super Admin authority — the single trusted authority for all mutations. */
export function superAdminOnly(actor: { id: string; role: string | null }): void {
  if (actor.role !== "SUPER_ADMIN") {
    throw AppError.forbidden("Only the Super Admin may manage identity knowledge records");
  }
}

export async function pushActivity(oid: string, action: string, label: string, at = new Date()) {
  const entry = { at: at.toISOString(), action, label };
  await redis.lpush(K.act(oid), JSON.stringify(entry));
  await redis.ltrim(K.act(oid), 0, ACT_CAP - 1);
}

async function audit(oid: string, actorId: string, action: string, resourceId: string, metadata: Record<string, unknown> = {}) {
  try {
    await prisma.auditLog.create({
      data: { organizationId: oid, userId: actorId, action, resourceType: "IdentityKnowledgeRecord", resourceId, metadata },
    });
  } catch (err) {
    // Audit must never break the write path; log instead.
    logger.warn("[identity-knowledge] audit write failed", { err: (err as Error).message });
  }
}

async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ source: "identity-knowledge", kind, payload });
  } catch { /* best effort */ }
}

async function syncToMemoryFabric(oid: string, rec: IkKnowledgeRecord) {
  try {
    const { MemoryEvolutionService } = await import("../memoryEvolution/memoryEvolution.service.js");
    // The fabric deduplicates by content+scope, so re-syncs never duplicate.
    await MemoryEvolutionService.add({
      type: "knowledge",
      content: `${rec.kind} — ${rec.title}\n${rec.body.slice(0, 4000)}`,
      tags: [rec.kind, ...rec.tags.slice(0, 6)],
      scope: `org:${oid}`,
      confidence: rec.verified ? 1 : 0.9,
    });
    return true;
  } catch (err) {
    logger.warn("[identity-knowledge] memory sync failed", { err: (err as Error).message });
    return false;
  }
}

function newId(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export const IdentityKnowledgeService = {
  /* ── Records ─────────────────────────────────────────────────────── */

  async create(oid: string, actor: { id: string; role: string | null }, input: IkRecordCreateInput): Promise<IkKnowledgeRecord> {
    superAdminOnly(actor);
    const rec: IkKnowledgeRecord = {
      id: newId("ikr"),
      kind: input.kind,
      title: input.title,
      body: input.body,
      classification: input.classification,
      verified: false,
      status: "draft",
      category: input.category,
      tags: input.tags,
      documents: [],
      relations: [],
      grants: [],
      version: 1,
      createdBy: actor.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: null,
      archivedAt: null,
    };
    await redis.set(K.rec(oid, rec.id), JSON.stringify(rec));
    await redis.lpush(K.recidx(oid), rec.id);
    await redis.ltrim(K.recidx(oid), 0, MAX_RECORDS - 1);
    await this.appendVersion(oid, rec, "created", actor.id);
    await audit(oid, actor.id, "identityKnowledge.created", rec.id, { kind: rec.kind, classification: rec.classification });
    await pushActivity(oid, "record.created", `${rec.kind}: ${rec.title}`);
    await emitKernel("identity-knowledge.record.created", { recordId: rec.id, title: rec.title, kind: rec.kind });
    return rec;
  },

  async getRecord(oid: string, id: string): Promise<IkKnowledgeRecord | null> {
    return j<IkKnowledgeRecord>(await redis.get(K.rec(oid, id)));
  },

  async listRecords(
    oid: string,
    viewer: { id: string; role: string | null },
    q: { kind?: IdentityKnowledgeKind; classification?: IdentityKnowledgeClassification; status?: IdentityKnowledgeStatus; tag?: string; search?: string; limit?: number } = {},
  ): Promise<IkKnowledgeRecord[]> {
    const ids = await redis.lrange(K.recidx(oid), 0, -1);
    const out: IkKnowledgeRecord[] = [];
    for (const id of ids) {
      const rec = j<IkKnowledgeRecord>(await redis.get(K.rec(oid, id)));
      if (!rec) continue;
      if (!(await this.canView(oid, rec, viewer))) continue;
      if (q.kind && rec.kind !== q.kind) continue;
      if (q.classification && rec.classification !== q.classification) continue;
      if (q.status && rec.status !== q.status) continue;
      if (q.tag && !rec.tags.includes(q.tag)) continue;
      if (q.search) {
        const needle = q.search.toLowerCase();
        if (!rec.title.toLowerCase().includes(needle) && !rec.body.toLowerCase().includes(needle) && !rec.tags.join(" ").toLowerCase().includes(needle)) continue;
      }
      out.push(rec);
    }
    return out.slice(0, q.limit ?? 200);
  },

  /** Permission-aware visibility: private → Super Admin or explicit grant
   *  or org admin (hasPermission ORG_ADMIN); organization → any org member;
   *  public → any authenticated caller. */
  async canView(oid: string, rec: IkKnowledgeRecord, viewer: { id: string; role: string | null }): Promise<boolean> {
    if (viewer.role === "SUPER_ADMIN") return true;
    if (rec.classification === "public") return true;
    if (rec.classification === "organization") return true; // viewer is an org member by construction
    // private
    const grants = await redis.smembers(K.grant(oid, rec.id));
    if (grants.includes(viewer.id)) return true;
    try {
      const { Permission } = await import("@prisma/client");
      const { hasPermission } = await import("../services/permissions.service.js");
      return await hasPermission(viewer.id, (Permission as any).ORG_ADMIN ?? "ORG_ADMIN");
    } catch {
      return false;
    }
  },

  /** Records the caller may see that the enterprise search may index. */
  async listSearchable(oid: string, viewer: { id: string; role: string | null }): Promise<Array<{ id: string; title: string; body: string; updatedAt: string; tags: string[]; classification: IdentityKnowledgeClassification }>> {
    const all = await this.listRecords(oid, viewer, {});
    return all
      .filter((r) => r.status === "published")
      .map((r) => ({ id: r.id, title: r.title, body: r.body, updatedAt: r.updatedAt, tags: r.tags, classification: r.classification }));
  },

  async update(oid: string, actor: { id: string; role: string | null }, id: string, input: IkRecordUpdateInput): Promise<IkKnowledgeRecord> {
    superAdminOnly(actor);
    const rec = await this.getRecord(oid, id);
    if (!rec) throw AppError.notFound("Record not found");
    // A published record cannot be silently edited: edits return it to
    // pending_approval so the change must be re-approved.
    const wasPublished = rec.status === "published";
    const next: IkKnowledgeRecord = {
      ...rec,
      title: input.title ?? rec.title,
      body: input.body ?? rec.body,
      classification: input.classification ?? rec.classification,
      category: input.category ?? rec.category,
      tags: input.tags ?? rec.tags,
      status: input.status ?? (wasPublished ? "pending_approval" : rec.status),
      verified: wasPublished ? false : rec.verified,
      version: rec.version + 1,
      updatedAt: new Date().toISOString(),
    };
    if (input.status === "archived") {
      next.archivedAt = new Date().toISOString();
      next.status = "archived";
      next.verified = false;
    }
    await redis.set(K.rec(oid, id), JSON.stringify(next));
    await this.appendVersion(oid, next, wasPublished ? "edited_from_published" : "updated", actor.id);
    await audit(oid, actor.id, "identityKnowledge.updated", id, { version: next.version, classification: next.classification, status: next.status });
    await pushActivity(oid, "record.updated", `${next.kind}: ${next.title}`);
    await emitKernel("identity-knowledge.record.updated", { recordId: id, title: next.title, status: next.status });
    return next;
  },

  async setStatus(oid: string, actor: { id: string; role: string | null }, id: string, status: IdentityKnowledgeStatus): Promise<IkKnowledgeRecord> {
    superAdminOnly(actor);
    const rec = await this.getRecord(oid, id);
    if (!rec) throw AppError.notFound("Record not found");
    const next: IkKnowledgeRecord = { ...rec, status, updatedAt: new Date().toISOString(), version: rec.version + 1 };
    if (status === "published") {
      // Publish is the ONLY way to set verified — the Super Admin's approval.
      next.verified = true;
      next.publishedAt = new Date().toISOString();
      next.archivedAt = null;
    }
    if (status === "archived") {
      next.archivedAt = new Date().toISOString();
      next.verified = false;
    }
    await redis.set(K.rec(oid, id), JSON.stringify(next));
    await this.appendVersion(oid, next, `status:${status}`, actor.id);
    await audit(oid, actor.id, `identityKnowledge.${status}`, id, { verified: next.verified, version: next.version });
    await pushActivity(oid, `record.${status}`, `${next.kind}: ${next.title}`);
    await emitKernel(`identity-knowledge.record.${status}`, { recordId: id, title: next.title, verified: next.verified });
    if (status === "published") {
      await syncToMemoryFabric(oid, next);
      await audit(oid, actor.id, "identityKnowledge.synced", id, { target: "memory-fabric" });
    }
    return next;
  },

  async remove(oid: string, actor: { id: string; role: string | null }, id: string): Promise<boolean> {
    superAdminOnly(actor);
    const rec = await this.getRecord(oid, id);
    if (!rec) return false;
    await redis.del(K.rec(oid, id));
    await redis.lrem(K.recidx(oid), 0, id);
    await audit(oid, actor.id, "identityKnowledge.deleted", id, { title: rec.title, kind: rec.kind });
    await pushActivity(oid, "record.deleted", `${rec.kind}: ${rec.title}`);
    await emitKernel("identity-knowledge.record.deleted", { recordId: id, title: rec.title });
    return true;
  },

  /* ── Versions ────────────────────────────────────────────────────── */

  async appendVersion(oid: string, rec: IkKnowledgeRecord, action: string, actor: string): Promise<void> {
    const ver: IkRecordVersion = {
      version: rec.version,
      recordId: rec.id,
      title: rec.title,
      body: rec.body,
      classification: rec.classification,
      status: rec.status,
      action,
      actor,
      at: new Date().toISOString(),
    };
    await redis.set(K.ver(oid, rec.id, rec.version), JSON.stringify(ver));
    await redis.lpush(K.veridx(oid, rec.id), String(rec.version));
    await redis.ltrim(K.veridx(oid, rec.id), 0, MAX_VERSIONS - 1);
  },

  async listVersions(oid: string, id: string): Promise<IkRecordVersion[]> {
    const rec = await this.getRecord(oid, id);
    if (!rec) return [];
    const nums = await redis.lrange(K.veridx(oid, id), 0, -1);
    const out: IkRecordVersion[] = [];
    for (const n of nums) {
      const raw = await redis.get(K.ver(oid, id, Number(n)));
      if (raw) out.push(JSON.parse(raw) as IkRecordVersion);
    }
    // Chronological history: oldest first (the index is newest-first).
    return out.reverse();
  },

  /* ── Grants (permission controls for private records) ────────────── */

  async grant(oid: string, actor: { id: string; role: string | null }, id: string, userId: string): Promise<IkKnowledgeRecord> {
    superAdminOnly(actor);
    const rec = await this.getRecord(oid, id);
    if (!rec) throw AppError.notFound("Record not found");
    await redis.sadd(K.grant(oid, id), userId);
    rec.grants = await redis.smembers(K.grant(oid, id));
    await audit(oid, actor.id, "identityKnowledge.granted", id, { userId });
    return rec;
  },

  async revokeGrant(oid: string, actor: { id: string; role: string | null }, id: string, userId: string): Promise<IkKnowledgeRecord> {
    superAdminOnly(actor);
    const rec = await this.getRecord(oid, id);
    if (!rec) throw AppError.notFound("Record not found");
    await redis.srem(K.grant(oid, id), userId);
    rec.grants = await redis.smembers(K.grant(oid, id));
    await audit(oid, actor.id, "identityKnowledge.grant_revoked", id, { userId });
    return rec;
  },

  /* ── Knowledge graph ─────────────────────────────────────────────── */

  async addRelation(oid: string, actor: { id: string; role: string | null }, id: string, targetId: string, relation: string): Promise<IkKnowledgeRecord> {
    superAdminOnly(actor);
    const rec = await this.getRecord(oid, id);
    if (!rec) throw AppError.notFound("Record not found");
    const target = await this.getRecord(oid, targetId);
    if (!target) throw AppError.notFound("Target record not found");
    if (!rec.relations.some((r) => r.targetId === targetId && r.relation === relation)) {
      rec.relations = [...rec.relations, { targetId, relation }];
      rec.version += 1;
      rec.updatedAt = new Date().toISOString();
      await redis.set(K.rec(oid, id), JSON.stringify(rec));
      await this.appendVersion(oid, rec, "relation:added", actor.id);
      await audit(oid, actor.id, "identityKnowledge.relation_added", id, { targetId, relation });
    }
    return rec;
  },

  async graph(oid: string, viewer: { id: string; role: string | null }): Promise<IkGraph> {
    const records = await this.listRecords(oid, viewer, {});
    return {
      nodes: records.map((r) => ({ id: r.id, kind: r.kind, title: r.title, classification: r.classification, verified: r.verified })),
      edges: records.flatMap((r) =>
        r.relations
          .filter((rel) => records.some((t) => t.id === rel.targetId))
          .map((rel) => ({ from: r.id, to: rel.targetId, relation: rel.relation })),
      ),
      note: "Knowledge graph of the records the caller is authorized to view; edges are Super Admin-defined relations.",
    };
  },

  /* ── Dashboard / activity ────────────────────────────────────────── */

  async dashboard(oid: string, viewer: { id: string; role: string | null }): Promise<IkDashboard> {
    const records = await this.listRecords(oid, viewer, {});
    const byKind: Record<string, number> = {};
    const byClassification: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const r of records) {
      byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
      byClassification[r.classification] = (byClassification[r.classification] ?? 0) + 1;
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    }
    return {
      total: records.length,
      byKind,
      byClassification,
      byStatus,
      verifiedCount: records.filter((r) => r.verified).length,
      publishedCount: records.filter((r) => r.status === "published").length,
      pendingApproval: records.filter((r) => r.status === "pending_approval").length,
      documents: records.filter((r) => r.kind === "document").length,
      memorySynced: records.filter((r) => r.status === "published" && r.verified).length,
      generatedAt: new Date().toISOString(),
    };
  },

  async activity(oid: string): Promise<Array<{ at: string; action: string; label: string }>> {
    const raw = await redis.lrange(K.act(oid), 0, 49);
    return raw
      .map((s) => {
        try { return JSON.parse(s) as { at: string; action: string; label: string }; } catch { return null; }
      })
      .filter((x): x is { at: string; action: string; label: string } => x !== null);
  },

  /* ── Synchronization (Continuous Memory Synchronization) ─────────── */

  async syncAll(oid: string, actor: { id: string; role: string | null }): Promise<{ synced: number; failed: number; skipped: number }> {
    superAdminOnly(actor);
    const records = await this.listRecords(oid, { id: actor.id, role: actor.role }, {});
    let synced = 0, failed = 0, skipped = 0;
    for (const rec of records) {
      if (rec.status !== "published") { skipped += 1; continue; }
      if (await syncToMemoryFabric(oid, rec)) synced += 1;
      else failed += 1;
    }
    await audit(oid, actor.id, "identityKnowledge.sync_all", "all", { synced, failed, skipped });
    await pushActivity(oid, "memory.sync", `${synced} record(s) synced to the Memory Fabric`);
    await emitKernel("identity-knowledge.memory.synced", { synced, failed, skipped });
    return { synced, failed, skipped };
  },

  /* ── AI response engine ───────────────────────────────────────────── */

  /** Answer a question from approved, permission-visible knowledge only. */
  async ask(oid: string, viewer: { id: string; role: string | null }, question: string): Promise<IkAnswer> {
    const records = await this.listRecords(oid, viewer, {});
    // AI usage is gated on Super Admin approval: approved and published
    // records answer; published records are additionally verified (highest
    // confidence). Drafts and archived records never answer.
    const usable = records.filter((r) => r.status === "published" || r.status === "approved");
    const terms = question.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    if (!terms.length) throw AppError.badRequest("Question is too short to match against approved knowledge");

    const scored: Array<{ rec: IkKnowledgeRecord; score: number }> = [];
    for (const rec of usable) {
      const hay = `${rec.title} ${rec.kind.replaceAll("_", " ")} ${rec.tags.join(" ")} ${rec.body}`.toLowerCase();
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score += 1;
      if (score > 0) {
        // Verified knowledge ranks highest during reasoning; then public,
        // then organization.
        if (rec.verified) score += 3;
        if (rec.classification === "public") score += 1;
        scored.push({ rec, score });
      }
    }
    scored.sort((a, b) => b.score - a.score || a.rec.id.localeCompare(b.rec.id));

    if (!scored.length) {
      return {
        question,
        answer: "I do not have sufficient approved knowledge to answer that question. I only answer from Super Admin-approved, verified, and governed knowledge stored in WINDELS AI OS.",
        sections: [{ section: "unknown", label: "Unknown Information", text: "No approved knowledge record matched this question." }],
        sources: [],
        outcome: "insufficient_knowledge",
        aiGenerated: false,
        answeredAt: new Date().toISOString(),
      };
    }

    // Verified = published by the Super Admin (highest confidence).
    // Approved = Super Admin approved, not yet published.
    const verified = scored.filter((s) => s.rec.verified);
    const approved = scored.filter((s) => !s.rec.verified && s.rec.classification === "public");
    const orgInfo = scored.filter((s) => !s.rec.verified && s.rec.classification === "organization");
    const restricted = scored.filter((s) => s.rec.classification === "private");

    const bullet = (s: { rec: IkKnowledgeRecord; score: number }) => `- ${s.rec.title}: ${s.rec.body.replace(/\n+/g, " ").slice(0, 300)}`;
    const sections: IkAnswer["sections"] = [];
    if (verified.length) sections.push({ section: "verified_facts", label: "Verified Facts (Super Admin approved)", text: verified.map(bullet).join("\n") });
    if (approved.length) sections.push({ section: "super_admin_approved", label: "Super Admin Approved Information", text: approved.map(bullet).join("\n") });
    if (orgInfo.length) sections.push({ section: "organization_information", label: "Organization Information (authorized members)", text: orgInfo.map(bullet).join("\n") });
    if (restricted.length) sections.push({ section: "ai_generated_summary", label: "Restricted Information (your access)", text: restricted.map(bullet).join("\n") });

    const usedIn = (recId: string): IkAnswer["sources"][number]["usedIn"] => {
      const used: IkAnswer["sources"][number]["usedIn"] = [];
      if (verified.some((s) => s.rec.id === recId)) used.push("verified_facts");
      if (approved.some((s) => s.rec.id === recId)) used.push("super_admin_approved");
      if (orgInfo.some((s) => s.rec.id === recId)) used.push("organization_information");
      return used;
    };
    const sources = scored.slice(0, 8).map((s) => ({
      recordId: s.rec.id,
      title: s.rec.title,
      kind: s.rec.kind,
      classification: s.rec.classification,
      verified: s.rec.verified,
      usedIn: usedIn(s.rec.id),
    }));

    const summary =
      verified.length
        ? `Based on verified knowledge, ${verified.map((s) => s.rec.title).slice(0, 3).join(", ")}.`
        : `A summary generated from the approved knowledge matched: ${scored.slice(0, 3).map((s) => s.rec.title).join(", ")}.`;

    return {
      question,
      answer: `${sections.map((s) => `${s.label}:\n${s.text}`).join("\n\n")}\n\n${summary}`,
      sections: [...sections, { section: "ai_generated_summary", label: "AI-Generated Summary", text: `${summary} (generated from approved sources; see source list below.)` }],
      sources,
      outcome: "answered",
      aiGenerated: true,
      answeredAt: new Date().toISOString(),
    };
  },

  /* ── Knowledge agents (AI Workforce) ──────────────────────────────── */

  agents() {
    return [...IK_AGENTS];
  },

  async runAgent(oid: string, actor: { id: string; role: string | null }, agentId: IkAgentId): Promise<IkAgentRun> {
    const def = IK_AGENTS.find((a) => a.id === agentId);
    if (!def) throw AppError.notFound("Agent not found");
    if (def.permission === "super_admin") superAdminOnly(actor);

    const viewer = { id: actor.id, role: actor.role };
    const records = await this.listRecords(oid, viewer, {});
    const published = records.filter((r) => r.status === "published");
    let summary = "";
    const items: IkAgentRun["items"] = [];

    switch (agentId) {
      case "biography_agent": {
        const bios = published.filter((r) => r.kind.startsWith("biography"));
        summary = `Compiled ${bios.length} approved biography record(s) into a labelled profile synthesis.`;
        for (const b of bios) items.push({ id: b.id, title: b.title, note: `${b.classification} · ${b.verified ? "verified" : "approved"}` });
        break;
      }
      case "organization_knowledge_agent": {
        const orgs = published.filter((r) => r.kind === "organization_profile" || r.kind === "leadership_profile");
        summary = `Compiled ${orgs.length} approved organization/leadership profile(s).`;
        for (const o of orgs) items.push({ id: o.id, title: o.title, note: o.classification });
        break;
      }
      case "company_profile_agent": {
        const cos = published.filter((r) => ["company_profile", "brand_story", "product", "service"].includes(r.kind));
        summary = `Compiled ${cos.length} approved company/brand/product profile(s).`;
        for (const c of cos) items.push({ id: c.id, title: c.title, note: `${c.kind} · ${c.verified ? "verified" : "approved"}` });
        break;
      }
      case "knowledge_verification_agent": {
        const unverified = records.filter((r) => r.status === "published" && !r.verified);
        const pending = records.filter((r) => r.status === "pending_approval");
        summary = `Found ${pending.length} record(s) awaiting approval and ${unverified.length} published-but-unverified record(s). Verification is a Super Admin action.`;
        for (const r of [...pending, ...unverified].slice(0, 20)) items.push({ id: r.id, title: r.title, note: r.status });
        break;
      }
      case "knowledge_curator_agent": {
        const drafts = records.filter((r) => r.status === "draft");
        const archived = records.filter((r) => r.status === "archived");
        summary = `Found ${drafts.length} draft(s) and ${archived.length} archived record(s) for review.`;
        for (const r of [...drafts, ...archived].slice(0, 20)) items.push({ id: r.id, title: r.title, note: r.status });
        break;
      }
      case "knowledge_synchronization_agent": {
        const res = await this.syncAll(oid, actor);
        summary = `Synchronized ${res.synced} published record(s) into the Enterprise Memory Fabric; ${res.failed} failed, ${res.skipped} skipped (not published).`;
        break;
      }
      case "ai_memory_manager": {
        const synced = published.filter((r) => r.verified);
        summary = `Memory-sync state: ${synced.length} of ${published.length} published record(s) are verified and synchronized with the Memory Fabric.`;
        for (const r of synced.slice(0, 20)) items.push({ id: r.id, title: r.title, note: "synced" });
        break;
      }
      case "public_information_agent": {
        const pub = published.filter((r) => r.classification === "public");
        summary = `Compiled ${pub.length} public record(s) approved for external AI responses.`;
        for (const r of pub.slice(0, 20)) items.push({ id: r.id, title: r.title, note: r.verified ? "verified" : "approved" });
        break;
      }
    }

    await audit(oid, actor.id, "identityKnowledge.agent_run", agentId, { items: items.length });
    await pushActivity(oid, "agent.run", `${def.title}: ${summary}`);
    await emitKernel("identity-knowledge.agent.run", { agentId, items: items.length });
    return { agentId, title: def.title, summary, items, aiGenerated: false, ranAt: new Date().toISOString() };
  },

  /* ── Import / export (bulk) ───────────────────────────────────────── */

  async bulkImport(oid: string, actor: { id: string; role: string | null }, records: IkRecordCreateInput[]): Promise<{ imported: number; ids: string[] }> {
    superAdminOnly(actor);
    const ids: string[] = [];
    for (const input of records) {
      const rec = await this.create(oid, actor, input);
      ids.push(rec.id);
    }
    await audit(oid, actor.id, "identityKnowledge.bulk_import", "batch", { count: records.length });
    return { imported: ids.length, ids };
  },

  async bulkExport(oid: string, actor: { id: string; role: string | null }): Promise<{ records: IkKnowledgeRecord[]; exportedAt: string }> {
    superAdminOnly(actor);
    const records = await this.listRecords(oid, { id: actor.id, role: actor.role }, {});
    await audit(oid, actor.id, "identityKnowledge.bulk_export", "batch", { count: records.length });
    return { records, exportedAt: new Date().toISOString() };
  },

  /* ── Documents (uploads reuse the attachments infrastructure) ────── */

  async addDocument(oid: string, actor: { id: string; role: string | null }, input: {
    title: string;
    classification: IdentityKnowledgeClassification;
    category?: string;
    tags?: string[];
    attachment: { id: string; filename: string; mimeType: string; sizeBytes: number };
  }): Promise<IkKnowledgeRecord> {
    superAdminOnly(actor);
    const kindOf = (mime: string): IkKnowledgeRecord["documents"][number]["kind"] => {
      if (mime === "application/pdf") return "pdf";
      if (mime.includes("word")) return "docx";
      if (mime.startsWith("text/")) return "txt";
      if (mime.startsWith("image/")) return "image";
      if (mime.startsWith("video/")) return "video";
      if (mime.includes("presentation") || mime.includes("powerpoint")) return "presentation";
      return "other";
    };
    const rec: IkKnowledgeRecord = {
      id: newId("ikr"),
      kind: "document",
      title: input.title,
      body: `Document: ${input.attachment.filename} (${input.attachment.sizeBytes} bytes, ${input.attachment.mimeType}).`,
      classification: input.classification,
      verified: false,
      status: "draft",
      category: input.category ?? "documents",
      tags: input.tags ?? [],
      documents: [{ attachmentId: input.attachment.id, filename: input.attachment.filename, mimeType: input.attachment.mimeType, sizeBytes: input.attachment.sizeBytes, kind: kindOf(input.attachment.mimeType) }],
      relations: [],
      grants: [],
      version: 1,
      createdBy: actor.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: null,
      archivedAt: null,
    };
    await redis.set(K.rec(oid, rec.id), JSON.stringify(rec));
    await redis.lpush(K.recidx(oid), rec.id);
    await redis.ltrim(K.recidx(oid), 0, MAX_RECORDS - 1);
    await this.appendVersion(oid, rec, "document:uploaded", actor.id);
    await audit(oid, actor.id, "identityKnowledge.document_uploaded", rec.id, { filename: input.attachment.filename, sizeBytes: input.attachment.sizeBytes });
    await pushActivity(oid, "document.uploaded", input.attachment.filename);
    await emitKernel("identity-knowledge.document.uploaded", { recordId: rec.id, filename: input.attachment.filename });
    return rec;
  },
};
