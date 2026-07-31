/**
 * PII Detection & Classification Service (Module 17 — Gap 1)
 *
 * Automatic PII detection and classification:
 * - Detect PII in text, documents, and structured data
 * - Classify PII types (email, phone, SSN, credit card, etc.)
 * - Identify sensitive data categories (health, financial, biometric)
 * - Scan database fields for PII
 * - PII inventory and catalog
 * - Integration with data governance
 *
 * Enables automatic PII protection and GDPR/HIPAA compliance.
 */
import { prisma } from "../db/client.js";
import { redisCmd } from "../db/redis.js";
import { logger } from "../config/logger.js";

// ─── Types ──────────────────────────────────────────────────────

export type PIIType =
  | "email"
  | "phone"
  | "ssn"
  | "credit_card"
  | "passport"
  | "drivers_license"
  | "bank_account"
  | "ip_address"
  | "mac_address"
  | "date_of_birth"
  | "medical_record"
  | "health_insurance"
  | "biometric"
  | "signature"
  | "name"
  | "address"
  | "gender"
  | "race"
  | "religion"
  | "sexual_orientation"
  | "political_opinion"
  | "criminal_record"
  | "custom";

export type PIISensitivity = "low" | "medium" | "high" | "critical";

export type PIICategory = "personal" | "financial" | "health" | "biometric" | "demographic" | "behavioral";

export interface PIIDetection {
  id: string;
  type: PIIType;
  value: string; // The detected PII value
  maskedValue: string; // Masked version
  confidence: number; // 0-1
  sensitivity: PIISensitivity;
  category: PIICategory;
  location: {
    source: "text" | "database" | "document" | "api_response";
    field?: string;
    table?: string;
    document?: string;
    position?: { start: number; end: number };
  };
  detectedAt: string;
  context?: string; // Surrounding text for context
}

export interface PIIScanResult {
  scanId: string;
  source: string;
  totalPIIFound: number;
  byType: Record<PIIType, number>;
  bySensitivity: Record<PIISensitivity, number>;
  byCategory: Record<PIICategory, number>;
  detections: PIIDetection[];
  scannedAt: string;
  durationMs: number;
}

export interface PIIInventory {
  id: string;
  organizationId: string;
  tableName: string;
  fieldName: string;
  fieldType: string;
  piiType?: PIIType;
  sensitivity?: PIISensitivity;
  category?: PIICategory;
  sampleValue?: string;
  encrypted: boolean;
  masked: boolean;
  accessCount: number;
  lastScannedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── PII Patterns ───────────────────────────────────────────────

const PII_PATTERNS: Array<{
  type: PIIType;
  pattern: RegExp;
  sensitivity: PIISensitivity;
  category: PIICategory;
  mask: (value: string) => string;
}> = [
  {
    type: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    sensitivity: "medium",
    category: "personal",
    mask: (v) => {
      const [user, domain] = v.split("@");
      return `${user[0]}***@${domain}`;
    },
  },
  {
    type: "phone",
    pattern: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    sensitivity: "medium",
    category: "personal",
    mask: (v) => v.replace(/\d(?=\d{4})/g, "*"),
  },
  {
    type: "ssn",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    sensitivity: "critical",
    category: "personal",
    mask: (v) => `***-**-${v.slice(-4)}`,
  },
  {
    type: "credit_card",
    pattern: /\b(?:\d[ -]*?){13,16}\b/g,
    sensitivity: "critical",
    category: "financial",
    mask: (v) => {
      const digits = v.replace(/\D/g, "");
      return `****-****-****-${digits.slice(-4)}`;
    },
  },
  {
    type: "ip_address",
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    sensitivity: "low",
    category: "personal",
    mask: (v) => {
      const parts = v.split(".");
      return `${parts[0]}.${parts[1]}.*.*`;
    },
  },
  {
    type: "date_of_birth",
    pattern: /\b(?:19|20)\d{2}[-/.](?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01])\b/g,
    sensitivity: "high",
    category: "demographic",
    mask: (v) => `****${v.slice(-5)}`,
  },
  {
    type: "passport",
    pattern: /\b[A-Z]{1,2}\d{6,9}\b/g,
    sensitivity: "critical",
    category: "personal",
    mask: (v) => `${v[0]}***${v.slice(-3)}`,
  },
  {
    type: "drivers_license",
    pattern: /\b[A-Z]\d{7,15}\b/g,
    sensitivity: "high",
    category: "personal",
    mask: (v) => `${v[0]}***${v.slice(-4)}`,
  },
  {
    type: "bank_account",
    pattern: /\b\d{8,17}\b/g,
    sensitivity: "critical",
    category: "financial",
    mask: (v) => `****${v.slice(-4)}`,
  },
  {
    type: "medical_record",
    pattern: /\bMRN[-:\s]?\d{6,10}\b/gi,
    sensitivity: "critical",
    category: "health",
    mask: (v) => `MRN-****${v.slice(-4)}`,
  },
  {
    type: "health_insurance",
    pattern: /\b[A-Z]{3}\d{9,12}\b/g,
    sensitivity: "critical",
    category: "health",
    mask: (v) => `${v.slice(0, 3)}****${v.slice(-4)}`,
  },
];

