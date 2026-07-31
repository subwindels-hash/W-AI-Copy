/**
 * Load Balancing Service (Module 24 — Gap 1)
 *
 * Load balancing across service instances:
 * - Round-robin algorithm
 * - Weighted round-robin
 * - Least connections algorithm
 * - Random selection
 * - Health-aware routing (skip unhealthy instances)
 * - Sticky sessions (session affinity)
 * - Instance weight management
 *
 * Provides intelligent load distribution across service instances.
 */
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";
import { redisCmd } from "../db/redis.js";
import { DiscoveryService } from "../enterprise/discovery/discovery.service.js";

// ─── Types ──────────────────────────────────────────────────────

export type LoadBalancingAlgorithm = "round_robin" | "weighted_round_robin" | "least_connections" | "random";

export interface ServiceInstance {
  serviceId: string;
  instanceId: string;
  baseUrl: string;
  weight: number;
  activeConnections: number;
  lastSelectedAt?: string;
  metadata?: Record<string, any>;
}

export interface LoadBalancerConfig {
  algorithm: LoadBalancingAlgorithm;
  healthCheckEnabled: boolean;
  stickySessionsEnabled: boolean;
  stickySessionCookie?: string;
  stickySessionTTLSeconds?: number;
}

export interface LoadBalancerStats {
  totalRequests: number;
  byAlgorithm: Record<LoadBalancingAlgorithm, number>;
  byInstance: Record<string, number>;
  avgResponseTimeMs: number;
  totalErrors: number;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const LB_INSTANCE_KEY = (serviceId: string, instanceId: string) => `lb:instance:${serviceId}:${instanceId}`;
const LB_COUNTER_KEY = (serviceId: string) => `lb:counter:${serviceId}`;
const LB_STICKY_KEY = (sessionId: string) => `lb:sticky:${sessionId}`;
const LB_STATS_KEY = "lb:stats";

// ─── Default Configuration ──────────────────────────────────────

const DEFAULT_CONFIG: LoadBalancerConfig = {
  algorithm: "round_robin",
  healthCheckEnabled: true,
  stickySessionsEnabled: false,
  stickySessionCookie: "WINDELS_LB_SESSION",
  stickySessionTTLSeconds: 3600,
};

// ─── Instance Management ────────────────────────────────────────

/**
 * Register service instance with load balancer
 */
export async function registerInstance(
  serviceId: string,
  instanceId: string,
  baseUrl: string,
  weight: number = 1,
  metadata?: Record<string, any>,
): Promise<ServiceInstance> {
  const instance: ServiceInstance = {
    serviceId,
    instanceId,
    baseUrl,
    weight,
    activeConnections: 0,
    metadata,
  };

  const key = LB_INSTANCE_KEY(serviceId, instanceId);
  await redisCmd.set(key, JSON.stringify(instance));

  logger.info("Load balancer instance registered", { serviceId, instanceId, baseUrl, weight });

  Metrics.increment("lb.instances.registered", 1, { serviceId });

  return instance;
}

/**
 * Deregister service instance
 */
export async function deregisterInstance(serviceId: string, instanceId: string): Promise<void> {
  const key = LB_INSTANCE_KEY(serviceId, instanceId);
  await redisCmd.del(key);

  logger.info("Load balancer instance deregistered", { serviceId, instanceId });

  Metrics.increment("lb.instances.deregistered", 1, { serviceId });
}

/**
 * Get all instances for a service
 */
export async function getInstances(serviceId: string): Promise<ServiceInstance[]> {
  const keys = await redisCmd.keys(`lb:instance:${serviceId}:*`);
  const instances: ServiceInstance[] = [];

  for (const key of keys) {
    const data = await redisCmd.get(key);
    if (data) {
      instances.push(JSON.parse(data));
    }
  }

  return instances;
}

/**
 * Update instance weight
 */
export async function updateInstanceWeight(
  serviceId: string,
  instanceId: string,
  weight: number,
): Promise<void> {
  const key = LB_INSTANCE_KEY(serviceId, instanceId);
  const data = await redisCmd.get(key);

  if (!data) {
    throw new Error(`Instance not found: ${serviceId}:${instanceId}`);
  }

  const instance: ServiceInstance = JSON.parse(data);
  instance.weight = weight;

  await redisCmd.set(key, JSON.stringify(instance));

  logger.info("Instance weight updated", { serviceId, instanceId, weight });
}

/**
 * Update active connections count
 */
export async function updateActiveConnections(
  serviceId: string,
  instanceId: string,
  delta: number,
): Promise<void> {
  const key = LB_INSTANCE_KEY(serviceId, instanceId);
  const data = await redisCmd.get(key);

  if (!data) {
    return;
  }

  const instance: ServiceInstance = JSON.parse(data);
  instance.activeConnections = Math.max(0, instance.activeConnections + delta);

  await redisCmd.set(key, JSON.stringify(instance));
}

// ─── Load Balancing Algorithms ──────────────────────────────────

/**
 * Select instance using round-robin algorithm
 */
async function selectRoundRobin(serviceId: string, instances: ServiceInstance[]): Promise<ServiceInstance | null> {
  if (instances.length === 0) return null;

  const counterKey = LB_COUNTER_KEY(serviceId);
  const counter = await redisCmd.incr(counterKey);
  const index = (counter - 1) % instances.length;

  return instances[index];
}

/**
 * Select instance using weighted round-robin algorithm
 */
async function selectWeightedRoundRobin(serviceId: string, instances: ServiceInstance[]): Promise<ServiceInstance | null> {
  if (instances.length === 0) return null;

  // Build weighted list
  const weightedList: ServiceInstance[] = [];
  for (const instance of instances) {
    for (let i = 0; i < instance.weight; i++) {
      weightedList.push(instance);
    }
  }

  if (weightedList.length === 0) return null;

  const counterKey = LB_COUNTER_KEY(serviceId);
  const counter = await redisCmd.incr(counterKey);
  const index = (counter - 1) % weightedList.length;

  return weightedList[index];
}

/**
 * Select instance using least connections algorithm
 */
async function selectLeastConnections(instances: ServiceInstance[]): Promise<ServiceInstance | null> {
  if (instances.length === 0) return null;

  // Sort by active connections (ascending)
  const sorted = [...instances].sort((a, b) => a.activeConnections - b.activeConnections);

  return sorted[0];
}

/**
 * Select instance using random algorithm
 */
async function selectRandom(instances: ServiceInstance[]): Promise<ServiceInstance | null> {
  if (instances.length === 0) return null;

  const index = Math.floor(Math.random() * instances.length);
  return instances[index];
}

// ─── Load Balancing Logic ───────────────────────────────────────

/**
 * Select service instance using configured algorithm
 */
export async function selectInstance(
  serviceId: string,
  config?: Partial<LoadBalancerConfig>,
  sessionId?: string,
): Promise<ServiceInstance | null> {
  const lbConfig = { ...DEFAULT_CONFIG, ...config };

  // Get all instances
  let instances = await getInstances(serviceId);

  if (instances.length === 0) {
    // Fallback to discovery service
    const discovered = DiscoveryService.query({ name: serviceId, status: "healthy" });
    instances = discovered.map((s) => ({
      serviceId: s.id,
      instanceId: s.instanceId || "default",
      baseUrl: s.baseUrl,
      weight: 1,
      activeConnections: 0,
    }));
  }

  if (instances.length === 0) {
    logger.warn("No instances available", { serviceId });
    Metrics.increment("lb.no_instances", 1, { serviceId });
    return null;
  }

  // Filter healthy instances if health check enabled
  if (lbConfig.healthCheckEnabled) {
    const healthyInstances = instances.filter((i) => {
      const discovered = DiscoveryService.query({
        name: serviceId,
        status: "healthy",
      });
      return discovered.some((d) => d.instanceId === i.instanceId);
    });

    if (healthyInstances.length > 0) {
      instances = healthyInstances;
    }
  }

  // Check sticky session
  if (lbConfig.stickySessionsEnabled && sessionId) {
    const stickyKey = LB_STICKY_KEY(sessionId);
    const stickyInstanceId = await redisCmd.get(stickyKey);

    if (stickyInstanceId) {
      const stickyInstance = instances.find((i) => i.instanceId === stickyInstanceId);
      if (stickyInstance) {
        logger.debug("Using sticky session", { serviceId, instanceId: stickyInstanceId, sessionId });
        Metrics.increment("lb.sticky_session.hit", 1, { serviceId });
        return stickyInstance;
      }
    }
  }

  // Select instance using algorithm
  let selected: ServiceInstance | null = null;

  switch (lbConfig.algorithm) {
    case "round_robin":
      selected = await selectRoundRobin(serviceId, instances);
      break;
    case "weighted_round_robin":
      selected = await selectWeightedRoundRobin(serviceId, instances);
      break;
    case "least_connections":
      selected = await selectLeastConnections(instances);
      break;
    case "random":
      selected = await selectRandom(instances);
      break;
    default:
      selected = await selectRoundRobin(serviceId, instances);
  }

  if (!selected) {
    logger.warn("Failed to select instance", { serviceId, algorithm: lbConfig.algorithm });
    return null;
  }

  // Update sticky session
  if (lbConfig.stickySessionsEnabled && sessionId) {
    const stickyKey = LB_STICKY_KEY(sessionId);
    await redisCmd.set(stickyKey, selected.instanceId, "EX", lbConfig.stickySessionTTLSeconds || 3600);
    Metrics.increment("lb.sticky_session.set", 1, { serviceId });
  }

  // Update last selected timestamp
  selected.lastSelectedAt = new Date().toISOString();
  const instanceKey = LB_INSTANCE_KEY(serviceId, selected.instanceId);
  await redisCmd.set(instanceKey, JSON.stringify(selected));

  // Update metrics
  Metrics.increment("lb.requests", 1, { serviceId, algorithm: lbConfig.algorithm });
  Metrics.increment("lb.instance.selected", 1, { serviceId, instanceId: selected.instanceId });

  logger.debug("Instance selected", {
    serviceId,
    instanceId: selected.instanceId,
    algorithm: lbConfig.algorithm,
    activeConnections: selected.activeConnections,
  });

  return selected;
}

// ─── Load Balancer Statistics ───────────────────────────────────

/**
 * Get load balancer statistics
 */
export async function getLoadBalancerStats(): Promise<LoadBalancerStats> {
  const metrics = Metrics.snapshot();

  const totalRequests = metrics.counters["lb.requests"]?.total || 0;
  const totalErrors = metrics.counters["lb.no_instances"]?.total || 0;

  const byAlgorithm: Record<string, number> = {};
  const byInstance: Record<string, number> = {};

  // Extract algorithm stats
  if (metrics.counters["lb.requests"]?.tags) {
    for (const [tag, count] of Object.entries(metrics.counters["lb.requests"].tags)) {
      const match = tag.match(/algorithm=(\w+)/);
      if (match) {
        byAlgorithm[match[1]] = count as number;
      }
    }
  }

  // Extract instance stats
  if (metrics.counters["lb.instance.selected"]?.tags) {
    for (const [tag, count] of Object.entries(metrics.counters["lb.instance.selected"].tags)) {
      const match = tag.match(/instanceId=([^,]+)/);
      if (match) {
        byInstance[match[1]] = count as number;
      }
    }
  }

  return {
    totalRequests,
    byAlgorithm: byAlgorithm as Record<LoadBalancingAlgorithm, number>,
    byInstance,
    avgResponseTimeMs: 0, // Would need to track response times
    totalErrors,
  };
}

// ─── Express Middleware ─────────────────────────────────────────

/**
 * Express middleware for load balancing
 */
export function loadBalancerMiddleware(
  serviceId: string,
  config?: Partial<LoadBalancerConfig>,
) {
  return async (req: any, res: any, next: any) => {
    try {
      // Extract session ID for sticky sessions
      const sessionId = req.cookies?.[config?.stickySessionCookie || DEFAULT_CONFIG.stickySessionCookie];

      // Select instance
      const instance = await selectInstance(serviceId, config, sessionId);

      if (!instance) {
        return res.status(503).json({
          ok: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: `No healthy instances available for service: ${serviceId}`,
          },
        });
      }

      // Attach instance to request
      req.loadBalancerInstance = instance;

      // Track connection
      await updateActiveConnections(serviceId, instance.instanceId, 1);

      // Track connection end
      res.on("finish", async () => {
        await updateActiveConnections(serviceId, instance.instanceId, -1);
      });

      next();
    } catch (error) {
      logger.error("Load balancer middleware error", { error: (error as Error).message });
      next(error);
    }
  };
}
