/**
 * Backup Verification Service (Module 19 — Gap 2)
 *
 * Validate backups are complete, consistent, and restorable:
 * - Checksum verification (SHA-256)
 * - Backup integrity checks
 * - Test restore to temporary database
 * - Data consistency validation
 * - Verification scheduling
 * - Verification reporting
 *
 * Ensures backups can actually be used for recovery.
 */
import { prisma } from "../db/client.js";
import { redisCmd } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { exec } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:backupVerification');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


const execAsync = promisify(exec);

// ─── Types ──────────────────────────────────────────────────────

export type VerificationStatus = "pending" | "running" | "passed" | "failed";

export interface BackupVerification {
  id: string;
  backupId: string;
  status: VerificationStatus;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  checksumMatch: boolean;
  integrityCheck: boolean;
  restoreTest: boolean;
  dataConsistency: boolean;
  overallPassed: boolean;
  errorMessage?: string;
  details?: Record<string, any>;
  createdAt: string;
}

export interface VerificationPolicy {
  id: string;
  name: string;
  enabled: boolean;
  verifyAfterBackup: boolean;
  verificationSchedule?: string; // Cron expression for periodic verification
  performRestoreTest: boolean;
  restoreTestDatabase?: string;
  dataConsistencyChecks: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const VERIFICATION_KEY = (id: string) => `verification:${id}`;
const VERIFICATIONS_KEY = "verifications:all";
const VERIFICATION_POLICY_KEY = (id: string) => `verification:policy:${id}`;
const VERIFICATION_POLICIES_KEY = "verification:policies:all";
const VERIFICATION_LOCK_KEY = "verification:lock";

// ─── Verification Execution ─────────────────────────────────────

/**
 * Verify a backup.
 */
export async function verifyBackup(
  backupId: string,
  options?: {
    performRestoreTest?: boolean;
    restoreTestDatabase?: string;
    dataConsistencyChecks?: boolean;
  },
): Promise<BackupVerification> {
  const verificationId = `verify_${Date.now()}_${_rng.next().toString(36).slice(2, 10)}`;
  const startTime = new Date();

  logger.info("Starting backup verification", {
    verificationId,
    backupId,
  });

  // Get backup
  const backup = await prisma.backup.findUnique({ where: { id: backupId } });
  if (!backup) {
    throw new Error(`Backup not found: ${backupId}`);
  }

  if (backup.status !== "completed") {
    throw new Error(`Backup is not in completed state: ${backup.status}`);
  }

  // Create verification record
  const verification: BackupVerification = {
    id: verificationId,
    backupId,
    status: "running",
    startTime: startTime.toISOString(),
    checksumMatch: false,
    integrityCheck: false,
    restoreTest: false,
    dataConsistency: false,
    overallPassed: false,
    createdAt: startTime.toISOString(),
  };

  await prisma.backupVerification.create({ data: verification });
  await redisCmd.set(VERIFICATION_KEY(verificationId), JSON.stringify(verification));
  await redisCmd.sadd(VERIFICATIONS_KEY, verificationId);

  try {
    // Acquire verification lock
    const lockAcquired = await redisCmd.set(VERIFICATION_LOCK_KEY, verificationId, "EX", 3600, "NX");
    if (!lockAcquired) {
      throw new Error("Another verification is already running");
    }

    const details: Record<string, any> = {};

    // Step 1: Checksum verification
    logger.info("Verifying checksum", { backupId });
    const checksumMatch = await verifyChecksum(backup);
    details.checksumMatch = checksumMatch;

    if (!checksumMatch) {
      throw new Error("Checksum verification failed");
    }

    // Step 2: Integrity check
    logger.info("Checking backup integrity", { backupId });
    const integrityCheck = await checkIntegrity(backup);
    details.integrityCheck = integrityCheck;

    if (!integrityCheck) {
      throw new Error("Integrity check failed");
    }

    // Step 3: Restore test (optional)
    let restoreTest = true;
    if (options?.performRestoreTest !== false) {
      logger.info("Testing restore", { backupId });
      const restoreTestDb = options?.restoreTestDatabase || "windels_restore_test";
      restoreTest = await testRestore(backup, restoreTestDb);
      details.restoreTest = restoreTest;
      details.restoreTestDatabase = restoreTestDb;

      if (!restoreTest) {
        throw new Error("Restore test failed");
      }
    }

    // Step 4: Data consistency checks (optional)
    let dataConsistency = true;
    if (options?.dataConsistencyChecks !== false && restoreTest) {
      logger.info("Running data consistency checks", { backupId });
      const restoreTestDb = options?.restoreTestDatabase || "windels_restore_test";
      dataConsistency = await checkDataConsistency(backup.databaseName, restoreTestDb);
      details.dataConsistency = dataConsistency;

      if (!dataConsistency) {
        throw new Error("Data consistency check failed");
      }
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    // Update verification record
    const updatedVerification: BackupVerification = {
      ...verification,
      status: "passed",
      endTime: endTime.toISOString(),
      durationMs,
      checksumMatch,
      integrityCheck,
      restoreTest,
      dataConsistency,
      overallPassed: true,
      details,
    };

    await prisma.backupVerification.update({
      where: { id: verificationId },
      data: updatedVerification,
    });

    await redisCmd.set(VERIFICATION_KEY(verificationId), JSON.stringify(updatedVerification));

    // Update backup record
    await prisma.backup.update({
      where: { id: backupId },
      data: {
        status: "verified",
        verified: true,
        verifiedAt: endTime,
      },
    });

    logger.info("Backup verification passed", {
      verificationId,
      backupId,
      durationMs,
    });

    // Release lock
    await redisCmd.del(VERIFICATION_LOCK_KEY);

    return updatedVerification;
  } catch (error) {
    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();
    const errorMessage = (error as Error).message;

    logger.error("Backup verification failed", {
      verificationId,
      backupId,
      error: errorMessage,
      durationMs,
    });

    // Update verification record with error
    const failedVerification: BackupVerification = {
      ...verification,
      status: "failed",
      endTime: endTime.toISOString(),
      durationMs,
      errorMessage,
      overallPassed: false,
    };

    await prisma.backupVerification.update({
      where: { id: verificationId },
      data: failedVerification,
    });

    await redisCmd.set(VERIFICATION_KEY(verificationId), JSON.stringify(failedVerification));

    // Release lock
    await redisCmd.del(VERIFICATION_LOCK_KEY);

    throw error;
  }
}

/**
 * Verify backup checksum.
 */
async function verifyChecksum(backup: any): Promise<boolean> {
  if (!backup.checksum) {
    logger.warn("Backup has no checksum", { backupId: backup.id });
    return false;
  }

  if (!existsSync(backup.storagePath)) {
    logger.error("Backup file not found", { backupId: backup.id, path: backup.storagePath });
    return false;
  }

  try {
    const fileBuffer = readFileSync(backup.storagePath);
    const calculatedChecksum = createHash("sha256").update(fileBuffer).digest("hex");

    const match = calculatedChecksum === backup.checksum;

    if (!match) {
      logger.error("Checksum mismatch", {
        backupId: backup.id,
        expected: backup.checksum,
        calculated: calculatedChecksum,
      });
    }

    return match;
  } catch (error) {
    logger.error("Checksum verification error", {
      backupId: backup.id,
      error: (error as Error).message,
    });
    return false;
  }
}

/**
 * Check backup integrity (can be read by pg_restore).
 */
async function checkIntegrity(backup: any): Promise<boolean> {
  try {
    // Use pg_restore --list to verify backup can be read
    const command = `pg_restore --list ${backup.storagePath}`;
    const { stdout, stderr } = await execAsync(command);

    if (stderr && !stderr.includes("WARNING")) {
      logger.error("Integrity check failed", { backupId: backup.id, stderr });
      return false;
    }

    // Check that backup contains expected tables
    const hasUsers = stdout.includes("users");
    const hasOrganizations = stdout.includes("organizations");

    if (!hasUsers || !hasOrganizations) {
      logger.error("Backup missing expected tables", {
        backupId: backup.id,
        hasUsers,
        hasOrganizations,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Integrity check error", {
      backupId: backup.id,
      error: (error as Error).message,
    });
    return false;
  }
}

/**
 * Test restore to temporary database.
 */
async function testRestore(backup: any, restoreTestDb: string): Promise<boolean> {
  try {
    // Drop test database if it exists
    try {
      await execAsync(`dropdb -h ${process.env.DB_HOST} -U ${process.env.DB_USER} --if-exists ${restoreTestDb}`);
    } catch (error) {
      // Ignore errors (database might not exist)
    }

    // Create test database
    await execAsync(`createdb -h ${process.env.DB_HOST} -U ${process.env.DB_USER} ${restoreTestDb}`);

    // Restore backup
    const restoreCommand = `pg_restore -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d ${restoreTestDb} ${backup.storagePath}`;
    const { stdout, stderr } = await execAsync(restoreCommand);

    if (stderr && !stderr.includes("WARNING")) {
      logger.error("Restore test failed", { backupId: backup.id, stderr });
      return false;
    }

    // Verify restore by checking table counts
    const { stdout: countOutput } = await execAsync(
      `psql -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d ${restoreTestDb} -t -c "SELECT COUNT(*) FROM users"`
    );

    const userCount = parseInt(countOutput.trim());
    if (userCount === 0) {
      logger.error("Restore test: no users found", { backupId: backup.id });
      return false;
    }

    logger.info("Restore test successful", {
      backupId: backup.id,
      restoreTestDb,
      userCount,
    });

    // Clean up test database
    try {
      await execAsync(`dropdb -h ${process.env.DB_HOST} -U ${process.env.DB_USER} --if-exists ${restoreTestDb}`);
    } catch (error) {
      logger.warn("Failed to clean up test database", { restoreTestDb });
    }

    return true;
  } catch (error) {
    logger.error("Restore test error", {
      backupId: backup.id,
      error: (error as Error).message,
    });
    return false;
  }
}

/**
 * Check data consistency between original and restored database.
 */
async function checkDataConsistency(
  originalDb: string,
  restoredDb: string,
): Promise<boolean> {
  try {
    // Compare table counts
    const tables = ["users", "organizations", "tasks", "agents"];

    for (const table of tables) {
      const { stdout: originalCount } = await execAsync(
        `psql -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d ${originalDb} -t -c "SELECT COUNT(*) FROM ${table}"`
      );

      const { stdout: restoredCount } = await execAsync(
        `psql -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d ${restoredDb} -t -c "SELECT COUNT(*) FROM ${table}"`
      );

      const original = parseInt(originalCount.trim());
      const restored = parseInt(restoredCount.trim());

      if (original !== restored) {
        logger.error("Data consistency check failed", {
          table,
          original,
          restored,
        });
        return false;
      }
    }

    logger.info("Data consistency check passed", { originalDb, restoredDb });
    return true;
  } catch (error) {
    logger.error("Data consistency check error", {
      error: (error as Error).message,
    });
    return false;
  }
}

// ─── Verification Management ────────────────────────────────────

/**
 * Get verification by ID.
 */
export async function getVerification(verificationId: string): Promise<BackupVerification | null> {
  return prisma.backupVerification.findUnique({ where: { id: verificationId } });
}

/**
 * List verifications with filters.
 */
export async function listVerifications(filters?: {
  backupId?: string;
  status?: VerificationStatus;
  limit?: number;
}): Promise<BackupVerification[]> {
  const where: any = {};

  if (filters?.backupId) {
    where.backupId = filters.backupId;
  }

  if (filters?.status) {
    where.status = filters.status;
  }

  return prisma.backupVerification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: filters?.limit || 100,
  });
}

/**
 * Verify all unverified backups.
 */
export async function verifyUnverifiedBackups(): Promise<number> {
  const unverifiedBackups = await prisma.backup.findMany({
    where: {
      status: "completed",
      verified: false,
    },
    orderBy: { createdAt: "asc" },
    take: 10, // Limit to prevent overload
  });

  let verifiedCount = 0;

  for (const backup of unverifiedBackups) {
    try {
      await verifyBackup(backup.id);
      verifiedCount++;
    } catch (error) {
      logger.error("Failed to verify backup", {
        backupId: backup.id,
        error: (error as Error).message,
      });
    }
  }

  if (verifiedCount > 0) {
    logger.info("Unverified backup verification completed", { verifiedCount });
  }

  return verifiedCount;
}

// ─── Verification Policies ──────────────────────────────────────

/**
 * Create verification policy.
 */
export async function createVerificationPolicy(input: {
  name: string;
  enabled?: boolean;
  verifyAfterBackup?: boolean;
  verificationSchedule?: string;
  performRestoreTest?: boolean;
  restoreTestDatabase?: string;
  dataConsistencyChecks?: boolean;
}): Promise<VerificationPolicy> {
  const policyId = `policy_${Date.now()}_${_rng.next().toString(36).slice(2, 10)}`;
  const now = new Date();

  const policy: VerificationPolicy = {
    id: policyId,
    name: input.name,
    enabled: input.enabled ?? true,
    verifyAfterBackup: input.verifyAfterBackup ?? true,
    verificationSchedule: input.verificationSchedule,
    performRestoreTest: input.performRestoreTest ?? true,
    restoreTestDatabase: input.restoreTestDatabase,
    dataConsistencyChecks: input.dataConsistencyChecks ?? true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await prisma.verificationPolicy.create({ data: policy });
  await redisCmd.set(VERIFICATION_POLICY_KEY(policyId), JSON.stringify(policy));
  await redisCmd.sadd(VERIFICATION_POLICIES_KEY, policyId);

  logger.info("Verification policy created", {
    policyId,
    name: input.name,
  });

  return policy;
}

/**
 * Get verification policy by ID.
 */
export async function getVerificationPolicy(policyId: string): Promise<VerificationPolicy | null> {
  return prisma.verificationPolicy.findUnique({ where: { id: policyId } });
}

/**
 * List all verification policies.
 */
export async function listVerificationPolicies(): Promise<VerificationPolicy[]> {
  return prisma.verificationPolicy.findMany({
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Update verification policy.
 */
export async function updateVerificationPolicy(
  policyId: string,
  updates: Partial<VerificationPolicy>,
): Promise<VerificationPolicy | null> {
  const policy = await prisma.verificationPolicy.update({
    where: { id: policyId },
    data: {
      ...updates,
      updatedAt: new Date(),
    },
  });

  await redisCmd.set(VERIFICATION_POLICY_KEY(policyId), JSON.stringify(policy));

  logger.info("Verification policy updated", {
    policyId,
    updates: Object.keys(updates),
  });

  return policy;
}

/**
 * Delete verification policy.
 */
export async function deleteVerificationPolicy(policyId: string): Promise<void> {
  await prisma.verificationPolicy.delete({ where: { id: policyId } });
  await redisCmd.del(VERIFICATION_POLICY_KEY(policyId));
  await redisCmd.srem(VERIFICATION_POLICIES_KEY, policyId);

  logger.info("Verification policy deleted", { policyId });
}

// ─── Verification Statistics ────────────────────────────────────

/**
 * Get verification statistics.
 */
export async function getVerificationStats(): Promise<{
  totalVerifications: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
  avgDurationMs: number;
  byStatus: Record<VerificationStatus, number>;
}> {
  const verifications = await listVerifications({ limit: 10000 });

  const byStatus: Record<string, number> = {};
  let totalDuration = 0;
  let durationCount = 0;

  for (const verification of verifications) {
    byStatus[verification.status] = (byStatus[verification.status] || 0) + 1;

    if (verification.durationMs) {
      totalDuration += verification.durationMs;
      durationCount++;
    }
  }

  const passedCount = byStatus["passed"] || 0;
  const failedCount = byStatus["failed"] || 0;
  const passRate = verifications.length > 0 ? (passedCount / verifications.length) * 100 : 0;
  const avgDurationMs = durationCount > 0 ? totalDuration / durationCount : 0;

  return {
    totalVerifications: verifications.length,
    passedCount,
    failedCount,
    passRate,
    avgDurationMs,
    byStatus: byStatus as any,
  };
}
