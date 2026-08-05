import { z } from "zod";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";

export const CreateActivitySchema = z.object({
  action: z.string().min(1).max(200),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});

export async function createActivity(userId: string, input: z.infer<typeof CreateActivitySchema>, orgId?: string) {
  return prisma.activity.create({
    data: {
      userId,
      organizationId: orgId ?? null,
      action: input.action,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata ?? {},
    },
  });
}

export async function listActivities(query: { userId?: string; organizationId?: string; action?: string; page?: number; perPage?: number }) {
  const page = query.page ?? 1;
  const perPage = Math.min(query.perPage ?? 20, 100);
  const where: any = {};
  if (query.userId) where.userId = query.userId;
  if (query.organizationId) where.organizationId = query.organizationId;
  if (query.action) where.action = query.action;
  const [items, total] = await Promise.all([
    prisma.activity.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * perPage, take: perPage }),
    prisma.activity.count({ where }),
  ]);
  return { items, total, page, perPage };
}
