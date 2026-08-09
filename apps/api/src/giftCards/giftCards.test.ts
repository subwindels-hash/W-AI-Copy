/**
 * WMPC Gift Card Payment Platform tests.
 *
 * Covers the full card lifecycle (issue → activate → reload → redeem →
 * freeze → unfreeze → expire), PIN security (a PIN-protected card must never
 * be activated or redeemed without the correct PIN), idempotent redemption by
 * orderId, and fraud-flag resolution. Runs on FakeKv (Redis) + FakePrisma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma } from "../testUtils/fakePrisma.js";

const kv = new FakeKv();
const db = new FakePrisma();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const svc = await import("./giftCards.service.js");

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  db.reset();
});

async function issueCard(opts: { pin?: string; amount?: number } = {}) {
  return svc.GiftCardsService.issue({
    type: "digital", amount: opts.amount ?? 100, currency: "USD",
    ...(opts.pin ? { pin: opts.pin } : {}),
  });
}

describe("WMPC gift card lifecycle", () => {
  it("issues a card with issued status and records an issue transaction", async () => {
    const c = await issueCard();
    expect(c.status).toBe("issued");
    expect(c.balance).toBe(100);
    expect(c.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const txns = await svc.GiftCardsService.listTransactions(c.id);
    expect(txns).toHaveLength(1);
    expect(txns[0]!.kind).toBe("issue");
  });

  it("activates a card without a PIN", async () => {
    const c = await issueCard();
    const a = await svc.GiftCardsService.activate(c.id);
    expect(a.status).toBe("active");
  });

  it("reloads an active card and adds to the balance", async () => {
    const c = await issueCard();
    await svc.GiftCardsService.activate(c.id);
    const r = await svc.GiftCardsService.reload(c.id, 25);
    expect(r.balance).toBe(125);
  });

  it("redeems partially then fully", async () => {
    const c = await issueCard();
    await svc.GiftCardsService.activate(c.id);
    const r1 = await svc.GiftCardsService.redeem(c.id, 30);
    expect(r1.redeemed).toBe(30);
    expect(r1.card.status).toBe("partially-redeemed");
    expect(r1.card.balance).toBe(70);
    const r2 = await svc.GiftCardsService.redeem(c.id, 70);
    expect(r2.card.status).toBe("redeemed");
    expect(r2.card.balance).toBe(0);
  });

  it("rejects redeeming more than the balance", async () => {
    const c = await issueCard({ amount: 50 });
    await svc.GiftCardsService.activate(c.id);
    await expect(svc.GiftCardsService.redeem(c.id, 51)).rejects.toThrow(/Insufficient balance/);
  });
});

describe("gift card PIN security", () => {
  it("rejects activation of a PIN-protected card without a PIN", async () => {
    const c = await issueCard({ pin: "1234" });
    await expect(svc.GiftCardsService.activate(c.id)).rejects.toThrow("Invalid PIN");
  });

  it("rejects activation with a wrong PIN", async () => {
    const c = await issueCard({ pin: "1234" });
    await expect(svc.GiftCardsService.activate(c.id, "9999")).rejects.toThrow("Invalid PIN");
  });

  it("activates with the correct PIN", async () => {
    const c = await issueCard({ pin: "1234" });
    const a = await svc.GiftCardsService.activate(c.id, "1234");
    expect(a.status).toBe("active");
  });

  it("rejects redemption of a PIN-protected card without a PIN", async () => {
    const c = await issueCard({ pin: "1234" });
    await svc.GiftCardsService.activate(c.id, "1234");
    // Critical regression: a PIN-protected card must not be redeemable by
    // simply omitting the PIN.
    await expect(svc.GiftCardsService.redeem(c.id, 10)).rejects.toThrow("Invalid PIN");
  });

  it("redeems with the correct PIN", async () => {
    const c = await issueCard({ pin: "1234" });
    await svc.GiftCardsService.activate(c.id, "1234");
    const r = await svc.GiftCardsService.redeem(c.id, 10, "1234");
    expect(r.redeemed).toBe(10);
  });
});

describe("gift card redemption idempotency & fraud", () => {
  it("is idempotent for the same orderId", async () => {
    const c = await issueCard();
    await svc.GiftCardsService.activate(c.id);
    const first = await svc.GiftCardsService.redeem(c.id, 20, undefined, "order-1");
    const second = await svc.GiftCardsService.redeem(c.id, 20, undefined, "order-1");
    expect(second.redeemed).toBe(20);
    expect(second.txn.id).toBe(first.txn.id);
    // Balance only reduced once.
    expect(second.card.balance).toBe(80);
  });
});

describe("freeze / unfreeze / expire", () => {
  it("freezes a card and blocks redemption, then unfreezes it", async () => {
    const c = await issueCard();
    await svc.GiftCardsService.activate(c.id);
    await svc.GiftCardsService.freeze(c.id, "suspected fraud");
    await expect(svc.GiftCardsService.redeem(c.id, 10)).rejects.toThrow("Cannot redeem frozen");
    const u = await svc.GiftCardsService.unfreeze(c.id);
    expect(u.status).toBe("active");
    const r = await svc.GiftCardsService.redeem(c.id, 10);
    expect(r.redeemed).toBe(10);
  });

  it("cannot unfreeze a non-frozen card", async () => {
    const c = await issueCard();
    await expect(svc.GiftCardsService.unfreeze(c.id)).rejects.toThrow("not frozen");
  });

  it("expires a card and blocks redemption", async () => {
    const c = await issueCard();
    await svc.GiftCardsService.activate(c.id);
    await svc.GiftCardsService.expire(c.id);
    await expect(svc.GiftCardsService.redeem(c.id, 10)).rejects.toThrow("Cannot redeem expired");
  });
});

describe("fraud flags", () => {
  it("lists fraud flags and resolves one", async () => {
    // Trigger a fraud flag via a wrong PIN on redeem.
    const c = await issueCard({ pin: "1234" });
    await svc.GiftCardsService.activate(c.id, "1234");
    await expect(svc.GiftCardsService.redeem(c.id, 5, "0000")).rejects.toThrow("Invalid PIN");
    const flags = await svc.GiftCardsService.listFraud(false);
    expect(flags.length).toBeGreaterThan(0);
    const resolved = await svc.GiftCardsService.resolveFraudFlag(flags[0]!.id, "admin-1");
    expect(resolved.resolved).toBe(true);
    expect(resolved.resolvedBy).toBe("admin-1");
    expect(resolved.resolvedAt).toBeTruthy();
  });
});
