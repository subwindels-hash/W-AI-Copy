/**
 * Session 23 — Prompt Templates Library (Session 119 completion).
 *
 * This file remains Session 23's service: every export keeps its name and
 * behaviour. Session 119 changed only the internals listed below, fixed three
 * defects, and moved the module's *new* surface (usage ledger + statistics) to
 * `promptTemplatesUsage.service.ts` so the Session 23 code stays readable.
 *
 * Session 119 fixes (all behaviour-preserving for correct inputs):
 *   1. `{{name | default}}` — a space around the pipe — leaked the raw
 *      placeholder into the rendered prompt because the Session 23 pattern
 *      required the pipe immediately after the name. Rendering now lives in
 *      the shared `renderPromptTemplate` pure function, which handles it.
 *   2. `useTemplate` reported nothing when a variable was neither supplied
 *      nor defaulted; it substituted an empty string silently. The response
 *      now adds `unresolved: string[]` (new field; `template`/`rendered` are
 *      unchanged) so the caller can surface the hole.
 *   3. `updateTemplate` / `deleteTemplate` / `useTemplate` raced: the row was
 *      looked up org-scoped, then mutated with `where: { id }`. If the row
 *      vanished in between, Prisma threw P2025 and the API answered 500
 *      instead of 404. Those calls now map P2025 to not-found.
 *
 * New exports (additive): `getTemplate` (there was no way to fetch a single
 * template), `duplicateTemplate` (built-ins cannot be edited, so the console
 * needs a copy-to-edit path), and `listTemplates` accepts an options object
 * (`q` substring search, `limit`) while the old `(userId, category?)`
 * signature keeps working.
 */
import { prisma } from "../db/client.js";
import { resolveUserContext } from "../services/workspace.service.js";
import { AppError } from "../utils/result.js";
import {
  PROMPT_TEMPLATE_MAX_TITLE,
  PromptTemplateCreateSchema,
  PromptTemplateUpdateSchema,
  renderPromptTemplate,
} from "@windels/shared/promptTemplates";
import type {
  PromptTemplateCreateInput,
  PromptTemplateDuplicateInput,
  PromptTemplateUpdateInput,
} from "@windels/shared/promptTemplates";
import { recordTemplateUse } from "./promptTemplatesUsage.service.js";

// Backwards-compatible re-exports: Session 23 declared these schemas here and
// the route file imported them from this module. They now live in the shared
// contract; the names are kept so any other importer keeps compiling.
export { PromptTemplateCreateSchema as CreateTemplateSchema, PromptTemplateUpdateSchema as UpdateTemplateSchema };

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

export interface ListTemplatesOptions {
  /** Case-insensitive substring match over title/content/description. Applied
   *  after the org/category filter; labelled as substring search in the
   *  console, not relevance ranking. */
  q?: string;
  /** Cap the result count (1–100). */
  limit?: number;
}

export async function listTemplates(userId: string, category?: string, options?: ListTemplatesOptions) {
  const ctx = await resolveUserContext(userId);
  await seedBuiltInTemplates(ctx.organizationId, userId);
  const q = options?.q?.trim().toLowerCase();
  let rows = await prisma.promptTemplate.findMany({
    where: { organizationId: ctx.organizationId, ...(category ? { category } : {}) },
    orderBy: [{ isBuiltIn: "desc" }, { usageCount: "desc" }, { title: "asc" }],
  });
  if (q) {
    rows = rows.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.content.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q),
    );
  }
  if (options?.limit !== undefined) rows = rows.slice(0, options.limit);
  return rows;
}

export async function getTemplate(userId: string, id: string) {
  const ctx = await resolveUserContext(userId);
  const t = await prisma.promptTemplate.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!t) throw AppError.notFound("Template not found");
  return t;
}

export async function createTemplate(
  userId: string,
  input: PromptTemplateCreateInput
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
  // Render with the shared pure function: `{{var | default}}` resolves (the
  // Session 23 pattern leaked it), and holes are reported, not hidden.
  const { rendered, missing } = renderPromptTemplate(t.content, vars ?? {});
  try {
    await prisma.promptTemplate.update({ where: { id }, data: { usageCount: { increment: 1 } } });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") throw AppError.notFound("Template not found");
    throw e;
  }
  // Best-effort event ledger; never blocks or fails the use itself.
  await recordTemplateUse(ctx.organizationId, t.id, userId, new Date()).catch(() => {});
  return { template: t, rendered, unresolved: missing };
}

export async function updateTemplate(userId: string, id: string, input: PromptTemplateUpdateInput) {
  const ctx = await resolveUserContext(userId);
  const template = await prisma.promptTemplate.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!template) throw AppError.notFound("Template not found");
  if (template.isBuiltIn) throw AppError.forbidden("Built-in templates cannot be modified");
  try {
    return await prisma.promptTemplate.update({ where: { id }, data: input });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") throw AppError.notFound("Template not found");
    throw e;
  }
}

/** Copy a template (built-in or user) into a new editable user template.
 *  Built-ins cannot be edited or deleted, so this is the correction path:
 *  the copy is a normal user template with `isBuiltIn: false`. */
export async function duplicateTemplate(
  userId: string,
  id: string,
  input?: PromptTemplateDuplicateInput,
) {
  const ctx = await resolveUserContext(userId);
  const t = await prisma.promptTemplate.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!t) throw AppError.notFound("Template not found");
  const title = input?.title?.trim() || copyTitle(t.title);
  return prisma.promptTemplate.create({
    data: {
      organizationId: ctx.organizationId,
      title,
      description: t.description,
      category: t.category,
      icon: t.icon,
      content: t.content,
      createdById: userId,
      isBuiltIn: false,
    },
  });
}

function copyTitle(title: string): string {
  const suffix = " (copy)";
  if (title.length + suffix.length <= PROMPT_TEMPLATE_MAX_TITLE) return `${title}${suffix}`;
  return `${title.slice(0, PROMPT_TEMPLATE_MAX_TITLE - suffix.length)}${suffix}`;
}

export async function deleteTemplate(userId: string, id: string) {
  const ctx = await resolveUserContext(userId);
  const t = await prisma.promptTemplate.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!t) throw AppError.notFound("Template not found");
  if (t.isBuiltIn) throw AppError.forbidden("Built-in templates cannot be deleted");
  try {
    await prisma.promptTemplate.delete({ where: { id } });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") throw AppError.notFound("Template not found");
    throw e;
  }
  return { ok: true };
}
