/**
 * Normalises the WhatsApp Cloud API webhook envelope into flat events.
 *
 * Meta nests everything as entry[] → changes[] → value → {messages|statuses}.
 * A single POST can carry several messages across several phone numbers, so
 * parsing yields a list. Anything unrecognised becomes an `unknown` event
 * rather than being silently dropped — unknown types must be observable.
 */
import { createHash } from "node:crypto";
import type { WhatsAppMessageType } from "@windels/shared";

export interface ParsedInboundMessage {
  kind: "message";
  /** Meta's wamid — the idempotency key. */
  messageId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  from: string;
  waId: string;
  profileName: string | null;
  timestamp: Date;
  messageType: WhatsAppMessageType;
  text: string | null;
  mediaId: string | null;
  /** Envelope-only metadata. Never the full raw payload. */
  metadata: Record<string, unknown>;
}

export interface ParsedStatusUpdate {
  kind: "status";
  /** Composite id: statuses share the wamid, so append the status name. */
  eventId: string;
  messageId: string;
  phoneNumberId: string;
  status: string;
  timestamp: Date;
  recipientId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ParsedUnknownEvent {
  kind: "unknown";
  eventId: string;
  phoneNumberId: string | null;
  field: string;
  timestamp: Date;
}

export type ParsedWhatsAppEvent = ParsedInboundMessage | ParsedStatusUpdate | ParsedUnknownEvent;

/** SHA-256 of the raw payload — stored instead of the payload itself. */
export function hashPayload(raw: Buffer | string): string {
  const buf = typeof raw === "string" ? Buffer.from(raw, "utf8") : raw;
  return createHash("sha256").update(buf).digest("hex");
}

function toDate(ts: unknown): Date {
  const n = typeof ts === "string" ? Number(ts) : typeof ts === "number" ? ts : NaN;
  // WhatsApp sends seconds since epoch.
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000);
  return new Date();
}

const KNOWN_TYPES: readonly string[] = [
  "text", "image", "audio", "video", "document", "location",
  "interactive", "button", "reaction", "sticker", "contacts", "order", "system",
];

function classify(type: unknown): WhatsAppMessageType {
  const t = typeof type === "string" ? type : "";
  return (KNOWN_TYPES.includes(t) ? t : "unknown") as WhatsAppMessageType;
}

/**
 * Pulls the user-visible text out of whichever shape the message uses.
 * Interactive replies and button presses carry their text in different places.
 */
function extractText(msg: any, type: WhatsAppMessageType): string | null {
  switch (type) {
    case "text":
      return typeof msg?.text?.body === "string" ? msg.text.body : null;
    case "interactive": {
      const i = msg?.interactive;
      if (i?.type === "button_reply") return i.button_reply?.title ?? i.button_reply?.id ?? null;
      if (i?.type === "list_reply") return i.list_reply?.title ?? i.list_reply?.id ?? null;
      if (i?.type === "nfm_reply") return i.nfm_reply?.response_json ?? null;
      return null;
    }
    case "button":
      return msg?.button?.text ?? msg?.button?.payload ?? null;
    case "reaction":
      return msg?.reaction?.emoji ?? null;
    case "image":
    case "video":
    case "document":
      return msg?.[type]?.caption ?? null;
    case "location": {
      const l = msg?.location;
      if (!l) return null;
      const label = [l.name, l.address].filter(Boolean).join(", ");
      return label || `${l.latitude}, ${l.longitude}`;
    }
    case "order":
      return msg?.order?.text ?? null;
    case "system":
      return msg?.system?.body ?? null;
    default:
      return null;
  }
}

function extractMediaId(msg: any, type: WhatsAppMessageType): string | null {
  if (["image", "audio", "video", "document", "sticker"].includes(type)) {
    return msg?.[type]?.id ?? null;
  }
  return null;
}

/**
 * Envelope metadata worth keeping for debugging and media handling. Excludes
 * message bodies and anything not needed operationally.
 */
