import { createHash, createHmac } from "node:crypto";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/result.js";
import { auditService } from "../audit/audit.service.js";
import { decryptJson, encryptJson, isEncryptedBlob } from "../security/encryption.js";
import {
  decodeNdefMessage,
  encodeBase64,
  encodeNdefMessage,
  NFC_TEMPLATES,
  NfcCapabilitySchema,
  NfcRecordListSchema,
  type NfcRecordInput,
  type2TlvSize,
} from "@windels/shared/nfc";

const db = prisma as any;
const UNKNOWN_TECH = "Unknown NFC Technology";
const OP_TTL_MS = 5 * 60_000;

export interface ActorContext {
  userId: string;
  organizationId: string;
}

export interface ReaderObservation {
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

export interface CardObservation {
  reader: ReaderObservation;
  hardwareCardKey: string;
  uid?: string;
  name?: string;
  technology?: string;
  identificationConfidence: "PROTOCOL_VERIFIED" | "SDK_VERIFIED" | "ATR_FAMILY_ONLY" | "UNKNOWN";
  capabilities: unknown;
  ndefMessageBase64?: string;
  hardwareEvidence?: Record<string, unknown>;
}

function digest(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function privateDigest(organizationId: string, purpose: string, value: string): string {
  return createHmac("sha256", env.JWT_SECRET).update(`${organizationId}:${purpose}:${value}`).digest("hex");
}

function maskUid(uid?: string): string | null {
  if (!uid) return null;
  const clean = uid.replace(/[^A-Fa-f0-9]/g, "").toUpperCase();
  return clean ? `••••${clean.slice(-4)}` : null;
}

function operationToken(operation: { id: string; organizationId: string; expiresAt: Date | string | null }): string {
  const expires = operation.expiresAt ? new Date(operation.expiresAt).toISOString() : "";
  return createHmac("sha256", env.JWT_SECRET).update(`${operation.id}.${operation.organizationId}.${expires}`).digest("base64url");
}

function decryptStored<T>(value: unknown, fallback: T): T {
  try {
    if (isEncryptedBlob(value as any)) return (decryptJson<T>(value as any) ?? fallback) as T;
  } catch { /* corrupted encrypted fields are never returned as plaintext */ }
  return fallback;
}

function safeEvidence(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input) return {};
  const forbidden = /(uid|password|secret|token|credential|payload|ndef|key)/i;
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => !forbidden.test(key) && ["string", "number", "boolean"].includes(typeof value)).slice(0, 30));
}

function qualifiedFor(reader: any, technology: string, operation: "READ" | "WRITE" | "ERASE" | "LOCK" | "PROTECT"): boolean {
  const combinations = Array.isArray(reader.qualifiedCombinations) ? reader.qualifiedCombinations : [];
  return combinations.some((item: any) =>
    item?.technology === technology &&
    item?.interfaceType === reader.interfaceType &&
    item?.revoked !== true &&
    item?.operations?.includes(operation),
  );
}

function supportFrom(capability: any, reader: any, technology: string): { status: string; qualification: string } {
  if (!capability.canRead) return { status: "UNSUPPORTED", qualification: "NOT_QUALIFIED" };
  const readQualified = qualifiedFor(reader, technology, "READ");
  const writeQualified = capability.canWrite && qualifiedFor(reader, technology, "WRITE");
  if (writeQualified) return { status: "WRITE_SUPPORTED", qualification: "QUALIFIED" };
  if (readQualified) return { status: "READ_ONLY", qualification: "QUALIFIED" };
  return { status: "UNVERIFIED", qualification: "NOT_QUALIFIED" };
}

function decryptedRecord(row: any): any {
  return {
    id: row.id,
    position: row.position,
    kind: row.kind,
    tnf: row.tnf,
    recordType: row.recordType,
    payload: decryptStored<Record<string, unknown>>(row.payload, { unavailable: true }),
    payloadHash: row.payloadHash,
    sizeBytes: row.sizeBytes,
  };
}

function publicCard(card: any): any {
  return {
    ...card,
    cardKeyHash: undefined,
    records: Array.isArray(card.records) ? card.records.map(decryptedRecord) : [],
  };
}

function publicOperation(operation: any): any {
  return {
    ...operation,
    challengeHash: undefined,
    requestedRecords: decryptStored<NfcRecordInput[]>(operation.requestedRecords, []),
  };
}

