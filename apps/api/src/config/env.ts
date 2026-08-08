import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  API_CORS_ORIGIN: z.string().default("http://localhost:5173"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_ISSUER: z.string().default("windels-ai-os"),
  // Optional shared secret for inbound platform webhooks (HMAC); falls back to
  // JWT_SECRET when unset. Not required — only set when you must isolate webhook
  // credentials from the JWT signing secret.
  WEBHOOK_SECRET: z.string().min(16).optional(),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  BOOTSTRAP_SUPERADMIN_EMAIL: z.string().email().default("admin@windels.ai"),
  BOOTSTRAP_SUPERADMIN_PASSWORD: z.string().min(8).default("ChangeMe!234"),

  SESSION_COOKIE_NAME: z.string().default("windels_sid"),
  SESSION_COOKIE_SECURE: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .default(false),

  // Optional external AI providers (provider registry is vendor-agnostic per §6.4)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  // Generic OpenAI-compatible endpoint (vLLM, llama.cpp, Groq, Together, OpenRouter, etc.)
  OPENAI_COMPAT_BASE_URL: z.string().url().optional(),
  OPENAI_COMPAT_API_KEY: z.string().optional(),
  OPENAI_COMPAT_MODEL: z.string().default("default"),
  // Local Ollama
  OLLAMA_BASE_URL: z.string().url().optional(),
  OLLAMA_MODEL: z.string().default("llama3"),
  // When true, calls fail fast with AI_PROVIDER_CONFIGURATION_REQUIRED instead of
  // using the Echo demo provider. Defaults to true in production, false in dev/test.
  AI_REQUIRE_REAL_MODEL: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .optional(),
  AI_DEFAULT_MODEL: z.string().default("windels-assistant"),
  AI_MAX_CONTEXT_MESSAGES: z.coerce.number().int().min(4).max(200).default(40),

  // Encryption (AES-256-GCM) — 64 hex chars. Falls back to deterministic dev key in NODE_ENV=development.
  WINDELS_ENCRYPTION_KEY: z.string().length(64).optional(),

  /**
   * Opt-in synthetic seed data.
   *
   * Many session bootstraps seed randomly generated demo records (fake service
   * metrics, fake findings, fake ESG figures) so dashboards look populated on a
   * fresh install. That data is indistinguishable from real measurements once
   * rendered, so it is now **off by default**: a fresh organization starts
   * empty and fills from real activity.
   *
   * Set WINDELS_DEMO_DATA=true only for demos and local UI work — never in an
   * environment where anyone might mistake the output for real data.
   */
  WINDELS_DEMO_DATA: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .default(false),

  /**
   * Opt-in in-memory database fallback (dev/test only).
   *
   * When the real Postgres connection cannot be initialised, the API *fails
   * closed* by default — in production a DB failure must abort startup, never
   * silently swap to a demo database. Set WINDELS_ALLOW_MOCK_DB_FALLBACK=true
   * ONLY in a non-production environment where an in-memory stand-in (FakePrisma
   * seeded with demo users/orgs/agents) is acceptable for local work.
   */
  WINDELS_ALLOW_MOCK_DB_FALLBACK: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .default(false),

  // Web Push (VAPID) — for mobile/browser push notifications (Session 15)
  VAPID_PUBLIC_KEY: z.string().min(60).default("BKwIHmBhWdeXUpnNQ_IGQOnQb0jry-q1Fw0jXO_vi9N4BChQmayUVu1ii4UeVaO4jjrV6CV7EyeFSbJWmxe46e4"),
  VAPID_PRIVATE_KEY: z.string().min(20).default("Tg9wSuR5xpNc8wspnQjuurMbNL0uRlnQLtcCzCoRVIo"),
  VAPID_SUBJECT: z.string().default("mailto:push@windels.ai"),

  // ── MetaTrader 5 (MT5) Connector (Session 81 — real broker integration) ──

  /** ZMQ REQ endpoint for the Python MT5 bridge (e.g. tcp://127.0.0.1:5555).
   *  When set, native ZMQ transport is the default for MT5 accounts. */
  WINDELS_MT5_BRIDGE_ZMQ: z.string().max(200).optional(),
  /** HTTP base URL for the Python MT5 bridge (e.g. http://127.0.0.1:8765).
   *  Used when ZMQ is unavailable; takes precedence only if explicitly chosen. */
  WINDELS_MT5_BRIDGE_HTTP: z.string().url().optional(),
  /** Shared secret the HTTP bridge requires (Authorization: Bearer). */
  WINDELS_MT5_BRIDGE_TOKEN: z.string().min(16).optional(),
  /** Path to a MetaTrader 5 terminal executable (Windows/Wine). Used when the
   *  Python bridge is asked to launch/auto-start terminals. */
  WINDELS_MT5_TERMINAL_PATH: z.string().max(400).optional(),
  /** Optional MetaApi cloud token (https://metaapi.cloud) for cloud MT5 access
   *  without a local terminal — usable as an alternative deployment mode. */
  WINDELS_METAAPI_TOKEN: z.string().min(16).optional(),
  /** MetaApi region (new-york, london, singapore, frankfurt, amsterdam, hong-kong). */
  WINDELS_METAAPI_REGION: z.string().default("new-york"),
  /** When true, MT5 accounts refuse order send/modify/cancel even if configured
   *  fully_autonomous — a global kill switch above and beyond risk controls. */
  WINDELS_MT5_GLOBAL_READONLY: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .default(false),

  // ── MetaTrader 4 (MT4) Connector (Session 136 — MT4 parity with MT5) ──
  WINDELS_MT4_BRIDGE_ZMQ: z.string().max(200).optional(),
  WINDELS_MT4_BRIDGE_HTTP: z.string().url().optional(),
  WINDELS_MT4_BRIDGE_TOKEN: z.string().min(16).optional(),
  WINDELS_MT4_TERMINAL_PATH: z.string().max(400).optional(),
  WINDELS_MT4_METAAPI_TOKEN: z.string().min(16).optional(),
  WINDELS_MT4_GLOBAL_READONLY: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .default(false),

  // ── Crypto Exchange connectors (Crypto vertical, Phase 1) ──

  /** Global kill-switch for crypto: when true, all crypto connectors refuse
   *  order send/modify/close across all exchanges. */
  WINDELS_CRYPTO_GLOBAL_READONLY: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .default(false),
  /** When true, new crypto accounts default to testnet endpoints where available. */
  WINDELS_CRYPTO_DEFAULT_TESTNET: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .default(false),
  /** Per-request REST timeout for crypto HTTP clients. */
  WINDELS_CRYPTO_HTTP_TIMEOUT_MS: z.preprocess(
    (v) => {
      if (v === undefined || v === "" || v === null) return 10000;
      const n = typeof v === "number" ? v : parseInt(String(v), 10);
      return Number.isFinite(n) ? n : 10000;
    },
    z.number().int().min(1000).max(60000).default(10000),
  )
    .default(false),
});

async function loadDotenv() {
  try {
    const dotenv = (await import("dotenv")).default;
    const candidates = [
      path.resolve(process.cwd(), ".env"),
      path.resolve(__dirname, "../../../.env"),
      path.resolve(__dirname, "../../../../.env"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        dotenv.config({ path: c });
        return;
      }
    }
  } catch {
    /* dotenv may be absent */
  }
}
await loadDotenv();

const result = EnvSchema.safeParse(process.env);
if (!result.success) {
  // eslint-disable-next-line no-console
  console.error(
    "❌ Invalid environment variables:",
    result.error.flatten().fieldErrors
  );
  process.exit(1);
}

export const env = result.data;
