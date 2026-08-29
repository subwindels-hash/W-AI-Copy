// Session 105 — Message Attachment contracts.
//
// Attachment bytes remain on the configured filesystem/object store and
// metadata remains in Prisma. The API exposes a normalized metadata shape with
// a real SHA-256 checksum; storage paths and uploader internals never cross the
// JSON boundary.

import { z } from "zod";

export interface AttAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  previewText: string | null;
  conversationId: string | null;
  talkMessageId: string | null;
  createdAt: string;
}

export interface AttAttachmentList {
  items: AttAttachment[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}

export const AttListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});
export type AttListQuery = z.infer<typeof AttListQuerySchema>;

export const AttAttachmentIdSchema = z.object({ id: z.string().cuid() });
export const AttUploadTargetSchema = z.object({
  conversationId: z.string().cuid().optional(),
  talkMessageId: z.string().cuid().optional(),
});
