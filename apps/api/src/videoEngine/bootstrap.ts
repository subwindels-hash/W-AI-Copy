/**
 * Video Engine bootstrap + periodic worker.
 *
 * On startup, ensure the gateway has its adapters registered (the simulator is
 * registered at module import; real adapters register here if configured via
 * env). A periodic worker ticks the job queue across all tenants, exactly like
 * the mediaGen and musicVideo workers.
 */
import { VideoService } from "./video.service.js";
import { VideoJobQueue } from "./jobQueue.js";
import { videoProviderGateway } from "./providerGateway.js";
import { logger as defaultLogger } from "../config/logger.js";

let interval: NodeJS.Timeout | null = null;

export async function bootstrapVideoEngine(logger?: { info: (msg: string, meta?: unknown) => void; warn: (msg: string, meta?: unknown) => void }) {
  const log = logger ?? defaultLogger;
  // Real provider adapters would be registered here based on env config, e.g.
  // if (process.env.RUNWAY_API_KEY) videoProviderGateway.registerAdapter(new RunwayAdapter());
  const providers = videoProviderGateway.listProviders();
  log.info("[video-engine] bootstrap complete", {
    providers: providers.length,
    models: providers.reduce((a, p) => a + p.models.length, 0),
  });
}

export function startVideoWorker(intervalMs = 2000): void {
  if (interval) return;
  interval = setInterval(async () => {
    try {
      await VideoJobQueue.tickAll((job) => VideoService.handleJob(job));
    } catch (err) {
      defaultLogger.warn("[video-engine] worker tick failed", { err });
    }
  }, intervalMs);
  interval.unref?.();
}

export function stopVideoWorker(): void {
  if (interval) { clearInterval(interval); interval = null; }
}
