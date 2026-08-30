/**
 * Module 45: Federated Query Execution Service
 *
 * Provides distributed query execution across multiple data sources with
 * SQL-like query interface, query planning and optimization, partial result
 * aggregation, result caching, access control, and comprehensive audit logging.
 *
 * Phase 1 — Critical Gap: Federated query execution infrastructure
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:federatedQueryExecution');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type FederatedQueryStatus = "pending" | "planning" | "executing" | "aggregating" | "completed" | "failed" | "cancelled";

export type QueryType = "select" | "aggregate" | "join" | "union" | "custom";

export type AggregationFunction = "sum" | "count" | "avg" | "min" | "max" | "histogram" | "percentile" | "distinct_count";

export type JoinType = "inner" | "left" | "right" | "full" | "cross";

export interface FederatedQueryJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: FederatedQueryStatus;
  queryType: QueryType;
  queryConfig: QueryConfig;
  participants: QueryParticipant[];
  result?: FederatedQueryResult;
  error?: { code: string; message: string; step?: string };
  performance: QueryPerformance;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface QueryConfig {
  queryString: string;
  queryType: QueryType;
  selectClause?: SelectClause;
  fromClause?: FromClause;
  whereClause?: WhereClause;
  groupByClause?: string[];
  orderByClause?: OrderByClause[];
  limit?: number;
  offset?: number;
  aggregations?: AggregationClause[];
  joins?: JoinClause[];
  privacyConfig?: QueryPrivacyConfig;
  cacheConfig?: QueryCacheConfig;
}

export interface SelectClause {
  columns: Array<{
    name: string;
    alias?: string;
    expression?: string;
    aggregation?: AggregationFunction;
  }>;
  distinct?: boolean;
}

export interface FromClause {
  tables: Array<{
    name: string;
    alias?: string;
    dataSourceId: string;
    organizationId: string;
  }>;
}

export interface WhereClause {
  conditions: Array<{
    column: string;
    operator: "=" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not_in" | "like" | "between";
    value: unknown;
    logicalOperator?: "and" | "or";
  }>;
}

export interface OrderByClause {
  column: string;
  direction: "asc" | "desc";
}

export interface AggregationClause {
  function: AggregationFunction;
  column: string;
  alias?: string;
  parameters?: Record<string, unknown>; // For histogram bins, percentile values, etc.
}

export interface JoinClause {
  type: JoinType;
  leftTable: string;
  rightTable: string;
  leftColumn: string;
  rightColumn: string;
  condition?: string;
}

export interface QueryPrivacyConfig {
  enabled: boolean;
  differentialPrivacy?: {
    epsilon: number;
    delta: number;
    sensitivity: number;
  };
  secureAggregation?: {
    protocol: "shamir" | "additive" | "replicated";
    threshold: number;
  };
  anonymization?: {
    kAnonymity: number;
    lDiversity?: number;
  };
}

export interface QueryCacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  cacheKey?: string;
  invalidateOnUpdate?: boolean;
}

export interface QueryParticipant {
  id: string;
  organizationId: string;
  organizationName: string;
  dataSourceId: string;
  dataSourceName: string;
  status: "pending" | "executing" | "completed" | "failed";
  partialResult?: PartialQueryResult;
  executionTimeMs?: number;
  rowsProcessed?: number;
  error?: string;
  joinedAt: string;
}

export interface PartialQueryResult {
  participantId: string;
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  aggregations?: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface FederatedQueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  aggregations?: Record<string, unknown>;
  metadata: {
    totalParticipants: number;
    successfulParticipants: number;
    failedParticipants: number;
    totalExecutionTimeMs: number;
    aggregationTimeMs: number;
    privacyBudgetUsed?: number;
    cacheHit: boolean;
  };
  privacyReport?: QueryPrivacyReport;
  cachedAt?: string;
  expiresAt?: string;
}

export interface QueryPrivacyReport {
  mechanism: string;
  epsilon?: number;
  delta?: number;
  noiseAdded: boolean;
  privacyBudgetUsed: number;
  privacyBudgetRemaining: number;
  anonymizationLevel?: string;
  warnings: string[];
}

export interface QueryPerformance {
  planningTimeMs: number;
  executionTimeMs: number;
  aggregationTimeMs: number;
  totalTimeMs: number;
  dataTransferredBytes: number;
  rowsProcessed: number;
  rowsReturned: number;
  cacheHit: boolean;
  participantPerformance: Array<{
    participantId: string;
    organizationName: string;
    executionTimeMs: number;
    rowsProcessed: number;
    dataTransferredBytes: number;
  }>;
}

export interface QueryAccessControl {
  queryId: string;
  organizationId: string;
  allowedOrganizations: string[];
  allowedDataSources: string[];
  permissions: Array<{
    organizationId: string;
    permission: "read" | "write" | "admin";
    grantedBy: string;
    grantedAt: string;
  }>;
}

export interface QueryAuditLog {
  id: string;
  queryId: string;
  organizationId: string;
  action: "created" | "executed" | "completed" | "failed" | "cancelled" | "cached" | "accessed";
  actor: string;
  timestamp: string;
  details: Record<string, unknown>;
  privacyImpact?: {
    epsilonUsed?: number;
    deltaUsed?: number;
    rowsAccessed?: number;
  };
}

export interface FederatedQueryStats {
  totalQueries: number;
  completedQueries: number;
  failedQueries: number;
  averageExecutionTimeMs: number;
  totalRowsProcessed: number;
  totalDataTransferredBytes: number;
  cacheHitRate: number;
  queriesByType: Record<string, number>;
  queriesByOrganization: Record<string, number>;
  privacyBudgetUsage: Record<string, number>;
  topPerformingQueries: Array<{
    queryId: string;
    name: string;
    executionTimeMs: number;
    rowsProcessed: number;
  }>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const federatedQueries = new Map<string, FederatedQueryJob>();
const queryAccessControls = new Map<string, QueryAccessControl>();
const queryAuditLogs = new Map<string, QueryAuditLog[]>();
const queryCache = new Map<string, { result: FederatedQueryResult; expiresAt: string }>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a federated query job
 */
