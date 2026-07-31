/**
 * Module 31: Twin Synchronization Service
 *
 * Manages real-time synchronization between physical assets (IoT devices,
 * sensors, systems) and their digital twin representations. Provides state
 * reconciliation, conflict resolution, bidirectional sync, sync health
 * monitoring, and offline/online queue management.
 *
 * Phase 1 — Critical Gap: Enterprise digital twin synchronization infrastructure
 */

import { randomUUID, createHash } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyncDirection = "device-to-twin" | "twin-to-device" | "bidirectional";

export type SyncStatus = "synced" | "pending" | "conflict" | "error" | "offline" | "stale";

export type ConflictResolution = "device-wins" | "twin-wins" | "merge" | "manual" | "latest-wins";

export type SyncEventType =
  | "sync-started"
  | "sync-completed"
  | "sync-failed"
  | "conflict-detected"
  | "conflict-resolved"
  | "device-connected"
  | "device-disconnected"
  | "state-updated"
  | "queue-flushed"
  | "mapping-created"
  | "mapping-removed";

export interface TwinDeviceMapping {
  id: string;
  organizationId: string;
  twinId: string;
  entityId: string;
  deviceId: string;
  deviceName: string;
  direction: SyncDirection;
  status: SyncStatus;
  syncConfig: {
    intervalMs: number;
    retryAttempts: number;
    retryDelayMs: number;
    conflictResolution: ConflictResolution;
    fieldsToSync: string[];
    transformRules: Array<{
      sourceField: string;
      targetField: string;
      transformation?: string;
    }>;
  };
  lastSyncAt?: string;
  lastSuccessfulSyncAt?: string;
  lastErrorAt?: string;
  lastErrorMessage?: string;
  syncCount: number;
  conflictCount: number;
  errorCount: number;
  latencyMs: number;
  version: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SyncConflict {
  id: string;
  mappingId: string;
  twinId: string;
  entityId: string;
  deviceId: string;
  field: string;
  deviceValue: unknown;
  deviceTimestamp: string;
  twinValue: unknown;
  twinTimestamp: string;
  resolution?: ConflictResolution;
  resolvedValue?: unknown;
  resolvedAt?: string;
  resolvedBy?: string;
  status: "pending" | "resolved" | "escalated";
  detectedAt: string;
}

export interface SyncQueueItem {
  id: string;
  mappingId: string;
  direction: SyncDirection;
  payload: Record<string, unknown>;
  timestamp: string;
  priority: "high" | "normal" | "low";
  retryCount: number;
  maxRetries: number;
  status: "queued" | "processing" | "completed" | "failed" | "deferred";
  errorMessage?: string;
  createdAt: string;
}

export interface SyncHealthReport {
  mappingId: string;
  twinId: string;
  deviceId: string;
  overallStatus: SyncStatus;
  syncCount24h: number;
  conflictCount24h: number;
  errorCount24h: number;
  averageLatencyMs: number;
  lastSyncAt?: string;
  timeSinceLastSyncMs?: number;
  queueDepth: number;
  pendingConflicts: number;
  healthScore: number; // 0-100
  recommendations: string[];
  checkedAt: string;
}

export interface SyncEvent {
  id: string;
  mappingId: string;
  twinId: string;
  deviceId: string;
  type: SyncEventType;
  severity: "info" | "warning" | "error" | "critical";
  data: Record<string, unknown>;
  timestamp: string;
}

export interface SyncStateSnapshot {
  mappingId: string;
  twinId: string;
  entityId: string;
  deviceId: string;
  deviceState: Record<string, unknown>;
  twinState: Record<string, unknown>;
  delta: Record<string, { deviceValue?: unknown; twinValue?: unknown; direction: "device-newer" | "twin-newer" | "same" }>;
  version: number;
  capturedAt: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const mappings = new Map<string, TwinDeviceMapping>();
const conflicts: SyncConflict[] = [];
const syncQueue: SyncQueueItem[] = [];
const syncEvents: SyncEvent[] = [];
const stateSnapshots = new Map<string, SyncStateSnapshot>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a mapping between a digital twin entity and an IoT device
 */
export async function createTwinDeviceMapping(params: {
  organizationId: string;
  twinId: string;
  entityId: string;
  deviceId: string;
  deviceName: string;
  direction?: SyncDirection;
  syncConfig?: Partial<TwinDeviceMapping["syncConfig"]>;
  metadata?: Record<string, unknown>;
}): Promise<TwinDeviceMapping> {
  const now = new Date().toISOString();

  const mapping: TwinDeviceMapping = {
    id: `map_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    twinId: params.twinId,
    entityId: params.entityId,
    deviceId: params.deviceId,
    deviceName: params.deviceName,
    direction: params.direction ?? "bidirectional",
    status: "pending",
    syncConfig: {
      intervalMs: params.syncConfig?.intervalMs ?? 5000,
      retryAttempts: params.syncConfig?.retryAttempts ?? 3,
      retryDelayMs: params.syncConfig?.retryDelayMs ?? 1000,
      conflictResolution: params.syncConfig?.conflictResolution ?? "latest-wins",
      fieldsToSync: params.syncConfig?.fieldsToSync ?? [],
      transformRules: params.syncConfig?.transformRules ?? [],
    },
    syncCount: 0,
    conflictCount: 0,
    errorCount: 0,
    latencyMs: 0,
    version: 1,
    metadata: params.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  mappings.set(mapping.id, mapping);

  recordSyncEvent(mapping.id, params.twinId, params.deviceId, "mapping-created", "info", {
    entityId: params.entityId,
    direction: mapping.direction,
  });

  return mapping;
}

/**
 * Get a twin-device mapping by ID
 */
export async function getTwinDeviceMapping(mappingId: string): Promise<TwinDeviceMapping | null> {
  return mappings.get(mappingId) ?? null;
}

/**
 * List all mappings for a twin
 */
export async function listTwinDeviceMappings(
  twinId: string,
  filters?: { status?: SyncStatus; direction?: SyncDirection }
): Promise<TwinDeviceMapping[]> {
  let result = Array.from(mappings.values()).filter(m => m.twinId === twinId);
  if (filters?.status) result = result.filter(m => m.status === filters.status);
  if (filters?.direction) result = result.filter(m => m.direction === filters.direction);
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * List all mappings for a device
 */
export async function listDeviceTwinMappings(deviceId: string): Promise<TwinDeviceMapping[]> {
  return Array.from(mappings.values())
    .filter(m => m.deviceId === deviceId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * List all mappings for an organization
 */
export async function listOrganizationMappings(
  organizationId: string,
  filters?: { status?: SyncStatus; twinId?: string }
): Promise<TwinDeviceMapping[]> {
  let result = Array.from(mappings.values()).filter(m => m.organizationId === organizationId);
  if (filters?.status) result = result.filter(m => m.status === filters.status);
  if (filters?.twinId) result = result.filter(m => m.twinId === filters.twinId);
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Remove a twin-device mapping
 */
export async function removeTwinDeviceMapping(mappingId: string): Promise<boolean> {
  const mapping = mappings.get(mappingId);
  if (!mapping) return false;

  recordSyncEvent(mappingId, mapping.twinId, mapping.deviceId, "mapping-removed", "info", {});
  mappings.delete(mappingId);
  return true;
}

/**
 * Synchronize device state to twin (device → twin)
 */
export async function syncDeviceToTwin(
  mappingId: string,
  deviceState: Record<string, unknown>,
  deviceTimestamp?: string
): Promise<{
  success: boolean;
  updated: boolean;
  conflicts: SyncConflict[];
  twinState?: Record<string, unknown>;
}> {
  const mapping = mappings.get(mappingId);
  if (!mapping) throw new Error(`Mapping ${mappingId} not found`);

  if (mapping.direction !== "device-to-twin" && mapping.direction !== "bidirectional") {
    throw new Error(`Mapping ${mappingId} does not support device-to-twin sync`);
  }

  const now = new Date().toISOString();
  const startTime = Date.now();
  const newConflicts: SyncConflict[] = [];
  const twinState: Record<string, unknown> = {};
  const deviceTs = deviceTimestamp ?? now;

  // Get current twin state from snapshot
  const snapshot = stateSnapshots.get(mappingId);
  const currentTwinState = snapshot?.twinState ?? {};

  // Apply transform rules
  const transformedState = applyTransformRules(deviceState, mapping.syncConfig.transformRules, "device-to-twin");

  // Filter fields if specified
  const fieldsToProcess = mapping.syncConfig.fieldsToSync.length > 0
    ? mapping.syncConfig.fieldsToSync
    : Object.keys(transformedState);

  for (const field of fieldsToProcess) {
    const deviceValue = transformedState[field];
    const twinValue = currentTwinState[field];

    if (deviceValue === undefined) continue;

    // Check for conflicts
    if (twinValue !== undefined && JSON.stringify(twinValue) !== JSON.stringify(deviceValue)) {
      const twinTimestamp = snapshot?.capturedAt ?? now;

      // Check if this is actually a conflict (both changed since last sync)
      if (mapping.lastSyncAt && twinTimestamp > mapping.lastSyncAt) {
        const conflict: SyncConflict = {
          id: `conf_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
          mappingId,
          twinId: mapping.twinId,
          entityId: mapping.entityId,
          deviceId: mapping.deviceId,
          field,
          deviceValue,
          deviceTimestamp: deviceTs,
          twinValue,
          twinTimestamp: twinTimestamp,
          status: "pending",
          detectedAt: now,
        };

        // Auto-resolve based on conflict resolution strategy
        switch (mapping.syncConfig.conflictResolution) {
          case "device-wins":
            conflict.resolution = "device-wins";
            conflict.resolvedValue = deviceValue;
            conflict.status = "resolved";
            conflict.resolvedAt = now;
            conflict.resolvedBy = "auto";
            twinState[field] = deviceValue;
            break;
          case "twin-wins":
            conflict.resolution = "twin-wins";
            conflict.resolvedValue = twinValue;
            conflict.status = "resolved";
            conflict.resolvedAt = now;
            conflict.resolvedBy = "auto";
            twinState[field] = twinValue;
            break;
          case "latest-wins":
            if (deviceTs >= twinTimestamp) {
              conflict.resolution = "device-wins";
              conflict.resolvedValue = deviceValue;
              twinState[field] = deviceValue;
            } else {
              conflict.resolution = "twin-wins";
              conflict.resolvedValue = twinValue;
              twinState[field] = twinValue;
            }
            conflict.status = "resolved";
            conflict.resolvedAt = now;
            conflict.resolvedBy = "auto";
            break;
          case "merge":
            // Simple merge: combine objects, take device value for primitives
            if (typeof deviceValue === "object" && typeof twinValue === "object") {
              conflict.resolvedValue = { ...(twinValue as object), ...(deviceValue as object) };
            } else {
              conflict.resolvedValue = deviceValue;
            }
            conflict.resolution = "merge";
            conflict.status = "resolved";
            conflict.resolvedAt = now;
            conflict.resolvedBy = "auto";
            twinState[field] = conflict.resolvedValue;
            break;
          case "manual":
            conflicts.push(conflict);
            newConflicts.push(conflict);
            mapping.conflictCount++;
            recordSyncEvent(mappingId, mapping.twinId, mapping.deviceId, "conflict-detected", "warning", {
              field, deviceValue, twinValue,
            });
            continue; // Don't update this field
        }

        if (conflict.status === "resolved") {
          conflicts.push(conflict);
          recordSyncEvent(mappingId, mapping.twinId, mapping.deviceId, "conflict-resolved", "info", {
            field, resolution: conflict.resolution,
          });
        }
      } else {
        twinState[field] = deviceValue;
      }
    } else {
      twinState[field] = deviceValue;
    }
  }

  // Update state snapshot
  const updatedSnapshot: SyncStateSnapshot = {
    mappingId,
    twinId: mapping.twinId,
    entityId: mapping.entityId,
    deviceId: mapping.deviceId,
    deviceState: { ...deviceState },
    twinState: { ...currentTwinState, ...twinState },
    delta: {},
    version: (snapshot?.version ?? 0) + 1,
    capturedAt: now,
  };
  stateSnapshots.set(mappingId, updatedSnapshot);

  // Update mapping status
  const latency = Date.now() - startTime;
  mapping.lastSyncAt = now;
  mapping.lastSuccessfulSyncAt = now;
  mapping.status = newConflicts.length > 0 ? "conflict" : "synced";
  mapping.syncCount++;
  mapping.latencyMs = latency;
  mapping.version++;
  mapping.updatedAt = now;
  mappings.set(mappingId, mapping);

  recordSyncEvent(mappingId, mapping.twinId, mapping.deviceId, "state-updated", "info", {
    direction: "device-to-twin",
    fieldsUpdated: Object.keys(twinState).length,
    conflicts: newConflicts.length,
    latencyMs: latency,
  });

  return {
    success: true,
    updated: Object.keys(twinState).length > 0,
    conflicts: newConflicts,
    twinState: updatedSnapshot.twinState,
  };
}

