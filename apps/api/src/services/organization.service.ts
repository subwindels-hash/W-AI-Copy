import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "./workspace.service.js";
import { z } from "zod";

export const UpdateWhiteLabelSchema = z.object({
  appName: z.string().min(1).max(60).optional(),
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  brandingHidden: z.boolean().optional(),
  supportEmail: z.string().email().optional().nullable(),
});

export const UpdateOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  whiteLabel: UpdateWhiteLabelSchema.optional(),
});

export async function getOrganization(userId: string) {
  const ctx = await resolveUserContext(userId);
  const org = await prisma.organization.findUnique({ where: { id: ctx.organizationId } });
  if (!org) throw AppError.notFound("Organization not found");
  return {
    id: org.id, name: org.name, slug: org.slug, logoUrl: org.logoUrl,
    whiteLabel: (org.whiteLabel as any) ?? {},
    createdAt: org.createdAt,
  };
}

export async function updateOrganization(userId: string, input: z.infer<typeof UpdateOrgSchema>) {
  const ctx = await resolveUserContext(userId);
  const actor = await prisma.user.findUnique({ where: { id: userId } });
  if (!actor || (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN")) {
    throw AppError.forbidden("Only admins can update organization settings");
  }
  const data: any = {};
  if (input.name) data.name = input.name;
  if (input.whiteLabel) {
    const existing = (await prisma.organization.findUnique({ where: { id: ctx.organizationId } }))?.whiteLabel as any ?? {};
    data.whiteLabel = { ...existing, ...input.whiteLabel };
  }
  return prisma.organization.update({ where: { id: ctx.organizationId }, data });
}
