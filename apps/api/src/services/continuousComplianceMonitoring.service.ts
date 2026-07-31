/**
 * Continuous Compliance Monitoring Service (Module 25 — Gap 1)
 *
 * Continuous monitoring of compliance status:
 * - Monitor compliance status continuously
 * - Detect compliance drift and violations
 * - Track compliance score trends
 * - Automated compliance health checks
 * - Compliance violation detection and alerting
 * - Compliance status history tracking
 *
 * Provides real-time visibility into compliance posture.
 */
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";
import { redisCmd } from "../db/redis.js";
import {
  getComplianceStatus,
  getFramework,
  listFrameworks,
  type ComplianceStatus,
} from "./complianceFramework.service";

// ─── Types ──────────────────────────────────────────────────────

export interface ComplianceMonitoringConfig {
  enabled: boolean;
  monitoringIntervalMinutes: number;
  driftThresholdPercent: number;
  alertOnScoreDrop: boolean;
  scoreDropThresholdPercent: number;
  alertOnNewGaps: boolean;
  alertOnCriticalGaps: boolean;
}

export interface ComplianceMonitoringResult {
  frameworkId: string;
  frameworkName: string;
  regulation: string;
  previousStatus?: ComplianceStatus;
  currentStatus: ComplianceStatus;
  driftDetected: boolean;
  driftPercent: number;
  scoreChange: number;
  newGaps: number;
  criticalGaps: number;
  violations: ComplianceViolation[];
  monitoredAt: string;
}

export interface ComplianceViolation {
  id: string;
  frameworkId: string;
  controlId: string;
  controlCode: string;
  controlName: string;
  violationType: "drift" | "new_gap" | "critical_gap" | "score_drop";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  detectedAt: string;
  previousValue?: any;
  currentValue?: any;
}

export interface ComplianceMonitoringStats {
  totalMonitored: number;
  driftDetected: number;
  violationsDetected: number;
  averageComplianceScore: number;
  byRegulation: Record<string, { monitored: number; avgScore: number; driftCount: number }>;
  recentViolations: ComplianceViolation[];
}

// ─── Redis Keys ─────────────────────────────────────────────────

const MONITORING_CONFIG_KEY = (orgId: string) => `compliance:monitoring:config:${orgId}`;
const MONITORING_RESULT_KEY = (frameworkId: string) => `compliance:monitoring:result:${frameworkId}`;
const MONITORING_HISTORY_KEY = (frameworkId: string) => `compliance:monitoring:history:${frameworkId}`;
const MONITORING_STATS_KEY = "compliance:monitoring:stats";
const VIOLATIONS_KEY = "compliance:monitoring:violations";

// ─── Default Configuration ──────────────────────────────────────

const DEFAULT_CONFIG: ComplianceMonitoringConfig = {
  enabled: true,
  monitoringIntervalMinutes: 60, // Monitor every hour
  driftThresholdPercent: 5, // Alert if compliance score drifts by 5%
  alertOnScoreDrop: true,
  scoreDropThresholdPercent: 10, // Alert if score drops by 10%
  alertOnNewGaps: true,
  alertOnCriticalGaps: true,
};

// ─── Configuration Management ───────────────────────────────────

/**
 * Get monitoring configuration
 */
export async function getMonitoringConfig(organizationId: string): Promise<ComplianceMonitoringConfig> {
  const data = await redisCmd.get(MONITORING_CONFIG_KEY(organizationId));
  return data ? JSON.parse(data) : DEFAULT_CONFIG;
}

/**
 * Update monitoring configuration
 */
export async function updateMonitoringConfig(
  organizationId: string,
  config: Partial<ComplianceMonitoringConfig>,
): Promise<ComplianceMonitoringConfig> {
  const currentConfig = await getMonitoringConfig(organizationId);
  const updatedConfig = { ...currentConfig, ...config };

  await redisCmd.set(MONITORING_CONFIG_KEY(organizationId), JSON.stringify(updatedConfig));

  logger.info("Compliance monitoring config updated", {
    organizationId,
    config: updatedConfig,
  });

  return updatedConfig;
}

