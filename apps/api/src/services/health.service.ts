import { prisma } from "../db/client.js";
import { redis } from "../db/redis.js";

export interface HealthStatus {
  service: string;
  status: "ok" | "degraded" | "down";
  latencyMs?: number;
  details?: Record<string, any>;
}

export async function checkAll(): Promise<{ overall: "ok" | "degraded" | "down"; checks: HealthStatus[]; recordedAt: string }> {
  const checks: HealthStatus[] = [];

  // API itself
  checks.push({ service: "api", status: "ok", latencyMs: 0 });

  // Database
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ service: "database", status: "ok", latencyMs: Date.now() - t0 });
  } catch (e: any) {
    checks.push({ service: "database", status: "down", latencyMs: Date.now() - t0, details: { error: e.message } });
  }

  // Redis
  const t1 = Date.now();
  try {
    const pong = await redis.ping();
    checks.push({ service: "redis", status: pong === "PONG" ? "ok" : "degraded", latencyMs: Date.now() - t1 });
  } catch (e: any) {
    checks.push({ service: "redis", status: "down", latencyMs: Date.now() - t1, details: { error: e.message } });
  }

  // Persist health check record (best-effort)
  try {
    await prisma.healthCheck.createMany({
      data: checks.map((c) => ({
        service: c.service, status: c.status, latencyMs: c.latencyMs ?? 0, details: c.details ?? {},
      })),
    });
  } catch {}

  const overall = checks.every((c) => c.status === "ok") ? "ok" : checks.some((c) => c.status === "down") ? "down" : "degraded";
  return { overall, checks, recordedAt: new Date().toISOString() };
}

export async function getHealthHistory(service: string, minutes = 60) {
  const since = new Date(Date.now() - minutes * 60_000);
  const rows = await prisma.healthCheck.findMany({
    where: { service, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ time: r.createdAt, status: r.status, latencyMs: r.latencyMs }));
}
