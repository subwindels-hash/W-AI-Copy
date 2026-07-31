import { PrismaClient } from "@prisma/client/wasm";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";
import { startSpan, getCtx } from "../observability/tracer.js";

// Driver adapter: use `pg` Pool + WASM query engine (no native libquery binary needed).
const pool = new Pool({ connectionString: env.DATABASE_URL });
const adapter = new PrismaPg(pool, { schema: "public" });

declare global {
  // eslint-disable-next-line no-var
  var __windels_prisma: PrismaClient | undefined;
}

function withObservability(p: PrismaClient) {
  // $extends is Prisma 4.16+; query-event style for metrics.
  p.$use(async (params: any, next: any) => {
    const t0 = performance.now();
    const model = params.model ?? "raw";
    const action = params.action;
    let status: "ok" | "error" = "ok";
    let err: any;
    try {
      return await next(params);
    } catch (e) {
      status = "error";
      err = e;
      throw e;
    } finally {
      const ms = performance.now() - t0;
      Metrics.timing("db.query.duration_ms", ms, { model, action, status });
      Metrics.increment("db.query.count", 1, { model, action, status });
      if (status === "error") {
        logger.warn(`db ${model}.${action} failed`, { model, action, ms: Math.round(ms), err: err?.message });
      } else if (ms > 500) {
        logger.debug(`db slow query ${model}.${action} ${Math.round(ms)}ms`, { model, action, ms: Math.round(ms) });
      }
      // Create a child span if we're inside a trace context.
      const ctx = getCtx();
      if (ctx && ms > 50) {
        const sp = startSpan(`db ${model}.${action}`, { kind: "client", attrs: { "db.model": model, "db.operation": action, "db.duration_ms": Math.round(ms), "db.status": status } });
        sp.end(status, err?.message);
      }
    }
  });
  return p;
}

export const prisma =
  globalThis.__windels_prisma ??
  withObservability(new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  }));

if (env.NODE_ENV !== "production") {
  globalThis.__windels_prisma = prisma;
}

prisma.$on("error" as never, (e: Error) => {
  logger.error("Prisma client error", { err: e });
});
