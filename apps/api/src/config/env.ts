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

  // ── WhatsApp Channel (Cloud API) ────────────────────────────────────────
  // WhatsApp is a channel INTO the existing WINDELS AI OS. Credentials are
  // never hardcoded and never committed: they come from the environment or
  // are stored AES-256-GCM encrypted on the channel row. The channel stays
  // off until WHATSAPP_ENABLED is explicitly set to true.
  WHATSAPP_ENABLED: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .default(false),
  WHATSAPP_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v21.0"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_ID: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_WEBHOOK_URL: z.string().url().optional(),

  BOOTSTRAP_SUPERADMIN_EMAIL: z.string().email().default("admin@windels.ai"),
  BOOTSTRAP_SUPERADMIN_PASSWORD: z.string().min(8).default("ChangeMe!234"),

  // ── Contact & Support Center email (Session: contact center) ────────────
  // Support mailbox that contact requests are sent to. Never hardcoded.
  WINDELS_SUPPORT_EMAIL: z.string().email().optional(),
  // SMTP relay for outbound contact emails (system + user confirmation).
  // Reuses the same env relay convention as the Email Intelligence outbox.
  WINDELS_SMTP_HOST: z.string().optional(),
  WINDELS_SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  WINDELS_SMTP_USER: z.string().optional(),
  WINDELS_SMTP_PASS: z.string().optional(),
  WINDELS_SMTP_SECURE: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .default(false),
  WINDELS_MAIL_FROM: z.string().email().default("no-reply@windels.ai"),
  WINDELS_MAIL_FROM_NAME: z.string().default("WINDELS AI OS"),

  // ── Web search tool providers (optional; the tool returns an honest
  // "not configured" result when none are set) ──────────────────────────
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  SERPAPI_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),

  // ── Update package signing (optional) ────────────────────────────────
  // base64 Ed25519 keys. Signer side uses the private key; verifier uses the
  // public key. When neither is set, signature checks are skipped.
  UPDATE_SIGNING_PRIVATE_KEY: z.string().optional(),
  UPDATE_SIGNING_PUBLIC_KEY: z.string().optional(),

  // ── Service-to-service mTLS (optional) ───────────────────────────────
  // PEM of the trusted CA that issues service client certificates, and an
  // optional expected subject CN to bind a specific service identity.
  S2S_MTLS_CA_CERT: z.string().optional(),
  S2S_MTLS_EXPECTED_CN: z.string().optional(),

  // ── Alerting / on-call paging (optional) ─────────────────────────────
  // Generic webhook (e.g. a PagerDuty/Opsgenie-compatible or self-hosted
  // endpoint) that receives high/critical alerts for on-call escalation.
  WINDELS_ALERT_WEBHOOK_URL: z.string().url().optional(),
  // Optional HMAC shared secret used to sign outbound alert webhooks.
  WINDELS_ALERT_WEBHOOK_SECRET: z.string().optional(),
  // When a high/critical alert fires and no webhook is configured, fall back
  // to emailing this address (best-effort via the SMTP relay).
  WINDELS_ALERT_EMAIL: z.string().email().optional(),


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
   * Opt-in permissive constitution checking (S163).
   *
   * `ConstitutionService.checkRequest` is the platform's "may this proceed?"
   * gate. When an organization has published no constitution there is nothing
   * to check against, and the safe answer is to refuse: the gate fails
   * **closed**, returning `allowed: false` with `posture: "unconfigured"` so a
   * caller can tell "reviewed and clean" apart from "not reviewed at all".
   *
   * Set WINDELS_CONSTITUTION_FAIL_OPEN=true to restore the pre-S163 behaviour
   * of allowing unchecked requests through. The check result then carries
   * `posture: "fail_open"`, so a permissive deployment stays visible in the
   * response rather than being inferred from silence.
   */
  WINDELS_CONSTITUTION_FAIL_OPEN: z
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

  // ── WMPC Commerce Connector (AI Commerce Stage 1) ────────────────────────

  /** Base URL of the WMPC commerce API. Required for the real HTTP adapter. */
  WMPC_API_BASE_URL: z.string().url().optional(),
  /** Bearer credential WINDELS presents to WMPC. Never logged. */
  WMPC_API_KEY: z.string().min(16).optional(),
  /** Shared secret used to verify inbound WMPC webhook signatures. */
  WMPC_WEBHOOK_SECRET: z.string().min(16).optional(),
  /** Per-request timeout for WMPC calls, in milliseconds. */
  WMPC_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000),
  /**
   * Opt-in mock WMPC adapter (dev/test only — AI Commerce Stage 1 §32).
   *
   * The connector *fails closed*: with no WMPC credentials configured, commerce
   * operations return WMPC_UNAVAILABLE rather than inventing marketplace data.
   * Setting this to true swaps in a fixture-backed adapter so the AI Commerce
   * stack can be developed and tested before WMPC exists. It is rejected
   * outright when NODE_ENV=production, so a mock marketplace can never serve
   * real customers.
   */
  WINDELS_ALLOW_MOCK_WMPC: z
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

  // ── Robotics MQTT broker (Session 155). Optional. When unset the HTTP
  // ingest connector is the only live path and MQTT reports not_configured.
  // When set, status is configured_not_connected until a broker session exists.
  // Commands stay local_state_only either way — we never claim a dispatch.
  WINDELS_ROBOTICS_MQTT_URL: z.string().optional(),

  // ── Quantum vendor declarations (Session 157). Optional. Setting a token
  // only marks the connector configured_not_connected — never "connected".
  WINDELS_IBM_QUANTUM_TOKEN: z.string().optional(),
  WINDELS_AWS_BRAKET_REGION: z.string().optional(),
  WINDELS_AZURE_QUANTUM_RESOURCE: z.string().optional(),
  WINDELS_GOOGLE_QUANTUM_PROJECT: z.string().optional(),
  WINDELS_DWAVE_TOKEN: z.string().optional(),
  WINDELS_QUANTUM_LOCAL_SIM: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .default(false),

  // ── Super Admin Module & Plugin Deployment Center ───────────────
  WINDELS_PLATFORM_VERSION: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/).default("0.1.0"),
  MODULE_PACKAGE_STORAGE_PATH: z.string().max(500).optional(),
  MODULE_MAX_PACKAGE_MB: z.coerce.number().int().min(1).max(500).default(50),
  MODULE_TRUSTED_PUBLISHER_KEYS: z.string().optional(), // JSON object: key id -> Ed25519 PEM public key
  MODULE_RUNNER_URL: z.string().url().optional(),
  MODULE_RUNNER_HMAC_SECRET: z.string().min(32).optional(),
  MODULE_RUNNER_ARTIFACT_BASE_URL: z.string().url().optional(),
  MODULE_RUNNER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(900000).default(180000),
  MODULE_RUNTIME_ALLOWED_ORIGINS: z.string().optional(),
  MODULE_RUNTIME_TIMEOUT_MS: z.coerce.number().int().min(500).max(120000).default(15000),
  MODULE_RUNTIME_RESPONSE_MAX_BYTES: z.coerce.number().int().min(1024).max(50 * 1024 * 1024).default(5 * 1024 * 1024),
  MODULE_MAX_MEMORY_MB: z.coerce.number().int().min(64).max(32768).default(4096),
  MODULE_MAX_CPU_MILLICORES: z.coerce.number().int().min(100).max(32000).default(4000),

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
