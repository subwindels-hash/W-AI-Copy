/**
 * Outbound messaging (Phase 1 §18 — "outgoing text, failed delivery, retry,
 * dedupe" and §15 status tracking).
 *
 * Only the HTTP call into the Graph API is stubbed. Persistence, retry policy,
 * status transitions and the configuration-required path all run for real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeRedis } from "./testUtils/fakeRedis.js";
import { createWaPrisma } from "./testUtils/waPrisma.js";

const redis = new FakeRedis();
const wa = createWaPrisma();
const db = wa.db;

const sendTextApi = vi.fn();
const sendMediaApi = vi.fn();
const sendInteractiveApi = vi.fn();
const markReadApi = vi.fn();

vi.mock("../../db/redis.js", () => ({ redisCmd: redis, redis, redisSub: redis }));
vi.mock("../../db/client.js", () => ({ prisma: wa.prisma }));

// The client module is mocked only at its network boundary; WhatsAppApiError
// and the helpers keep their real implementations.
vi.mock("./whatsappClient.js", async (importActual) => {
  const actual = await importActual<typeof import("./whatsappClient.js")>();
  return {
    ...actual,
    WhatsAppClient: {
      sendText: sendTextApi,
      sendMedia: sendMediaApi,
      sendInteractive: sendInteractiveApi,
      markRead: markReadApi,
      checkConnection: vi.fn(),
    },
  };
});

const { WhatsAppMessageService, splitForWhatsApp, WHATSAPP_TEXT_LIMIT } =
  await import("./whatsappMessage.service.js");
const { WhatsAppApiError } = await import("./whatsappClient.js");

const ORG = "org-alpha";
const CHANNEL_ID = "chan-1";
const CONVO_ID = "wa-convo-1";
const TO = "2348012345678";

function channel(over: Record<string, unknown> = {}) {
  return {
    id: CHANNEL_ID,
    organizationId: ORG,
    name: "Support",
    phoneNumberId: "109876543210987",
    businessAccountId: "WABA-1",
    enabled: true,
    apiVersion: "v21.0",
    accessTokenEnc: "token",
    appSecretEnc: "secret",
    verifyTokenEnc: "verify",
    settings: {},
    status: "CONNECTED", webhookStatus: "VERIFIED",
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    ...over,
  };
}

function seedChannelRow(over: Record<string, unknown> = {}) {
  const row = channel(over);
  db.seed("WhatsAppChannel", [row]);
  return row;
}

const messages = () => db.tables.get("WhatsAppMessage") ?? [];

beforeEach(() => {
  wa.reset();
  redis.reset();
  vi.clearAllMocks();
  sendTextApi.mockResolvedValue({ messageId: "wamid.SENT1" });
  sendMediaApi.mockResolvedValue({ messageId: "wamid.MEDIA1" });
  sendInteractiveApi.mockResolvedValue({ messageId: "wamid.INT1" });
});

// ─── Sending ───────────────────────────────────────────────────────────
describe("sending", () => {
  it("persists the message before calling the API and records the result", async () => {
    const row = seedChannelRow();
    const out = await WhatsAppMessageService.sendText(row, TO, "hello", { conversationId: CONVO_ID });

    expect(out.ok).toBe(true);
    expect(out.messageId).toBe("wamid.SENT1");

    const stored = messages();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      organizationId: ORG,
      conversationId: CONVO_ID,
      direction: "OUTBOUND",
      messageType: "TEXT",
      status: "SENT",
      whatsappMessageId: "wamid.SENT1",
    });
    expect(stored[0].sentAt).toBeTruthy();
  });

  it("links the outbound row back to the WINDELS message it renders", async () => {
    const row = seedChannelRow();
    await WhatsAppMessageService.sendText(row, TO, "hi", {
      conversationId: CONVO_ID, windelsMessageId: "msg-42",
    });
    expect(messages()[0].windelsMessageId).toBe("msg-42");
  });

  it("sends media and interactive payloads through the same path", async () => {
    const row = seedChannelRow();

    const media = await WhatsAppMessageService.sendMedia(
      row, TO, "image", { id: "media-1", caption: "a chart" }, { conversationId: CONVO_ID },
    );
    const interactive = await WhatsAppMessageService.sendInteractive(
      row, TO, { type: "button", body: { text: "pick" } }, { conversationId: CONVO_ID },
    );

    expect(media.ok).toBe(true);
    expect(interactive.ok).toBe(true);
    expect(sendMediaApi).toHaveBeenCalledWith(expect.anything(), TO, "image", { id: "media-1", caption: "a chart" });

    const stored = messages();
    expect(stored.map((m) => m.messageType)).toEqual(["IMAGE", "INTERACTIVE"]);
    // The caption is retained as the searchable text of a media message.
    expect(stored[0].text).toBe("a chart");
    expect(stored[0].mediaId).toBe("media-1");
  });

  it("splits an over-long answer into chunks instead of truncating it", () => {
    const long = ("Paragraph one is here. ".repeat(200) + "\n\n") + "Paragraph two.".repeat(200);
    const parts = splitForWhatsApp(long);

    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= WHATSAPP_TEXT_LIMIT)).toBe(true);
    // Nothing is lost: every word survives the split.
    const rejoined = parts.join(" ").replace(/\s+/g, " ").trim();
    expect(rejoined.length).toBeGreaterThanOrEqual(long.replace(/\s+/g, " ").trim().length - parts.length);
  });

  it("sends every chunk of a long body and records each one", async () => {
    const row = seedChannelRow();
    const long = "x".repeat(WHATSAPP_TEXT_LIMIT + 500);

    const out = await WhatsAppMessageService.sendText(row, TO, long, { conversationId: CONVO_ID });

    expect(out.ok).toBe(true);
    expect(sendTextApi).toHaveBeenCalledTimes(2);
    expect(messages()).toHaveLength(2);
  });

  it("stops sending remaining chunks once one fails", async () => {
    const row = seedChannelRow();
    sendTextApi.mockRejectedValue(new WhatsAppApiError({ code: "WHATSAPP_REJECTED", message: "nope", retryable: false }));

    const out = await WhatsAppMessageService.sendText(row, TO, "y".repeat(WHATSAPP_TEXT_LIMIT + 500), {
      conversationId: CONVO_ID,
    });

    expect(out.ok).toBe(false);
    expect(sendTextApi).toHaveBeenCalledTimes(1);
  });
});

// ─── Failure and retry ─────────────────────────────────────────────────
describe("failure handling and retry", () => {
  it("retries a retryable error and succeeds", async () => {
    const row = seedChannelRow();
    sendTextApi
      .mockRejectedValueOnce(new WhatsAppApiError({ code: "WHATSAPP_RATE_LIMITED", message: "slow down", retryable: true }))
      .mockResolvedValueOnce({ messageId: "wamid.RETRY_OK" });

    const out = await WhatsAppMessageService.sendText(row, TO, "hello", { conversationId: CONVO_ID });

    expect(sendTextApi).toHaveBeenCalledTimes(2);
    expect(out.ok).toBe(true);
    expect(messages()[0].status).toBe("SENT");
  });

  it("does not retry an authentication failure", async () => {
    const row = seedChannelRow();
    sendTextApi.mockRejectedValue(new WhatsAppApiError({ code: "WHATSAPP_UNAUTHORIZED", message: "bad token", retryable: false }));

    const out = await WhatsAppMessageService.sendText(row, TO, "hello", { conversationId: CONVO_ID });

    expect(sendTextApi).toHaveBeenCalledTimes(1);
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe("WHATSAPP_UNAUTHORIZED");
  });

  it("gives up after the attempt budget and marks the message FAILED", async () => {
    const row = seedChannelRow();
    sendTextApi.mockRejectedValue(new WhatsAppApiError({ code: "WHATSAPP_UNAVAILABLE", message: "503", retryable: true }));

    const out = await WhatsAppMessageService.sendText(row, TO, "hello", {
      conversationId: CONVO_ID, maxAttempts: 2,
    });

    expect(sendTextApi).toHaveBeenCalledTimes(2);
    expect(out.ok).toBe(false);
    const stored = messages()[0];
    expect(stored.status).toBe("FAILED");
    expect(stored.errorCode).toBe("WHATSAPP_UNAVAILABLE");
    // The operator sees it on the channel too.
    expect((db.tables.get("WhatsAppChannel") ?? [])[0].lastError).toContain("WHATSAPP_UNAVAILABLE");
  });

  it("refuses to send without credentials and says so honestly", async () => {
    const row = seedChannelRow({ accessTokenEnc: null });

    const out = await WhatsAppMessageService.sendText(row, TO, "hello", { conversationId: CONVO_ID });

    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe("WHATSAPP_CONFIGURATION_REQUIRED");
    expect(out.error?.retryable).toBe(false);
    // No API call was attempted, and nothing was faked as delivered.
    expect(sendTextApi).not.toHaveBeenCalled();
    expect(messages()[0].status).toBe("FAILED");
  });

  it("refuses to send on a disabled channel", async () => {
    const row = seedChannelRow({ enabled: false });
    const out = await WhatsAppMessageService.sendText(row, TO, "hello", { conversationId: CONVO_ID });

    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe("WHATSAPP_CHANNEL_DISABLED");
    expect(sendTextApi).not.toHaveBeenCalled();
  });

  it("wraps an unexpected transport error rather than throwing", async () => {
    const row = seedChannelRow();
    sendTextApi.mockRejectedValue(new Error("socket hang up"));

    const out = await WhatsAppMessageService.sendText(row, TO, "hello", { conversationId: CONVO_ID });
    expect(out.ok).toBe(false);
    expect(out.error?.message).toContain("socket hang up");
  });
});

// ─── Delivery status ───────────────────────────────────────────────────
describe("delivery status tracking", () => {
  function seedOutbound(status = "SENT") {
    db.seed("WhatsAppMessage", [{
      id: "msg-1", organizationId: ORG, conversationId: CONVO_ID,
      whatsappMessageId: "wamid.TRACK", direction: "OUTBOUND", messageType: "TEXT",
      text: "hi", status, metadata: {}, createdAt: new Date(), updatedAt: new Date(),
    }]);
  }

  const update = (status: string, extra: Record<string, unknown> = {}) =>
    WhatsAppMessageService.applyStatusUpdate({
      whatsappMessageId: "wamid.TRACK", status, timestamp: new Date("2026-03-02T12:00:00Z"),
      errorCode: null, errorMessage: null, ...extra,
    });

  it("advances a message through sent → delivered → read", async () => {
    seedOutbound();
    expect(await update("delivered")).toBe(true);
    expect(messages()[0].status).toBe("DELIVERED");
    expect(messages()[0].deliveredAt).toBeTruthy();

    expect(await update("read")).toBe(true);
    expect(messages()[0].status).toBe("READ");
    expect(messages()[0].readAt).toBeTruthy();
  });

  it("never regresses a status when webhooks arrive out of order", async () => {
    seedOutbound("READ");
    expect(await update("delivered")).toBe(false);
    expect(messages()[0].status).toBe("READ");
  });

  it("always accepts a failure, even after delivery", async () => {
    seedOutbound("DELIVERED");
    const applied = await WhatsAppMessageService.applyStatusUpdate({
      whatsappMessageId: "wamid.TRACK", status: "failed", timestamp: new Date(),
      errorCode: "131047", errorMessage: "re-engagement required",
    });

    expect(applied).toBe(true);
    expect(messages()[0]).toMatchObject({ status: "FAILED", errorCode: "131047" });
  });

  it("ignores a status for a message it never sent", async () => {
    expect(await update("delivered")).toBe(false);
  });

  it("ignores an unrecognised status value", async () => {
    seedOutbound();
    expect(await update("teleported")).toBe(false);
    expect(messages()[0].status).toBe("SENT");
  });
});

// ─── Read receipts ─────────────────────────────────────────────────────
describe("read receipts", () => {
  it("marks an inbound message read", async () => {
    const row = seedChannelRow();
    await WhatsAppMessageService.markRead(row, "wamid.IN");
    expect(markReadApi).toHaveBeenCalledWith(expect.anything(), "wamid.IN");
  });

  it("stays silent when unconfigured instead of failing the caller", async () => {
    const row = seedChannelRow({ accessTokenEnc: null });
    await expect(WhatsAppMessageService.markRead(row, "wamid.IN")).resolves.toBeUndefined();
    expect(markReadApi).not.toHaveBeenCalled();
  });

  it("swallows an API failure — a read receipt must never break a flow", async () => {
    const row = seedChannelRow();
    markReadApi.mockRejectedValue(new Error("boom"));
    await expect(WhatsAppMessageService.markRead(row, "wamid.IN")).resolves.toBeUndefined();
  });
});
