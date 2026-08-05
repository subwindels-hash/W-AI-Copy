// @ts-nocheck
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import {
  SendMessageSchema,
  listMessages,
  sendMessage,
} from "../../services/message.service.js";
import { AppError } from "../../utils/result.js";

/**
 * Message routes mounted on /conversations (no prefix inside).
 * Exposes /:conversationId/messages list & send (with SSE streaming).
 */
export function registerMessageRoutes(router: Router) {
  router.use(authenticate);

  router.get("/:conversationId/messages", validate({ params: z.object({ conversationId: z.string().cuid() }), query: z.object({ page: z.coerce.number().int().min(1).default(1), perPage: z.coerce.number().int().min(1).max(100).default(100) }) }), async (req, res, next) => {
    try {
      const data = await listMessages(req.user!.id, req.params.conversationId, req.query as any);
      res.json({
        ok: true, data,
        meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt },
      });
    } catch (e) { next(e); }
  });

  router.post(
    "/:conversationId/messages",
    validate({
      params: z.object({ conversationId: z.string().cuid() }),
      body: SendMessageSchema,
    }),
    async (req, res, next) => {
      try {
        const accepts = req.headers.accept ?? "";
        if (accepts.includes("text/event-stream")) {
          // SSE streaming endpoint.
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
            "Content-Encoding": "identity",
          });
          res.write(`: connected ${Date.now()}\n\n`);
          const ac = new AbortController();
          // Detect client disconnect: response 'close' fires when the connection
          // is gone. If writableFinished is false, it was an abnormal disconnect.
          res.on("close", () => {
            if (!res.writableFinished) ac.abort();
          });
          req.on("aborted", () => ac.abort());
          await sendMessage(req.user!.id, req.params.conversationId, req.body, ac.signal, (chunk) => {
            if (ac.signal.aborted || res.writableEnded) return;
            res.write(chunk);
          });
          if (!res.writableEnded) res.end();
          return;
        }
        // Non-streaming fallback: collect streamed deltas into a final JSON response.
        let finalContent = "";
        let finalMsg: any = null;
        let streamError: string | null = null;
        let streamErrorCode: string | null = null;
        const ac = new AbortController();
        req.on("aborted", () => ac.abort());
        const write = (chunk: string) => {
          const events = chunk.split(/\r?\n\r?\n/);
          for (const ev of events) {
            const lines = ev.split(/\r?\n/);
            let dataStr = "";
            let eventName = "";
            for (const line of lines) {
              if (line.startsWith("event:")) eventName = line.slice(6).trim();
              else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
            }
            if (!dataStr) continue;
            try {
              const d = JSON.parse(dataStr);
              if (eventName === "message.delta" && d.delta) finalContent += d.delta;
              if (eventName === "message.done") {
                finalContent = d.content ?? finalContent;
                finalMsg = d;
              }
              if (eventName === "message.error") {
                streamError = d.error?.message ?? d.error ?? "stream error";
                streamErrorCode = d.error?.code ?? d.code ?? "UPSTREAM_ERROR";
                ac.abort();
              }
            } catch {
              // ignore parse errors for partial chunks
            }
          }
        };
        await sendMessage(req.user!.id, req.params.conversationId, req.body, ac.signal, write);
        if (streamError) {
          // Use the error code from the SSE event if available (e.g. AI_PROVIDER_CONFIGURATION_REQUIRED)
          return next(new AppError(streamErrorCode ?? "UPSTREAM_ERROR", streamError));
        }
        res.json({
          ok: true,
          data: { ...(finalMsg ?? {}), content: finalContent },
          meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt },
        });
      } catch (e) { next(e); }
    }
  );
}
