/**
 * Telegram channel service — configuration, webhook setup, stats and errors.
 * Mirrors the WhatsApp channel service's role but for the Bot API.
 */
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../../db/client.js";
import { logger } from "../../config/logger.js";
import { TelegramClient } from "./telegramClient.js";
import { encryptBotToken, encryptWebhookSecret, resolveConfig, type TelegramSettings } from "./telegramConfig.js";

export interface SetupChannelInput {
  organizationId: string;
  name?: string;
  botToken: string;
  webhookBaseUrl: string;
  settings?: TelegramSettings;
}

export const TelegramChannelService = {
  async primary(organizationId: string) {
    return prisma.telegramChannel.findFirst({
      where: { organizationId, deletedAt: null, enabled: true },
      orderBy: { createdAt: "asc" },
    });
  },

  async findByBotId(botId: bigint) {
    return prisma.telegramChannel.findFirst({ where: { telegramBotId: botId, deletedAt: null } });
  },

  async list(organizationId: string) {
    return prisma.telegramChannel.findMany({ where: { organizationId, deletedAt: null }, orderBy: { createdAt: "desc" } });
  },

  async get(id: string) {
    return prisma.telegramChannel.findUnique({ where: { id } });
  },

  /**
   * Validate the token against Telegram (getMe), configure the webhook with a
   * per-channel secret, and persist the encrypted credentials.
   */
  async setup(input: SetupChannelInput) {
    const cfg = { botToken: input.botToken };
    const me = await TelegramClient.getMe(cfg);
    if (!me?.id) throw new Error("Telegram returned no bot identity");

    const webhookSecret = randomBytes(24).toString("hex");
    const webhookPath = `/api/v1/channels/telegram/webhook`;
    const webhookUrl = `${input.webhookBaseUrl.replace(/\/$/, "")}${webhookPath}`;
    await TelegramClient.setWebhook(cfg, webhookUrl, webhookSecret);

    const webhookInfo = await TelegramClient.getWebhookInfo(cfg).catch(() => null);

    const data = {
      organizationId: input.organizationId,
      name: input.name ?? me.first_name ?? "WINDELS AI",
      botUsername: me.username ?? null,
      telegramBotId: BigInt(me.id),
      status: "CONNECTED" as const,
      webhookStatus: webhookInfo?.url ? "VERIFIED" as const : "WEBHOOK_SET" as const,
      enabled: true,
      botTokenEnc: encryptBotToken(input.botToken) as any,
      webhookSecretEnc: encryptWebhookSecret(webhookSecret) as any,
      webhookUrl,
      settings: (input.settings ?? {}) as any,
      lastWebhookAt: new Date(),
    };

    // One channel per bot id; update if it already exists.
    const existing = await prisma.telegramChannel.findUnique({ where: { telegramBotId: BigInt(me.id) } });
    if (existing) {
      return prisma.telegramChannel.update({ where: { id: existing.id }, data });
    }
    return prisma.telegramChannel.create({ data });
  },

  async disconnect(id: string) {
    const channel = await prisma.telegramChannel.findUnique({ where: { id } });
    if (!channel) return null;
    const cfg = resolveConfig(channel);
    if (cfg.botToken) {
      await TelegramClient.deleteWebhook({ botToken: cfg.botToken, apiBaseUrl: cfg.apiBaseUrl }).catch((e) =>
        logger.warn("telegram deleteWebhook failed", { err: e?.message }),
      );
    }
    return prisma.telegramChannel.update({
      where: { id },
      data: { enabled: false, status: "DISCONNECTED", webhookStatus: "UNVERIFIED", botTokenEnc: null, webhookSecretEnc: null },
    });
  },

  async setEnabled(id: string, enabled: boolean) {
    return prisma.telegramChannel.update({ where: { id }, data: { enabled } });
  },

  async updateSettings(id: string, settings: TelegramSettings) {
    return prisma.telegramChannel.update({ where: { id }, data: { settings: settings as any } });
  },

  async rotateWebhookSecret(id: string, webhookBaseUrl: string) {
    const channel = await prisma.telegramChannel.findUnique({ where: { id } });
    if (!channel) return null;
    const cfg = resolveConfig(channel);
    if (!cfg.botToken) throw new Error("Bot token not configured");
    const secret = randomBytes(24).toString("hex");
    const webhookUrl = `${webhookBaseUrl.replace(/\/$/, "")}/api/v1/channels/telegram/webhook`;
    await TelegramClient.setWebhook({ botToken: cfg.botToken, apiBaseUrl: cfg.apiBaseUrl }, webhookUrl, secret);
    return prisma.telegramChannel.update({ where: { id }, data: { webhookSecretEnc: encryptWebhookSecret(secret) as any, webhookUrl, webhookStatus: "VERIFIED" } });
  },

  async recordWebhookSeen(id: string) {
    await prisma.telegramChannel.update({ where: { id }, data: { lastWebhookAt: new Date() } }).catch(() => {});
  },

  async recordError(id: string, error: string) {
    await prisma.telegramChannel.update({ where: { id }, data: { lastErrorAt: new Date(), lastError: error.slice(0, 1000), status: "ERROR" } }).catch(() => {});
  },

  /** Tenant-scoped stats for the admin dashboard. */
  async stats(organizationId: string) {
    const [channels, connectedUsers, activeChats, messages24h, failed24h, events24h] = await Promise.all([
      prisma.telegramChannel.count({ where: { organizationId, deletedAt: null } }),
      prisma.telegramConnection.count({ where: { organizationId, status: "LINKED" } }),
      prisma.telegramChat.count({ where: { organizationId, lastMessageAt: { gte: new Date(Date.now() - 24 * 3600_000) } } }),
      prisma.telegramMessage.count({ where: { organizationId, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } } }),
      prisma.telegramWebhookEvent.count({ where: { organizationId, processingStatus: "FAILED", receivedAt: { gte: new Date(Date.now() - 24 * 3600_000) } } }),
      prisma.telegramWebhookEvent.count({ where: { organizationId, receivedAt: { gte: new Date(Date.now() - 24 * 3600_000) } } }),
    ]);
    return { channels, connectedUsers, activeChats, messages24h, failed24h, events24h };
  },

  hashPayload(raw: Buffer | string): string {
    return createHash("sha256").update(raw).digest("hex");
  },
};

export type { TelegramSettings };
