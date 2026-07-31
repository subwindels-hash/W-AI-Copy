import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "./workspace.service.js";
import { z } from "zod";
import type { PaginationQuery } from "@windels/shared/api";
import { MeetingStatus, NotetakerStatus, ActionItemStatus, ActionItemPriority } from "@prisma/client";
import { sendMessage as sendTalkMessage } from "./talk.service.js";

export const CreateMeetingSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  channelId: z.string().cuid().optional(),
  scheduledStart: z.string().datetime().optional(),
  notetakerAgentId: z.string().cuid().optional(),
  participantIds: z.array(z.string().cuid()).optional(),
  agentParticipantIds: z.array(z.string().cuid()).optional(),
});

export const UpdateMeetingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["SCHEDULED", "LIVE", "ENDED", "CANCELLED"]).optional(),
  scheduledStart: z.string().datetime().optional(),
  notetakerAgentId: z.string().cuid().nullable().optional(),
});

export const CreateActionItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueDate: z.string().datetime().optional(),
  assigneeId: z.string().cuid().optional(),
  agentAssigneeId: z.string().cuid().optional(),
  channelId: z.string().cuid().optional(),
  meetingId: z.string().cuid().optional(),
  sourceMessageId: z.string().cuid().optional(),
});

export const UpdateActionItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  assigneeId: z.string().cuid().nullable().optional(),
  agentAssigneeId: z.string().cuid().nullable().optional(),
});

export const AddTranscriptSchema = z.object({
  text: z.string().min(1).max(20000),
  final: z.boolean().default(false),
});

async function assertMeeting(userId: string, meetingId: string) {
  const ctx = await resolveUserContext(userId);
  const m = await prisma.meeting.findFirst({
    where: { id: meetingId, organizationId: ctx.organizationId },
    include: { participants: true },
  });
  if (!m) throw AppError.notFound("Meeting not found");
  return { meeting: m, ctx };
}

export async function listMeetings(userId: string, q: PaginationQuery & { status?: string; channelId?: string }) {
  const ctx = await resolveUserContext(userId);
  const where: any = { organizationId: ctx.organizationId };
  if (q.status) where.status = q.status;
  if (q.channelId) where.channelId = q.channelId;
  const [items, total] = await Promise.all([
    prisma.meeting.findMany({
      where,
      orderBy: { scheduledStart: { sort: "desc", nulls: "last" } },
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
      include: {
        createdBy: { include: { profile: true } },
        notetakerAgent: true,
        channel: true,
        _count: { select: { participants: true, actionItems: true } },
      },
    }),
    prisma.meeting.count({ where }),
  ]);
  return {
    items: items.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      status: m.status.toLowerCase(),
      scheduledStart: m.scheduledStart,
      startedAt: m.startedAt,
      endedAt: m.endedAt,
      channelId: m.channelId,
      channelName: m.channel?.name,
      notetakerAgentId: m.notetakerAgentId,
      notetakerAgent: m.notetakerAgent ? { id: m.notetakerAgent.id, name: m.notetakerAgent.name, emoji: m.notetakerAgent.emoji, color: m.notetakerAgent.color } : null,
      notetakerStatus: m.notetakerStatus.toLowerCase(),
      createdBy: { id: m.createdBy.id, displayName: m.createdBy.profile?.displayName ?? m.createdBy.email },
      participantsCount: m._count.participants,
      actionItemsCount: m._count.actionItems,
      createdAt: m.createdAt,
    })),
    pagination: { page: q.page, perPage: q.perPage, total, totalPages: Math.ceil(total / q.perPage) },
  };
}

