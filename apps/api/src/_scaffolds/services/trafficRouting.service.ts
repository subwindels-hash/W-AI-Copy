/**
 * Traffic Routing Service (Module 24 — Gap 3)
 *
 * Advanced traffic routing capabilities:
 * - Canary deployments (gradual traffic shift)
 * - Traffic splitting (percentage-based routing)
 * - A/B testing (cookie or header-based routing)
 * - Blue-green deployments (instant cutover)
 * - Header-based routing
 * - Path-based routing
 * - Traffic mirroring (shadow traffic)
 *
 * Provides sophisticated traffic management for safe deployments.
 */
import { logger } from "../../config/logger.js";
import { Metrics } from "../../observability/metrics.js";
import { redisCmd } from "../../db/redis.js";
import { randomBytes } from "crypto";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:trafficRouting');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ──────────────────────────────────────────────────────

export type RoutingStrategy = "canary" | "traffic_split" | "ab_test" | "blue_green" | "header_based" | "path_based";

export interface TrafficRoute {
  id: string;
  serviceId: string;
  strategy: RoutingStrategy;
  enabled: boolean;
  config: CanaryConfig | TrafficSplitConfig | ABTestConfig | BlueGreenConfig | HeaderBasedConfig | PathBasedConfig;
  createdAt: string;
  updatedAt: string;
}

export interface CanaryConfig {
  canaryInstanceId: string;
  stableInstanceId: string;
  canaryWeight: number; // 0-100
  stableWeight: number; // 0-100
  autoPromote: boolean;
  autoPromoteThreshold: number; // Success rate threshold for auto-promotion
  promotionDelaySeconds: number;
}

export interface TrafficSplitConfig {
  targets: Array<{
    instanceId: string;
    weight: number; // 0-100
  }>;
}

export interface ABTestConfig {
  variantA: {
    instanceId: string;
    cookieValue?: string;
    headerValue?: string;
  };
  variantB: {
    instanceId: string;
    cookieValue?: string;
    headerValue?: string;
  };
  routingBy: "cookie" | "header";
  cookieName?: string;
  headerName?: string;
}

export interface BlueGreenConfig {
  blueInstanceId: string;
  greenInstanceId: string;
  activeEnvironment: "blue" | "green";
  autoSwitchback: boolean;
  switchbackDelaySeconds: number;
}

export interface HeaderBasedConfig {
  headerName: string;
  routes: Array<{
    headerValue: string;
    instanceId: string;
  }>;
  defaultInstanceId: string;
}

export interface PathBasedConfig {
  routes: Array<{
    pathPrefix: string;
    instanceId: string;
  }>;
  defaultInstanceId: string;
}

export interface TrafficMirrorConfig {
  sourceInstanceId: string;
  mirrorInstanceId: string;
  mirrorPercentage: number; // 0-100
  enabled: boolean;
}

