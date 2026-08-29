/**
 * WhatsApp command execution — Phase 2 §6 and §7.
 *
 * Every branch here delegates to a service that already exists. This file
 * contains no business logic of its own: it translates a parsed WhatsApp
 * command into a call on the Workflow Engine, the Task service, the Media
 * Factory, the Advertising service or plain Prisma reads, and formats the
 * answer for WhatsApp.
 *
 * Split by cost:
 *   executeQuery()  — cheap reads, answered inline inside the worker tick
 *   executeJob()    — expensive work, run by the job worker after an ACK
 */
import { prisma } from "../../db/client.js";
import { logger } from "../../observability/logger.js";
import { aiRegistry } from "../../services/ai/registry.js";
import { createTask } from "../../services/task.service.js";
import { runWorkflow } from "../../services/workflow.service.js";
import { MediaGenService } from "../../mediaGen/mediaGen.service.js";
import type { ParsedCommand } from "./whatsappCommands.js";

export interface CommandActor {
  organizationId: string;
  /** Null when the sender has not linked a WINDELS account. */
  userId: string | null;
  agentId: string | null;
  /** WINDELS Conversation.id, for usage attribution. */
  conversationId: string | null;
}

export interface CommandOutcome {
  text: string;
  /** Set when the command bound to a workflow run, for the job record. */
  workflowId?: string | null;
  workflowRunId?: string | null;
  ok: boolean;
}

function money(cents: number, currency = "USD"): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

// ─── Inline queries ──────────────────────────────────────────────────────────

async function checkPendingTasks(actor: CommandActor): Promise<CommandOutcome> {
  const tasks = await prisma.task.findMany({
    where: {
      organizationId: actor.organizationId,
      status: { in: ["TODO", "IN_PROGRESS"] as any },
      // A linked user sees their own queue; without a linked user we cannot
      // scope to a person, so we do not answer at all (see the guard in the
      // pipeline — this branch is only reached once identity is established).
      ...(actor.userId ? { OR: [{ assigneeId: actor.userId }, { creatorId: actor.userId }] } : {}),
    },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    take: 10,
    select: { title: true, status: true, priority: true, dueDate: true },
  });

  if (tasks.length === 0) return { ok: true, text: "You have no pending tasks. 🎉" };

  const lines = tasks.map((t) => {
    const due = t.dueDate ? ` — due ${new Date(t.dueDate).toISOString().slice(0, 10)}` : "";
    return `• *${t.title}* (${String(t.priority).toLowerCase()}, ${String(t.status).toLowerCase()})${due}`;
  });
  return { ok: true, text: [`*Your pending tasks (${tasks.length})*`, "", ...lines].join("\n") };
}

async function checkAgents(actor: CommandActor): Promise<CommandOutcome> {
  const agents = await prisma.agent.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: { name: true, status: true, type: true },
  });
  if (agents.length === 0) return { ok: true, text: "No agents are configured for your organisation yet." };
  const lines = agents.map((a) => `• *${a.name}* — ${String(a.status).toLowerCase()} (${String(a.type).toLowerCase()})`);
  return { ok: true, text: [`*Your agents (${agents.length})*`, "", ...lines].join("\n") };
}

