import { prisma } from "../db/client.js";
import { aiRegistry } from "./ai/registry.js";
import { logger } from "../config/logger.js";
import { recallMemories } from "./agentMemory.service.js";
import { retrieveKnowledge } from "./agentKnowledge.service.js";
import { recordAgentEvent, updateAgentStatus } from "./agent.service.js";
import { AppError } from "../utils/result.js";
import { AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE } from "./ai/types.js";
import { pushEvent } from "../http/routes/events.js";
import { renderNamedTemplate } from "./tools/promptRenderer.js";
// Import built-in tools (auto-registers on import)
import "./tools/builtin/index.js";
import type { TaskStatus } from "@prisma/client";

/**
 * Lightweight in-process agent runtime.
 * Polls for tasks assigned to agents, runs them through the AI provider with
 * memory/knowledge context, marks them complete, and records results as a
 * memory + activity + event.
 *
 * A full orchestration engine (queue-based, multi-worker, multi-agent) comes
 * in later sessions (Workflow Builder / Flow); this is the Session 4 minimal
 * vertical slice so assigned tasks actually get done end-to-end.
 */
class AgentRuntime {
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly pollMs = 5_000;

  start() {
    if (this.running) return;
    this.running = true;
    logger.info("agent runtime started", { pollMs: this.pollMs });
    this.tick();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private tick = async () => {
    if (!this.running) return;
    try {
      await this.drainOnce();
    } catch (e) {
      logger.warn("agent runtime tick error", { err: e });
    } finally {
      if (this.running) {
        this.timer = setTimeout(this.tick, this.pollMs);
      }
    }
  };

  private runningTaskIds = new Set<string>();

  private async drainOnce() {
    // Pick up tasks assigned to agents that are TODO and not currently active or running.
    const tasks = await prisma.task.findMany({
      where: {
        agentId: { not: null },
        status: "TODO" as TaskStatus,
        agent: { isNot: null },
      },
      include: { agent: true, creator: { include: { profile: true } }, workspace: true },
      orderBy: { priority: "desc" },
      take: 3,
    });

    for (const task of tasks) {
      if (!task.agent) continue;
      if (this.runningTaskIds.has(task.id)) continue;
      if (task.agent.activeTaskId && task.agent.activeTaskId !== task.id) continue;
      this.runningTaskIds.add(task.id);
      this.runTask(task.id)
        .catch((err) => {
          logger.warn("task run failed", { err, taskId: task.id, agentId: task.agentId });
        })
        .finally(() => this.runningTaskIds.delete(task.id));
    }
  }

  async runTask(taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { agent: true, creator: { include: { profile: true } } },
    });
    if (!task || !task.agent) return;

    // Mark as IN_PROGRESS + agent working
    await prisma.$transaction([
      prisma.task.update({
        where: { id: task.id },
        data: { status: "IN_PROGRESS", progress: 10 },
      }),
      prisma.agent.update({
        where: { id: task.agent.id },
        data: { status: "WORKING", activeTaskId: task.id, lastActivityAt: new Date() },
      }),
    ]);
    await recordAgentEvent(task.agent.id, "TASK_STARTED", `started task: "${task.title}"`, { taskId: task.id });

    // Emit SSE event for real-time UI updates
    pushEvent("agent.task_started", {
      agentId: task.agent.id,
      agentName: task.agent.name,
      taskId: task.id,
      taskTitle: task.title,
      organizationId: task.organizationId,
    });