export interface RoutingStats {
  totalRequests: number;
  byStrategy: Record<RoutingStrategy, number>;
  byInstance: Record<string, number>;
  canaryPromotions: number;
  canaryRollbacks: number;
  abTestVariants: Record<string, number>;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const ROUTE_KEY = (routeId: string) => `traffic:route:${routeId}`;
const ROUTES_KEY = (serviceId: string) => `traffic:routes:${serviceId}`;
const ROUTING_STATS_KEY = "traffic:stats";
const TRAFFIC_MIRROR_KEY = (serviceId: string) => `traffic:mirror:${serviceId}`;

// ─── Route Management ───────────────────────────────────────────

/**
 * Create traffic route
 */
export async function createTrafficRoute(
  serviceId: string,
  strategy: RoutingStrategy,
  config: any,
): Promise<TrafficRoute> {
  const routeId = `route_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();

  const route: TrafficRoute = {
    id: routeId,
    serviceId,
    strategy,
    enabled: true,
    config,
    createdAt: now,
    updatedAt: now,
  };

  const routeKey = ROUTE_KEY(routeId);
  await redisCmd.set(routeKey, JSON.stringify(route));

  const routesKey = ROUTES_KEY(serviceId);
  await redisCmd.sadd(routesKey, routeId);

  logger.info("Traffic route created", { routeId, serviceId, strategy });

  Metrics.increment("traffic.routes.created", 1, { serviceId, strategy });

  return route;
}

/**
 * Update traffic route
 */
export async function updateTrafficRoute(
  routeId: string,
  updates: Partial<TrafficRoute>,
): Promise<TrafficRoute | null> {
  const routeKey = ROUTE_KEY(routeId);
  const data = await redisCmd.get(routeKey);

  if (!data) {
    return null;
  }

  const route: TrafficRoute = JSON.parse(data);
  Object.assign(route, updates, { updatedAt: new Date().toISOString() });

  await redisCmd.set(routeKey, JSON.stringify(route));

  logger.info("Traffic route updated", { routeId, updates: Object.keys(updates) });

  return route;
}

/**
 * Get traffic route
 */
export async function getTrafficRoute(routeId: string): Promise<TrafficRoute | null> {
  const routeKey = ROUTE_KEY(routeId);
  const data = await redisCmd.get(routeKey);

  return data ? JSON.parse(data) : null;
}

/**
 * Get all routes for a service
 */
export async function getServiceRoutes(serviceId: string): Promise<TrafficRoute[]> {
  const routesKey = ROUTES_KEY(serviceId);
  const routeIds = await redisCmd.smembers(routesKey);
  const routes: TrafficRoute[] = [];

  for (const routeId of routeIds) {
    const route = await getTrafficRoute(routeId);
    if (route) {
      routes.push(route);
    }
  }

  return routes;
}

/**
 * Delete traffic route
 */
export async function deleteTrafficRoute(routeId: string): Promise<void> {
  const route = await getTrafficRoute(routeId);
  if (!route) return;

  const routeKey = ROUTE_KEY(routeId);
  await redisCmd.del(routeKey);

  const routesKey = ROUTES_KEY(route.serviceId);
  await redisCmd.srem(routesKey, routeId);

  logger.info("Traffic route deleted", { routeId, serviceId: route.serviceId });

  Metrics.increment("traffic.routes.deleted", 1, { serviceId: route.serviceId });
}

/**
 * Enable or disable traffic route
 */
export async function setTrafficRouteEnabled(routeId: string, enabled: boolean): Promise<void> {
  await updateTrafficRoute(routeId, { enabled });
}

// ─── Traffic Routing Logic ──────────────────────────────────────

/**
 * Route request based on configured routes
 */
export async function routeRequest(
  serviceId: string,
  req: any,
): Promise<string | null> {
  const routes = await getServiceRoutes(serviceId);
  const enabledRoutes = routes.filter((r) => r.enabled);

  if (enabledRoutes.length === 0) {
    return null;
  }

  // Use first enabled route (could be enhanced to support multiple routes)
  const route = enabledRoutes[0];

  let selectedInstanceId: string | null = null;

  switch (route.strategy) {
    case "canary":
      selectedInstanceId = await routeCanary(route.config as CanaryConfig);
      break;
    case "traffic_split":
      selectedInstanceId = await routeTrafficSplit(route.config as TrafficSplitConfig);
      break;
    case "ab_test":
      selectedInstanceId = await routeABTest(route.config as ABTestConfig, req);
      break;
    case "blue_green":
      selectedInstanceId = await routeBlueGreen(route.config as BlueGreenConfig);
      break;
    case "header_based":
      selectedInstanceId = await routeHeaderBased(route.config as HeaderBasedConfig, req);
      break;
    case "path_based":
      selectedInstanceId = await routePathBased(route.config as PathBasedConfig, req);
      break;
    default:
      logger.warn("Unknown routing strategy", { strategy: route.strategy });
  }

  if (selectedInstanceId) {
    Metrics.increment("traffic.requests.routed", 1, {
      serviceId,
      strategy: route.strategy,
      instanceId: selectedInstanceId,
    });
  }

  return selectedInstanceId;
}

/**
 * Canary routing - gradual traffic shift
 */
async function routeCanary(config: CanaryConfig): Promise<string> {
  const random = _rng.next() * 100;

  const selectedInstanceId = random < config.canaryWeight ? config.canaryInstanceId : config.stableInstanceId;

  logger.debug("Canary routing", {
    canaryWeight: config.canaryWeight,
    stableWeight: config.stableWeight,
    selectedInstanceId,
  });

  Metrics.increment("traffic.canary.routed", 1, {
    variant: selectedInstanceId === config.canaryInstanceId ? "canary" : "stable",
  });

  return selectedInstanceId;
}

/**
 * Traffic split routing - percentage-based routing
 */
async function routeTrafficSplit(config: TrafficSplitConfig): Promise<string> {
  const random = _rng.next() * 100;
  let cumulative = 0;

  for (const target of config.targets) {
    cumulative += target.weight;
    if (random < cumulative) {
      logger.debug("Traffic split routing", {
        selectedInstanceId: target.instanceId,
        weight: target.weight,
      });

      Metrics.increment("traffic.split.routed", 1, {
        instanceId: target.instanceId,
      });

      return target.instanceId;
    }
  }

  // Fallback to last target
  return config.targets[config.targets.length - 1].instanceId;
}

/**
 * A/B test routing - cookie or header-based
 */
async function routeABTest(config: ABTestConfig, req: any): Promise<string> {
  let variant: "A" | "B" = "A";

  if (config.routingBy === "cookie" && config.cookieName) {
    const cookieValue = req.cookies?.[config.cookieName];
    if (cookieValue === config.variantB.cookieValue) {
      variant = "B";
    }
  } else if (config.routingBy === "header" && config.headerName) {
    const headerValue = req.headers[config.headerName.toLowerCase()];
    if (headerValue === config.variantB.headerValue) {
      variant = "B";
    }
  }

  const selectedInstanceId = variant === "A" ? config.variantA.instanceId : config.variantB.instanceId;

  logger.debug("A/B test routing", { variant, selectedInstanceId });

  Metrics.increment("traffic.ab_test.routed", 1, { variant });

  return selectedInstanceId;
}

/**
 * Blue-green routing - instant cutover
 */
async function routeBlueGreen(config: BlueGreenConfig): Promise<string> {
  const selectedInstanceId =
    config.activeEnvironment === "blue" ? config.blueInstanceId : config.greenInstanceId;

  logger.debug("Blue-green routing", {
    activeEnvironment: config.activeEnvironment,
    selectedInstanceId,
  });

  Metrics.increment("traffic.blue_green.routed", 1, {
    environment: config.activeEnvironment,
  });

  return selectedInstanceId;
}

/**
 * Header-based routing
 */
async function routeHeaderBased(config: HeaderBasedConfig, req: any): Promise<string> {
  const headerValue = req.headers[config.headerName.toLowerCase()];

  for (const route of config.routes) {
    if (headerValue === route.headerValue) {
      logger.debug("Header-based routing", {
        headerName: config.headerName,
        headerValue,
        selectedInstanceId: route.instanceId,
      });

      Metrics.increment("traffic.header_based.routed", 1, {
        headerValue,
        instanceId: route.instanceId,
      });

      return route.instanceId;
    }
  }

  // Fallback to default
  logger.debug("Header-based routing (default)", {
    headerName: config.headerName,
    headerValue,
    selectedInstanceId: config.defaultInstanceId,
  });

  return config.defaultInstanceId;
}

/**
 * Path-based routing
 */
async function routePathBased(config: PathBasedConfig, req: any): Promise<string> {
  const path = req.path;

  for (const route of config.routes) {
    if (path.startsWith(route.pathPrefix)) {
      logger.debug("Path-based routing", {
        path,
        pathPrefix: route.pathPrefix,
        selectedInstanceId: route.instanceId,
      });

      Metrics.increment("traffic.path_based.routed", 1, {
        pathPrefix: route.pathPrefix,
        instanceId: route.instanceId,
      });

      return route.instanceId;
    }
  }

  // Fallback to default
  logger.debug("Path-based routing (default)", {
    path,
    selectedInstanceId: config.defaultInstanceId,
  });

  return config.defaultInstanceId;
}

// ─── Canary Deployment Management ───────────────────────────────

/**
 * Promote canary to stable
 */
export async function promoteCanary(routeId: string): Promise<void> {
  const route = await getTrafficRoute(routeId);
  if (!route || route.strategy !== "canary") {
    throw new Error("Route not found or not a canary route");
  }

  const config = route.config as CanaryConfig;

  // Swap canary and stable
  await updateTrafficRoute(routeId, {
    config: {
      ...config,
      canaryWeight: 100,
      stableWeight: 0,
    },
  });

  logger.info("Canary promoted to stable", { routeId });

  Metrics.increment("traffic.canary.promoted", 1);
}

/**
 * Rollback canary
 */
export async function rollbackCanary(routeId: string): Promise<void> {
  const route = await getTrafficRoute(routeId);
  if (!route || route.strategy !== "canary") {
    throw new Error("Route not found or not a canary route");
  }

  const config = route.config as CanaryConfig;

  // Route all traffic to stable
  await updateTrafficRoute(routeId, {
    config: {
      ...config,
      canaryWeight: 0,
      stableWeight: 100,
    },
  });

  logger.info("Canary rolled back", { routeId });

  Metrics.increment("traffic.canary.rolled_back", 1);
}

/**
 * Switch blue-green environment
 */
export async function switchBlueGreen(routeId: string, environment: "blue" | "green"): Promise<void> {
  const route = await getTrafficRoute(routeId);
  if (!route || route.strategy !== "blue_green") {
    throw new Error("Route not found or not a blue-green route");
  }

  const config = route.config as BlueGreenConfig;

  await updateTrafficRoute(routeId, {
    config: {
      ...config,
      activeEnvironment: environment,
    },
  });

  logger.info("Blue-green switched", { routeId, environment });

  Metrics.increment("traffic.blue_green.switched", 1, { environment });
}

// ─── Traffic Mirroring ──────────────────────────────────────────

/**
 * Configure traffic mirroring
 */
export async function configureTrafficMirror(
  serviceId: string,
  config: TrafficMirrorConfig,
): Promise<void> {
  const mirrorKey = TRAFFIC_MIRROR_KEY(serviceId);
  await redisCmd.set(mirrorKey, JSON.stringify(config));

  logger.info("Traffic mirroring configured", { serviceId, config });

  Metrics.increment("traffic.mirror.configured", 1, { serviceId });
}

/**
 * Get traffic mirror configuration
 */
export async function getTrafficMirror(serviceId: string): Promise<TrafficMirrorConfig | null> {
  const mirrorKey = TRAFFIC_MIRROR_KEY(serviceId);
  const data = await redisCmd.get(mirrorKey);

  return data ? JSON.parse(data) : null;
}

/**
 * Should mirror traffic
 */
export async function shouldMirrorTraffic(serviceId: string): Promise<string | null> {
  const config = await getTrafficMirror(serviceId);

  if (!config || !config.enabled) {
    return null;
  }

  const random = _rng.next() * 100;
  if (random < config.mirrorPercentage) {
    return config.mirrorInstanceId;
  }

  return null;
}

// ─── Statistics ─────────────────────────────────────────────────

/**
 * Get traffic routing statistics
 */
export async function getTrafficRoutingStats(): Promise<RoutingStats> {
  const metrics = Metrics.snapshot();

  const totalRequests = metrics.counters["traffic.requests.routed"]?.total || 0;
  const canaryPromotions = metrics.counters["traffic.canary.promoted"]?.total || 0;
  const canaryRollbacks = metrics.counters["traffic.canary.rolled_back"]?.total || 0;

  const byStrategy: Record<string, number> = {};
  const byInstance: Record<string, number> = {};
  const abTestVariants: Record<string, number> = {};

  // Extract strategy stats
  if (metrics.counters["traffic.requests.routed"]?.tags) {
    for (const [tag, count] of Object.entries(metrics.counters["traffic.requests.routed"].tags)) {
      const strategyMatch = tag.match(/strategy=(\w+)/);
      if (strategyMatch) {
        byStrategy[strategyMatch[1]] = count as number;
      }

      const instanceMatch = tag.match(/instanceId=([^,]+)/);
      if (instanceMatch) {
        byInstance[instanceMatch[1]] = count as number;
      }
    }
  }

  // Extract A/B test stats
  if (metrics.counters["traffic.ab_test.routed"]?.tags) {
    for (const [tag, count] of Object.entries(metrics.counters["traffic.ab_test.routed"].tags)) {
      const variantMatch = tag.match(/variant=(\w+)/);
      if (variantMatch) {
        abTestVariants[variantMatch[1]] = count as number;
      }
    }
  }

  return {
    totalRequests,
    byStrategy: byStrategy as Record<RoutingStrategy, number>,
    byInstance,
    canaryPromotions,
    canaryRollbacks,
    abTestVariants,
  };
}

// ─── Express Middleware ─────────────────────────────────────────

/**
 * Express middleware for traffic routing
 */
export function trafficRoutingMiddleware(serviceId: string) {
  return async (req: any, res: any, next: any) => {
    try {
      const selectedInstanceId = await routeRequest(serviceId, req);

      if (selectedInstanceId) {
        req.trafficRoutedInstanceId = selectedInstanceId;

        // Check for traffic mirroring
        const mirrorInstanceId = await shouldMirrorTraffic(serviceId);
        if (mirrorInstanceId) {
          req.trafficMirrorInstanceId = mirrorInstanceId;

          // In production, you would asynchronously send a copy of the request
          // to the mirror instance here
          logger.debug("Traffic mirroring", { mirrorInstanceId });
        }
      }

      next();
    } catch (error) {
      logger.error("Traffic routing middleware error", { error: (error as Error).message });
      next(error);
    }
  };
}
