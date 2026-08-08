import { z } from "zod";
export const PUB_PLATFORMS = ["youtube","tiktok","instagram","facebook","x","pinterest"] as const;
export type PubPlatform = typeof PUB_PLATFORMS[number];
export interface PublishingPlatformInfo { id: string; displayName?: string; connected?: boolean; status?: string; }
export interface PubJobInfo { id: string; platform: string; status: string; }
export const publishingRoutesSchema = {
  platform: z.object({ platform: z.enum(PUB_PLATFORMS) }),
  jobId: z.object({ id: z.string().min(1) }),
  uploadKind: z.object({ kind: z.string().min(1) }),
  registerWebhook: z.object({ endpoint: z.string().url() }),
  publish: z.object({ jobId: z.string().min(1), options: z.record(z.unknown()).optional() }),
};
