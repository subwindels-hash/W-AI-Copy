import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db/client.js";
import { resolveUserContext } from "../services/workspace.service.js";
import { AppError } from "../utils/result.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const MAX_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "text/plain", "text/markdown", "text/csv",
  "application/pdf", "application/json",
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function safeFilename(name: string) {
  return name.replace(/[^\w.]+/g, "_").slice(0, 120) || "upload";
}

function extractTextPreview(mime: string, buffer: Buffer): string | null {
  if (mime.startsWith("text/") || mime === "application/json") return buffer.toString("utf8").slice(0, 8000);
  return null;
}

async function assertTargetInOrganization(organizationId: string, opts: { conversationId?: string; talkMessageId?: string }) {
  if (opts.conversationId) {
    const conversation = await prisma.conversation.findFirst({ where: { id: opts.conversationId, organizationId, deletedAt: null }, select: { id: true } });
    if (!conversation) throw AppError.notFound("Conversation not found");
  }
  if (opts.talkMessageId) {
    const message = await prisma.talkMessage.findFirst({ where: { id: opts.talkMessageId, channel: { organizationId } }, select: { id: true } });
    if (!message) throw AppError.notFound("Talk message not found");
  }
}

export async function uploadAttachment(
  userId: string,
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  opts: { conversationId?: string; talkMessageId?: string } = {},
) {
  if (!file.size) throw AppError.badRequest("File is empty");
  if (file.size > MAX_SIZE) throw AppError.badRequest("File exceeds 25MB limit");
  if (!ALLOWED_MIME.has(file.mimetype)) throw AppError.badRequest(`File type ${file.mimetype} not allowed`);

  const ctx = await resolveUserContext(userId);
  await assertTargetInOrganization(ctx.organizationId, opts);
  const checksum = createHash("sha256").update(file.buffer).digest("hex");
  const storageKey = `${ctx.organizationId}/${checksum.slice(0, 8)}-${safeFilename(file.originalname)}`;
  const fullPath = path.join(UPLOAD_DIR, storageKey);

  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, file.buffer, { flag: "wx" }).catch(async (error: NodeJS.ErrnoException) => {
    // A same-name/same-content upload may race. The existing file is equivalent.
    if (error.code !== "EEXIST") throw error;
  });

  try {
    return await prisma.messageAttachment.create({
      data: {
        organizationId: ctx.organizationId,
        conversationId: opts.conversationId ?? null,
        talkMessageId: opts.talkMessageId ?? null,
        uploaderId: userId,
        filename: safeFilename(file.originalname),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
        checksum,
        extractedText: extractTextPreview(file.mimetype, file.buffer),
      },
    });
  } catch (error) {
    // Do not remove a potentially pre-existing, equivalent object.
    throw error;
  }
}

export async function getAttachmentBytes(userId: string, id: string) {
  const ctx = await resolveUserContext(userId);
  const attachment = await prisma.messageAttachment.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!attachment) throw AppError.notFound("Attachment not found");
  try {
    return { attachment, buffer: await readFile(path.join(UPLOAD_DIR, attachment.storageKey)) };
  } catch (error: any) {
    if (error?.code === "ENOENT") throw AppError.notFound("Attachment file not found");
    throw error;
  }
}

export async function listAttachments(userId: string, input: { q?: string; page: number; perPage: number }) {
  const ctx = await resolveUserContext(userId);
  const where = {
    organizationId: ctx.organizationId,
    ...(input.q ? { filename: { contains: input.q, mode: "insensitive" as const } } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.messageAttachment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (input.page - 1) * input.perPage, take: input.perPage }),
    prisma.messageAttachment.count({ where }),
  ]);
  return { items, pagination: { page: input.page, perPage: input.perPage, total, totalPages: Math.ceil(total / input.perPage) } };
}

export async function deleteAttachment(userId: string, id: string) {
  const ctx = await resolveUserContext(userId);
  const attachment = await prisma.messageAttachment.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!attachment) throw AppError.notFound("Attachment not found");
  if (attachment.uploaderId !== userId) throw AppError.forbidden("Only the uploader can delete this attachment");
  if (attachment.messageId || attachment.talkMessageId) throw AppError.badRequest("Attached files cannot be deleted; remove the message instead");
  await prisma.messageAttachment.delete({ where: { id } });
  await unlink(path.join(UPLOAD_DIR, attachment.storageKey)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
}

export async function claimTalkAttachments(userId: string, organizationId: string, attachmentIds: string[]) {
  if (!attachmentIds.length) return [];
  const attachments = await prisma.messageAttachment.findMany({ where: { id: { in: attachmentIds }, organizationId, uploaderId: userId, messageId: null, talkMessageId: null } });
  if (attachments.length !== attachmentIds.length) throw AppError.badRequest("One or more attachments are unavailable");
  return attachments.map((attachment) => attachment.id);
}

export async function claimConversationAttachments(userId: string, organizationId: string, conversationId: string, attachmentIds: string[]) {
  if (!attachmentIds.length) return [];
  const attachments = await prisma.messageAttachment.findMany({ where: { id: { in: attachmentIds }, organizationId, uploaderId: userId, messageId: null, talkMessageId: null } });
  if (attachments.length !== attachmentIds.length) throw AppError.badRequest("One or more attachments are unavailable");
  // Uploaded attachments may already be associated with this conversation, but never another one.
  if (attachments.some((a) => a.conversationId && a.conversationId !== conversationId)) throw AppError.badRequest("Attachment belongs to another conversation");
  return attachments.map((a) => a.id);
}
