-- Telegram Bot Channel
CREATE TABLE IF NOT EXISTS "telegram_channels" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'WINDELS AI',
  "botUsername" TEXT,
  "telegramBotId" BIGINT,
  "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
  "webhookStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "apiBaseUrl" TEXT NOT NULL DEFAULT 'https://api.telegram.org',
  "botTokenEnc" JSONB,
  "webhookSecretEnc" JSONB,
  "allowedUserIds" BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],
  "settings" JSONB NOT NULL DEFAULT '{}',
  "webhookUrl" TEXT,
  "lastWebhookAt" TIMESTAMP(3),
  "lastErrorAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "telegram_channels_telegramBotId_key" UNIQUE("telegramBotId")
);
CREATE INDEX IF NOT EXISTS "telegram_channels_org_enabled_idx" ON "telegram_channels"("organizationId","enabled") WHERE "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "telegram_connections" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "telegramUserId" BIGINT NOT NULL,
  "telegramUsername" TEXT,
  "displayName" TEXT,
  "linkedUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'LINKED',
  "linkedAt" TIMESTAMP(3),
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "telegram_connections_channel_user_unique" UNIQUE("channelId","telegramUserId")
);
CREATE INDEX IF NOT EXISTS "telegram_connections_org_idx" ON "telegram_connections"("organizationId");
CREATE INDEX IF NOT EXISTS "telegram_connections_linked_idx" ON "telegram_connections"("linkedUserId");

CREATE TABLE IF NOT EXISTS "telegram_chats" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "connectionId" TEXT,
  "telegramChatId" BIGINT NOT NULL,
  "chatType" TEXT NOT NULL,
  "title" TEXT,
  "windelsConversationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "telegram_chats_channel_chat_unique" UNIQUE("channelId","telegramChatId")
);
CREATE INDEX IF NOT EXISTS "telegram_chats_org_last_idx" ON "telegram_chats"("organizationId","lastMessageAt");
CREATE INDEX IF NOT EXISTS "telegram_chats_windels_conv_idx" ON "telegram_chats"("windelsConversationId");

CREATE TABLE IF NOT EXISTS "telegram_messages" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "telegramUpdateId" BIGINT NOT NULL UNIQUE,
  "telegramMessageId" BIGINT,
  "direction" TEXT NOT NULL,
  "messageType" TEXT NOT NULL DEFAULT 'TEXT',
  "text" TEXT,
  "mediaId" TEXT,
  "mimeType" TEXT,
  "fileSize" INTEGER,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "windelsMessageId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DELIVERED',
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "telegram_messages_org_created_idx" ON "telegram_messages"("organizationId","createdAt");
CREATE INDEX IF NOT EXISTS "telegram_messages_chat_created_idx" ON "telegram_messages"("chatId","createdAt");

CREATE TABLE IF NOT EXISTS "telegram_webhook_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "updateId" BIGINT NOT NULL UNIQUE,
  "eventType" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "processingStatus" TEXT NOT NULL DEFAULT 'RECEIVED',
  "error" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "telegram_webhook_events_org_received_idx" ON "telegram_webhook_events"("organizationId","receivedAt");

CREATE TABLE IF NOT EXISTS "telegram_link_tokens" (
  "tokenHash" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "channelId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "telegram_link_tokens_user_status_idx" ON "telegram_link_tokens"("userId","status");
