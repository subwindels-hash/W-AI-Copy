/**
 * Database layer (Phase 1 §18 — "channel/contact/conversation creation,
 * persistence, idempotency").
 *
 * Exercises the schema contract the migration establishes: the unique keys that
 * make replay safe, the compound keys that make lookups deterministic, the
 * bridge columns tying WhatsApp rows to WINDELS rows, and the rule that no
 * raw webhook payload is ever persisted.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { FakeRedis } from "./testUtils/fakeRedis.js";
import { createWaPrisma } from "./testUtils/waPrisma.js";

const redis = new FakeRedis();
const wa = createWaPrisma();
const db = wa.db;

vi.mock("../../db/redis.js", () => ({ redisCmd: redis, redis, redisSub: redis }));
vi.mock("../../db/client.js", () => ({ prisma: wa.prisma }));

const prisma = wa.prisma;
const { WhatsAppChannelService } = await import("./whatsappChannel.service.js");
const { WhatsAppIdentityService } = await import("./whatsappIdentity.service.js");

const ORG = "org-alpha";
const rows = (t: string) => db.tables.get(t) ?? [];

async function makeChannel(over: Record<string, unknown> = {}) {
  return WhatsAppChannelService.create(ORG, {
    name: "Support",
    phoneNumberId: "109876543210987",
    businessAccountId: "WABA-1",
    accessToken: "token", appSecret: "secret", verifyToken: "verify",
    ...over,
  } as any);
}

beforeEach(() => {
  wa.reset();
  redis.reset();
});

// ─── Channel ───────────────────────────────────────────────────────────
describe("channel persistence", () => {
  it("creates a channel with safe defaults", async () => {
    const dto = await makeChannel();
    const row = rows("WhatsAppChannel")[0];

    expect(row.organizationId).toBe(ORG);
    expect(row.phoneNumberId).toBe("109876543210987");
    // Disabled until an operator confirms; settings pre-populated.
    expect(row.enabled).toBe(false);
    expect(row.settings.responseMode).toBe("ai");
    // §9: WhatsApp must not write permanent memory by default.
    expect(row.settings.memoryWriteEnabled).toBe(false);
    expect(dto.id).toBeTruthy();
  });

  it("enforces one channel per phone_number_id", async () => {
    await makeChannel();
    await expect(makeChannel({ businessAccountId: "WABA-2" })).rejects.toMatchObject({ code: "P2002" });
    expect(rows("WhatsAppChannel")).toHaveLength(1);
  });

  it("routes an inbound number to exactly one channel", async () => {
    await makeChannel();
    const found = await WhatsAppChannelService.findByPhoneNumberId("109876543210987");
    expect(found?.organizationId).toBe(ORG);
    expect(await WhatsAppChannelService.findByPhoneNumberId("000000000000000")).toBeNull();
  });

  it("routes an account-level event by business account id", async () => {
    await makeChannel();
    expect((await WhatsAppChannelService.findByBusinessAccountId("WABA-1"))?.phoneNumberId).toBe("109876543210987");
    expect(await WhatsAppChannelService.findByBusinessAccountId("WABA-unknown")).toBeNull();
  });

  it("prefers an enabled channel as the org's primary", async () => {
    const first = await makeChannel();
    await makeChannel({ phoneNumberId: "222", businessAccountId: "WABA-2" });
    // Neither enabled yet → still resolves to one.
    expect(await WhatsAppChannelService.primary(ORG)).toBeTruthy();

    await WhatsAppChannelService.update(ORG, first.id, { enabled: true });
    expect((await WhatsAppChannelService.primary(ORG))?.id).toBe(first.id);
  });

  it("merges a settings patch instead of replacing the whole object", async () => {
    const dto = await makeChannel();
    await WhatsAppChannelService.updateSettings(ORG, dto.id, { responseMode: "human" } as any);

    const settings = rows("WhatsAppChannel")[0].settings;
    expect(settings.responseMode).toBe("human");
    // Untouched keys survive.
    expect(settings.memoryWriteEnabled).toBe(false);
    expect(settings.perContactHourlyLimit).toBeGreaterThan(0);
  });

  it("records webhook and error observability signals on the channel", async () => {
    const dto = await makeChannel();

    await WhatsAppChannelService.markWebhookVerified(dto.id);
    expect(rows("WhatsAppChannel")[0].webhookStatus).toBe("VERIFIED");
    expect(rows("WhatsAppChannel")[0].lastWebhookAt).toBeTruthy();

    await WhatsAppChannelService.recordError(dto.id, "WHATSAPP_UNAUTHORIZED: bad token");
    expect(rows("WhatsAppChannel")[0].lastError).toContain("WHATSAPP_UNAUTHORIZED");

    await WhatsAppChannelService.recordConnected(dto.id, null);
    expect(rows("WhatsAppChannel")[0].status).toBe("CONNECTED");
    // A successful call clears the stale error.
    expect(rows("WhatsAppChannel")[0].lastError).toBeNull();
  });
});

// ─── Contact ───────────────────────────────────────────────────────────
describe("contact persistence", () => {
  const resolve = (over: Record<string, unknown> = {}) =>
    WhatsAppIdentityService.resolveContact({
      channelId: "chan-1", organizationId: ORG,
      whatsappUserId: "2348012345678", phoneNumber: "+234 801 234 5678",
      profileName: "Ada", ...over,
    });

  it("creates a contact once and reuses it thereafter", async () => {
    const first = await resolve();
    const second = await resolve();

    expect(second.contactId).toBe(first.contactId);
    expect(rows("WhatsAppContact")).toHaveLength(1);
    // Phone stored normalised, not as typed.
    expect(rows("WhatsAppContact")[0].phoneNumber).toBe("2348012345678");
  });

  it("creates every new contact unlinked (§8)", async () => {
    const identity = await resolve();
    expect(identity.isLinked).toBe(false);
    expect(identity.linkedUserId).toBeNull();
    expect(rows("WhatsAppContact")[0].linkedWindelsUserId).toBeNull();
  });

  it("keeps the same number on two channels as two distinct identities", async () => {
    await resolve();
    await resolve({ channelId: "chan-2" });
    expect(rows("WhatsAppContact")).toHaveLength(2);
  });

  it("rejects a duplicate identity on one channel", async () => {
    await resolve();
    await expect(prisma.whatsAppContact.create({
      data: {
        organizationId: ORG, whatsappChannelId: "chan-1",
        whatsappUserId: "2348012345678", phoneNumber: "2348012345678",
      },
    })).rejects.toMatchObject({ code: "P2002" });
  });

  it("refreshes last-seen and profile name on each message", async () => {
    await resolve();
    const before = rows("WhatsAppContact")[0].lastSeenAt;

    const identity = await resolve({ profileName: "Ada L." });
    expect(identity.displayName).toBe("Ada L.");
    expect(rows("WhatsAppContact")[0].lastSeenAt).not.toBe(before);
  });

  it("preserves an established link across later messages", async () => {
    const identity = await resolve();
    await prisma.whatsAppContact.update({
      where: { id: identity.contactId },
      data: { linkedWindelsUserId: "user-a", linkedAt: new Date() },
    });

    const again = await resolve();
    expect(again.isLinked).toBe(true);
    expect(again.linkedUserId).toBe("user-a");
  });

  it("treats blocked and opted-out contacts as blocked", async () => {
    const identity = await resolve();
    expect(await WhatsAppIdentityService.isBlocked(identity.contactId)).toBe(false);

    for (const status of ["BLOCKED", "OPTED_OUT"]) {
      await prisma.whatsAppContact.update({ where: { id: identity.contactId }, data: { status } });
      expect(await WhatsAppIdentityService.isBlocked(identity.contactId)).toBe(true);
    }

    await prisma.whatsAppContact.update({ where: { id: identity.contactId }, data: { status: "ACTIVE" } });
    expect(await WhatsAppIdentityService.isBlocked(identity.contactId)).toBe(false);
    expect(await WhatsAppIdentityService.isBlocked("no-such-contact")).toBe(false);
  });
});

// ─── Conversation ──────────────────────────────────────────────────────
describe("conversation persistence", () => {
  const upsert = (contactId = "contact-1") =>
    prisma.whatsAppConversation.upsert({
      where: { channelId_contactId: { channelId: "chan-1", contactId } },
      create: { organizationId: ORG, channelId: "chan-1", contactId, status: "OPEN" },
      update: { lastMessageAt: new Date() },
    });

  it("keeps exactly one thread per contact per channel", async () => {
    const a = await upsert();
    const b = await upsert();

    expect(b.id).toBe(a.id);
    expect(rows("WhatsAppConversation")).toHaveLength(1);
  });

  it("separates threads for different contacts", async () => {
    await upsert("contact-1");
    await upsert("contact-2");
    expect(rows("WhatsAppConversation")).toHaveLength(2);
  });

  it("rejects a duplicate thread created outside the upsert path", async () => {
    await upsert();
    await expect(prisma.whatsAppConversation.create({
      data: { organizationId: ORG, channelId: "chan-1", contactId: "contact-1" },
    })).rejects.toMatchObject({ code: "P2002" });
  });

  it("bridges to the WINDELS conversation via windelsConversationId", async () => {
    const convo = await upsert();
    await prisma.whatsAppConversation.update({
      where: { id: convo.id },
      data: { windelsConversationId: "windels-convo-1" },
    });

    const bound = await prisma.whatsAppConversation.findUnique({ where: { id: convo.id } });
    expect(bound.windelsConversationId).toBe("windels-convo-1");
  });
});

// ─── Message ───────────────────────────────────────────────────────────
describe("message persistence and idempotency", () => {
  const inbound = (over: Record<string, unknown> = {}) =>
    prisma.whatsAppMessage.create({
      data: {
        organizationId: ORG, conversationId: "convo-1", direction: "INBOUND",
        messageType: "TEXT", text: "hello", whatsappMessageId: "wamid.ABC",
        status: "RECEIVED", metadata: {}, ...over,
      },
    });

  it("stores an inbound message with its provider id", async () => {
    const row = await inbound();
    expect(row.whatsappMessageId).toBe("wamid.ABC");
    expect(rows("WhatsAppMessage")).toHaveLength(1);
  });

  it("rejects a replayed provider message id — the core dedupe guarantee", async () => {
    await inbound();
    await expect(inbound({ text: "hello again" })).rejects.toMatchObject({ code: "P2002" });
    expect(rows("WhatsAppMessage")).toHaveLength(1);
    expect(rows("WhatsAppMessage")[0].text).toBe("hello");
  });

  it("allows many outbound rows without a provider id yet", async () => {
    await inbound({ direction: "OUTBOUND", whatsappMessageId: null, status: "PENDING" });
    await inbound({ direction: "OUTBOUND", whatsappMessageId: null, status: "PENDING" });
    expect(rows("WhatsAppMessage")).toHaveLength(2);
  });

  it("bridges to the WINDELS message via windelsMessageId", async () => {
    const row = await inbound({ windelsMessageId: "windels-msg-1" });
    expect(row.windelsMessageId).toBe("windels-msg-1");
  });

  it("supports every message type the channel accepts", async () => {
    const types = ["TEXT", "IMAGE", "AUDIO", "VIDEO", "DOCUMENT", "LOCATION", "INTERACTIVE", "BUTTON", "REACTION", "UNKNOWN"];
    for (const [i, messageType] of types.entries()) {
      await inbound({ messageType, whatsappMessageId: `wamid.${i}` });
    }
    expect(rows("WhatsAppMessage").map((m) => m.messageType)).toEqual(types);
  });
});

// ─── Webhook event audit ───────────────────────────────────────────────
describe("webhook event idempotency", () => {
  const payload = { object: "whatsapp_business_account", entry: [{ id: "WABA-1" }] };
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

  const record = (over: Record<string, unknown> = {}) =>
    prisma.whatsAppWebhookEvent.create({
      data: {
        organizationId: ORG, channelId: "chan-1", eventId: "wamid.ABC:message",
        eventType: "message", payloadHash, processingStatus: "RECEIVED",
        attempts: 0, ...over,
      },
    });

  it("records an event once", async () => {
    const row = await record();
    expect(row.processingStatus).toBe("RECEIVED");
    expect(rows("WhatsAppWebhookEvent")).toHaveLength(1);
  });

  it("rejects a duplicate eventId so a Meta retry is a no-op", async () => {
    await record();
    await expect(record()).rejects.toMatchObject({ code: "P2002" });
    expect(rows("WhatsAppWebhookEvent")).toHaveLength(1);
  });

  it("distinguishes a status callback from the message of the same id", async () => {
    await record();
    await record({ eventId: "wamid.ABC:status:delivered", eventType: "status" });
    expect(rows("WhatsAppWebhookEvent")).toHaveLength(2);
  });

  it("stores only a payload hash — never the raw message body (§4)", async () => {
    await record();
    const stored = rows("WhatsAppWebhookEvent")[0];

    expect(stored.payloadHash).toBe(payloadHash);
    expect(stored.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored).not.toHaveProperty("payload");
    expect(stored).not.toHaveProperty("rawBody");
    expect(JSON.stringify(stored)).not.toContain("whatsapp_business_account");
  });

  it("carries the processing lifecycle for retries and observability", async () => {
    const row = await record();

    await prisma.whatsAppWebhookEvent.update({
      where: { id: row.id }, data: { processingStatus: "PROCESSING", attempts: { increment: 1 } },
    });
    expect(rows("WhatsAppWebhookEvent")[0].attempts).toBe(1);

    await prisma.whatsAppWebhookEvent.update({
      where: { id: row.id }, data: { processingStatus: "FAILED", errorMessage: "provider timeout" },
    });
    expect(rows("WhatsAppWebhookEvent")[0]).toMatchObject({
      processingStatus: "FAILED", errorMessage: "provider timeout",
    });

    await prisma.whatsAppWebhookEvent.update({
      where: { id: row.id }, data: { processingStatus: "PROCESSED", processedAt: new Date(), errorMessage: null },
    });
    expect(rows("WhatsAppWebhookEvent")[0].processedAt).toBeTruthy();
  });
});
