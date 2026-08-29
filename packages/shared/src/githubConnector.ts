/**
 * User GitHub connector — connect a personal GitHub account to WINDELS.
 *
 * Two honest connect paths:
 *   1. GitHub OAuth App (Client ID + Client Secret + callback URL)
 *   2. Personal Access Token (classic or fine-grained) when OAuth is not set
 *
 * Tokens are encrypted at rest. Public payloads never include the token,
 * client secret, or refresh token — only a masked form.
 */
import { z } from "zod";

export const GITHUB_AUTHORIZATION_ENDPOINT = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
export const GITHUB_API_BASE = "https://api.github.com";

/** Scopes requested by the OAuth App. PAT users should grant at least these. */
export const GITHUB_OAUTH_SCOPES = ["read:user", "user:email", "repo"] as const;

export const GITHUB_REQUIRED_ENV = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_REDIRECT_URI"] as const;

export const GITHUB_CALLBACK_PATH = "/api/v1/github/callback";

export const GITHUB_CONFIG_NOTE =
  "Read from this process environment and Super Admin Site Control. No request is made to GitHub, so a passing check means the values are present — not that GitHub accepts them. Secrets are reported as present or absent and are never returned.";

export const GITHUB_CONNECT_NOTE =
  "Connect with a GitHub OAuth App (Client ID, Client Secret, callback URL) or paste a Personal Access Token. WINDELS verifies the credential against api.github.com before storing it encrypted. A missing credential is reported as not connected — never as a fake account.";

export type GithubConnectionMethod = "oauth" | "pat";
export type GithubConnectionStatus = "connected" | "failed" | "disconnected";

export interface GithubOauthConfigStatus {
  oauthReady: boolean;
  clientIdPresent: boolean;
  clientIdMasked: string | null;
  clientSecretPresent: boolean;
  redirectUri: string;
  expectedCallbackPath: string;
  scopes: string[];
  authorizationEndpoint: string;
  tokenEndpoint: string;
  patConnectAvailable: true;
  ready: boolean;
  checkedAt: string;
  note: string;
  missing: string[];
}

export interface GithubConnectionPublic {
  connected: boolean;
  method: GithubConnectionMethod | null;
  status: GithubConnectionStatus;
  login: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
  organizations: string[];
  scopes: string[];
  tokenMasked: string | null;
  credentialVersion: number;
  connectedAt: string | null;
  updatedAt: string | null;
  lastVerifiedAt: string | null;
}

export interface GithubConnectorStatus {
  config: GithubOauthConfigStatus;
  connection: GithubConnectionPublic;
  connectNote: string;
}

export interface GithubRemoteRepo {
  fullName: string;
  url: string;
  defaultBranch: string;
  updatedAt: string;
}

export const GithubPatConnectSchema = z.object({
  token: z.string().trim().min(8).max(400),
  label: z.string().trim().min(1).max(80).optional(),
});
export type GithubPatConnectInput = z.infer<typeof GithubPatConnectSchema>;

export const GithubOauthStartSchema = z.object({
  returnTo: z.string().trim().max(200).optional(),
});

export function maskGithubClientId(clientId: string): string {
  const trimmed = clientId.trim();
  if (trimmed.length <= 10) return "•".repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}
