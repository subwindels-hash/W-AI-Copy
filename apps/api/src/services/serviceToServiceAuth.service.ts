/**
 * Service-to-Service Authentication Service (Module 24 — Gap 2)
 *
 * Service-to-service authentication:
 * - JWT token generation and validation
 * - Service identity verification
 * - mTLS certificate validation
 * - Token refresh and rotation
 * - Service-to-service authorization
 * - Zero-trust networking principles
 *
 * Provides secure service-to-service communication.
 */
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";
import { redisCmd } from "../db/redis.js";
import { createHash, randomBytes } from "crypto";
import jwt from "jsonwebtoken";

// ─── Types ──────────────────────────────────────────────────────

export interface ServiceToken {
  token: string;
  serviceId: string;
  instanceId: string;
  issuedAt: string;
  expiresAt: string;
  scopes: string[];
}

export interface ServiceTokenPayload {
  serviceId: string;
  instanceId: string;
  scopes: string[];
  iat: number;
  exp: number;
}

export interface ServiceAuthConfig {
  jwtSecret: string;
  tokenTTLSeconds: number;
  allowedServices: string[];
  requireMutualTLS: boolean;
}

export interface ServiceAuthResult {
  authenticated: boolean;
  serviceId?: string;
  instanceId?: string;
  scopes?: string[];
  error?: string;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const SERVICE_TOKEN_KEY = (tokenHash: string) => `s2s:token:${tokenHash}`;
const SERVICE_TOKENS_KEY = (serviceId: string) => `s2s:tokens:${serviceId}`;
const SERVICE_AUTH_STATS_KEY = "s2s:auth:stats";

// ─── Default Configuration ──────────────────────────────────────

const DEFAULT_CONFIG: ServiceAuthConfig = {
  jwtSecret: process.env.S2S_JWT_SECRET || "default-s2s-secret-change-in-production",
  tokenTTLSeconds: 3600, // 1 hour
  allowedServices: [], // Empty = allow all
  requireMutualTLS: false,
};

// ─── Token Generation ───────────────────────────────────────────

/**
 * Generate service-to-service JWT token
 */
export async function generateServiceToken(
  serviceId: string,
  instanceId: string,
  scopes: string[] = [],
  config?: Partial<ServiceAuthConfig>,
): Promise<ServiceToken> {
  const authConfig = { ...DEFAULT_CONFIG, ...config };

  const now = Math.floor(Date.now() / 1000);
  const payload: ServiceTokenPayload = {
    serviceId,
    instanceId,
    scopes,
    iat: now,
    exp: now + authConfig.tokenTTLSeconds,
  };

  const token = jwt.sign(payload, authConfig.jwtSecret, {
    algorithm: "HS256",
  });

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const serviceToken: ServiceToken = {
    token,
    serviceId,
    instanceId,
    issuedAt: new Date(now * 1000).toISOString(),
    expiresAt: new Date((now + authConfig.tokenTTLSeconds) * 1000).toISOString(),
    scopes,
  };

  // Store token hash for revocation
  const tokenKey = SERVICE_TOKEN_KEY(tokenHash);
  await redisCmd.set(
    tokenKey,
    JSON.stringify({
      serviceId,
      instanceId,
      issuedAt: serviceToken.issuedAt,
      expiresAt: serviceToken.expiresAt,
    }),
    "EX",
    authConfig.tokenTTLSeconds,
  );

  // Track token by service
  const serviceTokensKey = SERVICE_TOKENS_KEY(serviceId);
  await redisCmd.sadd(serviceTokensKey, tokenHash);
  await redisCmd.expire(serviceTokensKey, authConfig.tokenTTLSeconds * 2);

  logger.info("Service token generated", { serviceId, instanceId, scopes });

  Metrics.increment("s2s.tokens.generated", 1, { serviceId });

  return serviceToken;
}

/**
 * Validate service-to-service JWT token
 */
export async function validateServiceToken(
  token: string,
  config?: Partial<ServiceAuthConfig>,
): Promise<ServiceAuthResult> {
  const authConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    // Verify JWT signature and expiration
    const payload = jwt.verify(token, authConfig.jwtSecret, {
      algorithms: ["HS256"],
    }) as ServiceTokenPayload;

    // Check if token is revoked
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const tokenKey = SERVICE_TOKEN_KEY(tokenHash);
    const tokenData = await redisCmd.get(tokenKey);

    if (!tokenData) {
      logger.warn("Service token not found or revoked", { serviceId: payload.serviceId });
      Metrics.increment("s2s.tokens.revoked", 1, { serviceId: payload.serviceId });
      return {
        authenticated: false,
        error: "Token revoked or expired",
      };
    }

    // Check if service is allowed
    if (authConfig.allowedServices.length > 0 && !authConfig.allowedServices.includes(payload.serviceId)) {
      logger.warn("Service not allowed", { serviceId: payload.serviceId });
      Metrics.increment("s2s.tokens.not_allowed", 1, { serviceId: payload.serviceId });
      return {
        authenticated: false,
        error: `Service not allowed: ${payload.serviceId}`,
      };
    }

    logger.debug("Service token validated", {
      serviceId: payload.serviceId,
      instanceId: payload.instanceId,
      scopes: payload.scopes,
    });

    Metrics.increment("s2s.tokens.validated", 1, { serviceId: payload.serviceId });

    return {
      authenticated: true,
      serviceId: payload.serviceId,
      instanceId: payload.instanceId,
      scopes: payload.scopes,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Invalid token";
    logger.warn("Service token validation failed", { error: errorMessage });
    Metrics.increment("s2s.tokens.invalid", 1);

    return {
      authenticated: false,
      error: errorMessage,
    };
  }
}

/**
 * Revoke service token
 */
export async function revokeServiceToken(token: string): Promise<void> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const tokenKey = SERVICE_TOKEN_KEY(tokenHash);

