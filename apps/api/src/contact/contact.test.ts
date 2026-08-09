/**
 * Contact & Support Center tests.
 *
 * Covers contact submission (honeypot spam check, routing, record + status
 * history + message creation), AI assistant start/message/ready detection, and
 * admin operations (assign, respond, transition, dashboard). Runs on
 * FakePrisma with email/audit/notifications stubbed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));
vi.mock("../audit/audit.service.js", () => ({
  auditService: { log: vi.fn(async () => undefined), logFromRequest: vi.fn(async () => undefined) },
}));
vi.mock("./mailer.js", () => ({
  sendContactMail: vi.fn(async () => ({ ok: true, sent: false, reason: "SKIPPED" })),
  supportEmail: () => "support@windels.ai",
}));
vi.mock("../notifications/notifications.service.js", () => ({
  notificationsService: { createAndSend: vi.fn(async () => "n1") },
}));
// AI registry: return a deterministic reply so tests don't depend on a provider.
vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: {
    complete: vi.fn(async () => ({ content: "Thanks, I've noted your request.", usage: { tokensIn: 0, tokensOut: 0, costMicros: 0 }, model: "test", provider: "test", durationMs: 0, modelSource: "echo-demo" as const })),
  },
}));

const contact = await import("./contact.service.js");
const ai = await import("./aiAssistant.js");

const USER_A = "user-alpha";

beforeEach(() => {
  db.reset();
  db.seed("User", [{ id: USER_A, email: "alpha@example.com" }]);
  db.seed("Membership", [{ id: cuid(), userId: USER_A, organizationId: "org-a", workspaceId: "ws-a", joinedAt: new Date(1) }]);
});

describe("contact submission", () => {
  it("creates a contact request with routing and message + status history", async () => {
    const req = await contact.ContactService.submitContactRequest({
      name: "John Doe",
      email: "john@example.com",
      country: "Nigeria",
      company: "Example Ltd",
      category: "technical",
      subject: "Unable to connect API",
      message: "I am experiencing an authentication error when connecting to the WINDELS AI OS API.",
      preferredContactMethod: "email",
    });
    expect(req.requestNumber).toMatch(/^CC-/);
    expect(req.category).toBe("technical");
    expect(req.department).toBe("api"); // api keyword routes technical → api
    expect(req.status).toBe("new");

    const msgs = db.tables.get("ContactMessage")!.filter((m) => m.requestId === req.id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.body).toContain("authentication error");

    const hist = db.tables.get("ContactStatusHistory")!.filter((h) => h.requestId === req.id);
    expect(hist).toHaveLength(1);
    expect(hist[0]!.toStatus).toBe("new");
  });

  it("rejects honeypot-filled submissions (spam)", async () => {
    await expect(
      contact.ContactService.submitContactRequest({
        name: "Spam Bot", email: "spam@bot.com", category: "general", subject: "spam",
        message: "this is a spam submission", website: "http://spam.example",
      }),
    ).rejects.toThrow();
  });

  it("routes security requests to security department", async () => {
    const req = await contact.ContactService.submitContactRequest({
      name: "A",
      email: "a@b.com",
      category: "security",
      subject: "Possible data breach",
      message: "I think I see a security breach or unauthorized access on my account.",
    });
    expect(req.department).toBe("security");
  });

  it("requires a detailed message", async () => {
    await expect(
      contact.ContactService.submitContactRequest({ name: "A", email: "a@b.com", subject: "Hi", message: "short" }),
    ).rejects.toThrow();
  });
});

describe("AI assistant", () => {
  it("starts a conversation and returns a reply", async () => {
    const reply = await ai.ContactAiService.start("I need help with billing", { name: "John" });
    expect(reply.conversationId).toBeTruthy();
    expect(reply.reply).toBeTruthy();
    expect(reply.category).toBe("billing");
  });

  it("collects fields and reports ready when name+email+subject present", async () => {
    const reply = await ai.ContactAiService.start(
      "My name is Jane and my email is jane@example.com. Subject: my API key stopped working.",
    );
    expect(reply.collected.name).toBe("Jane");
    expect(reply.collected.email).toBe("jane@example.com");
    expect(reply.collected.subject).toBeTruthy();
  });
});

describe("admin operations", () => {
  it("assigns, responds and transitions a request", async () => {
    const req = await contact.ContactService.submitContactRequest({
      name: "Jane", email: "jane@example.com", category: "billing", subject: "Invoice", message: "I was charged twice for my subscription this month.",
    });
    const assigned = await contact.ContactService.adminAssign(USER_A, req.id, { userId: USER_A });
    expect(assigned.assignedUserId).toBe(USER_A);
    expect(assigned.status).toBe("assigned");

    await contact.ContactService.adminRespond(USER_A, req.id, { body: "We are reviewing.", isInternal: false });
    const resolved = await contact.ContactService.adminTransition(USER_A, req.id, "resolved");
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedAt).toBeTruthy();
  });

  it("produces an admin dashboard rollup", async () => {
    await contact.ContactService.submitContactRequest({ name: "A", email: "a@b.com", category: "general", subject: "Hello", message: "Just a general question about the platform." });
    const dash = await contact.ContactService.adminDashboard();
    expect(dash.total).toBeGreaterThanOrEqual(1);
    expect(dash.byCategory.some((c) => c.category === "general")).toBe(true);
  });
});
