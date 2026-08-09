-- Session: Chat conversation-management sidebar upgrade.
--
-- Extends the existing Conversation model with pin-timestamp / archive state
-- and adds share-link entities. This is purely additive: no existing column or
-- table is dropped, and existing rows get safe defaults.

-- Conversation: archive + pin timestamp columns.
ALTER TABLE "Conversation"
  ADD COLUMN "pinnedAt" TIMESTAMP(3),
  ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Back-fill pinnedAt from the existing pinned flag so already-pinned chats
-- keep their visual placement (with a deterministic timestamp).
UPDATE "Conversation"
SET "pinnedAt" = "createdAt"
WHERE "pinned" = true AND "pinnedAt" IS NULL;

-- Share links.
CREATE TABLE "ConversationShare" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "access" TEXT NOT NULL DEFAULT 'anyone_with_link',
  "permissions" TEXT NOT NULL DEFAULT 'view',
  "allowed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "passwordHash" TEXT,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastAccessedAt" TIMESTAMP(3),
  "accessCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConversationShare_pkey" PRIMARY KEY ("id")
);

-- Access history for a share link (who accessed, granted or not).
CREATE TABLE "ConversationShareAccess" (
  "id" TEXT NOT NULL,
  "shareId" TEXT NOT NULL,
  "userId" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "granted" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConversationShareAccess_pkey" PRIMARY KEY ("id")
);

-- Indexes + FKs.
CREATE UNIQUE INDEX "ConversationShare_token_key" ON "ConversationShare"("token");
CREATE INDEX "ConversationShare_conversationId_idx" ON "ConversationShare"("conversationId");
CREATE INDEX "ConversationShare_createdById_idx" ON "ConversationShare"("createdById");
CREATE INDEX "ConversationShare_expiresAt_idx" ON "ConversationShare"("expiresAt");
CREATE INDEX "ConversationShareAccess_shareId_idx" ON "ConversationShareAccess"("shareId");
CREATE INDEX "Conversation_org_archive_pin_idx" ON "Conversation"("organizationId", "isArchived", "pinned", "lastMessageAt");
CREATE INDEX "Conversation_org_title_idx" ON "Conversation"("organizationId", "title");

ALTER TABLE "ConversationShare"
  ADD CONSTRAINT "ConversationShare_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationShare"
  ADD CONSTRAINT "ConversationShare_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationShareAccess"
  ADD CONSTRAINT "ConversationShareAccess_shareId_fkey"
  FOREIGN KEY ("shareId") REFERENCES "ConversationShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
