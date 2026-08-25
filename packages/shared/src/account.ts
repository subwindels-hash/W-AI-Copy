import { z } from "zod";

export const PIN_TTL_MS = 24 * 60 * 60 * 1000;

export const UsernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9._-]+$/, "Username may contain letters, numbers, dots, underscores and hyphens");

export const PinSchema = z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits");

export const PublicUserIdSchema = z.string().regex(/^\d{6}$/, "User ID must be exactly 6 digits");

export interface AccountSnapshot {
  id: string;
  publicUserId: string;
  username: string;
  email: string;
  emailPending: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: "user" | "admin" | "super_admin";
  isActive: boolean;
  isSuspended: boolean;
  pinSet: boolean;
  pinExpired: boolean;
  pinExpiresAt: string | null;
}

export const AccountUsernameSchema = z.object({ username: UsernameSchema });
export const AccountEmailSchema = z.object({ email: z.string().trim().email() });
export const AccountPasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200),
  confirmPassword: z.string().min(10).max(200),
});
export const AccountPinSetSchema = z.object({
  currentPin: PinSchema.optional(),
  newPin: PinSchema,
  confirmPin: PinSchema,
});
export const AccountProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  avatarUrl: z.string().trim().max(500).nullable().optional(),
  bio: z.string().max(2000).optional(),
});
export const AccountAvatarSchema = z.object({
  mime: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  dataBase64: z.string().min(16).max(2_000_000),
});

export const LoginIdentifierSchema = z.object({
  identifier: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().min(1).max(200).optional(),
  password: z.string().min(1),
}).refine((d) => Boolean(d.identifier || d.email), { message: "Username, email or User ID is required" });

export interface ImpersonationSession {
  impersonationId: string;
  adminId: string;
  adminEmail: string;
  targetId: string;
  targetPublicUserId: string | null;
  targetUsername: string | null;
  startedAt: string;
}

export interface AdmActivityRow {
  id: string;
  action: string;
  actorUserId: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}
