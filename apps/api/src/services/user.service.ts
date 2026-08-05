import { z } from "zod";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";

export const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  locale: z.string().min(2).max(10).optional(),
  timezone: z.string().min(1).max(50).optional(),
  theme: z.enum(["dark", "light", "system"]).optional(),
  bio: z.string().max(2000).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

export async function getUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true, memberships: { take: 1, include: { organization: true, workspace: true } } },
  });
  if (!user) throw AppError.notFound("User not found");
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    isSuspended: user.isSuspended,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    profile: user.profile
      ? {
          displayName: user.profile.displayName,
          avatarUrl: user.profile.avatarUrl,
          locale: user.profile.locale,
          timezone: user.profile.timezone,
          theme: user.profile.theme,
          bio: user.profile.bio,
          metadata: user.profile.metadata,
        }
      : null,
    organization: user.memberships[0]?.organization
      ? { id: user.memberships[0].organization.id, name: user.memberships[0].organization.name, slug: user.memberships[0].organization.slug }
      : null,
    workspace: user.memberships[0]?.workspace
      ? { id: user.memberships[0].workspace.id, name: user.memberships[0].workspace.name, slug: user.memberships[0].workspace.slug }
      : null,
  };
}

export async function updateProfile(userId: string, input: z.infer<typeof UpdateProfileSchema>) {
  const existing = await prisma.userProfile.findUnique({ where: { userId } });
  const data: any = {};
  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
  if (input.locale !== undefined) data.locale = input.locale;
  if (input.timezone !== undefined) data.timezone = input.timezone;
  if (input.theme !== undefined) data.theme = input.theme;
  if (input.bio !== undefined) data.bio = input.bio;
  if (input.metadata !== undefined) data.metadata = input.metadata;
  if (existing) {
    return prisma.userProfile.update({ where: { userId }, data });
  }
  return prisma.userProfile.create({ data: { userId, ...data } });
}

export async function validateUserExists(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw AppError.notFound("User not found");
  return user;
}