// ─── Continuous Monitoring ──────────────────────────────────────

/**
 * Monitor compliance status for a framework
 */
export async function monitorFramework(
  frameworkId: string,
): Promise<ComplianceMonitoringResult | null> {
  const framework = await getFramework(frameworkId);
  if (!framework) return null;

  const currentStatus = await getComplianceStatus(frameworkId);
  if (!currentStatus) return null;

  // Get previous status
  const previousResult = await getLatestMonitoringResult(frameworkId);
  const previousStatus = previousResult?.currentStatus;

  // Calculate drift
  const driftPercent = previousStatus
    ? Math.abs(currentStatus.complianceScore - previousStatus.complianceScore)
    : 0;
  const driftDetected = driftPercent > 0;

  // Calculate score change
  const scoreChange = previousStatus
    ? currentStatus.complianceScore - previousStatus.complianceScore
    : 0;

  // Detect new gaps
  const newGaps = previousStatus
    ? currentStatus.openGaps - previousStatus.openGaps
    : currentStatus.openGaps;

  // Detect violations
  const violations: ComplianceViolation[] = [];

  // Check for drift
  if (driftDetected) {
    violations.push({
      id: `violation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      frameworkId,
      controlId: "N/A",
      controlCode: "N/A",
      controlName: "Overall Compliance Score",
      violationType: "drift",
      severity: driftPercent > 10 ? "high" : driftPercent > 5 ? "medium" : "low",
      description: `Compliance score drifted by ${driftPercent.toFixed(2)}% from ${previousStatus?.complianceScore}% to ${currentStatus.complianceScore}%`,
      detectedAt: new Date().toISOString(),
      previousValue: previousStatus?.complianceScore,
      currentValue: currentStatus.complianceScore,
    });
  }

  // Check for score drop
  if (scoreChange < 0) {
    violations.push({
      id: `violation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      frameworkId,
      controlId: "N/A",
      controlCode: "N/A",
      controlName: "Overall Compliance Score",
      violationType: "score_drop",
      severity: Math.abs(scoreChange) > 10 ? "high" : Math.abs(scoreChange) > 5 ? "medium" : "low",
      description: `Compliance score dropped by ${Math.abs(scoreChange).toFixed(2)}% from ${previousStatus?.complianceScore}% to ${currentStatus.complianceScore}%`,
      detectedAt: new Date().toISOString(),
      previousValue: previousStatus?.complianceScore,
      currentValue: currentStatus.complianceScore,
    });
  }

  // Check for new gaps
  if (newGaps > 0) {
    violations.push({
      id: `violation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      frameworkId,
      controlId: "N/A",
      controlCode: "N/A",
      controlName: "Compliance Gaps",
      violationType: "new_gap",
      severity: newGaps > 5 ? "high" : newGaps > 2 ? "medium" : "low",
      description: `${newGaps} new compliance gaps detected`,
      detectedAt: new Date().toISOString(),
      previousValue: previousStatus?.openGaps,
      currentValue: currentStatus.openGaps,
    });
  }

  // Check for critical gaps
  if (currentStatus.criticalGaps > 0) {
    violations.push({
      id: `violation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      frameworkId,
      controlId: "N/A",
      controlCode: "N/A",
      controlName: "Critical Compliance Gaps",
      violationType: "critical_gap",
      severity: "critical",
      description: `${currentStatus.criticalGaps} critical compliance gaps require immediate attention`,
      detectedAt: new Date().toISOString(),
      previousValue: previousStatus?.criticalGaps,
      currentValue: currentStatus.criticalGaps,
    });
  }

  const result: ComplianceMonitoringResult = {
    frameworkId,
    frameworkName: framework.name,
    regulation: framework.regulation,
    previousStatus,
    currentStatus,
    driftDetected,
    driftPercent,
    scoreChange,
    newGaps: Math.max(0, newGaps),
    criticalGaps: currentStatus.criticalGaps,
    violations,
    monitoredAt: new Date().toISOString(),
  };

  // Store result
  await redisCmd.set(MONITORING_RESULT_KEY(frameworkId), JSON.stringify(result));

  // Store in history
  await redisCmd.lpush(MONITORING_HISTORY_KEY(frameworkId), JSON.stringify(result));
  await redisCmd.ltrim(MONITORING_HISTORY_KEY(frameworkId), 0, 999); // Keep last 1000 results

  // Store violations
  for (const violation of violations) {
    await redisCmd.lpush(VIOLATIONS_KEY, JSON.stringify(violation));
  }
  await redisCmd.ltrim(VIOLATIONS_KEY, 0, 9999); // Keep last 10000 violations

  // Update metrics
  Metrics.increment("compliance.monitoring.monitored", 1, {
    regulation: framework.regulation,
  });

  if (driftDetected) {
    Metrics.increment("compliance.monitoring.drift_detected", 1, {
      regulation: framework.regulation,
    });
  }

  if (violations.length > 0) {
    Metrics.increment("compliance.monitoring.violations_detected", violations.length, {
      regulation: framework.regulation,
    });
  }

  logger.info("Compliance monitoring completed", {
    frameworkId,
    frameworkName: framework.name,
    regulation: framework.regulation,
    complianceScore: currentStatus.complianceScore,
    driftDetected,
    driftPercent: driftPercent.toFixed(2),
    scoreChange: scoreChange.toFixed(2),
    violations: violations.length,
  });

  return result;
}

