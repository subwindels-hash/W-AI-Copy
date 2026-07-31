import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "./workspace.service.js";
import { z } from "zod";
import { EventBus } from "./eventBus.js";

export const CreatePluginSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be kebab-case"),
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  version: z.string().default("1.0.0"),
  author: z.string().max(100).optional(),
  hooks: z.array(z.string()).default([]),
  config: z.record(z.any()).default({}),
});

// System plugins available to all organizations
const SYSTEM_PLUGINS = [
  { slug: "markdown-export", name: "Markdown Export", description: "Export conversations and canvases to Markdown", version: "1.0.0", author: "Windels", hooks: ["export.markdown"], config: {} },
  { slug: "quick-actions", name: "Quick Actions", description: "Adds AI-powered quick actions to the composer and toolbar", version: "1.0.0", author: "Windels", hooks: ["composer.quick-actions", "toolbar.actions"], config: {} },
  { slug: "template-gallery", name: "Template Gallery", description: "Library of workflow and prompt templates", version: "1.0.0", author: "Windels", hooks: ["workflow.templates", "prompt.templates"], config: {} },
];

export async function ensureSystemPlugins() {
  for (const p of SYSTEM_PLUGINS) {
    const existing = await prisma.plugin.findFirst({ where: { slug: p.slug, organizationId: null } });
    if (!existing) await prisma.plugin.create({ data: { ...p, isSystem: true, enabled: true } });
  }
}
void ensureSystemPlugins().catch(e => console.warn("plugin seed failed:", e?.message));

export async function listPlugins(userId: string) {
  const ctx = await resolveUserContext(userId);
  const [system, custom] = await Promise.all([
    prisma.plugin.findMany({ where: { isSystem: true }, orderBy: { name: "asc" } }),
    prisma.plugin.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" } }),
  ]);
  return { system, custom };
}

export async function installPlugin(userId: string, input: z.infer<typeof CreatePluginSchema>) {
  const ctx = await resolveUserContext(userId);
  const existing = await prisma.plugin.findFirst({ where: { slug: input.slug, organizationId: ctx.organizationId } });
  if (existing) throw AppError.conflict(`Plugin ${input.slug} is already installed`);
  const plugin = await prisma.plugin.create({
    data: { ...input, organizationId: ctx.organizationId, isSystem: false, enabled: true },
  });
  await EventBus.emit("plugin.installed", { pluginId: plugin.id, slug: plugin.slug, organizationId: ctx.organizationId });
  return plugin;
}

export async function togglePlugin(userId: string, id: string, enabled: boolean) {
  const ctx = await resolveUserContext(userId);
  const p = await prisma.plugin.findFirst({ where: { id, OR: [{ organizationId: ctx.organizationId }, { isSystem: true }] } });
  if (!p) throw AppError.notFound("Plugin not found");
  return prisma.plugin.update({ where: { id }, data: { enabled } });
}

export async function configurePlugin(userId: string, id: string, config: Record<string, any>) {
  const ctx = await resolveUserContext(userId);
  const p = await prisma.plugin.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!p) throw AppError.notFound("Plugin not found");
  return prisma.plugin.update({ where: { id }, data: { config } });
}

export async function uninstallPlugin(userId: string, id: string) {
  const ctx = await resolveUserContext(userId);
  const p = await prisma.plugin.findFirst({ where: { id, organizationId: ctx.organizationId, isSystem: false } });
  if (!p) throw AppError.notFound("Plugin not found");
  await prisma.plugin.delete({ where: { id } });
}
