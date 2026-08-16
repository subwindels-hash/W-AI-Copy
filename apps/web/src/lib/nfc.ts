import { api } from "./api";
import {
  encodeBase64,
  encodeNdefMessage,
  type NfcRecordInput,
} from "@windels/shared/nfc";
import type {
  DesktopNfcCardObservation,
  DesktopNfcHardwareResult,
  DesktopNfcReader,
  DesktopNfcState,
} from "@windels/shared/desktop";

export interface NfcStoredRecord {
  id: string;
  position: number;
  kind: string;
  tnf: number;
  recordType: string;
  payload: { kind?: string; value?: string; language?: string; mediaType?: string; payloadBase64?: string; unavailable?: boolean };
  payloadHash: string;
  sizeBytes: number;
}

export interface NfcCard {
  id: string;
  readerId: string | null;
  profileId: string | null;
  name: string;
  uidMasked: string | null;
  technology: string;
  supportStatus: "SUPPORTED" | "PARTIALLY_SUPPORTED" | "READ_ONLY" | "WRITE_SUPPORTED" | "UNSUPPORTED" | "UNVERIFIED";
  memoryBytes: number | null;
  writableBytes: number | null;
  ndefSupported: boolean;
  readable: boolean;
  writable: boolean;
  erasable: boolean;
  lockable: boolean;
  protectable: boolean;
  lockStatus: "UNLOCKED" | "LOCKED" | "PARTIALLY_LOCKED" | "UNKNOWN";
  capabilitySource: string;
  qualification: "QUALIFIED" | "NOT_QUALIFIED";
  ndefHash: string | null;
  status: string;
  lastDetectedAt: string | null;
  lastReadAt: string | null;
  lastWrittenAt: string | null;
  createdAt: string;
  updatedAt: string;
  records: NfcStoredRecord[];
  profile?: NfcProfile | null;
}

export interface NfcReaderRow {
  id: string;
  name: string;
  vendor: string | null;
  product: string | null;
  interfaceType: string;
  status: string;
  capabilities: Record<string, unknown>;
  qualifiedCombinations: Array<{ technology: string; operations: string[]; testedAt: string; hardwareTestRunId: string }>;
  bridgeVersion: string | null;
  platform: string | null;
  lastSeenAt: string | null;
  lastError: string | null;
}

export interface NfcOperation {
  id: string;
  cardId: string | null;
  readerId: string | null;
  operationType: string;
  status: string;
  requestedRecords: NfcRecordInput[];
  expectedNdefHash: string | null;
  previousNdefHash: string | null;
  readbackNdefHash: string | null;
  requiredBytes: number | null;
  availableBytes: number | null;
  result: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  card?: Pick<NfcCard, "id" | "name" | "technology" | "uidMasked">;
  reader?: Pick<NfcReaderRow, "id" | "name" | "interfaceType">;
}

export interface NfcProfile {
  id: string;
  name: string;
  profileType: string;
  targetType: string;
  targetId: string | null;
  secureUrl: string;
  metadata: Record<string, unknown>;
  active: boolean;
}

export interface NfcTemplate {
  id: string;
  name: string;
  description: string;
  records: NfcRecordInput[];
}

export interface NfcPreparedMutation {
  operation: NfcOperation;
  operationToken: string;
  duplicate: boolean;
  writePlan?: {
    operationId: string;
    operationType: "WRITE" | "UPDATE" | "ERASE" | "LOCK" | "PROTECT";
    records: NfcRecordInput[];
    ndefMessageBase64: string;
    expectedNdefHash: string;
    previousNdefHash: string | null;
    requiredBytes: number;
    availableBytes: number;
    expiresAt: string;
  };
}

export interface ReaderReport {
  localId: string;
  name: string;
  vendor?: string;
  product?: string;
  interfaceType: "PCSC" | "WEB_NFC" | "ANDROID_NATIVE" | "IOS_CORE_NFC" | "READER_SDK";
  bridgeVersion?: string;
  platform?: string;
  status: "ONLINE" | "OFFLINE" | "ERROR";
  capabilities?: Record<string, unknown>;
  error?: string;
}

