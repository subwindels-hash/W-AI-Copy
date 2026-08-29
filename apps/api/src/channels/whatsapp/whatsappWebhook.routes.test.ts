/**
 * Webhook endpoint contract (Phase 1 §18 — "webhook tests: verification,
 * valid/invalid/duplicate/unknown event, bad signature").
 *
 * This boots a real Express app with the real router, the real raw-body
 * capture from server.ts, and real HMAC signatures, then talks to it over real
 * HTTP. Only the data layer (Prisma/Redis) is substituted, because the thing
 * under test is the HTTP edge: what it accepts, what it refuses, and what it
 * refuses to write.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { createHmac } from "node:crypto";
import { FakeRedis } from "./testUtils/fakeRedis.js";
import { FakePrisma, cuid } from "../../testUtils/fakePrisma.js";

const redis = new FakeRedis();
const db = new FakePrisma();

/**
 * Prisma with the one constraint this endpoint's idempotency depends on:
 * WhatsAppWebhookEvent.eventId is @unique, and the route relies on the P2002
 * violation as its duplicate guard. FakePrisma does not model unique indexes,
 * so a duplicate would otherwise be accepted twice and the test would pass
 * while production deduplicated nothing.
 */
function prismaWithUniqueEventId() {
  const base = db.client() as any;
  return new Proxy(base, {
    get(target, prop: string) {
      if (prop !== "whatsAppWebhookEvent") return target[prop];
      const model = target[prop];
      return {
        ...model,
        async create(args: any) {
          const existing = db.tables.get("WhatsAppWebhookEvent") ?? [];
          if (existing.some((r) => r.eventId === args?.data?.eventId)) {
            const err: any = new Error("Unique constraint failed on the fields: (`eventId`)");
            err.code = "P2002";
            err.meta = { target: ["eventId"] };
            throw err;
          }
          return model.create(args);
        },
      };
    },
  });
}

vi.mock("../../db/redis.js", () => ({ redisCmd: redis, redis, redisSub: redis }));
vi.mock("../../db/client.js", () => ({ prisma: prismaWithUniqueEventId() }));

const { registerWhatsAppWebhookRoutes } = await import("./whatsappWebhook.routes.js");
const { WhatsAppQueue } = await import("./whatsappQueue.js");

const ORG = "org-alpha";
const PHONE_ID = "109876543210987";
const APP_SECRET = "test-app-secret";
const VERIFY_TOKEN = "test-verify-token";

// ─── Harness ───────────────────────────────────────────────────────────
const app = express();
// Mirrors http/server.ts: the raw bytes must survive JSON parsing or the HMAC
// cannot be recomputed.
app.use(express.json({
  verify: (req: any, _res, buf) => { req.rawBody = Buffer.from(buf); },
}));
const router = express.Router();
app.use("/api/v1/channels/whatsapp/webhook", router);
registerWhatsAppWebhookRoutes(router);

let server: Server;
let base: string;

await new Promise<void>((resolve) => {
  server = app.listen(0, "127.0.0.1", () => {
    const addr = server.address() as { port: number };
    base = `http://127.0.0.1:${addr.port}/api/v1/channels/whatsapp/webhook`;
    resolve();
  });
});

afterAll(() => { server?.close(); });

// ─── Fixtures ──────────────────────────────────────────────────────────
function seedChannel(over: Record<string, unknown> = {}) {
  const id = over.id ?? cuid();
  db.seed("WhatsAppChannel", [{
    id,
    organizationId: ORG,
    name: "Support line",
    phoneNumberId: PHONE_ID,
    businessAccountId: "WABA-1",
    displayPhoneNumber: "15550001111",
    status: "CONNECTED",
    webhookStatus: "UNVERIFIED",
    enabled: true,
    apiVersion: "v21.0",
    // Stored plaintext here: `unseal` tolerates it, and the encryption
    // round-trip is covered by the security suite rather than re-tested here.
    accessTokenEnc: "access-token",
    appSecretEnc: APP_SECRET,
    verifyTokenEnc: VERIFY_TOKEN,
    settings: {},
    lastWebhookAt: null, lastErrorAt: null, lastError: null,
    deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...over,
  }]);
  return id as string;
}

function messageEnvelope(wamid: string, text = "hello") {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA-1",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "15550001111", phone_number_id: PHONE_ID },
          contacts: [{ profile: { name: "Ada" }, wa_id: "2348012345678" }],
          messages: [{ from: "2348012345678", id: wamid, timestamp: "1760000000", type: "text", text: { body: text } }],
        },
      }],
    }],
  };
}

