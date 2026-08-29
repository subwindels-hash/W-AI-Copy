// Backward-compatible re-export: config/logger was historically pino; we now
// route through observability/logger which exposes the same `fatal/error/warn/info/debug/child`
// surface plus ring-buffer tailing for the platform UI.
export { logger, logger as default } from "../observability/logger.js";
