/**
 * Database Index Service (Module 20 — Gap 3)
 *
 * Index usage tracking and recommendations:
 * - Track index usage statistics
 * - Identify unused indexes
 * - Suggest missing indexes
 * - Index size monitoring
 * - Index maintenance recommendations
 * - Automatic index creation (optional)
 *
 * Optimizes database performance through proper indexing.
 */
import { prisma } from "../../db/client.js";
import { logger } from "../../config/logger.js";
import { redisCmd } from "../../db/redis.js";

// ─── Types ──────────────────────────────────────────────────────

export interface IndexInfo {
  indexName: string;
  tableName: string;
  columns: string[];
  indexType: string; // btree, hash, gin, gist, etc.
  isUnique: boolean;
  isPrimary: boolean;
  sizeBytes: number;
  sizeHuman: string;
  indexScans: number;
  tuplesRead: number;
  tuplesFetched: number;
  lastUsed?: string;
  createdAt: string;
}

export interface IndexUsageStats {
  indexName: string;
  tableName: string;
  indexScans: number;
  tuplesRead: number;
  tuplesFetched: number;
  indexSize: number;
  tableSize: number;
  scanPerDay: number;
  usageScore: number; // 0-100, higher = more used
}

export interface MissingIndex {
  tableName: string;
  columns: string[];
  estimatedBenefit: string;
  reason: string;
  priority: "low" | "medium" | "high" | "critical";
}

export interface UnusedIndex {
  indexName: string;
  tableName: string;
  columns: string[];
  sizeBytes: number;
  sizeHuman: string;
  indexScans: number;
  reason: string;
  recommendation: string;
}

