import { z } from "zod";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { TaskStatus, TaskPriority } from "@prisma/client";

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  workspaceId: z.string().cuid().optional(),
  assigneeId: z.string().cuid().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  dueDate: z.string().datetime().optional(),
});

export async function createTask(actorId: string, orgId: string, input: z.infer<typeof CreateTaskSchema>) {
  return prisma.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      organizationId: orgId,
      workspaceId: input.workspaceId ?? null,
      creatorId: actorId,
      assigneeId: input.assigneeId ?? null,
      status: TaskStatus.TODO,
      priority: (input.priority as TaskPriority) ?? TaskPriority.MEDIUM,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
    },
  });
}

export async function updateTask(taskId: string, input: Partial<z.infer<typeof CreateTaskSchema>> & { status?: TaskStatus; progress?: number }) {
  const data: any = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (input.status !== undefined) {
    data.status = input.status;
    if (input.status === TaskStatus.DONE && !data.completedAt) data.completedAt = new Date();
  }
  if (input.progress !== undefined) data.progress = input.progress;
  return prisma.task.update({ where: { id: taskId }, data });
}

export async function getTask(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { creator: true, assignee: true, workspace: true } });
  if (!task) throw AppError.notFound("Task not found");
  return task;
}
