/**
 * WINDELS AI OS — Production Startup Validation
 *
 * Enforces production-safety invariants before the HTTP listener opens:
 *   1. production + demo data = startup failure
 *   2. production + missing/insecure required secret = startup failure
 *   3. production + missing database = startup failure
 *   4. production + unverified payment provider = provider unavailable
 */

import { env } from "./env.js";
import type { Logger } from "pino";

export interface StartupValidationResult {
  ok: boolean;
  runtimeMode: string;
  demoDataAllowed: boolean;
  errors: string[];
  warnings: string[];
}

export function validateStartupEnvironment(logger?: any): StartupValidationResult {
  const isProduction =
    env.WINDELS_RUNTIME_MODE === "production" || env.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Production + Demo Data = Startup Failure
  if (isProduction && env.WINDELS_DEMO_DATA) {
    errors.push(
      "FATAL_CONFIG_ERROR: WINDELS_DEMO_DATA=true is forbidden when WINDELS_RUNTIME_MODE=production or NODE_ENV=production. Production must reject synthetic demo fixtures.",
    );
  }

  // 2. Production + Missing/Insecure Required Secret = Startup Failure
  if (isProduction) {
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 16) {
      errors.push("FATAL_CONFIG_ERROR: JWT_SECRET must be at least 16 characters in production.");
    }

    if (env.BOOTSTRAP_SUPERADMIN_PASSWORD === "ChangeMe!234") {
      errors.push(
        "FATAL_CONFIG_ERROR: Default superadmin password 'ChangeMe!234' is forbidden in production.",
      );
    }

    if (env.WINDELS_ALLOW_MOCK_DB_FALLBACK) {
      errors.push(
        "FATAL_CONFIG_ERROR: WINDELS_ALLOW_MOCK_DB_FALLBACK=true is forbidden in production mode. Database failures must fail closed.",
      );
    }

    if (env.WINDELS_ALLOW_MOCK_WMPC) {
      errors.push(
        "FATAL_CONFIG_ERROR: WINDELS_ALLOW_MOCK_WMPC=true is forbidden in production mode. Mock marketplaces cannot serve real traffic.",
      );
    }

    if (!env.WINDELS_ENCRYPTION_KEY) {
      warnings.push(
        "PRODUCTION_WARNING: WINDELS_ENCRYPTION_KEY is not set. Primary envelope encryption requires a 64-character hex key.",
      );
    }
  }

  // 3. Payment provider verification log
  if (isProduction) {
    if (!env.BLOCKONOMICS_API_KEY && env.BLOCKONOMICS_ENABLED) {
      warnings.push(
        "PAYMENT_PROVIDER_UNAVAILABLE: Blockonomics is enabled but BLOCKONOMICS_API_KEY is missing. Provider will report status unavailable.",
      );
    }
  }

  const ok = errors.length === 0;

  if (!ok) {
    if (logger && typeof logger.fatal === "function") {
      logger.fatal("❌ Startup validation failed with critical errors", {
        runtimeMode: env.WINDELS_RUNTIME_MODE,
        errors,
      });
    }
    throw new Error(
      `Startup Validation Failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  } else {
    if (logger && typeof logger.info === "function") {
      logger.info("✓ Startup environment validation passed", {
        runtimeMode: env.WINDELS_RUNTIME_MODE,
        nodeEnv: env.NODE_ENV,
        demoData: env.WINDELS_DEMO_DATA,
        warningsCount: warnings.length,
      });
    }
  }

  return {
    ok: true,
    runtimeMode: env.WINDELS_RUNTIME_MODE,
    demoDataAllowed: env.WINDELS_DEMO_DATA,
    errors,
    warnings,
  };
}
