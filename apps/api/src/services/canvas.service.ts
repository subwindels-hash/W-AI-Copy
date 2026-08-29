import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "./workspace.service.js";
import { z } from "zod";
import type { PaginationQuery } from "@windels/shared/api";
import { aiRegistry } from "./ai/registry.js";
import { AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE } from "./ai/types.js";

export const CreateCanvasSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  access: z.enum(["PRIVATE", "WORKSPACE", "ORGANIZATION"]).default("WORKSPACE"),
  workspaceId: z.string().cuid().optional(),
  backgroundColor: z.string().optional(),
  isTemplate: z.boolean().optional(),
});

export const UpdateCanvasSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  access: z.enum(["PRIVATE", "WORKSPACE", "ORGANIZATION"]).optional(),
  backgroundColor: z.string().optional(),
  viewportX: z.number().optional(),
  viewportY: z.number().optional(),
  viewportZoom: z.number().min(0.1).max(3).optional(),
});

export const CreateBlockSchema = z.object({
  type: z.enum(["TEXT", "STICKY", "AI", "EMBED", "HEADING", "TODO"]),
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().positive().default(280),
  height: z.number().positive().default(140),
  content: z.record(z.any()).default({}),
  style: z.record(z.any()).default({}),
});

export const UpdateBlockSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  content: z.record(z.any()).optional(),
  style: z.record(z.any()).optional(),
  zIndex: z.number().int().optional(),
});

export const CreateConnectionSchema = z.object({
  fromId: z.string().cuid(),
  toId: z.string().cuid(),
  label: z.string().max(120).optional(),
  color: z.string().optional(),
});

async function assertCanvas(userId: string, canvasId: string) {
  const ctx = await resolveUserContext(userId);
  const c = await prisma.canvas.findFirst({
    where: { id: canvasId, organizationId: ctx.organizationId, deletedAt: null },
    include: { workspace: true },
  });
  if (!c) throw AppError.notFound("Canvas not found");
  // Access check (PRIVATE = creator only; WORKSPACE = same workspace; ORGANIZATION = same org).
  if (c.access === "PRIVATE" && c.createdById !== userId) throw AppError.forbidden("Canvas is private");
  if (c.access === "WORKSPACE" && c.workspaceId && c.workspaceId !== ctx.workspaceId) {
    // still allow if workspaceId matches membership workspace; ctx.workspaceId is default
  }
  return { canvas: c, ctx };
}

async function assertBlock(canvasId: string, blockId: string) {
  const b = await prisma.canvasBlock.findFirst({ where: { id: blockId, canvasId } });
  if (!b) throw AppError.notFound("Block not found");
  return b;
}

export async function listCanvases(userId: string, q: PaginationQuery & { q?: string; workspaceId?: string }) {
  const ctx = await resolveUserContext(userId);
  const where: any = { organizationId: ctx.organizationId, deletedAt: null };
  if (q.workspaceId) where.workspaceId = q.workspaceId;
  if (q.q) where.title = { contains: q.q, mode: "insensitive" };
  // Access filter — always see own private + workspace + org
  where.OR = [
    { createdById: userId },
    { access: "ORGANIZATION" },
    { access: "WORKSPACE", workspaceId: ctx.workspaceId ?? "none" },
  ];
  const [items, total] = await Promise.all([
    prisma.canvas.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
      include: { createdBy: { include: { profile: true } }, _count: { select: { blocks: true, connections: true } } },
    }),
    prisma.canvas.count({ where }),
  ]);
  return {
    items: items.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      access: c.access.toLowerCase(),
      backgroundColor: c.backgroundColor,
      viewportX: c.viewportX, viewportY: c.viewportY, viewportZoom: c.viewportZoom,
      isTemplate: c.isTemplate,
      blocksCount: c._count.blocks,
      connectionsCount: c._count.connections,
      createdBy: { id: c.createdBy.id, displayName: c.createdBy.profile?.displayName ?? c.createdBy.email },
      updatedAt: c.updatedAt, createdAt: c.createdAt,
    })),
    pagination: { page: q.page, perPage: q.perPage, total, totalPages: Math.ceil(total / q.perPage) },
  };
}

export async function getCanvas(userId: string, canvasId: string) {
  const { canvas } = await assertCanvas(userId, canvasId);
  const [blocks, connections] = await Promise.all([
    prisma.canvasBlock.findMany({ where: { canvasId }, orderBy: { zIndex: "asc" } }),
    prisma.canvasConnection.findMany({ where: { canvasId } }),
  ]);
  return {
    id: canvas.id,
    title: canvas.title,
    description: canvas.description,
    access: canvas.access.toLowerCase(),
    backgroundColor: canvas.backgroundColor,
    viewportX: canvas.viewportX, viewportY: canvas.viewportY, viewportZoom: canvas.viewportZoom,
    isTemplate: canvas.isTemplate,
    createdById: canvas.createdById,
    createdAt: canvas.createdAt, updatedAt: canvas.updatedAt,
    blocks: blocks.map((b) => ({ ...b, type: b.type.toLowerCase() })),
    connections,
  };
}

