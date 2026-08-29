import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../../utils/result.js";
import { logger } from "../../config/logger.js";
import type { ApiErrorEnvelope } from "@windels/shared/api";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = req.requestId ?? "unknown";
  const native = req.originalUrl?.startsWith("/v1/") || req.baseUrl === "/v1";

  if (err instanceof AppError) {
    if (native) {
      const type = err.status === 401 ? "authentication_error" : err.status === 403 ? "permission_error" : err.status === 429 ? "rate_limit_error" : err.status >= 500 ? "api_error" : "invalid_request_error";
      return res.status(err.status).json({ error: { message: err.message, type, code: String(err.code).toLowerCase(), param: null, ...(err.details ? { details: err.details } : {}) }, request_id: requestId });
    }
    const envelope: ApiErrorEnvelope = {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
      meta: { requestId },
    };
    if (err.status >= 500) logger.error(err.message, { err, requestId });
    else logger.warn(err.message, { err, requestId });
    return res.status(err.status).json(envelope);
  }

  if (err instanceof ZodError) {
    if (native) return res.status(422).json({ error: { message: "Request validation failed", type: "invalid_request_error", code: "validation_error", param: null, details: err.flatten() }, request_id: requestId });
    const envelope: ApiErrorEnvelope = {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.flatten(),
      },
      meta: { requestId },
    };
    return res.status(422).json(envelope);
  }

  const unknown = err instanceof Error ? err : new Error(String(err));
  logger.error("unhandled error", { err: unknown, requestId });
  if (native) return res.status(500).json({ error: { message: process.env.NODE_ENV === "production" ? "Internal server error" : unknown.message, type: "api_error", code: "internal_error", param: null }, request_id: requestId });
  const envelope: ApiErrorEnvelope = {
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : unknown.message,
    },
    meta: { requestId },
  };
  return res.status(500).json(envelope);
}
