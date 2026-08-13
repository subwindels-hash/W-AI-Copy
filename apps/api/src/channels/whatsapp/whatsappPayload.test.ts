/**
 * Webhook payload parsing and signature verification (Phase 1 §18 —
 * "webhook tests: verification, valid/invalid/duplicate/unknown event,
 * bad signature").
 *
 * These are the two functions that stand between an anonymous internet caller
 * and the rest of the channel, so they are tested as pure units with no
 * infrastructure: real HMACs computed with node:crypto, real Meta-shaped
 * envelopes. Nothing here is mocked, because there is nothing to mock — a fake
 * signature check would defeat the purpose of the test.
 */
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  parseWebhookPayload,
  isWhatsAppEnvelope,
  hashPayload,
  type ParsedInboundMessage,
  type ParsedStatusUpdate,
  type ParsedUnknownEvent,
} from "./whatsappPayload.js";
import { verifyWebhookSignature, verifyTokenMatches, normalizePhoneNumber } from "./whatsappClient.js";

const PHONE_ID = "109876543210987";

function envelope(value: Record<string, unknown>, field = "messages") {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA-1", changes: [{ field, value }] }],
  };
}

function textMessage(id: string, body: string) {
  return envelope({
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "15550001111", phone_number_id: PHONE_ID },
    contacts: [{ profile: { name: "Ada" }, wa_id: "2348012345678" }],
    messages: [{
      from: "2348012345678",
      id,
      timestamp: "1760000000",
      type: "text",
      text: { body },
    }],
  });
}

// ─── Envelope recognition ──────────────────────────────────────────────
describe("isWhatsAppEnvelope", () => {
  it("accepts a WhatsApp Business Account envelope", () => {
    expect(isWhatsAppEnvelope(textMessage("wamid.A", "hi"))).toBe(true);
  });

  it("rejects anything else — including a plausible-looking impostor", () => {
    expect(isWhatsAppEnvelope({ object: "page", entry: [] })).toBe(false);
    expect(isWhatsAppEnvelope({ entry: [] })).toBe(false);
    expect(isWhatsAppEnvelope(null)).toBe(false);
    expect(isWhatsAppEnvelope("whatsapp_business_account")).toBe(false);
    expect(isWhatsAppEnvelope([])).toBe(false);
  });
});

