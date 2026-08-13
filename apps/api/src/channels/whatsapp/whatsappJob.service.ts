/**
 * WhatsApp long-running job handling — Phase 2 §7.
 *
 * Rule: the webhook is never held open. When a command needs real work, the
 * pipeline creates a WhatsAppJob, sends an immediate acknowledgement, and
 * returns. This module's worker later executes the job through the existing
 * orchestration and notifies the user with the result.
 *
 * Durability comes from the database, not from Redis: a WhatsAppJob row in
 * QUEUED survives a restart and gets picked up by the next tick, whereas an
 * in-memory promise would be lost silently.
 */
import { prisma } from "../../db/client.js";
import { logger } from "../../observability/logger.js";
import { auditService } from "../../audit/audit.service.js";
import { WhatsAppMessageService } from "./whatsappMessage.service.js";
import { executeJob, type CommandActor } from "./whatsappCommandExec.js";
import type { ParsedCommand } from "./whatsappCommands.js";

/** A job that fails this many times stops being retried. */
export const MAX_JOB_ATTEMPTS = 3;
/** Upper bound per tick so one sweep cannot monopolise the event loop. */
const MAX_JOBS_PER_TICK = 5;
/** A job stuck in RUNNING beyond this is presumed dead and is reclaimed. */
const RUNNING_TIMEOUT_MS = 10 * 60 * 1000;

export interface CreateJobInput {
  organizationId: string;
  /** WhatsAppConversation.id */
  conversationId: string;
  requestMessageId: string | null;
  command: ParsedCommand;
  actor: CommandActor;
  /** Extracted document text, when the command operates on an attachment. */
  documentText?: string | null;
}

/** The acknowledgement wording, kept honest: queued, not finished. */
function ackTextFor(command: ParsedCommand): string {
  return `⏳ Working on it — I'll ${command.describe}. I'll message you when it's ready.`;
}

