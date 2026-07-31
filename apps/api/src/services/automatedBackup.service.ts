/**
 * Automated Backup Service (Module 19 — Gap 1)
 *
 * Automated database backups with scheduling and retention:
 * - Full backups (complete database snapshot)
 * - Incremental backups (changes since last full backup)
 * - Differential backups (changes since last full backup)
 * - Backup scheduling (cron-based)
 * - Retention policies (keep N backups, delete old ones)
 * - Backup metadata tracking
 * - Backup status monitoring
 *
 * Provides reliable, automated data protection for disaster recovery.
 */
import { prisma } from "../db/client.js";
import { redisCmd } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { exec } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import { writeFileSync, readFileSync, existsSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:automatedBackup');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


const execAsync = promisify(exec);

// ─── Types ──────────────────────────────────────────────────────

export type BackupType = "full" | "incremental" | "differential";

export type BackupStatus = "scheduled" | "running" | "completed" | "failed" | "verifying" | "verified" | "expired";

export interface Backup {
  id: string;
  type: BackupType;
  status: BackupStatus;
  databaseName: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  sizeBytes: number;
  checksum?: string;
  storagePath: string;
  storageRegion: string;
  parentBackupId?: string; // For incremental/differential
  retentionDays: number;
  expiresAt: string;
  verified: boolean;
  verifiedAt?: string;
  metadata?: Record<string, any>;
  errorMessage?: string;
  createdAt: string;
}

export interface BackupSchedule {
  id: string;
  name: string;
  enabled: boolean;
  databaseName: string;
  backupType: BackupType;
  cronExpression: string; // e.g., "0 2 * * *" for daily at 2 AM
  retentionDays: number;
  storageRegion: string;
  lastRunAt?: string;
  nextRunAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupPolicy {
  id: string;
  name: string;
  fullBackupSchedule: string; // Cron expression
  fullBackupRetention: number; // Days
  incrementalBackupSchedule?: string;
  incrementalBackupRetention?: number;
  differentialBackupSchedule?: string;
  differentialBackupRetention?: number;
  verificationEnabled: boolean;
  crossRegionReplication: boolean;
  replicationRegions: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const BACKUP_KEY = (id: string) => `backup:${id}`;
const BACKUPS_KEY = "backups:all";
const BACKUP_SCHEDULE_KEY = (id: string) => `backup:schedule:${id}`;
const BACKUP_SCHEDULES_KEY = "backup:schedules:all";
const BACKUP_POLICY_KEY = (id: string) => `backup:policy:${id}`;
const BACKUP_POLICIES_KEY = "backup:policies:all";
const BACKUP_LOCK_KEY = "backup:lock";

// ─── Backup Storage ─────────────────────────────────────────────

const BACKUP_BASE_DIR = process.env.BACKUP_STORAGE_PATH || "/var/backups/windels";

/**
 * Ensure backup directory exists.
 */
function ensureBackupDir(region: string): string {
  const dir = join(BACKUP_BASE_DIR, region);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Generate backup filename.
 */
function generateBackupFilename(
  databaseName: string,
  backupType: BackupType,
  timestamp: Date,
): string {
  const dateStr = timestamp.toISOString().replace(/[:.]/g, "-");
  return `${databaseName}_${backupType}_${dateStr}.sql`;
}

// ─── Backup Execution ───────────────────────────────────────────

/**
 * Create a database backup.
 */
export async function createBackup(input: {
  type: BackupType;
  databaseName: string;
  storageRegion: string;
  retentionDays: number;
  parentBackupId?: string;
  metadata?: Record<string, any>;
}): Promise<Backup> {
  const backupId = `backup_${Date.now()}_${_rng.next().toString(36).slice(2, 10)}`;
  const startTime = new Date();

  logger.info("Starting backup", {
    backupId,
    type: input.type,
    databaseName: input.databaseName,
  });

  // Create backup record
  const backup: Backup = {
    id: backupId,
    type: input.type,
    status: "running",
    databaseName: input.databaseName,
    startTime: startTime.toISOString(),
    sizeBytes: 0,
    storagePath: "",
    storageRegion: input.storageRegion,
    parentBackupId: input.parentBackupId,
    retentionDays: input.retentionDays,
    expiresAt: new Date(startTime.getTime() + input.retentionDays * 24 * 60 * 60 * 1000).toISOString(),
    verified: false,
    metadata: input.metadata,
    createdAt: startTime.toISOString(),
  };

  await prisma.backup.create({ data: backup });
  await redisCmd.set(BACKUP_KEY(backupId), JSON.stringify(backup));
  await redisCmd.sadd(BACKUPS_KEY, backupId);

  try {
    // Acquire backup lock
    const lockAcquired = await redisCmd.set(BACKUP_LOCK_KEY, backupId, "EX", 3600, "NX");
    if (!lockAcquired) {
      throw new Error("Another backup is already running");
    }

    // Ensure backup directory exists
    const backupDir = ensureBackupDir(input.storageRegion);
    const filename = generateBackupFilename(input.databaseName, input.type, startTime);
    const filepath = join(backupDir, filename);

    // Execute backup based on type
    let backupCommand: string;

    if (input.type === "full") {
      // Full backup using pg_dump
      backupCommand = `pg_dump -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d ${input.databaseName} -F c -f ${filepath}`;
    } else if (input.type === "incremental") {
      // Incremental backup using WAL archiving (simplified for demo)
      // In production, use pg_basebackup + WAL archiving
      if (!input.parentBackupId) {
        throw new Error("Incremental backup requires parent backup");
      }
      backupCommand = `pg_dump -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d ${input.databaseName} -F c -f ${filepath}`;
    } else {
      // Differential backup (similar to incremental for demo)
      if (!input.parentBackupId) {
        throw new Error("Differential backup requires parent backup");
      }
      backupCommand = `pg_dump -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d ${input.databaseName} -F c -f ${filepath}`;
    }

    logger.info("Executing backup command", { command: backupCommand });

    const { stdout, stderr } = await execAsync(backupCommand);

    if (stderr && !stderr.includes("WARNING")) {
      throw new Error(`Backup failed: ${stderr}`);
    }

    // Get backup file size
    const stats = statSync(filepath);
    const sizeBytes = stats.size;

    // Calculate checksum
    const fileBuffer = readFileSync(filepath);
    const checksum = createHash("sha256").update(fileBuffer).digest("hex");

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    // Update backup record
    const updatedBackup: Backup = {
      ...backup,
      status: "completed",
      endTime: endTime.toISOString(),
      durationMs,
      sizeBytes,
      checksum,
      storagePath: filepath,
    };

    await prisma.backup.update({
      where: { id: backupId },
      data: updatedBackup,
    });

    await redisCmd.set(BACKUP_KEY(backupId), JSON.stringify(updatedBackup));

    logger.info("Backup completed successfully", {
      backupId,
      sizeBytes,
      durationMs,
      checksum,
    });

    // Release lock
    await redisCmd.del(BACKUP_LOCK_KEY);

    return updatedBackup;
  } catch (error) {
    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();
    const errorMessage = (error as Error).message;

    logger.error("Backup failed", {
      backupId,
      error: errorMessage,
      durationMs,
    });

    // Update backup record with error
    const failedBackup: Backup = {
      ...backup,
      status: "failed",
      endTime: endTime.toISOString(),
      durationMs,
      errorMessage,
    };

    await prisma.backup.update({
      where: { id: backupId },
      data: failedBackup,
    });

    await redisCmd.set(BACKUP_KEY(backupId), JSON.stringify(failedBackup));

    // Release lock
    await redisCmd.del(BACKUP_LOCK_KEY);

    throw error;
  }
}

/**
 * Get backup by ID.
 */
export async function getBackup(backupId: string): Promise<Backup | null> {
  return prisma.backup.findUnique({ where: { id: backupId } });
}

/**
 * List backups with filters.
 */
export async function listBackups(filters?: {
  databaseName?: string;
  type?: BackupType;
  status?: BackupStatus;
  limit?: number;
}): Promise<Backup[]> {
  const where: any = {};

  if (filters?.databaseName) {
    where.databaseName = filters.databaseName;
  }

  if (filters?.type) {
    where.type = filters.type;
  }

  if (filters?.status) {
    where.status = filters.status;
  }

  return prisma.backup.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: filters?.limit || 100,
  });
}

/**
 * Delete expired backups.
 */
export async function deleteExpiredBackups(): Promise<number> {
  const now = new Date();

  const expiredBackups = await prisma.backup.findMany({
    where: {
      expiresAt: { lt: now },
      status: { in: ["completed", "verified"] },
    },
  });

  let deletedCount = 0;

  for (const backup of expiredBackups) {
    try {
      // Delete backup file
      if (existsSync(backup.storagePath)) {
        const { unlink } = await import("fs/promises");
        await unlink(backup.storagePath);
      }

      // Delete backup record
      await prisma.backup.delete({ where: { id: backup.id } });
      await redisCmd.del(BACKUP_KEY(backup.id));
      await redisCmd.srem(BACKUPS_KEY, backup.id);

      deletedCount++;

      logger.info("Deleted expired backup", {
        backupId: backup.id,
        databaseName: backup.databaseName,
        type: backup.type,
      });
    } catch (error) {
      logger.error("Failed to delete expired backup", {
        backupId: backup.id,
        error: (error as Error).message,
      });
    }
  }

  logger.info("Expired backup cleanup completed", { deletedCount });

  return deletedCount;
}

// ─── Backup Scheduling ──────────────────────────────────────────

/**
 * Create a backup schedule.
 */
export async function createBackupSchedule(input: {
  name: string;
  databaseName: string;
  backupType: BackupType;
  cronExpression: string;
  retentionDays: number;
  storageRegion: string;
  enabled?: boolean;
}): Promise<BackupSchedule> {
  const scheduleId = `schedule_${Date.now()}_${_rng.next().toString(36).slice(2, 10)}`;
  const now = new Date();

  // Calculate next run time from cron expression
  const nextRunAt = calculateNextRunTime(input.cronExpression);

  const schedule: BackupSchedule = {
    id: scheduleId,
    name: input.name,
    enabled: input.enabled ?? true,
    databaseName: input.databaseName,
    backupType: input.backupType,
    cronExpression: input.cronExpression,
    retentionDays: input.retentionDays,
    storageRegion: input.storageRegion,
    nextRunAt: nextRunAt.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await prisma.backupSchedule.create({ data: schedule });
  await redisCmd.set(BACKUP_SCHEDULE_KEY(scheduleId), JSON.stringify(schedule));
  await redisCmd.sadd(BACKUP_SCHEDULES_KEY, scheduleId);

  logger.info("Backup schedule created", {
    scheduleId,
    name: input.name,
    cronExpression: input.cronExpression,
    nextRunAt: nextRunAt.toISOString(),
  });

  return schedule;
}

/**
 * Get backup schedule by ID.
 */
export async function getBackupSchedule(scheduleId: string): Promise<BackupSchedule | null> {
  return prisma.backupSchedule.findUnique({ where: { id: scheduleId } });
}

/**
 * List all backup schedules.
 */
export async function listBackupSchedules(): Promise<BackupSchedule[]> {
  return prisma.backupSchedule.findMany({
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Update backup schedule.
 */
export async function updateBackupSchedule(
  scheduleId: string,
  updates: Partial<BackupSchedule>,
): Promise<BackupSchedule | null> {
  const schedule = await prisma.backupSchedule.update({
    where: { id: scheduleId },
    data: {
      ...updates,
      updatedAt: new Date(),
    },
  });

  await redisCmd.set(BACKUP_SCHEDULE_KEY(scheduleId), JSON.stringify(schedule));

  logger.info("Backup schedule updated", {
    scheduleId,
    updates: Object.keys(updates),
  });

  return schedule;
}

/**
 * Delete backup schedule.
 */
export async function deleteBackupSchedule(scheduleId: string): Promise<void> {
  await prisma.backupSchedule.delete({ where: { id: scheduleId } });
  await redisCmd.del(BACKUP_SCHEDULE_KEY(scheduleId));
  await redisCmd.srem(BACKUP_SCHEDULES_KEY, scheduleId);

  logger.info("Backup schedule deleted", { scheduleId });
}

/**
 * Execute due backup schedules.
 */
export async function executeDueSchedules(): Promise<number> {
  const now = new Date();
  const schedules = await listBackupSchedules();

  let executedCount = 0;

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;

    const nextRun = new Date(schedule.nextRunAt);
    if (nextRun > now) continue;

    try {
      logger.info("Executing scheduled backup", {
        scheduleId: schedule.id,
        name: schedule.name,
        databaseName: schedule.databaseName,
        type: schedule.backupType,
      });

      // Find parent backup for incremental/differential
      let parentBackupId: string | undefined;
      if (schedule.backupType === "incremental" || schedule.backupType === "differential") {
        const lastFullBackup = await prisma.backup.findFirst({
          where: {
            databaseName: schedule.databaseName,
            type: "full",
            status: "completed",
          },
          orderBy: { createdAt: "desc" },
        });

        if (lastFullBackup) {
          parentBackupId = lastFullBackup.id;
        }
      }

      // Create backup
      await createBackup({
        type: schedule.backupType,
        databaseName: schedule.databaseName,
        storageRegion: schedule.storageRegion,
        retentionDays: schedule.retentionDays,
        parentBackupId,
        metadata: { scheduleId: schedule.id, scheduleName: schedule.name },
      });

      // Update schedule with last run and next run
      const nextRunAt = calculateNextRunTime(schedule.cronExpression);

      await updateBackupSchedule(schedule.id, {
        lastRunAt: now.toISOString(),
        nextRunAt: nextRunAt.toISOString(),
      });

      executedCount++;
    } catch (error) {
      logger.error("Scheduled backup failed", {
        scheduleId: schedule.id,
        error: (error as Error).message,
      });
    }
  }

  if (executedCount > 0) {
    logger.info("Scheduled backup execution completed", { executedCount });
  }

  return executedCount;
}

// ─── Helper Functions ───────────────────────────────────────────

/**
 * Calculate next run time from cron expression.
 * Simplified implementation - in production use a proper cron parser.
 */
function calculateNextRunTime(cronExpression: string): Date {
  // Simplified: assume daily at specific hour
  const parts = cronExpression.split(" ");
  const hour = parseInt(parts[1] || "2");

  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/**
 * Get backup statistics.
 */
export async function getBackupStats(): Promise<{
  totalBackups: number;
  totalSizeBytes: number;
  byType: Record<BackupType, number>;
  byStatus: Record<BackupStatus, number>;
  oldestBackup?: string;
  newestBackup?: string;
  verifiedCount: number;
}> {
  const backups = await listBackups({ limit: 10000 });

  const byType: Record<string, number> = { full: 0, incremental: 0, differential: 0 };
  const byStatus: Record<string, number> = {};
  let totalSizeBytes = 0;
  let verifiedCount = 0;

  for (const backup of backups) {
    byType[backup.type] = (byType[backup.type] || 0) + 1;
    byStatus[backup.status] = (byStatus[backup.status] || 0) + 1;
    totalSizeBytes += backup.sizeBytes;

    if (backup.verified) {
      verifiedCount++;
    }
  }

  const sorted = backups.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    totalBackups: backups.length,
    totalSizeBytes,
    byType: byType as any,
    byStatus: byStatus as any,
    oldestBackup: sorted[0]?.createdAt,
    newestBackup: sorted[sorted.length - 1]?.createdAt,
    verifiedCount,
  };
}
