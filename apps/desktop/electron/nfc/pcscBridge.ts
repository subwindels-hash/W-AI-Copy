import { EventEmitter } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  decodeNdefMessage,
  encodeBase64,
  type2TlvSize,
  unwrapType2Ndef,
  wrapType2Ndef,
} from "@windels/shared/nfc";

const require = createRequire(import.meta.url);
const BRIDGE_VERSION = "1.0.0";

type ReaderHandle = any;

export interface DesktopNfcReader {
  localId: string;
  name: string;
  vendor?: string;
  product?: string;
  interfaceType: "PCSC";
  bridgeVersion: string;
  platform: string;
  status: "ONLINE" | "OFFLINE" | "ERROR";
  capabilities: Record<string, unknown>;
  error?: string;
}

export interface DesktopNfcCard {
  readerLocalId: string;
  hardwareCardKey: string;
  uid?: string;
  technology: string;
  identificationConfidence: "PROTOCOL_VERIFIED" | "ATR_FAMILY_ONLY" | "UNKNOWN";
  capabilities: {
    canRead: boolean;
    canWrite: boolean;
    canErase: boolean;
    canLock: boolean;
    canProtect: boolean;
    ndef: boolean;
    memoryBytes: number | null;
    writableBytes: number | null;
    lockStatus: "UNLOCKED" | "LOCKED" | "PARTIALLY_LOCKED" | "UNKNOWN";
    supportStatus: "UNVERIFIED" | "UNSUPPORTED";
    qualification: "NOT_QUALIFIED";
    source: "PCSC_CC" | "PCSC_GET_VERSION" | "UNKNOWN";
  };
  ndefMessageBase64: string;
  detectedAt: string;
  diagnostics: Array<{ code: string; message: string }>;
}

export interface DesktopNfcState {
  available: boolean;
  adapter: "PCSC";
  bridgeVersion: string;
  readers: DesktopNfcReader[];
  cards: DesktopNfcCard[];
  logs: Array<{ at: string; level: "info" | "warn" | "error"; code: string; message: string; readerLocalId?: string }>;
  error?: { code: string; message: string };
}

export interface HardwarePlan {
  operationId: string;
  operationToken: string;
  operationType: "WRITE" | "UPDATE" | "ERASE" | "LOCK" | "PROTECT";
  readerLocalId: string;
  hardwareCardKey: string;
  ndefMessageBase64?: string;
  expectedNdefHash?: string;
  previousNdefHash?: string;
  expiresAt: string;
  irreversibleConfirmed?: boolean;
}

export interface HardwareResult {
  operationId: string;
  hardwareSucceeded: boolean;
  readbackNdefBase64?: string;
  lockStatus?: DesktopNfcCard["capabilities"]["lockStatus"];
  protected?: boolean;
  errorCode?: string;
  errorMessage?: string;
  hardwareEvidence: Record<string, unknown>;
}

interface InternalCard { public: DesktopNfcCard; reader: ReaderHandle; rawCard: any; dynamicLockPage?: number }

