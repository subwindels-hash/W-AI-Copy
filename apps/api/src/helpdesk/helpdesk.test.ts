/**
 * Session 95 — Enterprise Helpdesk & Customer Support.
 *
 * Exercises the real service against a fake KV (same pattern as the other
 * Redis-backed suites): ticket CRUD with monotonic human numbers, the honest
 * lifecycle (validated transitions, stamped resolvedAt/closedAt), SLA due
 * dates computed deterministically, comment timeline with internal flags,
 * assignment, rollup determinism (measured SLA compliance + resolution
 * time), cross-tenant isolation, demo-seed idempotency, and the shared Zod
 * input contracts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, Map<string, string> | Set<string> | string | number>();
    async keys(pattern: string) {
      const regex = new RegExp("^" + pattern.replace(/[*]/g, ".*") + "$");
      return Array.from(this.store.keys()).filter((k) => regex.test(k));
    }
    async del(key: string) { return this.store.delete(key) ? 1 : 0; }
    async incr(key: string) {
      const cur = (this.store.get(key) as number) ?? 0;
      this.store.set(key, cur + 1);
      return cur + 1;
    }
    async hset(key: string, field: string, value: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(field, value); return 1;
    }
    async hget(key: string, field: string) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return null;
      const v = map.get(field);
      return v !== undefined ? String(v) : null;
    }
    async zadd(key: string, score: number, member: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(member, String(score)); return 1;
    }
    async zrange(key: string, start: number, stop: number) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return [];
      const entries = Array.from(map.entries());
      entries.sort((a, b) => Number(a[1]) - Number(b[1]) || (a[0] < b[0] ? -1 : 1));
      const slice = entries.slice(start, stop === -1 ? undefined : stop + 1);
      return slice.map(([m]) => m);
    }
    async zrem(key: string, member: string) {
      const map = this.store.get(key);
      if (map instanceof Map) return map.delete(member) ? 1 : 0;
      return 0;
    }
  }
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({
  redisCmd: fake,
}));
// The CRM integration resolves lazily; CRM is Redis-backed too, so point it
// at the same fake store and let the real service run.
vi.mock("../crm/crm.service.js", async () => {
  const actual = await vi.importActual<typeof import("../crm/crm.service.js")>("../crm/crm.service.js");
  return { CrmService: actual.CrmService };
});

import { HelpdeskService } from "./helpdesk.service.js";
import {
  HdTicketUpsertSchema,
  HdCommentCreateSchema,
  HdTransitionSchema,
  HdAssignSchema,
} from "@windels/shared/helpdesk";

const ORG_A = "org-a";
const ORG_B = "org-b";

beforeEach(() => {
  fake.store.clear();
});

describe("HD — tickets (org-scoped, monotonic numbers)", () => {
  it("creates tickets with stable monotonic human numbers", async () => {
    const t1 = await HelpdeskService.createTicket(ORG_A, {
      subject: "Login broken", requesterName: "Ada", priority: "high", requesterEmail: "ada@example.com",
    }, "user-s");
    const t2 = await HelpdeskService.createTicket(ORG_A, {
      subject: "Billing question", requesterName: "Chidi",
    }, "user-s");

    expect(t1.id).toMatch(/^hdt-/);
    expect(t1.number).toBe("HD-1001");
    expect(t2.number).toBe("HD-1002");
    expect(t1.priority).toBe("high");
    expect(t1.status).toBe("new");
    expect(t1.slaDueAt).toBeTruthy();
  });

  it("computes SLA due dates deterministically per priority", async () => {
    const urgent = await HelpdeskService.createTicket(ORG_A, { subject: "Urgent", requesterName: "A", priority: "urgent" }, null);
    const low = await HelpdeskService.createTicket(ORG_A, { subject: "Low", requesterName: "A", priority: "low" }, null);

    const urgentDue = new Date(urgent.slaDueAt!).getTime();
    const lowDue = new Date(low.slaDueAt!).getTime();
    // urgent = +2h, low = +72h → low must be much later.
    expect(lowDue - urgentDue).toBeGreaterThan(60 * 3_600_000);
  });

  it("recomputes SLA on priority change", async () => {
    const t = await HelpdeskService.createTicket(ORG_A, { subject: "X", requesterName: "A", priority: "low" }, null);
    const oldDue = t.slaDueAt;
    const updated = await HelpdeskService.updateTicket(ORG_A, t.id, { priority: "urgent" }, null);
    expect(updated?.slaDueAt).not.toBe(oldDue);
    expect(new Date(updated!.slaDueAt!).getTime()).toBeLessThan(new Date(oldDue!).getTime());
  });
});

describe("HD — lifecycle (honest transitions)", () => {
  it("stamps resolvedAt/closedAt only on real transitions; validates lifecycle", async () => {
    const t = await HelpdeskService.createTicket(ORG_A, { subject: "Ticket", requesterName: "A" }, null);
    expect(t.resolvedAt).toBeNull();
    expect(t.closedAt).toBeNull();

    // new → resolved is allowed; resolvedAt stamped.
    const resolved = await HelpdeskService.transitionTicket(ORG_A, t.id, { status: "resolved" }, "user-s");
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.resolvedAt).toBeTruthy();

    // resolved → closed; closedAt stamped, resolvedAt preserved.
    const closed = await HelpdeskService.transitionTicket(ORG_A, t.id, { status: "closed" }, "user-s");
    expect(closed?.status).toBe("closed");
    expect(closed?.closedAt).toBeTruthy();
    expect(closed?.resolvedAt).toBe(resolved?.resolvedAt);

    // closed is terminal.
    await expect(HelpdeskService.transitionTicket(ORG_A, t.id, { status: "open" }, "user-s"))
      .rejects.toThrow("INVALID_TRANSITION");

    // Re-transition to same status is an idempotent no-op.
    const again = await HelpdeskService.transitionTicket(ORG_A, t.id, { status: "closed" }, "user-s");
    expect(again?.closedAt).toBe(closed?.closedAt);
  });
});

describe("HD — comments & assignment", () => {
  it("adds internal and public comments to the timeline", async () => {
    const t = await HelpdeskService.createTicket(ORG_A, { subject: "Ticket", requesterName: "A" }, null);
    await HelpdeskService.createComment(ORG_A, t.id, { authorName: "Support", body: "Public note" }, "user-s");
    await HelpdeskService.createComment(ORG_A, t.id, { authorName: "Support", body: "Internal only", internal: true }, "user-s");

    const detail = await HelpdeskService.getTicketDetail(ORG_A, t.id);
    expect(detail?.comments).toHaveLength(2);
    expect(detail?.comments.some((c) => c.internal)).toBe(true);
  });

  it("assigns and unassigns a ticket", async () => {
    const t = await HelpdeskService.createTicket(ORG_A, { subject: "Ticket", requesterName: "A" }, null);
    const assigned = await HelpdeskService.assignTicket(ORG_A, t.id, { assigneeId: "user-agent" }, null);
    expect(assigned?.assigneeId).toBe("user-agent");
    const unassigned = await HelpdeskService.assignTicket(ORG_A, t.id, { assigneeId: null }, null);
    expect(unassigned?.assigneeId).toBeNull();
  });
});

describe("HD — CRM integration", () => {
  it("writes a real CRM activity when a ticket links a contact/company", async () => {
    const { CrmService } = await import("../crm/crm.service.js");
    const co = await CrmService.createCompany(ORG_A, { name: "Acme", industry: "Software" }, null);
    const contact = await CrmService.createContact(ORG_A, { firstName: "Ada", lastName: "Okafor", companyId: co.id }, null);

    const t = await HelpdeskService.createTicket(ORG_A, {
      subject: "Support issue", requesterName: "Ada Okafor",
      contactId: contact.id, companyId: co.id,
    }, "user-s");

    const acts = await CrmService.listActivities(ORG_A, { companyId: co.id });
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.some((a) => a.subject.includes(t.number))).toBe(true);
  });
});

describe("HD — rollup (deterministic, honest)", () => {
  it("measures SLA compliance and resolution time from real timestamps", async () => {
    const t1 = await HelpdeskService.createTicket(ORG_A, { subject: "Fast", requesterName: "A", priority: "urgent" }, null);
    await HelpdeskService.transitionTicket(ORG_A, t1.id, { status: "resolved" }, null);
    const t2 = await HelpdeskService.createTicket(ORG_A, { subject: "Slow", requesterName: "B", priority: "low" }, null);
    await HelpdeskService.createTicket(ORG_A, { subject: "Open one", requesterName: "C", priority: "high", assigneeId: "u1" }, null);

    // The urgent ticket was resolved within its 2h SLA (immediately);
    // the slow one is still open so it is not measured.
    const r1 = await HelpdeskService.rollup(ORG_A);
    const r2 = await HelpdeskService.rollup(ORG_A);
    expect(r2).toEqual(r1); // deterministic

    expect(r1.counts.tickets).toBe(3);
    expect(r1.counts.open).toBe(2); // t2 + t3 still open
    expect(r1.counts.resolved).toBe(1); // t1 resolved
    expect(r1.counts.closed).toBe(0);
    expect(r1.counts.unassigned).toBe(1); // t2 open with no assignee
    expect(r1.slaCompliancePct).toBe(1); // 1/1 within SLA
    expect(r1.avgResolutionHours).not.toBeNull();
    expect(r1.byPriority.find((p) => p.priority === "urgent")?.count).toBe(1);
    // Open tickets by assignee: t2 unassigned (null) + t3 assigned to u1.
    expect(r1.byAssignee).toContainEqual({ assigneeId: "u1", count: 1 });
    expect(r1.byAssignee).toContainEqual({ assigneeId: null, count: 1 });
    expect(r1.recentTickets).toHaveLength(3);
    expect(r1.lastUpdatedAt).toBeTruthy();
  });

  it("returns an honest empty rollup for a fresh org", async () => {
    const r = await HelpdeskService.rollup(ORG_B);
    expect(r.counts.tickets).toBe(0);
    expect(r.counts.open).toBe(0);
    expect(r.counts.overdue).toBe(0);
    expect(r.slaCompliancePct).toBeNull();
    expect(r.avgResolutionHours).toBeNull();
    expect(r.byPriority.every((p) => p.count === 0)).toBe(true);
    expect(r.lastUpdatedAt).toBeNull();
  });
});

describe("HD — cross-tenant isolation (fail-closed)", () => {
  it("org B cannot read or write org A tickets or comments", async () => {
    const t = await HelpdeskService.createTicket(ORG_A, { subject: "Secret", requesterName: "A" }, null);
    await HelpdeskService.createComment(ORG_A, t.id, { authorName: "S", body: "note" }, null);

    expect(await HelpdeskService.listTickets(ORG_B)).toHaveLength(0);
    expect(await HelpdeskService.getTicket(ORG_B, t.id)).toBeNull();
    expect(await HelpdeskService.getTicketDetail(ORG_B, t.id)).toBeNull();
    expect(await HelpdeskService.createComment(ORG_B, t.id, { authorName: "X", body: "nope" }, null)).toBeNull();
    expect(await HelpdeskService.transitionTicket(ORG_B, t.id, { status: "resolved" }, null)).toBeNull();
    expect(await HelpdeskService.assignTicket(ORG_B, t.id, { assigneeId: "u" }, null)).toBeNull();
    expect(await HelpdeskService.deleteTicket(ORG_B, t.id)).toBe(false);
    expect((await HelpdeskService.rollup(ORG_B)).counts.tickets).toBe(0);

    // Org A data intact.
    expect((await HelpdeskService.getTicket(ORG_A, t.id))?.subject).toBe("Secret");
  });
});

describe("HD — demo seed is idempotent", () => {
  it("seeds the demo org once and skips on the second call", async () => {
    expect(await HelpdeskService.ensureDemoSeed()).toBe(true);
    const r = await HelpdeskService.rollup("org-demo-hd");
    expect(r.counts.tickets).toBe(5);
    expect(r.counts.resolved).toBeGreaterThan(0);
    expect(r.slaCompliancePct).not.toBeNull();

    expect(await HelpdeskService.ensureDemoSeed()).toBe(false);
    expect((await HelpdeskService.rollup("org-demo-hd")).counts.tickets).toBe(5);
  });
});

describe("HD — shared input contracts", () => {
  it("validates ticket input", () => {
    expect(HdTicketUpsertSchema.safeParse({ subject: "", requesterName: "A" }).success).toBe(false);
    expect(HdTicketUpsertSchema.safeParse({ subject: "X", requesterName: "A", priority: "nonsense" }).success).toBe(false);
    expect(HdTicketUpsertSchema.safeParse({ subject: "X", requesterName: "A", requesterEmail: "bad" }).success).toBe(false);
    expect(HdTicketUpsertSchema.safeParse({ subject: "X", requesterName: "A" }).success).toBe(true);
  });

  it("validates comment, transition and assignment input", () => {
    expect(HdCommentCreateSchema.safeParse({ authorName: "A", body: "" }).success).toBe(false);
    expect(HdCommentCreateSchema.safeParse({ authorName: "A", body: "hi" }).success).toBe(true);
    expect(HdTransitionSchema.safeParse({ status: "bogus" }).success).toBe(false);
    expect(HdTransitionSchema.safeParse({ status: "open" }).success).toBe(true);
    expect(HdAssignSchema.safeParse({ assigneeId: null }).success).toBe(true);
    expect(HdAssignSchema.safeParse({}).success).toBe(false);
  });
});
