import { z } from "zod";

export const INBOUND_WEBHOOK_SOURCES = ["billing", "github", "stripe", "etl", "custom"] as const;
export type InboundWebhookSource = (typeof INBOUND_WEBHOOK_SOURCES)[number];

export const INBOUND_WEBHOOK_STATUSES = ["received", "processed", "failed", "replayed"] as const;
export type InboundWebhookStatus = (typeof INBOUND_WEBHOOK_STATUSES)[number];

export const InboundWebhookEntrySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  source: z.string(),
  event: z.string(),
  payload: z.record(z.unknown()),
  signatureVerified: z.boolean(),
  status: z.enum(INBOUND_WEBHOOK_STATUSES),
  receivedAt: z.string(),
  replayedAt: z.string().nullable().optional(),
});

export type InboundWebhookEntry = z.infer<typeof InboundWebhookEntrySchema>;

export const InboundWebhookQuerySchema = z.object({
  source: z.string().optional(),
  status: z.enum(INBOUND_WEBHOOK_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type InboundWebhookQueryInput = z.infer<typeof InboundWebhookQuerySchema>;

export const ReplayWebhookResponseSchema = z.object({
  id: z.string(),
  replayedAt: z.string(),
  event: z.string(),
  status: z.enum(INBOUND_WEBHOOK_STATUSES),
});

export type ReplayWebhookResponse = z.infer<typeof ReplayWebhookResponseSchema>;

export const InboundWebhookPayloadSchema = z.object({
  event: z.string().optional(),
  eventType: z.string().optional(),
  action: z.string().optional(),
  type: z.string().optional(),
}).passthrough();

export type InboundWebhookPayload = z.infer<typeof InboundWebhookPayloadSchema>;
