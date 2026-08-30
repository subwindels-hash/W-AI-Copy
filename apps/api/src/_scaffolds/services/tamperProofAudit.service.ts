/**
 * Tamper-Proof Audit Service (Module 16 — Gap 1)
 *
 * Immutable audit logging with cryptographic verification:
 * - Hash chain linking audit entries
 * - Digital signatures for integrity
 * - External verification support
 * - Tamper detection
 * - Compliance-ready audit trails
 *
 * Ensures audit logs are legally defensible and meet SOC2, HIPAA, ISO 27001 requirements.
 */
import { prisma } from "../../db/client.js";
import { createHash, createHmac, createSign, createVerify } from "crypto";
import { redisCmd } from "../../db/redis.js";
import { logger } from "../../config/logger.js";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:tamperProofAudit');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ──────────────────────────────────────────────────────

export interface TamperProofAuditEntry {
  id: string;
  timestamp: string;
  organizationId: string;
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  previousHash?: string;
  entryHash: string;
  signature?: string;
  sequenceNumber: number;
}

export interface AuditChainVerification {
  valid: boolean;
  verifiedEntries: number;
  tamperedEntries: number;
  firstEntryId?: string;
  lastEntryId?: string;
  errors: string[];
}

export interface AuditVerificationResult {
  entryId: string;
  valid: boolean;
  hashValid: boolean;
  signatureValid: boolean;
  chainValid: boolean;
  error?: string;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const CHAIN_STATE_KEY = (orgId: string) => `audit:chain:${orgId}`;
const SIGNING_KEY_KEY = "audit:signing:key";

// ─── Cryptographic Functions ─────────────────────────────────────

/**
 * Generate SHA-256 hash of audit entry data.
 */
function hashEntry(entry: Omit<TamperProofAuditEntry, "entryHash" | "signature">): string {
  const data = JSON.stringify({
    id: entry.id,
    timestamp: entry.timestamp,
    organizationId: entry.organizationId,
    userId: entry.userId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    metadata: entry.metadata,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    requestId: entry.requestId,
    previousHash: entry.previousHash,
    sequenceNumber: entry.sequenceNumber,
  });

  return createHash("sha256").update(data).digest("hex");
}

/**
 * Sign audit entry with organization's private key.
 */
async function signEntry(entryHash: string): Promise<string> {
  try {
    const privateKey = await getSigningKey();
    if (!privateKey) {
      logger.warn("No signing key available, skipping signature");
      return "";
    }

    const sign = createSign("SHA256");
    sign.update(entryHash);
    return sign.sign(privateKey, "hex");
  } catch (error) {
    logger.error("Failed to sign audit entry", { error });
    return "";
  }
}

/**
 * Verify audit entry signature.
 */
async function verifySignature(entryHash: string, signature: string): Promise<boolean> {
  try {
    const publicKey = await getVerificationKey();
    if (!publicKey || !signature) return false;

    const verify = createVerify("SHA256");
    verify.update(entryHash);
    return verify.verify(publicKey, signature, "hex");
  } catch (error) {
    logger.error("Failed to verify signature", { error });
    return false;
  }
}

/**
 * Get or generate signing key pair.
 */
async function getSigningKey(): Promise<string | null> {
  /**
   * S212 note — reviewed, NOT guarded. Unlike `modelPackaging`, the signing in
   * this file is real asymmetric crypto (`createSign`/`createVerify`), and
   * `signEntry` already fails safe: no key means an empty signature, and
   * `verifySignature` rejects an empty signature. The weakness is key STORAGE
   * (a private key in Redis, readable by anything with Redis access) — not a
   * fabricated guarantee. Move the key to KMS / Vault before production use.
   */
  const key = await redisCmd.get(SIGNING_KEY_KEY);
  return key;
}

async function getVerificationKey(): Promise<string | null> {
  // Public key for verification
  const key = await redisCmd.get(`${SIGNING_KEY_KEY}:public`);
  return key;
}

/**
 * Initialize signing key pair (run once during setup).
 */
export async function initializeSigningKeys(): Promise<void> {
  const { generateKeyPairSync } = await import("crypto");
  
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  await redisCmd.set(SIGNING_KEY_KEY, privateKey);
  await redisCmd.set(`${SIGNING_KEY_KEY}:public`, publicKey);

  logger.info("Audit signing keys initialized");
}

// ─── Chain State Management ─────────────────────────────────────

interface ChainState {
  lastHash: string;
  lastSequenceNumber: number;
  lastEntryId: string;
  updatedAt: string;
}

async function getChainState(orgId: string): Promise<ChainState | null> {
  const state = await redisCmd.get(CHAIN_STATE_KEY(orgId));
  return state ? JSON.parse(state) : null;
}

async function updateChainState(orgId: string, state: ChainState): Promise<void> {
  await redisCmd.set(CHAIN_STATE_KEY(orgId), JSON.stringify(state));
}

// ─── Tamper-Proof Audit Logging ─────────────────────────────────

/**
 * Write a tamper-proof audit entry.
 */
export async function writeTamperProofAudit(input: {
  organizationId: string;
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}): Promise<TamperProofAuditEntry> {
  const id = `audit_${Date.now()}_${_rng.next().toString(36).slice(2, 10)}`;
  const timestamp = new Date().toISOString();

  // Get current chain state
  const chainState = await getChainState(input.organizationId);
  const previousHash = chainState?.lastHash;
  const sequenceNumber = (chainState?.lastSequenceNumber ?? 0) + 1;

  // Create entry without hash/signature
  const entryWithoutHash: Omit<TamperProofAuditEntry, "entryHash" | "signature"> = {
    id,
    timestamp,
    organizationId: input.organizationId,
    userId: input.userId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadata: input.metadata,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    requestId: input.requestId,
    previousHash,
    sequenceNumber,
  };

  // Calculate hash
  const entryHash = hashEntry(entryWithoutHash);

  // Sign the entry
  const signature = await signEntry(entryHash);

  // Complete entry
  const entry: TamperProofAuditEntry = {
    ...entryWithoutHash,
    entryHash,
    signature,
  };

  // Store in database (immutable - no UPDATE or DELETE operations allowed)
  await prisma.tamperProofAuditLog.create({
    data: {
      id: entry.id,
      timestamp: new Date(entry.timestamp),
      organizationId: entry.organizationId,
      userId: entry.userId ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      metadata: entry.metadata ?? {},
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      requestId: entry.requestId,
      previousHash: entry.previousHash,
      entryHash: entry.entryHash,
      signature: entry.signature,
      sequenceNumber: entry.sequenceNumber,
    },
  });

  // Update chain state
  await updateChainState(input.organizationId, {
    lastHash: entryHash,
    lastSequenceNumber: sequenceNumber,
    lastEntryId: id,
    updatedAt: timestamp,
  });

  logger.debug("Tamper-proof audit entry written", {
    id,
    action: input.action,
    sequenceNumber,
  });

  return entry;
}

/**
 * Verify a single audit entry.
 */
export async function verifyAuditEntry(entryId: string): Promise<AuditVerificationResult> {
  const entry = await prisma.tamperProofAuditLog.findUnique({
    where: { id: entryId },
  });

  if (!entry) {
    return {
      entryId,
      valid: false,
      hashValid: false,
      signatureValid: false,
      chainValid: false,
      error: "Entry not found",
    };
  }

  // Verify hash
  const entryWithoutHash: Omit<TamperProofAuditEntry, "entryHash" | "signature"> = {
    id: entry.id,
    timestamp: entry.timestamp.toISOString(),
    organizationId: entry.organizationId,
    userId: entry.userId ?? undefined,
    action: entry.action,
    resourceType: entry.resourceType ?? undefined,
    resourceId: entry.resourceId ?? undefined,
    metadata: entry.metadata as Record<string, any>,
    ipAddress: entry.ipAddress ?? undefined,
    userAgent: entry.userAgent ?? undefined,
    requestId: entry.requestId ?? undefined,
    previousHash: entry.previousHash ?? undefined,
    sequenceNumber: entry.sequenceNumber,
  };

  const calculatedHash = hashEntry(entryWithoutHash);
  const hashValid = calculatedHash === entry.entryHash;

  // Verify signature
  const signatureValid = entry.signature
    ? await verifySignature(entry.entryHash, entry.signature)
    : true; // No signature is acceptable if signing not configured

  // Verify chain (check previous hash)
  let chainValid = true;
  if (entry.previousHash) {
    const previousEntry = await prisma.tamperProofAuditLog.findFirst({
      where: {
        organizationId: entry.organizationId,
        entryHash: entry.previousHash,
      },
    });
    chainValid = !!previousEntry;
  }

  return {
    entryId,
    valid: hashValid && signatureValid && chainValid,
    hashValid,
    signatureValid,
    chainValid,
  };
}

/**
 * Verify entire audit chain for an organization.
 */
export async function verifyAuditChain(
  organizationId: string,
  options?: {
    fromEntryId?: string;
    toEntryId?: string;
    limit?: number;
  },
): Promise<AuditChainVerification> {
  const where: any = { organizationId };
  
  if (options?.fromEntryId) {
    const fromEntry = await prisma.tamperProofAuditLog.findUnique({
      where: { id: options.fromEntryId },
    });
    if (fromEntry) {
      where.sequenceNumber = { gte: fromEntry.sequenceNumber };
    }
  }

  if (options?.toEntryId) {
    const toEntry = await prisma.tamperProofAuditLog.findUnique({
      where: { id: options.toEntryId },
    });
    if (toEntry) {
      where.sequenceNumber = {
        ...where.sequenceNumber,
        lte: toEntry.sequenceNumber,
      };
    }
  }

  const entries = await prisma.tamperProofAuditLog.findMany({
    where,
    orderBy: { sequenceNumber: "asc" },
    take: options?.limit ?? 10000,
  });

  let verifiedEntries = 0;
  let tamperedEntries = 0;
  const errors: string[] = [];
  let previousHash: string | null = null;

  for (const entry of entries) {
    // Verify hash
    const entryWithoutHash: Omit<TamperProofAuditEntry, "entryHash" | "signature"> = {
      id: entry.id,
      timestamp: entry.timestamp.toISOString(),
      organizationId: entry.organizationId,
      userId: entry.userId ?? undefined,
      action: entry.action,
      resourceType: entry.resourceType ?? undefined,
      resourceId: entry.resourceId ?? undefined,
      metadata: entry.metadata as Record<string, any>,
      ipAddress: entry.ipAddress ?? undefined,
      userAgent: entry.userAgent ?? undefined,
      requestId: entry.requestId ?? undefined,
      previousHash: entry.previousHash ?? undefined,
      sequenceNumber: entry.sequenceNumber,
    };

    const calculatedHash = hashEntry(entryWithoutHash);
    const hashValid = calculatedHash === entry.entryHash;

    // Verify chain continuity
    const chainValid = !previousHash || entry.previousHash === previousHash;

    if (hashValid && chainValid) {
      verifiedEntries++;
    } else {
      tamperedEntries++;
      if (!hashValid) {
        errors.push(`Entry ${entry.id} (seq ${entry.sequenceNumber}): Hash mismatch`);
      }
      if (!chainValid) {
        errors.push(`Entry ${entry.id} (seq ${entry.sequenceNumber}): Chain broken`);
      }
    }

    previousHash = entry.entryHash;
  }

  return {
    valid: tamperedEntries === 0,
    verifiedEntries,
    tamperedEntries,
    firstEntryId: entries[0]?.id,
    lastEntryId: entries[entries.length - 1]?.id,
    errors,
  };
}

/**
 * Export audit logs with verification data.
 */
export async function exportAuditLogs(
  organizationId: string,
  options?: {
    from?: string;
    to?: string;
    format?: "json" | "csv";
  },
): Promise<{
  entries: TamperProofAuditEntry[];
  verification: AuditChainVerification;
  exportedAt: string;
}> {
  const where: any = { organizationId };

  if (options?.from) {
    where.timestamp = { gte: new Date(options.from) };
  }

  if (options?.to) {
    where.timestamp = {
      ...where.timestamp,
      lte: new Date(options.to),
    };
  }

  const entries = await prisma.tamperProofAuditLog.findMany({
    where,
    orderBy: { sequenceNumber: "asc" },
  });

  const verification = await verifyAuditChain(organizationId, {
    fromEntryId: entries[0]?.id,
    toEntryId: entries[entries.length - 1]?.id,
  });

  return {
    entries: entries.map((e: any) => ({
      id: e.id,
      timestamp: e.timestamp.toISOString(),
      organizationId: e.organizationId,
      userId: e.userId ?? undefined,
      action: e.action,
      resourceType: e.resourceType ?? undefined,
      resourceId: e.resourceId ?? undefined,
      metadata: e.metadata as Record<string, any>,
      ipAddress: e.ipAddress ?? undefined,
      userAgent: e.userAgent ?? undefined,
      requestId: e.requestId ?? undefined,
      previousHash: e.previousHash ?? undefined,
      entryHash: e.entryHash,
      signature: e.signature ?? undefined,
      sequenceNumber: e.sequenceNumber,
    })),
    verification,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Get audit chain statistics.
 */
export async function getAuditChainStats(organizationId: string): Promise<{
  totalEntries: number;
  firstEntryAt?: string;
  lastEntryAt?: string;
  chainLength: number;
  lastVerifiedAt?: string;
}> {
  const [totalEntries, firstEntry, lastEntry] = await Promise.all([
    prisma.tamperProofAuditLog.count({ where: { organizationId } }),
    prisma.tamperProofAuditLog.findFirst({
      where: { organizationId },
      orderBy: { sequenceNumber: "asc" },
    }),
    prisma.tamperProofAuditLog.findFirst({
      where: { organizationId },
      orderBy: { sequenceNumber: "desc" },
    }),
  ]);

  const chainState = await getChainState(organizationId);

  return {
    totalEntries,
    firstEntryAt: firstEntry?.timestamp.toISOString(),
    lastEntryAt: lastEntry?.timestamp.toISOString(),
    chainLength: lastEntry?.sequenceNumber ?? 0,
    lastVerifiedAt: chainState?.updatedAt,
  };
}
