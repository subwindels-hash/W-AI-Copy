/**
 * Unit tests for Inbound Webhook Receiver Service (Session 126).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebhookReceiverService, safeCompare } from "./webhookReceiver.service.js";

vi.mock("../db/redis.js", () => {
  const store = new Map<string, string>();
  const zsets = new Map<string, Array<{ score: number; member: string }>>();

  return {
    redisCmd: {
      async set(k: string, v: string) { store.set(k, v); },
      async get(k: string) { return store.get(k) ?? null; },
      async del(k: string) { store.delete(k); },
      async zadd(k: string, score: string, member: string) {
        const s = Number(score);
        let list = zsets.get(k);
        if (!list) { list = []; zsets.set(k, list); }
        const idx = list.findIndex(i => i.member === member);
        if (idx !== -1) list.splice(idx, 1);
        list.push({ score: s, member });
        list.sort((a, b) => a.score - b.score);
      },
      async zcard(k: string) { return zsets.get(k)?.length ?? 0; },
      async zrange(k: string, start: number, stop: number) {
        const list = zsets.get(k) ?? [];
        const end = stop === -1 ? list.length : stop + 1;
        return list.slice(start, end).map(i => i.member);
      },
      async zrem(k: string, ...members: string[]) {
        const list = zsets.get(k);
        if (!list) return;
        for (const m of members) {
          const idx = list.findIndex(i => i.member === m);
          if (idx !== -1) list.splice(idx, 1);
        }
      },
    },
  };
});

describe("WebhookReceiverService (Inbound Webhook Receiver & Inbox)", () => {
  const orgA = "org-whk-test-a";
  const orgB = "org-whk-test-b";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("performs safeCompare accurately without throwing", () => {
    expect(safeCompare("secret-123", "secret-123")).toBe(true);
    expect(safeCompare("secret-123", "wrong-secret")).toBe(false);
    expect(safeCompare("secret-123", "secret-1234")).toBe(false);
    expect(safeCompare(undefined, "secret-123")).toBe(false);
    expect(safeCompare("secret-123", null)).toBe(false);
  });

  it("verifies webhook signature using timing safe comparison", () => {
    const secret = "test-secret-hmac-99";
    expect(WebhookReceiverService.verifySignature("billing", secret, "{}", secret)).toBe(true);
    expect(WebhookReceiverService.verifySignature("billing", `sha256=${secret}`, "{}", secret)).toBe(true);
    expect(WebhookReceiverService.verifySignature("billing", "invalid", "{}", secret)).toBe(false);
  });

  it("receives an inbound webhook and logs it to the organization inbox", async () => {
    const payload = { eventType: "invoice.paid", amount: 4999 };
    const entry = await WebhookReceiverService.receiveWebhook(
      orgA,
      "billing",
      payload,
      true,
      "invoice.paid"
    );

    expect(entry.organizationId).toBe(orgA);
    expect(entry.source).toBe("billing");
    expect(entry.event).toBe("invoice.paid");
    expect(entry.status).toBe("received");
    expect(entry.signatureVerified).toBe(true);

    const list = await WebhookReceiverService.listInboundWebhooks(orgA);
    expect(list.some(e => e.id === entry.id)).toBe(true);
  });

  it("enforces tenant isolation when retrieving an inbox entry by ID", async () => {
    const entryA = await WebhookReceiverService.receiveWebhook(
      orgA,
      "github",
      { action: "opened", repository: "WIN" },
      true
    );

    const retrievedByA = await WebhookReceiverService.getInboundWebhook(orgA, entryA.id);
    expect(retrievedByA).not.toBeNull();
    expect(retrievedByA?.id).toBe(entryA.id);

    const retrievedByB = await WebhookReceiverService.getInboundWebhook(orgB, entryA.id);
    expect(retrievedByB).toBeNull();
  });

  it("supports filtering by source and status in listInboundWebhooks", async () => {
    await WebhookReceiverService.receiveWebhook(orgA, "stripe", { charge: "ch_1" }, true);
    await WebhookReceiverService.receiveWebhook(orgA, "github", { push: "main" }, true);

    const onlyStripe = await WebhookReceiverService.listInboundWebhooks(orgA, { source: "stripe" });
    expect(onlyStripe.every(e => e.source === "stripe")).toBe(true);
    expect(onlyStripe.some(e => e.source === "github")).toBe(false);
  });

  it("replays an inbound webhook, updates status to 'replayed', and records replayedAt", async () => {
    const entry = await WebhookReceiverService.receiveWebhook(
      orgA,
      "custom",
      { data: "test-replay" },
      true,
      "custom.alert"
    );

    const replayed = await WebhookReceiverService.replayWebhook(orgA, entry.id);
    expect(replayed).not.toBeNull();
    expect(replayed?.id).toBe(entry.id);
    expect(replayed?.status).toBe("replayed");

    const fetched = await WebhookReceiverService.getInboundWebhook(orgA, entry.id);
    expect(fetched?.status).toBe("replayed");
    expect(fetched?.replayedAt).toBeTruthy();
  });

  it("deletes an inbox entry as an administrative correction path", async () => {
    const entry = await WebhookReceiverService.receiveWebhook(orgA, "etl", { row: 1 }, true);

    const deletedOk = await WebhookReceiverService.deleteWebhookEntry(orgA, entry.id);
    expect(deletedOk).toBe(true);

    const check = await WebhookReceiverService.getInboundWebhook(orgA, entry.id);
    expect(check).toBeNull();

    const deleteWrongOrg = await WebhookReceiverService.deleteWebhookEntry(orgB, "non-existent");
    expect(deleteWrongOrg).toBe(false);
  });
});
