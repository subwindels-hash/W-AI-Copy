/**
 * WINDELS AI OS — Centralized Environment Validator
 *
 * Validates subsystem environment configurations and health without exposing secrets.
 * Subsystem statuses: CONFIGURED | MISSING | INVALID | UNHEALTHY | DISABLED.
 */

import { env } from "./env.js";

export type SubsystemStatus = "CONFIGURED" | "MISSING" | "INVALID" | "UNHEALTHY" | "DISABLED";

export interface SubsystemReport {
  subsystem: string;
  status: SubsystemStatus;
  configured: boolean;
  message: string;
}

export interface EnvironmentValidationReport {
  timestamp: string;
  runtimeMode: string;
  subsystems: Record<string, SubsystemReport>;
  overallStatus: "HEALTHY" | "DEGRADED" | "CRITICAL";
}

function checkUrl(urlStr: string | undefined): "valid" | "missing" | "invalid" {
  if (!urlStr) return "missing";
  try {
    new URL(urlStr);
    return "valid";
  } catch {
    return "invalid";
  }
}

export function validateEnvironment(): EnvironmentValidationReport {
  const subsystems: Record<string, SubsystemReport> = {};

  // 1. Database
  const dbCheck = checkUrl(env.DATABASE_URL);
  subsystems.database = {
    subsystem: "database",
    status: dbCheck === "valid" ? "CONFIGURED" : dbCheck === "invalid" ? "INVALID" : "MISSING",
    configured: dbCheck === "valid",
    message: dbCheck === "valid" ? "Database URL is configured and valid." : "DATABASE_URL is missing or invalid URL.",
  };

  // 2. Redis
  const redisCheck = checkUrl(env.REDIS_URL);
  subsystems.redis = {
    subsystem: "redis",
    status: redisCheck === "valid" ? "CONFIGURED" : redisCheck === "invalid" ? "INVALID" : "MISSING",
    configured: redisCheck === "valid",
    message: redisCheck === "valid" ? "Redis URL is configured and valid." : "REDIS_URL is missing or invalid URL.",
  };

  // 3. JWT Secrets
  const jwtOk = Boolean(env.JWT_SECRET && env.JWT_SECRET.length >= 16);
  subsystems.jwt = {
    subsystem: "jwt",
    status: jwtOk ? "CONFIGURED" : env.JWT_SECRET ? "INVALID" : "MISSING",
    configured: jwtOk,
    message: jwtOk ? "JWT secret meets security requirements." : "JWT_SECRET is missing or under 16 characters.",
  };

  // 4. Encryption Keys
  const encKey = env.WINDELS_ENCRYPTION_KEY;
  const encOk = Boolean(encKey && /^[0-9a-fA-F]{64}$/.test(encKey));
  subsystems.encryption = {
    subsystem: "encryption",
    status: encOk ? "CONFIGURED" : encKey ? "INVALID" : "MISSING",
    configured: encOk,
    message: encOk ? "AES-256-GCM primary encryption key configured." : "WINDELS_ENCRYPTION_KEY is missing or not a 64-char hex string.",
  };

  // 5. Storage
  const storagePath = env.MODULE_PACKAGE_STORAGE_PATH ?? process.env.ATTACHMENT_STORAGE_DIR ?? process.env.S3_BUCKET;
  subsystems.storage = {
    subsystem: "storage",
    status: storagePath ? "CONFIGURED" : "MISSING",
    configured: Boolean(storagePath),
    message: storagePath ? "Object/file storage location configured." : "No explicit storage path/bucket configured (using default uploads).",
  };

  // 6. Payment Providers (Blockonomics, Stripe)
  const blockonomicsOk = Boolean(env.BLOCKONOMICS_API_KEY && env.BLOCKONOMICS_CALLBACK_SECRET);
  subsystems.paymentProviders = {
    subsystem: "paymentProviders",
    status: !env.BLOCKONOMICS_ENABLED ? "DISABLED" : blockonomicsOk ? "CONFIGURED" : "MISSING",
    configured: blockonomicsOk,
    message: !env.BLOCKONOMICS_ENABLED
      ? "Payment providers disabled."
      : blockonomicsOk
        ? "Payment provider credentials configured."
        : "Payment provider enabled but API key or callback secret missing.",
  };

  // 7. AI Providers
  const hasAiKey = Boolean(
    env.OPENAI_API_KEY ||
      env.ANTHROPIC_API_KEY ||
      env.GEMINI_API_KEY ||
      env.OLLAMA_BASE_URL ||
      env.OPENAI_COMPAT_BASE_URL,
  );
  subsystems.aiProviders = {
    subsystem: "aiProviders",
    status: hasAiKey ? "CONFIGURED" : "MISSING",
    configured: hasAiKey,
    message: hasAiKey ? "At least one real AI provider configured." : "No real AI provider keys set (using Echo demo provider).",
  };

  // 8. OAuth Providers
  const googleOAuth = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  subsystems.oauthProviders = {
    subsystem: "oauthProviders",
    status: googleOAuth ? "CONFIGURED" : "MISSING",
    configured: googleOAuth,
    message: googleOAuth ? "Google OAuth credentials configured." : "No external OAuth provider credentials set.",
  };

  // 9. Messaging Providers (WhatsApp / Telegram)
  const waConfigured = Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
  subsystems.messagingProviders = {
    subsystem: "messagingProviders",
    status: !env.WHATSAPP_ENABLED ? "DISABLED" : waConfigured ? "CONFIGURED" : "MISSING",
    configured: waConfigured,
    message: !env.WHATSAPP_ENABLED
      ? "WhatsApp channel disabled."
      : waConfigured
        ? "WhatsApp channel credentials configured."
        : "WhatsApp enabled but access token/phone number ID missing.",
  };

  // 10. SMTP
  const smtpConfigured = Boolean(env.WINDELS_SMTP_HOST && env.WINDELS_SMTP_PORT);
  subsystems.smtp = {
    subsystem: "smtp",
    status: smtpConfigured ? "CONFIGURED" : "MISSING",
    configured: smtpConfigured,
    message: smtpConfigured ? "Outbound SMTP relay configured." : "WINDELS_SMTP_HOST/PORT missing.",
  };

  // 11. Webhook Secrets
  const webhookSecretOk = Boolean(env.WEBHOOK_SECRET || env.JWT_SECRET);
  subsystems.webhookSecrets = {
    subsystem: "webhookSecrets",
    status: webhookSecretOk ? "CONFIGURED" : "MISSING",
    configured: webhookSecretOk,
    message: webhookSecretOk ? "Webhook signature validation secret present." : "No webhook secret configured.",
  };

  const criticalSubsystems = ["database", "redis", "jwt"];
  const missingCritical = criticalSubsystems.filter((s) => subsystems[s]?.status !== "CONFIGURED");

  let overallStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" = "HEALTHY";
  if (missingCritical.length > 0) {
    overallStatus = "CRITICAL";
  } else if (Object.values(subsystems).some((s) => s.status === "MISSING" || s.status === "INVALID")) {
    overallStatus = "DEGRADED";
  }

  return {
    timestamp: new Date().toISOString(),
    runtimeMode: env.WINDELS_RUNTIME_MODE,
    subsystems,
    overallStatus,
  };
}