  await redisCmd.del(tokenKey);

  logger.info("Service token revoked");

  Metrics.increment("s2s.tokens.revoked", 1);
}

/**
 * Revoke all tokens for a service
 */
export async function revokeAllServiceTokens(serviceId: string): Promise<number> {
  const serviceTokensKey = SERVICE_TOKENS_KEY(serviceId);
  const tokenHashes = await redisCmd.smembers(serviceTokensKey);

  let revokedCount = 0;
  for (const tokenHash of tokenHashes) {
    const tokenKey = SERVICE_TOKEN_KEY(tokenHash);
    await redisCmd.del(tokenKey);
    revokedCount++;
  }

  await redisCmd.del(serviceTokensKey);

  logger.info("All service tokens revoked", { serviceId, count: revokedCount });

  Metrics.increment("s2s.tokens.revoked", revokedCount, { serviceId });

  return revokedCount;
}

/**
 * Refresh service token
 */
export async function refreshServiceToken(
  oldToken: string,
  config?: Partial<ServiceAuthConfig>,
): Promise<ServiceToken | null> {
  const authResult = await validateServiceToken(oldToken, config);

  if (!authResult.authenticated) {
    return null;
  }

  // Revoke old token
  await revokeServiceToken(oldToken);

  // Generate new token
  return await generateServiceToken(
    authResult.serviceId!,
    authResult.instanceId!,
    authResult.scopes,
    config,
  );
}

// ─── Service Authorization ──────────────────────────────────────

/**
 * Check if service has required scope
 */
export function hasScope(authResult: ServiceAuthResult, requiredScope: string): boolean {
  if (!authResult.authenticated || !authResult.scopes) {
    return false;
  }

  // Check for wildcard scope
  if (authResult.scopes.includes("*")) {
    return true;
  }

  // Check for specific scope
  return authResult.scopes.includes(requiredScope);
}

/**
 * Check if service can access target service
 */