export const WhatsAppJobService = {
  /**
   * Creates the job row and sends the ACK. Returns the job id.
   *
   * The ACK is sent BEFORE the work starts and its message id is stored, so a
   * retry of the same job can never double-acknowledge.
   */
  async createAndAck(input: CreateJobInput): Promise<{ jobId: string; acked: boolean }> {
    const db = prisma as any;
    const job = await db.whatsAppJob.create({
      data: {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        requestMessageId: input.requestMessageId,
        kind: input.command.kind,
        status: "QUEUED",
        requestedByUserId: input.actor.userId,
        requestText: input.command.raw.slice(0, 4000),
        params: {
          argument: input.command.argument,
          risk: input.command.risk,
          describe: input.command.describe,
          windelsConversationId: input.actor.conversationId,
          agentId: input.actor.agentId,
          // Carried so the worker analyses exactly the document the user sent,
          // without a second download.
          documentText: input.documentText ? input.documentText.slice(0, 12_000) : null,
        },
      },
    });

    let acked = false;
    try {
      const conversation = await prisma.whatsAppConversation.findUnique({
        where: { id: input.conversationId },
        select: { id: true, whatsappChannelId: true, contact: { select: { phoneNumber: true } } },
      });
      const channel = conversation
        ? await prisma.whatsAppChannel.findUnique({ where: { id: conversation.whatsappChannelId } })
        : null;

      if (channel && conversation?.contact?.phoneNumber) {
        const sent = await WhatsAppMessageService.sendText(
          channel as any,
          conversation.contact.phoneNumber,
          ackTextFor(input.command),
          { conversationId: conversation.id },
        );
        acked = true;
        await db.whatsAppJob
          .update({ where: { id: job.id }, data: { ackMessageId: sent.recordId } })
          .catch(() => { /* the ACK went out; bookkeeping is secondary */ });
      }
    } catch (e: any) {
      // A failed ACK must not cancel the work — the completion message still lands.
      logger.warn("whatsapp job ack failed", { jobId: job.id, err: e?.message });
    }

    await auditService
      .log({
        organizationId: input.organizationId,
        userId: input.actor.userId ?? undefined,
        action: "channel.job_created",
        resourceType: "channel_job",
        resourceId: job.id,
        metadata: { kind: input.command.kind, risk: input.command.risk, conversationId: input.conversationId },
      })
      .catch(() => { /* audit must never break the flow */ });

    return { jobId: job.id, acked };
  },

  /** Executes one job to completion and notifies the user. */
  async runJob(jobId: string): Promise<"completed" | "failed" | "skipped"> {
    const db = prisma as any;
    const job = await db.whatsAppJob.findUnique({ where: { id: jobId } });
    if (!job) return "skipped";
    if (job.status !== "QUEUED" && job.status !== "RUNNING") return "skipped";

    await db.whatsAppJob.update({
      where: { id: jobId },
      data: { status: "RUNNING", startedAt: job.startedAt ?? new Date(), attempts: { increment: 1 } },
    });

    const params = (job.params ?? {}) as any;
    const command: ParsedCommand = {
      kind: job.kind as any,
      argument: params.argument ?? "",
      raw: job.requestText ?? "",
      requiredPermissions: [],
      risk: params.risk ?? "low",
      async: true,
      describe: params.describe ?? job.kind,
    };
    // Attach the document the user sent so analyze_file has real content.
    if (params.documentText) (command as any).__documentText = params.documentText;

    const actor: CommandActor = {
      organizationId: job.organizationId,
      userId: job.requestedByUserId ?? null,
      agentId: params.agentId ?? null,
      conversationId: params.windelsConversationId ?? null,
    };

    let outcome: { ok: boolean; text: string; workflowId?: string | null; workflowRunId?: string | null };
    try {
      outcome = await executeJob(command, actor);
    } catch (e: any) {
      outcome = { ok: false, text: `That command failed: ${String(e?.message ?? e).slice(0, 200)}` };
    }

    const attempts = (job.attempts ?? 0) + 1;
    const willRetry = !outcome.ok && attempts < MAX_JOB_ATTEMPTS && isRetryable(outcome.text);

    if (willRetry) {
      await db.whatsAppJob.update({
        where: { id: jobId },
        data: { status: "QUEUED", errorMessage: outcome.text.slice(0, 1000) },
      });
      return "failed";
    }

    await db.whatsAppJob.update({
      where: { id: jobId },
      data: {
        status: outcome.ok ? "COMPLETED" : "FAILED",
        completedAt: new Date(),
        resultText: outcome.ok ? outcome.text.slice(0, 8000) : null,
        errorMessage: outcome.ok ? null : outcome.text.slice(0, 1000),
        workflowId: outcome.workflowId ?? job.workflowId ?? null,
        workflowRunId: outcome.workflowRunId ?? job.workflowRunId ?? null,
      },
    });

    await notifyJobResult(job.conversationId, outcome.text, job.organizationId, jobId);

    await auditService
      .log({
        organizationId: job.organizationId,
        userId: job.requestedByUserId ?? undefined,
        action: outcome.ok ? "channel.job_completed" : "channel.job_failed",
        resourceType: "channel_job",
        resourceId: jobId,
        metadata: { kind: job.kind, attempts },
      })
      .catch(() => { /* audit must never break the flow */ });

    return outcome.ok ? "completed" : "failed";
  },

  /**
   * Drains queued jobs. Called from the WhatsApp worker tick, so jobs share the
   * channel's existing lifecycle instead of adding a second scheduler.
   */
  async runTick(): Promise<{ handled: number; failed: number }> {
    const db = prisma as any;
    let handled = 0;
    let failed = 0;

    try {
      // Reclaim jobs whose worker died mid-run.
      await db.whatsAppJob.updateMany({
        where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - RUNNING_TIMEOUT_MS) } },
        data: { status: "QUEUED" },
      });

      const queued = await db.whatsAppJob.findMany({
        where: { status: "QUEUED", attempts: { lt: MAX_JOB_ATTEMPTS } },
        orderBy: { createdAt: "asc" },
        take: MAX_JOBS_PER_TICK,
        select: { id: true },
      });

      for (const { id } of queued) {
        const result = await this.runJob(id).catch((e: any) => {
          logger.warn("whatsapp job crashed", { jobId: id, err: e?.message });
          return "failed" as const;
        });
        if (result === "completed") handled += 1;
        else if (result === "failed") failed += 1;
      }
    } catch (e: any) {
      logger.warn("whatsapp job tick failed", { err: e?.message });
    }

    return { handled, failed };
  },
};

/**
 * Retry only transient-looking failures. A missing workflow or an unconfigured
 * provider will fail identically on the next attempt, and retrying it would
 * spam the user with the same message three times.
 */
function isRetryable(message: string): boolean {
  if (/not configured|could not find|requires a linked|do not know how/i.test(message)) return false;
  return /timeout|timed out|econn|network|rate limit|temporarily|5\d\d/i.test(message);
}

/** Sends the completion message on the same conversation that requested it. */
async function notifyJobResult(
  whatsappConversationId: string,
  text: string,
  organizationId: string,
  jobId: string,
): Promise<void> {
  try {
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: whatsappConversationId },
      select: { id: true, whatsappChannelId: true, contact: { select: { phoneNumber: true } } },
    });
    if (!conversation?.contact?.phoneNumber) return;
    const channel = await prisma.whatsAppChannel.findUnique({ where: { id: conversation.whatsappChannelId } });
    if (!channel) return;

    await WhatsAppMessageService.sendText(channel as any, conversation.contact.phoneNumber, text, {
      conversationId: conversation.id,
    });
    await (prisma as any).whatsAppJob
      .update({ where: { id: jobId }, data: { notifiedAt: new Date() } })
      .catch(() => { /* delivered; bookkeeping is secondary */ });
  } catch (e: any) {
    logger.warn("whatsapp job notification failed", { jobId, organizationId, err: e?.message });
  }
}
