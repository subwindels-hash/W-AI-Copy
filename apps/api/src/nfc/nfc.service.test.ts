import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeBase64, encodeNdefMessage } from "@windels/shared/nfc";

vi.mock("../audit/audit.service.js", () => ({ auditService: { log: vi.fn(async () => undefined) } }));

const { nfcService } = await import("./nfc.service.js");
const { prisma } = await import("../db/client.js");

const ctx = { userId: "user-admin", organizationId: "org-windels" };
const reader = {
  localId: "pcsc:reader-1",
  name: "Test PC/SC Reader",
  vendor: "Test Vendor",
  product: "Reader 1",
  interfaceType: "PCSC" as const,
  bridgeVersion: "1.0.0-test",
  platform: "test",
  status: "ONLINE" as const,
  capabilities: { pcsc: true },
};
const capability = {
  canRead: true,
  canWrite: true,
  canErase: true,
  canLock: false,
  canProtect: false,
  ndef: true,
  memoryBytes: 504,
  writableBytes: 504,
  lockStatus: "UNLOCKED" as const,
  supportStatus: "UNVERIFIED" as const,
  qualification: "NOT_QUALIFIED" as const,
  source: "PCSC_GET_VERSION" as const,
};

async function qualifiedCard(options: { lock?: boolean } = {}) {
  const reported = await nfcService.reportReader(ctx, reader);
  await nfcService.qualifyReader(ctx, reported.id, {
    technology: "NTAG215",
    hardwareTestRunId: `real-hardware-run-${Date.now()}`,
    testedAt: new Date().toISOString(),
    readerDetectionPassed: true,
    cardDetectionPassed: true,
    readPassed: true,
    writePassed: true,
    verifyPassed: true,
    erasePassed: true,
    lockPassed: options.lock,
  });
  const card = await nfcService.observeCard(ctx, {
    reader,
    hardwareCardKey: `uid-${Date.now()}-${Math.random()}`,
    uid: "04:A1:B2:C3:D4:E5:80",
    technology: "NTAG215",
    identificationConfidence: "PROTOCOL_VERIFIED",
    capabilities: { ...capability, canLock: !!options.lock },
    ndefMessageBase64: "",
    hardwareEvidence: { protocol: "PCSC", uid: "must-not-persist-in-evidence" },
  });
  return { reader: reported, card };
}

beforeEach(async () => {
  await (prisma as any).nfcOperation.deleteMany({ where: { organizationId: ctx.organizationId } });
  await (prisma as any).nfcNdefRecord.deleteMany({});
  await (prisma as any).nfcCard.deleteMany({ where: { organizationId: ctx.organizationId } });
  await (prisma as any).nfcReader.deleteMany({ where: { organizationId: ctx.organizationId } });
});

