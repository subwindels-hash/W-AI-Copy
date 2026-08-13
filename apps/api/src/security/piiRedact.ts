/**
 * PII Redaction — prevents emails, phones, credit cards, SSNs, JWTs, API keys,
 * and authorization headers from leaking into logs or error messages.
 *
 * Applied to:
 *   - pino logger serializers (req/res/err)
 *   - error responses (stacks are scrubbed)
 *   - request bodies for sensitive routes (auth/payments/health)
 *
 * Patterns are intentionally conservative — we redact anything that looks like
 * PII rather than trying to be clever. False positives are acceptable.
 */

// Patterns tested against common formats.
const PATTERNS: Array<{ name: string; re: RegExp; replacement: string }> = [
  { name: "jwt",         re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, replacement: "[REDACTED_JWT]" },
  { name: "bearer",      re: /(Bearer\s+)[A-Za-z0-9._-]{20,}/gi, replacement: "$1[REDACTED_TOKEN]" },
  { name: "authorization", re: /(Authorization["']?\s*[:=]\s*["']?)([A-Za-z0-9._-]{20,})/gi, replacement: "$1[REDACTED]" },
  { name: "api_key",     re: /(api[_-]?key|apikey|secret|token|password|passwd|pwd)["']?\s*[:=]\s*["']?([A-Za-z0-9._\-]{8,})/gi, replacement: "$1=[REDACTED]" },
  { name: "email",       re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: "[REDACTED_EMAIL]" },
  { name: "ssn",         re: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "***-**-****" },
  { name: "phone_us",    re: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "[REDACTED_PHONE]" },
  { name: "phone_intl",  re: /\b\+\d{7,15}\b/g, replacement: "[REDACTED_PHONE]" },
  { name: "creditcard",  re: /\b(?:\d[ -]*?){13,16}\b/g, replacement: "[REDACTED_CC]" },   // only digits long runs — masked if luhn-like
  { name: "ipv4",        re: /\b(\d{1,3}\.){3}\d{1,3}(:\d+)?\b/g, replacement: "[REDACTED_IP]" },
];

export function redactString(input: string): string {
  if (typeof input !== "string") return input;
  let out = input;
  for (const p of PATTERNS) out = out.replace(p.re, p.replacement);
  return out;
}

const SENSITIVE_KEYS = new Set([
  "password", "token", "accesstoken", "refreshtoken", "secret", "apikey",
  "authorization", "auth", "cookie", "set-cookie", "pin", "ssn",
  "creditcard", "cvv", "cardnumber", "medicalrecord", "phi", "email",
  "phone", "mfasecret", "otp", "recoverycodes",
]);

/**
 * Maximum nesting depth walked before we stop descending. Log metadata is
 * never legitimately this deep; anything beyond it is a runaway structure
 * (an ORM object graph, a socket, a parser AST) that we must not follow.
 */
const MAX_DEPTH = 12;

/**
 * Recursively redact PII from an arbitrary value.
 *
 * Safety: `logger.make()` calls this on EVERY log call with caller-supplied
 * metadata, so it must never throw and never hang. Two guards enforce that:
 *
 *   1. Cycle detection — the set of ancestors on the current path is tracked,
 *      so a self- or mutually-referencing object yields "[Circular]" instead
 *      of recursing forever. Ancestors are removed on the way back up, so a
 *      value legitimately repeated across sibling branches is still redacted
 *      in full rather than being falsely reported as a cycle.
 *   2. Depth cap — see MAX_DEPTH.
 *
 * Regression context: without these, logging any cyclic object (an Express
 * req/res, an Error with a circular `cause`, a Prisma error) crashed the
 * process with "RangeError: Maximum call stack size exceeded".
 */
function redactInner(value: unknown, ancestors: Set<object>, depth: number): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "bigint") return `${value}`;
  if (typeof value !== "object") {
    // Functions carry no PII and are not serializable — elide them.
    return typeof value === "function" ? "[Function]" : value;
  }

  // Value types that must be passed through rather than walked key-by-key.
  if (value instanceof Date) return value;
  if (value instanceof RegExp) return value.toString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return `[Buffer ${value.length}b]`;

  if (ancestors.has(value as object)) return "[Circular]";
  if (depth >= MAX_DEPTH) return "[MaxDepth]";

  ancestors.add(value as object);
  try {
    if (Array.isArray(value)) {
      return value.map((v) => redactInner(v, ancestors, depth + 1));
    }

    if (value instanceof Map) {
      const m: Record<string, unknown> = {};
      for (const [k, v] of value.entries()) {
        const key = String(k);
        m[key] = SENSITIVE_KEYS.has(key.toLowerCase())
          ? "[REDACTED]"
          : redactInner(v, ancestors, depth + 1);
      }
      return m;
    }

    if (value instanceof Set) {
      return [...value].map((v) => redactInner(v, ancestors, depth + 1));
    }

    // Errors have non-enumerable message/stack, so copy them explicitly —
    // otherwise a logged error redacts down to an empty object.
    if (value instanceof Error) {
      const e: Record<string, unknown> = {
        name: value.name,
        message: redactString(value.message),
      };
      if (value.stack) e.stack = redactString(value.stack);
      for (const [k, v] of Object.entries(value)) {
        if (k === "name" || k === "message" || k === "stack") continue;
        e[k] = SENSITIVE_KEYS.has(k.toLowerCase())
          ? "[REDACTED]"
          : redactInner(v, ancestors, depth + 1);
      }
      return e;
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase())
        ? "[REDACTED]"
        : redactInner(v, ancestors, depth + 1);
    }
    return out;
  } finally {
    // Pop the current node so sibling branches sharing a reference are not
    // misclassified as cycles.
    ancestors.delete(value as object);
  }
}

export function redact<T>(value: T): T {
  return redactInner(value, new Set<object>(), 0) as T;
}

/**
 * Redact headers that contain credentials.
 */
export function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const SENSITIVE = new Set(["authorization","cookie","set-cookie","x-api-key","x-auth-token","proxy-authorization"]);
  for (const [k,v] of Object.entries(headers)) {
    out[k] = SENSITIVE.has(k.toLowerCase()) ? "[REDACTED]" : (typeof v === "string" ? redactString(v) : v);
  }
  return out;
}

/** Express middleware that redacts PII from request/response going into logs */
export function piiRedactionMiddleware(_req: unknown, _res: unknown, next: () => void) {
  // Serializer is installed at pino config time. This is a hook for future
  // body redaction on specific sensitive routes; currently no body is logged
  // by default (pino serializers exclude body), so this is a no-op placeholder
  // that keeps the middleware interface consistent.
  next();
}
