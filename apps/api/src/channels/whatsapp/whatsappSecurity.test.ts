/**
 * Channel security (Phase 1 §18 — "unauthorized channel access, cross-user,
 * cross-org, invalid credentials, permission enforcement", plus the §8 identity
 * linking contract and the §3/§10 credential-protection rules).
 *
 * Encryption is NOT mocked here: the real AES-256-GCM helpers run, so the test
 * proves secrets are actually unreadable at rest rather than trusting a stub.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeRedis } from "./testUtils/fakeRedis.js";
import { createWaPrisma } from "./testUtils/waPrisma.js";

const redis = new FakeRedis();
const wa = createWaPrisma();
const db = wa.db;

const sendText = vi.fn();

vi.mock("../../db/redis.js", () => ({ redisCmd: redis, redis, redisSub: redis }));
vi.mock("../../db/client.js", () => ({ prisma: wa.prisma }));
vi.mock("./whatsappMessage.service.js", () => ({
  WhatsAppMessageService: { sendText, sendMedia: vi.fn(), applyStatusUpdate: vi.fn(), markRead: vi.fn() },
}));

const { WhatsAppChannelService, toChannelDTO, resolveConfig, toCredentials } =
  await import("./whatsappChannel.service.js");
const { WhatsAppIdentityService } = await import("./whatsappIdentity.service.js");
const { verifyWebhookSignature, verifyTokenMatches, normalizePhoneNumber } =
  await import("./whatsappClient.js");
const { createHmac } = await import("node:crypto");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const USER_A = "user-alpha";
const USER_B = "user-beta";

// Synthetic fixture only. Deliberately not shaped like a real Meta token so that
// secret scanners do not flag it; its only purpose is to assert the value never
// leaves the encryption boundary.
const ACCESS_TOKEN = "test-access-token-never-persisted-plaintext";
const APP_SECRET = "app-secret-value";
const VERIFY_TOKEN = "verify-token-value";

async function createChannel(organizationId: string, over: Record<string, unknown> = {}) {
  return WhatsAppChannelService.create(organizationId, {
    name: "Support",
    phoneNumberId: `pn-${organizationId}`,
    businessAccountId: `waba-${organizationId}`,
    accessToken: ACCESS_TOKEN,
    appSecret: APP_SECRET,
    verifyToken: VERIFY_TOKEN,
    ...over,
  } as any);
}

const channelRows = () => db.tables.get("WhatsAppChannel") ?? [];

beforeEach(() => {
  wa.reset();
  redis.reset();
  vi.clearAllMocks();
  sendText.mockResolvedValue({ ok: true, messageId: "wamid.CODE", recordId: "rec" });
});

// ─── Credential protection ─────────────────────────────────────────────
describe("credential protection", () => {
  it("encrypts every secret at rest", async () => {
    await createChannel(ORG_A);
    const stored = JSON.stringify(channelRows()[0]);

    expect(stored).not.toContain(ACCESS_TOKEN);
    expect(stored).not.toContain(APP_SECRET);
    expect(stored).not.toContain(VERIFY_TOKEN);
  });

  it("never returns a secret to a client, only presence flags", async () => {
    const dto = await createChannel(ORG_A);
    const serialized = JSON.stringify(dto);

    expect(serialized).not.toContain(ACCESS_TOKEN);
    expect(serialized).not.toContain(APP_SECRET);
    expect(serialized).not.toContain(VERIFY_TOKEN);
    expect(dto.hasAccessToken).toBe(true);
    expect(dto.hasAppSecret).toBe(true);
    expect(dto).not.toHaveProperty("accessTokenEnc");
    expect(dto).not.toHaveProperty("verifyTokenEnc");
  });

  it("decrypts them again for server-side use only", async () => {
    await createChannel(ORG_A);
    const cfg = resolveConfig(channelRows()[0]);

    expect(cfg.accessToken).toBe(ACCESS_TOKEN);
    expect(cfg.appSecret).toBe(APP_SECRET);
    expect(cfg.verifyToken).toBe(VERIFY_TOKEN);
    expect(cfg.missing).toEqual([]);
  });

  it("reports what is missing instead of pretending to be connected", async () => {
    await createChannel(ORG_A, { accessToken: undefined, appSecret: undefined, verifyToken: undefined });
    const cfg = resolveConfig(channelRows()[0]);

    expect(cfg.missing).toEqual(expect.arrayContaining([
      "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN",
    ]));
    expect(toCredentials(cfg)).toBeNull();
    expect(toChannelDTO(channelRows()[0]).hasAccessToken).toBe(false);
  });

  it("wipes credentials on disconnect but keeps the history", async () => {
    const created = await createChannel(ORG_A);
    db.seed("WhatsAppConversation", [{
      id: "convo-1", organizationId: ORG_A, channelId: created.id, contactId: "c1",
      createdAt: new Date(), updatedAt: new Date(),
    }]);

    const dto = await WhatsAppChannelService.disconnect(ORG_A, created.id);

    expect(dto?.enabled).toBe(false);
    expect(dto?.status).toBe("disconnected");
    expect(dto?.hasAccessToken).toBe(false);
    expect(channelRows()[0].accessTokenEnc).toBeNull();
    // Conversation history survives — a disconnect is not a purge.
    expect(db.tables.get("WhatsAppConversation")).toHaveLength(1);
  });

  it("creates a channel disabled, so credentials must be confirmed first", async () => {
    const dto = await createChannel(ORG_A);
    expect(dto.enabled).toBe(false);
  });
});

// ─── Tenant isolation ──────────────────────────────────────────────────
describe("tenant isolation", () => {
  it("does not return another organization's channel", async () => {
    const a = await createChannel(ORG_A);
    await createChannel(ORG_B);

    expect(await WhatsAppChannelService.getScoped(ORG_B, a.id)).toBeNull();
    expect(await WhatsAppChannelService.getScoped(ORG_A, a.id)).toBeTruthy();
  });

  it("lists only the caller's own channels", async () => {
    await createChannel(ORG_A);
    await createChannel(ORG_B);

    const listed = await WhatsAppChannelService.list(ORG_A);
    expect(listed).toHaveLength(1);
    expect(listed[0].organizationId).toBe(ORG_A);
  });

  it("refuses a cross-org update and leaves the row untouched", async () => {
    const a = await createChannel(ORG_A);

    const result = await WhatsAppChannelService.update(ORG_B, a.id, { name: "hijacked", enabled: true });

    expect(result).toBeNull();
    expect(channelRows().find((r) => r.id === a.id)!.name).toBe("Support");
    expect(channelRows().find((r) => r.id === a.id)!.enabled).toBe(false);
  });

  it("refuses a cross-org settings change", async () => {
    const a = await createChannel(ORG_A);
    const result = await WhatsAppChannelService.updateSettings(ORG_B, a.id, { responseMode: "off" } as any);

    expect(result).toBeNull();
    expect(channelRows().find((r) => r.id === a.id)!.settings.responseMode).not.toBe("off");
  });

  it("refuses a cross-org disconnect — credentials are not another tenant's to revoke", async () => {
    const a = await createChannel(ORG_A);
    const result = await WhatsAppChannelService.disconnect(ORG_B, a.id);

    expect(result).toBeNull();
    expect(channelRows().find((r) => r.id === a.id)!.accessTokenEnc).not.toBeNull();
  });

  it("does not treat a soft-deleted channel as live", async () => {
    const a = await createChannel(ORG_A);
    await wa.prisma.whatsAppChannel.update({ where: { id: a.id }, data: { deletedAt: new Date() } });

    expect(await WhatsAppChannelService.getScoped(ORG_A, a.id)).toBeNull();
    expect(await WhatsAppChannelService.list(ORG_A)).toHaveLength(0);
    expect(await WhatsAppChannelService.findByPhoneNumberId(`pn-${ORG_A}`)).toBeNull();
  });

  it("rejects a duplicate phone number id so two tenants cannot claim one number", async () => {
    await createChannel(ORG_A, { phoneNumberId: "shared-pn" });
    await expect(createChannel(ORG_B, { phoneNumberId: "shared-pn" })).rejects.toMatchObject({ code: "P2002" });
  });
});

// ─── Webhook authenticity ──────────────────────────────────────────────
describe("webhook authenticity primitives", () => {
  const body = Buffer.from(JSON.stringify({ object: "whatsapp_business_account", entry: [] }));
  const good = "sha256=" + createHmac("sha256", APP_SECRET).update(body).digest("hex");

  it("accepts a genuine signature", () => {
    expect(verifyWebhookSignature(body, good, APP_SECRET).valid).toBe(true);
  });

  it("rejects a forged, absent, malformed or wrongly-prefixed signature", () => {
    expect(verifyWebhookSignature(body, good, "other-secret").valid).toBe(false);
    expect(verifyWebhookSignature(body, null as any, APP_SECRET).valid).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=zzzz", APP_SECRET).valid).toBe(false);
    expect(verifyWebhookSignature(body, good.replace("sha256=", "sha1="), APP_SECRET).valid).toBe(false);
    expect(verifyWebhookSignature(body, good.replace("sha256=", ""), APP_SECRET).valid).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    expect(verifyWebhookSignature(body, good, null as any).valid).toBe(false);
    expect(verifyWebhookSignature(body, good, "").valid).toBe(false);
  });

  it("detects a tampered body", () => {
    const tampered = Buffer.from(JSON.stringify({ object: "whatsapp_business_account", entry: ["evil"] }));
    expect(verifyWebhookSignature(tampered, good, APP_SECRET).valid).toBe(false);
  });

  it("compares verify tokens safely and rejects mismatches", () => {
    expect(verifyTokenMatches(VERIFY_TOKEN, VERIFY_TOKEN)).toBe(true);
    expect(verifyTokenMatches("wrong", VERIFY_TOKEN)).toBe(false);
    expect(verifyTokenMatches("", VERIFY_TOKEN)).toBe(false);
    expect(verifyTokenMatches(VERIFY_TOKEN, null as any)).toBe(false);
  });
});

// ─── §8 identity linking ───────────────────────────────────────────────
describe("account linking", () => {
  async function enabledChannel(organizationId = ORG_A) {
    const dto = await createChannel(organizationId);
    await WhatsAppChannelService.update(organizationId, dto.id, { enabled: true });
    return dto;
  }

  /** Reads the code out of the WhatsApp message the service sent. */
  function issuedCode(): string {
    const body = sendText.mock.calls.at(-1)?.[2] as string;
    return body.match(/\b(\d{6})\b/)![1];
  }

  it("links only after the code delivered to the handset is returned", async () => {
    await enabledChannel();
    const phone = "2348012345678";

    const started = await WhatsAppIdentityService.startLink({ userId: USER_A, organizationId: ORG_A, phoneNumber: phone });
    expect(started.ok).toBe(true);
    expect(sendText).toHaveBeenCalledOnce();

    const confirmed = await WhatsAppIdentityService.confirmLink({
      userId: USER_A, organizationId: ORG_A, phoneNumber: phone, code: issuedCode(),
    });

    expect(confirmed.ok).toBe(true);
    const contact = (db.tables.get("WhatsAppContact") ?? [])[0];
    expect(contact.linkedWindelsUserId).toBe(USER_A);
    expect(contact.linkedAt).toBeTruthy();
  });

  it("never stores the verification code in clear text", async () => {
    await enabledChannel();
    await WhatsAppIdentityService.startLink({ userId: USER_A, organizationId: ORG_A, phoneNumber: "2348012345678" });

    const code = issuedCode();
    const stored = JSON.stringify([...redis.store.entries()]);
    expect(stored).not.toContain(code);
  });

  it("refuses a wrong code and does not link", async () => {
    await enabledChannel();
    const phone = "2348012345678";
    await WhatsAppIdentityService.startLink({ userId: USER_A, organizationId: ORG_A, phoneNumber: phone });

    const result = await WhatsAppIdentityService.confirmLink({
      userId: USER_A, organizationId: ORG_A, phoneNumber: phone, code: "000000",
    });

    expect(result.ok).toBe(false);
    expect((db.tables.get("WhatsAppContact") ?? []).filter((c) => c.linkedWindelsUserId)).toHaveLength(0);
  });

  it("locks out after repeated wrong codes", async () => {
    await enabledChannel();
    const phone = "2348012345678";
    await WhatsAppIdentityService.startLink({ userId: USER_A, organizationId: ORG_A, phoneNumber: phone });
    const code = issuedCode();

    for (let i = 0; i < 5; i++) {
      await WhatsAppIdentityService.confirmLink({ userId: USER_A, organizationId: ORG_A, phoneNumber: phone, code: "000000" });
    }

    // Even the CORRECT code no longer works once the budget is spent.
    const result = await WhatsAppIdentityService.confirmLink({
      userId: USER_A, organizationId: ORG_A, phoneNumber: phone, code,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too many/i);
  });

  it("throttles repeated code requests", async () => {
    await enabledChannel();
    await WhatsAppIdentityService.startLink({ userId: USER_A, organizationId: ORG_A, phoneNumber: "2348012345678" });
    const second = await WhatsAppIdentityService.startLink({ userId: USER_A, organizationId: ORG_A, phoneNumber: "2348012345678" });

    expect(second.ok).toBe(false);
    expect(sendText).toHaveBeenCalledOnce();
  });

  it("refuses to link a number already held by someone else, without naming them", async () => {
    const dto = await enabledChannel();
    db.seed("WhatsAppContact", [{
      id: "contact-taken", organizationId: ORG_A, whatsappChannelId: dto.id,
      whatsappUserId: "2348012345678", phoneNumber: "2348012345678",
      linkedWindelsUserId: USER_B, linkedAt: new Date(), status: "ACTIVE",
      createdAt: new Date(), updatedAt: new Date(),
    }]);

    const result = await WhatsAppIdentityService.startLink({
      userId: USER_A, organizationId: ORG_A, phoneNumber: "2348012345678",
    });

    expect(result.ok).toBe(false);
    expect(result.error).not.toContain(USER_B);
    expect(sendText).not.toHaveBeenCalled();
  });

  it("cannot be completed with a code issued to a different user", async () => {
    await enabledChannel();
    const phone = "2348012345678";
    await WhatsAppIdentityService.startLink({ userId: USER_A, organizationId: ORG_A, phoneNumber: phone });
    const code = issuedCode();

    // USER_B intercepts the code and tries to bind the number to themselves.
    const stolen = await WhatsAppIdentityService.confirmLink({
      userId: USER_B, organizationId: ORG_A, phoneNumber: phone, code,
    });

    expect(stolen.ok).toBe(false);
    expect((db.tables.get("WhatsAppContact") ?? []).filter((c) => c.linkedWindelsUserId === USER_B)).toHaveLength(0);
  });

  it("does not issue a code when no channel is configured or it is disabled", async () => {
    const noChannel = await WhatsAppIdentityService.startLink({
      userId: USER_A, organizationId: ORG_A, phoneNumber: "2348012345678",
    });
    expect(noChannel.ok).toBe(false);

    await createChannel(ORG_B); // enabled defaults to false
    const disabled = await WhatsAppIdentityService.startLink({
      userId: USER_A, organizationId: ORG_B, phoneNumber: "2348012345678",
    });
    expect(disabled.ok).toBe(false);
    expect(sendText).not.toHaveBeenCalled();
  });

  it("rejects an unusable phone number before doing any work", async () => {
    const result = await WhatsAppIdentityService.startLink({
      userId: USER_A, organizationId: ORG_A, phoneNumber: "12",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid phone/i);
  });

  it("lets a user unlink only their own binding", async () => {
    const dto = await enabledChannel();
    db.seed("WhatsAppContact", [{
      id: "contact-a", organizationId: ORG_A, whatsappChannelId: dto.id,
      whatsappUserId: "2348012345678", phoneNumber: "2348012345678",
      linkedWindelsUserId: USER_A, linkedAt: new Date(), status: "ACTIVE",
      createdAt: new Date(), updatedAt: new Date(),
    }]);

    expect(await WhatsAppIdentityService.unlink({ userId: USER_B, organizationId: ORG_A, contactId: "contact-a" })).toBe(false);
    expect(await WhatsAppIdentityService.unlink({ userId: USER_A, organizationId: ORG_B, contactId: "contact-a" })).toBe(false);
    expect((db.tables.get("WhatsAppContact") ?? [])[0].linkedWindelsUserId).toBe(USER_A);

    expect(await WhatsAppIdentityService.unlink({ userId: USER_A, organizationId: ORG_A, contactId: "contact-a" })).toBe(true);
    expect((db.tables.get("WhatsAppContact") ?? [])[0].linkedWindelsUserId).toBeNull();
  });

  it("normalises numbers consistently so formatting cannot bypass a check", () => {
    expect(normalizePhoneNumber("+234 801 234 5678")).toBe("2348012345678");
    expect(normalizePhoneNumber("(234)-801-234-5678")).toBe("2348012345678");
  });
});
