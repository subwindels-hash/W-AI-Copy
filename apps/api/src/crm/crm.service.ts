/**
 * Session 90 — Enterprise CRM (Customer Relationship Management).
 *
 * Real, org-scoped CRUD for contacts, companies, deals and activities plus a
 * deterministic dashboard rollup. Every record is stored under an org-scoped
 * Redis key (`crm:<entity>:i:<org>:<id>`) and every read re-checks the org
 * segment — the Session 89 tenant-isolation guarantee applied to CRM data.
 *
 * Honesty rules:
 *   - No Math.random anywhere; ids come from CSPRNG (randomUUID).
 *   - The rollup (forecast, conversion, per-stage breakdown) is computed from
 *     stored records on every read — nothing is fabricated or cached-as-fact.
 *   - Stage transitions are recorded as activities (real audit trail).
 *
 * Keys: crm:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import type {
  CrmContact,
  CrmCompany,
  CrmDeal,
  CrmActivity,
  CrmContactCreateInput,
  CrmCompanyCreateInput,
  CrmDealCreateInput,
  CrmContactUpsertInput,
  CrmCompanyUpsertInput,
  CrmDealUpsertInput,
  CrmActivityCreateInput,
  CrmDealStageKey,
  CrmDashboardRollup,
  CrmPipelineStage,
} from "@windels/shared/crm";
import {
  CRM_DEFAULT_STAGES,
  CRM_DEFAULT_STAGE_PROBABILITY,
} from "@windels/shared/crm";

type Entity = "contact" | "company" | "deal" | "activity";

const K = {
  item: (e: Entity, org: string, id: string) => `crm:${e}:i:${org}:${id}`,
  idx: (e: Entity, org: string) => `crm:${e}:idx:${org}`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

/** Read a record ONLY when it belongs to `org` — fail-closed cross-tenant. */
async function readOwned<T extends { organizationId: string }>(
  entity: Entity,
  org: string,
  id: string
): Promise<T | null> {
  const raw = await redis.hget(K.item(entity, org, id), "_doc");
  if (!raw) return null;
  const rec = j<T>(raw);
  // Defense in depth: the value carries the tenant too.
  return rec && rec.organizationId === org ? rec : null;
}

async function writeItem(entity: Entity, org: string, rec: unknown): Promise<void> {
  await redis.hset(K.item(entity, org, (rec as { id: string }).id), "_doc", s2(rec));
  await redis.zadd(K.idx(entity, org), Date.now(), (rec as { id: string }).id);
}

async function deleteItem(entity: Entity, org: string, id: string): Promise<boolean> {
  const existed = await readOwned<{ organizationId: string }>(entity, org, id);
  if (!existed) return false;
  await redis.del(K.item(entity, org, id));
  await redis.zrem(K.idx(entity, org), id);
  return true;
}

async function listIds(entity: Entity, org: string): Promise<string[]> {
  return redis.zrange(K.idx(entity, org), 0, -1);
}

function byNewest<T extends { createdAt: string; id: string }>(a: T, b: T): number {
  if (a.createdAt === b.createdAt) return a.id < b.id ? 1 : -1;
  return a.createdAt < b.createdAt ? 1 : -1;
}

async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ kind, source: "crm", payload });
  } catch {
    /* best effort — never fail a CRM write because the kernel is down */
  }
}

const uid = (p: string) => p + randomUUID().slice(0, 8);

