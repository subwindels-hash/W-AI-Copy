import { z } from "zod";

/** Canonical JSON-envelope used by every REST endpoint. */
export interface ApiEnvelope<T> {
  ok: true;
  data: T;
  meta?: {
    requestId: string;
    tookMs: number;
    pagination?: PaginationMeta;
  };
}

export interface ApiErrorEnvelope {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
  meta: {
    requestId: string;
  };
}

export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "UPSTREAM_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR"
  // AI execution errors — surfaced from the AI registry so clients can react to them
  | "AI_PROVIDER_CONFIGURATION_REQUIRED"
  | "AI_PROVIDER_ERROR"
  | "AI_RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_ABORTED"
  | "AI_PROMPT_INJECTION"
  // S77 ChildSafetyReviewer — a publish blocked by the content-safety gate.
  // Distinct from BAD_REQUEST so clients can present a safety outcome rather
  // than a generic validation failure, and so it is greppable in audit trails.
  | "CONTENT_SAFETY_REJECTED";

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;