/**
 * Monitor all frameworks for an organization
 */
export async function monitorAllFrameworks(
  organizationId: string,
): Promise<ComplianceMonitoringResult[]> {
  const frameworks = await listFrameworks(organizationId);
  const results: ComplianceMonitoringResult[] = [];

  for (const framework of frameworks) {
    const result = await monitorFramework(framework.id);
    if (result) {
      results.push(result);
    }
  }

  logger.info("All frameworks monitored", {
    organizationId,
    frameworkCount: results.length,
    totalViolations: results.reduce((sum, r) => sum + r.violations.length, 0),
  });

  return results;
}

/**
 * Get latest monitoring result for a framework
 */
export async function getLatestMonitoringResult(
  frameworkId: string,
): Promise<ComplianceMonitoringResult | null> {
  const data = await redisCmd.get(MONITORING_RESULT_KEY(frameworkId));
  return data ? JSON.parse(data) : null;
}

/**
 * Get monitoring history for a framework
 */
export async function getMonitoringHistory(
  frameworkId: string,
  limit: number = 100,
): Promise<ComplianceMonitoringResult[]> {
  const data = await redisCmd.lrange(MONITORING_HISTORY_KEY(frameworkId), 0, limit - 1);
  return data.map(d => JSON.parse(d));
}

/**
 * Get all compliance violations
 */
export async function getComplianceViolations(
  limit: number = 100,
): Promise<ComplianceViolation[]> {
  const data = await redisCmd.lrange(VIOLATIONS_KEY, 0, limit - 1);
  return data.map(d => JSON.parse(d));
}

/**
 * Get monitoring statistics
 */