export const CrmService = {
  // ── Pipeline definition ────────────────────────────────────────────
  stages(): CrmPipelineStage[] {
    return CRM_DEFAULT_STAGES.map((s) => ({ ...s }));
  },

  // ── Contacts ───────────────────────────────────────────────────────
  async listContacts(org: string, filter?: { q?: string; companyId?: string; status?: string }): Promise<CrmContact[]> {
    const ids = await listIds("contact", org);
    const out: CrmContact[] = [];
    for (const id of ids) {
      const c = await readOwned<CrmContact>("contact", org, id);
      if (!c) continue;
      if (filter?.companyId && c.companyId !== filter.companyId) continue;
      if (filter?.status && c.status !== filter.status) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        const hay = `${c.firstName} ${c.lastName} ${c.email ?? ""} ${c.title ?? ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      out.push(c);
    }
    return out.sort(byNewest);
  },

  async getContact(org: string, id: string): Promise<CrmContact | null> {
    return readOwned<CrmContact>("contact", org, id);
  },

  async createContact(org: string, input: CrmContactCreateInput, userId: string | null = null): Promise<CrmContact> {
    const now = new Date().toISOString();
    const rec: CrmContact = {
      id: uid("crmc-"),
      organizationId: org,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      companyId: input.companyId ?? null,
      title: input.title ?? null,
      source: input.source ?? "other",
      status: input.status ?? "lead",
      tags: input.tags ?? [],
      ownerId: input.ownerId ?? userId,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("contact", org, rec);
    void emitKernel("crm.contact.created", { id: rec.id, organizationId: org });
    return rec;
  },

  async updateContact(org: string, id: string, patch: Partial<CrmContactUpsertInput>, userId: string | null = null): Promise<CrmContact | null> {
    const cur = await readOwned<CrmContact>("contact", org, id);
    if (!cur) return null;
    const next: CrmContact = {
      ...cur,
      ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
      ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
      ...(patch.email !== undefined ? { email: patch.email ?? null } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone ?? null } : {}),
      ...(patch.companyId !== undefined ? { companyId: patch.companyId ?? null } : {}),
      ...(patch.title !== undefined ? { title: patch.title ?? null } : {}),
      ...(patch.source !== undefined ? { source: patch.source } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      ...(patch.ownerId !== undefined ? { ownerId: patch.ownerId ?? null } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes ?? null } : {}),
      updatedAt: new Date().toISOString(),
    };
    await writeItem("contact", org, next);
    void emitKernel("crm.contact.updated", { id: next.id, organizationId: org });
    return next;
  },

  async deleteContact(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("contact", org, id);
    if (ok) void emitKernel("crm.contact.deleted", { id, organizationId: org });
    return ok;
  },

  // ── Companies ──────────────────────────────────────────────────────
  async listCompanies(org: string, filter?: { q?: string; industry?: string }): Promise<CrmCompany[]> {
    const ids = await listIds("company", org);
    const out: CrmCompany[] = [];
    for (const id of ids) {
      const c = await readOwned<CrmCompany>("company", org, id);
      if (!c) continue;
      if (filter?.industry && c.industry !== filter.industry) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        const hay = `${c.name} ${c.domain ?? ""} ${c.industry ?? ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      out.push(c);
    }
    return out.sort(byNewest);
  },

  async getCompany(org: string, id: string): Promise<CrmCompany | null> {
    return readOwned<CrmCompany>("company", org, id);
  },

  async createCompany(org: string, input: CrmCompanyCreateInput, _userId: string | null = null): Promise<CrmCompany> {
    const now = new Date().toISOString();
    const rec: CrmCompany = {
      id: uid("crmco-"),
      organizationId: org,
      name: input.name,
      domain: input.domain ?? null,
      industry: input.industry ?? null,
      sizeBand: input.sizeBand ?? "unknown",
      website: input.website ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("company", org, rec);
    void emitKernel("crm.company.created", { id: rec.id, organizationId: org });
    return rec;
  },

  async updateCompany(org: string, id: string, patch: Partial<CrmCompanyUpsertInput>, _userId: string | null = null): Promise<CrmCompany | null> {
    const cur = await readOwned<CrmCompany>("company", org, id);
    if (!cur) return null;
    const next: CrmCompany = {
      ...cur,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.domain !== undefined ? { domain: patch.domain ?? null } : {}),
      ...(patch.industry !== undefined ? { industry: patch.industry ?? null } : {}),
      ...(patch.sizeBand !== undefined ? { sizeBand: patch.sizeBand } : {}),
      ...(patch.website !== undefined ? { website: patch.website ?? null } : {}),
      ...(patch.city !== undefined ? { city: patch.city ?? null } : {}),
      ...(patch.country !== undefined ? { country: patch.country ?? null } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      updatedAt: new Date().toISOString(),
    };
    await writeItem("company", org, next);
    void emitKernel("crm.company.updated", { id: next.id, organizationId: org });
    return next;
  },

  async deleteCompany(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("company", org, id);
    if (ok) void emitKernel("crm.company.deleted", { id, organizationId: org });
    return ok;
  },

  // ── Deals & pipeline ───────────────────────────────────────────────
  async listDeals(org: string, filter?: { stage?: CrmDealStageKey; companyId?: string; open?: boolean }): Promise<CrmDeal[]> {
    const ids = await listIds("deal", org);
    const out: CrmDeal[] = [];
    for (const id of ids) {
      const d = await readOwned<CrmDeal>("deal", org, id);
      if (!d) continue;
      if (filter?.stage && d.stage !== filter.stage) continue;
      if (filter?.companyId && d.companyId !== filter.companyId) continue;
      if (filter?.open && (d.stage === "closed_won" || d.stage === "closed_lost")) continue;
      out.push(d);
    }
    return out.sort(byNewest);
  },

  async getDeal(org: string, id: string): Promise<CrmDeal | null> {
    return readOwned<CrmDeal>("deal", org, id);
  },

  async createDeal(org: string, input: CrmDealCreateInput, userId: string | null = null): Promise<CrmDeal> {
    const now = new Date().toISOString();
    const stage = input.stage ?? "lead";
    const rec: CrmDeal = {
      id: uid("crmd-"),
      organizationId: org,
      name: input.name,
      companyId: input.companyId,
      contactId: input.contactId ?? null,
      amountCents: input.amountCents,
      currency: input.currency ?? "USD",
      stage,
      probabilityPct: input.probabilityPct ?? CRM_DEFAULT_STAGE_PROBABILITY[stage],
      expectedCloseAt: input.expectedCloseAt ?? null,
      tags: input.tags ?? [],
      ownerId: input.ownerId ?? userId,
      stageChangedAt: now,
      wonAt: stage === "closed_won" ? now : null,
      lostAt: stage === "closed_lost" ? now : null,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("deal", org, rec);
    void emitKernel("crm.deal.created", { id: rec.id, organizationId: org, stage: rec.stage });
    return rec;
  },

  /**
   * Update a deal. When `stage` is present and differs from the stored value,
   * the transition is recorded as an activity (audit trail) and won/lost
   * timestamps are stamped — only on a real change, never on a no-op write.
   */
  async updateDeal(org: string, id: string, patch: Partial<CrmDealUpsertInput>, userId: string | null = null): Promise<CrmDeal | null> {
    const cur = await readOwned<CrmDeal>("deal", org, id);
    if (!cur) return null;
    const now = new Date().toISOString();
    const stageChanged = patch.stage !== undefined && patch.stage !== cur.stage;
    const nextStage = patch.stage ?? cur.stage;
    const next: CrmDeal = {
      ...cur,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.companyId !== undefined ? { companyId: patch.companyId } : {}),
      ...(patch.contactId !== undefined ? { contactId: patch.contactId ?? null } : {}),
      ...(patch.amountCents !== undefined ? { amountCents: patch.amountCents } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.stage !== undefined ? { stage: patch.stage } : {}),
      // Stage default probability applies unless the caller overrides it.
      probabilityPct:
        patch.probabilityPct ??
        (stageChanged ? CRM_DEFAULT_STAGE_PROBABILITY[nextStage] : cur.probabilityPct),
      ...(patch.expectedCloseAt !== undefined ? { expectedCloseAt: patch.expectedCloseAt ?? null } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      ...(patch.ownerId !== undefined ? { ownerId: patch.ownerId ?? null } : {}),
      stageChangedAt: stageChanged ? now : cur.stageChangedAt,
      wonAt: stageChanged && patch.stage === "closed_won" ? now : patch.stage !== undefined && patch.stage !== "closed_won" ? null : cur.wonAt,
      lostAt: stageChanged && patch.stage === "closed_lost" ? now : patch.stage !== undefined && patch.stage !== "closed_lost" ? null : cur.lostAt,
      updatedAt: now,
    };
    await writeItem("deal", org, next);
    if (stageChanged) {
      const label = CRM_DEFAULT_STAGES.find((s) => s.key === next.stage)?.label ?? next.stage;
      await this.createActivity(
        org,
        { kind: "note", subject: `Deal moved to ${label}`, dealId: next.id, companyId: next.companyId },
        userId
      );
    }
    void emitKernel("crm.deal.updated", { id: next.id, organizationId: org, stage: next.stage, stageChanged });
    return next;
  },

  async deleteDeal(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("deal", org, id);
    if (ok) void emitKernel("crm.deal.deleted", { id, organizationId: org });
    return ok;
  },

  // ── Activities ─────────────────────────────────────────────────────
  async listActivities(org: string, filter?: { contactId?: string; dealId?: string; companyId?: string; kind?: string }): Promise<CrmActivity[]> {
    const ids = await listIds("activity", org);
    const out: CrmActivity[] = [];
    for (const id of ids) {
      const a = await readOwned<CrmActivity>("activity", org, id);
      if (!a) continue;
      if (filter?.contactId && a.contactId !== filter.contactId) continue;
      if (filter?.dealId && a.dealId !== filter.dealId) continue;
      if (filter?.companyId && a.companyId !== filter.companyId) continue;
      if (filter?.kind && a.kind !== filter.kind) continue;
      out.push(a);
    }
    return out.sort(byNewest);
  },

  async getActivity(org: string, id: string): Promise<CrmActivity | null> {
    return readOwned<CrmActivity>("activity", org, id);
  },

  async createActivity(org: string, input: CrmActivityCreateInput, userId: string | null = null): Promise<CrmActivity> {
    const rec: CrmActivity = {
      id: uid("crma-"),
      organizationId: org,
      kind: input.kind,
      subject: input.subject,
      body: input.body ?? null,
      contactId: input.contactId ?? null,
      dealId: input.dealId ?? null,
      companyId: input.companyId ?? null,
      dueAt: input.dueAt ?? null,
      completedAt: input.completedAt ?? null,
      createdAt: new Date().toISOString(),
      createdBy: userId,
    };
    await writeItem("activity", org, rec);
    void emitKernel("crm.activity.created", { id: rec.id, organizationId: org, kind: rec.kind });
    return rec;
  },

  async deleteActivity(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("activity", org, id);
    if (ok) void emitKernel("crm.activity.deleted", { id, organizationId: org });
    return ok;
  },

  // ── Dashboard rollup (computed per read — never invented) ──────────
  async rollup(org: string): Promise<CrmDashboardRollup> {
    const [contacts, companies, deals, activities] = await Promise.all([
      this.listContacts(org),
      this.listCompanies(org),
      this.listDeals(org),
      this.listActivities(org),
    ]);

    const open = deals.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost");
    const won = deals.filter((d) => d.stage === "closed_won");
    const lost = deals.filter((d) => d.stage === "closed_lost");

    const pipeline = CRM_DEFAULT_STAGES.map((s) => {
      const inStage = deals.filter((d) => d.stage === s.key);
      return {
        stageKey: s.key,
        label: s.label,
        order: s.order,
        count: inStage.length,
        sumCents: inStage.reduce((sum, d) => sum + d.amountCents, 0),
      };
    });

    const forecastCents = open.reduce((sum, d) => sum + Math.round(d.amountCents * (d.probabilityPct / 100)), 0);
    const openPipelineCents = open.reduce((sum, d) => sum + d.amountCents, 0);
    const closedWonCents = won.reduce((sum, d) => sum + d.amountCents, 0);
    const closedTotal = won.length + lost.length;
    const conversionRate = closedTotal > 0 ? won.length / closedTotal : null;

    const topDeals = [...open].sort((a, b) => b.amountCents - a.amountCents || (a.id < b.id ? -1 : 1)).slice(0, 5);

    const stamp = [contacts[0], companies[0], deals[0], activities[0]]
      .filter((r): r is { createdAt: string } => Boolean(r))
      .map((r) => r.createdAt)
      .sort()
      .reverse()[0] ?? null;

    return {
      counts: {
        contacts: contacts.length,
        companies: companies.length,
        openDeals: open.length,
        closedWonDeals: won.length,
        closedLostDeals: lost.length,
        activities: activities.length,
      },
      pipeline,
      forecastCents,
      openPipelineCents,
      closedWonCents,
      conversionRate,
      topDeals,
      recentActivities: activities.slice(0, 10),
      lastUpdatedAt: stamp,
    };
  },

  // ── Idempotent demo seed (opt-in only) ─────────────────────────────
  async ensureDemoSeed(logger?: { info?: (...a: any[]) => void }): Promise<boolean> {
    const demoOrg = "org-demo-crm";
    const existing = await this.listContacts(demoOrg);
    if (existing.length > 0) return false;

    const acme = await this.createCompany(demoOrg, {
      name: "Acme Industries",
      domain: "acme.example.com",
      industry: "Manufacturing",
      sizeBand: "mid",
      website: "https://acme.example.com",
      city: "Enugu",
      country: "NG",
      tags: ["manufacturing", "strategic"],
    }, null);
    const northwind = await this.createCompany(demoOrg, {
      name: "Northwind Logistics",
      domain: "northwind.example.com",
      industry: "Logistics",
      sizeBand: "large",
      website: "https://northwind.example.com",
      city: "Lagos",
      country: "NG",
      tags: ["logistics"],
    }, null);
    const vertex = await this.createCompany(demoOrg, {
      name: "Vertex Analytics",
      domain: "vertex.example.com",
      industry: "Software",
      sizeBand: "small",
      website: "https://vertex.example.com",
      city: "Abuja",
      country: "NG",
      tags: ["software", "prospect"],
    }, null);

    const ada = await this.createContact(demoOrg, {
      firstName: "Ada", lastName: "Okafor", email: "ada.okafor@acme.example.com",
      phone: "+234-800-000-0001", companyId: acme.id, title: "COO", source: "referral",
      status: "customer", tags: ["executive"],
    }, null);
    await this.createContact(demoOrg, {
      firstName: "Chidi", lastName: "Eze", email: "chidi.eze@northwind.example.com",
      companyId: northwind.id, title: "Head of Procurement", source: "event",
      status: "prospect", tags: [],
    }, null);
    await this.createContact(demoOrg, {
      firstName: "Zainab", lastName: "Bello", email: "zainab.bello@vertex.example.com",
      companyId: vertex.id, title: "CTO", source: "inbound", status: "lead", tags: [],
    }, null);
    await this.createContact(demoOrg, {
      firstName: "Emeka", lastName: "Nwosu", email: "emeka.nwosu@acme.example.com",
      companyId: acme.id, title: "IT Director", source: "outbound", status: "customer", tags: [],
    }, null);
    await this.createContact(demoOrg, {
      firstName: "Amina", lastName: "Yusuf", email: "amina.yusuf@northwind.example.com",
      companyId: northwind.id, title: "VP Operations", source: "partner", status: "customer", tags: ["partner"],
    }, null);

    const dealAcme = await this.createDeal(demoOrg, {
      name: "Acme — fleet telemetry rollout", companyId: acme.id, contactId: ada.id,
      amountCents: 4_500_000, currency: "USD", stage: "negotiation",
      expectedCloseAt: "2026-09-30", tags: ["expansion"],
    }, null);
    await this.createDeal(demoOrg, {
      name: "Northwind — warehouse digitization", companyId: northwind.id,
      amountCents: 2_750_000, currency: "USD", stage: "proposal",
      expectedCloseAt: "2026-10-15", tags: ["digital-ops"],
    }, null);
    await this.createDeal(demoOrg, {
      name: "Vertex — analytics pilot", companyId: vertex.id, amountCents: 750_000,
      currency: "USD", stage: "lead", expectedCloseAt: "2026-11-01", tags: ["pilot"],
    }, null);
    await this.createDeal(demoOrg, {
      name: "Acme — annual support renewal", companyId: acme.id, contactId: ada.id,
      amountCents: 1_200_000, currency: "USD", stage: "closed_won", tags: ["renewal"],
    }, null);
    await this.createDeal(demoOrg, {
      name: "Northwind — pilot (not renewed)", companyId: northwind.id,
      amountCents: 300_000, currency: "USD", stage: "closed_lost", tags: [],
    }, null);

    await this.createActivity(demoOrg, {
      kind: "call", subject: "Discovery call with Ada", dealId: dealAcme.id,
      companyId: acme.id, contactId: ada.id, body: "Confirmed budget and timeline.",
    }, null);
    await this.createActivity(demoOrg, {
      kind: "email", subject: "Proposal sent — Northwind", companyId: northwind.id,
      body: "Sent the warehouse digitization proposal with pricing options.",
    }, null);
    await this.createActivity(demoOrg, {
      kind: "task", subject: "Schedule follow-up with Vertex CTO", companyId: vertex.id,
      dueAt: "2026-08-12",
    }, null);
    await this.createActivity(demoOrg, {
      kind: "meeting", subject: "Renewal review — Acme", companyId: acme.id, contactId: ada.id,
      completedAt: "2026-08-01",
    }, null);

    logger?.info?.("[crm] demo seed complete (org-demo-crm): 3 companies, 5 contacts, 5 deals, 4 activities");
    return true;
  },
};
