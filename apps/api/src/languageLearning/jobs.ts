import { logger } from "../config/logger.js";

/**
 * Daily-plan refresh is computed on read from stored activity.
 * This ticker is a heartbeat so the module participates in scheduled jobs
 * without inventing learner data.
 */
export function startLanguageLearningTicker(intervalMs = 60 * 60_000): NodeJS.Timeout {
  const tick = () => {
    logger.info("[language-learning] scheduled tick — plans are generated on demand from stored reviews");
  };
  const handle = setInterval(tick, intervalMs);
  handle.unref?.();
  return handle;
}