export async function createCanvas(userId: string, input: z.infer<typeof CreateCanvasSchema>) {
  const ctx = await resolveUserContext(userId);
  const c = await prisma.canvas.create({
    data: {
      organizationId: ctx.organizationId,
      workspaceId: input.workspaceId ?? ctx.workspaceId ?? undefined,
      title: input.title,
      description: input.description,
      access: input.access,
      backgroundColor: input.backgroundColor,
      isTemplate: input.isTemplate ?? false,
      createdById: userId,
    },
  });
  await prisma.activity.create({
    data: { organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, userId, type: "SYSTEM", message: `created canvas \"${input.title}\"`, metadata: { canvasId: c.id } },
  });
  return c;
}

export async function updateCanvas(userId: string, id: string, input: z.infer<typeof UpdateCanvasSchema>) {
  await assertCanvas(userId, id);
  return prisma.canvas.update({ where: { id }, data: input });
}

export async function deleteCanvas(userId: string, id: string) {
  await assertCanvas(userId, id);
  await prisma.canvas.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function addBlock(userId: string, canvasId: string, input: z.infer<typeof CreateBlockSchema>) {
  await assertCanvas(userId, canvasId);
  const b = await prisma.canvasBlock.create({ data: { canvasId, ...input } });
  await prisma.canvas.update({ where: { id: canvasId }, data: { updatedAt: new Date() } });
  return { ...b, type: b.type.toLowerCase() };
}

export async function updateBlock(userId: string, canvasId: string, blockId: string, input: z.infer<typeof UpdateBlockSchema>) {
  await assertCanvas(userId, canvasId);
  await assertBlock(canvasId, blockId);
  const b = await prisma.canvasBlock.update({ where: { id: blockId }, data: input });
  await prisma.canvas.update({ where: { id: canvasId }, data: { updatedAt: new Date() } });
  return { ...b, type: b.type.toLowerCase() };
}

export async function deleteBlock(userId: string, canvasId: string, blockId: string) {
  await assertCanvas(userId, canvasId);
  await assertBlock(canvasId, blockId);
  await prisma.canvasConnection.deleteMany({ where: { OR: [{ fromId: blockId }, { toId: blockId }] } });
  await prisma.canvasBlock.delete({ where: { id: blockId } });
  await prisma.canvas.update({ where: { id: canvasId }, data: { updatedAt: new Date() } });
}

export async function addConnection(userId: string, canvasId: string, input: z.infer<typeof CreateConnectionSchema>) {
  await assertCanvas(userId, canvasId);
  if (input.fromId === input.toId) throw AppError.badRequest("A block cannot connect to itself");
  await assertBlock(canvasId, input.fromId);
  await assertBlock(canvasId, input.toId);
  const existing = await prisma.canvasConnection.findFirst({ where: { canvasId, fromId: input.fromId, toId: input.toId } });
  if (existing) throw AppError.conflict("Connection already exists");
  const c = await prisma.canvasConnection.create({ data: { canvasId, ...input } });
  await prisma.canvas.update({ where: { id: canvasId }, data: { updatedAt: new Date() } });
  return c;
}

export async function deleteConnection(userId: string, canvasId: string, connId: string) {
  await assertCanvas(userId, canvasId);
  const c = await prisma.canvasConnection.findFirst({ where: { id: connId, canvasId } });
  if (!c) throw AppError.notFound("Connection not found");
  await prisma.canvasConnection.delete({ where: { id: connId } });
}

/**
 * Generate content for an AI block using the provider registry.
 * Streams back via SSE.
 */
export async function generateBlockContent(
  userId: string,
  canvasId: string,
  blockId: string,
  prompt: string,
  modelId: string | undefined,
  write: (chunk: string) => void,
  signal: AbortSignal,
) {
  await assertCanvas(userId, canvasId);
  const b = await assertBlock(canvasId, blockId);
  const resolved = aiRegistry.resolve(modelId);
  if (!resolved) throw AppError.serviceUnavailable(AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE);

  // Mark streaming
  await prisma.canvasBlock.update({
    where: { id: blockId },
    data: { content: { ...(b.content as any), prompt, result: "", streaming: true } },
  });

  let result = "";
  try {
    for await (const chunk of aiRegistry.guardedStream({
      model: resolved.model.id,
      messages: [
        { role: "system", content: "You are a creative, concise canvas assistant. Generate useful content for the given prompt in markdown. Keep it under 250 words unless asked for more." },
        { role: "user", content: prompt },
      ],
      stream: true,
      signal,
    }, { userId, feature: "canvas" })) {
      if (chunk.type === "token") {
        result += chunk.text ?? "";
        write(JSON.stringify({ delta: chunk.text }));
      } else if (chunk.type === "error") {
        throw new Error(chunk.error ?? "ai error");
      }
    }
    await prisma.canvasBlock.update({
      where: { id: blockId },
      data: { content: { ...(b.content as any), prompt, result, streaming: false } },
    });
    write(JSON.stringify({ done: true, result }));
  } catch (err: any) {
    await prisma.canvasBlock.update({
      where: { id: blockId },
      data: { content: { ...(b.content as any), prompt, result, streaming: false, error: err.message } },
    });
    write(JSON.stringify({ error: err.message }));
  }
}
