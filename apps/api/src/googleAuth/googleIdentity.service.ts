/**
 * Session 114 — Google Identity governance.
 *
 * The OAuth flow in `services/googleAuth.service.ts` is real and stays exactly
 * as it was: authorization-code exchange, ID-token verification against
 * Google's published JWKS, account linking or provisioning, platform JWT. What
 * this service adds is everything an operator needs *around* that flow, none of
 * which existed:
 *
 *   - **A policy.** An organization can say who may use Google to sign in:
 *     anyone (`open`, the default and the historical behaviour), only listed
 *     email domains (`domain_allowlist`), only accounts an administrator has
 *     already linked (`linked_only`), or nobody (`disabled`).
 *   - **A register of linked identities.** Who signs in with Google, from which
 *     domain, when they last did, and whether the platform account itself was
 *     created by Google. An identity can be revoked, restored, or unlinked.
 *   - **A ledger.** Every recorded sign-in, provisioning, refusal and
 *     administrative action, with the reason the code actually used.
 *   - **A configuration report.** Which environment variables are set and
 *     whether the redirect URI is well-formed — read from this process only.
 *
 * WHAT THIS SERVICE REFUSES TO CLAIM
 * ----------------------------------
 *   - The configuration report makes no network call. It reports "configured",
 *     never "working"; only a real sign-in proves Google accepts the values.
 *   - Counts describe events recorded since the ledger was introduced. Nothing
 *     is back-filled or estimated, and the ledger says so in its own payload.
 *   - `recordedSignIns` on an identity is a durable counter incremented on each
 *     recorded sign-in; the ledger itself is trimmed to the most recent
 *     GOOGLE_EVENT_LIMIT entries, so the two can legitimately disagree and both
 *     numbers are reported rather than reconciled behind the operator's back.
 *   - Google's `sub` is stored only as a truncated SHA-256 fingerprint.
 *   - A policy can only gate a sign-in that resolves to an existing member of
 *     the organization. A brand-new Google account provisions its own
 *     workspace and belongs to no organization at decision time; that is stated
 *     in the payload rather than papered over.
 *
 * Keys (organization-scoped, audited by the Session 89 namespace sweep):
 *   gid:policy:i:<org>:current
 *   gid:link:i:<org>:<id>     gid:link:idx:<org>
 *   gid:event:i:<org>:<id>    gid:event:idx:<org>
 */
