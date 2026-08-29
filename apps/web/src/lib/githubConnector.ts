import { api } from "./api";
import type {
  GithubConnectionPublic,
  GithubConnectorStatus,
  GithubRemoteRepo,
} from "@windels/shared/githubConnector";

export type { GithubConnectionPublic, GithubConnectorStatus, GithubRemoteRepo };

export const githubConnectorApi = {
  status: () => api<GithubConnectorStatus>("/github/status"),
  startOauth: (returnTo?: string) =>
    api<{ url: string; state: string }>("/github/oauth/start", { method: "POST", json: { returnTo } }),
  connectPat: (token: string, label?: string) =>
    api<GithubConnectionPublic>("/github/pat", { method: "POST", json: { token, label } }),
  verify: () => api<GithubConnectionPublic>("/github/verify", { method: "POST" }),
  disconnect: () => api<{ disconnected: boolean }>("/github", { method: "DELETE" }),
  repos: () => api<GithubRemoteRepo[]>("/github/repos"),
};
