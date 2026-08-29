import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { PaginationQuery } from "@windels/shared/api";
import { TaskStatus, TaskPriority, ActivityType } from "@prisma/client";
import { z } from "zod";
import { kickAgentRuntime } from "./agentRuntime.service.js";

/**
 * Resolve the user's default organization + workspace (first membership).
 */
export async function resolveUserContext(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    include: { organization: true, workspace: true },
  });
  if (!membership) throw AppError.forbidden("No organization membership found");
  return {
    organizationId: membership.organizationId,
    organization: membership.organization,
    workspaceId: membership.workspaceId,
    workspace: membership.workspace,
  };
}

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueDate: z.string().datetime().optional(),
  agentId: z.string().cuid().optional(),
  workspaceId: z.string().cuid().optional(),
});

export async function getDashboard(ctx: Awaited<ReturnType<typeof resolveUserContext>>) {
  const { organizationId, workspaceId } = ctx;
  const [agents, tasksTotal, tasksActive, tasksDone, tasks, activities] = await Promise.all([
    prisma.agent.findMany({
      where: { organizationId },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      include: {
        activeTask: { select: { id: true, title: true, progress: true } },
      },
    }),
    prisma.task.count({ where: { organizationId, status: { not: TaskStatus.DONE } } }),
    prisma.task.count({ where: { organizationId, status: TaskStatus.IN_PROGRESS } }),
    prisma.task.count({ where: { organizationId, status: TaskStatus.DONE } }),
    prisma.task.findMany({
      where: { organizationId },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
      take: 8,
      include: {
        assignee: { include: { profile: true } },
        agent: true,
        creator: { include: { profile: true } },
      },
    }),
    prisma.activity.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        user: { include: { profile: true } },
        agent: true,
      },
    }),
  ]);

  return {
    organization: { id: ctx.organization.id, name: ctx.organization.name, slug: ctx.organization.slug },
    workspace: ctx.workspace ? { id: ctx.workspace.id, name: ctx.workspace.name, slug: ctx.workspace.slug } : null,
    stats: {
      agentsTotal: agents.length,
      agentsOnline: agents.filter((a: any) => a.status === "ONLINE" || a.status === "WORKING").length,
      tasksActive,
      tasksPending: tasksTotal - tasksActive,
      tasksDone,
    },
    agents: agents.map((a: any) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      color: a.color,
      emoji: a.emoji,
      status: (a.status as string).toLowerCase(),
      lastActivityAt: a.lastActivityAt,
      activeTask: a.activeTask
        ? { id: a.activeTask.id, title: a.activeTask.title, progress: a.activeTask.progress }
        : null,
    })),
    tasks: tasks.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      progress: t.progress,
      dueDate: t.dueDate,
      createdAt: t.createdAt,
      agent: t.agent ? { id: t.agent.id, name: t.agent.name, color: t.agent.color, emoji: t.agent.emoji } : null,
      assignee: t.assignee
        ? { id: t.assignee.id, email: t.assignee.email, displayName: t.assignee.profile?.displayName ?? null }
        : null,
      creator: { id: t.creator.id, email: t.creator.email, displayName: t.creator.profile?.displayName ?? null },
    })),
    activities: activities.map((a: any) => ({
      id: a.id,
      type: a.type,
      message: a.message,
      metadata: a.metadata,
      createdAt: a.createdAt,
      user: a.user
        ? { id: a.user.id, email: a.user.email, displayName: a.user.profile?.displayName ?? null }
        : null,
      agent: a.agent ? { id: a.agent.id, name: a.agent.name, emoji: a.agent.emoji, color: a.agent.color } : null,
    })),
  };
}

export async function listTasks(
  ctx: Awaited<ReturnType<typeof resolveUserContext>>,
  query: PaginationQuery & { status?: string }
) {
  const where: any = { organizationId: ctx.organizationId };
  if (query.status) where.status = query.status;
  if (query.q) where.title = { contains: query.q, mode: "insensitive" };
  const [total, items] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      include: {
        agent: true,
        assignee: { include: { profile: true } },
      },
    }),
  ]);
  return {
    items,
    pagination: {
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.ceil(total / query.perPage),
    },
  };
}

export async function createTask(
  ctx: Awaited<ReturnType<typeof resolveUserContext>>,
  userId: string,
  input: z.infer<typeof CreateTaskSchema>
) {
  const task = await prisma.task.create({
    data: {
      organizationId: ctx.organizationId,
      workspaceId: input.workspaceId ?? ctx.workspaceId ?? undefined,
      title: input.title,
      description: input.description,
      priority: input.priority as TaskPriority,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      agentId: input.agentId,
      creatorId: userId,
    },
  });
  await prisma.activity.create({
    data: {
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
      userId,
      agentId: input.agentId,
      type: ActivityType.TASK_CREATED,
      message: `created task "${input.title}"${input.agentId ? " assigned to AI employee" : ""}`,
      metadata: { taskId: task.id },
    },
  });
  // If assigned to an agent, nudge the runtime to start immediately.
  if (input.agentId) {
    setImmediate(() => kickAgentRuntime());
  }
  return task;
}

export async function updateTaskStatus(
  ctx: Awaited<ReturnType<typeof resolveUserContext>>,
  userId: string,
  taskId: string,
  status: TaskStatus,
  progress?: number
) {
  const existing = await prisma.task.findUnique({
    where: { id: taskId, organizationId: ctx.organizationId },
  });
  if (!existing) throw AppError.notFound("Task not found");
  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      status,
      progress: progress ?? (status === TaskStatus.DONE ? 100 : existing.progress),
      completedAt: status === TaskStatus.DONE ? new Date() : null,
    },
  });
  await prisma.activity.create({
    data: {
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
      userId,
      type: status === TaskStatus.DONE ? ActivityType.TASK_COMPLETED : ActivityType.TASK_UPDATED,
      message: `moved "${task.title}" to ${status.toLowerCase().replace("_", " ")}`,
      metadata: { taskId: task.id, status },
    },
  });
  return task;
}