import { createHash, randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import {
  GOOGLE_AUTHORIZATION_ENDPOINT,
  GOOGLE_AUTH_SCOPES,
  GOOGLE_CONFIG_NOTE,
  GOOGLE_DEFAULT_POLICY_MODE,
  GOOGLE_EVENT_LIMIT,
  GOOGLE_IDENTITY_PRIVACY_NOTE,
  GOOGLE_JWKS_ENDPOINT,
  GOOGLE_LEDGER_NOTE,
  GOOGLE_MAX_IDENTITIES,
  GOOGLE_POLICY_NOTE,
  GOOGLE_PROVISIONING_NOTE,
  GOOGLE_REVOKE_NOTE,
  GOOGLE_SUBJECT_FINGERPRINT_CHARS,
  GOOGLE_TOKEN_ENDPOINT,
  googleEmailDomain,
  maskGoogleClientId,
  type GoogleAuthConfigStatus,
  type GoogleAuthPolicy,
  type GoogleAuthPolicyUpdateInput,
  type GoogleAuthSummary,
  type GoogleConfigCheck,
  type GoogleDomainStat,
  type GoogleEventList,
  type GoogleEventQuery,
  type GoogleIdentityCounts,
  type GoogleIdentityList,
  type GoogleIdentityQuery,
  type GoogleIdentitySelf,
  type GoogleLinkedIdentity,
  type GooglePolicyDecision,
  type GooglePolicyDryRun,
  type GooglePolicyEvaluateInput,
  type GoogleSignInCounts,
  type GoogleSignInEvent,
  type GoogleSignInOutcome,
} from "@windels/shared/googleAuth";

/* ── Constants owned by this file ─────────────────────────────────────── */

/** The callback path this API serves; the redirect URI should end with it. */
export const GOOGLE_EXPECTED_CALLBACK_PATH = "/api/v1/auth/google/callback";
/** Path the browser navigates to in order to begin the flow. */
const GOOGLE_START_PATH = "/api/v1/auth/google";
const DAY_MS = 86_400_000;

/* ── Storage plumbing ─────────────────────────────────────────────────── */

type Entity = "link" | "event";
type IdentityRecord = GoogleLinkedIdentity & { organizationId: string };
/**
 * `seq` is a per-process append counter kept only so that two entries written
 * in the same millisecond come back in the order they were written. It is
 * ordering metadata, not a claim about time, so it is stripped before the
 * record leaves the service.
 */
type EventRecord = GoogleSignInEvent & { organizationId: string; seq: number };
type PolicyRecord = {
  organizationId: string;
  mode: GoogleAuthPolicy["mode"];
  allowedDomains: string[];
  blockRevokedIdentities: boolean;
  note: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

const K = {
  policy: (org: string) => `gid:policy:i:${org}:current`,
  item: (entity: Entity, org: string, id: string) => `gid:${entity}:i:${org}:${id}`,
  index: (entity: Entity, org: string) => `gid:${entity}:idx:${org}`,
};

const parse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
};

/** CSPRNG identifiers — never a counter, a timestamp or Math.random. */
const identityId = () => `gid_${randomUUID()}`;
const eventId = () => `gev_${randomUUID()}`;

/**
 * Google's subject is a stable per-account identifier. Storing it in the clear
 * would put a replayable account handle in an operational datastore for no
 * benefit, so only a truncated digest is kept: enough to tell two accounts
 * apart, useless to anyone who reads the key.
 */
export function subjectFingerprint(sub: string): string {
  return createHash("sha256").update(String(sub)).digest("hex").slice(0, GOOGLE_SUBJECT_FINGERPRINT_CHARS);
}

const strip = <T extends { organizationId: string }>(record: T): Omit<T, "organizationId"> => {
  const { organizationId: _organizationId, ...rest } = record;
  return rest;
};

async function writeItem<T extends { id: string }>(entity: Entity, org: string, value: T, score: number): Promise<void> {
  await redis.hset(K.item(entity, org, value.id), "_doc", JSON.stringify({ ...value, organizationId: org }));
  await redis.zadd(K.index(entity, org), score, value.id);
}

/** Fail-closed read: a record whose stored organization differs is invisible. */
async function readOwned<T extends { organizationId: string }>(entity: Entity, org: string, id: string): Promise<T | null> {
  const value = parse<T>(await redis.hget(K.item(entity, org, id), "_doc"));
  return value && value.organizationId === org ? value : null;
}

async function listOwned<T extends { organizationId: string }>(entity: Entity, org: string): Promise<T[]> {
  const ids = await redis.zrange(K.index(entity, org), 0, -1);
  const out: T[] = [];
  for (const id of ids) {
    const record = await readOwned<T>(entity, org, id);
    if (record) out.push(record);
  }
  return out;
}

async function removeItem(entity: Entity, org: string, id: string): Promise<void> {
  await redis.del(K.item(entity, org, id));
  await redis.zrem(K.index(entity, org), id);
}

/* ── Policy ───────────────────────────────────────────────────────────── */

function defaultPolicy(org: string): GoogleAuthPolicy {
  return {
    organizationId: org,
    mode: GOOGLE_DEFAULT_POLICY_MODE,
    allowedDomains: [],
    blockRevokedIdentities: true,
    note: null,
    isDefault: true,
    updatedAt: null,
    updatedBy: null,
    policyNote: GOOGLE_POLICY_NOTE,
    provisioningNote: GOOGLE_PROVISIONING_NOTE,
  };
}

function policyFrom(record: PolicyRecord): GoogleAuthPolicy {
  return {
    organizationId: record.organizationId,
    mode: record.mode,
    allowedDomains: [...record.allowedDomains],
    blockRevokedIdentities: record.blockRevokedIdentities,
    note: record.note,
    isDefault: false,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
    policyNote: GOOGLE_POLICY_NOTE,
    provisioningNote: GOOGLE_PROVISIONING_NOTE,
  };
}

async function loadPolicy(org: string): Promise<GoogleAuthPolicy> {
  const record = parse<PolicyRecord>(await redis.hget(K.policy(org), "_doc"));
  if (!record || record.organizationId !== org) return defaultPolicy(org);
  return policyFrom(record);
}

/* ── Configuration report (environment only, no network) ──────────────── */

function buildConfigStatus(): GoogleAuthConfigStatus {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || null;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || null;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() || null;

  const checks: GoogleConfigCheck[] = [];
  checks.push({
    id: "client_id",
    label: "GOOGLE_CLIENT_ID",
    status: clientId ? "pass" : "fail",
    detail: clientId
      ? `Present (${maskGoogleClientId(clientId)}).`
      : "Not set. The authorization endpoint returns 503 until it is.",
  });
  checks.push({
    id: "client_secret",
    label: "GOOGLE_CLIENT_SECRET",
    status: clientSecret ? "pass" : "fail",
    detail: clientSecret
      ? "Present. The value is never read back through the API."
      : "Not set. The authorization-code exchange cannot be performed.",
  });

  let parsedRedirect: URL | null = null;
  if (redirectUri) {
    try { parsedRedirect = new URL(redirectUri); } catch { parsedRedirect = null; }
  }

  if (!redirectUri) {
    checks.push({
      id: "redirect_uri",
      label: "GOOGLE_REDIRECT_URI",
      status: "fail",
      detail: "Not set. Google requires an exact, pre-registered redirect URI.",
    });
  } else if (!parsedRedirect) {
    checks.push({
      id: "redirect_uri",
      label: "GOOGLE_REDIRECT_URI",
      status: "fail",
      detail: `Set to ${redirectUri}, which is not a parseable absolute URL.`,
    });
  } else {
    const isHttps = parsedRedirect.protocol === "https:";
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsedRedirect.hostname);
    checks.push({
      id: "redirect_uri",
      label: "GOOGLE_REDIRECT_URI",
      status: isHttps ? "pass" : isLoopback ? "warn" : "fail",
      detail: isHttps
        ? `Absolute HTTPS URL on ${parsedRedirect.host}.`
        : isLoopback
          ? `Plain HTTP on ${parsedRedirect.host}. Google permits this for loopback development only.`
          : `Plain HTTP on ${parsedRedirect.host}. Google rejects non-loopback HTTP redirect URIs.`,
    });
    const pathMatches = parsedRedirect.pathname.replace(/\/+$/, "") === GOOGLE_EXPECTED_CALLBACK_PATH;
    checks.push({
      id: "redirect_path",
      label: "Redirect path",
      status: pathMatches ? "pass" : "warn",
      detail: pathMatches
        ? `Points at ${GOOGLE_EXPECTED_CALLBACK_PATH}, the callback this API serves.`
        : `Points at ${parsedRedirect.pathname}; this API serves the callback at ${GOOGLE_EXPECTED_CALLBACK_PATH}. That is fine behind a proxy that rewrites the path, and broken otherwise — this check cannot tell which.`,
    });
  }

  const frontEnd = process.env.WEB_ORIGIN?.trim() || process.env.API_CORS_ORIGIN?.trim() || null;
  checks.push({
    id: "web_origin",
    label: "WEB_ORIGIN",
    status: frontEnd ? "pass" : "warn",
    detail: frontEnd
      ? `Post-callback redirects go to ${frontEnd}.`
      : "Not set. The callback falls back to http://localhost:5173, which is a development default.",
  });

  return {
    enabled: Boolean(clientId && clientSecret && redirectUri),
    clientIdPresent: Boolean(clientId),
    clientIdMasked: clientId ? maskGoogleClientId(clientId) : null,
    clientSecretPresent: Boolean(clientSecret),
    redirectUri,
    redirectUriIsHttps: parsedRedirect ? parsedRedirect.protocol === "https:" : null,
    redirectUriHost: parsedRedirect ? parsedRedirect.host : null,
    redirectUriPathMatches: parsedRedirect
      ? parsedRedirect.pathname.replace(/\/+$/, "") === GOOGLE_EXPECTED_CALLBACK_PATH
      : null,
    expectedCallbackPath: GOOGLE_EXPECTED_CALLBACK_PATH,
    scopes: [...GOOGLE_AUTH_SCOPES],
    authorizationEndpoint: GOOGLE_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
    jwksEndpoint: GOOGLE_JWKS_ENDPOINT,
    checks,
    ready: checks.every((c) => c.status === "pass"),
    checkedAt: new Date().toISOString(),
    note: GOOGLE_CONFIG_NOTE,
  };
}

