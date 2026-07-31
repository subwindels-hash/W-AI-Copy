/**
 * Microservice Framework helper (Slice 162).
 *
 * Common utilities for any Node microservice in the WINDELS ecosystem:
 *  - registerOnce() — registers with the central discovery service on boot and
 *    sends heartbeats on an interval
 *  - createServiceConfig() — standardised env/config contract
 *
 * In this monorepo MVP these are used by the primary API itself to register
 * with its in-process registry, but future microservices (workers, schedulers,
 * standalone pipelines) can import the same helper.
 */
import type { ServiceHealthReport, ServiceRegistration } from "@windels/shared/enterprise";
import { DiscoveryService } from "../discovery/discovery.service.js";

export interface ServiceConfig {
  id: string;
  name: string;
  version: string;
  baseUrl: string;
  capabilities: string[];
  region?: string;
  heartbeatIntervalMs?: number;
}

export function createServiceConfig(env: NodeJS.ProcessEnv): ServiceConfig {
  return {
    id: env.SERVICE_ID ?? "windels-api",
    name: env.SERVICE_NAME ?? "WINDELS API",
    version: env.npm_package_version ?? "0.17.0",
    baseUrl: env.SERVICE_BASE_URL ?? `http://localhost:${env.API_PORT ?? 4000}`,
    capabilities: (env.SERVICE_CAPABILITIES ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    region: env.REGION ?? "local",
    heartbeatIntervalMs: Number(env.HEARTBEAT_INTERVAL_MS ?? 15_000),
  };
}

export async function registerOnce(cfg: ServiceConfig): Promise<{ stop: () => void }> {
  const reg = await DiscoveryService.register({
    id: cfg.id, name: cfg.name, version: cfg.version,
    baseUrl: cfg.baseUrl, healthUrl: "/api/v1/health",
    capabilities: cfg.capabilities, region: cfg.region,
    metadata: { registeredAt: new Date().toISOString() },
    status: "starting",
  });
  // Heartbeat loop
  const interval = setInterval(async () => {
    const report: Omit<ServiceHealthReport, "instanceId"|"reportedAt"> = {
      serviceId: cfg.id, status: "healthy", version: cfg.version,
      uptimeSeconds: Math.round(process.uptime()),
      checks: { self: "ok" },
    };
    await DiscoveryService.heartbeat(reg.instanceId!, report);
  }, cfg.heartbeatIntervalMs);
  interval.unref?.();
  return { stop: () => clearInterval(interval) };
}