function hash(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function normalizeUid(uid: unknown): string | undefined {
  const clean = String(uid ?? "").replace(/[^A-Fa-f0-9]/g, "").toUpperCase();
  return clean || undefined;
}
function readerId(name: string): string { return `pcsc:${createHash("sha256").update(name).digest("hex").slice(0, 24)}`; }
function stripStatusWords(value: Uint8Array): Uint8Array {
  if (value.length >= 2 && value[value.length - 2] === 0x90 && value[value.length - 1] === 0x00) return value.slice(0, -2);
  return value;
}

function identifyGetVersion(response: Uint8Array): { technology: string; memoryBytes: number; dynamicLockPage: number } | null {
  const v = stripStatusWords(response);
  // NXP GET_VERSION: fixed header 00 04 04 02 01 00, storage-size byte, protocol byte.
  if (v.length < 8 || v[1] !== 0x04 || v[2] !== 0x04 || v[3] !== 0x02) return null;
  if (v[6] === 0x0f) return { technology: "NTAG213", memoryBytes: 144, dynamicLockPage: 40 };
  if (v[6] === 0x11) return { technology: "NTAG215", memoryBytes: 504, dynamicLockPage: 130 };
  if (v[6] === 0x13) return { technology: "NTAG216", memoryBytes: 888, dynamicLockPage: 226 };
  return null;
}

async function getVersion(reader: ReaderHandle): Promise<Uint8Array | null> {
  // PC/SC transparent exchange used by common CCID readers (including ACR122U).
  // Unsupported readers reject it; that is diagnostic evidence, never a reason
  // to guess a card product from the ATR.
  for (const apdu of [
    Uint8Array.of(0xff, 0x00, 0x00, 0x00, 0x01, 0x60),
  ]) {
    try {
      const response = await reader.transmit(Buffer.from(apdu), 64);
      const bytes = new Uint8Array(response);
      if (identifyGetVersion(bytes)) return bytes;
    } catch { /* try the next verified transport form */ }
  }
  return null;
}

async function readPage(reader: ReaderHandle, page: number): Promise<Uint8Array> {
  return new Uint8Array(await reader.read(page, 4, 4, 4));
}

async function inspectCard(reader: ReaderHandle, rawCard: any): Promise<InternalCard> {
  const diagnostics: DesktopNfcCard["diagnostics"] = [];
  const uid = normalizeUid(rawCard?.uid);
  // ATR identifies a protocol/family and can be identical across many cards; it
  // is never used as a stable card identifier. UID-less cards get a per-present
  // key so two physical cards cannot be silently merged in the library.
  const hardwareCardKey = uid ? `uid:${uid}` : `presentation:${randomUUID()}`;
  const versionResponse = await getVersion(reader);
  const version = versionResponse ? identifyGetVersion(versionResponse) : null;
  let technology = version?.technology ?? "Unknown NFC Technology";
  let confidence: DesktopNfcCard["identificationConfidence"] = version ? "PROTOCOL_VERIFIED" : rawCard?.standard ? "ATR_FAMILY_ONLY" : "UNKNOWN";
  let capabilitySource: DesktopNfcCard["capabilities"]["source"] = version ? "PCSC_GET_VERSION" : "UNKNOWN";
  let writableBytes: number | null = null;
  let ndef = false;
  let canRead = false;
  let canWrite = false;
  let canLock = false;
  let lockStatus: DesktopNfcCard["capabilities"]["lockStatus"] = "UNKNOWN";
  let ndefMessage = new Uint8Array();

  try {
    const header = new Uint8Array(await reader.read(0, 16, 4, 16));
    const cc = header.slice(12, 16);
    if (cc[0] === 0xe1 && (cc[1]! >>> 4) === 1) {
      ndef = true;
      capabilitySource = version ? "PCSC_GET_VERSION" : "PCSC_CC";
      writableBytes = cc[2]! * 8;
      const readAccess = cc[3]! >>> 4;
      const writeAccess = cc[3]! & 0x0f;
      canRead = readAccess === 0;
      canWrite = writeAccess === 0;
      const staticLocks = (header[10]! << 8) | header[11]!;
      lockStatus = writeAccess === 0x0f ? "LOCKED" : staticLocks ? "PARTIALLY_LOCKED" : "UNLOCKED";
      if (version && staticLocks === 0xffff) {
        try {
          const dynamicLocks = await readPage(reader, version.dynamicLockPage);
          if (dynamicLocks[0] === 0xff && dynamicLocks[1] === 0xff && dynamicLocks[2] === 0xff) lockStatus = "LOCKED";
        } catch { /* static lock state remains visible */ }
      }
      if (lockStatus === "LOCKED") canWrite = false;
      canLock = !!version && lockStatus !== "LOCKED";
      if (canRead) {
        const memory = new Uint8Array(await reader.read(4, writableBytes, 4, 16));
        ndefMessage = unwrapType2Ndef(memory);
        decodeNdefMessage(ndefMessage); // validate now; malformed content is surfaced
      }
    } else {
      diagnostics.push({ code: "NDEF_CC_NOT_FOUND", message: "No supported NFC Forum Type 2 Capability Container was found; no memory layout was assumed." });
    }
  } catch (error) {
    diagnostics.push({ code: "NDEF_READ_FAILED", message: error instanceof Error ? error.message : String(error) });
    canRead = false;
    canWrite = false;
  }
  if (!version) diagnostics.push({ code: "TECHNOLOGY_UNVERIFIED", message: "GET_VERSION was unavailable or unrecognized. The ATR identifies only a protocol family, not a card product." });
  if (!ndef) technology = "Unknown NFC Technology";

  return {
    reader,
    rawCard,
    dynamicLockPage: version?.dynamicLockPage,
    public: {
      readerLocalId: readerId(reader.name),
      hardwareCardKey,
      uid,
      technology,
      identificationConfidence: confidence,
      capabilities: {
        canRead,
        canWrite,
        canErase: canWrite,
        canLock,
        canProtect: false,
        ndef,
        memoryBytes: version?.memoryBytes ?? null,
        writableBytes,
        lockStatus,
        supportStatus: canRead ? "UNVERIFIED" : "UNSUPPORTED",
        qualification: "NOT_QUALIFIED",
        source: capabilitySource,
      },
      ndefMessageBase64: encodeBase64(ndefMessage),
      detectedAt: new Date().toISOString(),
      diagnostics,
    },
  };
}

async function writeType2(reader: ReaderHandle, capacity: number, message: Uint8Array): Promise<Uint8Array> {
  const wrapped = wrapType2Ndef(message);
  if (wrapped.length > capacity) throw Object.assign(new Error(`Required ${wrapped.length} bytes, available ${capacity}`), { code: "INSUFFICIENT_MEMORY" });
  const padded = new Uint8Array(Math.ceil(wrapped.length / 4) * 4);
  padded.set(wrapped);
  // Fail safely: advertise an empty message while writing trailing pages, then
  // commit the first page (which carries the final TLV length) last.
  await reader.write(4, Buffer.from(Uint8Array.of(0x03, 0x00, 0xfe, 0x00)), 4);
  if (padded.length > 4) await reader.write(5, Buffer.from(padded.slice(4)), 4);
  await reader.write(4, Buffer.from(padded.slice(0, 4)), 4);
  const readbackMemory = new Uint8Array(await reader.read(4, capacity, 4, 16));
  return unwrapType2Ndef(readbackMemory);
}

export class PcscNfcBridge extends EventEmitter {
  private nfc: any;
  private readers = new Map<string, DesktopNfcReader>();
  private readerHandles = new Map<string, ReaderHandle>();
  private cards = new Map<string, InternalCard>();
  private logs: DesktopNfcState["logs"] = [];
  private startupError?: DesktopNfcState["error"];

  private log(level: "info" | "warn" | "error", code: string, message: string, readerLocalId?: string) {
    this.logs.unshift({ at: new Date().toISOString(), level, code, message: message.slice(0, 1000), ...(readerLocalId ? { readerLocalId } : {}) });
    if (this.logs.length > 200) this.logs.length = 200;
  }

  async start(): Promise<void> {
    try {
      const loaded = require("nfc-pcsc");
      const NFC = loaded.NFC ?? loaded.default?.NFC ?? loaded.default;
      this.nfc = new NFC();
      this.log("info", "PCSC_ADAPTER_STARTED", "PC/SC NFC adapter started.");
      this.nfc.on("reader", (reader: ReaderHandle) => this.attachReader(reader));
      this.nfc.on("error", (error: Error) => {
        this.startupError = { code: "PCSC_SERVICE_ERROR", message: error.message };
        this.log("error", "PCSC_SERVICE_ERROR", error.message);
        this.emitState();
      });
    } catch (error) {
      this.startupError = {
        code: "PCSC_ADAPTER_UNAVAILABLE",
        message: `PC/SC adapter is unavailable: ${error instanceof Error ? error.message : String(error)}. Install nfc-pcsc and the operating-system smart-card service/reader driver.`,
      };
      this.log("error", this.startupError.code, this.startupError.message);
      this.emitState();
    }
  }

  stop(): void {
    try { this.nfc?.close?.(); } catch { /* best effort */ }
    this.readers.clear(); this.readerHandles.clear(); this.cards.clear();
  }

  state(): DesktopNfcState {
    return { available: !this.startupError, adapter: "PCSC", bridgeVersion: BRIDGE_VERSION, readers: [...this.readers.values()], cards: [...this.cards.values()].map((card) => card.public), logs: [...this.logs], ...(this.startupError ? { error: this.startupError } : {}) };
  }

  private emitState() { this.emit("state", this.state()); }

  private attachReader(reader: ReaderHandle) {
    const localId = readerId(reader.name);
    const publicReader: DesktopNfcReader = {
      localId,
      name: reader.name,
      interfaceType: "PCSC",
      bridgeVersion: BRIDGE_VERSION,
      platform: process.platform,
      status: "ONLINE",
      capabilities: { pcsc: true, automaticCardDetection: true, ndefType2Inspection: true },
    };
    this.readers.set(localId, publicReader);
    this.readerHandles.set(localId, reader);
    this.log("info", "READER_CONNECTED", `Reader connected: ${reader.name}`, localId);
    reader.autoProcessing = false;
    reader.on("card", async (card: any) => {
      try {
        const inspected = await inspectCard(reader, card);
        this.cards.set(localId, inspected);
        this.log("info", "CARD_DETECTED", `Card detected (${inspected.public.technology}; ${inspected.public.capabilities.supportStatus}).`, localId);
      } catch (error) {
        publicReader.status = "ERROR";
        publicReader.error = error instanceof Error ? error.message : String(error);
        this.log("error", "CARD_INSPECTION_FAILED", publicReader.error, localId);
      }
      this.emitState();
    });
    reader.on("card.off", () => { this.cards.delete(localId); this.log("info", "CARD_REMOVED", "Card removed.", localId); this.emitState(); });
    reader.on("error", (error: Error) => { publicReader.status = "ERROR"; publicReader.error = error.message; this.cards.delete(localId); this.log("error", "READER_ERROR", error.message, localId); this.emitState(); });
    reader.on("end", () => { this.readers.delete(localId); this.readerHandles.delete(localId); this.cards.delete(localId); this.log("warn", "READER_DISCONNECTED", `Reader disconnected: ${reader.name}`, localId); this.emitState(); });
    this.emitState();
  }

  async refresh(readerLocalId: string): Promise<DesktopNfcCard> {
    const current = this.cards.get(readerLocalId);
    if (!current) throw Object.assign(new Error("No card is currently detected on this reader"), { code: "CARD_NOT_DETECTED" });
    const inspected = await inspectCard(current.reader, current.rawCard);
    this.cards.set(readerLocalId, inspected);
    this.emitState();
    return inspected.public;
  }

  async execute(plan: HardwarePlan): Promise<HardwareResult> {
    const evidence = { adapter: "PCSC", bridgeVersion: BRIDGE_VERSION, platform: process.platform, readerLocalId: plan.readerLocalId, completedAt: new Date().toISOString() };
    try {
      this.log("info", "OPERATION_STARTED", `${plan.operationType} operation ${plan.operationId} started.`, plan.readerLocalId);
      if (!plan.operationToken || !plan.operationId) throw Object.assign(new Error("A server-authorized operation token is required"), { code: "AUTHORIZATION_REQUIRED" });
      if (new Date(plan.expiresAt).getTime() < Date.now()) throw Object.assign(new Error("The server-authorized operation has expired"), { code: "OPERATION_EXPIRED" });
      const current = this.cards.get(plan.readerLocalId);
      if (!current || current.public.hardwareCardKey !== plan.hardwareCardKey) throw Object.assign(new Error("The expected card is not present"), { code: "CARD_CHANGED" });
      const before = await this.refresh(plan.readerLocalId);
      const beforeMessage = new Uint8Array(Buffer.from(before.ndefMessageBase64, "base64"));
      if (plan.previousNdefHash && hash(beforeMessage) !== plan.previousNdefHash) throw Object.assign(new Error("Card contents changed after confirmation; write cancelled"), { code: "CARD_CONTENT_CHANGED" });
      if (!before.capabilities.writableBytes) throw Object.assign(new Error("Writable capacity is unknown"), { code: "CAPACITY_UNKNOWN" });

      if (["WRITE", "UPDATE", "ERASE"].includes(plan.operationType)) {
        if (!before.capabilities.canWrite) throw Object.assign(new Error("The card does not report a writable Type 2 NDEF area"), { code: "CARD_READ_ONLY" });
        const intended = plan.operationType === "ERASE" ? new Uint8Array() : new Uint8Array(Buffer.from(plan.ndefMessageBase64 ?? "", "base64"));
        if (type2TlvSize(intended.length) > before.capabilities.writableBytes) throw Object.assign(new Error("NDEF message exceeds observed card capacity"), { code: "INSUFFICIENT_MEMORY" });
        const readback = await writeType2(current.reader, before.capabilities.writableBytes, intended);
        if (hash(readback) !== hash(intended) || (plan.expectedNdefHash && hash(readback) !== plan.expectedNdefHash)) {
          throw Object.assign(new Error("Read-back bytes differ from the intended NDEF message"), { code: "NFC_WRITE_VERIFICATION_FAILED" });
        }
        await this.refresh(plan.readerLocalId);
        this.log("info", "OPERATION_VERIFIED", `${plan.operationType} operation ${plan.operationId} passed read-back verification.`, plan.readerLocalId);
        return { operationId: plan.operationId, hardwareSucceeded: true, readbackNdefBase64: encodeBase64(readback), hardwareEvidence: { ...evidence, technology: before.technology, bytes: readback.length, readBack: true } };
      }

      if (plan.operationType === "LOCK") {
        if (!plan.irreversibleConfirmed) throw Object.assign(new Error("Irreversible confirmation is required"), { code: "CONFIRMATION_REQUIRED" });
        if (!before.capabilities.canLock || !current.dynamicLockPage) throw Object.assign(new Error("Permanent locking is not implemented for this identified card technology"), { code: "LOCK_UNSUPPORTED" });
        const dynamic = await readPage(current.reader, current.dynamicLockPage);
        dynamic[0] = 0xff; dynamic[1] = 0xff; dynamic[2] = 0xff;
        await current.reader.write(current.dynamicLockPage, Buffer.from(dynamic), 4);
        const page2 = await readPage(current.reader, 2);
        page2[2] = 0xff; page2[3] = 0xff;
        await current.reader.write(2, Buffer.from(page2), 4);
        const staticVerify = await readPage(current.reader, 2);
        const dynamicVerify = await readPage(current.reader, current.dynamicLockPage);
        if (staticVerify[2] !== 0xff || staticVerify[3] !== 0xff || dynamicVerify[0] !== 0xff || dynamicVerify[1] !== 0xff || dynamicVerify[2] !== 0xff) {
          throw Object.assign(new Error("Lock bytes could not be verified"), { code: "NFC_LOCK_VERIFICATION_FAILED" });
        }
        current.public.capabilities.lockStatus = "LOCKED";
        current.public.capabilities.canWrite = false;
        this.log("info", "LOCK_VERIFIED", `LOCK operation ${plan.operationId} verified permanent lock bytes.`, plan.readerLocalId);
        this.emitState();
        return { operationId: plan.operationId, hardwareSucceeded: true, lockStatus: "LOCKED", hardwareEvidence: { ...evidence, technology: before.technology, lockBytesReadBack: true } };
      }
      throw Object.assign(new Error("Password protection requires a technology-specific, qualified SDK and is not available through this adapter"), { code: "PROTECTION_UNSUPPORTED" });
    } catch (error: any) {
      this.log("error", error?.code ?? "PCSC_OPERATION_FAILED", error instanceof Error ? error.message : String(error), plan.readerLocalId);
      this.emitState();
      return { operationId: plan.operationId, hardwareSucceeded: false, errorCode: error?.code ?? "PCSC_OPERATION_FAILED", errorMessage: error instanceof Error ? error.message : String(error), hardwareEvidence: evidence };
    }
  }
}