/* ── Ledger ───────────────────────────────────────────────────────────── */

let appendCounter = 0;

async function appendEvent(
  org: string,
  entry: Omit<GoogleSignInEvent, "id" | "at">,
  atMs = Date.now(),
): Promise<GoogleSignInEvent> {
  const event = {
    id: eventId(),
    at: new Date(atMs).toISOString(),
    seq: ++appendCounter,
    ...entry,
  };
  await writeItem("event", org, event, atMs);
  await trimLedger(org);
  return stripEvent({ ...event, organizationId: org });
}

/** Keep the most recent GOOGLE_EVENT_LIMIT entries; drop the oldest by score. */
async function trimLedger(org: string): Promise<void> {
  const key = K.index("event", org);
  const size = await redis.zcard(key);
  const excess = size - GOOGLE_EVENT_LIMIT;
  if (excess <= 0) return;
  const oldest = await redis.zrange(key, 0, excess - 1);
  for (const id of oldest) await removeItem("event", org, id);
}

/** Newest first; ties within one millisecond fall back to write order. */
function sortEventsDesc(events: EventRecord[]): EventRecord[] {
  return [...events].sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? 1 : -1;
    const aSeq = a.seq ?? 0;
    const bSeq = b.seq ?? 0;
    if (aSeq !== bSeq) return bSeq - aSeq;
    return a.id.localeCompare(b.id);
  });
}