// ─── Message parsing ───────────────────────────────────────────────────
describe("parseWebhookPayload — inbound messages", () => {
  it("normalises a text message into a flat event", () => {
    const [event] = parseWebhookPayload(textMessage("wamid.HBg", "Hello WINDELS"));
    expect(event.kind).toBe("message");
    const m = event as ParsedInboundMessage;
    expect(m.messageId).toBe("wamid.HBg");
    expect(m.phoneNumberId).toBe(PHONE_ID);
    expect(m.from).toBe("2348012345678");
    expect(m.profileName).toBe("Ada");
    expect(m.messageType).toBe("text");
    expect(m.text).toBe("Hello WINDELS");
    // WhatsApp sends seconds, we store milliseconds.
    expect(m.timestamp.getTime()).toBe(1_760_000_000_000);
  });

  it("carries several messages in one envelope through as separate events", () => {
    const body = envelope({
      metadata: { phone_number_id: PHONE_ID },
      messages: [
        { from: "2348011111111", id: "wamid.1", timestamp: "1760000000", type: "text", text: { body: "one" } },
        { from: "2348022222222", id: "wamid.2", timestamp: "1760000001", type: "text", text: { body: "two" } },
      ],
    });
    const events = parseWebhookPayload(body);
    expect(events).toHaveLength(2);
    expect(events.map((e) => (e as ParsedInboundMessage).text)).toEqual(["one", "two"]);
  });

  it("extracts the media id and mime type for an image, and the caption as text", () => {
    const body = envelope({
      metadata: { phone_number_id: PHONE_ID },
      messages: [{
        from: "2348012345678", id: "wamid.IMG", timestamp: "1760000000", type: "image",
        image: { id: "media-99", mime_type: "image/jpeg", sha256: "abc", caption: "my receipt" },
      }],
    });
    const m = parseWebhookPayload(body)[0] as ParsedInboundMessage;
    expect(m.messageType).toBe("image");
    expect(m.mediaId).toBe("media-99");
    expect(m.text).toBe("my receipt");
    expect(m.metadata.mimeType).toBe("image/jpeg");
  });

  it("reads the reply text out of an interactive button press", () => {
    const body = envelope({
      metadata: { phone_number_id: PHONE_ID },
      messages: [{
        from: "2348012345678", id: "wamid.BTN", timestamp: "1760000000", type: "interactive",
        interactive: { type: "button_reply", button_reply: { id: "yes", title: "Yes, continue" } },
      }],
    });
    const m = parseWebhookPayload(body)[0] as ParsedInboundMessage;
    expect(m.messageType).toBe("interactive");
    expect(m.text).toBe("Yes, continue");
    expect(m.metadata.interactiveType).toBe("button_reply");
  });

  it("classifies a message type it has never seen as `unknown` rather than dropping it", () => {
    const body = envelope({
      metadata: { phone_number_id: PHONE_ID },
      messages: [{ from: "2348012345678", id: "wamid.NEW", timestamp: "1760000000", type: "hologram" }],
    });
    const events = parseWebhookPayload(body);
    expect(events).toHaveLength(1);
    expect((events[0] as ParsedInboundMessage).messageType).toBe("unknown");
  });

  it("skips a message with no id — it has no idempotency key", () => {
    const body = envelope({
      metadata: { phone_number_id: PHONE_ID },
      messages: [{ from: "2348012345678", timestamp: "1760000000", type: "text", text: { body: "ghost" } }],
    });
    expect(parseWebhookPayload(body)).toHaveLength(0);
  });

  it("never stores raw message bodies in the metadata blob", () => {
    const m = parseWebhookPayload(textMessage("wamid.PRIV", "my bank pin is 1234"))[0] as ParsedInboundMessage;
    expect(JSON.stringify(m.metadata)).not.toContain("1234");
  });
});

// ─── Status parsing ────────────────────────────────────────────────────
describe("parseWebhookPayload — delivery statuses", () => {
  it("gives each status of the same message a distinct event id", () => {
    const build = (status: string) => envelope({
      metadata: { phone_number_id: PHONE_ID },
      statuses: [{ id: "wamid.OUT", status, timestamp: "1760000000", recipient_id: "2348012345678" }],
    });
    const sent = parseWebhookPayload(build("sent"))[0] as ParsedStatusUpdate;
    const delivered = parseWebhookPayload(build("delivered"))[0] as ParsedStatusUpdate;

    expect(sent.kind).toBe("status");
    expect(sent.messageId).toBe("wamid.OUT");
    expect(sent.status).toBe("sent");
    // Same wamid, different lifecycle stage — must not collide on the unique key.
    expect(sent.eventId).not.toBe(delivered.eventId);
  });

  it("surfaces the provider error on a failed status", () => {
    const body = envelope({
      metadata: { phone_number_id: PHONE_ID },
      statuses: [{
        id: "wamid.FAIL", status: "failed", timestamp: "1760000000", recipient_id: "2348012345678",
        errors: [{ code: 131047, title: "Re-engagement message", message: "Outside 24h window" }],
      }],
    });
    const s = parseWebhookPayload(body)[0] as ParsedStatusUpdate;
    expect(s.status).toBe("failed");
    expect(s.errorCode).toBe("131047");
    expect(s.errorMessage).toBeTruthy();
  });
});

// ─── Unknown events ────────────────────────────────────────────────────
describe("parseWebhookPayload — non-message notifications", () => {
  it("keeps an account-update notification as an observable unknown event", () => {
    const body = envelope({ event: "PARTNER_ADDED", ban_info: {} }, "account_update");
    const events = parseWebhookPayload(body);
    expect(events).toHaveLength(1);
    const u = events[0] as ParsedUnknownEvent;
    expect(u.kind).toBe("unknown");
    expect(u.field).toBe("account_update");
    expect(u.eventId).toContain("account_update");
  });

  it("produces a stable event id for the identical notification (idempotency)", () => {
    const body = envelope({ event: "FLAGGED", detail: "quality" }, "phone_number_quality_update");
    const a = parseWebhookPayload(body)[0] as ParsedUnknownEvent;
    const b = parseWebhookPayload(body)[0] as ParsedUnknownEvent;
    expect(a.eventId).toBe(b.eventId);
  });

  it("returns an empty list for an envelope with no changes", () => {
    expect(parseWebhookPayload({ object: "whatsapp_business_account", entry: [] })).toHaveLength(0);
    expect(parseWebhookPayload({})).toHaveLength(0);
  });
});