async function audit(ctx: ActorContext, action: any, resourceType: any, resourceId: string, metadata: Record<string, unknown> = {}) {
  await auditService.log({ organizationId: ctx.organizationId, userId: ctx.userId, action, resourceType, resourceId, metadata });
}

async function saveRecords(cardId: string, records: ReturnType<typeof decodeNdefMessage>, rawMessage: Uint8Array) {
  await db.nfcNdefRecord.deleteMany({ where: { cardId } });
  if (!records.length) return;
  await db.nfcNdefRecord.createMany({
    data: records.map((record, position) => {
      const rawPayload = Buffer.from(record.payloadBase64, "base64");
      const payload = {
        kind: record.kind,
        value: record.kind === "wifi" ? "Wi-Fi credential (protected display)" : record.value,
        language: record.language,
        mediaType: record.mediaType,
        payloadBase64: record.payloadBase64,
      };
      return {
        cardId,
        position,
        kind: record.kind,
        tnf: record.tnf,
        recordType: record.type,
        payload: encryptJson(payload),
        payloadHash: digest(rawPayload),
        sizeBytes: rawPayload.byteLength,
      };
    }),
  });
  void rawMessage;
}

export const nfcService = {
  templates() { return NFC_TEMPLATES; },

  async reportReader(ctx: ActorContext, input: ReaderObservation) {
    const localIdHash = privateDigest(ctx.organizationId, "reader", input.localId);
    const existing = await db.nfcReader.findFirst({ where: { organizationId: ctx.organizationId, localIdHash } });
    const data = {
      registeredById: existing?.registeredById ?? ctx.userId,
      name: input.name,
      vendor: input.vendor ?? null,
      product: input.product ?? null,
      interfaceType: input.interfaceType,
      status: input.status,
      capabilities: input.capabilities ?? {},
      bridgeVersion: input.bridgeVersion ?? null,
      platform: input.platform ?? null,
      lastSeenAt: new Date(),
      lastError: input.error ?? null,
    };
    const reader = existing
      ? await db.nfcReader.update({ where: { id: existing.id }, data })
      : await db.nfcReader.create({ data: { organizationId: ctx.organizationId, localIdHash, qualifiedCombinations: [], ...data } });
    await audit(ctx, "nfc.reader_detected", "nfc_reader", reader.id, { interfaceType: reader.interfaceType, status: reader.status });
    return { ...reader, localIdHash: undefined };
  },

  async listReaders(ctx: ActorContext) {
    const readers = await db.nfcReader.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { lastSeenAt: "desc" } });
    return readers.map((reader: any) => ({ ...reader, localIdHash: undefined }));
  },

  async qualifyReader(ctx: ActorContext, readerId: string, evidence: {
    technology: string;
    hardwareTestRunId: string;
    testedAt: string;
    readerDetectionPassed: boolean;
    cardDetectionPassed: boolean;
    readPassed: boolean;
    writePassed: boolean;
    verifyPassed: boolean;
    erasePassed?: boolean;
    lockPassed?: boolean;
    protectPassed?: boolean;
    notes?: string;
  }) {
    const reader = await db.nfcReader.findFirst({ where: { id: readerId, organizationId: ctx.organizationId } });
    if (!reader) throw AppError.notFound("NFC reader not found");
    if (!evidence.readerDetectionPassed || !evidence.cardDetectionPassed || !evidence.readPassed) {
      throw AppError.validation("Reader/card detection and a real read must pass before this pair can be qualified");
    }
    const operations = ["READ"];
    if (evidence.writePassed && evidence.verifyPassed) operations.push("WRITE");
    if (evidence.erasePassed && evidence.verifyPassed) operations.push("ERASE");
    if (evidence.lockPassed) operations.push("LOCK");
    if (evidence.protectPassed) operations.push("PROTECT");
    const current = Array.isArray(reader.qualifiedCombinations) ? reader.qualifiedCombinations.filter((item: any) => !(item.technology === evidence.technology && item.interfaceType === reader.interfaceType)) : [];
    const qualification = {
      technology: evidence.technology,
      interfaceType: reader.interfaceType,
      operations,
      hardwareTestRunId: evidence.hardwareTestRunId,
      testedAt: new Date(evidence.testedAt).toISOString(),
      qualifiedById: ctx.userId,
      notes: evidence.notes?.slice(0, 500),
    };
    const updated = await db.nfcReader.update({ where: { id: reader.id }, data: { qualifiedCombinations: [...current, qualification] } });
    await audit(ctx, "nfc.reader_qualified", "nfc_reader", reader.id, { technology: evidence.technology, operations, hardwareTestRunId: evidence.hardwareTestRunId });
    return { ...updated, localIdHash: undefined };
  },

  async observeCard(ctx: ActorContext, input: CardObservation) {
    const reader = await this.reportReader(ctx, input.reader);
    const storedReader = await db.nfcReader.findFirst({ where: { id: reader.id, organizationId: ctx.organizationId } });
    const capability = NfcCapabilitySchema.parse(input.capabilities);
    const technology = input.identificationConfidence === "PROTOCOL_VERIFIED" || input.identificationConfidence === "SDK_VERIFIED"
      ? (input.technology?.trim() || UNKNOWN_TECH)
      : UNKNOWN_TECH;
    const support = supportFrom(capability, storedReader, technology);
    const cardKeyHash = privateDigest(ctx.organizationId, "card", input.hardwareCardKey);
    const existing = await db.nfcCard.findFirst({ where: { organizationId: ctx.organizationId, cardKeyHash } });
    let raw = new Uint8Array();
    let records: ReturnType<typeof decodeNdefMessage> = [];
    if (input.ndefMessageBase64) {
      raw = new Uint8Array(Buffer.from(input.ndefMessageBase64, "base64"));
      try { records = decodeNdefMessage(raw); }
      catch (error) { throw AppError.validation("The card contains malformed or unsupported NDEF data", { cause: error instanceof Error ? error.message : String(error) }); }
    }
    const ndefHash = digest(raw);
    const cardData = {
      readerId: storedReader.id,
      name: input.name?.trim() || existing?.name || `${technology === UNKNOWN_TECH ? "NFC Card" : technology} Card`,
      uidMasked: maskUid(input.uid),
      technology,
      supportStatus: support.status,
      memoryBytes: capability.memoryBytes,
      writableBytes: capability.writableBytes,
      ndefSupported: capability.ndef,
      readable: capability.canRead,
      writable: capability.canWrite && support.qualification === "QUALIFIED",
      erasable: capability.canErase && qualifiedFor(storedReader, technology, "ERASE"),
      lockable: capability.canLock && qualifiedFor(storedReader, technology, "LOCK"),
      protectable: capability.canProtect && qualifiedFor(storedReader, technology, "PROTECT"),
      lockStatus: capability.lockStatus,
      capabilitySource: capability.source,
      qualification: support.qualification,
      capabilities: { ...capability, identificationConfidence: input.identificationConfidence },
      ndefHash,
      lastDetectedAt: new Date(),
      lastReadAt: new Date(),
    };
    const card = existing
      ? await db.nfcCard.update({ where: { id: existing.id }, data: cardData })
      : await db.nfcCard.create({ data: { organizationId: ctx.organizationId, createdById: ctx.userId, cardKeyHash, ...cardData } });
    await saveRecords(card.id, records, raw);
    const operation = await db.nfcOperation.create({ data: {
      organizationId: ctx.organizationId,
      requestedById: ctx.userId,
      readerId: storedReader.id,
      cardId: card.id,
      operationType: "READ",
      status: "SUCCEEDED",
      idempotencyKey: `read:${Date.now()}:${digest(cardKeyHash).slice(0, 12)}`,
      requestedRecords: encryptJson([]),
      readbackNdefHash: ndefHash,
      hardwareEvidence: safeEvidence(input.hardwareEvidence),
      completedAt: new Date(),
      result: { records: records.length, bytes: raw.length, verifiedByRead: true },
    } });
    await audit(ctx, "nfc.card_detected", "nfc_card", card.id, { readerId: storedReader.id, technology, supportStatus: support.status });
    await audit(ctx, "nfc.card_read", "nfc_card", card.id, { operationId: operation.id, technology, records: records.length, supportStatus: support.status });
    return publicCard(await db.nfcCard.findFirst({ where: { id: card.id }, include: { records: { orderBy: { position: "asc" } }, profile: true } }));
  },

  async listCards(ctx: ActorContext) {
    const rows = await db.nfcCard.findMany({ where: { organizationId: ctx.organizationId }, include: { records: { orderBy: { position: "asc" } }, profile: true }, orderBy: { updatedAt: "desc" } });
    return rows.map(publicCard);
  },

  async getCard(ctx: ActorContext, cardId: string) {
    const card = await db.nfcCard.findFirst({ where: { id: cardId, organizationId: ctx.organizationId }, include: { records: { orderBy: { position: "asc" } }, profile: true } });
    if (!card) throw AppError.notFound("NFC card not found");
    return publicCard(card);
  },

  async updateCard(ctx: ActorContext, cardId: string, patch: { name?: string; profileId?: string | null; assignedUserId?: string | null; status?: string }) {
    const card = await db.nfcCard.findFirst({ where: { id: cardId, organizationId: ctx.organizationId } });
    if (!card) throw AppError.notFound("NFC card not found");
    if (patch.profileId) {
      const profile = await db.nfcProfile.findFirst({ where: { id: patch.profileId, organizationId: ctx.organizationId } });
      if (!profile) throw AppError.notFound("NFC profile not found");
    }
    const updated = await db.nfcCard.update({ where: { id: card.id }, data: patch });
    await audit(ctx, "data.update", "nfc_card", card.id, { fields: Object.keys(patch) });
    return publicCard(updated);
  },

  async createProfile(ctx: ActorContext, input: { name: string; profileType: string; targetType: string; targetId?: string; secureUrl: string; metadata?: Record<string, unknown> }) {
    let url: URL;
    try { url = new URL(input.secureUrl); }
    catch { throw AppError.validation("NFC identity/profile link is not a valid URL"); }
    if (url.protocol !== "https:") throw AppError.validation("NFC identity/profile links must use HTTPS");
    const profile = await db.nfcProfile.create({ data: {
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      name: input.name,
      profileType: input.profileType,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      secureUrl: url.toString(),
      metadata: input.metadata ?? {},
    } });
    await audit(ctx, "data.create", "nfc_profile", profile.id, { profileType: profile.profileType, targetType: profile.targetType });
    return profile;
  },

  async listProfiles(ctx: ActorContext) {
    return db.nfcProfile.findMany({ where: { organizationId: ctx.organizationId, active: true }, orderBy: { updatedAt: "desc" } });
  },

  async prepareMutation(ctx: ActorContext, input: {
    operationType: "WRITE" | "UPDATE" | "ERASE" | "LOCK" | "PROTECT";
    cardId: string;
    readerId: string;
    idempotencyKey: string;
    records?: NfcRecordInput[];
    previousNdefHash?: string;
    overwriteConfirmed?: boolean;
    irreversibleConfirmed?: boolean;
    confirmationPhrase?: string;
  }) {
    const duplicate = await db.nfcOperation.findFirst({ where: { organizationId: ctx.organizationId, idempotencyKey: input.idempotencyKey } });
    if (duplicate) return { operation: publicOperation(duplicate), operationToken: operationToken(duplicate), duplicate: true };
    const [card, reader] = await Promise.all([
      db.nfcCard.findFirst({ where: { id: input.cardId, organizationId: ctx.organizationId } }),
      db.nfcReader.findFirst({ where: { id: input.readerId, organizationId: ctx.organizationId } }),
    ]);
    if (!card) throw AppError.notFound("NFC card not found");
    if (!reader) throw AppError.notFound("NFC reader not found");
    if (card.readerId !== reader.id) throw AppError.conflict("The selected card was not observed on this reader");
    if (card.qualification !== "QUALIFIED") throw AppError.conflict("This reader/card technology pair has not passed real-hardware qualification");
    if (card.lockStatus === "LOCKED" && input.operationType !== "LOCK") throw AppError.conflict("The card is locked and cannot be modified");

    const requirement: Record<string, string> = { WRITE: "writable", UPDATE: "writable", ERASE: "erasable", LOCK: "lockable", PROTECT: "protectable" };
    if (!card[requirement[input.operationType]]) throw AppError.conflict(`The observed and qualified card capability does not allow ${input.operationType.toLowerCase()}`);
    if (!qualifiedFor(reader, card.technology, input.operationType === "UPDATE" ? "WRITE" : input.operationType)) {
      throw AppError.conflict(`The ${reader.name} + ${card.technology} combination is not qualified for ${input.operationType.toLowerCase()}`);
    }

    let records: NfcRecordInput[] = [];
    let expected = digest(new Uint8Array());
    let requiredBytes = type2TlvSize(0);
    if (input.operationType === "WRITE" || input.operationType === "UPDATE") {
      records = NfcRecordListSchema.parse(input.records ?? []);
      const ndef = encodeNdefMessage(records);
      expected = digest(ndef);
      requiredBytes = type2TlvSize(ndef.length);
      if (card.writableBytes === null || card.writableBytes === undefined) throw AppError.conflict("Writable capacity is unknown; size-safe writing is blocked");
      if (requiredBytes > card.writableBytes) throw AppError.validation("NDEF content exceeds the card's observed writable capacity", { available: card.writableBytes, required: requiredBytes });
    }

    if (card.ndefHash && card.ndefHash !== digest(new Uint8Array())) {
      if (!input.overwriteConfirmed) throw AppError.conflict("Existing NDEF content must be shown and explicitly confirmed before overwrite");
      if (!input.previousNdefHash || input.previousNdefHash !== card.ndefHash) throw AppError.conflict("Card contents changed since the last verified read; read the card again");
    }
    const irreversible = input.operationType === "LOCK" || input.operationType === "PROTECT";
    if (irreversible && (!input.irreversibleConfirmed || input.confirmationPhrase !== "LOCK PERMANENTLY")) {
      throw AppError.validation("Permanent card protection requires the exact confirmation phrase LOCK PERMANENTLY");
    }

    const expiresAt = new Date(Date.now() + OP_TTL_MS);
    const operation = await db.nfcOperation.create({ data: {
      organizationId: ctx.organizationId,
      requestedById: ctx.userId,
      readerId: reader.id,
      cardId: card.id,
      operationType: input.operationType,
      status: "READY",
      idempotencyKey: input.idempotencyKey,
      requestedRecords: encryptJson(records),
      expectedNdefHash: expected,
      previousNdefHash: card.ndefHash,
      requiredBytes,
      availableBytes: card.writableBytes,
      overwriteConfirmed: !!input.overwriteConfirmed,
      irreversibleConfirmed: !!input.irreversibleConfirmed,
      expiresAt,
    } });
    const token = operationToken(operation);
    await db.nfcOperation.update({ where: { id: operation.id }, data: { challengeHash: digest(token) } });
    await audit(ctx, "nfc.mutation_requested", "nfc_operation", operation.id, { operationType: operation.operationType, cardId: card.id, requiredBytes, availableBytes: card.writableBytes, irreversible });
    return {
      operation: publicOperation(operation),
      operationToken: token,
      duplicate: false,
      writePlan: {
        operationId: operation.id,
        operationType: input.operationType,
        records,
        ndefMessageBase64: input.operationType === "WRITE" || input.operationType === "UPDATE" ? encodeBase64(encodeNdefMessage(records)) : "",
        expectedNdefHash: expected,
        previousNdefHash: card.ndefHash,
        requiredBytes,
        availableBytes: card.writableBytes,
        expiresAt: expiresAt.toISOString(),
      },
    };
  },

  async verifyMutation(ctx: ActorContext, input: {
    operationId: string;
    operationToken: string;
    hardwareSucceeded: boolean;
    readbackNdefBase64?: string;
    lockStatus?: "UNLOCKED" | "LOCKED" | "PARTIALLY_LOCKED" | "UNKNOWN";
    protected?: boolean;
    hardwareEvidence?: Record<string, unknown>;
    errorCode?: string;
    errorMessage?: string;
  }) {
    const operation = await db.nfcOperation.findFirst({ where: { id: input.operationId, organizationId: ctx.organizationId }, include: { card: true, reader: true } });
    if (!operation) throw AppError.notFound("NFC operation not found");
    if (["SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"].includes(operation.status)) return publicOperation(operation);
    if (operation.requestedById !== ctx.userId) throw AppError.forbidden("Only the requesting user can complete this hardware operation");
    if (!operation.expiresAt || new Date(operation.expiresAt).getTime() < Date.now()) {
      const expired = await db.nfcOperation.update({ where: { id: operation.id }, data: { status: "EXPIRED", completedAt: new Date(), errorCode: "OPERATION_EXPIRED", errorMessage: "Hardware operation token expired" } });
      return publicOperation(expired);
    }
    if (digest(input.operationToken) !== operation.challengeHash || input.operationToken !== operationToken(operation)) throw AppError.forbidden("Invalid NFC hardware operation token");
    await db.nfcOperation.update({ where: { id: operation.id }, data: { status: "VERIFYING", startedAt: operation.startedAt ?? new Date() } });

    const fail = async (code: string, message: string, readbackHash?: string) => {
      const failed = await db.nfcOperation.update({ where: { id: operation.id }, data: {
        status: "FAILED", errorCode: code, errorMessage: message, readbackNdefHash: readbackHash,
        hardwareEvidence: safeEvidence(input.hardwareEvidence), completedAt: new Date(), result: { verified: false },
      } });
      await audit(ctx, "nfc.verification_failed", "nfc_operation", operation.id, { operationType: operation.operationType, code, cardId: operation.cardId });
      if (/HARDWARE|PCSC|CARD_|DRIVER|READER/.test(code)) {
        await audit(ctx, "nfc.hardware_error", "nfc_operation", operation.id, { operationType: operation.operationType, code, cardId: operation.cardId });
      }
      return publicOperation(failed);
    };
    if (!input.hardwareSucceeded) return fail(input.errorCode || "HARDWARE_OPERATION_FAILED", input.errorMessage || "The hardware adapter reported failure");

    let readback = new Uint8Array();
    let readbackHash: string | undefined;
    if (["WRITE", "UPDATE", "ERASE"].includes(operation.operationType)) {
      if (input.readbackNdefBase64 === undefined) return fail("READBACK_REQUIRED", "No read-back data was supplied; success cannot be verified");
      readback = new Uint8Array(Buffer.from(input.readbackNdefBase64, "base64"));
      readbackHash = digest(readback);
      if (readbackHash !== operation.expectedNdefHash) return fail("NFC_WRITE_VERIFICATION_FAILED", "Read-back content does not match the intended NDEF message", readbackHash);
      try { if (readback.length) decodeNdefMessage(readback); }
      catch (error) { return fail("NDEF_READBACK_INVALID", error instanceof Error ? error.message : "Read-back NDEF is invalid", readbackHash); }
    }
    if (operation.operationType === "LOCK" && input.lockStatus !== "LOCKED") return fail("NFC_LOCK_VERIFICATION_FAILED", "The card did not report a locked state after the lock command");
    if (operation.operationType === "PROTECT" && input.protected !== true) return fail("NFC_PROTECTION_VERIFICATION_FAILED", "The card protection state could not be verified");

    const records = readback.length ? decodeNdefMessage(readback) : [];
    if (["WRITE", "UPDATE", "ERASE"].includes(operation.operationType)) await saveRecords(operation.cardId, records, readback);
    const cardPatch: any = {};
    if (["WRITE", "UPDATE", "ERASE"].includes(operation.operationType)) {
      cardPatch.ndefHash = readbackHash;
      cardPatch.lastWrittenAt = new Date();
      cardPatch.lastReadAt = new Date();
    }
    if (operation.operationType === "LOCK") { cardPatch.lockStatus = "LOCKED"; cardPatch.writable = false; cardPatch.erasable = false; }
    if (operation.operationType === "PROTECT") cardPatch.protectable = false;
    await db.nfcCard.update({ where: { id: operation.cardId }, data: cardPatch });
    const completed = await db.nfcOperation.update({ where: { id: operation.id }, data: {
      status: "SUCCEEDED", readbackNdefHash: readbackHash, hardwareEvidence: safeEvidence(input.hardwareEvidence), completedAt: new Date(), result: { verified: true, records: records.length, bytes: readback.length, lockStatus: input.lockStatus, protected: input.protected },
    } });
    await audit(ctx, "nfc.verification_succeeded", "nfc_operation", operation.id, { operationType: operation.operationType, cardId: operation.cardId, records: records.length, bytes: readback.length });
    const action = ({ WRITE: "nfc.card_written", UPDATE: "nfc.card_updated", ERASE: "nfc.card_erased", LOCK: "nfc.card_locked", PROTECT: "nfc.card_protected" } as const)[operation.operationType as "WRITE" | "UPDATE" | "ERASE" | "LOCK" | "PROTECT"];
    if (action) await audit(ctx, action, "nfc_card", operation.cardId, { operationId: operation.id, verified: true });
    return publicOperation(completed);
  },

  async listOperations(ctx: ActorContext, limit = 100) {
    const rows = await db.nfcOperation.findMany({ where: { organizationId: ctx.organizationId }, include: { card: { select: { id: true, name: true, technology: true, uidMasked: true } }, reader: { select: { id: true, name: true, interfaceType: true } } }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 200) });
    return rows.map(publicOperation);
  },
};
