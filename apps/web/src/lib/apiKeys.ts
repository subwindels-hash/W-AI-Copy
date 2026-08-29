/** Session 104 — typed API key management client. */
import { api } from "./api";
import type { AkApiKeyCreated, AkApiKeyMutation, AkApiKeyRow, AkApiKeyCreateInput, AkApiKeyUpdateInput } from "@windels/shared/apiKeys";

export type { AkApiKeyCreated, AkApiKeyMutation, AkApiKeyRow, AkApiKeyCreateInput, AkApiKeyUpdateInput, AkScope } from "@windels/shared/apiKeys";

export const apiKeysApi = {
  list: (includeRevoked = false) => api<AkApiKeyRow[]>("/apikeys", { params: { includeRevoked } }),
  get: (id: string) => api<AkApiKeyRow>(`/apikeys/${id}`),
  create: (input: AkApiKeyCreateInput) => api<AkApiKeyCreated>("/apikeys", { method: "POST", json: input }),
  update: (id: string, patch: AkApiKeyUpdateInput) => api<AkApiKeyMutation>(`/apikeys/${id}`, { method: "PATCH", json: patch }),
  revoke: (id: string) => api<AkApiKeyMutation>(`/apikeys/${id}/revoke`, { method: "POST" }),
  rotate: (id: string, expiresInDays?: number) => api<AkApiKeyCreated>(`/apikeys/${id}/rotate`, { method: "POST", json: { expiresInDays } }),
  remove: (id: string) => api<{ id: string; deleted: true }>(`/apikeys/${id}`, { method: "DELETE" }),
};