export async function canAccessService(
  sourceServiceId: string,
  targetServiceId: string,
  authResult: ServiceAuthResult,
): Promise<boolean> {
  if (!authResult.authenticated) {
    return false;
  }

  // Check if source service is authenticated
  if (authResult.serviceId !== sourceServiceId) {
    logger.warn("Service ID mismatch", {
      expected: sourceServiceId,
      actual: authResult.serviceId,
    });
    return false;
  }

  // Check if source has scope to access target
  const requiredScope = `service:${targetServiceId}`;
  const hasAccess = hasScope(authResult, requiredScope) || hasScope(authResult, "service:*");

  if (!hasAccess) {
    logger.warn("Service access denied", {
      sourceServiceId,
      targetServiceId,
      scopes: authResult.scopes,
    });
  }

  return hasAccess;
}

// ─── mTLS Support ───────────────────────────────────────────────

/**
 * Validate an mTLS client certificate (PEM).
 *
 * Performs real validation with Node's X509Certificate parser:
 *   1. the certificate must be parseable PEM;
 *   2. it must be valid at the current time;
 *   3. when `S2S_MTLS_CA_CERT` is configured, the client cert must be issued by
 *      that CA (chain check via `checkIssued`);
 *   4. when `S2S_MTLS_EXPECTED_CN` is configured, the certificate's subject
 *      common name must match (a concrete service-identity binding).
 *
 * The certificate's subject CN is used as the authenticated `serviceId`.
 */
export async function validateMutualTLS(
  clientCert: string,
  config?: Partial<ServiceAuthConfig>,
): Promise<ServiceAuthResult> {
  const authConfig = { ...DEFAULT_CONFIG, ...config };

  if (!authConfig.requireMutualTLS) {
    return { authenticated: false, error: "mTLS not required" };
  }
  if (!clientCert || !clientCert.trim()) {
    return { authenticated: false, error: "No client certificate provided" };
  }

  let cert: import("node:crypto").X509Certificate;
  try {
    cert = new (await import("node:crypto")).X509Certificate(clientCert);
  } catch (e: any) {
    return { authenticated: false, error: `Invalid client certificate: ${e?.message ?? "parse failed"}` };
  }

  // 2. Validity window (handles both clock skew guards and expired certs).
  const now = Date.now();
  const validFrom = new Date(cert.validFrom).getTime();
  const validTo = new Date(cert.validTo).getTime();
  if (now < validFrom) {
    return { authenticated: false, error: "Client certificate is not yet valid" };
  }
  if (now > validTo) {
    return { authenticated: false, error: "Client certificate has expired" };
  }

  // 3. CA chain check when a trusted CA is configured.
  const caPem = process.env.S2S_MTLS_CA_CERT;
  if (caPem) {
    try {
      const ca = new (await import("node:crypto")).X509Certificate(caPem);
      if (!cert.checkIssued(ca)) {
        return { authenticated: false, error: "Client certificate was not issued by the trusted CA" };
      }
    } catch {
      return { authenticated: false, error: "Configured CA certificate is invalid" };
    }
  }

  // 4. Expected service identity (subject CN) when configured.
  const cn = extractCommonName(cert.subject);
  const expected = process.env.S2S_MTLS_EXPECTED_CN;
  if (expected && cn !== expected) {
    return { authenticated: false, error: `Client certificate subject does not match expected service (${expected})` };
  }
  if (!cn) {
    return { authenticated: false, error: "Client certificate has no subject common name" };
  }

  logger.info("mTLS client authenticated", { serviceId: cn });
  Metrics.increment("s2s.mtls.authenticated", 1, { serviceId: cn });
  return { authenticated: true, serviceId: cn, scopes: [`service:${cn}`] };
}

/** Extract the Common Name (CN=...) from an RFC4514 subject string. */
function extractCommonName(subject: string): string {
  // subject format: "CN=svc, OU=..., O=..."
  const m = subject.match(/(?:^|,)\s*CN=([^,]+)/);
  return m ? m[1]!.trim() : "";
}

// ─── Express Middleware ─────────────────────────────────────────

/**
 * Express middleware for service-to-service authentication
 */
