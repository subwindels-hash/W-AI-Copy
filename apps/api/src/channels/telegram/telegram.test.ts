/**
 * Telegram channel tests.
 *
 * In-memory Prisma + Redis fakes exercise: webhook secret verification,
 * command parsing, secure account linking, outbound delivery, and pipeline
 * delegation to the EXISTING AI brain (stubbed so we verify delegation, not a
 * model). No real Telegram network calls are made.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { store, prismaMock, fakeRedis, sentMessages, aiComplete } = vi.hoisted(() => {
  const store: Record<string, any[]> = { telegramWebhookEvent: [], telegramMessage: [], telegramChat: [], telegramConnection: [], telegramChannel: [], message: [], conversation: [] };
  const sentMessages: any[] = [];
  const aiComplete = vi.fn(async () => ({ content: "WINDELS_AI_REPLY", model: "stub", usage: { tokensIn: 1, tokensOut: 1 } }));
  const fakeRedis: Record<string, any> = {};
  const prismaMock: any = {
    telegramChannel: {
      findMany: vi.fn(async () => store.telegramChannel),
      findFirst: vi.fn(async ({ where }: any = {}) => store.telegramChannel.find((c) => !c.deletedAt && (!where?.enabled || c.enabled)) ?? null),
      findUnique: vi.fn(async ({ where }: any) => store.telegramChannel.find((c) => c.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => { const i = store.telegramChannel.findIndex((c) => c.id === where.id); if (i >= 0) store.telegramChannel[i] = { ...store.telegramChannel[i], ...data }; return store.telegramChannel[i]; }),
      create: vi.fn(async ({ data }: any) => { const c = { id: "ch1", ...data }; store.telegramChannel.push(c); return c; }),
    },
    telegramWebhookEvent: {
      create: vi.fn(async ({ data }: any) => {
        if (store.telegramWebhookEvent.some((e) => Number(e.updateId) === Number(data.updateId))) { const e: any = new Error("unique"); e.code = "P2002"; throw e; }
        const row = { id: "ev1", ...data, processedAt: null }; store.telegramWebhookEvent.push(row); return row;
      }),
      update: vi.fn(async ({ where, data }: any) => { const e = store.telegramWebhookEvent.find((x) => Number(x.updateId) === Number(where.updateId)); if (e) Object.assign(e, data); return e; }),
    },
    telegramChat: {
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const existing = store.telegramChat.find((c) => c.channelId === where.channelId_telegramChatId.channelId && c.telegramChatId === where.channelId_telegramChatId.telegramChatId);
        if (existing) return Object.assign(existing, update);
        const c = { id: "chat1", ...create }; store.telegramChat.push(c); return c;
      }),
      findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => null), update: vi.fn(async () => ({})),
    },
    telegramMessage: { create: vi.fn(async ({ data }: any) => { const m = { id: "tm1", ...data }; store.telegramMessage.push(m); return m; }) },
    telegramConnection: {
      findUnique: vi.fn(async ({ where }: any) =>
        store.telegramConnection.find((c) =>
          (where.id && c.id === where.id) ||
          (where.channelId_telegramUserId && c.channelId === where.channelId_telegramUserId.channelId && c.telegramUserId === where.channelId_telegramUserId.telegramUserId)
        ) ?? null),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async ({ where, data }: any) => { const i = store.telegramConnection.findIndex((c) => c.id === where.id); store.telegramConnection[i] = { ...store.telegramConnection[i], ...data }; return store.telegramConnection[i]; }),
      create: vi.fn(async ({ data }: any) => { const c = { id: "conn1", ...data }; store.telegramConnection.push(c); return c; }),
    },
    message: {
      create: vi.fn(async ({ data }: any) => { const m = { id: "m1", ...data }; store.message.push(m); return m; }),
      update: vi.fn(async () => ({})),
      findMany: vi.fn(async () => []),
    },
    conversation: { create: vi.fn(async ({ data }: any) => ({ id: "conv1", ...data })), update: vi.fn(async () => ({})) },
    membership: { findFirst: vi.fn(async () => ({ userId: "owner1" })) },
  };
  return { store, prismaMock, fakeRedis, sentMessages, aiComplete };
});

vi.mock("../../db/client.js", () => ({ prisma: prismaMock }));
vi.mock("../../db/redis.js", () => ({ redisCmd: {
  get: vi.fn(async (k: string) => fakeRedis[k] ?? null),
  set: vi.fn(async (k: string, v: any, ...rest: any[]) => { fakeRedis[k] = v; return "OK"; }),
  del: vi.fn(async (k: string) => { delete fakeRedis[k]; return 1; }),
  incr: vi.fn(async (k: string) => { fakeRedis[k] = (Number(fakeRedis[k]) || 0) + 1; return fakeRedis[k]; }),
  expire: vi.fn(async () => 1), rpush: vi.fn(async () => 1), lpop: vi.fn(async () => null),
  llen: vi.fn(async () => 0), keys: vi.fn(async () => []), eval: vi.fn(async () => [1, 0, "0"]),
} }));
vi.mock("../../config/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../observability/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../services/ai/registry.js", () => ({ aiRegistry: { complete: aiComplete } }));
vi.mock("../../services/ai/types.js", () => ({ AI_PROVIDER_CONFIGURATION_REQUIRED_MESSAGE: "No AI provider configured." }));
vi.mock("../../permissions/permissions.module.js", () => ({ permissionsModule: { hasPermission: vi.fn(async () => true) } }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: vi.fn(async () => {}) } }));

vi.mock("./telegramClient.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, TelegramClient: { ...actual.TelegramClient,
    sendMessage: vi.fn(async (_c: any, opts: any) => { sentMessages.push(opts); return { message_id: 100 + sentMessages.length } as any; }),
    sendChatAction: vi.fn(async () => true),
  } };
});
vi.mock("../../security/encryption.js", () => ({
  encryptString: (s: string) => ({ v: "enc.v1", kid: "k1", data: Buffer.from(s).toString("base64") }),
  decryptString: (b: any) => Buffer.from(b.data, "base64").toString("utf8"),
}));

import { TelegramIdentityService } from "./telegramIdentity.service.js";
import { TelegramOutbound } from "./telegramOutbound.js";
import { parseCommand } from "./telegramCommands.js";
import { verifyWebhookSecret } from "./telegramClient.js";

function channel(over: any = {}) {
  return {
    id: "ch1", organizationId: "org1", name: "WINDELS", botUsername: "windels_bot",
    telegramBotId: 12345n, status: "CONNECTED", webhookStatus: "VERIFIED", enabled: true,
    apiBaseUrl: "https://api.telegram.org",
    botTokenEnc: { v: "enc.v1", kid: "k1", data: Buffer.from("123:abc").toString("base64") },
    webhookSecretEnc: { v: "enc.v1", kid: "k1", data: Buffer.from("secret").toString("base64") },
    settings: { mediaEnabled: true, imageVision: true, maxFileMb: 25, responseMode: "ai" },
    ...over,
  };
}

beforeEach(() => {
  for (const k of Object.keys(store)) store[k] = [];
  for (const k of Object.keys(fakeRedis)) delete fakeRedis[k];
  sentMessages.length = 0; aiComplete.mockClear();
});

describe("webhook security", () => {
  it("constant-time secret comparison", () => {
    expect(verifyWebhookSecret(undefined, "sec")).toBe(false);
    expect(verifyWebhookSecret("wrong", "sec")).toBe(false);
    expect(verifyWebhookSecret("sec", "sec")).toBe(true);
  });
});

describe("commands", () => {
  it("parses supported commands", () => {
    expect(parseCommand("/start tok")?.name).toBe("start");
    expect(parseCommand("/start tok")?.argument).toBe("tok");
    expect(parseCommand("/usage")?.name).toBe("usage");
    expect(parseCommand("/nope")).toBeNull();
    expect(parseCommand("hello")).toBeNull();
  });
});

describe("identity linking", () => {
  it("issues and consumes a single-use token, then rejects reuse", async () => {
    const ch = channel(); store.telegramChannel.push(ch);
    const issued = await TelegramIdentityService.issueLinkingToken({ userId: "user1", organizationId: "org1", channelId: "ch1" });
    expect(issued.token).toBeTruthy();
    const id = await TelegramIdentityService.resolveConnection(ch, { id: 999, username: "alice", first_name: "Alice" });
    expect(id.isLinked).toBe(false);
    expect((await TelegramIdentityService.consumeLinkingToken({ channelId: "ch1", connectionId: id.connectionId, telegramUserId: 999n, token: issued.token })).ok).toBe(true);
    expect((await TelegramIdentityService.consumeLinkingToken({ channelId: "ch1", connectionId: id.connectionId, telegramUserId: 999n, token: issued.token })).ok).toBe(false);
  });

  it("rejects a token for a different channel", async () => {
    const ch = channel(); store.telegramChannel.push(ch);
    const issued = await TelegramIdentityService.issueLinkingToken({ userId: "user1", organizationId: "org1", channelId: "ch1" });
    const id = await TelegramIdentityService.resolveConnection(ch, { id: 1, first_name: "X" });
    expect((await TelegramIdentityService.consumeLinkingToken({ channelId: "other", connectionId: id.connectionId, telegramUserId: 1n, token: issued.token })).ok).toBe(false);
  });
});

describe("outbound delivery", () => {
  it("returns a config error without a bot token", async () => {
    const r = await TelegramOutbound.sendText(channel({ botTokenEnc: null }), 555, "hi");
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("TELEGRAM_CONFIGURATION_REQUIRED");
  });
  it("sends via the Bot API when configured", async () => {
    const ch = channel(); store.telegramChannel.push(ch);
    store.telegramChat.push({ id: "chat1", channelId: "ch1", telegramChatId: 555n });
    const r = await TelegramOutbound.sendText(ch, 555, "hello");
    expect(r.ok).toBe(true);
    expect(sentMessages[0].text).toBe("hello");
  });
});

describe("pipeline delegation", () => {
  it("gates private-data requests for unlinked users", async () => {
    const { TelegramPipeline } = await import("./telegramPipeline.js");
    const ch = channel(); store.telegramChannel.push(ch);
    const id = await TelegramIdentityService.resolveConnection(ch, { id: 42, first_name: "Bob" });
    await TelegramPipeline.process({ channel: ch, identity: id, chat: { id: 42, type: "private" }, message: { id: 1, text: "What is my billing status?" } });
    expect(aiComplete).not.toHaveBeenCalled();
    expect(sentMessages.some((m) => /link/i.test(m.text))).toBe(true);
  });

  it("routes normal messages to the existing AI brain", async () => {
    const { TelegramPipeline } = await import("./telegramPipeline.js");
    const ch = channel(); store.telegramChannel.push(ch);
    const id = await TelegramIdentityService.resolveConnection(ch, { id: 7, first_name: "Lin" });
    await prismaMock.telegramConnection.update({ where: { id: id.connectionId }, data: { linkedUserId: "user1", status: "LINKED", linkedAt: new Date() } });
    id.isLinked = true; id.linkedUserId = "user1";
    await TelegramPipeline.process({ channel: ch, identity: id, chat: { id: 7, type: "private" }, message: { id: 2, text: "Help me analyze this business idea." } });
    expect(aiComplete).toHaveBeenCalled();
    expect(sentMessages.some((m) => m.text === "WINDELS_AI_REPLY")).toBe(true);
  });
});
