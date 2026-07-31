import { prisma } from "../db/client.js";
import { resolveUserContext } from "../services/workspace.service.js";
import { z } from "zod";
import { AppError } from "../utils/result.js";

const builtIns = [
  { title: "Summarize text",     category: "general",  icon: "📝", content: "Summarize the following text in 3 bullet points:\n\n{{text}}", description: "Produce a concise TL;DR." },
  { title: "Explain like I'm 5",  category: "general",  icon: "🧸", content: "Explain the following topic to me as if I were 5 years old:\n\n{{topic}}", description: "Simple explanations." },
  { title: "Code review",        category: "coding",   icon: "🔍", content: "Review the following code for bugs, performance issues, and style problems. Give me numbered findings with suggested fixes:\n\n```\n{{code}}\n```", description: "Review code for issues." },
  { title: "Draft an email",     category: "writing",  icon: "✉️", content: "Draft a professional email about:\n\n{{topic}}\n\nTone: {{tone|professional}}", description: "Write a polished email." },
  { title: "Brainstorm",         category: "creative", icon: "💡", content: "Brainstorm 10 creative ideas for:\n\n{{topic}}", description: "Generate ideas quickly." },
  { title: "Extract action items",category: "analysis",icon: "✅", content: "Extract action items from the conversation/notes below. Format as a markdown checklist with assignees where possible:\n\n{{text}}", description: "Pull tasks from text." },
];

export async function seedBuiltInTemplates(organizationId: string, createdById: string) {
  const existing = await prisma.promptTemplate.count({
    where: { organizationId, isBuiltIn: true },
  });
  if (existing > 0) return;
  await prisma.promptTemplate.createMany({
    data: builtIns.map((b) => ({
      organizationId,
      title: b.title,
      description: b.description,
      category: b.category,
      icon: b.icon,
      content: b.content,
      createdById,
      isBuiltIn: true,
    })),
  });
}

export async function listTemplates(userId: string, category?: string) {
  const ctx = await resolveUserContext(userId);
  await seedBuiltInTemplates(ctx.organizationId, userId);
  return prisma.promptTemplate.findMany({
    where: { organizationId: ctx.organizationId, ...(category ? { category } : {}) },
    orderBy: [{ isBuiltIn: "desc" }, { usageCount: "desc" }, { title: "asc" }],
  });
}

export const CreateTemplateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional(),
  content: z.string().min(1).max(20000),
  category: z.string().trim().min(1).max(40).default("general"),
  icon: z.string().max(8).optional(),
});

export const UpdateTemplateSchema = CreateTemplateSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export async function createTemplate(
  userId: string,
  input: z.infer<typeof CreateTemplateSchema>
) {
  const ctx = await resolveUserContext(userId);
  return prisma.promptTemplate.create({
    data: { ...input, organizationId: ctx.organizationId, createdById: userId },
  });
}

export async function useTemplate(userId: string, id: string, vars: Record<string, string>) {
  const ctx = await resolveUserContext(userId);
  const t = await prisma.promptTemplate.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!t) throw AppError.notFound("Template not found");
  // Replace {{var}} and {{var|default}} with values.
  const rendered = t.content.replace(/\{\{\s*(\w+)(?:\|([^}]*))?\s*\}\}/g, (_, key, def) =>
    vars[key] ?? def ?? ""
  );
  await prisma.promptTemplate.update({ where: { id }, data: { usageCount: { increment: 1 } } });
  return { template: t, rendered };
}

export async function updateTemplate(userId: string, id: string, input: z.infer<typeof UpdateTemplateSchema>) {
  const ctx = await resolveUserContext(userId);
  const template = await prisma.promptTemplate.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!template) throw AppError.notFound("Template not found");
  if (template.isBuiltIn) throw AppError.forbidden("Built-in templates cannot be modified");
  return prisma.promptTemplate.update({ where: { id }, data: input });
}

export async function deleteTemplate(userId: string, id: string) {
  const ctx = await resolveUserContext(userId);
  const t = await prisma.promptTemplate.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!t) throw AppError.notFound("Template not found");
  if (t.isBuiltIn) throw AppError.forbidden("Built-in templates cannot be deleted");
  await prisma.promptTemplate.delete({ where: { id } });
  return { ok: true };
}
