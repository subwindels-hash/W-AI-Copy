import { z } from "zod";

/**
 * Shared NFC/NDEF contracts.
 *
 * NFC hardware is deliberately described by observed capabilities instead of a
 * broad "supported" boolean. A reader/tag pair is write-capable only after the
 * deployed stack has been qualified with real hardware.
 */
export const NFC_RECORD_KINDS = [
  "url", "text", "vcard", "email", "telephone", "sms", "wifi",
  "deep_link", "social_profile", "business_profile", "digital_business_card",
  "windels_profile", "marketplace_profile", "product_profile", "custom_uri", "custom",
] as const;
export type NfcRecordKind = typeof NFC_RECORD_KINDS[number];

export const NfcRecordInputSchema = z.object({
  kind: z.enum(NFC_RECORD_KINDS),
  value: z.string().max(16_384).optional(),
  label: z.string().max(120).optional(),
  language: z.string().regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/).default("en"),
  mediaType: z.string().max(255).optional(),
  tnf: z.number().int().min(0).max(7).optional(),
  type: z.string().max(255).optional(),
  payloadBase64: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/).max(24_000).optional(),
  metadata: z.record(z.unknown()).optional(),
}).superRefine((record, ctx) => {
  if (record.kind === "custom") {
    if (record.tnf === undefined || !record.type || record.payloadBase64 === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Custom records require TNF, type, and a base64 payload" });
    }
    return;
  }
  if (!record.value?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${record.kind} records require a value` });
  }
});
export type NfcRecordInput = z.infer<typeof NfcRecordInputSchema>;

export const NfcRecordListSchema = z.array(NfcRecordInputSchema).min(1).max(16);

export const NfcCapabilitySchema = z.object({
  canRead: z.boolean(),
  canWrite: z.boolean(),
  canErase: z.boolean(),
  canLock: z.boolean(),
  canProtect: z.boolean(),
  ndef: z.boolean(),
  memoryBytes: z.number().int().nonnegative().nullable(),
  writableBytes: z.number().int().nonnegative().nullable(),
  lockStatus: z.enum(["UNLOCKED", "LOCKED", "PARTIALLY_LOCKED", "UNKNOWN"]),
  supportStatus: z.enum(["SUPPORTED", "PARTIALLY_SUPPORTED", "READ_ONLY", "WRITE_SUPPORTED", "UNSUPPORTED", "UNVERIFIED"]),
  qualification: z.enum(["QUALIFIED", "NOT_QUALIFIED", "NOT_REQUIRED"]),
  source: z.enum(["PCSC_CC", "PCSC_GET_VERSION", "WEB_NFC", "MOBILE_NATIVE", "READER_SDK", "UNKNOWN"]),
});
export type NfcCapability = z.infer<typeof NfcCapabilitySchema>;

export interface DecodedNdefRecord {
  tnf: number;
  type: string;
  id?: string;
  payloadBase64: string;
  kind: NfcRecordKind;
  value?: string;
  language?: string;
  mediaType?: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: false });

function concat(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function decodeBase64(value: string): Uint8Array {
  const NodeBuffer = (globalThis as any).Buffer;
  if (NodeBuffer) return new Uint8Array(NodeBuffer.from(value, "base64"));
  const raw = atob(value);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function encodeBase64(value: Uint8Array): string {
  const NodeBuffer = (globalThis as any).Buffer;
  if (NodeBuffer) return NodeBuffer.from(value).toString("base64");
  let raw = "";
  for (const byte of value) raw += String.fromCharCode(byte);
  return btoa(raw);
}

const URI_PREFIXES = [
  "", "http://www.", "https://www.", "http://", "https://", "tel:", "mailto:",
  "ftp://anonymous:anonymous@", "ftp://ftp.", "ftps://", "sftp://", "smb://", "nfs://",
  "ftp://", "dav://", "news:", "telnet://", "imap:", "rtsp://", "urn:", "pop:",
  "sip:", "sips:", "tftp:", "btspp://", "btl2cap://", "btgoep://", "tcpobex://",
  "irdaobex://", "file://", "urn:epc:id:", "urn:epc:tag:", "urn:epc:pat:",
  "urn:epc:raw:", "urn:epc:", "urn:nfc:",
] as const;

function uriPayload(uri: string): Uint8Array {
  let prefix = 0;
  for (let i = 1; i < URI_PREFIXES.length; i += 1) {
    if (uri.startsWith(URI_PREFIXES[i]!) && URI_PREFIXES[i]!.length > URI_PREFIXES[prefix]!.length) prefix = i;
  }
  return concat(Uint8Array.of(prefix), encoder.encode(uri.slice(URI_PREFIXES[prefix]!.length)));
}

function normalizeUri(record: NfcRecordInput): string {
  const value = record.value!.trim();
  switch (record.kind) {
    case "email": return value.startsWith("mailto:") ? value : `mailto:${value}`;
    case "telephone": return value.startsWith("tel:") ? value : `tel:${value}`;
    case "sms": return value.startsWith("sms:") || value.startsWith("smsto:") ? value : `sms:${value}`;
    case "url":
    case "social_profile":
    case "business_profile":
    case "digital_business_card":
    case "windels_profile":
    case "marketplace_profile":
    case "product_profile":
      if (!/^https?:\/\//i.test(value)) throw new Error(`${record.kind} must use an http or https URL`);
      return value;
    case "deep_link":
    case "custom_uri":
      if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) throw new Error(`${record.kind} must include a URI scheme`);
      return value;
    default: return value;
  }
}

function tlvAttribute(id: number, value: Uint8Array): Uint8Array {
  return concat(Uint8Array.of((id >>> 8) & 0xff, id & 0xff, (value.length >>> 8) & 0xff, value.length & 0xff), value);
}

/** Encode a standards-based Wi-Fi Simple Configuration credential payload. */
function wifiPayload(record: NfcRecordInput): Uint8Array {
  const metadata = record.metadata ?? {};
  const ssid = String(metadata.ssid ?? record.value ?? "");
  const password = String(metadata.password ?? "");
  const authMap: Record<string, number> = { OPEN: 0x0001, WPA_PERSONAL: 0x0002, SHARED: 0x0004, WPA_ENTERPRISE: 0x0008, WPA2_ENTERPRISE: 0x0010, WPA2_PERSONAL: 0x0020 };
  const encMap: Record<string, number> = { NONE: 0x0001, WEP: 0x0002, TKIP: 0x0004, AES: 0x0008 };
  const auth = authMap[String(metadata.authentication ?? (password ? "WPA2_PERSONAL" : "OPEN"))] ?? 0x0020;
  const encryption = encMap[String(metadata.encryption ?? (password ? "AES" : "NONE"))] ?? 0x0008;
  const u16 = (n: number) => Uint8Array.of((n >>> 8) & 0xff, n & 0xff);
  const credential = concat(
    tlvAttribute(0x1026, Uint8Array.of(1)),
    tlvAttribute(0x1045, encoder.encode(ssid)),
    tlvAttribute(0x1003, u16(auth)),
    tlvAttribute(0x100f, u16(encryption)),
    tlvAttribute(0x1027, encoder.encode(password)),
    tlvAttribute(0x1020, Uint8Array.of(0xff, 0xff, 0xff, 0xff, 0xff, 0xff)),
  );
  return tlvAttribute(0x100e, credential);
}

interface BinaryRecord { tnf: number; type: Uint8Array; id?: Uint8Array; payload: Uint8Array }

function toBinaryRecord(record: NfcRecordInput): BinaryRecord {
  if (record.kind === "custom") {
    return { tnf: record.tnf!, type: encoder.encode(record.type!), payload: decodeBase64(record.payloadBase64!) };
  }
  if (record.kind === "text") {
    const language = encoder.encode(record.language || "en");
    if (language.length > 63) throw new Error("NDEF text language code is too long");
    return { tnf: 1, type: encoder.encode("T"), payload: concat(Uint8Array.of(language.length), language, encoder.encode(record.value!)) };
  }
  if (record.kind === "vcard") {
    return { tnf: 2, type: encoder.encode("text/vcard"), payload: encoder.encode(record.value!) };
  }
  if (record.kind === "wifi") {
    return { tnf: 2, type: encoder.encode("application/vnd.wfa.wsc"), payload: wifiPayload(record) };
  }
  return { tnf: 1, type: encoder.encode("U"), payload: uriPayload(normalizeUri(record)) };
}

/** Encode one complete NDEF message (MB/ME set, no chunked records). */
export function encodeNdefMessage(input: NfcRecordInput[]): Uint8Array {
  const parsed = NfcRecordListSchema.parse(input);
  const records = parsed.map(toBinaryRecord);
  return concat(...records.map((record, index) => {
    const short = record.payload.length < 256;
    const hasId = !!record.id?.length;
    const header = (index === 0 ? 0x80 : 0) | (index === records.length - 1 ? 0x40 : 0) | (short ? 0x10 : 0) | (hasId ? 0x08 : 0) | record.tnf;
    const payloadLength = short
      ? Uint8Array.of(record.payload.length)
      : Uint8Array.of((record.payload.length >>> 24) & 0xff, (record.payload.length >>> 16) & 0xff, (record.payload.length >>> 8) & 0xff, record.payload.length & 0xff);
    return concat(Uint8Array.of(header, record.type.length), payloadLength, hasId ? Uint8Array.of(record.id!.length) : new Uint8Array(), record.type, record.id ?? new Uint8Array(), record.payload);
  }));
}

export function type2TlvSize(ndefLength: number): number {
  return 1 + (ndefLength < 0xff ? 1 : 3) + ndefLength + 1;
}

export function wrapType2Ndef(message: Uint8Array): Uint8Array {
  const length = message.length < 0xff
    ? Uint8Array.of(message.length)
    : Uint8Array.of(0xff, (message.length >>> 8) & 0xff, message.length & 0xff);
  return concat(Uint8Array.of(0x03), length, message, Uint8Array.of(0xfe));
}

/** Extract the first NDEF TLV from NFC Forum Type 2 user memory. */
export function unwrapType2Ndef(memory: Uint8Array): Uint8Array {
  let offset = 0;
  while (offset < memory.length) {
    const type = memory[offset++]!;
    if (type === 0x00) continue;
    if (type === 0xfe) return new Uint8Array();
    let length = memory[offset++] ?? 0;
    if (length === 0xff) {
      if (offset + 2 > memory.length) throw new Error("Truncated Type 2 extended TLV length");
      length = (memory[offset++]! << 8) | memory[offset++]!;
    }
    if (offset + length > memory.length) throw new Error("NDEF TLV exceeds readable tag memory");
    if (type === 0x03) return memory.slice(offset, offset + length);
    offset += length;
  }
  return new Uint8Array();
}

function inferDecoded(tnf: number, type: string, payload: Uint8Array): Pick<DecodedNdefRecord, "kind" | "value" | "language" | "mediaType"> {
  if (tnf === 1 && type === "U" && payload.length) {
    const uri = `${URI_PREFIXES[payload[0]!] ?? ""}${decoder.decode(payload.slice(1))}`;
    if (uri.startsWith("mailto:")) return { kind: "email", value: uri.slice(7) };
    if (uri.startsWith("tel:")) return { kind: "telephone", value: uri.slice(4) };
    if (uri.startsWith("sms:") || uri.startsWith("smsto:")) return { kind: "sms", value: uri };
    return { kind: /^https?:/i.test(uri) ? "url" : "custom_uri", value: uri };
  }
  if (tnf === 1 && type === "T" && payload.length) {
    const status = payload[0]!;
    const languageLength = status & 0x3f;
    const utf16 = (status & 0x80) !== 0;
    const language = decoder.decode(payload.slice(1, 1 + languageLength));
    const textBytes = payload.slice(1 + languageLength);
    const value = utf16 ? new TextDecoder("utf-16").decode(textBytes) : decoder.decode(textBytes);
    return { kind: "text", value, language };
  }
  if (tnf === 2 && type.toLowerCase() === "text/vcard") return { kind: "vcard", value: decoder.decode(payload), mediaType: type };
  if (tnf === 2 && type === "application/vnd.wfa.wsc") return { kind: "wifi", value: "Wi-Fi credential (protected display)", mediaType: type };
  return { kind: "custom", mediaType: tnf === 2 ? type : undefined };
}

/** Strict NDEF parser. Chunked records are rejected rather than guessed at. */
export function decodeNdefMessage(message: Uint8Array): DecodedNdefRecord[] {
  if (!message.length) return [];
  const result: DecodedNdefRecord[] = [];
  let offset = 0;
  let index = 0;
  let sawMessageEnd = false;
  while (offset < message.length) {
    const header = message[offset++]!;
    const mb = !!(header & 0x80);
    const me = !!(header & 0x40);
    const cf = !!(header & 0x20);
    const sr = !!(header & 0x10);
    const il = !!(header & 0x08);
    const tnf = header & 0x07;
    if ((index === 0 && !mb) || (index > 0 && mb)) throw new Error("Invalid NDEF message-begin flag");
    if (cf) throw new Error("Chunked NDEF records are not supported by this parser");
    const typeLength = message[offset++];
    if (typeLength === undefined) throw new Error("Truncated NDEF type length");
    let payloadLength = 0;
    if (sr) {
      const length = message[offset++];
      if (length === undefined) throw new Error("Truncated NDEF payload length");
      payloadLength = length;
    } else {
      if (offset + 4 > message.length) throw new Error("Truncated NDEF payload length");
      payloadLength = (message[offset]! * 0x1000000) + (message[offset + 1]! << 16) + (message[offset + 2]! << 8) + message[offset + 3]!;
      offset += 4;
    }
    const idLength = il ? message[offset++] : 0;
    if (idLength === undefined || offset + typeLength + idLength + payloadLength > message.length) throw new Error("NDEF record exceeds message bounds");
    const type = decoder.decode(message.slice(offset, offset + typeLength)); offset += typeLength;
    const idBytes = message.slice(offset, offset + idLength); offset += idLength;
    const payload = message.slice(offset, offset + payloadLength); offset += payloadLength;
    result.push({ tnf, type, ...(idLength ? { id: decoder.decode(idBytes) } : {}), payloadBase64: encodeBase64(payload), ...inferDecoded(tnf, type, payload) });
    index += 1;
    if (me) { sawMessageEnd = true; break; }
  }
  if (!sawMessageEnd || offset !== message.length) throw new Error("Invalid NDEF message-end boundary");
  return result;
}

export const NFC_TEMPLATES: Array<{ id: string; name: string; description: string; records: NfcRecordInput[] }> = [
  { id: "personal-digital-card", name: "Personal Digital Card", description: "A secure WINDELS profile URL that remains updateable without rewriting the tag.", records: [{ kind: "windels_profile", value: "https://app.windels.ai/profile/me", language: "en" }] },
  { id: "business-card", name: "Business Card", description: "A digital business profile URL with QR fallback.", records: [{ kind: "digital_business_card", value: "https://app.windels.ai/profile/business", language: "en" }] },
  { id: "company-profile", name: "Company Profile", description: "Open a company profile managed by WINDELS Identity.", records: [{ kind: "business_profile", value: "https://app.windels.ai/business/company", language: "en" }] },
  { id: "vendor-profile", name: "Vendor Profile", description: "Open an authorized WINDELS Marketplace vendor profile.", records: [{ kind: "marketplace_profile", value: "https://app.windels.ai/marketplace/vendor", language: "en" }] },
  { id: "product-card", name: "Product Card", description: "Open current product information or authenticity details.", records: [{ kind: "product_profile", value: "https://app.windels.ai/marketplace/product", language: "en" }] },
  { id: "event-card", name: "Event Card", description: "Open an event page or approved access URL.", records: [{ kind: "url", value: "https://app.windels.ai/events", language: "en" }] },
  { id: "social-profile", name: "Social Profile", description: "Share one social destination.", records: [{ kind: "social_profile", value: "https://app.windels.ai/profile/social", language: "en" }] },
  { id: "website-card", name: "Website Card", description: "Open a website using a compact URI record.", records: [{ kind: "url", value: "https://windels.ai", language: "en" }] },
  { id: "contact-card", name: "Contact Card", description: "Store a vCard directly; review personal data before writing.", records: [{ kind: "vcard", value: "BEGIN:VCARD\nVERSION:3.0\nFN:Your Name\nEND:VCARD", language: "en" }] },
  { id: "windels-profile", name: "WINDELS Profile", description: "Recommended: store only a secure profile URL or identifier.", records: [{ kind: "windels_profile", value: "https://app.windels.ai/profile/me", language: "en" }] },
];
