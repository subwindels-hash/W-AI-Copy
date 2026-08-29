import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "./workspace.service.js";
import { z } from "zod";

export const RegisterModelSchema = z.object({
  provider: z.string().min(1).max(40),
  modelId: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  version: z.string().default("1.0"),
  description: z.string().max(1000).optional(),
  capabilities: z.array(z.string()).default(["chat"]),
  contextWindow: z.number().int().min(256).default(128000),
  maxOutputTokens: z.number().int().min(64).default(4096),
  costInputPer1k: z.number().min(0).default(0),
  costOutputPer1k: z.number().min(0).default(0),
  config: z.record(z.any()).default({}),
});

export const UpdateModelSchema = RegisterModelSchema.partial();

// Seed built-in models on first boot
const BUILT_IN_MODELS = [
  { provider: "windels", modelId: "windels-assistant", name: "Windels Assistant", description: "Default Windels assistant model", capabilities: ["chat","tools","vision"], contextWindow: 128000, maxOutputTokens: 4096, costInputPer1k: 0, costOutputPer1k: 0, isDefault: true },
  { provider: "echo", modelId: "echo", name: "Echo (test)", description: "Echo provider for testing — returns your prompt", capabilities: ["chat"], contextWindow: 16000, maxOutputTokens: 1024, costInputPer1k: 0, costOutputPer1k: 0 },
];

export async function ensureSeedModels() {
  for (const m of BUILT_IN_MODELS) {
    const existing = await prisma.modelRegistry.findFirst({ where: { organizationId: null, provider: m.provider, modelId: m.modelId } });
    if (!existing) {
      await prisma.modelRegistry.create({ data: { ...m, version: "1.0", config: {} } });
    }
  }
}

export async function listModels(userId: string) {
  const ctx = await resolveUserContext(userId);
  return prisma.modelRegistry.findMany({
    where: { OR: [{ organizationId: null }, { organizationId: ctx.organizationId }], enabled: true },
    orderBy: [{ isDefault: "desc" }, { provider: "asc" }, { name: "asc" }],
  });
}

export async function registerModel(userId: string, input: z.infer<typeof RegisterModelSchema>) {
  const ctx = await resolveUserContext(userId);
  const existing = await prisma.modelRegistry.findFirst({
    where: { organizationId: ctx.organizationId, provider: input.provider, modelId: input.modelId, version: input.version ?? "1.0" },
  });
  if (existing) throw AppError.conflict("Model already registered");
  return prisma.modelRegistry.create({
    data: { ...input, organizationId: ctx.organizationId, enabled: true },
  });
}

export async function updateModel(userId: string, id: string, input: z.infer<typeof UpdateModelSchema>) {
  const ctx = await resolveUserContext(userId);
  const m = await prisma.modelRegistry.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!m) throw AppError.notFound("Model not found");
  return prisma.modelRegistry.update({ where: { id }, data: input });
}

export async function deleteModel(userId: string, id: string) {
  const ctx = await resolveUserContext(userId);
  const m = await prisma.modelRegistry.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!m) throw AppError.notFound("Model not found");
  await prisma.modelRegistry.delete({ where: { id } });
}

export async function setDefaultModel(userId: string, id: string) {
  const ctx = await resolveUserContext(userId);
  // Clear previous default, then set new one
  await prisma.$transaction([
    prisma.modelRegistry.updateMany({ where: { organizationId: ctx.organizationId, isDefault: true }, data: { isDefault: false } }),
    prisma.modelRegistry.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { isDefault: true } }),
  ]);
}