export interface LocalCardObservation {
  reader: ReaderReport;
  hardwareCardKey: string;
  uid?: string;
  technology?: string;
  identificationConfidence: "PROTOCOL_VERIFIED" | "SDK_VERIFIED" | "ATR_FAMILY_ONLY" | "UNKNOWN";
  capabilities: {
    canRead: boolean; canWrite: boolean; canErase: boolean; canLock: boolean; canProtect: boolean; ndef: boolean;
    memoryBytes: number | null; writableBytes: number | null;
    lockStatus: "UNLOCKED" | "LOCKED" | "PARTIALLY_LOCKED" | "UNKNOWN";
    supportStatus: "SUPPORTED" | "PARTIALLY_SUPPORTED" | "READ_ONLY" | "WRITE_SUPPORTED" | "UNSUPPORTED" | "UNVERIFIED";
    qualification: "QUALIFIED" | "NOT_QUALIFIED" | "NOT_REQUIRED";
    source: "PCSC_CC" | "PCSC_GET_VERSION" | "WEB_NFC" | "MOBILE_NATIVE" | "READER_SDK" | "UNKNOWN";
  };
  ndefMessageBase64?: string;
  hardwareEvidence?: Record<string, unknown>;
}

export const nfcApi = {
  readers: () => api.get<NfcReaderRow[]>("/nfc/readers"),
  reportReader: (reader: ReaderReport) => api.post<NfcReaderRow>("/nfc/readers/report", reader),
  cards: () => api.get<NfcCard[]>("/nfc/cards"),
  card: (id: string) => api.get<NfcCard>(`/nfc/cards/${id}`),
  updateCard: (id: string, patch: Partial<Pick<NfcCard, "name" | "profileId" | "status">>) => api.patch<NfcCard>(`/nfc/cards/${id}`, patch),
  read: (observation: LocalCardObservation) => api.post<NfcCard>("/nfc/read", observation),
  operations: (limit = 100) => api.get<NfcOperation[]>("/nfc/operations", { limit }),
  templates: () => api.get<NfcTemplate[]>("/nfc/templates"),
  profiles: () => api.get<NfcProfile[]>("/nfc/profiles"),
  createProfile: (input: Omit<NfcProfile, "id" | "active">) => api.post<NfcProfile>("/nfc/profiles", input),
  prepare: (type: "write" | "update" | "erase" | "lock" | "protect", input: {
    cardId: string; readerId: string; idempotencyKey: string; records?: NfcRecordInput[];
    previousNdefHash?: string; overwriteConfirmed?: boolean; irreversibleConfirmed?: boolean; confirmationPhrase?: string;
  }) => api.post<NfcPreparedMutation>(`/nfc/${type}`, input),
  verify: (input: {
    operationId: string; operationToken: string; hardwareSucceeded: boolean; readbackNdefBase64?: string;
    lockStatus?: "UNLOCKED" | "LOCKED" | "PARTIALLY_LOCKED" | "UNKNOWN"; protected?: boolean;
    hardwareEvidence?: Record<string, unknown>; errorCode?: string; errorMessage?: string;
  }) => api.post<NfcOperation>("/nfc/verify", input),
  diagnostics: () => api.get<{ moduleStatus: string; readers: NfcReaderRow[]; checks: Array<{ code: string; guidance: string }> }>("/nfc/diagnostics"),
};

export function desktopCardObservation(reader: DesktopNfcReader, card: DesktopNfcCardObservation): LocalCardObservation {
  return {
    reader: {
      localId: reader.localId,
      name: reader.name,
      interfaceType: "PCSC",
      bridgeVersion: reader.bridgeVersion,
      platform: reader.platform,
      status: reader.status,
      capabilities: reader.capabilities,
      error: reader.error,
    },
    hardwareCardKey: card.hardwareCardKey,
    uid: card.uid,
    technology: card.technology,
    identificationConfidence: card.identificationConfidence,
    capabilities: card.capabilities,
    ndefMessageBase64: card.ndefMessageBase64,
    hardwareEvidence: { adapter: "PCSC", bridgeVersion: reader.bridgeVersion, detectedAt: card.detectedAt },
  };
}