export interface IndexRecommendation {
  type: "create" | "drop" | "rebuild" | "reorganize";
  priority: "low" | "medium" | "high" | "critical";
  tableName: string;
  indexName?: string;
  columns?: string[];
  description: string;
  impact: string;
  effort: string;
  sqlCommand?: string;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const INDEX_STATS_KEY = "index_stats:all";
const INDEX_HISTORY_KEY = "index_history:all";

// ─── Index Information Retrieval ────────────────────────────────

/**
 * Get all indexes in the database
 */
export async function getAllIndexes(): Promise<IndexInfo[]> {
  try {
    const result = await prisma.$queryRaw`
      SELECT
        i.relname as index_name,
        t.relname as table_name,
        array_to_string(ARRAY(
          SELECT pg_get_indexdef(ix.indexrelid, k + 1, true)
          FROM generate_subscripts(ix.indkey, 1) as k
          ORDER BY k
        ), ', ') as columns,
        am.amname as index_type,
        ix.indisunique as is_unique,
        ix.indisprimary as is_primary,
        pg_relation_size(i.oid) as size_bytes,
        pg_size_pretty(pg_relation_size(i.oid)) as size_human,
        COALESCE(s.idx_scan, 0) as index_scans,
        COALESCE(s.idx_tup_read, 0) as tuples_read,
        COALESCE(s.idx_tup_fetch, 0) as tuples_fetched,
        pg_stat_get_lastscan(s.indexrelid) as last_used,
        i.relcreated as created_at
      FROM pg_index ix
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_am am ON am.oid = i.relam
      LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = ix.indexrelid
      WHERE t.relkind = 'r'
        AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      ORDER BY t.relname, i.relname
    `;

    return (result as any[]).map((row) => ({
      indexName: row.index_name,
      tableName: row.table_name,
      columns: row.columns.split(", "),
      indexType: row.index_type,
      isUnique: row.is_unique,
      isPrimary: row.is_primary,
      sizeBytes: Number(row.size_bytes),
      sizeHuman: row.size_human,
      indexScans: Number(row.index_scans),
      tuplesRead: Number(row.tuples_read),
      tuplesFetched: Number(row.tuples_fetched),
      lastUsed: row.last_used?.toISOString(),
      createdAt: row.created_at.toISOString(),
    }));
  } catch (error) {
    logger.error("Failed to get indexes", { error });
    throw error;
  }
}

/**
 * Get indexes for a specific table
 */
export async function getTableIndexes(tableName: string): Promise<IndexInfo[]> {
  const allIndexes = await getAllIndexes();
  return allIndexes.filter((idx) => idx.tableName === tableName);
}

/**
 * Get index by name
 */
export async function getIndex(indexName: string): Promise<IndexInfo | null> {
  const allIndexes = await getAllIndexes();
  return allIndexes.find((idx) => idx.indexName === indexName) || null;
}

// ─── Index Usage Analysis ───────────────────────────────────────

/**
 * Get index usage statistics
 */
export async function getIndexUsageStats(): Promise<IndexUsageStats[]> {
  const indexes = await getAllIndexes();
  const stats: IndexUsageStats[] = [];

  for (const index of indexes) {
    // Calculate scan per day (simplified)
    const daysSinceCreation = Math.max(
      1,
      Math.floor(
        (Date.now() - new Date(index.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
    const scanPerDay = index.indexScans / daysSinceCreation;

    // Calculate usage score (0-100)
    // Based on scans per day, tuples read, and index size efficiency
    const scanScore = Math.min(50, scanPerDay * 2);
    const efficiencyScore =
      index.tuplesRead > 0
        ? Math.min(50, (index.tuplesFetched / index.tuplesRead) * 50)
        : 0;
    const usageScore = Math.round(scanScore + efficiencyScore);

    // Get table size
    const tableSizeResult = await prisma.$queryRaw`
      SELECT pg_relation_size(${index.tableName}::regclass) as size
    `;
    const tableSize = Number((tableSizeResult as any)[0]?.size || 0);

    stats.push({
      indexName: index.indexName,
      tableName: index.tableName,
      indexScans: index.indexScans,
      tuplesRead: index.tuplesRead,
      tuplesFetched: index.tuplesFetched,
      indexSize: index.sizeBytes,
      tableSize,
      scanPerDay: Math.round(scanPerDay * 100) / 100,
      usageScore,
    });
  }

  // Sort by usage score (descending)
  stats.sort((a, b) => b.usageScore - a.usageScore);

  return stats;
}

/**
 * Identify unused indexes
 */
export async function findUnusedIndexes(
  minDays: number = 30,
  maxScans: number = 10,
): Promise<UnusedIndex[]> {
  const indexes = await getAllIndexes();
  const unused: UnusedIndex[] = [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - minDays);

  for (const index of indexes) {
    // Skip primary keys and unique constraints
    if (index.isPrimary || index.isUnique) continue;

    // Check if index is unused
    const createdBeforeCutoff = new Date(index.createdAt) < cutoffDate;
    const lowScans = index.indexScans < maxScans;

    if (createdBeforeCutoff && lowScans) {
      const daysSinceCreation = Math.floor(
        (Date.now() - new Date(index.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      );

      unused.push({
        indexName: index.indexName,
        tableName: index.tableName,
        columns: index.columns,
        sizeBytes: index.sizeBytes,
        sizeHuman: index.sizeHuman,
        indexScans: index.indexScans,
        reason: `Index created ${daysSinceCreation} days ago but only used ${index.indexScans} times`,
        recommendation: `Consider dropping this index to save ${index.sizeHuman} of storage and improve write performance`,
      });
    }
  }

  // Sort by size (descending)
  unused.sort((a, b) => b.sizeBytes - a.sizeBytes);

  return unused;
}

/**
 * Identify duplicate indexes
 */
export async function findDuplicateIndexes(): Promise<
  Array<{
    indexes: IndexInfo[];
    recommendation: string;
  }>
> {
  const indexes = await getAllIndexes();
  const duplicates: Array<{
    indexes: IndexInfo[];
    recommendation: string;
  }> = [];

  // Group indexes by table
  const byTable: Record<string, IndexInfo[]> = {};
  for (const index of indexes) {
    if (!byTable[index.tableName]) {
      byTable[index.tableName] = [];
    }
    byTable[index.tableName].push(index);
  }

  // Find duplicates within each table
  for (const [tableName, tableIndexes] of Object.entries(byTable)) {
    for (let i = 0; i < tableIndexes.length; i++) {
      for (let j = i + 1; j < tableIndexes.length; j++) {
        const idx1 = tableIndexes[i];
        const idx2 = tableIndexes[j];

        // Check if columns are the same
        const sameColumns =
          idx1.columns.length === idx2.columns.length &&
          idx1.columns.every((col, k) => col === idx2.columns[k]);

        if (sameColumns) {
          // Keep the one with more scans or larger size
          const keep = idx1.indexScans >= idx2.indexScans ? idx1 : idx2;
          const drop = keep === idx1 ? idx2 : idx1;

          duplicates.push({
            indexes: [idx1, idx2],
            recommendation: `Drop ${drop.indexName} (duplicate of ${keep.indexName}) to save ${drop.sizeHuman}`,
          });
        }
      }
    }
  }

  return duplicates;
}

// ─── Missing Index Detection ────────────────────────────────────

/**
 * Suggest missing indexes based on slow queries
 */
export async function suggestMissingIndexes(): Promise<MissingIndex[]> {
  const suggestions: MissingIndex[] = [];

  // Get slow queries from query analysis service
  const { listSlowQueries } = await import("./queryAnalysis.service.js");
  const slowQueries = await listSlowQueries({ minDurationMs: 1000, limit: 100 });

  // Analyze slow queries to suggest indexes
  for (const query of slowQueries) {
    // This is a simplified analysis - in production, use EXPLAIN to get actual recommendations
    const whereMatch = query.query.match(/WHERE\s+"([^"]+)"\."([^"]+)"\s*=/);
    if (whereMatch) {
      const tableName = whereMatch[1];
      const columnName = whereMatch[2];

      // Check if index already exists
      const tableIndexes = await getTableIndexes(tableName);
      const hasIndex = tableIndexes.some((idx) => idx.columns.includes(columnName));

      if (!hasIndex) {
        suggestions.push({
          tableName,
          columns: [columnName],
          estimatedBenefit: `Reduce query time from ${query.durationMs}ms to ~10-50ms`,
          reason: `Slow query on ${tableName}.${columnName} without index`,
          priority: query.durationMs > 5000 ? "critical" : query.durationMs > 2000 ? "high" : "medium",
        });
      }
    }
  }

  // Remove duplicates
  const unique = suggestions.filter(
    (s, i, arr) =>
      arr.findIndex((x) => x.tableName === s.tableName && x.columns.join(",") === s.columns.join(",")) === i,
  );

  return unique;
}

// ─── Index Maintenance ──────────────────────────────────────────

/**
 * Check for indexes that need rebuilding (high fragmentation)
 */
export async function findIndexesNeedingRebuild(): Promise<
  Array<{
    indexName: string;
    tableName: string;
    fragmentation: number;
    recommendation: string;
  }>
> {
  const needsRebuild: Array<{
    indexName: string;
    tableName: string;
    fragmentation: number;
    recommendation: string;
  }> = [];

  try {
    // Get index statistics
    const result = await prisma.$queryRaw`
      SELECT
        schemaname,
        tablename,
        indexrelname as index_name,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch,
        pg_relation_size(indexrelid) as index_size
      FROM pg_stat_user_indexes
      WHERE idx_scan > 100
      ORDER BY tablename, indexrelname
    `;

    for (const row of result as any[]) {
      // Simplified fragmentation check - in production, use pgstattuple extension
      const efficiency =
        row.idx_tup_read > 0 ? row.idx_tup_fetch / row.idx_tup_read : 1;

      if (efficiency < 0.5) {
        needsRebuild.push({
          indexName: row.index_name,
          tableName: row.tablename,
          fragmentation: Math.round((1 - efficiency) * 100),
          recommendation: `REINDEX INDEX ${row.index_name} to improve efficiency from ${Math.round(efficiency * 100)}%`,
        });
      }
    }
  } catch (error) {
    logger.error("Failed to check index fragmentation", { error });
  }

  return needsRebuild;
}

/**
 * Generate index recommendations
 */
export async function generateIndexRecommendations(): Promise<IndexRecommendation[]> {
  const recommendations: IndexRecommendation[] = [];

  // Find unused indexes
  const unusedIndexes = await findUnusedIndexes();
  for (const unused of unusedIndexes.slice(0, 5)) {
    recommendations.push({
      type: "drop",
      priority: unused.sizeBytes > 100 * 1024 * 1024 ? "high" : "medium",
      tableName: unused.tableName,
      indexName: unused.indexName,
      columns: unused.columns,
      description: unused.reason,
      impact: `Save ${unused.sizeHuman} of storage and improve write performance`,
      effort: "Low",
      sqlCommand: `DROP INDEX ${unused.indexName};`,
    });
  }

  // Find duplicate indexes
  const duplicateIndexes = await findDuplicateIndexes();
  for (const dup of duplicateIndexes.slice(0, 5)) {
    const drop = dup.indexes[1]; // Drop the second one
    recommendations.push({
      type: "drop",
      priority: "medium",
      tableName: drop.tableName,
      indexName: drop.indexName,
      columns: drop.columns,
      description: dup.recommendation,
      impact: `Save ${drop.sizeHuman} of storage`,
      effort: "Low",
      sqlCommand: `DROP INDEX ${drop.indexName};`,
    });
  }

  // Suggest missing indexes
  const missingIndexes = await suggestMissingIndexes();
  for (const missing of missingIndexes.slice(0, 5)) {
    const indexName = `idx_${missing.tableName}_${missing.columns.join("_")}`;
    recommendations.push({
      type: "create",
      priority: missing.priority,
      tableName: missing.tableName,
      columns: missing.columns,
      description: missing.reason,
      impact: missing.estimatedBenefit,
      effort: "Low",
      sqlCommand: `CREATE INDEX ${indexName} ON ${missing.tableName} (${missing.columns.join(", ")});`,
    });
  }

  // Find indexes needing rebuild
  const needsRebuild = await findIndexesNeedingRebuild();
  for (const rebuild of needsRebuild.slice(0, 5)) {
    recommendations.push({
      type: "rebuild",
      priority: "medium",
      tableName: rebuild.tableName,
      indexName: rebuild.indexName,
      description: rebuild.recommendation,
      impact: `Improve index efficiency by ${rebuild.fragmentation}%`,
      effort: "Medium",
      sqlCommand: `REINDEX INDEX ${rebuild.indexName};`,
    });
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations;
}

// ─── Index Statistics ───────────────────────────────────────────

/**
 * Get index statistics summary
 */
export async function getIndexStatsSummary(): Promise<{
  totalIndexes: number;
  totalSizeBytes: number;
  totalSizeHuman: string;
  byTable: Record<string, number>;
  byType: Record<string, number>;
  avgUsageScore: number;
  unusedCount: number;
  duplicateCount: number;
}> {
  const indexes = await getAllIndexes();
  const usageStats = await getIndexUsageStats();
  const unusedIndexes = await findUnusedIndexes();
  const duplicateIndexes = await findDuplicateIndexes();

  const byTable: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let totalSizeBytes = 0;

  for (const index of indexes) {
    byTable[index.tableName] = (byTable[index.tableName] || 0) + 1;
    byType[index.indexType] = (byType[index.indexType] || 0) + 1;
    totalSizeBytes += index.sizeBytes;
  }

  const avgUsageScore =
    usageStats.length > 0
      ? usageStats.reduce((sum, s) => sum + s.usageScore, 0) / usageStats.length
      : 0;

  // Get human-readable size
  const sizeResult = await prisma.$queryRaw`
    SELECT pg_size_pretty(${totalSizeBytes}::bigint) as size
  `;
  const totalSizeHuman = (sizeResult as any)[0]?.size || "0 bytes";

  return {
    totalIndexes: indexes.length,
    totalSizeBytes,
    totalSizeHuman,
    byTable,
    byType,
    avgUsageScore: Math.round(avgUsageScore),
    unusedCount: unusedIndexes.length,
    duplicateCount: duplicateIndexes.length,
  };
}
