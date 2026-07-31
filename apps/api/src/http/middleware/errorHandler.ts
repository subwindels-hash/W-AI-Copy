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

  if (err instanceof AppError) {
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
