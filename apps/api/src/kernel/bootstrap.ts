/**
 * Kernel bootstrap (Session 39) — 12500ms slot
 */
import { KernelService } from "./kernel.service.js";
import { redisCmd as redis } from "../db/redis.js";

export async function bootstrapKernel(logger?: any): Promise<void> {
  if (await redis.get("kernel:start")) { logger?.info("[kernel] bootstrap skipped"); return; }
  await KernelService.ensureStarted();
  // Seed a few demo events
  await KernelService.dispatch({ kind: "kernel.boot", source: "bootstrap", payload: { session: 39 } });
  await KernelService.evaluatePolicy({ action: "read", risk: "low" });
  await KernelService.selectModel("chat");
  await KernelService.grantResources({ priority: "interactive" });
  await KernelService.runDiagnostics();
  await KernelService.heartbeat("policy", 12, 0);
  await KernelService.heartbeat("compute", 8, 0);
  await KernelService.heartbeat("event-bus", 54, 0);
  logger?.info("[kernel] boot complete", { components: (await KernelService.listComponents()).length });
}
