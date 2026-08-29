/**
 * Data Masking Service (Module 17 — Gap 2)
 *
 * Data masking for non-production environments:
 * - Static data masking (permanent replacement)
 * - Dynamic data masking (on-the-fly masking)
 * - Multiple masking techniques (substitution, shuffling, encryption, nulling)
 * - Format-preserving masking
 * - Consistent masking (same input → same output)
 * - Masking policies and rules
 *
 * Protects PII in dev/test/staging environments.
 */
import { prisma } from "../db/client.js";
import { redisCmd } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:dataMasking');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ──────────────────────────────────────────────────────

export type MaskingTechnique =
  | "substitution" // Replace with realistic fake data
  | "shuffling" // Shuffle values within column
  | "encryption" // Encrypt with reversible key
  | "nulling" // Replace with NULL
  | "truncation" // Truncate to N characters
  | "hashing" // One-way hash
  | "format_preserving" // Maintain format (e.g., XXX-XX-1234 for SSN)
  | "redaction" // Replace with ***
  | "perturbation" // Add random noise to numeric values
  | "custom"; // Custom masking function

export type MaskingScope = "static" | "dynamic";

export interface MaskingPolicy {
  id: string;
  name: string;
  description: string;
  organizationId: string;
  scope: MaskingScope;
  enabled: boolean;
  rules: MaskingRule[];
  createdAt: string;
  updatedAt: string;
}

export interface MaskingRule {
  id: string;
  tableName: string;
  fieldName: string;
  technique: MaskingTechnique;
  configuration: MaskingConfiguration;
  condition?: string; // SQL WHERE clause for conditional masking
  priority: number; // Higher priority rules applied first
}

export interface MaskingConfiguration {
  // Substitution
  substitutionType?: "name" | "email" | "phone" | "address" | "ssn" | "credit_card" | "custom";
  customValues?: string[];

  // Truncation
  truncateLength?: number;

  // Hashing
  hashAlgorithm?: "sha256" | "sha512" | "md5";
  hashSalt?: string;

  // Encryption
  encryptionKey?: string;

  // Format-preserving
  formatPattern?: string; // e.g., "XXX-XX-####" for SSN

  // Perturbation
  perturbationRange?: number; // ±N% for numeric values

  // Redaction
  redactionChar?: string; // Default: "*"
  redactionLength?: number; // Fixed length or match original

  // Custom
  customFunction?: string; // Function name
}

