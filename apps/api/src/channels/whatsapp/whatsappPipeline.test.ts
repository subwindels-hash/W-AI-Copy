/**
 * Inbound pipeline behaviour (Phase 1 §18 — AI routing, agent selection,
 * context, memory permissions, generation; plus the identity-isolation rule
 * from §8).
 *
 * The AI provider and the Cloud API client are the two real external calls, so
 * they are stubbed; everything between them — channel lookup, contact
 * resolution, rate limiting, conversation binding, persistence, orchestration
 * gates, agent choice and prompt construction — runs for real against an
 * in-memory database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeRedis } from "./testUtils/fakeRedis.js";
import { createWaPrisma } from "./testUtils/waPrisma.js";
import { cuid } from "../../testUtils/fakePrisma.js";

const redis = new FakeRedis();
const wa = createWaPrisma();
const db = wa.db;

// The one AI brain: observed, never reimplemented.
const complete = vi.fn();
// The Cloud API edge.
const sendText = vi.fn();
const applyStatusUpdate = vi.fn();

vi.mock("../../db/redis.js", () => ({ redisCmd: redis, redis, redisSub: redis }));
vi.mock("../../db/client.js", () => ({ prisma: wa.prisma }));
vi.mock("../../services/ai/registry.js", () => ({ aiRegistry: { complete } }));
vi.mock("./whatsappMessage.service.js", () => ({
  WhatsAppMessageService: { sendText, applyStatusUpdate, sendMedia: vi.fn(), markRead: vi.fn() },
}));
// The Graph media download + extraction edge. Phase 2 turns attachments into
// prompt content, so the pipeline test stubs the network boundary only.
const ingest = vi.fn();
vi.mock("./whatsappMedia.service.js", () => ({ WhatsAppMediaService: { ingest } }));

const { WhatsAppPipeline } = await import("./whatsappPipeline.js");
const { classifyDomain, selectAgent } = await import("./whatsappAgentRouter.js");

const ORG = "org-alpha";
const OTHER_ORG = "org-beta";
const CHANNEL_ID = "chan-1";
const PHONE_ID = "109876543210987";
const SENDER = "2348012345678";

function seedChannel(settings: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  db.seed("WhatsAppChannel", [{
    id: CHANNEL_ID,
    organizationId: ORG,
    name: "Support",
    phoneNumberId: PHONE_ID,
    businessAccountId: "WABA-1",
    displayPhoneNumber: "15550001111",
    status: "CONNECTED",
    webhookStatus: "VERIFIED",
    enabled: true,
    apiVersion: "v21.0",
    accessTokenEnc: "token",
    appSecretEnc: "secret",
    verifyTokenEnc: "verify",
    settings,
    deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...over,
  }]);
}

function seedOwner(organizationId = ORG) {
  const userId = cuid();
  db.seed("Membership", [{
    id: cuid(), organizationId, userId, role: "OWNER", createdAt: new Date(),
  }]);
  return userId;
}

function seedAgent(over: Record<string, unknown> = {}) {
  const id = over.id ?? cuid();
  db.seed("Agent", [{
    id,
    organizationId: ORG,
    name: "General Assistant",
    role: "general",
    department: "general",
    description: "General purpose",
    capabilities: [],
    systemPrompt: "You are general.",
    modelId: "gpt-4o-mini",
    temperature: 0.7,
    maxTokens: 2048,
    createdAt: new Date(), updatedAt: new Date(),
    ...over,
  }]);
  return id as string;
}

function inbound(over: Record<string, unknown> = {}) {
  return {
    kind: "message" as const,
    messageId: `wamid.${Math.abs(Date.now() % 100000)}.${(seq += 1)}`,
    phoneNumberId: PHONE_ID,
    displayPhoneNumber: "15550001111",
    from: SENDER,
    waId: SENDER,
    profileName: "Ada",
    timestamp: new Date("2026-03-02T12:00:00Z"),
    messageType: "text" as const,
    text: "hello there",
    mediaId: null,
    metadata: {},
    ...over,
  };
}
let seq = 0;

const rows = (t: string) => db.tables.get(t) ?? [];

beforeEach(() => {
  wa.reset();
  redis.reset();
  complete.mockReset();
  sendText.mockReset();
  ingest.mockReset();
  complete.mockResolvedValue({
    content: "Hi Ada, how can I help?",
    usage: { tokensIn: 12, tokensOut: 8, costMicros: 40, model: "gpt-4o-mini" },
    model: "gpt-4o-mini", provider: "openai", durationMs: 120, modelSource: "configured",
  });
  sendText.mockResolvedValue({ ok: true, messageId: "wamid.OUT", recordId: "rec-1" });
});

// ─── Happy path ────────────────────────────────────────────────────────
describe("inbound pipeline — end to end", () => {
  it("turns a message into a WINDELS conversation, an AI reply and an outbound send", async () => {
    seedOwner();
    seedChannel();
    seedAgent();

    const result = await WhatsAppPipeline.processInboundMessage(inbound());

    expect(result.status).toBe("processed");
    expect(result.replySent).toBe(true);

    // Bound to the real conversation system, not a WhatsApp-only store.
    expect(rows("Conversation")).toHaveLength(1);
    const conversation = rows("Conversation")[0];
    expect((conversation.metadata as any).channel).toBe("whatsapp");

    // Both turns persisted as real Messages.
    const messages = rows("Message");
    expect(messages.map((m) => m.role)).toEqual(["USER", "ASSISTANT"]);
    expect(messages[1].content).toBe("Hi Ada, how can I help?");
    expect(messages[1].status).toBe("COMPLETED");

    // The WhatsApp thread points back at the WINDELS conversation.
    expect(rows("WhatsAppConversation")[0].windelsConversationId).toBe(conversation.id);
    expect(sendText).toHaveBeenCalledOnce();
  });

  it("routes the turn through the God-Node orchestrator rather than around it", async () => {
    seedOwner(); seedChannel(); seedAgent();
    await WhatsAppPipeline.processInboundMessage(inbound());

    // KernelService.dispatch persists each event to the kernel event stream.
    const dispatched = (await redis.zrange("kernel:events", 0, -1)).map((e) => JSON.parse(e));
    const kinds = dispatched.map((e: any) => e.kind);
    expect(kinds).toContain("whatsapp.message.received");
    expect(kinds).toContain("whatsapp.response.delivered");
    expect(dispatched.every((e: any) => e.source === "whatsapp-channel")).toBe(true);
  });

  it("meters usage against the org and the existing billing channel", async () => {
    seedOwner(); seedChannel(); const agentId = seedAgent();
    await WhatsAppPipeline.processInboundMessage(inbound());

    const [, usage] = complete.mock.calls[0];
    expect(usage).toMatchObject({ organizationId: ORG, channel: "chat", feature: "whatsapp", agentId });
    expect(usage.conversationId).toBe(rows("Conversation")[0].id);

    const assistant = rows("Message").find((m) => m.role === "ASSISTANT")!;
    expect(assistant.tokensIn).toBe(12);
    expect(assistant.costMicros).toBe(40);
  });

  it("reuses the same conversation across turns and replays prior context", async () => {
    seedOwner(); seedChannel(); seedAgent();

    await WhatsAppPipeline.processInboundMessage(inbound({ text: "first question" }));
    await WhatsAppPipeline.processInboundMessage(inbound({ text: "second question" }));

    expect(rows("Conversation")).toHaveLength(1);
    expect(rows("WhatsAppConversation")).toHaveLength(1);

    const [{ messages }] = complete.mock.calls[1];
    const contents = messages.map((m: any) => m.content);
    expect(contents).toContain("first question");
    expect(contents[contents.length - 1]).toBe("second question");
  });

  it("does not re-store a redelivered message", async () => {
    seedOwner(); seedChannel(); seedAgent();
    const msg = inbound();

    const first = await WhatsAppPipeline.processInboundMessage(msg);
    const second = await WhatsAppPipeline.processInboundMessage(msg);

    expect(first.status).toBe("processed");
    expect(second.status).toBe("duplicate");
    expect(rows("WhatsAppMessage").filter((m) => m.direction === "INBOUND")).toHaveLength(1);
    // The duplicate must not have produced a second AI call or a second reply.
    expect(complete).toHaveBeenCalledOnce();
    expect(sendText).toHaveBeenCalledOnce();
  });
});

// ─── §8 identity isolation ─────────────────────────────────────────────
describe("identity isolation", () => {
  it("creates an unlinked contact even when a WINDELS user has that phone number", async () => {
    const ownerId = seedOwner();
    seedChannel();
    seedAgent();
    db.seed("User", [{ id: ownerId, email: "ada@windels.test", phone: `+${SENDER}`, createdAt: new Date() }]);

    await WhatsAppPipeline.processInboundMessage(inbound());

    const contact = rows("WhatsAppContact")[0];
    expect(contact.linkedWindelsUserId).toBeNull();
  });

  it("instructs the model to withhold private data from an unverified sender", async () => {
    seedOwner(); seedChannel(); seedAgent();
    await WhatsAppPipeline.processInboundMessage(inbound());

    const [{ messages }] = complete.mock.calls[0];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toMatch(/NOT verified/i);
  });

  it("attributes the turn to the user and relaxes the guard once verified", async () => {
    const ownerId = seedOwner();
    seedChannel();
    seedAgent();
    db.seed("WhatsAppContact", [{
      id: "contact-linked", organizationId: ORG, whatsappChannelId: CHANNEL_ID,
      whatsappUserId: SENDER, phoneNumber: SENDER, displayName: "Ada",
      linkedWindelsUserId: ownerId, linkedAt: new Date(), status: "ACTIVE",
      createdAt: new Date(), updatedAt: new Date(),
    }]);

    await WhatsAppPipeline.processInboundMessage(inbound());

    const [{ messages }] = complete.mock.calls[0];
    expect(messages[0].content).toMatch(/verified their WINDELS account/i);
    expect(rows("Message").find((m) => m.role === "USER")!.userId).toBe(ownerId);
    expect((rows("Conversation")[0].metadata as any).identityVerified).toBe(true);
  });

  it("ignores a sender whose contact is blocked", async () => {
    seedOwner(); seedChannel(); seedAgent();
    db.seed("WhatsAppContact", [{
      id: "contact-blocked", organizationId: ORG, whatsappChannelId: CHANNEL_ID,
      whatsappUserId: SENDER, phoneNumber: SENDER, status: "BLOCKED",
      linkedWindelsUserId: null, createdAt: new Date(), updatedAt: new Date(),
    }]);

    const result = await WhatsAppPipeline.processInboundMessage(inbound());
    expect(result.status).toBe("ignored");
    expect(complete).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it("never routes a message to a channel in another organization", async () => {
    seedOwner(OTHER_ORG);
    seedChannel({}, { organizationId: OTHER_ORG });
    seedAgent();

    await WhatsAppPipeline.processInboundMessage(inbound());

    // The channel row owns the tenant key, so everything is written under it.
    expect(rows("WhatsAppContact")[0].organizationId).toBe(OTHER_ORG);
    expect(rows("Conversation")[0].organizationId).toBe(OTHER_ORG);
    const [, usage] = complete.mock.calls[0];
    expect(usage.organizationId).toBe(OTHER_ORG);
  });
});

// ─── §9 memory permissions ─────────────────────────────────────────────
describe("memory permissions", () => {
  it("does not write permanent memory for a WhatsApp turn", async () => {
    seedOwner(); seedChannel(); seedAgent();
    await WhatsAppPipeline.processInboundMessage(inbound({ text: "remember my API key is abc123" }));

    // Conversation history is transient context; nothing is promoted into the
    // Memory Fabric by default (settings.memoryWriteEnabled is false).
    expect(rows("Memory")).toHaveLength(0);
    expect(rows("MemoryEntry")).toHaveLength(0);
    expect(rows("KnowledgeNode")).toHaveLength(0);
  });

  it("bounds replayed context to the current conversation only", async () => {
    seedOwner(); seedChannel(); seedAgent();

    // A second, unrelated conversation in the same org.
    db.seed("Conversation", [{
      id: "other-convo", organizationId: ORG, title: "Private planning",
      createdById: "someone", metadata: {}, deletedAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    }]);
    db.seed("Message", [{
      id: "other-msg", conversationId: "other-convo", role: "USER",
      content: "the acquisition price is 40 million", status: "COMPLETED",
      createdAt: new Date(),
    }]);

    await WhatsAppPipeline.processInboundMessage(inbound());

    const [{ messages }] = complete.mock.calls[0];
    expect(JSON.stringify(messages)).not.toContain("acquisition price");
  });
});

// ─── §7 agent routing ──────────────────────────────────────────────────
describe("agent routing", () => {
  it("classifies text into the Phase 1 domain taxonomy", () => {
    expect(classifyDomain("can you explain this lesson for my exam")).toBe("education");
    expect(classifyDomain("my bitcoin portfolio is down")).toBe("trading");
    expect(classifyDomain("there is a bug in my typescript api")).toBe("developer");
    expect(classifyDomain("what are my symptoms telling me")).toBe("health");
    expect(classifyDomain("hello")).toBe("general");
    expect(classifyDomain(null)).toBe("general");
  });

  it("picks the domain specialist over the generalist", async () => {
    seedAgent({ id: "agent-general", name: "General Assistant", department: "general" });
    seedAgent({ id: "agent-dev", name: "Developer Agent", department: "developer", description: "code and api help" });

    const chosen = await selectAgent({ organizationId: ORG, text: "my api deploy threw an error", allowedAgentIds: [] });
    expect(chosen?.id).toBe("agent-dev");
    expect(chosen?.domain).toBe("developer");
  });

  it("honours the channel allow-list even when a better agent exists", async () => {
    seedAgent({ id: "agent-general", name: "General Assistant", department: "general" });
    seedAgent({ id: "agent-dev", name: "Developer Agent", department: "developer" });

    const chosen = await selectAgent({
      organizationId: ORG, text: "my api deploy threw an error", allowedAgentIds: ["agent-general"],
    });
    expect(chosen?.id).toBe("agent-general");
  });

  it("never selects an agent belonging to another organization", async () => {
    seedAgent({ id: "agent-foreign", name: "Developer Agent", department: "developer", organizationId: OTHER_ORG });
    const chosen = await selectAgent({ organizationId: ORG, text: "api bug", allowedAgentIds: [] });
    expect(chosen).toBeNull();
  });

  it("falls back to the default assistant when the org has no agents", async () => {
    seedOwner(); seedChannel();
    const result = await WhatsAppPipeline.processInboundMessage(inbound());

    expect(result.status).toBe("processed");
    const [{ messages }] = complete.mock.calls[0];
    expect(messages[0].content).toMatch(/helpful WINDELS AI assistant/i);
    expect(rows("Message").find((m) => m.role === "ASSISTANT")!.agentId).toBeNull();
  });

  it("applies the selected agent's model and generation settings", async () => {
    seedOwner(); seedChannel();
    seedAgent({ id: "agent-x", modelId: "claude-sonnet", temperature: 0.2, maxTokens: 512, systemPrompt: "You are Agent X." });

    await WhatsAppPipeline.processInboundMessage(inbound());
    const [req] = complete.mock.calls[0];
    expect(req.model).toBe("claude-sonnet");
    expect(req.temperature).toBe(0.2);
    expect(req.maxTokens).toBe(512);
    expect(req.messages[0].content).toContain("You are Agent X.");
  });
});

// ─── §19 honest failure ────────────────────────────────────────────────
describe("failure handling", () => {
  it("reports a configuration failure instead of inventing a reply", async () => {
    seedOwner(); seedChannel(); seedAgent();
    const err: any = new Error("No AI provider is configured");
    err.code = "AI_PROVIDER_CONFIGURATION_REQUIRED";
    complete.mockRejectedValue(err);

    const result = await WhatsAppPipeline.processInboundMessage(inbound());

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("AI_PROVIDER_CONFIGURATION_REQUIRED");

    const assistant = rows("Message").find((m) => m.role === "ASSISTANT")!;
    expect(assistant.status).toBe("FAILED");
    expect(assistant.content).toBe("");

    // The user is told it failed — no fabricated answer went out.
    const [, , body] = sendText.mock.calls[0];
    expect(body).toMatch(/can't generate a reply/i);

    // And the operator can see why on the channel.
    expect(rows("WhatsAppChannel")[0].lastError).toBeTruthy();
  });

  it("treats an empty model response as a failure, not an empty reply", async () => {
    seedOwner(); seedChannel(); seedAgent();
    complete.mockResolvedValue({ content: "   ", usage: null, model: "m", provider: "p", durationMs: 1, modelSource: "x" });

    const result = await WhatsAppPipeline.processInboundMessage(inbound());
    expect(result.status).toBe("failed");
    expect(rows("Message").find((m) => m.role === "ASSISTANT")!.status).toBe("FAILED");
  });

  it("reports a send failure after a successful generation", async () => {
    seedOwner(); seedChannel(); seedAgent();
    sendText.mockResolvedValue({ ok: false, error: { code: "WHATSAPP_SEND_FAILED", message: "rejected" } });

    const result = await WhatsAppPipeline.processInboundMessage(inbound());
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("WHATSAPP_SEND_FAILED");
    // The generated answer is still persisted, so nothing is lost.
    expect(rows("Message").find((m) => m.role === "ASSISTANT")!.status).toBe("COMPLETED");
  });

  it("ignores traffic for an unregistered or disabled channel", async () => {
    expect((await WhatsAppPipeline.processInboundMessage(inbound())).status).toBe("ignored");

    wa.reset();
    seedChannel({}, { enabled: false });
    const result = await WhatsAppPipeline.processInboundMessage(inbound());
    expect(result.status).toBe("ignored");
    expect(complete).not.toHaveBeenCalled();
  });

  it("fails cleanly when the organization has no owner to attribute the thread to", async () => {
    seedChannel(); seedAgent();
    const result = await WhatsAppPipeline.processInboundMessage(inbound());

    expect(result.status).toBe("failed");
    expect(result.reason).toMatch(/could not bind a WINDELS conversation/);
    expect(complete).not.toHaveBeenCalled();
  });
});

// ─── §13 channel settings ──────────────────────────────────────────────
describe("channel settings", () => {
  it("stays silent when the response mode is off", async () => {
    seedOwner(); seedChannel({ responseMode: "off" }); seedAgent();
    const result = await WhatsAppPipeline.processInboundMessage(inbound());

    expect(result.replySent).toBe(false);
    expect(complete).not.toHaveBeenCalled();
    // The message is still recorded for the human to read.
    expect(rows("WhatsAppMessage")).toHaveLength(1);
  });

  it("escalates instead of answering when the mode is human", async () => {
    seedOwner(); seedChannel({ responseMode: "human" }); seedAgent();
    const result = await WhatsAppPipeline.processInboundMessage(inbound());

    expect(result.replySent).toBe(false);
    expect(complete).not.toHaveBeenCalled();
    expect(rows("WhatsAppConversation")[0].status).toBe("ESCALATED");
  });

  it("sends the configured auto-response outside working hours", async () => {
    seedOwner();
    seedChannel({
      timezone: "UTC",
      // A window that cannot contain the current time.
      workingHours: { enabled: true, startMinute: 0, endMinute: 1, days: [] },
      autoResponseText: "We're closed — we'll reply in the morning.",
    });
    seedAgent();

    vi.setSystemTime(new Date("2026-03-02T12:00:00Z"));
    const result = await WhatsAppPipeline.processInboundMessage(inbound());
    vi.useRealTimers();

    expect(complete).not.toHaveBeenCalled();
    expect(result.replySent).toBe(true);
    expect(sendText.mock.calls[0][2]).toMatch(/We're closed/);
  });

  it("refuses media when media handling is disabled", async () => {
    seedOwner(); seedChannel({ mediaEnabled: false }); seedAgent();

    const result = await WhatsAppPipeline.processInboundMessage(
      inbound({ messageType: "image", text: null, mediaId: "media-1" }),
    );

    expect(complete).not.toHaveBeenCalled();
    expect(result.replySent).toBe(true);
    expect(sendText.mock.calls[0][2]).toMatch(/not enabled/i);
    // Still stored with the right type, so the admin can see what arrived.
    expect(rows("WhatsAppMessage")[0].messageType).toBe("IMAGE");
  });

  it("puts a transcribed voice note in front of the model as real content", async () => {
    seedOwner(); seedChannel({ mediaEnabled: true }); seedAgent();
    ingest.mockResolvedValueOnce({
      mediaRecordId: "med-1", status: "COMPLETED", kind: "audio",
      text: "[Voice note transcript]\nplease reconcile the March invoices",
      image: null, failureMessage: null, failureCode: null, configurationRequired: false,
    });

    await WhatsAppPipeline.processInboundMessage(
      inbound({ messageType: "audio", text: null, mediaId: "media-2" }),
    );

    expect(ingest).toHaveBeenCalledTimes(1);
    const [{ messages }] = complete.mock.calls[0];
    // The model receives the transcript itself, not a placeholder describing
    // that a voice note arrived.
    expect(messages[messages.length - 1].content).toMatch(/reconcile the March invoices/i);
  });

  it("sends an image to the model as vision content, not as a text stand-in", async () => {
    seedOwner(); seedChannel({ mediaEnabled: true }); seedAgent();
    ingest.mockResolvedValueOnce({
      mediaRecordId: "med-2", status: "COMPLETED", kind: "image",
      text: "[Image] a bar chart of quarterly revenue",
      image: { mimeType: "image/jpeg", dataBase64: "AAAA" },
      failureMessage: null, failureCode: null, configurationRequired: false,
    });

    await WhatsAppPipeline.processInboundMessage(
      inbound({ messageType: "image", text: "what does this show?", mediaId: "media-3" }),
    );

    const [request] = complete.mock.calls[0];
    const lastTurn = request.messages[request.messages.length - 1];
    expect(lastTurn.images).toEqual([{ mimeType: "image/jpeg", dataBase64: "AAAA" }]);
    // A vision turn must not be pinned to the agent's configured text model.
    expect(request.model).toBe("");
    expect(request.requiredCapabilities).toEqual(["vision"]);
  });

  it("tells the truth when an attachment cannot be read instead of guessing", async () => {
    seedOwner(); seedChannel({ mediaEnabled: true }); seedAgent();
    ingest.mockResolvedValueOnce({
      mediaRecordId: "med-3", status: "FAILED", kind: "document",
      text: null, image: null,
      failureMessage: "I couldn't read that PDF — it looks to be a scan without text.",
      failureCode: "PDF_NO_TEXT_LAYER", configurationRequired: false,
    });

    const result = await WhatsAppPipeline.processInboundMessage(
      inbound({ messageType: "document", text: null, mediaId: "media-4" }),
    );

    // No AI call at all: we do not invent an answer about a file we could not open.
    expect(complete).not.toHaveBeenCalled();
    expect(result.replySent).toBe(true);
    expect(sendText.mock.calls[0][2]).toMatch(/couldn't read that PDF/i);
  });

  it("rate limits a contact that exceeds its hourly quota", async () => {
    seedOwner(); seedChannel({ perContactHourlyLimit: 2 }); seedAgent();

    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await WhatsAppPipeline.processInboundMessage(inbound({ text: `msg ${i}` })));
    }

    expect(results.filter((r) => r.status === "processed")).toHaveLength(2);
    expect(results.filter((r) => r.status === "rate_limited")).toHaveLength(2);
    expect(complete).toHaveBeenCalledTimes(2);
  });
});