/**
 * Synchronize twin state to device (twin → device)
 */
export async function syncTwinToDevice(
  mappingId: string,
  twinState: Record<string, unknown>
): Promise<{
  success: boolean;
  queued: boolean;
  queueItemId?: string;
}> {
  const mapping = mappings.get(mappingId);
  if (!mapping) throw new Error(`Mapping ${mappingId} not found`);

  if (mapping.direction !== "twin-to-device" && mapping.direction !== "bidirectional") {
    throw new Error(`Mapping ${mappingId} does not support twin-to-device sync`);
  }

  const now = new Date().toISOString();

  // Apply transform rules (reverse direction)
  const transformedState = applyTransformRules(twinState, mapping.syncConfig.transformRules, "twin-to-device");

  // Filter fields if specified
  const fieldsToProcess = mapping.syncConfig.fieldsToSync.length > 0
    ? Object.fromEntries(Object.entries(transformedState).filter(([k]) => mapping.syncConfig.fieldsToSync.includes(k)))
    : transformedState;

  // Queue the sync operation
  const queueItem: SyncQueueItem = {
    id: `qi_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    mappingId,
    direction: "twin-to-device",
    payload: fieldsToProcess,
    timestamp: now,
    priority: "normal",
    retryCount: 0,
    maxRetries: mapping.syncConfig.retryAttempts,
    status: mapping.status === "offline" ? "deferred" : "queued",
    createdAt: now,
  };

  syncQueue.push(queueItem);

  // If device is online, process immediately (simulated)
  if (mapping.status !== "offline") {
    return processQueueItem(queueItem.id, mapping);
  }

  return { success: true, queued: true, queueItemId: queueItem.id };
}

/**
 * Get the current state snapshot for a mapping
 */
export async function getStateSnapshot(mappingId: string): Promise<SyncStateSnapshot | null> {
  return stateSnapshots.get(mappingId) ?? null;
}

/**
 * Get pending sync conflicts
 */
export async function getPendingConflicts(
  filters?: { mappingId?: string; twinId?: string; deviceId?: string }
): Promise<SyncConflict[]> {
  let result = conflicts.filter(c => c.status === "pending");
  if (filters?.mappingId) result = result.filter(c => c.mappingId === filters.mappingId);
  if (filters?.twinId) result = result.filter(c => c.twinId === filters.twinId);
  if (filters?.deviceId) result = result.filter(c => c.deviceId === filters.deviceId);
  return result.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

/**
 * Resolve a sync conflict manually
 */
export async function resolveConflict(
  conflictId: string,
  resolution: ConflictResolution,
  resolvedValue: unknown,
  resolvedBy: string
): Promise<SyncConflict | null> {
  const index = conflicts.findIndex(c => c.id === conflictId);
  if (index === -1) return null;

  const now = new Date().toISOString();
  const conflict = { ...conflicts[index] };
  conflict.resolution = resolution;
  conflict.resolvedValue = resolvedValue;
  conflict.status = "resolved";
  conflict.resolvedAt = now;
  conflict.resolvedBy = resolvedBy;
  conflicts[index] = conflict;

  // Update twin state with resolved value
  const mapping = mappings.get(conflict.mappingId);
  if (mapping) {
    const snapshot = stateSnapshots.get(conflict.mappingId);
    if (snapshot) {
      snapshot.twinState[conflict.field] = resolvedValue;
      snapshot.version++;
      snapshot.capturedAt = now;
      stateSnapshots.set(conflict.mappingId, snapshot);
    }

    recordSyncEvent(conflict.mappingId, conflict.twinId, conflict.deviceId, "conflict-resolved", "info", {
      conflictId, field: conflict.field, resolution, resolvedBy,
    });
  }

  return conflict;
}

/**
 * Get sync health report for a mapping
 */
export async function getSyncHealthReport(mappingId: string): Promise<SyncHealthReport | null> {
  const mapping = mappings.get(mappingId);
  if (!mapping) return null;

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 86400000).toISOString();

  // Count recent events
  const recentEvents = syncEvents.filter(
    e => e.mappingId === mappingId && e.timestamp >= oneDayAgo
  );
  const syncCount24h = recentEvents.filter(e => e.type === "state-updated").length;
  const conflictCount24h = recentEvents.filter(e => e.type === "conflict-detected").length;
  const errorCount24h = recentEvents.filter(e => e.type === "sync-failed").length;

  // Queue depth
  const queueDepth = syncQueue.filter(
    q => q.mappingId === mappingId && (q.status === "queued" || q.status === "deferred")
  ).length;

  // Pending conflicts
  const pendingConflicts = conflicts.filter(
    c => c.mappingId === mappingId && c.status === "pending"
  ).length;

  // Time since last sync
  const timeSinceLastSyncMs = mapping.lastSyncAt
    ? now.getTime() - new Date(mapping.lastSyncAt).getTime()
    : undefined;

  // Health score (0-100)
  let healthScore = 100;
  if (mapping.status === "offline") healthScore -= 40;
  if (mapping.status === "error") healthScore -= 30;
  if (mapping.status === "conflict") healthScore -= 15;
  if (pendingConflicts > 0) healthScore -= Math.min(20, pendingConflicts * 5);
  if (errorCount24h > 0) healthScore -= Math.min(20, errorCount24h * 2);
  if (timeSinceLastSyncMs && timeSinceLastSyncMs > mapping.syncConfig.intervalMs * 10) healthScore -= 15;
  if (queueDepth > 100) healthScore -= 10;
  if (mapping.latencyMs > 1000) healthScore -= 10;
  healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

  // Recommendations
  const recommendations: string[] = [];
  if (mapping.status === "offline") recommendations.push("Device is offline. Check device connectivity.");
  if (pendingConflicts > 0) recommendations.push(`${pendingConflicts} pending conflicts require manual resolution.`);
  if (errorCount24h > 5) recommendations.push("High error rate detected. Review sync configuration and device compatibility.");
  if (queueDepth > 50) recommendations.push("Sync queue is building up. Consider increasing sync frequency or reducing payload size.");
  if (timeSinceLastSyncMs && timeSinceLastSyncMs > mapping.syncConfig.intervalMs * 10) {
    recommendations.push("Sync is stale. Last sync was significantly overdue.");
  }
  if (mapping.latencyMs > 500) recommendations.push("High sync latency. Consider optimizing payload size or network connectivity.");

  let overallStatus: SyncStatus = mapping.status;
  if (healthScore < 30) overallStatus = "error";
  else if (healthScore < 60) overallStatus = "stale";

  return {
    mappingId,
    twinId: mapping.twinId,
    deviceId: mapping.deviceId,
    overallStatus,
    syncCount24h,
    conflictCount24h,
    errorCount24h,
    averageLatencyMs: mapping.latencyMs,
    lastSyncAt: mapping.lastSyncAt,
    timeSinceLastSyncMs,
    queueDepth,
    pendingConflicts,
    healthScore,
    recommendations,
    checkedAt: now.toISOString(),
  };
}

/**
 * Mark device as connected/disconnected for a mapping
 */
export async function setDeviceConnectivity(
  mappingId: string,
  connected: boolean
): Promise<TwinDeviceMapping | null> {
  const mapping = mappings.get(mappingId);
  if (!mapping) return null;

  const now = new Date().toISOString();
  mapping.status = connected ? "synced" : "offline";
  mapping.updatedAt = now;
  mappings.set(mappingId, mapping);

  recordSyncEvent(
    mappingId,
    mapping.twinId,
    mapping.deviceId,
    connected ? "device-connected" : "device-disconnected",
    connected ? "info" : "warning",
    {}
  );

  // If device came back online, flush the queue
  if (connected) {
    await flushSyncQueue(mappingId);
  }

  return mapping;
}

/**
 * Flush the sync queue for a mapping (process all pending items)
 */
export async function flushSyncQueue(mappingId: string): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const mapping = mappings.get(mappingId);
  if (!mapping) throw new Error(`Mapping ${mappingId} not found`);

  const pendingItems = syncQueue.filter(
    q => q.mappingId === mappingId && (q.status === "queued" || q.status === "deferred")
  );

  let succeeded = 0;
  let failed = 0;

  for (const item of pendingItems) {
    const result = await processQueueItem(item.id, mapping);
    if (result.success) succeeded++;
    else failed++;
  }

  recordSyncEvent(mappingId, mapping.twinId, mapping.deviceId, "queue-flushed", "info", {
    processed: pendingItems.length,
    succeeded,
    failed,
  });

  return { processed: pendingItems.length, succeeded, failed };
}

/**
 * Get sync events for a mapping
 */
export async function getSyncEvents(
  mappingId: string,
  filters?: { type?: SyncEventType; severity?: SyncEvent["severity"]; limit?: number }
): Promise<SyncEvent[]> {
  let result = syncEvents.filter(e => e.mappingId === mappingId);
  if (filters?.type) result = result.filter(e => e.type === filters.type);
  if (filters?.severity) result = result.filter(e => e.severity === filters.severity);
  return result
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, filters?.limit ?? 100);
}

/**
 * Get synchronization statistics for an organization
 */
export async function getSyncStats(organizationId: string): Promise<{
  totalMappings: number;
  mappingsByStatus: Record<string, number>;
  mappingsByDirection: Record<string, number>;
  totalSyncs: number;
  totalConflicts: number;
  totalErrors: number;
  pendingConflicts: number;
  queueDepth: number;
  averageLatencyMs: number;
  averageHealthScore: number;
  mappingsRequiringAttention: string[];
}> {
  const allMappings = Array.from(mappings.values()).filter(
    m => m.organizationId === organizationId
  );

  const mappingsByStatus: Record<string, number> = {};
  const mappingsByDirection: Record<string, number> = {};
  let totalSyncs = 0;
  let totalConflicts = 0;
  let totalErrors = 0;
  let totalLatency = 0;
  let totalHealthScore = 0;
  let healthCount = 0;
  const mappingsRequiringAttention: string[] = [];

  for (const mapping of allMappings) {
    mappingsByStatus[mapping.status] = (mappingsByStatus[mapping.status] || 0) + 1;
    mappingsByDirection[mapping.direction] = (mappingsByDirection[mapping.direction] || 0) + 1;
    totalSyncs += mapping.syncCount;
    totalConflicts += mapping.conflictCount;
    totalErrors += mapping.errorCount;
    totalLatency += mapping.latencyMs;

    // Check if mapping needs attention
    const pendingConflictsForMapping = conflicts.filter(
      c => c.mappingId === mapping.id && c.status === "pending"
    ).length;
    if (pendingConflictsForMapping > 0 || mapping.status === "error" || mapping.status === "offline") {
      mappingsRequiringAttention.push(`${mapping.deviceName} (${mapping.id})`);
    }
  }

  const pendingConflicts = conflicts.filter(c => {
    const mapping = mappings.get(c.mappingId);
    return mapping?.organizationId === organizationId && c.status === "pending";
  }).length;

  const queueDepth = syncQueue.filter(q => {
    const mapping = mappings.get(q.mappingId);
    return mapping?.organizationId === organizationId && (q.status === "queued" || q.status === "deferred");
  }).length;

  return {
    totalMappings: allMappings.length,
    mappingsByStatus,
    mappingsByDirection,
    totalSyncs,
    totalConflicts,
    totalErrors,
    pendingConflicts,
    queueDepth,
    averageLatencyMs: allMappings.length > 0 ? Math.round(totalLatency / allMappings.length) : 0,
    averageHealthScore: healthCount > 0 ? Math.round(totalHealthScore / healthCount) : 0,
    mappingsRequiringAttention,
  };
}

/**
 * Batch sync multiple device states to their twins
 */
export async function batchSyncDeviceToTwin(
  updates: Array<{
    mappingId: string;
    deviceState: Record<string, unknown>;
    deviceTimestamp?: string;
  }>
): Promise<{
  totalProcessed: number;
  totalUpdated: number;
  totalConflicts: number;
  results: Array<{ mappingId: string; success: boolean; updated: boolean; conflictCount: number }>;
}> {
  const results = await Promise.all(
    updates.map(async (u) => {
      try {
        const result = await syncDeviceToTwin(u.mappingId, u.deviceState, u.deviceTimestamp);
        return {
          mappingId: u.mappingId,
          success: result.success,
          updated: result.updated,
          conflictCount: result.conflicts.length,
        };
      } catch {
        return {
          mappingId: u.mappingId,
          success: false,
          updated: false,
          conflictCount: 0,
        };
      }
    })
  );

  return {
    totalProcessed: updates.length,
    totalUpdated: results.filter(r => r.updated).length,
    totalConflicts: results.reduce((sum, r) => sum + r.conflictCount, 0),
    results,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

async function processQueueItem(
  itemId: string,
  mapping: TwinDeviceMapping
): Promise<{ success: boolean; queued: boolean; queueItemId: string }> {
  const index = syncQueue.findIndex(q => q.id === itemId);
  if (index === -1) return { success: false, queued: false, queueItemId: itemId };

  const item = syncQueue[index];
  item.status = "processing";
  syncQueue[index] = item;

  try {
    // Simulate sending to device (in production, use MQTT/CoAP/HTTP)
    const now = new Date().toISOString();
    
    // Update state snapshot
    const snapshot = stateSnapshots.get(mapping.id);
    if (snapshot) {
      snapshot.deviceState = { ...snapshot.deviceState, ...item.payload };
      snapshot.version++;
      snapshot.capturedAt = now;
      stateSnapshots.set(mapping.id, snapshot);
    }

    item.status = "completed";
    syncQueue[index] = item;

    mapping.lastSyncAt = now;
    mapping.lastSuccessfulSyncAt = now;
    mapping.syncCount++;
    mapping.updatedAt = now;
    mappings.set(mapping.id, mapping);

    recordSyncEvent(mapping.id, mapping.twinId, mapping.deviceId, "state-updated", "info", {
      direction: "twin-to-device",
      fieldsUpdated: Object.keys(item.payload).length,
    });

    return { success: true, queued: false, queueItemId: itemId };
  } catch (err) {
    item.retryCount++;
    if (item.retryCount >= item.maxRetries) {
      item.status = "failed";
      item.errorMessage = err instanceof Error ? err.message : String(err);
      mapping.errorCount++;
      
      recordSyncEvent(mapping.id, mapping.twinId, mapping.deviceId, "sync-failed", "error", {
        direction: "twin-to-device",
        error: item.errorMessage,
        retryCount: item.retryCount,
      });
    } else {
      item.status = "queued"; // Re-queue for retry
    }
    syncQueue[index] = item;
    mapping.updatedAt = new Date().toISOString();
    mappings.set(mapping.id, mapping);

    return { success: false, queued: item.status === "queued", queueItemId: itemId };
  }
}

function applyTransformRules(
  state: Record<string, unknown>,
  rules: TwinDeviceMapping["syncConfig"]["transformRules"],
  _direction: SyncDirection
): Record<string, unknown> {
  if (rules.length === 0) return state;

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(state)) {
    const rule = rules.find(r => r.sourceField === key);
    if (rule) {
      let transformedValue = value;
      
      // Apply simple transformations
      if (rule.transformation) {
        switch (rule.transformation) {
          case "fahrenheit-to-celsius":
            if (typeof value === "number") transformedValue = (value - 32) * 5 / 9;
            break;
          case "celsius-to-fahrenheit":
            if (typeof value === "number") transformedValue = value * 9 / 5 + 32;
            break;
          case "miles-to-km":
            if (typeof value === "number") transformedValue = value * 1.60934;
            break;
          case "km-to-miles":
            if (typeof value === "number") transformedValue = value / 1.60934;
            break;
          case "to-string":
            transformedValue = String(value);
            break;
          case "to-number":
            transformedValue = Number(value);
            break;
        }
      }

      result[rule.targetField] = transformedValue;
    } else {
      result[key] = value;
    }
  }

  return result;
}

function recordSyncEvent(
  mappingId: string,
  twinId: string,
  deviceId: string,
  type: SyncEventType,
  severity: SyncEvent["severity"],
  data: Record<string, unknown>
): void {
  syncEvents.push({
    id: `sevt_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    mappingId,
    twinId,
    deviceId,
    type,
    severity,
    data,
    timestamp: new Date().toISOString(),
  });
}
