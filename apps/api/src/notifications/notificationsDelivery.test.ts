/**
 * Notification email/SMS delivery tests.
 *
 * sendEmail() and sendSms() were silent no-op stubs ("Email notification would
 * be sent"). They now perform real delivery through the configured SMTP relay
 * and an injectable SMS transport, and return a structured, never-fabricated
 * result. These tests pin the honest behaviour (delivered / not-configured /
 * no-recipient / error) with FakePrisma + a mocked EmailService — no network,
 * no real Prisma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakePrisma } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("../db/redis.js", () => ({
  redisCmd: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue("OK"), lpush: vi.fn().mockResolvedValue(1), rpop: vi.fn().mockResolvedValue(null), del: vi.fn().mockResolvedValue(1) },
}));
vi.mock("../services/push.service.js", () => ({ sendToUser: vi.fn().mockResolvedValue({}) }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const emailSend = vi.fn();
vi.mock("../sitePlatform/sitePlatform.service.js", () => ({
  EmailService: { sendEmail: (...a: unknown[]) => emailSend(...a) },
}));

const { notificationsService, getSmsTransport } = await import("./notifications.service.js");

beforeEach(async () => {
  db.reset();
  emailSend.mockReset();
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
  await db.client().user.create({ data: { id: "user-1", email: "person@example.test" } });
});

describe("sendEmail", () => {
  it("resolves the user's address and delegates to the SMTP relay", async () => {
    emailSend.mockResolvedValue({ ok: true, sent: true, reason: "sent" });
    const res = await notificationsService.sendEmail({ userId: "user-1", title: "Hi", body: "Body", url: "https://x/y" });
    expect(res).toMatchObject({ channel: "email", sent: true });
    expect(emailSend).toHaveBeenCalledWith(expect.objectContaining({
      to: "person@example.test",
      subject: "Hi",
      text: expect.stringContaining("https://x/y"),
    }));
  });

  it("reports NO_EMAIL_ON_FILE when the user has no address", async () => {
    await db.client().user.create({ data: { id: "user-2", email: "" } });
    const res = await notificationsService.sendEmail({ userId: "user-2", title: "Hi", body: "B" });
    expect(res).toEqual({ channel: "email", sent: false, reason: "NO_EMAIL_ON_FILE" });
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("propagates SMTP_NOT_CONFIGURED honestly (not a fake success)", async () => {
    emailSend.mockResolvedValue({ ok: true, sent: false, reason: "SMTP_NOT_CONFIGURED" });
    const res = await notificationsService.sendEmail({ userId: "user-1", title: "Hi", body: "B" });
    expect(res).toEqual({ channel: "email", sent: false, reason: "SMTP_NOT_CONFIGURED" });
  });

  it("captures relay exceptions as SMTP_ERROR", async () => {
    emailSend.mockRejectedValue(new Error("connection refused"));
    const res = await notificationsService.sendEmail({ userId: "user-1", title: "Hi", body: "B" });
    expect(res).toMatchObject({ channel: "email", sent: false, reason: "SMTP_ERROR", error: "connection refused" });
  });
});

describe("sendSms", () => {
  it("reports SMS_NOT_CONFIGURED when no transport is available", async () => {
    const res = await notificationsService.sendSms({ userId: "user-1", title: "Hi", body: "B", phone: "+15550001111" }, null);
    expect(res).toEqual({ channel: "sms", sent: false, reason: "SMS_NOT_CONFIGURED" });
  });

  it("reports NO_PHONE_ON_FILE when no destination number is supplied", async () => {
    const transport = { send: vi.fn() };
    const res = await notificationsService.sendSms({ userId: "user-1", title: "Hi", body: "B" }, transport);
    expect(res).toEqual({ channel: "sms", sent: false, reason: "NO_PHONE_ON_FILE" });
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("delegates to the transport and reports success", async () => {
    const transport = { send: vi.fn().mockResolvedValue({ sent: true, reason: "sent" }) };
    const res = await notificationsService.sendSms({ userId: "user-1", title: "Alert", body: "Down", phone: "+15550001111" }, transport);
    expect(res).toMatchObject({ channel: "sms", sent: true });
    expect(transport.send).toHaveBeenCalledWith({ to: "+15550001111", message: expect.stringContaining("Alert") });
  });

  it("surfaces a transport failure without claiming delivery", async () => {
    const transport = { send: vi.fn().mockResolvedValue({ sent: false, reason: "SMS_HTTP_400", error: "bad number" }) };
    const res = await notificationsService.sendSms({ userId: "user-1", title: "Hi", body: "B", phone: "+1" }, transport);
    expect(res).toMatchObject({ channel: "sms", sent: false, reason: "SMS_HTTP_400", error: "bad number" });
  });
});

describe("getSmsTransport", () => {
  it("returns null when Twilio env is absent", () => {
    expect(getSmsTransport()).toBeNull();
  });

  it("builds a transport that POSTs to Twilio with basic auth when configured", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_FROM_NUMBER = "+15550009999";
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    const transport = getSmsTransport(fetchMock as any)!;
    expect(transport).not.toBeNull();
    const res = await transport.send({ to: "+15550001111", message: "hi" });
    expect(res.sent).toBe(true);
    const [url, init] = (fetchMock.mock.calls as any[])[0]!;
    expect(String(url)).toContain("/Accounts/AC123/Messages.json");
    expect((init as any).headers.authorization).toMatch(/^Basic /);
  });

  it("maps a Twilio non-OK response to an explicit failure", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_FROM_NUMBER = "+15550009999";
    const fetchMock = vi.fn(async () => new Response("bad", { status: 400 }));
    const transport = getSmsTransport(fetchMock as any)!;
    const res = await transport.send({ to: "+1", message: "hi" });
    expect(res).toMatchObject({ sent: false, reason: "SMS_HTTP_400" });
  });
});
