import type { ErrorCode } from "@windels/shared/api";

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    status?: number,
    details?: unknown
  ) {
    super(message);
    this.code = code;
    this.status =
      status ??
      ({
        BAD_REQUEST: 400,
        VALIDATION_ERROR: 422,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        CONFLICT: 409,
        TOO_MANY_REQUESTS: 429,
        UPSTREAM_ERROR: 502,
        SERVICE_UNAVAILABLE: 503,
        INTERNAL_ERROR: 500,
        // AI provider errors — surfaced to clients so they can react
        AI_PROVIDER_CONFIGURATION_REQUIRED: 503,
        AI_PROVIDER_ERROR: 502,
        AI_RATE_LIMITED: 429,
        AI_TIMEOUT: 504,
        AI_ABORTED: 499,
        AI_PROMPT_INJECTION: 422,
      } satisfies Record<ErrorCode, number>)[code] ?? 500;
    this.details = details;
  }

  static badRequest(msg: string, details?: unknown) {
    return new AppError("BAD_REQUEST", msg, 400, details);
  }
  static validation(msg: string, details?: unknown) {
    return new AppError("VALIDATION_ERROR", msg, 422, details);
  }
  static unauthorized(msg = "Unauthorized") {
    return new AppError("UNAUTHORIZED", msg, 401);
  }
  static forbidden(msg = "Forbidden") {
    return new AppError("FORBIDDEN", msg, 403);
  }
  static notFound(msg = "Not found") {
    return new AppError("NOT_FOUND", msg, 404);
  }
  static conflict(msg: string) {
    return new AppError("CONFLICT", msg, 409);
  }
  static tooManyRequests(msg: string) {
    return new AppError("TOO_MANY_REQUESTS", msg, 429);
  }
  static upstream(msg: string, details?: unknown) {
    return new AppError("UPSTREAM_ERROR", msg, 502, details);
  }
  static serviceUnavailable(msg: string) {
    return new AppError("UPSTREAM_ERROR", msg, 503);
  }
  static internal(msg: string, details?: unknown) {
    return new AppError("INTERNAL_ERROR", msg, 500, details);
  }
}

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
export function fail<T = never>(error: AppError): Result<T> {
  return { ok: false, error };
}