// ─── Redis Keys ─────────────────────────────────────────────────

const PII_INVENTORY_KEY = (orgId: string) => `pii:inventory:${orgId}`;
const PII_SCAN_HISTORY_KEY = (orgId: string) => `pii:scans:${orgId}`;

// ─── PII Detection ──────────────────────────────────────────────

/**
 * Detect PII in text.
 */
export function detectPIIInText(
  text: string,
  options?: {
    source?: string;
    field?: string;
    contextWindow?: number;
  },
): PIIDetection[] {
  const detections: PIIDetection[] = [];
  const contextWindow = options?.contextWindow ?? 50;

  for (const pattern of PII_PATTERNS) {
    const matches = text.matchAll(pattern.pattern);

    for (const match of matches) {
      const value = match[0];
      const start = match.index ?? 0;
      const end = start + value.length;

      // Get context
      const contextStart = Math.max(0, start - contextWindow);
      const contextEnd = Math.min(text.length, end + contextWindow);
      const context = text.slice(contextStart, contextEnd);

      detections.push({
        id: `pii_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        type: pattern.type,
        value,
        maskedValue: pattern.mask(value),
        confidence: 0.95, // Pattern-based detection is high confidence
        sensitivity: pattern.sensitivity,
        category: pattern.category,
        location: {
          source: "text",
          field: options?.field,
          position: { start, end },
        },
        detectedAt: new Date().toISOString(),
        context,
      });
    }
  }

  return detections;
}

/**
 * Detect PII in structured data (object).
 */
export function detectPIIInObject(
  obj: Record<string, any>,
  options?: {
    source?: string;
    table?: string;
  },
): PIIDetection[] {
  const detections: PIIDetection[] = [];

  for (const [field, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      const fieldDetections = detectPIIInText(value, {
        source: options?.source,
        field,
      });

      // Update location with table info
      fieldDetections.forEach(d => {
        d.location.table = options?.table;
      });

      detections.push(...fieldDetections);
    } else if (typeof value === "object" && value !== null) {
      // Recursively scan nested objects
      const nestedDetections = detectPIIInObject(value, {
        source: options?.source,
        table: options?.table,
      });

      // Update field path
      nestedDetections.forEach(d => {
        d.location.field = `${field}.${d.location.field}`;
      });

      detections.push(...nestedDetections);
    }
  }

  return detections;
}

/**
 * Scan a database table for PII.
 */
export async function scanDatabaseTable(
  organizationId: string,
  tableName: string,
  options?: {
    sampleSize?: number;
    fields?: string[];
  },
): Promise<PIIScanResult> {
  const startTime = Date.now();
  const scanId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const sampleSize = options?.sampleSize ?? 100;

  // Get sample records
  const records = await prisma.$queryRawUnsafe(
    `SELECT * FROM "${tableName}" LIMIT ${sampleSize}`
  ) as Record<string, any>[];

  const allDetections: PIIDetection[] = [];
  const byType: Record<string, number> = {};
  const bySensitivity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const record of records) {
    const detections = detectPIIInObject(record, {
      source: "database",
      table: tableName,
    });

    for (const detection of detections) {
      allDetections.push(detection);

      byType[detection.type] = (byType[detection.type] ?? 0) + 1;
      bySensitivity[detection.sensitivity] = (bySensitivity[detection.sensitivity] ?? 0) + 1;
      byCategory[detection.category] = (byCategory[detection.category] ?? 0) + 1;

      // Update PII inventory
      await updatePIIInventory(organizationId, tableName, detection);
    }
  }

  const result: PIIScanResult = {
    scanId,
    source: `database:${tableName}`,
    totalPIIFound: allDetections.length,
    byType: byType as Record<PIIType, number>,
    bySensitivity: bySensitivity as Record<PIISensitivity, number>,
    byCategory: byCategory as Record<PIICategory, number>,
    detections: allDetections,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };

  // Store scan result
  await redisCmd.lpush(PII_SCAN_HISTORY_KEY(organizationId), JSON.stringify(result));
  await redisCmd.ltrim(PII_SCAN_HISTORY_KEY(organizationId), 0, 99); // Keep last 100 scans

  logger.info("Database table scanned for PII", {
    scanId,
    tableName,
    totalPIIFound: allDetections.length,
    durationMs: result.durationMs,
  });

  return result;
}

/**
 * Scan all tables in organization's database.
 */
export async function scanAllTables(
  organizationId: string,
  options?: {
    sampleSize?: number;
  },
): Promise<PIIScanResult[]> {
  // Get list of tables
  const tables = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  ` as Array<{ table_name: string }>;

  const results: PIIScanResult[] = [];

  for (const { table_name } of tables) {
    try {
      const result = await scanDatabaseTable(organizationId, table_name, options);
      results.push(result);
    } catch (error) {
      logger.error("Failed to scan table", { tableName: table_name, error });
    }
  }

  return results;
}

// ─── PII Inventory Management ───────────────────────────────────

/**
 * Update PII inventory with detected PII.
 */
async function updatePIIInventory(
  organizationId: string,
  tableName: string,
  detection: PIIDetection,
): Promise<void> {
  const field = detection.location.field;
  if (!field) return;

  const inventoryId = `${tableName}.${field}`;

  // Check if inventory entry exists
  const existing = await prisma.pIIInventory.findUnique({
    where: { id: inventoryId },
  });

  if (existing) {
    // Update existing entry
    await prisma.pIIInventory.update({
      where: { id: inventoryId },
      data: {
        piiType: detection.type,
        sensitivity: detection.sensitivity,
        category: detection.category,
        sampleValue: detection.maskedValue,
        lastScannedAt: new Date(),
        accessCount: { increment: 1 },
      },
    });
  } else {
    // Create new entry
    await prisma.pIIInventory.create({
      data: {
        id: inventoryId,
        organizationId,
        tableName,
        fieldName: field,
        fieldType: "text", // Would need to query actual type
        piiType: detection.type,
        sensitivity: detection.sensitivity,
        category: detection.category,
        sampleValue: detection.maskedValue,
        encrypted: false,
        masked: false,
        accessCount: 1,
        lastScannedAt: new Date(),
      },
    });
  }
}

/**
 * Get PII inventory for organization.
 */
export async function getPIIInventory(
  organizationId: string,
  filter?: {
    tableName?: string;
    sensitivity?: PIISensitivity;
    category?: PIICategory;
  },
): Promise<PIIInventory[]> {
  const where: any = { organizationId };

  if (filter?.tableName) {
    where.tableName = filter.tableName;
  }

  if (filter?.sensitivity) {
    where.sensitivity = filter.sensitivity;
  }

  if (filter?.category) {
    where.category = filter.category;
  }

  return prisma.pIIInventory.findMany({
    where,
    orderBy: [{ sensitivity: "desc" }, { tableName: "asc" }, { fieldName: "asc" }],
  });
}

/**
 * Get PII inventory statistics.
 */
export async function getPIIInventoryStats(
  organizationId: string,
): Promise<{
  totalFields: number;
  piiFields: number;
  bySensitivity: Record<PIISensitivity, number>;
  byCategory: Record<PIICategory, number>;
  byType: Record<PIIType, number>;
  encryptedCount: number;
  maskedCount: number;
  unprotectedCount: number;
}> {
  const inventory = await getPIIInventory(organizationId);

  const bySensitivity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let encryptedCount = 0;
  let maskedCount = 0;

  for (const item of inventory) {
    if (item.sensitivity) {
      bySensitivity[item.sensitivity] = (bySensitivity[item.sensitivity] ?? 0) + 1;
    }
    if (item.category) {
      byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    }
    if (item.piiType) {
      byType[item.piiType] = (byType[item.piiType] ?? 0) + 1;
    }
    if (item.encrypted) encryptedCount++;
    if (item.masked) maskedCount++;
  }

  const piiFields = inventory.filter(i => i.piiType).length;
  const unprotectedCount = piiFields - encryptedCount - maskedCount;

  return {
    totalFields: inventory.length,
    piiFields,
    bySensitivity: bySensitivity as Record<PIISensitivity, number>,
    byCategory: byCategory as Record<PIICategory, number>,
    byType: byType as Record<PIIType, number>,
    encryptedCount,
    maskedCount,
    unprotectedCount,
  };
}

// ─── PII Protection Recommendations ─────────────────────────────

/**
 * Get PII protection recommendations.
 */
export async function getPIIRecommendations(
  organizationId: string,
): Promise<Array<{
  tableName: string;
  fieldName: string;
  piiType: PIIType;
  sensitivity: PIISensitivity;
  recommendation: string;
  priority: "low" | "medium" | "high" | "critical";
}>> {
  const inventory = await getPIIInventory(organizationId, {
    sensitivity: undefined, // Get all
  });

  const recommendations: Array<{
    tableName: string;
    fieldName: string;
    piiType: PIIType;
    sensitivity: PIISensitivity;
    recommendation: string;
    priority: "low" | "medium" | "high" | "critical";
  }> = [];

  for (const item of inventory) {
    if (!item.piiType || !item.sensitivity) continue;

    // Unprotected critical/high sensitivity PII
    if (!item.encrypted && !item.masked) {
      if (item.sensitivity === "critical" || item.sensitivity === "high") {
        recommendations.push({
          tableName: item.tableName,
          fieldName: item.fieldName,
          piiType: item.piiType,
          sensitivity: item.sensitivity,
          recommendation: `Encrypt ${item.piiType} field using AES-256-GCM`,
          priority: item.sensitivity === "critical" ? "critical" : "high",
        });
      } else if (item.sensitivity === "medium") {
        recommendations.push({
          tableName: item.tableName,
          fieldName: item.fieldName,
          piiType: item.piiType,
          sensitivity: item.sensitivity,
          recommendation: `Apply data masking for ${item.piiType} in non-production environments`,
          priority: "medium",
        });
      }
    }

    // High access count without encryption
    if (item.accessCount > 1000 && !item.encrypted && item.sensitivity !== "low") {
      recommendations.push({
        tableName: item.tableName,
        fieldName: item.fieldName,
        piiType: item.piiType,
        sensitivity: item.sensitivity,
        recommendation: `High access count (${item.accessCount}) - consider encryption or access controls`,
        priority: "medium",
      });
    }
  }

  return recommendations.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}
