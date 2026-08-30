/**
 * Edge Node Management Service (Module 27 — Gap 1)
 *
 * Register, monitor, and manage edge nodes and devices:
 * - Edge node registration and discovery
 * - Edge node health monitoring
 * - Edge node status tracking
 * - Edge node metadata management
 * - Edge node grouping and organization
 * - Edge node capabilities tracking
 *
 * Enables comprehensive edge infrastructure management.
 */
import { logger } from "../../config/logger.js";
import { Metrics } from "../../observability/metrics.js";
import { redisCmd } from "../../db/redis.js";
import { prisma } from "../../db/client.js";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:edgeNodeManagement');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ──────────────────────────────────────────────────────

export type EdgeNodeStatus = "online" | "offline" | "degraded" | "maintenance";

export type EdgeNodeType = "gateway" | "sensor" | "compute" | "storage" | "hybrid";

export interface EdgeNode {
  id: string;
  organizationId: string;
  name: string;
  type: EdgeNodeType;
  status: EdgeNodeStatus;
  location?: string;
  ipAddress?: string;
  hostname?: string;
  capabilities: EdgeNodeCapabilities;
  resources: EdgeNodeResources;
  metadata: Record<string, any>;
  tags: string[];
  registeredAt: string;
  lastHeartbeatAt?: string;
  lastStatusChangeAt?: string;
  config: Record<string, any>;
}

export interface EdgeNodeCapabilities {
  compute: boolean;
  storage: boolean;
  gpu: boolean;
  ml_inference: boolean;
  data_processing: boolean;
  customCapabilities: string[];
}

export interface EdgeNodeResources {
  cpuCores?: number;
  memoryMb?: number;
  storageGb?: number;
  gpuMemoryMb?: number;
  networkBandwidthMbps?: number;
  availableCpuPercent?: number;
  availableMemoryPercent?: number;
  availableStoragePercent?: number;
}

