/**
 * Session management (Phase 2 §8) and document extraction (§4).
 *
 * Sessions carry the confirmation state for high-risk actions, so their
 * lifecycle is a security property, not a convenience: a pending action must
 * expire, must be single-use, and a new session must never erase history.
 *
 * The extraction tests run real parsers over real bytes — no fixture strings
 * standing in for a parsed document.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createWaPrisma } from "./testUtils/waPrisma.js";

const wa = createWaPrisma();
const db = wa.db;

vi.mock("../../db/client.js", () => ({ prisma: wa.prisma }));

const {
  ensureSession, setPendingAction, consumePendingAction, clearPendingAction,
  expireStaleSessions, SESSION_TIMEOUT_MS, PENDING_ACTION_TTL_MS,
} = await import("./whatsappSession.service.js");
const { classifyMime, extractDocumentText, sha256, MAX_MEDIA_BYTES } =
  await import("./whatsappMediaExtract.js");

const ORG = "org-alpha";
const CONV = "conv-1";

beforeEach(() => { wa.reset(); });

describe("session lifecycle", () => {
  it("opens a session on the first message and reuses it on the next", async () => {
    const first = await ensureSession({ organizationId: ORG, conversationId: CONV, linkedUserId: null });
    expect(first.isNew).toBe(true);
    expect(first.turnCount).toBe(1);

    const second = await ensureSession({ organizationId: ORG, conversationId: CONV, linkedUserId: null });
    expect(second.isNew).toBe(false);
    expect(second.id).toBe(first.id);
    expect(second.turnCount).toBe(2);

    expect(db.rows("WhatsAppSession")).toHaveLength(1);
  });

  it("keeps sessions of different conversations independent", async () => {
    const a = await ensureSession({ organizationId: ORG, conversationId: "conv-a", linkedUserId: null });
    const b = await ensureSession({ organizationId: ORG, conversationId: "conv-b", linkedUserId: null });
    expect(a.id).not.toBe(b.id);
    expect(db.rows("WhatsAppSession")).toHaveLength(2);
  });

  it("adopts an identity established mid-session but never downgrades it", async () => {
    await ensureSession({ organizationId: ORG, conversationId: CONV, linkedUserId: null });
    const linked = await ensureSession({ organizationId: ORG, conversationId: CONV, linkedUserId: "user-9" });
    expect(linked.linkedUserId).toBe("user-9");

    // A later turn without identity must not blank it out.
    const after = await ensureSession({ organizationId: ORG, conversationId: CONV, linkedUserId: null });
    expect(after.linkedUserId).toBe("user-9");
  });

  it("retires an idle session and opens a fresh one without touching history", async () => {
    const first = await ensureSession({ organizationId: ORG, conversationId: CONV, linkedUserId: null });

    // Age the session past the idle window.
    const stale = new Date(Date.now() - SESSION_TIMEOUT_MS - 60_000);
    db.rows("WhatsAppSession")[0].lastActivityAt = stale;

    const second = await ensureSession({ organizationId: ORG, conversationId: CONV, linkedUserId: null });
    expect(second.isNew).toBe(true);
    expect(second.id).not.toBe(first.id);

    const rows = db.rows("WhatsAppSession");
    expect(rows).toHaveLength(2);
    // The old session is retired, not deleted: §8 requires history survives.
    expect(rows.find((r: any) => r.id === first.id).status).toBe("EXPIRED");
  });
});

describe("pending actions (step-up confirmation, §9)", () => {
  const action = {
    kind: "create_task" as const,
    argument: "transfer the vendor balance",
    raw: "create task transfer the vendor balance",
    describe: "create the task",
    requestedAt: new Date().toISOString(),
  };

  it("stores a pending action and reads it back on the next turn", async () => {
    const s = await ensureSession({ organizationId: ORG, conversationId: CONV, linkedUserId: null });
    await setPendingAction(s.id, action as any);

    const next = await ensureSession({ organizationId: ORG, conversationId: CONV, linkedUserId: null });
    expect(next.pendingAction?.kind).toBe("create_task");
  });

  it("consumes a pending action exactly once", async () => {
    const s = await ensureSession({ organizationId: ORG, conversationId: CONV, linkedUserId: null });
    await setPendingAction(s.id, action as any);

    expect((await consumePendingAction(s.id))?.kind).toBe("create_task");
    // A replayed "confirm" must not execute the action a second time.
    expect(await consumePendingAction(s.id)).toBeNull();
  });

  it("refuses to return a pending action after its TTL", async () => {
    const s = await ensureSession({ organizationId: ORG, conversationId: CONV, linkedUserId: null });
    await setPendingAction(s.id, action as any);

    // Push the expiry into the past.
    db.rows("WhatsAppSession")[0].pendingExpiresAt = new Date(Date.now() - 1000);

    expect(await consumePendingAction(s.id)).toBeNull();
    const next = await ensureSession({ organizationId: ORG, conversationId: CONV, linkedUserId: null });
    expect(next.pendingAction).toBeNull();
  });

  it("sets an expiry within the configured TTL when storing", async () => {
    const s = await ensureSession({ organizationId: ORG, conversationId: CONV, linkedUserId: null });
    await setPendingAction(s.id, action as any);
    const row = db.rows("WhatsAppSession")[0];
    const ttl = new Date(row.pendingExpiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(PENDING_ACTION_TTL_MS + 1000);
  });

  it("clears a pending action on cancel", async () => {
    const s = await ensureSession({ organizationId: ORG, conversationId: CONV, linkedUserId: null });
    await setPendingAction(s.id, action as any);
    await clearPendingAction(s.id);
    expect(await consumePendingAction(s.id)).toBeNull();
  });
});

describe("expireStaleSessions sweep", () => {
  it("expires only sessions past their expiry", async () => {
    await ensureSession({ organizationId: ORG, conversationId: "conv-live", linkedUserId: null });
    await ensureSession({ organizationId: ORG, conversationId: "conv-dead", linkedUserId: null });

    const dead = db.rows("WhatsAppSession").find((r: any) => r.conversationId === "conv-dead");
    dead.expiresAt = new Date(Date.now() - 60_000);

    const count = await expireStaleSessions();
    expect(count).toBe(1);

    const rows = db.rows("WhatsAppSession");
    expect(rows.find((r: any) => r.conversationId === "conv-dead").status).toBe("EXPIRED");
    expect(rows.find((r: any) => r.conversationId === "conv-live").status).toBe("ACTIVE");
  });

  it("is a no-op when nothing is stale", async () => {
    await ensureSession({ organizationId: ORG, conversationId: CONV, linkedUserId: null });
    expect(await expireStaleSessions()).toBe(0);
  });
});

describe("mime classification", () => {
  it("classifies the document types §4 requires", () => {
    expect(classifyMime("application/pdf")).toBe("pdf");
    expect(classifyMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("docx");
    expect(classifyMime("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("xlsx");
    expect(classifyMime("text/csv")).toBe("csv");
    expect(classifyMime("text/plain")).toBe("text");
    expect(classifyMime("image/jpeg")).toBe("image");
    expect(classifyMime("audio/ogg; codecs=opus")).toBe("audio");
  });

  it("falls back to the filename extension when the mime is useless", () => {
    // WhatsApp forwards application/octet-stream more often than it should.
    expect(classifyMime("application/octet-stream", "invoice.pdf")).toBe("pdf");
    expect(classifyMime("application/octet-stream", "budget.xlsx")).toBe("xlsx");
    expect(classifyMime(null, "notes.txt")).toBe("text");
  });

  it("reports genuinely unknown types as unknown rather than guessing", () => {
    expect(classifyMime("application/octet-stream", "thing.bin")).toBe("unknown");
    expect(classifyMime(null, null)).toBe("unknown");
  });
});

describe("document extraction over real bytes", () => {
  it("extracts plain text and reports the backend that produced it", async () => {
    const buf = Buffer.from("Invoice 4471\nTotal: 250000 NGN\n", "utf8");
    const out = await extractDocumentText(buf, "text", "invoice.txt");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.text).toContain("Invoice 4471");
      expect(out.via).toBeTruthy();
    }
  });

  it("extracts a real CSV into readable rows", async () => {
    const csv = "product,units,revenue\nphone,12,480000\nlaptop,3,900000\n";
    const out = await extractDocumentText(Buffer.from(csv, "utf8"), "csv", "sales.csv");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.text).toContain("laptop");
      expect(out.text).toContain("900000");
    }
  });

  it("extracts a genuine XLSX workbook produced by exceljs", async () => {
    const ExcelJS = (await import("exceljs")).default as any;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Q3");
    ws.addRow(["region", "revenue"]);
    ws.addRow(["Lagos", 4820000]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const out = await extractDocumentText(buf, "xlsx", "q3.xlsx");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.text).toContain("Lagos");
      expect(out.text).toContain("4820000");
    }
  });

  it("fails honestly on a corrupt document instead of inventing content", async () => {
    const garbage = Buffer.from("this is definitely not a pdf", "utf8");
    const out = await extractDocumentText(garbage, "pdf", "broken.pdf");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      // `strictNullChecks` is off in this package, so a negated discriminant
      // does not narrow the union — name the failure arm explicitly.
      const fail = out as { ok: false; code: string; message: string };
      expect(fail.code).toBeTruthy();
      expect(fail.message).toBeTruthy();
      // The failure text is shown to the user, so it must not leak a stack.
      expect(fail.message).not.toMatch(/at .*\.(js|ts):\d+/);
    }
  });

  it("refuses an unsupported type rather than emitting binary noise", async () => {
    const out = await extractDocumentText(Buffer.from([0x00, 0x01, 0x02]), "unknown", "thing.bin");
    expect(out.ok).toBe(false);
  });

  it("hashes content deterministically for the dedupe checksum", () => {
    const a = sha256(Buffer.from("same bytes"));
    expect(a).toBe(sha256(Buffer.from("same bytes")));
    expect(a).not.toBe(sha256(Buffer.from("other bytes")));
    expect(a).toHaveLength(64);
  });

  it("caps media at a sane size so one attachment cannot exhaust memory", () => {
    expect(MAX_MEDIA_BYTES).toBeGreaterThan(0);
    expect(MAX_MEDIA_BYTES).toBeLessThanOrEqual(100 * 1024 * 1024);
  });
});