export async function getMeeting(userId: string, meetingId: string) {
  const { meeting } = await assertMeeting(userId, meetingId);
  const [full, actionItems, participants] = await Promise.all([
    prisma.meeting.findUnique({ where: { id: meetingId }, include: { createdBy: { include: { profile: true } }, notetakerAgent: true, channel: true } }),
    prisma.actionItem.findMany({ where: { meetingId }, orderBy: { createdAt: "asc" }, include: { assignee: { include: { profile: true } }, agentAssignee: true, createdBy: { include: { profile: true } } } }),
    prisma.meetingParticipant.findMany({ where: { meetingId }, include: { user: { include: { profile: true } }, agent: true } }),
  ]);
  return {
    id: full!.id,
    title: full!.title,
    description: full!.description,
    status: full!.status.toLowerCase(),
    scheduledStart: full!.scheduledStart,
    startedAt: full!.startedAt,
    endedAt: full!.endedAt,
    channelId: full!.channelId,
    channelName: full!.channel?.name,
    notetakerAgentId: full!.notetakerAgentId,
    notetakerAgent: full!.notetakerAgent,
    notetakerStatus: full!.notetakerStatus.toLowerCase(),
    transcript: full!.transcript,
    summary: full!.summary,
    decisions: full!.decisions,
    createdBy: full!.createdBy ? { id: full!.createdBy.id, displayName: full!.createdBy.profile?.displayName ?? full!.createdBy.email } : null,
    participants: participants.map((p) => ({
      id: p.id,
      role: p.role,
      isNotetaker: p.isNotetaker,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt,
      user: p.user ? { id: p.user.id, displayName: p.user.profile?.displayName ?? p.user.email, avatarUrl: p.user.profile?.avatarUrl } : null,
      agent: p.agent ? { id: p.agent.id, name: p.agent.name, emoji: p.agent.emoji, color: p.agent.color } : null,
    })),
    actionItems: actionItems.map((ai) => ({
      id: ai.id,
      title: ai.title,
      description: ai.description,
      status: ai.status.toLowerCase(),
      priority: ai.priority.toLowerCase(),
      dueDate: ai.dueDate,
      assignee: ai.assignee ? { id: ai.assignee.id, displayName: ai.assignee.profile?.displayName ?? ai.assignee.email } : null,
      agentAssignee: ai.agentAssignee ? { id: ai.agentAssignee.id, name: ai.agentAssignee.name } : null,
    })),
    createdAt: full!.createdAt,
    updatedAt: full!.updatedAt,
  };
}

export async function createMeeting(userId: string, input: z.infer<typeof CreateMeetingSchema>) {
  const ctx = await resolveUserContext(userId);
  // If bound to a channel, verify access.
  if (input.channelId) {
    const ch = await prisma.talkChannel.findFirst({ where: { id: input.channelId, organizationId: ctx.organizationId } });
    if (!ch) throw AppError.notFound("Channel not found");
  }
  // Default notetaker agent: pick "Coordinator" built-in agent if not specified.
  let notetakerAgentId = input.notetakerAgentId;
  if (!notetakerAgentId) {
    const coord = await prisma.agent.findFirst({
      where: { organizationId: ctx.organizationId, role: { contains: "Coordinator" } },
    });
    notetakerAgentId = coord?.id;
  }
  const m = await prisma.meeting.create({
    data: {
      organizationId: ctx.organizationId,
      channelId: input.channelId,
      title: input.title,
      description: input.description,
      status: MeetingStatus.SCHEDULED,
      scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : null,
      createdById: userId,
      notetakerAgentId,
      notetakerStatus: notetakerAgentId ? NotetakerStatus.IDLE : NotetakerStatus.ERROR,
      participants: {
        create: [
          { userId, role: "organizer" },
          ...(input.participantIds ?? []).filter((id) => id !== userId).map((id) => ({ userId: id })),
          ...(input.agentParticipantIds ?? []).map((id) => ({ agentId: id })),
          ...(notetakerAgentId ? [{ agentId: notetakerAgentId, role: "notetaker", isNotetaker: true }] : []),
        ],
      },
    },
  });
  // If this is an instant meeting (no scheduled time), auto-start it.
  if (!input.scheduledStart) {
    await prisma.meeting.update({
      where: { id: m.id },
      data: { status: MeetingStatus.LIVE, startedAt: new Date(), notetakerStatus: notetakerAgentId ? NotetakerStatus.LISTENING : NotetakerStatus.IDLE },
    });
  }
  return m;
}

export async function updateMeeting(userId: string, meetingId: string, input: z.infer<typeof UpdateMeetingSchema>) {
  await assertMeeting(userId, meetingId);
  const data: any = { ...input };
  if (input.scheduledStart) data.scheduledStart = new Date(input.scheduledStart);
  if (input.notetakerAgentId === null) data.notetakerAgentId = null;
  if (input.status === "LIVE") data.startedAt = data.startedAt ?? new Date();
  if (input.status === "ENDED") data.endedAt = new Date();
  const m = await prisma.meeting.update({ where: { id: meetingId }, data });
  // When meeting ends, run notetaker summarization.
  if (input.status === "ENDED") {
    runNotetakerSummarize(meetingId).catch(() => {});
  }
  return m;
}

export async function addTranscript(userId: string, meetingId: string, input: z.infer<typeof AddTranscriptSchema>) {
  const { meeting } = await assertMeeting(userId, meetingId);
  const current = meeting.transcript ? `${meeting.transcript}\n` : "";
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      transcript: current + input.text,
      notetakerStatus: input.final ? NotetakerStatus.SUMMARIZING : NotetakerStatus.LISTENING,
    },
  });
  if (input.final) {
    runNotetakerSummarize(meetingId).catch(() => {});
  }
}