export function serviceAuthMiddleware(config?: Partial<ServiceAuthConfig>) {
  return async (req: any, res: any, next: any) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Missing or invalid Authorization header",
          },
        });
      }

      const token = authHeader.slice(7);

      // Validate token
      const authResult = await validateServiceToken(token, config);

      if (!authResult.authenticated) {
        return res.status(401).json({
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: authResult.error || "Invalid service token",
          },
        });
      }

      // Attach auth result to request
      req.serviceAuth = authResult;

      next();
    } catch (error) {
      logger.error("Service auth middleware error", { error: (error as Error).message });
      next(error);
    }
  };
}

/**
 * Express middleware for service authorization
 */
export function serviceAuthzMiddleware(requiredScope: string) {
  return async (req: any, res: any, next: any) => {
    const authResult: ServiceAuthResult | undefined = req.serviceAuth;

    if (!authResult || !authResult.authenticated) {
      return res.status(401).json({
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Service not authenticated",
        },
      });
    }

    if (!hasScope(authResult, requiredScope)) {
      return res.status(403).json({
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: `Missing required scope: ${requiredScope}`,
        },
      });
    }

    next();
  };
}

// ─── Service Client ─────────────────────────────────────────────

/**
 * Service client for making authenticated service-to-service requests
 */
export class ServiceClient {
  private serviceId: string;
  private instanceId: string;
  private token: string | null = null;
  private config: ServiceAuthConfig;

  constructor(serviceId: string, instanceId: string, config?: Partial<ServiceAuthConfig>) {
    this.serviceId = serviceId;
    this.instanceId = instanceId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get or generate service token
   */
  async getToken(scopes: string[] = []): Promise<string> {
    if (!this.token) {
      const serviceToken = await generateServiceToken(
        this.serviceId,
        this.instanceId,
        scopes,
        this.config,
      );
      this.token = serviceToken.token;
    }

    return this.token;
  }

  /**
   * Refresh token
   */
  async refreshToken(): Promise<void> {
    if (this.token) {
      const newToken = await refreshServiceToken(this.token, this.config);
      if (newToken) {
        this.token = newToken.token;
      } else {
        this.token = null;
      }
    }
  }

  /**
   * Make authenticated request to another service
   */
  async request(
    targetServiceId: string,
    targetBaseUrl: string,
    path: string,
    options: {
      method?: string;
      body?: any;
      scopes?: string[];
    } = {},
  ): Promise<any> {
    const { method = "GET", body, scopes = [`service:${targetServiceId}`] } = options;

    const token = await this.getToken(scopes);

    const url = `${targetBaseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    logger.debug("Making service-to-service request", {
      sourceServiceId: this.serviceId,
      targetServiceId,
      path,
      method,
    });

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(`Service request failed: ${response.status} - ${JSON.stringify(error)}`);
    }

    return await response.json();
  }
}

// ─── Statistics ─────────────────────────────────────────────────

/**
 * Get service-to-service authentication statistics
 */
export async function getServiceAuthStats(): Promise<{
  tokensGenerated: number;
  tokensValidated: number;
  tokensInvalid: number;
  tokensRevoked: number;
  byService: Record<string, number>;
}> {
  const metrics = Metrics.snapshot();

  const tokensGenerated = metrics.counters["s2s.tokens.generated"]?.total || 0;
  const tokensValidated = metrics.counters["s2s.tokens.validated"]?.total || 0;
  const tokensInvalid = metrics.counters["s2s.tokens.invalid"]?.total || 0;
  const tokensRevoked = metrics.counters["s2s.tokens.revoked"]?.total || 0;

  const byService: Record<string, number> = {};

  // Extract service stats
  if (metrics.counters["s2s.tokens.generated"]?.tags) {
    for (const [tag, count] of Object.entries(metrics.counters["s2s.tokens.generated"].tags)) {
      const match = tag.match(/serviceId=([^,]+)/);
      if (match) {
        byService[match[1]] = count as number;
      }
    }
  }

  return {
    tokensGenerated,
    tokensValidated,
    tokensInvalid,
    tokensRevoked,
    byService,
  };
}
