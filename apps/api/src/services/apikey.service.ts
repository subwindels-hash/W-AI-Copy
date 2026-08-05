import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function createApiKey(userId: string, orgId: string, input: z.infer<typeof CreateApiKeySchema>) {
  // API keys are credentials — they must be drawn from the CSPRNG, never
  // Math.random() (predictable keys would let an attacker forge a valid key).
  const key = `ak_${randomBytes(32).toString("base64url")}`;
  return prisma.apiKey.create({
    data: {
      userId,
      organizationId: orgId,
      name: input.name,
      key,
      scopes: input.scopes ?? ["read"],
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      lastUsedAt: null,
    },
  });
}

export async function listApiKeys(userId: string, orgId: string) {
  return prisma.apiKey.findMany({ where: { userId, organizationId: orgId }, orderBy: { createdAt: "desc" } });
}