async function runNotetakerSummarize(meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { notetakerAgent: true, channel: true, organization: true },
  });
  if (!meeting || !meeting.transcript || meeting.transcript.trim().length < 10) {
    await prisma.meeting.update({ where: { id: meetingId }, data: { notetakerStatus: NotetakerStatus.DONE } });
    return;
  }
  if (!meeting.notetakerAgent) {
    await prisma.meeting.update({ where: { id: meetingId }, data: { notetakerStatus: NotetakerStatus.DONE } });
    return;
  }
  let output = "";
  try {
    try {
      const { aiRegistry } = await import("./ai/registry.js");
      const { AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE: _aiErrMsg } = await import("./ai/types.js");
      const resolved = aiRegistry.resolve(meeting.notetakerAgent.modelId ?? undefined);
      if (!resolved) {
        // Meeting notetaker has a heuristic fallback, so just warn and continue.
        throw new Error(_aiErrMsg);
      }
      const sys = `You are an expert AI meeting notetaker. Given a transcript, output exactly three sections (## Summary, ## Decisions, ## Action Items). Under ## Summary write a 3-6 sentence summary. Under ## Decisions write bullets starting with "- ". Under ## Action Items write bullets starting with "- [ ] " with owner and title. Replace ALL placeholders with real content from the transcript. Never include these instructions in your response. If there are no decisions or action items, write "None" under that heading.`;
      const usr = `TRANSCRIPT:\n"""\n${meeting.transcript.slice(-8000)}\n"""`;
      for await (const chunk of aiRegistry.guardedStream({
        model: resolved.model.id,
        messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
        stream: true,
      }, { userId: meeting.createdById ?? undefined, feature: "meeting-notetaker" })) {
        if (chunk.type === "token") output += chunk.text ?? "";
      }
    } catch (aiErr) {
      console.warn("[meeting] AI notetaker failed, using heuristic:", aiErr);
    }
    // Heuristic fallback (used whenever model output is bad/placeholder/empty)
    const heuristic = heuristicNotetaker(meeting.transcript);
    if (!output || output.includes("<") || output.length < 60) output = heuristic;

    // Extract sections
    const summaryMatch = output.match(/## Summary\s*([\s\S]*?)(?=\n## Decisions|$)/);
    const decisionsMatch = output.match(/## Decisions\s*([\s\S]*?)(?=\n## Action Items|$)/);
    const actionsMatch = output.match(/## Action Items\s*([\s\S]*)$/);
    const summary = (summaryMatch?.[1] ?? heuristicSummary(meeting.transcript)).trim();
    const decisionsRaw = (decisionsMatch?.[1] ?? "").trim();
    const actionsRaw = (actionsMatch?.[1] ?? "").trim();
    const decisions = decisionsRaw
      .split("\n")
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
    const actionLines = actionsRaw
      .split("\n")
      .map((l) => l.replace(/^[-*]\s*\[[ xX]\]\s*/, "").trim())
      .filter(Boolean);

    // Persist summary
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        summary,
        decisions: decisions as any,
        notetakerStatus: NotetakerStatus.DONE,
      },
    });

    // Create ActionItem entries + optionally post to channel.
    const orgMembers = await prisma.membership.findMany({
      where: { organizationId: meeting.organizationId },
      include: { user: { include: { profile: true } } },
    });
    const nameToUser = new Map<string, any>();
    for (const m of orgMembers) {
      if (!m.user) continue;
      const dn = (m.user.profile?.displayName ?? m.user.email ?? "").toLowerCase();
      nameToUser.set(dn, m.user);
      nameToUser.set(m.user.email.toLowerCase(), m.user);
    }
    for (const line of actionLines) {
      // Best-effort owner detection: first token before "—" or "-".
      const beforeDash = line.split(/[—–-]/)[0].trim();
      let assigneeId: string | null = null;
      let title = line;
      if (beforeDash && beforeDash.length < 40) {
        const candidate = nameToUser.get(beforeDash.toLowerCase());
        if (candidate) {
          assigneeId = candidate.id;
          title = line.replace(beforeDash, "").replace(/^[—–-]?\s*/, "").trim();
        }
      }
      const dueMatch = title.match(/\(due:\s*([^)]+)\)/i);
      let dueDate: Date | null = null;
      if (dueMatch) {
        const parsed = new Date(dueMatch[1]);
        if (!isNaN(parsed.getTime())) dueDate = parsed;
        title = title.replace(dueMatch[0], "").trim();
      }
      await prisma.actionItem.create({
        data: {
          organizationId: meeting.organizationId,
          meetingId,
          channelId: meeting.channelId,
          title: title.slice(0, 200),
          status: ActionItemStatus.OPEN,
          priority: ActionItemPriority.MEDIUM,
          dueDate,
          assigneeId,
          createdById: meeting.createdById,
          metadata: { aiGenerated: true, source: "notetaker" },
        },
      });
    }

    // Post summary to channel.
    if (meeting.channelId) {
      await prisma.talkMessage.create({
        data: {
          channelId: meeting.channelId,
          type: "MEETING_SUMMARY" as any,
          content: `📝 **Meeting Summary: ${meeting.title}**\n\n${summary}\n\n**Decisions:**\n${decisions.length ? decisions.map((d) => `• ${d}`).join("\n") : "_None captured._"}\n\n**Action Items:**\n${actionLines.length ? actionLines.map((l) => `• ${l}`).join("\n") : "_None captured._"}`,
          meetingId,
          agentId: meeting.notetakerAgentId,
        },
      });
      await prisma.talkChannel.update({ where: { id: meeting.channelId }, data: { lastMessageAt: new Date() } });
    }
  } catch (err) {
    console.error("[meeting] notetaker summarize failed:", err);
    await prisma.meeting.update({ where: { id: meetingId }, data: { notetakerStatus: NotetakerStatus.ERROR } });
  }
}

