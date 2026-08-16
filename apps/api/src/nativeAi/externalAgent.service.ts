import { randomUUID } from "node:crypto";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { nativeComplete } from "./nativeAi.service.js";
import { dispatchEvent } from "../services/webhook.service.js";
import { recordAgentEvent } from "../agents/agents.service.js";
import type { NativeChatCompletionInput } from "@windels/shared/nativeAiApi";

const active = new Map<string, AbortController>();
export interface ExternalAgentContext { organizationId: string; userId: string; apiKeyId: string }

function publicRun(run: any) {
  return {
    id: run.id, object: "agent.run", agent_id: run.agentId, status: run.status,
    model: run.model ? "windels-native" : null, input: run.input, output: run.output,
    usage: run.usage, tool_calls: run.toolCalls ?? 0,
    error: run.errorCode ? { code: run.errorCode, message: run.errorMessage } : null,
    started_at: run.startedAt instanceof Date ? run.startedAt.toISOString() : run.startedAt,
    completed_at: run.completedAt instanceof Date ? run.completedAt.toISOString() : run.completedAt,
  };
}

export async function listExternalAgents(ctx: ExternalAgentContext) {
  return prisma.agent.findMany({
    where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" },
    select: { id: true, name: true, description: true, role: true, department: true, capabilities: true, status: true, modelId: true, isBuiltIn: true, createdAt: true },
  }).then((agents) => agents.map((agent) => ({ id: agent.id, object: "agent", name: agent.name, description: agent.description, role: agent.role, department: agent.department, capabilities: agent.capabilities, status: agent.status, model: agent.modelId ? "windels-native" : null, owned_by: "organization", created: Math.floor(agent.createdAt.getTime() / 1000) })));
}
export async function getExternalAgent(ctx: ExternalAgentContext, id: string) {
  const rows = await listExternalAgents(ctx); const agent = rows.find((item) => item.id === id);
  if (!agent) throw AppError.notFound("Agent not found"); return agent;
}

export async function executeExternalAgent(ctx: ExternalAgentContext, agentId: string, input: {
  messages: NativeChatCompletionInput["messages"];
  tools?: NativeChatCompletionInput["tools"];
  temperature?: number;
  max_tokens?: number;
}, idempotencyKey: string = randomUUID()) {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, organizationId: ctx.organizationId } });
  if (!agent) throw AppError.notFound("Agent not found");
  const existing = await prisma.externalAgentRun.findFirst({ where: { organizationId: ctx.organizationId, idempotencyKey } });
  if (existing) return publicRun(existing);
  const run = await prisma.externalAgentRun.create({ data: {
    organizationId: ctx.organizationId, agentId: agent.id, apiKeyId: ctx.apiKeyId,
    requestedById: ctx.userId, idempotencyKey, status: "running", model: "windels-native",
    input: { messages: input.messages, tools: input.tools ?? [] }, output: {}, usage: {},
  } });
  await prisma.externalAgentMessage.createMany({ data: input.messages.map((message) => ({ runId: run.id, role: message.role, content: typeof message.content === "string" ? message.content : JSON.stringify(message.content), toolCallId: message.tool_call_id ?? null })) });
  await dispatchEvent(ctx.organizationId, "agent.run.started", { runId: run.id, agentId: agent.id }).catch(() => {});
  await recordAgentEvent(agent.id, "TASK_STARTED", "External API agent run started", { runId: run.id, apiKeyId: ctx.apiKeyId }).catch(() => {});
  const controller = new AbortController(); active.set(run.id, controller);
  try {
    const messages: NativeChatCompletionInput["messages"] = [
      ...(agent.systemPrompt ? [{ role: "system" as const, content: agent.systemPrompt }] : []),
      ...input.messages,
    ];
    const result = await nativeComplete({ model: "windels-native", messages, tools: input.tools, stream: false, temperature: input.temperature ?? agent.temperature, max_tokens: input.max_tokens ?? agent.maxTokens }, { userId: ctx.userId, organizationId: ctx.organizationId, signal: controller.signal });
    const output = { content: result.content, tool_calls: result.toolCalls };
    const completed = await prisma.externalAgentRun.update({ where: { id: run.id }, data: {
      status: result.finishReason === "tool_calls" ? "requires_action" : "completed",
      output, usage: result.usage, provider: result.provider, toolCalls: result.toolCalls.length,
      completedAt: new Date(),
    } });
    if (result.content) await prisma.externalAgentMessage.create({ data: { runId: run.id, role: "assistant", content: result.content } });
    await dispatchEvent(ctx.organizationId, result.finishReason === "tool_calls" ? "agent.run.requires_action" : "agent.run.completed", { runId: run.id, agentId: agent.id, status: completed.status }).catch(() => {});
    await recordAgentEvent(agent.id, "TASK_COMPLETED", "External API agent run completed", { runId: run.id, status: completed.status, tokensIn: result.usage.tokensIn, tokensOut: result.usage.tokensOut }).catch(() => {});
    return publicRun(completed);
  } catch (error: any) {
    const cancelled = controller.signal.aborted;
    const failed = await prisma.externalAgentRun.update({ where: { id: run.id }, data: { status: cancelled ? "cancelled" : "failed", errorCode: cancelled ? "cancelled" : (error?.code ?? "agent_run_failed"), errorMessage: cancelled ? "Run cancelled" : String(error?.message ?? error).slice(0, 1000), completedAt: new Date() } });
    await dispatchEvent(ctx.organizationId, cancelled ? "agent.run.cancelled" : "agent.run.failed", { runId: run.id, agentId: agent.id, errorCode: failed.errorCode }).catch(() => {});
    await recordAgentEvent(agent.id, "TASK_FAILED", "External API agent run failed", { runId: run.id, errorCode: failed.errorCode }).catch(() => {});
    return publicRun(failed);
  } finally { active.delete(run.id); }
}

export async function getExternalAgentRun(ctx: ExternalAgentContext, agentId: string, runId: string) {
  const run = await prisma.externalAgentRun.findFirst({ where: { id: runId, agentId, organizationId: ctx.organizationId } });
  if (!run) throw AppError.notFound("Agent run not found"); return publicRun(run);
}
export async function cancelExternalAgentRun(ctx: ExternalAgentContext, agentId: string, runId: string) {
  const run = await prisma.externalAgentRun.findFirst({ where: { id: runId, agentId, organizationId: ctx.organizationId } });
  if (!run) throw AppError.notFound("Agent run not found");
  if (!["running", "queued"].includes(run.status)) throw AppError.conflict(`Agent run is already ${run.status}`);
  await prisma.externalAgentRun.update({ where: { id: run.id }, data: { cancelRequestedAt: new Date() } });
  active.get(run.id)?.abort(new Error("cancelled"));
  return { id: run.id, object: "agent.run", status: "cancelling" };
}
