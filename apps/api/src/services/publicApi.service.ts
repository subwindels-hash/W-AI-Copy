import { z } from "zod";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";

export const PublicApiSchema = z.object({
  endpoint: z.string().min(1).max(200),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  docsUrl: z.string().url().optional(),
  rateLimit: z.number().int().min(1).optional(),
});

export async function registerPublicEndpoint(orgId: string, input: z.infer<typeof PublicApiSchema>) {
  return prisma.integration.create({
    data: {
      organizationId: orgId,
      name: input.endpoint,
      type: "public_api",
      config: JSON.stringify({ method: input.method, docsUrl: input.docsUrl, rateLimit: input.rateLimit ?? 100 }),
      status: "active",
    },
  });
}

export async function listPublicEndpoints(orgId: string) {
  return prisma.integration.findMany({ where: { organizationId: orgId, type: "public_api" } });
}