// ─── Action Items (standalone) ─────────────────────────────────
export async function listActionItems(userId: string, q: PaginationQuery & { status?: string; meetingId?: string; channelId?: string; assigneeId?: string; mine?: boolean }) {
  const ctx = await resolveUserContext(userId);
  const where: any = { organizationId: ctx.organizationId };
  if (q.status) where.status = q.status;
  if (q.meetingId) where.meetingId = q.meetingId;
  if (q.channelId) where.channelId = q.channelId;
  if (q.assigneeId) where.assigneeId = q.assigneeId;
  if (q.mine) where.assigneeId = userId;
  const [items, total] = await Promise.all([
    prisma.actionItem.findMany({
      where,
      orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
      include: {
        assignee: { include: { profile: true } },
        agentAssignee: true,
        createdBy: { include: { profile: true } },
        meeting: { select: { id: true, title: true } },
        channel: { select: { id: true, name: true } },
      },
    }),
    prisma.actionItem.count({ where }),
  ]);
  return {
    items: items.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      status: a.status.toLowerCase(),
      priority: a.priority.toLowerCase(),
      dueDate: a.dueDate,
      completedAt: a.completedAt,
      assignee: a.assignee ? { id: a.assignee.id, displayName: a.assignee.profile?.displayName ?? a.assignee.email, avatarUrl: a.assignee.profile?.avatarUrl } : null,
      agentAssignee: a.agentAssignee ? { id: a.agentAssignee.id, name: a.agentAssignee.name, emoji: a.agentAssignee.emoji } : null,
      createdBy: { id: a.createdBy.id, displayName: a.createdBy.profile?.displayName ?? a.createdBy.email },
      meeting: a.meeting,
      channel: a.channel,
      createdAt: a.createdAt,
    })),
    pagination: { page: q.page, perPage: q.perPage, total, totalPages: Math.ceil(total / q.perPage) },
  };
}

export async function createActionItem(userId: string, input: z.infer<typeof CreateActionItemSchema>) {
  const ctx = await resolveUserContext(userId);
  if (input.channelId) {
    const ch = await prisma.talkChannel.findFirst({ where: { id: input.channelId, organizationId: ctx.organizationId } });
    if (!ch) throw AppError.notFound("Channel not found");
  }
  if (input.meetingId) {
    const m = await prisma.meeting.findFirst({ where: { id: input.meetingId, organizationId: ctx.organizationId } });
    if (!m) throw AppError.notFound("Meeting not found");
  }
  const a = await prisma.actionItem.create({
    data: {
      organizationId: ctx.organizationId,
      meetingId: input.meetingId,
      channelId: input.channelId,
      title: input.title,
      description: input.description,
      priority: (input.priority as ActionItemPriority) ?? ActionItemPriority.MEDIUM,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      assigneeId: input.assigneeId,
      agentAssigneeId: input.agentAssigneeId,
      createdById: userId,
      sourceMessageId: input.sourceMessageId,
    },
    include: { assignee: { include: { profile: true } }, agentAssignee: true, createdBy: { include: { profile: true } } },
  });
  return a;
}

