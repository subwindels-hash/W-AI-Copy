import { z } from "zod";

export const MAX_EVENT_HISTORY_LIMIT = 200;
export const DEFAULT_EVENT_HISTORY_LIMIT = 50;

export const BROADCAST_EVENTS = [
  "message.created",
  "message.updated",
  "message.deleted",
  "conversation.created",
  "conversation.updated",
  "task.created",
  "task.updated",
  "task.completed",
  "agent.status_changed",
  "agent.task_started",
  "agent.task_completed",
  "workflow.run.started",
  "workflow.run.succeeded",
  "workflow.run.failed",
  "notification.created",
  "user.joined",
  "meeting.started",
  "meeting.ended",
  "ai.response",
  "ai.error",
  "system.alert",
  "webhook.inbound_received",
] as const;

export const SSEEventPayloadSchema = z.object({
  id: z.string(),
  event: z.string(),
  data: z.unknown(),
  timestamp: z.string(),
  organizationId: z.string().nullable().optional(),
});

export type SSEEventPayload = z.infer<typeof SSEEventPayloadSchema>;

export const SSEClientInfoSchema = z.object({
  id: z.string(),
  userId: z.string(),
  organizationId: z.string().nullable(),
  lastEventId: z.string().nullable(),
  subscribedAt: z.number(),
});

export type SSEClientInfo = z.infer<typeof SSEClientInfoSchema>;

export const EventHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_EVENT_HISTORY_LIMIT).default(DEFAULT_EVENT_HISTORY_LIMIT),
  since: z.string().optional(),
  eventType: z.string().optional(),
});

export type EventHistoryQueryInput = z.infer<typeof EventHistoryQuerySchema>;

export const PublishEventSchema = z.object({
  event: z.string().min(1).max(100),
  data: z.record(z.unknown()).optional().default({}),
  organizationId: z.string().optional(),
});

export type PublishEventInput = z.infer<typeof PublishEventSchema>;

export const EventsHealthSchema = z.object({
  connectedClients: z.number().int().nonnegative(),
  subscribedEvents: z.array(z.string()),
  uptime: z.number().nonnegative(),
  orgConnectedClients: z.number().int().nonnegative().optional(),
});

export type EventsHealthResponse = z.infer<typeof EventsHealthSchema>;