async function checkSales(actor: CommandActor): Promise<CommandOutcome> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [paid, outstanding] = await Promise.all([
    prisma.invoice.aggregate({
      where: { organizationId: actor.organizationId, status: "paid", paidAt: { gte: since } },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.invoice.aggregate({
      where: { organizationId: actor.organizationId, status: { in: ["open", "draft"] } },
      _sum: { amountCents: true },
      _count: true,
    }),
  ]);

  const paidTotal = paid._sum.amountCents ?? 0;
  const openTotal = outstanding._sum.amountCents ?? 0;

  if (paid._count === 0 && outstanding._count === 0) {
    return { ok: true, text: "No invoices have been recorded for your organisation yet, so there are no sales figures to report." };
  }

  return {
    ok: true,
    text: [
      "*Sales — last 30 days*",
      "",
      `• Collected: *${money(paidTotal)}* across ${paid._count} invoice(s)`,
      `• Outstanding: *${money(openTotal)}* across ${outstanding._count} invoice(s)`,
    ].join("\n"),
  };
}

async function checkCampaigns(actor: CommandActor): Promise<CommandOutcome> {
  // The advertising service keeps campaigns in its own store; read through it
  // rather than reaching into another module's persistence.
  const { AdvertisingService } = await import("../../advertising/advertising.service.js");
  const campaigns = await AdvertisingService.list(actor.organizationId);
  if (!campaigns || campaigns.length === 0) {
    return { ok: true, text: "You have no advertising campaigns yet. Send *create advertisement <brief>* to start one." };
  }
  const lines = campaigns.slice(0, 10).map((c: any) => {
    const spend = typeof c.spentMicros === "number" ? ` — spent ${money(Math.round(c.spentMicros / 10000))}` : "";
    return `• *${c.name}* — ${String(c.status ?? "unknown").toLowerCase()}${spend}`;
  });
  return { ok: true, text: [`*Your campaigns (${campaigns.length})*`, "", ...lines].join("\n") };
}

async function createTaskCommand(cmd: ParsedCommand, actor: CommandActor): Promise<CommandOutcome> {
  if (!actor.userId) {
    return { ok: false, text: "I need to know who you are before I can create a task. Link your WINDELS account first." };
  }
  const title = cmd.argument.slice(0, 200).trim();
  if (!title) return { ok: false, text: "What should the task be called? Try: *create task Review the Q3 numbers*" };

  const task = await createTask(actor.userId, actor.organizationId, { title });
  return { ok: true, text: `✅ Task created: *${task.title}*\nStatus: ${String(task.status).toLowerCase()}` };
}

/**
 * Executes a cheap command inline. Returns null when the command is not a
 * query, meaning the caller must schedule it as a job instead.
 */
export async function executeQuery(cmd: ParsedCommand, actor: CommandActor): Promise<CommandOutcome | null> {
  switch (cmd.kind) {
    case "check_pending_tasks": return checkPendingTasks(actor);
    case "check_agents":        return checkAgents(actor);
    case "check_sales":         return checkSales(actor);
    case "check_campaigns":     return checkCampaigns(actor);
    case "create_task":         return createTaskCommand(cmd, actor);
    default:                    return null;
  }
}

// ─── Background jobs ─────────────────────────────────────────────────────────

/**
 * Generates written deliverables (reports, ad copy, social posts) through the
 * ONE AI brain, with the usage tagged to the existing meter. There is no
 * WhatsApp-specific model and no WhatsApp-specific billing.
 */
async function generateWithAi(
  system: string,
  prompt: string,
  actor: CommandActor,
  maxTokens: number,
): Promise<CommandOutcome> {
  const result = await aiRegistry.complete(
    {
      model: "",
      system,
      messages: [{ role: "user", content: prompt }],
      maxTokens,
      temperature: 0.7,
    },
    {
      // The EXISTING usage meter — WhatsApp is just another feature tag.
      channel: "chat",
      feature: "whatsapp",
      organizationId: actor.organizationId,
      userId: actor.userId ?? undefined,
      agentId: actor.agentId ?? undefined,
      conversationId: actor.conversationId ?? undefined,
    },
  );
  const text = (result?.content ?? "").trim();
  if (!text) return { ok: false, text: "The model returned an empty response. Please try again." };
  return { ok: true, text };
}

async function runWorkflowCommand(cmd: ParsedCommand, actor: CommandActor): Promise<CommandOutcome> {
  if (!actor.userId) {
    return { ok: false, text: "Running a workflow requires a linked WINDELS account." };
  }
  const name = cmd.argument.trim();
  if (!name) return { ok: false, text: "Which workflow should I run? Try: *run workflow Daily Digest*" };

  const workflow = await prisma.workflow.findFirst({
    where: {
      organizationId: actor.organizationId,
      deletedAt: null,
      name: { contains: name, mode: "insensitive" },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
  });
  if (!workflow) {
    return { ok: false, text: `I could not find a workflow matching "${name}". Check the name in the dashboard and try again.` };
  }

  // Delegates to the EXISTING workflow engine, under the requesting user's
  // authority — the engine re-checks org scope itself.
  const run: any = await runWorkflow(actor.userId, workflow.id, {
    input: { source: "whatsapp", request: cmd.raw },
    triggerType: "manual",
  } as any, actor.organizationId);

  const status = String(run?.status ?? "started").toLowerCase();
  return {
    ok: true,
    workflowId: workflow.id,
    workflowRunId: run?.id ?? null,
    text: `▶️ Workflow *${workflow.name}* ${status === "completed" ? "completed" : `is ${status}`}.${
      run?.id ? `\nRun ID: ${run.id}` : ""
    }`,
  };
}

async function createWorkflowCommand(cmd: ParsedCommand, actor: CommandActor): Promise<CommandOutcome> {
  if (!actor.userId) return { ok: false, text: "Creating a workflow requires a linked WINDELS account." };
  const brief = cmd.argument.trim();
  if (!brief) return { ok: false, text: "Describe the workflow you want. Try: *create workflow summarise new leads each morning*" };

  // Designing a workflow graph from a sentence is a modelling task, and doing
  // it blind from WhatsApp would produce a graph nobody reviewed. We draft the
  // specification and hand it to the dashboard for approval instead.
  const draft = await generateWithAi(
    "You are a WINDELS workflow architect. Given a plain-language request, outline a concrete workflow: numbered steps, the trigger, the agents or tools each step uses, and the output. Be specific and brief. Plain text for WhatsApp.",
    brief,
    actor,
    700,
  );
  if (!draft.ok) return draft;

  return {
    ok: true,
    text: `📋 *Proposed workflow*\n\n${draft.text}\n\nOpen the Workflows page in WINDELS to review and activate it.`,
  };
}

async function analyzeFileCommand(cmd: ParsedCommand, actor: CommandActor): Promise<CommandOutcome> {
  // The extracted document text is passed through params by the pipeline.
  const content = (cmd as any).__documentText as string | undefined;
  if (!content) {
    return {
      ok: false,
      text: "Attach the file to your message and I will analyse it. I can read PDF, DOCX, XLSX, CSV and TXT.",
    };
  }
  const focus = cmd.argument.trim() ? `\n\nThe user specifically asked: ${cmd.argument.trim()}` : "";
  return generateWithAi(
    "You are a WINDELS analyst. Analyse the supplied document: summarise it, surface the key figures and risks, and end with concrete recommended actions. Plain text suitable for WhatsApp, no markdown headings.",
    `Document content:\n\n${content}${focus}`,
    actor,
    900,
  );
}

async function createMediaJob(
  cmd: ParsedCommand,
  actor: CommandActor,
  modality: "image" | "audio" | "video",
  op: string,
  label: string,
): Promise<CommandOutcome> {
  if (!actor.userId) return { ok: false, text: `Creating ${label} requires a linked WINDELS account.` };
  const brief = cmd.argument.trim();
  if (!brief) return { ok: false, text: `Describe the ${label} you want.` };

  try {
    // The Media Factory is the existing generation pipeline; it enforces its
    // own quota and safety checks, which we must not duplicate or bypass.
    const job: any = await MediaGenService.submit(actor.organizationId, actor.userId, {
      modality, op, prompt: brief,
    });
    return {
      ok: true,
      text: `🎬 ${label} generation queued in the Media Factory.\nJob: ${job?.id ?? "created"}\nYou will find the result on the Media Factory page when it finishes.`,
    };
  } catch (e: any) {
    return { ok: false, text: `Could not queue ${label}: ${String(e?.message ?? e).slice(0, 200)}` };
  }
}

/**
 * Executes an expensive command. Called by the job worker, never on the
 * webhook path.
 */
export async function executeJob(cmd: ParsedCommand, actor: CommandActor): Promise<CommandOutcome> {
  try {
    switch (cmd.kind) {
      case "run_workflow":    return await runWorkflowCommand(cmd, actor);
      case "create_workflow": return await createWorkflowCommand(cmd, actor);
      case "analyze_file":    return await analyzeFileCommand(cmd, actor);

      case "create_report":
        return await generateWithAi(
          "You are a WINDELS business analyst. Produce a concise, well-structured report on the requested topic using the facts supplied. Where data is missing, say so explicitly rather than inventing figures. Plain text suitable for WhatsApp.",
          cmd.argument || cmd.raw,
          actor, 1200,
        );

      case "create_advertisement":
        return await generateWithAi(
          "You are a WINDELS advertising copywriter. Produce ad copy for the brief: a headline, a primary text, a call to action, and three variant headlines. Plain text suitable for WhatsApp.",
          cmd.argument || cmd.raw,
          actor, 800,
        );

      case "create_social_post":
        return await generateWithAi(
          "You are a WINDELS social media manager. Write a platform-appropriate post for the brief, with relevant hashtags, then two alternative versions. Plain text suitable for WhatsApp.",
          cmd.argument || cmd.raw,
          actor, 700,
        );

      case "create_music_track":
        return await createMediaJob(cmd, actor, "audio", "music", "the music track");

      case "create_music_video":
        return await createMediaJob(cmd, actor, "video", "text-to-video", "the music video");

      default:
        return { ok: false, text: `I do not know how to run "${cmd.kind}" yet.` };
    }
  } catch (e: any) {
    const code = String(e?.code ?? "");
    if (code === "AI_PROVIDER_CONFIGURATION_REQUIRED") {
      // Honest failure: never a fabricated deliverable.
      return { ok: false, text: "No AI provider is configured on this WINDELS instance, so I cannot generate that. An administrator needs to add a provider API key." };
    }
    logger.warn("whatsapp command execution failed", { kind: cmd.kind, err: e?.message });
    return { ok: false, text: `That command failed: ${String(e?.message ?? e).slice(0, 200)}` };
  }
}