function extractMetadata(msg: any, type: WhatsAppMessageType): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const node = msg?.[type];
  if (node && typeof node === "object") {
    if (node.mime_type) meta.mimeType = node.mime_type;
    if (node.sha256) meta.sha256 = node.sha256;
    if (node.filename) meta.filename = node.filename;
    if (node.voice != null) meta.voice = node.voice;
    if (node.animated != null) meta.animated = node.animated;
  }
  if (msg?.context?.id) meta.replyToMessageId = msg.context.id;
  if (msg?.context?.forwarded != null) meta.forwarded = msg.context.forwarded;
  if (type === "location" && msg?.location) {
    meta.latitude = msg.location.latitude;
    meta.longitude = msg.location.longitude;
  }
  if (type === "reaction" && msg?.reaction?.message_id) meta.reactionTo = msg.reaction.message_id;
  if (type === "interactive" && msg?.interactive?.type) meta.interactiveType = msg.interactive.type;
  if (type === "unknown" && msg?.type) meta.rawType = String(msg.type).slice(0, 64);
  if (msg?.errors?.[0]) {
    meta.errorCode = String(msg.errors[0].code ?? "");
    meta.errorTitle = String(msg.errors[0].title ?? "").slice(0, 200);
  }
  return meta;
}

/** True when the body looks like a WhatsApp Business Account webhook. */
export function isWhatsAppEnvelope(body: unknown): boolean {
  return Boolean(body && typeof body === "object" && (body as any).object === "whatsapp_business_account");
}

export function parseWebhookPayload(body: any): ParsedWhatsAppEvent[] {
  const events: ParsedWhatsAppEvent[] = [];
  const entries = Array.isArray(body?.entry) ? body.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const field = typeof change?.field === "string" ? change.field : "unknown";
      const value = change?.value ?? {};
      const phoneNumberId: string | null = value?.metadata?.phone_number_id ?? null;
      const displayPhoneNumber: string | null = value?.metadata?.display_phone_number ?? null;

      // Non-message notifications (account updates, template status, ...).
      if (field !== "messages") {
        events.push({
          kind: "unknown",
          eventId: `${entry?.id ?? "entry"}:${field}:${hashPayload(JSON.stringify(value)).slice(0, 16)}`,
          phoneNumberId,
          field,
          timestamp: new Date(),
        });
        continue;
      }

      // Profile names arrive in a parallel array keyed by wa_id.
      const contactsByWaId = new Map<string, string>();
      for (const c of Array.isArray(value?.contacts) ? value.contacts : []) {
        if (c?.wa_id) contactsByWaId.set(String(c.wa_id), c?.profile?.name ?? "");
      }

      for (const msg of Array.isArray(value?.messages) ? value.messages : []) {
        if (!msg?.id || !phoneNumberId) continue;
        const type = classify(msg.type);
        const from = String(msg.from ?? "");
        events.push({
          kind: "message",
          messageId: String(msg.id),
          phoneNumberId,
          displayPhoneNumber,
          from,
          waId: from,
          profileName: contactsByWaId.get(from) || null,
          timestamp: toDate(msg.timestamp),
          messageType: type,
          text: extractText(msg, type),
          mediaId: extractMediaId(msg, type),
          metadata: extractMetadata(msg, type),
        });
      }

      for (const st of Array.isArray(value?.statuses) ? value.statuses : []) {
        if (!st?.id || !phoneNumberId) continue;
        const status = String(st.status ?? "unknown");
        events.push({
          kind: "status",
          eventId: `${st.id}:${status}`,
          messageId: String(st.id),
          phoneNumberId,
          status,
          timestamp: toDate(st.timestamp),
          recipientId: st.recipient_id ? String(st.recipient_id) : null,
          errorCode: st.errors?.[0]?.code != null ? String(st.errors[0].code) : null,
          errorMessage: st.errors?.[0]?.title ? String(st.errors[0].title).slice(0, 300) : null,
        });
      }
    }
  }

  return events;
}