export interface EdgeNodeGroup {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  nodeIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EdgeNodeStats {
  totalNodes: number;
  byStatus: Record<EdgeNodeStatus, number>;
  byType: Record<EdgeNodeType, number>;
  byLocation: Record<string, number>;
  totalResources: {
    cpuCores: number;
    memoryMb: number;
    storageGb: number;
    gpuMemoryMb: number;
  };
  averageAvailability: number;
}

export interface EdgeNodeHealthCheck {
  nodeId: string;
  timestamp: string;
  status: EdgeNodeStatus;
  cpuUsagePercent?: number;
  memoryUsagePercent?: number;
  storageUsagePercent?: number;
  networkLatencyMs?: number;
  customMetrics: Record<string, number>;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const EDGE_NODE_KEY = (nodeId: string) => `edge:node:${nodeId}`;
const EDGE_NODES_KEY = (orgId: string) => `edge:nodes:${orgId}`;
const EDGE_NODE_GROUP_KEY = (groupId: string) => `edge:group:${groupId}`;
const EDGE_NODE_GROUPS_KEY = (orgId: string) => `edge:groups:${orgId}`;
const EDGE_NODE_HEALTH_KEY = (nodeId: string) => `edge:health:${nodeId}`;
const EDGE_NODE_STATS_KEY = (orgId: string) => `edge:stats:${orgId}`;

// ─── Edge Node Management ───────────────────────────────────────

/**
 * Register edge node
 */
export async function registerEdgeNode(input: {
  organizationId: string;
  name: string;
  type: EdgeNodeType;
  location?: string;
  ipAddress?: string;
  hostname?: string;
  capabilities?: Partial<EdgeNodeCapabilities>;
  resources?: Partial<EdgeNodeResources>;
  metadata?: Record<string, any>;
  tags?: string[];
  config?: Record<string, any>;
}): Promise<EdgeNode> {
  const nodeId = `edge_${Date.now()}_${_rng.next().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const node: EdgeNode = {
    id: nodeId,
    organizationId: input.organizationId,
    name: input.name,
    type: input.type,
    status: "offline",
    location: input.location,
    ipAddress: input.ipAddress,
    hostname: input.hostname,
    capabilities: {
      compute: input.capabilities?.compute || false,
      storage: input.capabilities?.storage || false,
      gpu: input.capabilities?.gpu || false,
      ml_inference: input.capabilities?.ml_inference || false,
      data_processing: input.capabilities?.data_processing || false,
      customCapabilities: input.capabilities?.customCapabilities || [],
    },
    resources: {
      cpuCores: input.resources?.cpuCores,
      memoryMb: input.resources?.memoryMb,
      storageGb: input.resources?.storageGb,
      gpuMemoryMb: input.resources?.gpuMemoryMb,
      networkBandwidthMbps: input.resources?.networkBandwidthMbps,
      availableCpuPercent: 100,
      availableMemoryPercent: 100,
      availableStoragePercent: 100,
    },
    metadata: input.metadata || {},
    tags: input.tags || [],
    registeredAt: now,
    config: input.config || {},
  };

  await redisCmd.set(EDGE_NODE_KEY(nodeId), JSON.stringify(node));
  await redisCmd.sadd(EDGE_NODES_KEY(input.organizationId), nodeId);

  logger.info("Edge node registered", {
    nodeId,
    organizationId: input.organizationId,
    name: input.name,
    type: input.type,
  });

  Metrics.increment("edge.node.registered", 1, {
    type: input.type,
  });

  return node;
}

/**
 * Get edge node by ID
 */
export async function getEdgeNode(nodeId: string): Promise<EdgeNode | null> {
  const data = await redisCmd.get(EDGE_NODE_KEY(nodeId));
  return data ? JSON.parse(data) : null;
}

/**
 * Get all edge nodes for organization
 */
export async function getEdgeNodes(
  organizationId: string,
  filters?: {
    status?: EdgeNodeStatus;
    type?: EdgeNodeType;
    location?: string;
    tags?: string[];
  }
): Promise<EdgeNode[]> {
  const nodeIds = await redisCmd.smembers(EDGE_NODES_KEY(organizationId));
  const nodes: EdgeNode[] = [];

  for (const nodeId of nodeIds) {
    const node = await getEdgeNode(nodeId);
    if (!node) continue;

    // Apply filters
    if (filters?.status && node.status !== filters.status) continue;
    if (filters?.type && node.type !== filters.type) continue;
    if (filters?.location && node.location !== filters.location) continue;
    if (filters?.tags && !filters.tags.every(tag => node.tags.includes(tag))) continue;

    nodes.push(node);
  }

  return nodes;
}

/**
 * Update edge node
 */
export async function updateEdgeNode(
  nodeId: string,
  updates: Partial<EdgeNode>
): Promise<EdgeNode | null> {
  const node = await getEdgeNode(nodeId);
  if (!node) return null;

  const updatedNode: EdgeNode = {
    ...node,
    ...updates,
    id: node.id, // Prevent ID change
    organizationId: node.organizationId, // Prevent org change
  };

  await redisCmd.set(EDGE_NODE_KEY(nodeId), JSON.stringify(updatedNode));

  logger.info("Edge node updated", {
    nodeId,
    updates: Object.keys(updates),
  });

  return updatedNode;
}

/**
 * Update edge node status
 */
export async function updateEdgeNodeStatus(
  nodeId: string,
  status: EdgeNodeStatus
): Promise<EdgeNode | null> {
  const node = await getEdgeNode(nodeId);
  if (!node) return null;

  const previousStatus = node.status;
  node.status = status;
  node.lastStatusChangeAt = new Date().toISOString();

  await redisCmd.set(EDGE_NODE_KEY(nodeId), JSON.stringify(node));

  if (previousStatus !== status) {
    logger.info("Edge node status changed", {
      nodeId,
      previousStatus,
      newStatus: status,
    });

    Metrics.increment("edge.node.status_change", 1, {
      from: previousStatus,
      to: status,
    });
  }

  return node;
}

/**
 * Record edge node heartbeat
 */
export async function recordEdgeNodeHeartbeat(
  nodeId: string,
  healthCheck?: Partial<EdgeNodeHealthCheck>
): Promise<EdgeNode | null> {
  const node = await getEdgeNode(nodeId);
  if (!node) return null;

  const now = new Date().toISOString();
  node.lastHeartbeatAt = now;

  // Update status to online if it was offline
  if (node.status === "offline") {
    node.status = "online";
    node.lastStatusChangeAt = now;
  }

  // Update resource availability if provided
  if (healthCheck) {
    if (healthCheck.cpuUsagePercent !== undefined) {
      node.resources.availableCpuPercent = 100 - healthCheck.cpuUsagePercent;
    }
    if (healthCheck.memoryUsagePercent !== undefined) {
      node.resources.availableMemoryPercent = 100 - healthCheck.memoryUsagePercent;
    }
    if (healthCheck.storageUsagePercent !== undefined) {
      node.resources.availableStoragePercent = 100 - healthCheck.storageUsagePercent;
    }

    // Determine status based on resource usage
    const avgUsage = (
      (healthCheck.cpuUsagePercent || 0) +
      (healthCheck.memoryUsagePercent || 0) +
      (healthCheck.storageUsagePercent || 0)
    ) / 3;

    if (avgUsage > 90) {
      node.status = "degraded";
    } else if (node.status === "degraded" && avgUsage < 80) {
      node.status = "online";
    }
  }

  await redisCmd.set(EDGE_NODE_KEY(nodeId), JSON.stringify(node));

  // Record health check
  if (healthCheck) {
    const fullHealthCheck: EdgeNodeHealthCheck = {
      nodeId,
      timestamp: now,
      status: node.status,
      ...healthCheck,
    };

    await redisCmd.lpush(EDGE_NODE_HEALTH_KEY(nodeId), JSON.stringify(fullHealthCheck));
    await redisCmd.ltrim(EDGE_NODE_HEALTH_KEY(nodeId), 0, 999); // Keep last 1000 health checks

    Metrics.gauge("edge.node.cpu_usage", healthCheck.cpuUsagePercent || 0, { nodeId });
    Metrics.gauge("edge.node.memory_usage", healthCheck.memoryUsagePercent || 0, { nodeId });
    Metrics.gauge("edge.node.storage_usage", healthCheck.storageUsagePercent || 0, { nodeId });
  }

  Metrics.increment("edge.node.heartbeat", 1);

  return node;
}

/**
 * Get edge node health history
 */
export async function getEdgeNodeHealthHistory(
  nodeId: string,
  limit: number = 100
): Promise<EdgeNodeHealthCheck[]> {
  const data = await redisCmd.lrange(EDGE_NODE_HEALTH_KEY(nodeId), 0, limit - 1);
  return data.map(d => JSON.parse(d));
}

/**
 * Deregister edge node
 */
export async function deregisterEdgeNode(nodeId: string): Promise<void> {
  const node = await getEdgeNode(nodeId);
  if (!node) return;

  await redisCmd.del(EDGE_NODE_KEY(nodeId));
  await redisCmd.srem(EDGE_NODES_KEY(node.organizationId), nodeId);
  await redisCmd.del(EDGE_NODE_HEALTH_KEY(nodeId));

  logger.info("Edge node deregistered", { nodeId });

  Metrics.increment("edge.node.deregistered", 1);
}

// ─── Edge Node Groups ───────────────────────────────────────────

/**
 * Create edge node group
 */
export async function createEdgeNodeGroup(input: {
  organizationId: string;
  name: string;
  description?: string;
  nodeIds?: string[];
  tags?: string[];
}): Promise<EdgeNodeGroup> {
  const groupId = `edge_group_${Date.now()}_${_rng.next().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const group: EdgeNodeGroup = {
    id: groupId,
    organizationId: input.organizationId,
    name: input.name,
    description: input.description,
    nodeIds: input.nodeIds || [],
    tags: input.tags || [],
    createdAt: now,
    updatedAt: now,
  };

  await redisCmd.set(EDGE_NODE_GROUP_KEY(groupId), JSON.stringify(group));
  await redisCmd.sadd(EDGE_NODE_GROUPS_KEY(input.organizationId), groupId);

  logger.info("Edge node group created", {
    groupId,
    organizationId: input.organizationId,
    name: input.name,
    nodeCount: group.nodeIds.length,
  });

  return group;
}

/**
 * Get edge node group by ID
 */
export async function getEdgeNodeGroup(groupId: string): Promise<EdgeNodeGroup | null> {
  const data = await redisCmd.get(EDGE_NODE_GROUP_KEY(groupId));
  return data ? JSON.parse(data) : null;
}

/**
 * Get all edge node groups for organization
 */
export async function getEdgeNodeGroups(organizationId: string): Promise<EdgeNodeGroup[]> {
  const groupIds = await redisCmd.smembers(EDGE_NODE_GROUPS_KEY(organizationId));
  const groups: EdgeNodeGroup[] = [];

  for (const groupId of groupIds) {
    const group = await getEdgeNodeGroup(groupId);
    if (group) {
      groups.push(group);
    }
  }

  return groups;
}

/**
 * Add node to group
 */
export async function addNodeToGroup(groupId: string, nodeId: string): Promise<EdgeNodeGroup | null> {
  const group = await getEdgeNodeGroup(groupId);
  if (!group) return null;

  if (!group.nodeIds.includes(nodeId)) {
    group.nodeIds.push(nodeId);
    group.updatedAt = new Date().toISOString();
    await redisCmd.set(EDGE_NODE_GROUP_KEY(groupId), JSON.stringify(group));
  }

  return group;
}

/**
 * Remove node from group
 */
export async function removeNodeFromGroup(groupId: string, nodeId: string): Promise<EdgeNodeGroup | null> {
  const group = await getEdgeNodeGroup(groupId);
  if (!group) return null;

  group.nodeIds = group.nodeIds.filter(id => id !== nodeId);
  group.updatedAt = new Date().toISOString();
  await redisCmd.set(EDGE_NODE_GROUP_KEY(groupId), JSON.stringify(group));

  return group;
}

/**
 * Delete edge node group
 */
export async function deleteEdgeNodeGroup(groupId: string): Promise<void> {
  const group = await getEdgeNodeGroup(groupId);
  if (!group) return;

  await redisCmd.del(EDGE_NODE_GROUP_KEY(groupId));
  await redisCmd.srem(EDGE_NODE_GROUPS_KEY(group.organizationId), groupId);

  logger.info("Edge node group deleted", { groupId });
}

// ─── Edge Node Statistics ───────────────────────────────────────

/**
 * Get edge node statistics
 */
export async function getEdgeNodeStats(organizationId: string): Promise<EdgeNodeStats> {
  const nodes = await getEdgeNodes(organizationId);

  const byStatus: Record<string, number> = {
    online: 0,
    offline: 0,
    degraded: 0,
    maintenance: 0,
  };

  const byType: Record<string, number> = {
    gateway: 0,
    sensor: 0,
    compute: 0,
    storage: 0,
    hybrid: 0,
  };

  const byLocation: Record<string, number> = {};

  const totalResources = {
    cpuCores: 0,
    memoryMb: 0,
    storageGb: 0,
    gpuMemoryMb: 0,
  };

  let onlineCount = 0;

  for (const node of nodes) {
    byStatus[node.status] = (byStatus[node.status] || 0) + 1;
    byType[node.type] = (byType[node.type] || 0) + 1;

    if (node.location) {
      byLocation[node.location] = (byLocation[node.location] || 0) + 1;
    }

    if (node.resources.cpuCores) totalResources.cpuCores += node.resources.cpuCores;
    if (node.resources.memoryMb) totalResources.memoryMb += node.resources.memoryMb;
    if (node.resources.storageGb) totalResources.storageGb += node.resources.storageGb;
    if (node.resources.gpuMemoryMb) totalResources.gpuMemoryMb += node.resources.gpuMemoryMb;

    if (node.status === "online") onlineCount++;
  }

  const averageAvailability = nodes.length > 0 ? (onlineCount / nodes.length) * 100 : 0;

  return {
    totalNodes: nodes.length,
    byStatus: byStatus as Record<EdgeNodeStatus, number>,
    byType: byType as Record<EdgeNodeType, number>,
    byLocation,
    totalResources,
    averageAvailability,
  };
}

/**
 * Get nodes by capability
 */
export async function getNodesByCapability(
  organizationId: string,
  capability: keyof EdgeNodeCapabilities
): Promise<EdgeNode[]> {
  const nodes = await getEdgeNodes(organizationId);
  return nodes.filter(node => {
    if (capability === "customCapabilities") {
      return node.capabilities.customCapabilities.length > 0;
    }
    return node.capabilities[capability] === true;
  });
}

/**
 * Get nodes with available resources
 */
export async function getNodesWithAvailableResources(
  organizationId: string,
  requirements: {
    minCpuPercent?: number;
    minMemoryPercent?: number;
    minStoragePercent?: number;
    minGpuMemoryMb?: number;
  }
): Promise<EdgeNode[]> {
  const nodes = await getEdgeNodes(organizationId, { status: "online" });

  return nodes.filter(node => {
    if (requirements.minCpuPercent && (node.resources.availableCpuPercent || 0) < requirements.minCpuPercent) {
      return false;
    }
    if (requirements.minMemoryPercent && (node.resources.availableMemoryPercent || 0) < requirements.minMemoryPercent) {
      return false;
    }
    if (requirements.minStoragePercent && (node.resources.availableStoragePercent || 0) < requirements.minStoragePercent) {
      return false;
    }
    if (requirements.minGpuMemoryMb && (node.resources.gpuMemoryMb || 0) < requirements.minGpuMemoryMb) {
      return false;
    }
    return true;
  });
}