interface WebNdefRecord {
  recordType: string;
  mediaType?: string;
  encoding?: string;
  lang?: string;
  data?: DataView;
  id?: string;
}
interface WebNdefReadingEvent extends Event { serialNumber?: string; message: { records: WebNdefRecord[] } }
interface WebNdefReader {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(type: "reading", listener: (event: WebNdefReadingEvent) => void, options?: { once?: boolean }): void;
  addEventListener(type: "readingerror", listener: () => void, options?: { once?: boolean }): void;
}

declare global { interface Window { NDEFReader?: new () => WebNdefReader } }

function dataBytes(record: WebNdefRecord): Uint8Array {
  if (!record.data) return new Uint8Array();
  return new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);
}
function utf8(bytes: Uint8Array): string { return new TextDecoder(recordEncoding(bytes)).decode(bytes); }
function recordEncoding(_bytes: Uint8Array): "utf-8" { return "utf-8"; }

function fromWebRecord(record: WebNdefRecord): NfcRecordInput {
  const bytes = dataBytes(record);
  if (record.recordType === "url") return { kind: "custom_uri", value: utf8(bytes), language: "en" };
  if (record.recordType === "text") return { kind: "text", value: utf8(bytes), language: record.lang || "en" };
  if (record.recordType === "mime" && record.mediaType?.toLowerCase() === "text/vcard") return { kind: "vcard", value: utf8(bytes), language: "en" };
  const tnf = record.recordType === "mime" ? 2 : record.recordType.includes(":") ? 4 : 5;
  return { kind: "custom", tnf, type: record.mediaType || record.recordType || "unknown", payloadBase64: encodeBase64(bytes), language: "en" };
}
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Read one card with Web NFC. Browser APIs do not expose tag capacity, product
 * identity, lock bits, or a trustworthy writable-capacity value, so this adapter
 * intentionally reports read-only capability instead of risking an unchecked write.
 */
export async function scanWebNfc(timeoutMs = 30_000): Promise<LocalCardObservation> {
  if (!window.isSecureContext || !window.NDEFReader) throw new Error("Web NFC is unavailable. Use compatible Android Chrome over HTTPS or WINDELS Desktop with a qualified PC/SC reader.");
  const controller = new AbortController();
  const ndef = new window.NDEFReader();
  const reading = new Promise<WebNdefReadingEvent>((resolve, reject) => {
    const timeout = window.setTimeout(() => { controller.abort(); reject(new Error("No NFC card was detected before the scan timed out.")); }, timeoutMs);
    ndef.addEventListener("reading", (event) => { window.clearTimeout(timeout); controller.abort(); resolve(event); }, { once: true });
    ndef.addEventListener("readingerror", () => { window.clearTimeout(timeout); controller.abort(); reject(new Error("The browser detected a card but could not read its NDEF message.")); }, { once: true });
  });
  await ndef.scan({ signal: controller.signal });
  const event = await reading;
  const records = event.message.records.map(fromWebRecord);
  const message = records.length ? encodeNdefMessage(records) : new Uint8Array();
  const serial = event.serialNumber?.trim();
  const fallback = await sha256Hex(`${encodeBase64(message)}:${Date.now()}`);
  return {
    reader: {
      localId: `web-nfc:${navigator.platform || "browser"}`,
      name: "Browser Web NFC",
      interfaceType: "WEB_NFC",
      bridgeVersion: "web-platform",
      platform: navigator.platform || "browser",
      status: "ONLINE",
      capabilities: { automaticCardDetection: false, userGestureRequired: true, capacityExposed: false, writeBlockedByWindelsSafety: true },
    },
    hardwareCardKey: serial ? `serial:${serial}` : `ephemeral:${fallback}`,
    uid: serial,
    technology: "Unknown NFC Technology",
    identificationConfidence: "UNKNOWN",
    capabilities: {
      canRead: true, canWrite: false, canErase: false, canLock: false, canProtect: false, ndef: true,
      memoryBytes: null, writableBytes: null, lockStatus: "UNKNOWN", supportStatus: "READ_ONLY", qualification: "NOT_REQUIRED", source: "WEB_NFC",
    },
    ndefMessageBase64: encodeBase64(message),
    hardwareEvidence: { adapter: "WEB_NFC", secureContext: window.isSecureContext, userGesture: true },
  };
}

export type { DesktopNfcState, DesktopNfcHardwareResult };
