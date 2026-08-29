/**
 * Inbound Webhook Receiver web client (routes/webhook.ts → /api/v1/webhook).
 *
 * Provides typed functions to list inbound webhook inbox entries, inspect
 * payloads, replay webhooks to EventBus, and delete inbox records.
 */
import { api } from "./api";
import type {
  InboundWebhookEntry,
  InboundWebhookQueryInput,
  ReplayWebhookResponse,
  InboundWebhookSource,
  InboundWebhookStatus,
} from "@windels/shared";

export type {
  InboundWebhookEntry,
  InboundWebhookQueryInput,
  ReplayWebhookResponse,
  InboundWebhookSource,
  InboundWebhookStatus,
};

/**
 * List inbound webhook inbox entries for the caller's organization.
 */
export function listInboundWebhooks(params?: Partial<InboundWebhookQueryInput>): Promise<InboundWebhookEntry[]> {
  const q = new URLSearchParams();
  if (params?.source) q.set("source", params.source);
  if (params?.status) q.set("status", params.status);
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString() ? `?${q.toString()}` : "";
  return api<InboundWebhookEntry[]>(`/webhook/inbound${qs}`);
}

/**
 * Get full payload details for a specific inbox entry.
 */
export function getInboundWebhook(id: string): Promise<InboundWebhookEntry> {
  return api<InboundWebhookEntry>(`/webhook/inbound/${encodeURIComponent(id)}`);
}

/**
 * Replay an inbound webhook (re-dispatch to EventBus).
 */
export function replayInboundWebhook(id: string): Promise<ReplayWebhookResponse> {
  return api<ReplayWebhookResponse>(`/webhook/inbound/${encodeURIComponent(id)}/replay`, {
    method: "POST",
  });
}

/**
 * Delete an inbox entry (administrative correction path).
 */
export function deleteInboundWebhook(id: string): Promise<void> {
  return api<void>(`/webhook/inbound/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
