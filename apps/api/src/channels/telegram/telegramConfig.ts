/**
 * Telegram channel configuration.
 *
 * Bot token and webhook secret are stored AES-256-GCM encrypted via the existing
 * security/encryption module. `resolveConfig` decrypts for the worker only; API
 * responses never include secrets.
 */
import type { TelegramChannel } from "@prisma/client";
import { encryptString, decryptString, type EncryptedBlob } from "../../security/encryption.js";

export interface TelegramResolvedConfig {
  botToken: string | null;
  webhookSecret: string | null;
  apiBaseUrl: string;
  settings: TelegramSettings;
}

export interface TelegramSettings {
  welcomeMessage?: string;
  mediaEnabled?: boolean;
  voiceEnabled?: boolean;
  imageVision?: boolean;
  maxFileMb?: number;
  allowedAgentIds?: string[];
  responseMode?: "ai" | "off" | "human";
  maintenanceMode?: boolean;
  allowedUserIds?: number[];
  maxTokens?: number;
}

export function resolveConfig(channel: TelegramChannel): TelegramResolvedConfig {
  const token = channel.botTokenEnc ? decryptString(channel.botTokenEnc as unknown as EncryptedBlob) : null;
  const secret = channel.webhookSecretEnc ? decryptString(channel.webhookSecretEnc as unknown as EncryptedBlob) : null;
  return {
    botToken: token,
    webhookSecret: secret,
    apiBaseUrl: channel.apiBaseUrl,
    settings: (channel.settings as TelegramSettings) ?? {},
  };
}

export function encryptBotToken(token: string) {
  return encryptString(token);
}
export function encryptWebhookSecret(secret: string) {
  return encryptString(secret);
}
