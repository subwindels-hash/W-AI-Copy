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

  // Web Push (VAPID) — for mobile/browser push notifications (Session 15)
  VAPID_PUBLIC_KEY: z.string().min(60).default("BKwIHmBhWdeXUpnNQ_IGQOnQb0jry-q1Fw0jXO_vi9N4BChQmayUVu1ii4UeVaO4jjrV6CV7EyeFSbJWmxe46e4"),
  VAPID_PRIVATE_KEY: z.string().min(20).default("Tg9wSuR5xpNc8wspnQjuurMbNL0uRlnQLtcCzCoRVIo"),
  VAPID_SUBJECT: z.string().default("mailto:push@windels.ai"),
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
