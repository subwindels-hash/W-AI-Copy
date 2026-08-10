// Session 104 — API key management contracts.
//
// Plaintext keys are returned only from create responses. List/detail records
// contain prefixes and hashes are never exposed across the API boundary.

import { z } from "zod";

export const API_KEY_SCOPES = ["READ", "WRITE", "ADMIN"] as const;
export type AkScope = (typeof API_KEY_SCOPES)[number];

export interface AkApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: AkScope[];
  granularScopes: string[];
  appId: string | null;
  environment: string;
  ipRestrictions: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revoked: boolean;
  revokedAt: string | null;
  createdBy: { id: string; displayName: string };
  createdAt: string;
}

export interface AkApiKeyCreated {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  scopes: AkScope[];
  granularScopes: string[];
  environment: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface AkApiKeyMutation {
  id: string;
  name: string;
  scopes: AkScope[];
  granularScopes: string[];
  environment: string;
  revoked: boolean;
  revokedAt: string | null;
  /** Session 120 — present on update responses (renewal sets it). */
  expiresAt: string | null;
}

export const AkApiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(3).default(["READ"]),
  granularScopes: z.array(z.string().min(3).max(64)).max(50).optional(),
  appId: z.string().cuid().optional(),
  environment: z.enum(["development", "test", "production"]).optional(),
  ipRestrictions: z.array(z.string().min(7).max(64)).max(20).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});
export type AkApiKeyCreateInput = z.infer<typeof AkApiKeyCreateSchema>;

export const AkApiKeyUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(3).optional(),
  granularScopes: z.array(z.string().min(3).max(64)).max(50).optional(),
  appId: z.string().cuid().optional().nullable(),
  environment: z.enum(["development", "test", "production"]).optional(),
  ipRestrictions: z.array(z.string().min(7).max(64)).max(20).optional(),
  revoked: z.boolean().optional(),
  /** Session 120 — renewal path: extend an expiring key's life from now.
   *  Rejected for revoked keys by the service. */
  expiresInDays: z.number().int().min(1).max(365).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");
export type AkApiKeyUpdateInput = z.infer<typeof AkApiKeyUpdateSchema>;

export const AkApiKeyListQuerySchema = z.object({
  includeRevoked: z.coerce.boolean().default(false),
});
export type AkApiKeyListQuery = z.infer<typeof AkApiKeyListQuerySchema>;
export const AkApiKeyIdSchema = z.object({ id: z.string().cuid() });