async function post(body: unknown, opts: { sign?: boolean | string; secret?: string } = {}) {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.sign === true) {
    headers["x-hub-signature-256"] = "sha256=" + createHmac("sha256", opts.secret ?? APP_SECRET).update(raw).digest("hex");
  } else if (typeof opts.sign === "string") {
    headers["x-hub-signature-256"] = opts.sign;
  }
  const res = await fetch(base, { method: "POST", headers, body: raw });
  const json = await res.json().catch(() => null);
  return { status: res.status, json: json as any };
}

const events = () => db.tables.get("WhatsAppWebhookEvent") ?? [];

beforeEach(() => {
  db.reset();
  redis.reset();
});

// ─── GET: subscription handshake ───────────────────────────────────────
describe("GET /channels/whatsapp/webhook — verification handshake", () => {
  it("echoes the challenge when the verify token matches a channel", async () => {
    const id = seedChannel();
    const res = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1158201444`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("1158201444");

    const row = db.tables.get("WhatsAppChannel")!.find((r) => r.id === id)!;
    expect(row.webhookStatus).toBe("VERIFIED");
  });

  it("refuses a wrong verify token and does not echo the challenge", async () => {
    seedChannel();
    const res = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1158201444`);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("1158201444");
  });

  it("rejects a malformed handshake", async () => {
    seedChannel();
    expect((await fetch(`${base}?hub.mode=subscribe`)).status).toBe(400);
    expect((await fetch(base)).status).toBe(400);
    // Wrong mode is not a subscription request.
    expect((await fetch(`${base}?hub.mode=unsubscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1`)).status).toBe(400);
  });

  it("does not verify against a disabled channel", async () => {
    seedChannel({ enabled: false });
    const res = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1`);
    expect(res.status).toBe(403);
  });
});

// ─── POST: signature enforcement ───────────────────────────────────────
describe("POST /channels/whatsapp/webhook — signature enforcement", () => {
  it("accepts and queues a correctly signed message", async () => {
    seedChannel();
    const { status, json } = await post(messageEnvelope("wamid.OK"), { sign: true });

    expect(status).toBe(200);
    expect(json.queued).toBe(1);
    expect(events()).toHaveLength(1);
    expect(events()[0].processingStatus).toBe("RECEIVED");
    expect(await WhatsAppQueue.depth()).toBe(1);
  });

  it("rejects an unsigned request with 401 and writes nothing", async () => {
    seedChannel();
    const { status } = await post(messageEnvelope("wamid.UNSIGNED"));

    expect(status).toBe(401);
    expect(events()).toHaveLength(0);
    expect(await WhatsAppQueue.depth()).toBe(0);
  });

  it("rejects a signature made with the wrong secret", async () => {
    seedChannel();
    const { status } = await post(messageEnvelope("wamid.BADSIG"), { sign: true, secret: "attacker-secret" });

    expect(status).toBe(401);
    expect(events()).toHaveLength(0);
  });

  it("rejects a garbage signature header without crashing", async () => {
    seedChannel();
    const { status } = await post(messageEnvelope("wamid.GARBAGE"), { sign: "sha256=notevenhex" });
    expect(status).toBe(401);
    expect(events()).toHaveLength(0);
  });

  it("records the rejection on the channel so operators can see it", async () => {
    const id = seedChannel();
    await post(messageEnvelope("wamid.SEEN"), { sign: "sha256=deadbeef" });

    const row = db.tables.get("WhatsAppChannel")!.find((r) => r.id === id)!;
    expect(row.lastError).toBeTruthy();
    expect(row.lastErrorAt).toBeTruthy();
  });

  it("refuses the event when no app secret is configured — never an implicit allow", async () => {
    seedChannel({ appSecretEnc: null });
    const { status } = await post(messageEnvelope("wamid.NOSECRET"), { sign: true });

    expect(status).toBe(401);
    expect(events()).toHaveLength(0);
  });
});

// ─── POST: payload handling ────────────────────────────────────────────
describe("POST /channels/whatsapp/webhook — payload handling", () => {
  it("rejects a payload that is not a WhatsApp envelope", async () => {
    seedChannel();
    const { status } = await post({ object: "page", entry: [] }, { sign: true });
    expect(status).toBe(400);
    expect(events()).toHaveLength(0);
  });

  it("acknowledges an unregistered phone number id without processing it", async () => {
    seedChannel();
    const body = messageEnvelope("wamid.OTHER");
    (body.entry[0].changes[0].value.metadata as any).phone_number_id = "999999999999999";

    const { status } = await post(body, { sign: true });
    // 200 so Meta stops retrying; nothing stored, nothing queued.
    expect(status).toBe(200);
    expect(events()).toHaveLength(0);
    expect(await WhatsAppQueue.depth()).toBe(0);
  });

  it("keeps the pre-signature branch inert for an unsigned unknown sender", async () => {
    seedChannel();
    const body = messageEnvelope("wamid.UNSIGNED");
    (body.entry[0].changes[0].value.metadata as any).phone_number_id = "999999999999999";

    // No channel resolves, so no per-tenant app secret exists to verify
    // against and the ACK necessarily precedes the signature check. That is
    // only acceptable while the branch writes nothing and queues nothing.
    const { status } = await post(body, { sign: false });

    expect(status).toBe(200);
    expect(events()).toHaveLength(0);
    expect(await WhatsAppQueue.depth()).toBe(0);
    // The real channel is untouched — no error recorded against a tenant that
    // had nothing to do with the stray payload.
    expect(db.tables.get("WhatsAppChannel")![0].lastError ?? null).toBeNull();
  });

  it("stores only a hash of the payload, never the message body", async () => {
    seedChannel();
    await post(messageEnvelope("wamid.SECRET", "my password is hunter2"), { sign: true });

    const row = events()[0];
    expect(row.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain("hunter2");
  });

  it("deduplicates a redelivered event and reports it as a duplicate", async () => {
    seedChannel();
    const body = messageEnvelope("wamid.DUP");

    const first = await post(body, { sign: true });
    const second = await post(body, { sign: true });

    expect(first.json.queued).toBe(1);
    expect(second.status).toBe(200);
    expect(second.json.queued).toBe(0);
    expect(second.json.duplicates).toBe(1);
    // One audit row, one queued job — the redelivery changed nothing.
    expect(events()).toHaveLength(1);
    expect(await WhatsAppQueue.depth()).toBe(1);
  });

  it("queues every message in a batched envelope", async () => {
    seedChannel();
    const body = messageEnvelope("wamid.B1");
    (body.entry[0].changes[0].value.messages as any[]).push({
      from: "2348099999999", id: "wamid.B2", timestamp: "1760000001", type: "text", text: { body: "second" },
    });

    const { json } = await post(body, { sign: true });
    expect(json.queued).toBe(2);
    expect(await WhatsAppQueue.depth()).toBe(2);
  });

  it("accepts a delivery status update", async () => {
    seedChannel();
    const body = {
      object: "whatsapp_business_account",
      entry: [{ id: "WABA-1", changes: [{ field: "messages", value: {
        metadata: { phone_number_id: PHONE_ID },
        statuses: [{ id: "wamid.OUT", status: "delivered", timestamp: "1760000000", recipient_id: "2348012345678" }],
      } }] }],
    };

    const { status, json } = await post(body, { sign: true });
    expect(status).toBe(200);
    expect(json.queued).toBe(1);
    expect(events()[0].eventType).toBe("status");
  });

  it("records an unknown notification type instead of discarding it", async () => {
    seedChannel();
    const body = {
      object: "whatsapp_business_account",
      entry: [{ id: "WABA-1", changes: [{ field: "account_update", value: { event: "PARTNER_ADDED" } }] }],
    };

    const { status, json } = await post(body, { sign: true });
    expect(status).toBe(200);
    expect(json.queued).toBe(1);
    expect(events()[0].eventType).toBe("unknown");
  });

  it("acknowledges an authentic event for a disabled channel without queueing work", async () => {
    const id = seedChannel({ enabled: false });
    const { status } = await post(messageEnvelope("wamid.OFF"), { sign: true });

    expect(status).toBe(200);
    expect(events()).toHaveLength(0);
    expect(await WhatsAppQueue.depth()).toBe(0);
    // The webhook was still authentic, so the channel's liveness is updated.
    const row = db.tables.get("WhatsAppChannel")!.find((r) => r.id === id)!;
    expect(row.lastWebhookAt).toBeTruthy();
  });

  it("marks the channel as having seen traffic on a valid delivery", async () => {
    const id = seedChannel();
    await post(messageEnvelope("wamid.LIVE"), { sign: true });

    const row = db.tables.get("WhatsAppChannel")!.find((r) => r.id === id)!;
    expect(row.lastWebhookAt).toBeTruthy();
    expect(row.webhookStatus).toBe("VERIFIED");
  });

  it("still returns 200 when the queue is down, so Meta is not stuck retrying", async () => {
    seedChannel();
    redis.failNext = "rpush";
    const { status } = await post(messageEnvelope("wamid.REDISDOWN"), { sign: true });
    expect(status).toBe(200);
  });
});