/** Drop the storage-only fields before a ledger entry leaves the service. */
function stripEvent(record: EventRecord): GoogleSignInEvent {
  const { organizationId: _organizationId, seq: _seq, ...rest } = record;
  return rest;
}

/* ── Identity helpers ─────────────────────────────────────────────────── */

function identityFrom(record: IdentityRecord): GoogleLinkedIdentity {
  return strip(record);
}

async function findIdentityByEmail(org: string, email: string): Promise<IdentityRecord | null> {
  const wanted = email.trim().toLowerCase();
  const all = await listOwned<IdentityRecord>("link", org);
  return all.find((i) => i.email === wanted) ?? null;
}

async function findIdentityByUser(org: string, userId: string): Promise<IdentityRecord | null> {
  const all = await listOwned<IdentityRecord>("link", org);
  return all.find((i) => i.userId === userId) ?? null;
}

/* ── Decision engine (pure, given the policy and identity) ────────────── */

function decide(args: {
  policy: GoogleAuthPolicy;
  email: string;
  emailVerified: boolean;
  identity: IdentityRecord | null;
}): GooglePolicyDecision {
  const { policy, email, emailVerified, identity } = args;
  const domain = googleEmailDomain(email);
  const base = {
    mode: policy.mode,
    policyIsDefault: policy.isDefault,
    email,
    emailDomain: domain,
    matchedDomain: null as string | null,
    identityFound: Boolean(identity),
    identityStatus: identity ? identity.status : null,
    evaluatedAt: new Date().toISOString(),
  };
  const refuse = (outcome: GoogleSignInOutcome, reason: string, extra: Partial<GooglePolicyDecision> = {}): GooglePolicyDecision =>
    ({ ...base, ...extra, allowed: false, outcome, reason });

  // Google's own assertion comes first: an unverified address is refused by the
  // OAuth service regardless of policy, and the ledger should say the same.
  if (!emailVerified) {
    return refuse("blocked_unverified_email", "Google did not assert email_verified for this address.");
  }

  if (policy.blockRevokedIdentities && identity?.status === "revoked") {
    return refuse(
      "blocked_revoked",
      identity.revokeReason
        ? `The linked Google identity was revoked on ${identity.revokedAt}: ${identity.revokeReason}`
        : `The linked Google identity was revoked on ${identity.revokedAt}.`,
    );
  }

  switch (policy.mode) {
    case "disabled":
      return refuse("blocked_disabled", "Google sign-in is disabled for this organization.");
    case "domain_allowlist": {
      if (!domain) return refuse("blocked_domain", "The address has no domain part to match against the allowlist.");
      const matched = policy.allowedDomains.find((d) => d === domain) ?? null;
      if (!matched) {
        return refuse(
          "blocked_domain",
          `Domain ${domain} is not on this organization's allowlist (${policy.allowedDomains.join(", ") || "empty"}).`,
        );
      }
      return { ...base, matchedDomain: matched, allowed: true, outcome: "allowed", reason: `Domain ${domain} is on the allowlist.` };
    }
    case "linked_only": {
      if (!identity) {
        return refuse(
          "blocked_not_linked",
          "This organization only accepts Google accounts an administrator has already linked, and no identity exists for this address.",
        );
      }
      return { ...base, allowed: true, outcome: "allowed", reason: "An active linked Google identity exists for this address." };
    }
    case "open":
    default:
      return {
        ...base,
        allowed: true,
        outcome: "allowed",
        reason: policy.isDefault
          ? "No policy is stored for this organization; the platform default allows any member to sign in with Google."
          : "The organization's policy allows any member to sign in with Google.",
      };
  }
}

