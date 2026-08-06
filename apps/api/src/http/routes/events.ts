/**
 * SSE (Server-Sent Events) Real-Time Channel (Module 1 — Gap 6 + Session 126 Completion)
 *
 * Provides a real-time event stream to authenticated frontend clients,
 * historical event replay (`evt:hist`), stream client session management,
 * and custom organization event publishing.
 *
 * Usage from frontend:
 *   const es = new EventSource('/api/v1/events/stream');
 *   es.onmessage = (e) => { const data = JSON.parse(e.data); ... };
 *
 * Events are scoped — a client only receives events for their organization.
 */
import type { Request, Response, Router } from "express";
import { randomUUID } from "node:crypto";
import { EventBus } from "../../services/eventBus.js";
import { logger } from "../../config/logger.js";
import { EventsService } from "../../events/events.service.js";
import { validate } from "../middleware/validate.js";
import { EventHistoryQuerySchema, PublishEventSchema, type SSEEventPayload } from "@windels/shared";

interface SSEClient {
  id: string;
  userId: string;
  organizationId: string | null;
  res: Response;
  lastEventId: string | null;
  subscribedAt: number;
}

// Active SSE connections
const clients = new Map<string, SSEClient>();

// Events that should be broadcast to SSE clients
const BROADCAST_EVENTS = new Set([
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
]);

// Start listening to EventBus and forwarding to SSE clients
let subscribed = false;
function ensureEventBusSubscription() {
  if (subscribed) return;
  subscribed = true;

  // Subscribe to all events via wildcard
  EventBus.on("*", ({ event, payload }: { event: string; payload: any }) => {
    if (!BROADCAST_EVENTS.has(event)) return;
    broadcast(event, payload);
  });

  // Periodic cleanup of stale connections (every 5 minutes)
  setInterval(() => {
    const now = Date.now();
    for (const [id, client] of clients) {
      if (client.res.writableEnded || client.res.destroyed) {
        clients.delete(id);
      }
      // Drop connections older than 30 minutes (clients will reconnect)
      if (now - client.subscribedAt > 30 * 60 * 1000) {
        try {
          client.res.end();
        } catch {}
        clients.delete(id);
      }
    }
  }, 5 * 60 * 1000).unref();
}

function broadcast(event: string, payload: any) {
  const eventId = payload?.id ?? randomUUID();
  const timestamp = payload?.timestamp ?? new Date().toISOString();
  const eventOrgId = payload?.organizationId ?? payload?.orgId ?? null;

  const eventObj: SSEEventPayload = {
    id: eventId,
    event,
    data: payload,
    timestamp,
    organizationId: eventOrgId,
  };

  // Persist org-scoped events to historical ring buffer
  if (eventOrgId) {
    EventsService.recordEvent(eventObj).catch(() => {});
  }

  const data = JSON.stringify(eventObj);

  for (const [, client] of clients) {
    // Strict fail-closed organization scoping
    if (eventOrgId && eventOrgId !== client.organizationId) {
      continue; // Skip — different organization, or client has no org scope.
    }

    try {
      client.res.write(`id: ${eventId}\n`);
      client.res.write(`event: ${event}\n`);
      client.res.write(`data: ${data}\n\n`);
    } catch (e) {
      // Connection broken — will be cleaned up
      clients.delete(client.id);
    }
  }
}

/**
 * Register the SSE stream endpoint and Session 126 stream management endpoints.
 */