export async function updateActionItem(userId: string, id: string, input: z.infer<typeof UpdateActionItemSchema>) {
  const ctx = await resolveUserContext(userId);
  const existing = await prisma.actionItem.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!existing) throw AppError.notFound("Action item not found");
  const data: any = { ...input };
  if (input.dueDate === null) data.dueDate = null;
  else if (input.dueDate) data.dueDate = new Date(input.dueDate);
  if (input.assigneeId === null) data.assigneeId = null;
  if (input.agentAssigneeId === null) data.agentAssigneeId = null;
  if ((input.status as string) === "DONE") data.completedAt = new Date();
  else if (input.status && (input.status as string) !== "DONE") data.completedAt = null;
  return prisma.actionItem.update({ where: { id }, data });
}

export async function deleteActionItem(userId: string, id: string) {
  const ctx = await resolveUserContext(userId);
  const existing = await prisma.actionItem.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!existing) throw AppError.notFound("Action item not found");
  await prisma.actionItem.delete({ where: { id } });
}

function heuristicSummary(transcript: string): string {
  const lines = transcript.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const speakers = Array.from(
    new Set(
      lines
        .map((l) => {
          const m = l.match(/^([^:：]{1,30})[:：]/);
          return m ? m[1]!.trim() : null;
        })
        .filter((s): s is string => !!s && s.length < 40 && /^[A-Za-z][A-Za-z .'-]+$/.test(s))
    )
  );
  const topics = lines
    .map((l) => l.replace(/^[^:：]+[:：]\s?/, ""))
    .join(" ")
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 180)
    .slice(0, 2)
    .join(" ");
  return `${speakers.length ? speakers.slice(0, 4).join(", ") + " and the team" : "The team"} met to align on next steps.${topics ? " Discussion covered: " + topics.slice(0, 400) + "." : ""} Decisions and action items were captured live.`;
}

function heuristicNotetaker(transcript: string): string {
  const lines = transcript.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const speakerMap = new Map<string, string[]>();
  const decisions: string[] = [];
  const actions: { owner: string; text: string }[] = [];

  for (const raw of lines) {
    // Split on FIRST colon (supports ":" or "：") so that "Bob: I will..." parses correctly even if text contains colons.
    const colonIdx = raw.search(/[:：]/);
    let speaker = "Team";
    let text = raw;
    if (colonIdx > 0 && colonIdx < 40) {
      const cand = raw.slice(0, colonIdx).trim();
      const isName = /^[A-Z][a-z][A-Za-z .'-]{0,30}$/.test(cand) && !/^(Decision|I'?ll|I will|We|They|He|She|It|So|And|But|Then)$/i.test(cand);
      if (isName) {
        speaker = cand;
        text = raw.slice(colonIdx + 1).trim();
      }
    }
    if (!speakerMap.has(speaker)) speakerMap.set(speaker, []);
    speakerMap.get(speaker)!.push(text);
    if (/\b(decision|decided|agreed|we'll|we will|let's|ship|approve|approved)\b/i.test(text)) {
      decisions.push(text);
    }
    // Heuristic action: "<Name> will <action>" or "I will <action>" or sentence mentions "by <day>" / "owns".
    const ownerMatch = text.match(/^(i'?ll|i will)\s+(.+)/i);
    const nameWillMatch = text.match(/^([A-Z][a-z]{1,20})\s+will\s+(.+)/);
    const isPronoun = nameWillMatch && /^(We|They|He|She|It)$/.test(nameWillMatch[1]!);
    if (nameWillMatch && !isPronoun) {
      actions.push({ owner: nameWillMatch[1]!, text: nameWillMatch[2]!.replace(/\s*[.?!]+\s*$/, "") });
    } else if (ownerMatch) {
      actions.push({ owner: speaker, text: ownerMatch[2]!.replace(/\s*[.?!]+\s*$/, "") });
    } else if (/\bby (friday|monday|tuesday|wednesday|thursday|next week|eod|today|tomorrow|next sprint)\b/i.test(text) || /\bowns?\b/i.test(text)) {
      // Capture the whole sentence as an action item attributed to the speaker.
      actions.push({ owner: speaker, text: text.replace(/\s*[.?!]+\s*$/, "") });
    }
  }

  const summary = heuristicSummary(transcript);
  const decisionLines = decisions.length
    ? decisions.map((d) => `- ${d}`).join("\n")
    : "- None captured.";
  const actionLines = actions.length
    ? actions.map((a) => `- [ ] ${a.owner} — ${a.text} — due: unspecified`).join("\n")
    : "- None captured.";

  return `## Summary\n${summary}\n\n## Decisions\n${decisionLines}\n\n## Action Items\n${actionLines}\n`;
}
