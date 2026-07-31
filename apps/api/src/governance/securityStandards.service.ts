/**
 * SecurityStandardsService — Slice 198.
 *
 * Baseline security controls checklist derived from OWASP ASVS L2 and WINDELS
 * constitution. Provides current posture (implemented/partial/missing per
 * control), an aggregate security score 0..100, and CRUD for custom controls.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { SecurityStandard, SecurityControlStatus, SecurityPosture } from "@windels/shared/governance";

const KEY = "gov:security:standards";

type SeedControl = Omit<SecurityStandard, "id">;

const SEED: SeedControl[] = [
  // auth
  { control: "AUTH-01: Passwords hashed with bcrypt/argon2", category: "auth", status: "implemented", description: "Passwords never stored in plaintext; argon2/bcrypt with appropriate cost factor.", implementation: "hashPassword() in security/passwords.ts" },
  { control: "AUTH-02: JWT with short expiry + refresh", category: "auth", status: "implemented", description: "Access tokens expire in ~15 minutes; refresh rotation supported.", implementation: "jwt.sign with expiresIn, refresh-token service" },
  { control: "AUTH-03: MFA option for admin accounts", category: "auth", status: "partial", description: "Password-only at MVP; TOTP planned for Session 28.", implementation: "TODO" },
  { control: "AUTH-04: Brute-force / rate-limit on auth endpoints", category: "auth", status: "implemented", description: "register/login rate limits plus global apiGlobal 60/min/ip.", implementation: "rateLimit() middleware on auth + global" },
  // encryption
  { control: "ENC-01: TLS 1.3 in transit", category: "encryption", status: "implemented", description: "All API traffic served over HTTPS in production; HSTS header present.", implementation: "Helmet HSTS, prod LB terminates TLS" },
  { control: "ENC-02: AES-256 at rest for sensitive fields", category: "encryption", status: "partial", description: "Credentials/tokens encrypted in Redis; PII stored plaintext in MVP.", implementation: "TODO: encrypt PII fields" },
  // input
  { control: "INPUT-01: Zod validation on all inputs", category: "input", status: "implemented", description: "validate() middleware enforces Zod schemas on body/query/params.", implementation: "middleware/validate.ts" },
  { control: "INPUT-02: SQL injection impossible (parameterized queries via Prisma)", category: "input", status: "implemented", description: "All DB access through Prisma client — no raw SQL concatenation.", implementation: "Prisma client, QA SQLi test" },
  { control: "INPUT-03: XSS protection via React escaping + CSP", category: "input", status: "implemented", description: "React escapes by default; CSP header blocks inline scripts.", implementation: "Helmet CSP" },
  // logging
  { control: "LOG-01: Immutable audit logs for sensitive actions", category: "logging", status: "implemented", description: "Login/permission/export/access events logged via audit.service.", implementation: "services/audit.service.ts" },
  { control: "LOG-02: PII redaction in logs", category: "logging", status: "partial", description: "Tokens are masked; PII fields not yet consistently stripped.", implementation: "TODO: redact emails/phones" },
  // dependency
  { control: "DEP-01: CI dependency audit (npm audit / OSV)", category: "dependency", status: "implemented", description: "pnpm audit runs in CI; Dependabot-style alerts planned.", implementation: "CI step, DependenciesService" },
  { control: "DEP-02: Lockfile committed (pnpm-lock.yaml)", category: "dependency", status: "implemented", description: "Deterministic installs via lockfile.", implementation: "pnpm-lock.yaml in repo" },
  // network
  { control: "NET-01: Helmet security headers (CSP/HSTS/X-Content-Type)", category: "network", status: "implemented", description: "Helmet middleware on all HTTP responses.", implementation: "server.ts → helmet()" },
  { control: "NET-02: CORS restricted to approved origins", category: "network", status: "implemented", description: "cors() configured with allow-list.", implementation: "server.ts cors middleware" },
  // secret
  { control: "SECRET-01: Secrets loaded from env, not committed", category: "secret", status: "implemented", description: ".env files excluded via .gitignore; config validated by Zod env schema.", implementation: "config/env.ts" },
  { control: "SECRET-02: Secret scanning in CI", category: "secret", status: "implemented", description: "gitleaks runs on PRs.", implementation: "CI gitleaks step" },
  // access
  { control: "ACCESS-01: RBAC enforced on all admin routes", category: "access", status: "implemented", description: "authenticate + hasPermission middleware on protected routes.", implementation: "permissions.service.ts, hasPermission guard" },
  { control: "ACCESS-02: Principle of least privilege for service tokens", category: "access", status: "partial", description: "Service tokens currently share admin role; scoped tokens planned.", implementation: "TODO: scoped API keys" },
  // incident
  { control: "INCIDENT-01: On-call + alerting pipeline", category: "incident", status: "partial", description: "Alerting framework exists but no paging integration yet.", implementation: "alerting.service" },
  { control: "INCIDENT-02: Runbook for common incidents", category: "incident", status: "missing", description: "No formal runbooks yet.", implementation: "TODO" },
  // compliance
  { control: "COMP-01: Data export / deletion per GDPR", category: "compliance", status: "implemented", description: "/governance/exports endpoint supports data export.", implementation: "compliance.service.ts" },
  { control: "COMP-02: SOC2-aligned access reviews", category: "compliance", status: "partial", description: "Permission listing exists; scheduled review workflow not yet built.", implementation: "TODO" },
];

async function ensureSeeded() {
  if ((await redis.hlen(KEY)) > 0) return;
  for (const s of SEED) {
    const id = randomUUID();
    await redis.hset(KEY, id, JSON.stringify({ id, ...s }));
  }
}

async function readAll(): Promise<SecurityStandard[]> {
  const raw = await redis.hgetall(KEY);
  return Object.values(raw).map((v) => JSON.parse(v));
}

function score(all: SecurityStandard[]): SecurityPosture {
  const total = all.length;
  const implemented = all.filter((s) => s.status === "implemented").length;
  const partial = all.filter((s) => s.status === "partial").length;
  const missing = all.filter((s) => s.status === "missing").length;
  // 100% for implemented, 50% for partial, 0% for missing.
  const sc = total ? Math.round(((implemented + partial * 0.5) / total) * 100) : 0;
  return { total, implemented, partial, missing, score: sc, lastAuditAt: new Date().toISOString() };
}

export const SecurityStandardsService = {
  async list(): Promise<SecurityStandard[]> { await ensureSeeded(); return (await readAll()).sort((a, b) => a.control.localeCompare(b.control)); },
  async create(input: Omit<SecurityStandard, "id">): Promise<SecurityStandard> {
    await ensureSeeded();
    const s: SecurityStandard = { id: randomUUID(), ...input };
    await redis.hset(KEY, s.id, JSON.stringify(s)); return s;
  },
  async updateStatus(id: string, status: SecurityControlStatus, implementation?: string): Promise<SecurityStandard | null> {
    const cur = await redis.hget(KEY, id); if (!cur) return null;
    const next = { ...JSON.parse(cur) as SecurityStandard, status, ...(implementation ? { implementation } : {}), id };
    await redis.hset(KEY, id, JSON.stringify(next)); return next;
  },
  async remove(id: string): Promise<boolean> { return (await redis.hdel(KEY, id)) > 0; },
  async posture(): Promise<SecurityPosture> { return score(await this.list()); },
};