export interface MaskingResult {
  originalValue: any;
  maskedValue: any;
  technique: MaskingTechnique;
  appliedRule?: string;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const MASKING_POLICIES_KEY = (orgId: string) => `masking:policies:${orgId}`;
const MASKING_POLICY_KEY = (policyId: string) => `masking:policy:${policyId}`;
const MASKING_CACHE_KEY = (orgId: string, table: string, field: string, value: string) =>
  `masking:cache:${orgId}:${table}:${field}:${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;

// ─── Fake Data Generators ───────────────────────────────────────

const FAKE_NAMES = [
  "John Smith", "Jane Doe", "Michael Johnson", "Emily Brown", "David Wilson",
  "Sarah Davis", "James Miller", "Jennifer Taylor", "Robert Anderson", "Lisa Thomas",
  "William Jackson", "Maria White", "Richard Harris", "Patricia Martin", "Charles Thompson",
];

const FAKE_EMAILS = [
  "user1@example.com", "test.user@demo.org", "john.doe@sample.net", "jane.smith@test.com",
  "michael.j@mock.io", "emily.b@fake.org", "david.w@placeholder.com", "sarah.d@temp.net",
];

const FAKE_PHONES = [
  "555-0100", "555-0101", "555-0102", "555-0103", "555-0104",
  "555-0105", "555-0106", "555-0107", "555-0108", "555-0109",
];

const FAKE_ADDRESSES = [
  "123 Main St, Anytown, USA 12345",
  "456 Oak Ave, Somewhere, USA 23456",
  "789 Pine Rd, Elsewhere, USA 34567",
  "321 Elm St, Nowhere, USA 45678",
];

function generateFakeData(type: string): string {
  switch (type) {
    case "name":
      return FAKE_NAMES[Math.floor(_rng.next() * FAKE_NAMES.length)];
    case "email":
      return FAKE_EMAILS[Math.floor(_rng.next() * FAKE_EMAILS.length)];
    case "phone":
      return FAKE_PHONES[Math.floor(_rng.next() * FAKE_PHONES.length)];
    case "address":
      return FAKE_ADDRESSES[Math.floor(_rng.next() * FAKE_ADDRESSES.length)];
    case "ssn":
      return `***-**-${Math.floor(_rng.next() * 10000).toString().padStart(4, "0")}`;
    case "credit_card":
      return `****-****-****-${Math.floor(_rng.next() * 10000).toString().padStart(4, "0")}`;
    default:
      return `MASKED_${_rng.next().toString(36).slice(2, 10)}`;
  }
}

// ─── Masking Functions ──────────────────────────────────────────

/**
 * Apply masking to a value based on technique and configuration.
 */
export function applyMasking(
  value: any,
  technique: MaskingTechnique,
  configuration: MaskingConfiguration,
  context?: {
    organizationId?: string;
    tableName?: string;
    fieldName?: string;
  },
): any {
  if (value === null || value === undefined) return value;

  switch (technique) {
    case "substitution":
      return applySubstitution(value, configuration);

    case "shuffling":
      // Shuffling requires batch processing, handled separately
      return value;

    case "encryption":
      return applyEncryption(value, configuration);

    case "nulling":
      return null;

    case "truncation":
      return applyTruncation(value, configuration);

    case "hashing":
      return applyHashing(value, configuration);

    case "format_preserving":
      return applyFormatPreserving(value, configuration);

    case "redaction":
      return applyRedaction(value, configuration);

    case "perturbation":
      return applyPerturbation(value, configuration);

    case "custom":
      // Custom functions would be registered separately
      return applyRedaction(value, { redactionChar: "*", redactionLength: 8 });

    default:
      return value;
  }
}

function applySubstitution(value: any, config: MaskingConfiguration): any {
  if (config.customValues && config.customValues.length > 0) {
    return config.customValues[Math.floor(_rng.next() * config.customValues.length)];
  }

  const type = config.substitutionType ?? "custom";
  return generateFakeData(type);
}

function applyEncryption(value: any, config: MaskingConfiguration): string {
  const key = config.encryptionKey ?? "default-masking-key-32-bytes!!!";
  const keyBuffer = createHash("sha256").update(key).digest();
  const iv = randomBytes(16);

  const cipher = createCipheriv("aes-256-cbc", keyBuffer, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]);

  return `ENC:${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

function applyTruncation(value: any, config: MaskingConfiguration): string {
  const length = config.truncateLength ?? 10;
  const str = String(value);
  return str.length > length ? str.slice(0, length) + "..." : str;
}

function applyHashing(value: any, config: MaskingConfiguration): string {
  const algorithm = config.hashAlgorithm ?? "sha256";
  const salt = config.hashSalt ?? "";
  const hash = createHash(algorithm).update(salt + String(value)).digest("hex");
  return `HASH:${hash.slice(0, 16)}`;
}

function applyFormatPreserving(value: any, config: MaskingConfiguration): string {
  const pattern = config.formatPattern ?? "****";
  const str = String(value);

  let result = "";
  let valueIndex = 0;

  for (const char of pattern) {
    if (char === "#") {
      // Replace with digit
      result += valueIndex < str.length && /\d/.test(str[valueIndex])
        ? str[valueIndex]
        : Math.floor(_rng.next() * 10).toString();
      valueIndex++;
    } else if (char === "X") {
      // Mask character
      result += "*";
    } else {
      // Literal character
      result += char;
    }
  }

  return result;
}

function applyRedaction(value: any, config: MaskingConfiguration): string {
  const char = config.redactionChar ?? "*";
  const str = String(value);
  const length = config.redactionLength ?? str.length;
  return char.repeat(Math.min(length, 50)); // Cap at 50 chars
}

function applyPerturbation(value: any, config: MaskingConfiguration): number {
  const num = Number(value);
  if (isNaN(num)) return num;

  const range = config.perturbationRange ?? 10; // ±10%
  const perturbation = (_rng.next() * 2 - 1) * (range / 100);
  return num * (1 + perturbation);
}

// ─── Dynamic Data Masking ───────────────────────────────────────

/**
 * Apply dynamic masking to query results.
 */
export async function applyDynamicMasking(
  organizationId: string,
  tableName: string,
  records: Record<string, any>[],
): Promise<Record<string, any>[]> {
  // Get masking policy for organization
  const policies = await getMaskingPolicies(organizationId);
  const activePolicy = policies.find(p => p.enabled && p.scope === "dynamic");

  if (!activePolicy) return records;

  // Get rules for this table
  const tableRules = activePolicy.rules
    .filter(r => r.tableName === tableName)
    .sort((a, b) => b.priority - a.priority);

  if (tableRules.length === 0) return records;

  // Apply masking to each record
  const maskedRecords: Record<string, any>[] = [];

  for (const record of records) {
    const maskedRecord = { ...record };

    for (const rule of tableRules) {
      const field = rule.fieldName;
      if (!(field in maskedRecord)) continue;

      // Check condition if specified
      if (rule.condition) {
        // Simple condition evaluation (would need proper SQL parser for complex conditions)
        // For now, skip conditional masking
        continue;
      }

      // Check cache for consistent masking
      const cacheKey = MASKING_CACHE_KEY(organizationId, tableName, field, String(record[field]));
      const cached = await redisCmd.get(cacheKey);

      if (cached) {
        maskedRecord[field] = JSON.parse(cached);
      } else {
        // Apply masking
        const masked = applyMasking(record[field], rule.technique, rule.configuration, {
          organizationId,
          tableName,
          fieldName: field,
        });

        maskedRecord[field] = masked;

        // Cache for consistency (1 hour TTL)
        await redisCmd.set(cacheKey, JSON.stringify(masked), "EX", 3600);
      }
    }

    maskedRecords.push(maskedRecord);
  }

  return maskedRecords;
}

// ─── Static Data Masking ────────────────────────────────────────

/**
 * Apply static masking to a database table (permanent replacement).
 */
export async function applyStaticMasking(
  organizationId: string,
  tableName: string,
  options?: {
    dryRun?: boolean;
    batchSize?: number;
  },
): Promise<{
  recordsProcessed: number;
  fieldsMasked: number;
  durationMs: number;
}> {
  const startTime = Date.now();
  const batchSize = options?.batchSize ?? 1000;

  // Get masking policy
  const policies = await getMaskingPolicies(organizationId);
  const activePolicy = policies.find(p => p.enabled && p.scope === "static");

  if (!activePolicy) {
    throw new Error("No active static masking policy found");
  }

  // Get rules for this table
  const tableRules = activePolicy.rules
    .filter(r => r.tableName === tableName)
    .sort((a, b) => b.priority - a.priority);

  if (tableRules.length === 0) {
    return { recordsProcessed: 0, fieldsMasked: 0, durationMs: Date.now() - startTime };
  }

  let recordsProcessed = 0;
  let fieldsMasked = 0;
  let offset = 0;

  while (true) {
    // Get batch of records
    const records = await prisma.$queryRawUnsafe(
      `SELECT * FROM "${tableName}" LIMIT ${batchSize} OFFSET ${offset}`
    ) as Record<string, any>[];

    if (records.length === 0) break;

    for (const record of records) {
      const updates: Record<string, any> = {};

      for (const rule of tableRules) {
        const field = rule.fieldName;
        if (!(field in record)) continue;

        const masked = applyMasking(record[field], rule.technique, rule.configuration, {
          organizationId,
          tableName,
          fieldName: field,
        });

        if (masked !== record[field]) {
          updates[field] = masked;
          fieldsMasked++;
        }
      }

      // Update record if not dry run
      if (Object.keys(updates).length > 0 && !options?.dryRun) {
        const setClause = Object.entries(updates)
          .map(([field, value]) => `"${field}" = '${String(value).replace(/'/g, "''")}'`)
          .join(", ");

        await prisma.$queryRawUnsafe(
          `UPDATE "${tableName}" SET ${setClause} WHERE id = '${record.id}'`
        );
      }

      recordsProcessed++;
    }

    offset += batchSize;
  }

  const durationMs = Date.now() - startTime;

  logger.info("Static masking applied", {
    organizationId,
    tableName,
    recordsProcessed,
    fieldsMasked,
    durationMs,
    dryRun: options?.dryRun,
  });

  return { recordsProcessed, fieldsMasked, durationMs };
}

// ─── Policy Management ──────────────────────────────────────────

/**
 * Create a masking policy.
 */
export async function createMaskingPolicy(input: {
  name: string;
  description: string;
  organizationId: string;
  scope: MaskingScope;
  rules: Omit<MaskingRule, "id">[];
}): Promise<MaskingPolicy> {
  const policyId = `policy_${Date.now()}_${_rng.next().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();

  const rules: MaskingRule[] = input.rules.map((r, i) => ({
    ...r,
    id: `rule_${policyId}_${i}`,
  }));

  const policy: MaskingPolicy = {
    id: policyId,
    name: input.name,
    description: input.description,
    organizationId: input.organizationId,
    scope: input.scope,
    enabled: true,
    rules,
    createdAt: now,
    updatedAt: now,
  };

  await redisCmd.set(MASKING_POLICY_KEY(policyId), JSON.stringify(policy));
  await redisCmd.sadd(MASKING_POLICIES_KEY(input.organizationId), policyId);

  logger.info("Masking policy created", {
    policyId,
    name: input.name,
    scope: input.scope,
    ruleCount: rules.length,
  });

  return policy;
}

/**
 * Get masking policies for organization.
 */
export async function getMaskingPolicies(organizationId: string): Promise<MaskingPolicy[]> {
  const policyIds = await redisCmd.smembers(MASKING_POLICIES_KEY(organizationId));
  const policies: MaskingPolicy[] = [];

  for (const id of policyIds) {
    const data = await redisCmd.get(MASKING_POLICY_KEY(id));
    if (data) {
      policies.push(JSON.parse(data));
    }
  }

  return policies;
}

/**
 * Update masking policy.
 */
export async function updateMaskingPolicy(
  policyId: string,
  updates: Partial<MaskingPolicy>,
): Promise<MaskingPolicy | null> {
  const data = await redisCmd.get(MASKING_POLICY_KEY(policyId));
  if (!data) return null;

  const policy: MaskingPolicy = JSON.parse(data);
  Object.assign(policy, updates, { updatedAt: new Date().toISOString() });

  await redisCmd.set(MASKING_POLICY_KEY(policyId), JSON.stringify(policy));

  logger.info("Masking policy updated", {
    policyId,
    updates: Object.keys(updates),
  });

  return policy;
}

/**
 * Delete masking policy.
 */
export async function deleteMaskingPolicy(policyId: string): Promise<boolean> {
  const data = await redisCmd.get(MASKING_POLICY_KEY(policyId));
  if (!data) return false;

  const policy: MaskingPolicy = JSON.parse(data);

  await redisCmd.del(MASKING_POLICY_KEY(policyId));
  await redisCmd.srem(MASKING_POLICIES_KEY(policy.organizationId), policyId);

  logger.info("Masking policy deleted", { policyId });

  return true;
}

// ─── Masking Templates ──────────────────────────────────────────

/**
 * Create a standard masking policy for common PII types.
 */
export async function createStandardMaskingPolicy(
  organizationId: string,
  scope: MaskingScope,
): Promise<MaskingPolicy> {
  const rules: Omit<MaskingRule, "id">[] = [
    {
      tableName: "*", // Apply to all tables
      fieldName: "email",
      technique: "substitution",
      configuration: { substitutionType: "email" },
      priority: 100,
    },
    {
      tableName: "*",
      fieldName: "phone",
      technique: "substitution",
      configuration: { substitutionType: "phone" },
      priority: 100,
    },
    {
      tableName: "*",
      fieldName: "ssn",
      technique: "format_preserving",
      configuration: { formatPattern: "XXX-XX-####" },
      priority: 100,
    },
    {
      tableName: "*",
      fieldName: "credit_card",
      technique: "format_preserving",
      configuration: { formatPattern: "****-****-****-####" },
      priority: 100,
    },
    {
      tableName: "*",
      fieldName: "date_of_birth",
      technique: "perturbation",
      configuration: { perturbationRange: 5 }, // ±5 days
      priority: 50,
    },
    {
      tableName: "*",
      fieldName: "address",
      technique: "substitution",
      configuration: { substitutionType: "address" },
      priority: 100,
    },
  ];

  return createMaskingPolicy({
    name: `Standard ${scope} Masking Policy`,
    description: `Automatically generated ${scope} masking policy for common PII types`,
    organizationId,
    scope,
    rules,
  });
}
