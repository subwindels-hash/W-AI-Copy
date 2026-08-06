/**
 * Session 114 — Google Identity client.
 *
 * Two halves, deliberately separated:
 *
 *   - `googleSignIn` is the pre-authentication surface the login page uses:
 *     whether this deployment has Google OAuth configured, and the path the
 *     browser navigates to in order to start the flow. Starting the flow is a
 *     full-page navigation, not an XHR, because the server issues a redirect
 *     to Google — an `api()` call cannot follow that.
 *   - `googleAuthApi` is the authenticated governance surface: the policy, the
 *     register of linked identities, the ledger and the configuration report.
 *
 * Every type comes from `@windels/shared/googleAuth`, which the API routes also
 * compile against, so a renamed field is a build error rather than a blank
 * field on a security screen.
 */
import { api } from "./api";
import type {
  GoogleAuthConfigStatus,
  GoogleAuthPolicy,
  GoogleAuthPolicyUpdateInput,
  GoogleAuthSummary,
  GoogleDomainStat,
  GoogleEventList,
  GoogleEventQuery,
  GoogleIdentityList,
  GoogleIdentityQuery,
  GoogleIdentitySelf,
  GoogleLinkedIdentity,
  GooglePolicyDryRun,
  GooglePolicyEvaluateInput,
} from "@windels/shared/googleAuth";

export type {
  GoogleAuthConfigStatus,
  GoogleAuthPolicy,
  GoogleAuthPolicyUpdateInput,
  GoogleAuthSummary,
  GoogleCheckStatus,
  GoogleConfigCheck,
  GoogleDomainStat,
  GoogleEventKind,
  GoogleEventList,
  GoogleIdentityCounts,
  GoogleIdentityList,
  GoogleIdentitySelf,
  GoogleIdentityStatus,
  GoogleLinkedIdentity,
  GooglePolicyDecision,
  GooglePolicyDryRun,
  GoogleSignInEvent,
  GoogleSignInMode,
  GoogleSignInOutcome,
} from "@windels/shared/googleAuth";

export {
  GOOGLE_AUTH_SCOPES,
  GOOGLE_EVENT_LIMIT,
  GOOGLE_IDENTITY_PRIVACY_NOTE,
  GOOGLE_MAX_ALLOWED_DOMAINS,
  GOOGLE_POLICY_NOTE,
  GOOGLE_PROVISIONING_NOTE,
  GOOGLE_REVOKE_NOTE,
  GOOGLE_SIGNIN_MODES,
  GOOGLE_SIGNIN_MODE_LABELS,
  googleEmailDomain,
} from "@windels/shared/googleAuth";

/** Pre-authentication surface used by the login and callback pages. */
export const googleSignIn = {
  /** Whether this deployment has Google OAuth credentials configured. */
  status: () => api<{ enabled: boolean }>("/auth/google/status"),
  /**
   * Full-page navigation target. The server responds with a 302 to Google, so
   * this must be a navigation rather than a fetch.
   */
  startUrl: (redirectAfter = "/app") =>
    `/api/v1/auth/google?redirect=${encodeURIComponent(redirectAfter)}`,
};

export const googleAuthApi = {
  summary: () => api<GoogleAuthSummary>("/auth/google/summary"),
  config: () => api<GoogleAuthConfigStatus>("/auth/google/config"),

  policy: () => api<GoogleAuthPolicy>("/auth/google/policy"),
  savePolicy: (input: GoogleAuthPolicyUpdateInput) =>
    api<GoogleAuthPolicy>("/auth/google/policy", { method: "PUT", json: input }),
  resetPolicy: () => api<GoogleAuthPolicy>("/auth/google/policy", { method: "DELETE" }),
  /** Dry run. The response is labelled `applied: false`; nothing is written. */
  evaluate: (input: GooglePolicyEvaluateInput) =>
    api<GooglePolicyDryRun>("/auth/google/policy/evaluate", { method: "POST", json: input }),

  identities: (query?: Partial<GoogleIdentityQuery>) =>
    api<GoogleIdentityList>("/auth/google/identities", { params: query }),
  identity: (id: string) => api<GoogleLinkedIdentity>(`/auth/google/identities/${id}`),
  revoke: (id: string, reason?: string) =>
    api<GoogleLinkedIdentity>(`/auth/google/identities/${id}/revoke`, {
      method: "POST",
      json: reason ? { reason } : {},
    }),
  restore: (id: string) =>
    api<GoogleLinkedIdentity>(`/auth/google/identities/${id}/restore`, { method: "POST" }),
  unlink: (id: string) =>
    api<{ id: string; unlinked: true; note: string }>(`/auth/google/identities/${id}`, { method: "DELETE" }),

  events: (query?: Partial<GoogleEventQuery>) =>
    api<GoogleEventList>("/auth/google/events", { params: query }),
  domains: () => api<GoogleDomainStat[]>("/auth/google/domains"),

  me: () => api<GoogleIdentitySelf>("/auth/google/me"),
  revokeMine: (reason: string) =>
    api<GoogleLinkedIdentity>("/auth/google/me/revoke", { method: "POST", json: { reason } }),
};