/* ── Service ──────────────────────────────────────────────────────────── */

export const GoogleIdentityService = {
  /* -- configuration ------------------------------------------------- */

  /** Environment-only readiness report. Performs no network call. */
  config(): GoogleAuthConfigStatus {
    return buildConfigStatus();
  },

  /* -- policy --------------------------------------------------------- */

  async getPolicy(org: string): Promise<GoogleAuthPolicy> {
    return loadPolicy(org);
  },

  async updatePolicy(org: string, input: GoogleAuthPolicyUpdateInput, actorId: string | null): Promise<GoogleAuthPolicy> {
    const previous = await loadPolicy(org);
    const domains = [...new Set(input.allowedDomains.map((d) => d.trim().toLowerCase()).filter(Boolean))].sort();
    const record: PolicyRecord = {
      organizationId: org,
      mode: input.mode,
      allowedDomains: domains,
      blockRevokedIdentities: input.blockRevokedIdentities,
      note: input.note?.trim() ? input.note.trim() : null,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
    };
    await redis.hset(K.policy(org), "_doc", JSON.stringify(record));
    await appendEvent(org, {
      kind: "policy_update",
      outcome: null,
      email: null,
      emailDomain: null,
      userId: null,
      identityId: null,
      actorId,
      reason: `Google sign-in policy set to ${record.mode}${
        record.mode === "domain_allowlist" ? ` for ${domains.join(", ")}` : ""
      } (previously ${previous.isDefault ? "platform default open" : previous.mode}).`,
    });
    return policyFrom(record);
  },

  /** Delete the stored record so the platform default applies again. */
  async resetPolicy(org: string, actorId: string | null): Promise<GoogleAuthPolicy> {
    const previous = await loadPolicy(org);
    if (previous.isDefault) {
      throw AppError.notFound("No Google sign-in policy is stored for this organization; the platform default is already in force.");
    }
    await redis.del(K.policy(org));
    await appendEvent(org, {
      kind: "policy_reset",
      outcome: null,
      email: null,
      emailDomain: null,
      userId: null,
      identityId: null,
      actorId,
      reason: `Google sign-in policy reset from ${previous.mode} to the platform default (open).`,
    });
    return defaultPolicy(org);
  },

  /**
   * Evaluate the policy for an address without signing anyone in. Nothing is
   * written: the result is labelled `applied: false` so a UI cannot present it
   * as an event that happened.
   */
  async evaluate(org: string, input: GooglePolicyEvaluateInput): Promise<GooglePolicyDryRun> {
    const email = input.email.trim().toLowerCase();
    const policy = await loadPolicy(org);
    const identity = await findIdentityByEmail(org, email);
    const decision = decide({ policy, email, emailVerified: input.emailVerified, identity });
    return {
      ...decision,
      applied: false,
      note: "Policy evaluation only. No sign-in was attempted, no session was issued and no ledger entry was written.",
    };
  },

  /* -- identities ------------------------------------------------------ */

  async listIdentities(org: string, query: GoogleIdentityQuery): Promise<GoogleIdentityList> {
    const all = await listOwned<IdentityRecord>("link", org);
    const needle = query.q?.toLowerCase() ?? null;
    const filtered = all.filter((i) => {
      if (query.status && i.status !== query.status) return false;
      if (query.domain && i.emailDomain !== query.domain) return false;
      if (query.userId && i.userId !== query.userId) return false;
      if (needle) {
        const hay = `${i.email} ${i.displayName ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    filtered.sort((a, b) => (a.linkedAt === b.linkedAt ? a.id.localeCompare(b.id) : (a.linkedAt < b.linkedAt ? 1 : -1)));
    return {
      identities: filtered.slice(0, query.limit).map(identityFrom),
      total: filtered.length,
      returned: Math.min(filtered.length, query.limit),
      activeCount: all.filter((i) => i.status === "active").length,
      revokedCount: all.filter((i) => i.status === "revoked").length,
      privacyNote: GOOGLE_IDENTITY_PRIVACY_NOTE,
    };
  },

  async getIdentity(org: string, id: string): Promise<GoogleLinkedIdentity> {
    const record = await readOwned<IdentityRecord>("link", org, id);
    if (!record) throw AppError.notFound("Google identity not found.");
    return identityFrom(record);
  },

  async revokeIdentity(org: string, id: string, actorId: string | null, reason?: string): Promise<GoogleLinkedIdentity> {
    const record = await readOwned<IdentityRecord>("link", org, id);
    if (!record) throw AppError.notFound("Google identity not found.");
    if (record.status === "revoked") throw AppError.conflict("This Google identity is already revoked.");
    const updated: IdentityRecord = {
      ...record,
      status: "revoked",
      revokedAt: new Date().toISOString(),
      revokedBy: actorId,
      revokeReason: reason?.trim() || null,
    };
    await writeItem("link", org, updated, Date.parse(updated.linkedAt));
    await appendEvent(org, {
      kind: "revoke",
      outcome: null,
      email: updated.email,
      emailDomain: updated.emailDomain,
      userId: updated.userId,
      identityId: updated.id,
      actorId,
      reason: reason?.trim()
        ? `Linked Google identity revoked: ${reason.trim()}`
        : "Linked Google identity revoked.",
    });
    return identityFrom(updated);
  },

  async restoreIdentity(org: string, id: string, actorId: string | null): Promise<GoogleLinkedIdentity> {
    const record = await readOwned<IdentityRecord>("link", org, id);
    if (!record) throw AppError.notFound("Google identity not found.");
    if (record.status === "active") throw AppError.conflict("This Google identity is already active.");
    const updated: IdentityRecord = {
      ...record,
      status: "active",
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
    };
    await writeItem("link", org, updated, Date.parse(updated.linkedAt));
    await appendEvent(org, {
      kind: "restore",
      outcome: null,
      email: updated.email,
      emailDomain: updated.emailDomain,
      userId: updated.userId,
      identityId: updated.id,
      actorId,
      reason: "Linked Google identity restored to active.",
    });
    return identityFrom(updated);
  },

  /**
   * Forget the link record. The platform user is untouched — this removes the
   * organization's record of the Google account, not the account itself, and a
   * later Google sign-in would create a fresh record unless the policy refuses.
   */
  async unlinkIdentity(org: string, id: string, actorId: string | null): Promise<{ id: string; unlinked: true; note: string }> {
    const record = await readOwned<IdentityRecord>("link", org, id);
    if (!record) throw AppError.notFound("Google identity not found.");
    await removeItem("link", org, id);
    await appendEvent(org, {
      kind: "unlink",
      outcome: null,
      email: record.email,
      emailDomain: record.emailDomain,
      userId: record.userId,
      identityId: record.id,
      actorId,
      reason: "Linked Google identity removed from this organization's register.",
    });
    return {
      id,
      unlinked: true,
      note: "The platform user, its memberships and its sessions are unchanged. Only this organization's record of the Google link was removed.",
    };
  },

  /* -- ledger ---------------------------------------------------------- */

  async listEvents(org: string, query: GoogleEventQuery): Promise<GoogleEventList> {
    const all = sortEventsDesc(await listOwned<EventRecord>("event", org));
    const sinceMs = query.since ? Date.parse(query.since) : null;
    const filtered = all.filter((e) => {
      if (query.kind && e.kind !== query.kind) return false;
      if (query.outcome && e.outcome !== query.outcome) return false;
      if (query.userId && e.userId !== query.userId) return false;
      if (sinceMs !== null && Date.parse(e.at) < sinceMs) return false;
      return true;
    });
    const oldest = all.length ? all[all.length - 1]!.at : null;
    return {
      events: filtered.slice(0, query.limit).map(stripEvent),
      returned: Math.min(filtered.length, query.limit),
      stored: all.length,
      retentionLimit: GOOGLE_EVENT_LIMIT,
      oldestAt: oldest,
      ledgerNote: GOOGLE_LEDGER_NOTE,
    };
  },

  /* -- rollups --------------------------------------------------------- */

  async domains(org: string): Promise<GoogleDomainStat[]> {
    const all = await listOwned<IdentityRecord>("link", org);
    const byDomain = new Map<string, GoogleDomainStat>();
    for (const identity of all) {
      const stat = byDomain.get(identity.emailDomain) ?? {
        domain: identity.emailDomain,
        identities: 0,
        activeIdentities: 0,
        lastSignInAt: null,
      };
      stat.identities += 1;
      if (identity.status === "active") stat.activeIdentities += 1;
      if (identity.lastSignInAt && (!stat.lastSignInAt || identity.lastSignInAt > stat.lastSignInAt)) {
        stat.lastSignInAt = identity.lastSignInAt;
      }
      byDomain.set(identity.emailDomain, stat);
    }
    return [...byDomain.values()].sort((a, b) =>
      b.identities === a.identities ? a.domain.localeCompare(b.domain) : b.identities - a.identities,
    );
  },

  async summary(org: string): Promise<GoogleAuthSummary> {
    const [policy, identities, events, domains] = await Promise.all([
      loadPolicy(org),
      listOwned<IdentityRecord>("link", org),
      listOwned<EventRecord>("event", org),
      this.domains(org),
    ]);
    const sorted = sortEventsDesc(events);
    const nowMs = Date.now();
    const signInEvents = sorted.filter((e) => e.kind === "sign_in" || e.kind === "provision");
    const within = (e: EventRecord, days: number) => nowMs - Date.parse(e.at) <= days * DAY_MS;

    const identityCounts: GoogleIdentityCounts = {
      total: identities.length,
      active: identities.filter((i) => i.status === "active").length,
      revoked: identities.filter((i) => i.status === "revoked").length,
      provisionedByGoogle: identities.filter((i) => i.provisionedByGoogle).length,
      neverSignedIn: identities.filter((i) => i.lastSignInAt === null).length,
    };
    const signInCounts: GoogleSignInCounts = {
      recorded: signInEvents.length,
      last7d: signInEvents.filter((e) => within(e, 7)).length,
      last30d: signInEvents.filter((e) => within(e, 30)).length,
      blocked30d: sorted.filter((e) => e.kind === "blocked" && within(e, 30)).length,
      lastAt: signInEvents.length ? signInEvents[0]!.at : null,
    };

    return {
      policy,
      config: buildConfigStatus(),
      identities: identityCounts,
      signIns: signInCounts,
      domains,
      ledger: {
        stored: sorted.length,
        retentionLimit: GOOGLE_EVENT_LIMIT,
        oldestAt: sorted.length ? sorted[sorted.length - 1]!.at : null,
      },
      generatedAt: new Date().toISOString(),
      ledgerNote: GOOGLE_LEDGER_NOTE,
      privacyNote: GOOGLE_IDENTITY_PRIVACY_NOTE,
    };
  },

  /* -- self-service ---------------------------------------------------- */

  async self(org: string, userId: string, email: string | null): Promise<GoogleIdentitySelf> {
    const policy = await loadPolicy(org);
    const identity = (await findIdentityByUser(org, userId))
      ?? (email ? await findIdentityByEmail(org, email) : null);
    const config = buildConfigStatus();
    return {
      linked: Boolean(identity),
      identity: identity ? identityFrom(identity) : null,
      signInConfigured: config.enabled,
      policyMode: policy.mode,
      policyIsDefault: policy.isDefault,
      decision: identity
        ? decide({ policy, email: identity.email, emailVerified: true, identity })
        : null,
      startPath: GOOGLE_START_PATH,
      revokeNote: GOOGLE_REVOKE_NOTE,
    };
  },

  /** A user revoking their own link. Same effect as an administrator's revoke. */
  async revokeOwn(org: string, userId: string, email: string | null, reason?: string): Promise<GoogleLinkedIdentity> {
    const identity = (await findIdentityByUser(org, userId))
      ?? (email ? await findIdentityByEmail(org, email) : null);
    if (!identity) throw AppError.notFound("You have no linked Google identity in this organization.");
    return this.revokeIdentity(org, identity.id, userId, reason ?? "Revoked by the account holder.");
  },

  /* -- integration points used by the OAuth callback -------------------- */

  /**
   * Decide whether a resolved sign-in may proceed. Called by the OAuth service
   * once the ID token has been verified *and* the account resolves to a member
   * of `org`. A refusal is written to the ledger before it is returned, so a
   * blocked attempt is visible even though no session exists.
   */
  async authorizeSignIn(args: {
    organizationId: string;
    userId: string | null;
    email: string;
    emailVerified: boolean;
  }): Promise<GooglePolicyDecision> {
    const org = args.organizationId;
    const email = args.email.trim().toLowerCase();
    const policy = await loadPolicy(org);
    const identity = await findIdentityByEmail(org, email);
    const decision = decide({ policy, email, emailVerified: args.emailVerified, identity });
    if (!decision.allowed) {
      await appendEvent(org, {
        kind: "blocked",
        outcome: decision.outcome,
        email,
        emailDomain: decision.emailDomain,
        userId: args.userId,
        identityId: identity?.id ?? null,
        actorId: null,
        reason: decision.reason,
      });
    }
    return decision;
  },

  /**
   * Record a sign-in that actually completed. Creates the identity on first
   * sight and updates it afterwards; the durable per-identity counter is
   * incremented here and nowhere else.
   */
  async recordSignIn(args: {
    organizationId: string;
    userId: string;
    email: string;
    subject: string;
    displayName?: string | null;
    provisioned: boolean;
  }): Promise<GoogleLinkedIdentity> {
    const org = args.organizationId;
    const email = args.email.trim().toLowerCase();
    const domain = googleEmailDomain(email) ?? "";
    const at = new Date().toISOString();
    const existing = (await findIdentityByEmail(org, email)) ?? (await findIdentityByUser(org, args.userId));

    let record: IdentityRecord;
    if (existing) {
      record = {
        ...existing,
        userId: args.userId,
        email,
        emailDomain: domain,
        subjectFingerprint: subjectFingerprint(args.subject),
        displayName: args.displayName ?? existing.displayName,
        lastSignInAt: at,
        recordedSignIns: existing.recordedSignIns + 1,
      };
    } else {
      const all = await listOwned<IdentityRecord>("link", org);
      if (all.length >= GOOGLE_MAX_IDENTITIES) {
        throw AppError.conflict(`This organization already holds the maximum of ${GOOGLE_MAX_IDENTITIES} linked Google identities.`);
      }
      record = {
        id: identityId(),
        organizationId: org,
        userId: args.userId,
        email,
        emailDomain: domain,
        subjectFingerprint: subjectFingerprint(args.subject),
        displayName: args.displayName ?? null,
        status: "active",
        linkedAt: at,
        lastSignInAt: at,
        recordedSignIns: 1,
        provisionedByGoogle: args.provisioned,
        revokedAt: null,
        revokedBy: null,
        revokeReason: null,
      };
    }

    await writeItem("link", org, record, Date.parse(record.linkedAt));
    await appendEvent(org, {
      kind: args.provisioned ? "provision" : "sign_in",
      outcome: "allowed",
      email,
      emailDomain: domain || null,
      userId: args.userId,
      identityId: record.id,
      actorId: null,
      reason: args.provisioned
        ? "Google sign-in created this platform account and its workspace."
        : existing
          ? "Google sign-in matched an existing linked identity."
          : "Google sign-in linked to an existing platform account for the first time.",
    });
    return identityFrom(record);
  },
};

export type GoogleIdentityServiceType = typeof GoogleIdentityService;
