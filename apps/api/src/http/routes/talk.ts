import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { PaginationQuery } from "@windels/shared/api";
import * as talk from "../../services/talk.service.js";
import * as meetings from "../../services/meeting.service.js";

export function registerTalkRoutes(router: Router) {
  router.use(authenticate);

  // ─── Channels ────────────────────────────────────────────────
  router.get(
    "/channels",
    validate({ query: PaginationQuery.extend({ q: z.string().optional(), type: z.enum(["DM", "CHANNEL"]).optional() }) }),
    async (req, res, next) => {
      try {
        const data = await talk.listChannels(req.user!.id, req.query as any);
        res.json({ ok: true, data, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    }
  );

  router.post("/channels", validate({ body: talk.CreateChannelSchema }), async (req, res, next) => {
    try {
      const data = await talk.createChannel(req.user!.id, req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/channels/:id", async (req, res, next) => {
    try {
      const data = await talk.getChannel(req.user!.id, req.params.id);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/channels/:id", validate({ body: talk.UpdateChannelSchema }), async (req, res, next) => {
    try {
      const data = await talk.updateChannel(req.user!.id, req.params.id, req.body);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/channels/:id", async (req, res, next) => {
    try {
      await talk.archiveChannel(req.user!.id, req.params.id);
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post(
    "/channels/:id/members",
    validate({ body: z.object({ userIds: z.array(z.string().cuid()).optional(), agentIds: z.array(z.string().cuid()).optional() }) }),
    async (req, res, next) => {
      try {
        await talk.addChannelMembers(req.user!.id, req.params.id, req.body.userIds ?? [], req.body.agentIds ?? []);
        res.json({ ok: true, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    }
  );

  router.delete("/channels/:id/members/:memberId", async (req, res, next) => {
    try {
      await talk.removeChannelMember(req.user!.id, req.params.id, req.params.memberId);
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ─── Messages ────────────────────────────────────────────────
  router.get(
    "/channels/:id/messages",
    validate({ query: PaginationQuery.extend({ threadParentId: z.string().cuid().optional() }) }),
    async (req, res, next) => {
      try {
        const data = await talk.listMessages(req.user!.id, req.params.id, req.query as any);
        res.json({ ok: true, data, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    }
  );

  router.post(
    "/channels/:id/messages",
    validate({ body: talk.CreateMessageSchema }),
    async (req, res, next) => {
      try {
        const data = await talk.sendMessage(req.user!.id, req.params.id, req.body);
        res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    }
  );

  router.get("/messages/:id", async (req, res, next) => {
    try {
      const data = await talk.getMessage(req.user!.id, req.params.id);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/messages/:id", validate({ body: talk.UpdateMessageSchema }), async (req, res, next) => {
    try {
      const data = await talk.editMessage(req.user!.id, req.params.id, req.body);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/messages/:id", async (req, res, next) => {
    try {
      await talk.deleteMessage(req.user!.id, req.params.id);
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ─── Reactions ───────────────────────────────────────────────
  router.post(
    "/messages/:id/reactions",
    validate({ body: talk.AddReactionSchema }),
    async (req, res, next) => {
      try {
        const data = await talk.toggleReaction(req.user!.id, req.params.id, req.body.emoji);
        res.json({ ok: true, data, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    }
  );

  // ─── Meetings ────────────────────────────────────────────────
  router.get(
    "/meetings",
    validate({ query: PaginationQuery.extend({ status: z.string().optional(), channelId: z.string().cuid().optional() }) }),
    async (req, res, next) => {
      try {
        const data = await meetings.listMeetings(req.user!.id, req.query as any);
        res.json({ ok: true, data, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    }
  );

  router.post("/meetings", validate({ body: meetings.CreateMeetingSchema }), async (req, res, next) => {
    try {
      const data = await meetings.createMeeting(req.user!.id, req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/meetings/:id", async (req, res, next) => {
    try {
      const data = await meetings.getMeeting(req.user!.id, req.params.id);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/meetings/:id", validate({ body: meetings.UpdateMeetingSchema }), async (req, res, next) => {
    try {
      const data = await meetings.updateMeeting(req.user!.id, req.params.id, req.body);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post(
    "/meetings/:id/transcript",
    validate({ body: meetings.AddTranscriptSchema }),
    async (req, res, next) => {
      try {
        await meetings.addTranscript(req.user!.id, req.params.id, req.body);
        res.json({ ok: true, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    }
  );

  // ─── Action Items ────────────────────────────────────────────
  router.get(
    "/action-items",
    validate({
      query: PaginationQuery.extend({
        status: z.string().optional(),
        meetingId: z.string().cuid().optional(),
        channelId: z.string().cuid().optional(),
        assigneeId: z.string().cuid().optional(),
        mine: z.coerce.boolean().optional(),
      }),
    }),
    async (req, res, next) => {
      try {
        const data = await meetings.listActionItems(req.user!.id, req.query as any);
        res.json({ ok: true, data, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    }
  );

  router.post("/action-items", validate({ body: meetings.CreateActionItemSchema }), async (req, res, next) => {
    try {
      const data = await meetings.createActionItem(req.user!.id, req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/action-items/:id", validate({ body: meetings.UpdateActionItemSchema }), async (req, res, next) => {
    try {
      const data = await meetings.updateActionItem(req.user!.id, req.params.id, req.body);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/action-items/:id", async (req, res, next) => {
    try {
      await meetings.deleteActionItem(req.user!.id, req.params.id);
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ─── AI participants: list agents available to add ───────────
  router.get("/available-agents", async (req, res, next) => {
    try {
      const ctx = req.user!;
      const { prisma } = await import("../../db/client.js");
      const members = await prisma.membership.findFirst({ where: { userId: ctx.id } });
      if (!members) return res.json({ ok: true, data: [] });
      const agents = await prisma.agent.findMany({
        where: { organizationId: members.organizationId },
        select: { id: true, name: true, role: true, emoji: true, color: true, isBuiltIn: true },
        orderBy: { name: "asc" },
      });
      res.json({ ok: true, data: agents });
    } catch (e) { next(e); }
  });
}
