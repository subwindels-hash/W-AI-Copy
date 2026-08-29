import { api } from "./api";

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ("READ" | "WRITE" | "ADMIN")[];
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdBy: { id: string; displayName: string };
  createdAt: string;
}

export interface ApiKeyWithSecret extends ApiKey {
  key: string; // plaintext — returned once at creation
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  description?: string | null;
  events: string[];
  active: boolean;
  failureCount: number;
  lastDeliveryAt?: string | null;
  lastStatus?: number | null;
  deliveriesCount: number;
  createdBy: { id: string; displayName: string };
  createdAt: string;
}

export interface WebhookWithSecret extends WebhookEndpoint {
  secret: string;
}

export interface WebhookDelivery {
  id: string; webhookId: string; event: string; status?: number | null;
  responseBody?: string | null; attempts: number; deliveredAt?: string | null;
  nextRetryAt?: string | null; createdAt: string;
}

export const WEBHOOK_EVENTS = [
  "*", "workflow.run.succeeded", "workflow.run.failed", "workflow.run.waiting_approval",
  "task.created", "task.completed", "message.created", "agent.task.completed",
];

export async function listApiKeys() {
  return api<ApiKey[]>("/developers/api-keys", { method: "GET" });
}
export async function createApiKey(input: { name: string; scopes?: ("READ" | "WRITE" | "ADMIN")[]; expiresInDays?: number }) {
  return api<ApiKeyWithSecret>("/developers/api-keys", { method: "POST", json: input });
}
export async function revokeApiKey(id: string) {
  return api<void>(`/developers/api-keys/${id}`, { method: "DELETE" });
}
export async function listWebhooks() {
  return api<WebhookEndpoint[]>("/developers/webhooks", { method: "GET" });
}
export async function createWebhook(input: { url: string; description?: string; events?: string[] }) {
  return api<WebhookWithSecret>("/developers/webhooks", { method: "POST", json: input });
}
export async function updateWebhook(id: string, patch: { url?: string; description?: string; events?: string[]; active?: boolean }) {
  return api<WebhookEndpoint>(`/developers/webhooks/${id}`, { method: "PATCH", json: patch });
}
export async function deleteWebhook(id: string) {
  return api<void>(`/developers/webhooks/${id}`, { method: "DELETE" });
}
export async function listWebhookDeliveries(id: string) {
  return api<WebhookDelivery[]>(`/developers/webhooks/${id}/deliveries`, { method: "GET" });
}