    try {
      // Build system prompt + memory + knowledge context
      const systemParts: string[] = [];

      // Try to use a named template for the agent's system prompt
      let agentSystemPrompt = task.agent.systemPrompt;
      if (task.agent.systemPrompt?.startsWith("template:")) {
        const templateName = task.agent.systemPrompt.replace("template:", "").trim();
        const rendered = await renderNamedTemplate(templateName, {
          agentName: task.agent.name,
          agentRole: task.agent.role,
          taskTitle: task.title,
          taskDescription: task.description ?? "",
          creatorName: task.creator?.profile?.displayName ?? "User",
        }, task.organizationId);
        if (rendered) {
          agentSystemPrompt = rendered;
        }
      }

      if (agentSystemPrompt) systemParts.push(agentSystemPrompt);
      systemParts.push(
        `You are ${task.agent.name}, ${task.agent.role}. ` +
        `Execute the user's task and respond with a concise result. ` +
        `Stay in character and stay focused.`
      );

      // Pull in relevant memories
      const memories = await recallMemories(task.agent.id, `${task.title} ${task.description ?? ""}`, 6);
      if (memories.length) {
        systemParts.push("\n## Relevant memories:\n" + memories.map((m: any) => `- ${m.content}`).join("\n"));
      }

      // Pull in relevant knowledge
      const knowledge = await retrieveKnowledge(task.agent.id, `${task.title} ${task.description ?? ""}`, 4);
      if (knowledge.length) {
        systemParts.push("\n## Knowledge available:\n" + knowledge.map((k: any) => `### ${k.title}\n${k.content.slice(0, 1500)}`).join("\n\n"));
      }

      const systemPrompt = systemParts.join("\n\n");

      const userContent =
        `Task: ${task.title}\n\n` + (task.description ? `Details:\n${task.description}\n\n` : "") +
        "Please complete this task and return your result.";

      const resolved = aiRegistry.resolve(task.agent.modelId ?? undefined);
      if (!resolved) {
        throw AppError.serviceUnavailable(AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE);
      }
      let result = "";
      let tokensIn = 0, tokensOut = 0;
      const started = Date.now();
      for await (const chunk of aiRegistry.guardedStream({
        model: resolved.model.id,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        stream: true,
      }, { userId: task.creatorId ?? undefined, feature: "agent-runtime" })) {
        if (chunk.type === "token") result += chunk.text ?? "";
        else if (chunk.type === "done") {
          tokensIn = chunk.usage?.tokensIn ?? 0;
          tokensOut = chunk.usage?.tokensOut ?? 0;
        } else if (chunk.type === "error") {
          throw new Error(chunk.error ?? "agent stream error");
        }
        // Update progress periodically
        if (result.length && result.length % 200 < (chunk.text?.length ?? 0)) {
          const progress = Math.min(10 + Math.floor((result.length / 800) * 80), 90);
          await prisma.task.update({
            where: { id: task.id },
            data: { progress },
          }).catch(() => {});

          // Emit progress event
          pushEvent("agent.task_progress", {
            agentId: task.agent.id,
            agentName: task.agent.name,
            taskId: task.id,
            taskTitle: task.title,
            progress,
            resultLength: result.length,
            organizationId: task.organizationId,
          });
        }
      }

      // Persist result in agent memory
      await prisma.agentMemory.create({
        data: {
          agentId: task.agent.id,
          type: "TASK",
          content: `Task "${task.title}" result: ${result.slice(0, 1500)}`,
          source: "task",
          sourceRef: task.id,
          importance: 0.6,
          tags: ["task-result"],
        },
      });

      // Mark task done
      await prisma.$transaction([
        prisma.task.update({
          where: { id: task.id },
          data: {
            status: "DONE",
            progress: 100,
            completedAt: new Date(),
            description: (task.description ? task.description + "\n\n---\n**Agent result:**\n" : "**Agent result:**\n") + result,
          },
        }),
        prisma.agent.update({
          where: { id: task.agent.id },
          data: { status: "ONLINE", activeTaskId: null, lastActivityAt: new Date() },
        }),
        prisma.activity.create({
          data: {
            organizationId: task.organizationId,
            workspaceId: task.workspaceId,
            agentId: task.agent.id,
            type: "TASK_COMPLETED",
            message: `${task.agent.name} completed task "${task.title}"`,
            metadata: { taskId: task.id, durationMs: Date.now() - started, tokensIn, tokensOut },
          },
        }),
      ]);
      await recordAgentEvent(task.agent.id, "TASK_COMPLETED", `completed task: "${task.title}" (${Math.round((Date.now() - started) / 100) / 10}s)`, { taskId: task.id, durationMs: Date.now() - started, tokensIn, tokensOut });

      // Emit completion event
      pushEvent("agent.task_completed", {
        agentId: task.agent.id,
        agentName: task.agent.name,
        taskId: task.id,
        taskTitle: task.title,
        durationMs: Date.now() - started,
        tokensIn,
        tokensOut,
        organizationId: task.organizationId,
      });
    } catch (err: any) {
      await prisma.$transaction([
        prisma.task.update({ where: { id: task.id }, data: { status: "BLOCKED", progress: 0 } }),
        prisma.agent.update({ where: { id: task.agent.id }, data: { status: "ERROR", activeTaskId: null, lastActivityAt: new Date() } }),
      ]);
      await recordAgentEvent(task.agent.id, "TASK_FAILED", `failed task: "${task.title}" — ${err.message}`, { taskId: task.id, error: err.message });
      await prisma.activity.create({
        data: {
          organizationId: task.organizationId,
          workspaceId: task.workspaceId,
          agentId: task.agent.id,
          type: "TASK_UPDATED",
          message: `${task.agent.name} failed on "${task.title}": ${err.message}`,
          metadata: { taskId: task.id, error: err.message },
        },
      });
    }
  }
}

export const agentRuntime = new AgentRuntime();

/** Process any tasks immediately (useful for UI-triggered runs). */
export function kickAgentRuntime() {
  agentRuntime["tick"]();
}