export function registerSSERoutes(router: Router) {
  ensureEventBusSubscription();

  // SSE stream endpoint
  router.get("/stream", async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
    }

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // nginx: don't buffer SSE
      "Access-Control-Allow-Origin": "*", // CORS for EventSource (no cookies)
    });

    // Send initial connection event
    const clientId = randomUUID();
    const lastEventId = (req.headers["last-event-id"] as string | undefined) ?? (req.query?.since as string | undefined) ?? null;
    const client: SSEClient = {
      id: clientId,
      userId: user.id,
      organizationId: user.organizationId,
      res,
      lastEventId,
      subscribedAt: Date.now(),
    };
    clients.set(clientId, client);

    logger.debug("SSE client connected", { clientId, userId: user.id, orgId: user.organizationId, totalClients: clients.size });

    // Send a welcome event so the client knows the connection is live
    res.write(`id: ${clientId}\n`);
    res.write(`event: connected\n`);
    res.write(`data: ${JSON.stringify({ clientId, userId: user.id, organizationId: user.organizationId, timestamp: new Date().toISOString() })}\n\n`);

    // Session 126 additive: replay historical events if Last-Event-ID or since is present
    if (user.organizationId && lastEventId) {
      try {
        const history = await EventsService.getEventHistory(user.organizationId, { since: lastEventId });
        for (const ev of history) {
          res.write(`id: ${ev.id}\n`);
          res.write(`event: ${ev.event}\n`);
          res.write(`data: ${JSON.stringify(ev)}\n\n`);
        }
      } catch (err: any) {
        logger.warn("SSE history replay failed", { error: err?.message });
      }
    }

    // Send periodic keepalive pings (every 25 seconds — below nginx default 60s timeout)
    const keepalive = setInterval(() => {
      try {
        res.write(`:ping ${Date.now()}\n\n`);
      } catch {
        clearInterval(keepalive);
        clients.delete(clientId);
      }
    }, 25_000);
    keepalive.unref();

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(keepalive);
      clients.delete(clientId);
      logger.debug("SSE client disconnected", { clientId, totalClients: clients.size });
    });
  });

  // Health endpoint for monitoring
  router.get("/health", (req: Request, res: Response) => {
    const health = EventsService.getHealth(clients.size, req.user?.organizationId, clients);
    res.json({
      ok: true,
      data: health,
    });
  });

  // Session 126 additive: query recent event history for the caller's organization
  router.get("/history", validate({ query: EventHistoryQuerySchema }), async (req: Request, res: Response, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      if (!user.organizationId) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Organization scope required" } });

      const history = await EventsService.getEventHistory(user.organizationId, req.query as any);
      res.json({ ok: true, data: history, meta: { requestId: req.requestId } });
    } catch (err) {
      next(err);
    }
  });

  // Session 126 additive: list active SSE client sessions for the caller's organization
  router.get("/clients", (req: Request, res: Response) => {
    const user = req.user;
    if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
    if (!user.organizationId) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Organization scope required" } });

    const orgClients = EventsService.listClients(user.organizationId, clients);
    res.json({ ok: true, data: orgClients, meta: { requestId: req.requestId } });
  });

  // Session 126 additive: publish an event to the caller's organization stream
  router.post("/publish", validate({ body: PublishEventSchema }), async (req: Request, res: Response, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      if (!user.organizationId) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Organization scope required" } });

      const payload = await EventsService.publishEvent({ id: user.id, organizationId: user.organizationId }, req.body);
      res.status(201).json({ ok: true, data: payload, meta: { requestId: req.requestId } });
    } catch (err) {
      next(err);
    }
  });

  // Session 126 additive: disconnect/revoke a specific active SSE client session
  router.delete("/clients/:id", (req: Request, res: Response) => {
    const user = req.user;
    if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
    if (!user.organizationId) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Organization scope required" } });

    const removed = EventsService.disconnectClient(user.organizationId, req.params.id, clients);
    if (!removed) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Client session not found in organization" } });
    }
    res.status(204).end();
  });
}

/**
 * Programmatically push an event to SSE clients (for use outside EventBus).
 * Useful for module-specific events that don't go through the central bus.
 */
export function pushEvent(event: string, payload: any) {
  broadcast(event, payload);
}

/**
 * Get current SSE connection count for metrics.
 */
export function getSSEConnectionCount(): number {
  return clients.size;
}
