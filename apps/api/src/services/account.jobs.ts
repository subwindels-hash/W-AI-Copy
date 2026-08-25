import { logger } from "../config/logger.js";
import { rotateExpiredPins } from "./account.service.js";

export async function runPinRotationJob(): Promise<{ scanned: number; rotated: number }> {
  const result = await rotateExpiredPins(200);
  if (result.rotated > 0) {
    logger.info("[account] system PIN rotation tick", result);
  }
  return result;
}

export function startPinRotationTicker(intervalMs = 15 * 60_000): NodeJS.Timeout {
  const tick = () => {
    void runPinRotationJob().catch((err) => logger.warn("[account] PIN rotation ticker failed", { err }));
  };
  const handle = setInterval(tick, intervalMs);
  handle.unref?.();
  setTimeout(tick, 45_000).unref?.();
  return handle;
}