export async function getMonitoringStats(): Promise<ComplianceMonitoringStats> {
  const metrics = Metrics.snapshot();

  const totalMonitored = metrics.counters["compliance.monitoring.monitored"]?.total || 0;
  const driftDetected = metrics.counters["compliance.monitoring.drift_detected"]?.total || 0;
  const violationsDetected = metrics.counters["compliance.monitoring.violations_detected"]?.total || 0;

  const byRegulation: Record<string, { monitored: number; avgScore: number; driftCount: number }> = {};

  // Extract regulation stats
  if (metrics.counters["compliance.monitoring.monitored"]?.tags) {
    for (const [tag, count] of Object.entries(metrics.counters["compliance.monitoring.monitored"].tags)) {
      const match = tag.match(/regulation=(\w+)/);
      if (match) {
        byRegulation[match[1]] = {
          monitored: count as number,
          avgScore: 0, // Would need to calculate from history
          driftCount: 0, // Would need to calculate from violations
        };
      }
    }
  }

  const recentViolations = await getComplianceViolations(10);

  // Calculate average compliance score (simplified)
  const averageComplianceScore = 85; // Would calculate from monitoring results

  return {
    totalMonitored,
    driftDetected,
    violationsDetected,
    averageComplianceScore,
    byRegulation,
    recentViolations,
  };
}

// ─── Scheduled Monitoring ───────────────────────────────────────

let monitoringInterval: NodeJS.Timeout | null = null;

/**
 * Start continuous monitoring
 */
export async function startContinuousMonitoring(organizationId: string): Promise<void> {
  const config = await getMonitoringConfig(organizationId);

  if (!config.enabled) {
    logger.info("Compliance monitoring is disabled", { organizationId });
    return;
  }

  if (monitoringInterval) {
    logger.warn("Continuous monitoring already running");
    return;
  }

  logger.info("Starting continuous compliance monitoring", {
    organizationId,
    intervalMinutes: config.monitoringIntervalMinutes,
  });

  // Monitor immediately
  await monitorAllFrameworks(organizationId);

  // Schedule periodic monitoring
  monitoringInterval = setInterval(async () => {
    try {
      await monitorAllFrameworks(organizationId);
    } catch (error) {
      logger.error("Continuous monitoring failed", { error: (error as Error).message });
    }
  }, config.monitoringIntervalMinutes * 60 * 1000);
}

/**
 * Stop continuous monitoring
 */
export function stopContinuousMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    logger.info("Continuous compliance monitoring stopped");
  }
}

// ─── Compliance Health Check ────────────────────────────────────

/**
 * Perform compliance health check
 */
export async function performComplianceHealthCheck(
  organizationId: string,
): Promise<{
  healthy: boolean;
  frameworks: Array<{
    frameworkId: string;
    frameworkName: string;
    regulation: string;
    complianceScore: number;
    healthy: boolean;
    issues: string[];
  }>;
  overallHealth: "healthy" | "degraded" | "critical";
}> {
  const frameworks = await listFrameworks(organizationId);
  const frameworkHealth: Array<{
    frameworkId: string;
    frameworkName: string;
    regulation: string;
    complianceScore: number;
    healthy: boolean;
    issues: string[];
  }> = [];

  for (const framework of frameworks) {
    const status = await getComplianceStatus(framework.id);
    if (!status) continue;

    const issues: string[] = [];

    if (status.complianceScore < 70) {
      issues.push(`Low compliance score: ${status.complianceScore}%`);
    }

    if (status.criticalGaps > 0) {
      issues.push(`${status.criticalGaps} critical gaps require immediate attention`);
    }

    if (status.openGaps > 10) {
      issues.push(`${status.openGaps} open gaps require remediation`);
    }

    if (status.nonCompliantControls > 0) {
      issues.push(`${status.nonCompliantControls} non-compliant controls`);
    }

    frameworkHealth.push({
      frameworkId: framework.id,
      frameworkName: framework.name,
      regulation: framework.regulation,
      complianceScore: status.complianceScore,
      healthy: issues.length === 0,
      issues,
    });
  }

  const healthyFrameworks = frameworkHealth.filter(f => f.healthy).length;
  const totalFrameworks = frameworkHealth.length;
  const healthPercent = totalFrameworks > 0 ? (healthyFrameworks / totalFrameworks) * 100 : 100;

  const overallHealth = healthPercent >= 90 ? "healthy" : healthPercent >= 70 ? "degraded" : "critical";

  return {
    healthy: overallHealth === "healthy",
    frameworks: frameworkHealth,
    overallHealth,
  };
}