describe("NFC service safety workflow", () => {
  it("does not claim write support before the exact reader/card pair is qualified", async () => {
    await nfcService.reportReader(ctx, reader);
    const card = await nfcService.observeCard(ctx, {
      reader,
      hardwareCardKey: "unqualified-card",
      uid: "04:01:02:03:04:05:06",
      technology: "NTAG215",
      identificationConfidence: "PROTOCOL_VERIFIED",
      capabilities: capability,
      ndefMessageBase64: "",
    });
    expect(card).toMatchObject({ technology: "NTAG215", supportStatus: "UNVERIFIED", qualification: "NOT_QUALIFIED", writable: false });
    await expect(nfcService.prepareMutation(ctx, {
      operationType: "WRITE", cardId: card.id, readerId: card.readerId, idempotencyKey: "unqualified-write-0001",
      records: [{ kind: "url", value: "https://windels.ai", language: "en" }],
    })).rejects.toThrow(/real-hardware qualification/i);
  });

  it("plans a capacity-checked write and reports success only after exact read-back", async () => {
    const setup = await qualifiedCard();
    const records = [{ kind: "windels_profile" as const, value: "https://app.windels.ai/profile/user-admin", language: "en" }];
    const plan = await nfcService.prepareMutation(ctx, {
      operationType: "WRITE", cardId: setup.card.id, readerId: setup.reader.id,
      idempotencyKey: "verified-write-plan-0001", records,
    });
    expect(plan.writePlan.requiredBytes).toBeLessThanOrEqual(504);
    expect(plan.operation.status).toBe("READY");

    const complete = await nfcService.verifyMutation(ctx, {
      operationId: plan.operation.id,
      operationToken: plan.operationToken,
      hardwareSucceeded: true,
      readbackNdefBase64: encodeBase64(encodeNdefMessage(records)),
      hardwareEvidence: { adapter: "PCSC", verifiedAt: new Date().toISOString() },
    });
    expect(complete).toMatchObject({ status: "SUCCEEDED", result: { verified: true, records: 1 } });
    const card = await nfcService.getCard(ctx, setup.card.id);
    expect(card.records).toHaveLength(1);
    expect(card.records[0].payload.value).toBe("https://app.windels.ai/profile/user-admin");
  });

  it("fails verification when read-back differs and never reports success", async () => {
    const setup = await qualifiedCard();
    const intended = [{ kind: "url" as const, value: "https://windels.ai/intended", language: "en" }];
    const plan = await nfcService.prepareMutation(ctx, {
      operationType: "WRITE", cardId: setup.card.id, readerId: setup.reader.id,
      idempotencyKey: "failed-readback-plan-0001", records: intended,
    });
    const result = await nfcService.verifyMutation(ctx, {
      operationId: plan.operation.id,
      operationToken: plan.operationToken,
      hardwareSucceeded: true,
      readbackNdefBase64: encodeBase64(encodeNdefMessage([{ kind: "url", value: "https://windels.ai/different", language: "en" }])),
    });
    expect(result).toMatchObject({ status: "FAILED", errorCode: "NFC_WRITE_VERIFICATION_FAILED", result: { verified: false } });
  });

  it("blocks oversized content before a hardware command is issued", async () => {
    const setup = await qualifiedCard();
    await expect(nfcService.prepareMutation(ctx, {
      operationType: "WRITE", cardId: setup.card.id, readerId: setup.reader.id,
      idempotencyKey: "oversized-write-plan-0001",
      records: [{ kind: "text", value: "x".repeat(800), language: "en" }],
    })).rejects.toThrow(/exceeds/i);
  });

  it("requires a fresh content hash and confirmation before overwrite", async () => {
    const setup = await qualifiedCard();
    const first = [{ kind: "url" as const, value: "https://windels.ai/first", language: "en" }];
    const plan = await nfcService.prepareMutation(ctx, {
      operationType: "WRITE", cardId: setup.card.id, readerId: setup.reader.id,
      idempotencyKey: "initial-overwrite-plan-0001", records: first,
    });
    await nfcService.verifyMutation(ctx, {
      operationId: plan.operation.id, operationToken: plan.operationToken, hardwareSucceeded: true,
      readbackNdefBase64: encodeBase64(encodeNdefMessage(first)),
    });
    const card = await nfcService.getCard(ctx, setup.card.id);
    await expect(nfcService.prepareMutation(ctx, {
      operationType: "UPDATE", cardId: card.id, readerId: setup.reader.id,
      idempotencyKey: "unsafe-overwrite-plan-0001",
      records: [{ kind: "url", value: "https://windels.ai/second", language: "en" }],
    })).rejects.toThrow(/explicitly confirmed/i);
    await expect(nfcService.prepareMutation(ctx, {
      operationType: "UPDATE", cardId: card.id, readerId: setup.reader.id,
      idempotencyKey: "stale-overwrite-plan-0001", overwriteConfirmed: true, previousNdefHash: "0".repeat(64),
      records: [{ kind: "url", value: "https://windels.ai/second", language: "en" }],
    })).rejects.toThrow(/changed/i);
  });

  it("deduplicates repeated mutation requests by organization and idempotency key", async () => {
    const setup = await qualifiedCard();
    const input = {
      operationType: "WRITE" as const, cardId: setup.card.id, readerId: setup.reader.id,
      idempotencyKey: "same-idempotency-key-0001",
      records: [{ kind: "url" as const, value: "https://windels.ai/idempotent", language: "en" }],
    };
    const first = await nfcService.prepareMutation(ctx, input);
    const second = await nfcService.prepareMutation(ctx, input);
    expect(second).toMatchObject({ duplicate: true, operation: { id: first.operation.id } });
    expect(second.operationToken).toBe(first.operationToken);
  });

  it("records a hardware failure as failed without changing card content", async () => {
    const setup = await qualifiedCard();
    const plan = await nfcService.prepareMutation(ctx, {
      operationType: "WRITE", cardId: setup.card.id, readerId: setup.reader.id,
      idempotencyKey: "hardware-failure-plan-0001",
      records: [{ kind: "url", value: "https://windels.ai/failure", language: "en" }],
    });
    const failed = await nfcService.verifyMutation(ctx, {
      operationId: plan.operation.id, operationToken: plan.operationToken,
      hardwareSucceeded: false, errorCode: "CARD_REMOVED", errorMessage: "Card removed during write",
    });
    expect(failed).toMatchObject({ status: "FAILED", errorCode: "CARD_REMOVED", result: { verified: false } });
    expect((await nfcService.getCard(ctx, setup.card.id)).records).toHaveLength(0);
  });

  it("verifies erase as an exact empty read-back", async () => {
    const setup = await qualifiedCard();
    const first = [{ kind: "url" as const, value: "https://windels.ai/erase", language: "en" }];
    const write = await nfcService.prepareMutation(ctx, {
      operationType: "WRITE", cardId: setup.card.id, readerId: setup.reader.id,
      idempotencyKey: "erase-prereq-write-0001", records: first,
    });
    await nfcService.verifyMutation(ctx, { operationId: write.operation.id, operationToken: write.operationToken, hardwareSucceeded: true, readbackNdefBase64: encodeBase64(encodeNdefMessage(first)) });
    const card = await nfcService.getCard(ctx, setup.card.id);
    const erase = await nfcService.prepareMutation(ctx, {
      operationType: "ERASE", cardId: card.id, readerId: setup.reader.id,
      idempotencyKey: "verified-erase-plan-0001", previousNdefHash: card.ndefHash!, overwriteConfirmed: true,
    });
    const result = await nfcService.verifyMutation(ctx, { operationId: erase.operation.id, operationToken: erase.operationToken, hardwareSucceeded: true, readbackNdefBase64: "" });
    expect(result).toMatchObject({ status: "SUCCEEDED", result: { verified: true, records: 0 } });
    expect((await nfcService.getCard(ctx, card.id)).records).toHaveLength(0);
  });

  it("requires the irreversible phrase and verifies lock state", async () => {
    const setup = await qualifiedCard({ lock: true });
    await expect(nfcService.prepareMutation(ctx, {
      operationType: "LOCK", cardId: setup.card.id, readerId: setup.reader.id,
      idempotencyKey: "unsafe-lock-plan-0001", irreversibleConfirmed: true, confirmationPhrase: "yes",
    })).rejects.toThrow(/LOCK PERMANENTLY/);
    const lock = await nfcService.prepareMutation(ctx, {
      operationType: "LOCK", cardId: setup.card.id, readerId: setup.reader.id,
      idempotencyKey: "safe-lock-plan-0001", irreversibleConfirmed: true, confirmationPhrase: "LOCK PERMANENTLY",
    });
    const result = await nfcService.verifyMutation(ctx, { operationId: lock.operation.id, operationToken: lock.operationToken, hardwareSucceeded: true, lockStatus: "LOCKED" });
    expect(result.status).toBe("SUCCEEDED");
    expect(await nfcService.getCard(ctx, setup.card.id)).toMatchObject({ lockStatus: "LOCKED", writable: false, erasable: false });
  });
});