// ─── Payload hashing ───────────────────────────────────────────────────
describe("hashPayload", () => {
  it("is deterministic and differs for different bytes", () => {
    expect(hashPayload("a")).toBe(hashPayload(Buffer.from("a")));
    expect(hashPayload("a")).not.toBe(hashPayload("b"));
    expect(hashPayload("a")).toHaveLength(64);
  });
});

// ─── Signature verification ────────────────────────────────────────────
describe("verifyWebhookSignature", () => {
  const secret = "app-secret-value";
  const raw = Buffer.from(JSON.stringify(textMessage("wamid.SIG", "signed")));
  const good = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");

  it("accepts a correct signature over the raw bytes", () => {
    expect(verifyWebhookSignature(raw, good, secret).valid).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const bad = "sha256=" + createHmac("sha256", "not-the-secret").update(raw).digest("hex");
    expect(verifyWebhookSignature(raw, bad, secret).valid).toBe(false);
  });

  it("rejects a correct signature over different bytes (tampered body)", () => {
    const tampered = Buffer.from(JSON.stringify(textMessage("wamid.SIG", "tampered")));
    expect(verifyWebhookSignature(tampered, good, secret).valid).toBe(false);
  });

  it("rejects a missing signature header", () => {
    const v = verifyWebhookSignature(raw, undefined, secret);
    expect(v.valid).toBe(false);
    expect(v.reason).toBeTruthy();
  });

  it("rejects a signature without the sha256= prefix", () => {
    const naked = createHmac("sha256", secret).update(raw).digest("hex");
    expect(verifyWebhookSignature(raw, naked, secret).valid).toBe(false);
  });

  it("rejects non-hex signature content instead of throwing", () => {
    expect(verifyWebhookSignature(raw, "sha256=zzzz not hex zzzz", secret).valid).toBe(false);
  });

  it("fails closed when no app secret is configured", () => {
    // A missing secret is a configuration gap, never an implicit "allow".
    expect(verifyWebhookSignature(raw, good, null).valid).toBe(false);
    expect(verifyWebhookSignature(raw, good, "").valid).toBe(false);
  });

  it("fails closed when the raw body was not captured", () => {
    expect(verifyWebhookSignature(undefined, good, secret).valid).toBe(false);
  });
});

// ─── Verify token ──────────────────────────────────────────────────────
describe("verifyTokenMatches", () => {
  it("matches only the exact configured token", () => {
    expect(verifyTokenMatches("s3cr3t", "s3cr3t")).toBe(true);
    expect(verifyTokenMatches("s3cr3T", "s3cr3t")).toBe(false);
    expect(verifyTokenMatches("s3cr3t ", "s3cr3t")).toBe(false);
  });

  it("refuses when no token is configured — an unset secret must not verify", () => {
    expect(verifyTokenMatches("anything", null)).toBe(false);
    expect(verifyTokenMatches("anything", "")).toBe(false);
    expect(verifyTokenMatches("", "")).toBe(false);
  });

  it("does not leak length differences by throwing", () => {
    expect(verifyTokenMatches("short", "a-much-longer-configured-token")).toBe(false);
  });
});

// ─── Phone normalisation ───────────────────────────────────────────────
describe("normalizePhoneNumber", () => {
  it("reduces formatting variants of one number to a single key", () => {
    const variants = ["+234 801 234 5678", "+2348012345678", "234-801-234-5678", "(234) 8012345678"];
    const normalised = new Set(variants.map((v) => normalizePhoneNumber(v)));
    expect(normalised.size).toBe(1);
  });
});
