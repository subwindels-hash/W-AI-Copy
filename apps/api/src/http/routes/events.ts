/**
 * SSE (Server-Sent Events) Real-Time Channel (Module 1 — Gap 6)
 *
 * Provides a real-time event stream to authenticated frontend clients.
 * Subscribes to the in-process EventBus and pushes events to connected
 * clients filtered by their organization scope.
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
  const eventId = randomUUID();
  const data = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString(), id: eventId });

  for (const [, client] of clients) {
    // Organization scoping: only send events to clients in the same org
    // If the event has no org, or the client has no org filter, broadcast to all
    const eventOrgId = payload?.organizationId ?? payload?.orgId ?? null;
    if (eventOrgId && client.organizationId && eventOrgId !== client.organizationId) {
      continue; // Skip — different organization
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
 * Register the SSE stream endpoint.
 * GET /events/stream — opens a long-lived SSE connection.
 * GET /events/health — returns connection count for monitoring.
 */
export function registerSSERoutes(router: Router) {
  ensureEventBusSubscription();

  // SSE stream endpoint
  router.get("/stream", (req: Request, res: Response) => {
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
    const client: SSEClient = {
      id: clientId,
      userId: user.id,
      organizationId: user.organizationId,
      res,
      lastEventId: req.headers["last-event-id"] as string | null,
      subscribedAt: Date.now(),
    };
    clients.set(clientId, client);

    logger.debug("SSE client connected", { clientId, userId: user.id, orgId: user.organizationId, totalClients: clients.size });

    // Send a welcome event so the client knows the connection is live
    res.write(`id: ${clientId}\n`);
    res.write(`event: connected\n`);
    res.write(`data: ${JSON.stringify({ clientId, userId: user.id, organizationId: user.organizationId, timestamp: new Date().toISOString() })}\n\n`);

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
  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      data: {
        connectedClients: clients.size,
        subscribedEvents: Array.from(BROADCAST_EVENTS),
        uptime: process.uptime(),
      },
    });
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