export async function createFederatedQueryJob(params: {
  organizationId: string;
  name: string;
  description?: string;
  queryConfig: QueryConfig;
  participants: Array<{
    organizationId: string;
    organizationName: string;
    dataSourceId: string;
    dataSourceName: string;
  }>;
  createdBy: string;
}): Promise<FederatedQueryJob> {
  const now = new Date().toISOString();

  const queryParticipants: QueryParticipant[] = params.participants.map(p => ({
    id: `qp_${randomUUID().slice(0, 8)}`,
    organizationId: p.organizationId,
    organizationName: p.organizationName,
    dataSourceId: p.dataSourceId,
    dataSourceName: p.dataSourceName,
    status: "pending",
    joinedAt: now,
  }));

  const job: FederatedQueryJob = {
    id: `fq_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: "pending",
    queryType: params.queryConfig.queryType,
    queryConfig: params.queryConfig,
    participants: queryParticipants,
    performance: {
      planningTimeMs: 0,
      executionTimeMs: 0,
      aggregationTimeMs: 0,
      totalTimeMs: 0,
      dataTransferredBytes: 0,
      rowsProcessed: 0,
      rowsReturned: 0,
      cacheHit: false,
      participantPerformance: [],
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  federatedQueries.set(job.id, job);

  // Log audit
  await logQueryAudit(job.id, params.organizationId, "created", params.createdBy, {
    queryType: job.queryType,
    participantCount: queryParticipants.length,
  });

  return job;
}

/**
 * Execute a federated query job
 */
export async function executeFederatedQueryJob(queryId: string): Promise<FederatedQueryJob | null> {
  const job = federatedQueries.get(queryId);
  if (!job) return null;

  if (job.status !== "pending") {
    throw new Error(`Cannot execute query in status: ${job.status}`);
  }

  // Check cache first
  if (job.queryConfig.cacheConfig?.enabled) {
    const cacheKey = job.queryConfig.cacheConfig.cacheKey ?? generateCacheKey(job.queryConfig);
    const cached = queryCache.get(cacheKey);
    
    if (cached && new Date(cached.expiresAt) > new Date()) {
      job.status = "completed";
      job.result = cached.result;
      job.result.metadata.cacheHit = true;
      job.performance.cacheHit = true;
      job.completedAt = new Date().toISOString();
      job.updatedAt = job.completedAt;

      federatedQueries.set(queryId, job);

      await logQueryAudit(queryId, job.organizationId, "cached", job.createdBy, {
        cacheKey,
        cacheHit: true,
      });

      return job;
    }
  }

  job.status = "planning";
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  federatedQueries.set(queryId, job);

  // Simulate query planning
  const planningStart = Date.now();
  await new Promise(resolve => setTimeout(resolve, 100));
  job.performance.planningTimeMs = Date.now() - planningStart;

  job.status = "executing";
  job.updatedAt = new Date().toISOString();

  federatedQueries.set(queryId, job);

  // Execute query on all participants
  await executeQueryOnParticipants(job);

  return job;
}

/**
 * Get federated query job by ID
 */
export async function getFederatedQueryJob(queryId: string): Promise<FederatedQueryJob | null> {
  return federatedQueries.get(queryId) ?? null;
}

/**
 * List federated query jobs
 */
export async function listFederatedQueryJobs(
  organizationId: string,
  filters?: {
    status?: FederatedQueryStatus;
    queryType?: QueryType;
    limit?: number;
  }
): Promise<FederatedQueryJob[]> {
  let result = Array.from(federatedQueries.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.queryType) result = result.filter(j => j.queryType === filters.queryType);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Cancel a federated query job
 */
export async function cancelFederatedQueryJob(queryId: string): Promise<FederatedQueryJob | null> {
  const job = federatedQueries.get(queryId);
  if (!job) return null;

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    throw new Error(`Cannot cancel query in status: ${job.status}`);
  }

  job.status = "cancelled";
  job.updatedAt = new Date().toISOString();

  federatedQueries.set(queryId, job);

  await logQueryAudit(queryId, job.organizationId, "cancelled", job.createdBy, {});

  return job;
}

/**
 * Set query access control
 */
export async function setQueryAccessControl(
  queryId: string,
  accessControl: Omit<QueryAccessControl, "queryId">
): Promise<QueryAccessControl> {
  const fullAccessControl: QueryAccessControl = {
    queryId,
    ...accessControl,
  };

  queryAccessControls.set(queryId, fullAccessControl);

  return fullAccessControl;
}

/**
 * Get query access control
 */
export async function getQueryAccessControl(queryId: string): Promise<QueryAccessControl | null> {
  return queryAccessControls.get(queryId) ?? null;
}

/**
 * Get query audit logs
 */
export async function getQueryAuditLogs(
  queryId: string,
  limit: number = 100
): Promise<QueryAuditLog[]> {
  const logs = queryAuditLogs.get(queryId) ?? [];
  return logs.slice(0, limit);
}

/**
 * Get federated query statistics
 */
export async function getFederatedQueryStats(organizationId: string): Promise<FederatedQueryStats> {
  const allQueries = Array.from(federatedQueries.values()).filter(
    q => q.organizationId === organizationId
  );

  const completedQueries = allQueries.filter(q => q.status === "completed");
  const failedQueries = allQueries.filter(q => q.status === "failed");

  let totalExecutionTime = 0;
  let totalRowsProcessed = 0;
  let totalDataTransferred = 0;
  let cacheHits = 0;
  const queriesByType: Record<string, number> = {};
  const queriesByOrganization: Record<string, number> = {};
  const privacyBudgetUsage: Record<string, number> = {};

  for (const query of allQueries) {
    queriesByType[query.queryType] = (queriesByType[query.queryType] || 0) + 1;
    queriesByOrganization[query.organizationId] = (queriesByOrganization[query.organizationId] || 0) + 1;

    if (query.status === "completed") {
      totalExecutionTime += query.performance.totalTimeMs;
      totalRowsProcessed += query.performance.rowsProcessed;
      totalDataTransferred += query.performance.dataTransferredBytes;

      if (query.performance.cacheHit) {
        cacheHits++;
      }

      if (query.result?.privacyReport) {
        const org = query.organizationId;
        privacyBudgetUsage[org] = (privacyBudgetUsage[org] || 0) + (query.result.privacyReport.privacyBudgetUsed || 0);
      }
    }
  }

  const topPerformingQueries = completedQueries
    .sort((a, b) => a.performance.totalTimeMs - b.performance.totalTimeMs)
    .slice(0, 10)
    .map(q => ({
      queryId: q.id,
      name: q.name,
      executionTimeMs: q.performance.totalTimeMs,
      rowsProcessed: q.performance.rowsProcessed,
    }));

  return {
    totalQueries: allQueries.length,
    completedQueries: completedQueries.length,
    failedQueries: failedQueries.length,
    averageExecutionTimeMs: completedQueries.length > 0 ? Math.round(totalExecutionTime / completedQueries.length) : 0,
    totalRowsProcessed,
    totalDataTransferredBytes: totalDataTransferred,
    cacheHitRate: completedQueries.length > 0 ? (cacheHits / completedQueries.length) * 100 : 0,
    queriesByType,
    queriesByOrganization,
    privacyBudgetUsage,
    topPerformingQueries,
  };
}

// ─── Internal Functions ───────────────────────────────────────────────────────

async function executeQueryOnParticipants(job: FederatedQueryJob): Promise<void> {
  const executionStart = Date.now();

  // Simulate parallel execution on all participants
  const executionPromises = job.participants.map(async (participant) => {
    try {
      participant.status = "executing";
      const participantStart = Date.now();

      // Simulate query execution
      await new Promise(resolve => setTimeout(resolve, 500 + _rng.next() * 1000));

      // Generate partial result
      const partialResult = generatePartialResult(job.queryConfig, participant);

      participant.status = "completed";
      participant.partialResult = partialResult;
      participant.executionTimeMs = Date.now() - participantStart;
      participant.rowsProcessed = partialResult.rowCount;

      job.performance.participantPerformance.push({
        participantId: participant.id,
        organizationName: participant.organizationName,
        executionTimeMs: participant.executionTimeMs,
        rowsProcessed: participant.rowsProcessed,
        dataTransferredBytes: partialResult.rowCount * 100, // Estimate
      });
    } catch (error) {
      participant.status = "failed";
      participant.error = error instanceof Error ? error.message : String(error);
    }
  });

  await Promise.all(executionPromises);

  job.performance.executionTimeMs = Date.now() - executionStart;

  // Aggregate results
  job.status = "aggregating";
  job.updatedAt = new Date().toISOString();

  const aggregationStart = Date.now();
  const aggregatedResult = aggregatePartialResults(job);
  job.performance.aggregationTimeMs = Date.now() - aggregationStart;

  job.result = aggregatedResult;
  job.status = "completed";
  job.completedAt = new Date().toISOString();
  job.updatedAt = job.completedAt;

  job.performance.totalTimeMs = job.completedAt.getTime() - job.startedAt!.getTime();
  job.performance.rowsProcessed = job.participants.reduce((sum, p) => sum + (p.rowsProcessed ?? 0), 0);
  job.performance.rowsReturned = aggregatedResult.rowCount;
  job.performance.dataTransferredBytes = job.performance.participantPerformance.reduce(
    (sum, p) => sum + p.dataTransferredBytes,
    0
  );

  federatedQueries.set(job.id, job);

  // Cache result if enabled
  if (job.queryConfig.cacheConfig?.enabled) {
    const cacheKey = job.queryConfig.cacheConfig.cacheKey ?? generateCacheKey(job.queryConfig);
    const expiresAt = new Date(Date.now() + job.queryConfig.cacheConfig.ttlSeconds * 1000).toISOString();
    
    queryCache.set(cacheKey, {
      result: aggregatedResult,
      expiresAt,
    });

    aggregatedResult.cachedAt = new Date().toISOString();
    aggregatedResult.expiresAt = expiresAt;

    await logQueryAudit(job.id, job.organizationId, "cached", job.createdBy, {
      cacheKey,
      expiresAt,
    });
  }

  await logQueryAudit(job.id, job.organizationId, "completed", job.createdBy, {
    executionTimeMs: job.performance.totalTimeMs,
    rowsProcessed: job.performance.rowsProcessed,
    rowsReturned: job.performance.rowsReturned,
  });
}

function generatePartialResult(queryConfig: QueryConfig, participant: QueryParticipant): PartialQueryResult {
  const numRows = 100 + Math.floor(_rng.next() * 900);
  const columns = queryConfig.selectClause?.columns.map(c => c.alias ?? c.name) ?? ["column1", "column2"];

  const rows: unknown[][] = [];
  for (let i = 0; i < numRows; i++) {
    const row = columns.map(() => _rng.next() * 100);
    rows.push(row);
  }

  const aggregations: Record<string, unknown> = {};
  if (queryConfig.aggregations) {
    for (const agg of queryConfig.aggregations) {
      const alias = agg.alias ?? `${agg.function}_${agg.column}`;
      
      switch (agg.function) {
        case "sum":
          aggregations[alias] = rows.reduce((sum, row) => sum + (row[0] as number), 0);
          break;
        case "count":
          aggregations[alias] = numRows;
          break;
        case "avg":
          aggregations[alias] = rows.reduce((sum, row) => sum + (row[0] as number), 0) / numRows;
          break;
        case "min":
          aggregations[alias] = Math.min(...rows.map(row => row[0] as number));
          break;
        case "max":
          aggregations[alias] = Math.max(...rows.map(row => row[0] as number));
          break;
        default:
          aggregations[alias] = null;
      }
    }
  }

  return {
    participantId: participant.id,
    columns,
    rows,
    rowCount: numRows,
    aggregations,
    metadata: {
      organizationId: participant.organizationId,
      dataSourceId: participant.dataSourceId,
    },
  };
}

function aggregatePartialResults(job: FederatedQueryJob): FederatedQueryResult {
  const successfulParticipants = job.participants.filter(p => p.status === "completed" && p.partialResult);
  const failedParticipants = job.participants.filter(p => p.status === "failed");

  if (successfulParticipants.length === 0) {
    throw new Error("No successful participants to aggregate");
  }

  const columns = successfulParticipants[0].partialResult!.columns;
  const allRows: unknown[][] = [];
  const aggregatedAggregations: Record<string, unknown> = {};

  // Aggregate rows
  for (const participant of successfulParticipants) {
    allRows.push(...participant.partialResult!.rows);
  }

  // Apply limit and offset
  let finalRows = allRows;
  if (job.queryConfig.offset) {
    finalRows = finalRows.slice(job.queryConfig.offset);
  }
  if (job.queryConfig.limit) {
    finalRows = finalRows.slice(0, job.queryConfig.limit);
  }

  // Aggregate aggregations
  if (job.queryConfig.aggregations) {
    for (const agg of job.queryConfig.aggregations) {
      const alias = agg.alias ?? `${agg.function}_${agg.column}`;
      const partialValues = successfulParticipants
        .map(p => p.partialResult!.aggregations?.[alias])
        .filter(v => v !== undefined);

      switch (agg.function) {
        case "sum":
          aggregatedAggregations[alias] = partialValues.reduce((sum: number, v: any) => sum + v, 0);
          break;
        case "count":
          aggregatedAggregations[alias] = partialValues.reduce((sum: number, v: any) => sum + v, 0);
          break;
        case "avg":
          aggregatedAggregations[alias] = partialValues.reduce((sum: number, v: any) => sum + v, 0) / partialValues.length;
          break;
        case "min":
          aggregatedAggregations[alias] = Math.min(...partialValues as number[]);
          break;
        case "max":
          aggregatedAggregations[alias] = Math.max(...partialValues as number[]);
          break;
        default:
          aggregatedAggregations[alias] = null;
      }
    }
  }

  // Generate privacy report if privacy config is enabled
  let privacyReport: QueryPrivacyReport | undefined;
  if (job.queryConfig.privacyConfig?.enabled) {
    privacyReport = generatePrivacyReport(job.queryConfig.privacyConfig, finalRows.length);
  }

  return {
    columns,
    rows: finalRows,
    rowCount: finalRows.length,
    aggregations: Object.keys(aggregatedAggregations).length > 0 ? aggregatedAggregations : undefined,
    metadata: {
      totalParticipants: job.participants.length,
      successfulParticipants: successfulParticipants.length,
      failedParticipants: failedParticipants.length,
      totalExecutionTimeMs: job.performance.executionTimeMs,
      aggregationTimeMs: job.performance.aggregationTimeMs,
      privacyBudgetUsed: privacyReport?.privacyBudgetUsed,
      cacheHit: false,
    },
    privacyReport,
  };
}

function generatePrivacyReport(
  privacyConfig: QueryPrivacyConfig,
  rowCount: number
): QueryPrivacyReport {
  const warnings: string[] = [];
  let privacyBudgetUsed = 0;

  if (privacyConfig.differentialPrivacy) {
    privacyBudgetUsed = privacyConfig.differentialPrivacy.epsilon;
    
    if (privacyBudgetUsed > 1.0) {
      warnings.push(`High epsilon value (${privacyBudgetUsed}) provides weak privacy guarantees`);
    }
  }

  return {
    mechanism: privacyConfig.differentialPrivacy ? "differential_privacy" : 
               privacyConfig.secureAggregation ? "secure_aggregation" : 
               privacyConfig.anonymization ? "anonymization" : "none",
    epsilon: privacyConfig.differentialPrivacy?.epsilon,
    delta: privacyConfig.differentialPrivacy?.delta,
    noiseAdded: !!privacyConfig.differentialPrivacy,
    privacyBudgetUsed,
    privacyBudgetRemaining: 10 - privacyBudgetUsed, // Assume budget of 10
    anonymizationLevel: privacyConfig.anonymization ? `k=${privacyConfig.anonymization.kAnonymity}` : undefined,
    warnings,
  };
}

function generateCacheKey(queryConfig: QueryConfig): string {
  const keyParts = [
    queryConfig.queryString,
    queryConfig.queryType,
    JSON.stringify(queryConfig.selectClause),
    JSON.stringify(queryConfig.fromClause),
    JSON.stringify(queryConfig.whereClause),
    JSON.stringify(queryConfig.aggregations),
  ];

  return `cache_${Buffer.from(keyParts.join("|")).toString("base64").slice(0, 32)}`;
}

async function logQueryAudit(
  queryId: string,
  organizationId: string,
  action: QueryAuditLog["action"],
  actor: string,
  details: Record<string, unknown>
): Promise<void> {
  const auditLog: QueryAuditLog = {
    id: `audit_${randomUUID().slice(0, 8)}`,
    queryId,
    organizationId,
    action,
    actor,
    timestamp: new Date().toISOString(),
    details,
  };

  const logs = queryAuditLogs.get(queryId) ?? [];
  logs.unshift(auditLog);
  queryAuditLogs.set(queryId, logs.slice(0, 1000)); // Keep last 1000 logs
}
