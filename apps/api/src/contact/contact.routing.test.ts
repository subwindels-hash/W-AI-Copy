/**
 * Session 200 — deeper Contact Center routing & triage coverage.
 *
 * The base suite covers submission (honeypot, security route), the AI assistant
 * start/collect, and one admin flow. This suite hardens the keyword-driven
 * department routing and the assistant's category/escalation triage that were
 * otherwise unverified — the logic that decides who sees a customer request.
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
vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: {
    complete: vi.fn(async () => ({ content: "Thanks, noted.", usage: { tokensIn: 0, tokensOut: 0, costMicros: 0 }, model: "test", provider: "test", durationMs: 0, modelSource: "echo-demo" as const })),
  },
}));

const contact = await import("./contact.service.js");
const ai = await import("./aiAssistant.js");

beforeEach(() => { db.reset(); });

async function submit(over: Record<string, any>) {
  return contact.ContactService.submitContactRequest({
    name: "Cust", email: "c@x.com", subject: "S", message: "A sufficiently detailed message here.",
    ...over,
  });
}

describe("department routing", () => {
  it("routes a technical API request to the api department", async () => {
    const r = await submit({ category: "technical", message: "My API key and webhook oauth integration stopped working after the update." });
    expect(r.department).toBe("api");
  });

  it("routes any message mentioning a breach to security regardless of category", async () => {
    const r = await submit({ category: "general", message: "I think there was a security breach / possible phishing on my account." });
    expect(r.department).toBe("security");
  });

  it("routes an enterprise sales request to enterprise_sales", async () => {
    const r = await submit({ category: "sales", message: "We want an enterprise contract / team plan for our org of 500 people." });
    expect(r.department).toBe("enterprise_sales");
  });

  it("falls back to the category's base department otherwise", async () => {
    const r = await submit({ category: "billing", message: "I have a general question about my last invoice amount." });
    expect(r.department).toBeTruthy();
    expect(r.department).not.toBe("api");
    expect(r.department).not.toBe("security");
  });
});

describe("submission validation", () => {
  it("rejects a too-short message", async () => {
    await expect(submit({ message: "short" })).rejects.toThrow(/detailed message/i);
  });

  it("rejects a honeypot-filled submission", async () => {
    await expect(submit({ website: "http://spam.example" })).rejects.toThrow(/rejected/i);
  });

  it("stamps a request number and initial new status", async () => {
    const r = await submit({ category: "general" });
    expect(r.requestNumber).toBeTruthy();
    expect(r.status).toBe("new");
  });
});

describe("AI assistant triage", () => {
  it("classifies representative messages into the right category", async () => {
    expect((await ai.ContactAiService.start("I have a question about my invoice and refund")).category).toBe("billing");
    expect((await ai.ContactAiService.start("How do I use the developer SDK and webhook?")).category).toBe("api_developer");
    expect((await ai.ContactAiService.start("There was a data leak / unauthorized access")).category).toBe("security");
    expect((await ai.ContactAiService.start("The app keeps crashing with an error")).category).toBe("technical");
    expect((await ai.ContactAiService.start("I have some feedback and a feature request")).category).toBe("feedback");
  });

  it("escalates security/billing and urgent language to a human", async () => {
    expect((await ai.ContactAiService.start("possible security breach")).needsHuman).toBe(true);
    expect((await ai.ContactAiService.start("this is urgent and critical, my invoice is wrong")).needsHuman).toBe(true);
    // A benign general query does not force a human handoff.
    expect((await ai.ContactAiService.start("what are your product hours")).needsHuman).toBe(false);
  });

  it("continues an existing conversation and re-triages on the latest message", async () => {
    const first = await ai.ContactAiService.start("Hello, general question");
    expect(first.category).toBe("general");
    const next = await ai.ContactAiService.message(first.conversationId, "Actually there was a security breach");
    expect(next.category).toBe("security");
    expect(next.needsHuman).toBe(true);
  });

  it("throws for an unknown conversation id", async () => {
    await expect(ai.ContactAiService.message("no-such-convo", "hi")).rejects.toThrow(/not found|expired/i);
  });
});
