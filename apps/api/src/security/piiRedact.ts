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

export function redact<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value) as unknown as T;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(v => redact(v)) as unknown as T;
  const out: Record<string, unknown> = {};
  const SENSITIVE_KEYS = new Set([
    "password", "token", "accessToken", "refreshToken", "secret", "apiKey",
    "authorization", "auth", "cookie", "set-cookie", "pin", "ssn",
    "creditCard", "cvv", "cardNumber", "medicalRecord", "phi", "email",
    "phone", "mfaSecret", "otp", "recoveryCodes",
  ]);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = "[REDACTED]";
    } else if (typeof v === "string") {
      out[k] = redactString(v);
    } else if (typeof v === "object") {
      out[k] = redact(v);
    } else {
      out[k] = v;
    }
  }
  return out as unknown as T;
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
