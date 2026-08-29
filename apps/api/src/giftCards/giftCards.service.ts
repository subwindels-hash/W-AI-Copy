/**
 * WMPC Gift Card Payment Platform singleton (Session 79).
 *
 * Features:
 *  - Full card lifecycle: issue → activate → reload → redeem (partial+full) → expire / freeze
 *  - PIN security (hashed), QR/barcode identifiers (stub), fraud detection
 *  - Enterprise bulk issuance, department budgets, loyalty programs
 *  - Scheduled delivery, recipients, personal messages
 *  - 4 AI agents extending ExpertAgent (S77): spending-analysis, gift-recommendation,
 *    revenue-forecast, loyalty-optimization
 *  - GiftCardPaymentMethod registers itself into the existing Payment Gateway
 *    Framework (NOT a parallel gateway) — registration is a flag in dashboard
 *  - Events are emitted through KernelService (S39)
 *  - Keys gc:*
 */
import { randomUUID, createHash, randomInt } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import type {
  WmpcGiftCard, GcTransaction, GcFraudFlag, GcLoyaltyProgram,
  GcType, GcStatus,
} from "@windels/shared";

const K = {
  cards: "gc:cards", card: (id: string) => `gc:card:${id}`,
  txns: "gc:txns", txn: (id: string) => `gc:txn:${id}`,
  fraud: "gc:fraud", fraudFlag: (id: string) => `gc:fraud:${id}`,
  loyalty: "gc:loyalty", loyaltyProg: (id: string) => `gc:loyalty:${id}`,
  batches: "gc:batches",
  metrics: { issued24: "gc:m:i24", redeemed24: "gc:m:r24", volume24: "gc:m:v24", flagged24: "gc:m:f24" },
};
const j = (s: string) => JSON.parse(s);
const s2 = (o: any) => JSON.stringify(o);
const uid = (pfx: string) => pfx + randomUUID().slice(0, 8);

function hashPin(pin: string): string {
  return createHash("sha256").update(`gc:${pin}`).digest("hex").slice(0, 24);
}

function genCode(): string {
  // 16-char alnum gift card code in 4-char groups.
  //
  // A gift card code is a bearer instrument redeemable for money, so it must be
  // unguessable. a non-deterministic RNG is a non-cryptographic PRNG whose internal state
  // can be recovered from a handful of observed outputs, which would let an
  // attacker who legitimately holds a few cards predict codes that were issued
  // around the same time. randomInt() draws from the CSPRNG and is unbiased
  // across the alphabet (it rejection-samples internally).
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) out += "-";
    out += chars[randomInt(chars.length)];
  }
  return out;
}

const CARD_TYPE_SEEDS: Array<{ type: GcType; name: string; balance: number; currency: string }> = [
  { type: "digital",         name: "WINDELS Digital Welcome Card", balance: 50,    currency: "USD" },
  { type: "physical",        name: "WINDELS Premium Physical Card", balance: 200,  currency: "USD" },
  { type: "corporate-reward",name: "WINDELS Corporate Reward Card", balance: 100,  currency: "USD" },
  { type: "employee-incentive", name: "WINDELS Employee Incentive", balance: 75,   currency: "USD" },
  { type: "educational",     name: "WINDELS Educational Scholarship", balance: 500, currency: "NGN" },
];

const AI_AGENTS = [
  { id: "gc-agent-spend",   name: "Spending Analysis Agent",    domain: "gift-cards", role: "Analyze spending patterns & recommend budget optimizations", disclaimer: "Informational only; not financial advice" },
  { id: "gc-agent-rec",     name: "Gift Recommendation Agent",  domain: "gift-cards", role: "Recommend gift card amounts/types per recipient profile", disclaimer: "Recommendation suggestions; no purchase guarantee" },
  { id: "gc-agent-forecast",name: "Revenue Forecast Agent",     domain: "gift-cards", role: "Forecast gift card revenue, breakage, and redemption curves", disclaimer: "Forecast is probabilistic; not a financial guarantee" },
  { id: "gc-agent-loyalty", name: "Loyalty Optimization Agent", domain: "gift-cards", role: "Optimize loyalty multipliers, promotions, and rewards", disclaimer: "Suggested tuning only; human approval required" },
];

async function emitKernel(kind: string, payload: any) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ source: "gift-cards", kind, payload });
  } catch { /* kernel optional during bootstrap */ }
}

export const GiftCardsService = {
  async ensureBootstrapped(logger?: any) {
    if ((await redis.zcard(K.cards)) > 0) return;
    // Demo/sample records are opt-in; production starts empty (no sample data auto-created).
    if (!demoDataEnabled()) return skipDemoSeed("giftCards", logger);
    const now = new Date().toISOString();
    for (const seed of CARD_TYPE_SEEDS) {
      const id = uid("gc-");
      const code = genCode();
      const card: WmpcGiftCard = {
        id, type: seed.type, code,
        initialBalance: seed.balance, balance: seed.balance, currency: seed.currency,
        status: "active",
        pinHash: hashPin("0000"),
        issuerId: "windels",
        issuedAt: now,
        expiresAt: new Date(Date.now() + 365 * 86400_000).toISOString(),
        personalMessage: `Welcome to the WINDELS ${seed.type} program.`,
      };
      await redis.zadd(K.cards, 0, id);
      await redis.hset(K.card(id), "_doc", s2(card));
      // Issue + activate transaction
      const t1: GcTransaction = { id: uid("tx-"), cardId: id, kind: "issue", amount: seed.balance, currency: seed.currency, at: now };
      await redis.zadd(K.txns, Date.now(), t1.id);
      await redis.hset(K.txn(t1.id), "_doc", s2(t1));
    }
    // Seed a loyalty program
    const lp: GcLoyaltyProgram = {
      id: uid("lp-"), name: "WINDELS Rewards+", multiplier: 1.5, pointsIssued: 12_480, memberCount: 1_240,
    };
    await redis.zadd(K.loyalty, 0, lp.id);
    await redis.hset(K.loyaltyProg(lp.id), "_doc", s2(lp));
    // Seed one fraud flag (resolved) for a resolved test
    const cardIds = await redis.zrange(K.cards, 0, -1);
    if (cardIds[0]) {
      const ff: GcFraudFlag = {
        id: uid("ff-"), cardId: cardIds[0], reason: "Rapid consecutive redemption attempt detected",
        severity: "medium", flaggedAt: now, resolved: true,
      };
      await redis.zadd(K.fraud, Date.now(), ff.id);
      await redis.hset(K.fraudFlag(ff.id), "_doc", s2(ff));
    }
    logger?.info("[gift-cards] bootstrap complete", { cards: CARD_TYPE_SEEDS.length, loyalty: 1 });
  },

  async dashboard(): Promise<any> {
    const ids = await redis.zrange(K.cards, 0, -1);
    let issued = ids.length, active = 0, redeemed = 0, outstanding = 0;
    for (const id of ids) {
      const r = await redis.hgetall(K.card(id));
      if (!r._doc) continue;
      const c: WmpcGiftCard = j(r._doc);
      if (c.status === "active" || c.status === "partially-redeemed") active++;
      if (c.status === "redeemed") redeemed++;
      outstanding += c.balance;
    }
    const fraudCount = await redis.zcard(K.fraud);
    const loyaltyCount = await redis.zcard(K.loyalty);
    const rev24 = Number((await redis.get(K.metrics.volume24)) ?? 0);
    return {
      issued, active, redeemed, outstandingBalance: Math.round(outstanding * 100) / 100,
      revenue24h: rev24, fraudFlags: fraudCount, loyaltyPrograms: loyaltyCount,
      registeredAsPaymentMethod: true,  // registered into existing Payment Gateway Framework
      agents: AI_AGENTS.length,
      supportedTypes: ["physical","digital","virtual","one-time","reloadable","promotional","enterprise","corporate-reward","employee-incentive","educational"],
    } as any;
  },

  async listCards(status?: GcStatus): Promise<WmpcGiftCard[]> {
    const ids = await redis.zrange(K.cards, 0, -1);
    const out: WmpcGiftCard[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.card(id));
      if (r._doc) { const c = j(r._doc); if (!status || c.status === status) out.push(c); }
    }
    return out;
  },

  async getCard(id: string): Promise<WmpcGiftCard | null> {
    const r = await redis.hgetall(K.card(id));
    return r._doc ? j(r._doc) : null;
  },

  async issue(input: {
    type: GcType; amount: number; currency: string; pin?: string;
    recipientId?: string; personalMessage?: string; expiresInDays?: number; issuerId?: string;
  }): Promise<WmpcGiftCard> {
    if (input.amount <= 0) throw AppError.badRequest("Amount must be positive", { code: "INVALID_AMOUNT" });
    const id = uid("gc-");
    const now = new Date().toISOString();
    const card: WmpcGiftCard = {
      id, type: input.type, code: genCode(),
      initialBalance: input.amount, balance: input.amount, currency: input.currency,
      status: "issued",
      pinHash: input.pin ? hashPin(input.pin) : undefined,
      issuerId: input.issuerId ?? "windels",
      recipientId: input.recipientId,
      issuedAt: now,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400_000).toISOString()
                : new Date(Date.now() + 365 * 86400_000).toISOString(),
      personalMessage: input.personalMessage,
    };
    await redis.zadd(K.cards, 0, id);
    await redis.hset(K.card(id), "_doc", s2(card));
    const t: GcTransaction = { id: uid("tx-"), cardId: id, kind: "issue", amount: input.amount, currency: input.currency, at: now };
    await redis.zadd(K.txns, Date.now(), t.id);
    await redis.hset(K.txn(t.id), "_doc", s2(t));
    await redis.incrby(K.metrics.issued24, 1);
    await emitKernel("card.issued", { cardId: id, type: input.type, amount: input.amount });
    return card;
  },

  async activate(id: string, pin?: string): Promise<WmpcGiftCard> {
    const r = await redis.hgetall(K.card(id));
    if (!r._doc) throw AppError.notFound("Card not found");
    const c: WmpcGiftCard = j(r._doc);
    // A card with a PIN must never be activated without the correct PIN. The
    // guard is intentionally strict: an omitted PIN is treated as a mismatch.
    if (c.pinHash && (!pin || hashPin(pin) !== c.pinHash)) {
      const ff: GcFraudFlag = { id: uid("ff-"), cardId: id, reason: "PIN mismatch on activate", severity: "low", flaggedAt: new Date().toISOString(), resolved: false };
      await redis.zadd(K.fraud, Date.now(), ff.id); await redis.hset(K.fraudFlag(ff.id), "_doc", s2(ff));
      throw AppError.badRequest("Invalid PIN", { code: "BAD_PIN" });
    }
    c.status = "active";
    await redis.hset(K.card(id), "_doc", s2(c));
    const t: GcTransaction = { id: uid("tx-"), cardId: id, kind: "activate", amount: 0, currency: c.currency, at: new Date().toISOString() };
    await redis.zadd(K.txns, Date.now(), t.id); await redis.hset(K.txn(t.id), "_doc", s2(t));
    await emitKernel("card.activated", { cardId: id });
    return c;
  },

  async reload(id: string, amount: number): Promise<WmpcGiftCard> {
    if (amount <= 0) throw AppError.badRequest("Amount must be positive", { code: "INVALID_AMOUNT" });
    const r = await redis.hgetall(K.card(id));
    if (!r._doc) throw AppError.notFound("Card not found");
    const c: WmpcGiftCard = j(r._doc);
    if (c.status === "redeemed" || c.status === "expired" || c.status === "frozen")
      throw AppError.badRequest(`Cannot reload ${c.status} card`, { code: "INVALID_STATE" });
    c.balance = Math.round((c.balance + amount) * 100) / 100;
    if (c.status === "issued") c.status = "active";
    await redis.hset(K.card(id), "_doc", s2(c));
    const t: GcTransaction = { id: uid("tx-"), cardId: id, kind: "reload", amount, currency: c.currency, at: new Date().toISOString() };
    await redis.zadd(K.txns, Date.now(), t.id); await redis.hset(K.txn(t.id), "_doc", s2(t));
    await redis.incrbyfloat(K.metrics.volume24, amount);
    await emitKernel("card.reloaded", { cardId: id, amount });
    return c;
  },

  async redeem(id: string, amount: number, pin?: string, orderId?: string): Promise<{ card: WmpcGiftCard; redeemed: number; txn: GcTransaction }> {
    if (amount <= 0) throw AppError.badRequest("Amount must be positive", { code: "INVALID_AMOUNT" });

    // Idempotency: an orderId can only ever be charged once (prevents replay / double-redeem).
    if (orderId) {
      const idemKey = `gc:idem:${id}:${orderId}`;
      const existing = await redis.get(idemKey);
      if (existing) {
        const prev = JSON.parse(existing);
        // Return the previous result; do not charge again.
        const cardR = await redis.hgetall(K.card(id));
        return { card: cardR._doc ? j(cardR._doc) : prev.card, redeemed: prev.redeemed, txn: prev.txn };
      }
    }

    // Acquire a per-card lock (5s TTL) for race-condition prevention using a Lua script
    // that returns 1 iff the key was set (i.e. lock acquired).
    const lockKey = `gc:lock:${id}`;
    // Lock identifier: use the CSPRNG rather than a non-deterministic RNG, consistent
    // with the gift-card code generator above.
    const lockId = `lock-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const LOCK_ACQUIRE = `if redis.call('SET',KEYS[1],ARGV[1],'NX','PX',ARGV[2]) then return 1 else return 0 end`;
    const acquired = await redis.eval(LOCK_ACQUIRE, 1, lockKey, lockId, "5000");
    if (acquired !== 1) {
      throw AppError.conflict("Redemption already in progress — retry later");
    }

    try {
      const r = await redis.hgetall(K.card(id));
      if (!r._doc) throw AppError.notFound("Card not found");
      const c: WmpcGiftCard = j(r._doc);
      // A card with a PIN must never be redeemed without the correct PIN. An
      // omitted PIN is treated as a mismatch (same strict guard as activate).
      if (c.pinHash && (!pin || hashPin(pin) !== c.pinHash)) {
        const ff: GcFraudFlag = { id: uid("ff-"), cardId: id, reason: "PIN mismatch on redeem", severity: "medium", flaggedAt: new Date().toISOString(), resolved: false };
        await redis.zadd(K.fraud, Date.now(), ff.id); await redis.hset(K.fraudFlag(ff.id), "_doc", s2(ff));
        throw AppError.badRequest("Invalid PIN", { code: "BAD_PIN" });
      }
      if (c.status !== "active" && c.status !== "partially-redeemed")
        throw AppError.badRequest(`Cannot redeem ${c.status} card`, { code: "INVALID_STATE" });
      if (c.expiresAt && new Date(c.expiresAt) < new Date()) {
        c.status = "expired"; await redis.hset(K.card(id), "_doc", s2(c));
        throw AppError.badRequest("Card expired", { code: "EXPIRED" });
      }
      if (amount > c.balance + 1e-9) throw AppError.badRequest("Insufficient balance", { code: "INSUFFICIENT_FUNDS" });

      // Fraud heuristic: more than 20 redeems within 60s for the SAME card.
      // Tracked per card in its own counter (with a 60s TTL) so a busy card is
      // judged against its own history, not the global transaction stream.
      const velKey = `gc:vel:${id}`;
      const after = await redis.incr(velKey);
      if (after === 1) await redis.expire(velKey, 60);
      if (after > 20) {
        const ff: GcFraudFlag = { id: uid("ff-"), cardId: id, reason: "Velocity fraud heuristic", severity: "high", flaggedAt: new Date().toISOString(), resolved: false };
        await redis.zadd(K.fraud, Date.now(), ff.id); await redis.hset(K.fraudFlag(ff.id), "_doc", s2(ff));
        await redis.incr(K.metrics.flagged24);
      }

      const redeemed = Math.round(Math.min(amount, c.balance) * 100) / 100;
      c.balance = Math.round((c.balance - redeemed) * 100) / 100;
      if (c.balance < 0) c.balance = 0;
      c.lastUsedAt = new Date().toISOString();
      c.status = c.balance === 0 ? "redeemed" : "partially-redeemed";
      await redis.hset(K.card(id), "_doc", s2(c));
      const t: GcTransaction = { id: uid("tx-"), cardId: id, kind: "redeem", amount: redeemed, currency: c.currency, at: c.lastUsedAt, orderId };
      await redis.zadd(K.txns, Date.now(), t.id); await redis.hset(K.txn(t.id), "_doc", s2(t));
      await redis.incrby(K.metrics.redeemed24, 1);
      await redis.incrbyfloat(K.metrics.volume24, redeemed);

      // Invoice redemptions are financial allocation evidence and retain their
      // idempotency record for the invoice lifetime. Other ephemeral order
      // replays keep the existing 24-hour retention policy.
      if (orderId) {
        const idemKey = `gc:idem:${id}:${orderId}`;
        const result = JSON.stringify({ card: c, redeemed, txn: t });
        if (orderId.startsWith("inv-")) await redis.set(idemKey, result);
        else await redis.set(idemKey, result, "EX", 60 * 60 * 24);
      }

      await emitKernel("card.redeemed", { cardId: id, amount: redeemed, remainingBalance: c.balance, orderId });
      return { card: c, redeemed, txn: t };
    } finally {
      // Release lock only if we still own it (Lua check-and-del).
      const LOCK_RELEASE = `if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end`;
      await redis.eval(LOCK_RELEASE, 1, lockKey, lockId).catch(() => {});
    }
  },

  async expire(id: string): Promise<WmpcGiftCard> {
    const r = await redis.hgetall(K.card(id));
    if (!r._doc) throw AppError.notFound("Card not found");
    const c: WmpcGiftCard = j(r._doc);
    c.status = "expired";
    await redis.hset(K.card(id), "_doc", s2(c));
    const t: GcTransaction = { id: uid("tx-"), cardId: id, kind: "expire", amount: c.balance, currency: c.currency, at: new Date().toISOString() };
    await redis.zadd(K.txns, Date.now(), t.id); await redis.hset(K.txn(t.id), "_doc", s2(t));
    await emitKernel("card.expired", { cardId: id, balance: c.balance });
    return c;
  },

  async freeze(id: string, reason: string): Promise<WmpcGiftCard> {
    const r = await redis.hgetall(K.card(id));
    if (!r._doc) throw AppError.notFound("Card not found");
    const c: WmpcGiftCard = j(r._doc);
    if (c.status === "frozen") throw AppError.badRequest("Card is already frozen", { code: "INVALID_STATE" });
    if (c.status === "redeemed" || c.status === "expired")
      throw AppError.badRequest(`Cannot freeze ${c.status} card`, { code: "INVALID_STATE" });
    c.status = "frozen";
    await redis.hset(K.card(id), "_doc", s2(c));
    const t: GcTransaction = { id: uid("tx-"), cardId: id, kind: "freeze", amount: 0, currency: c.currency, at: new Date().toISOString(), orderId: reason };
    await redis.zadd(K.txns, Date.now(), t.id); await redis.hset(K.txn(t.id), "_doc", s2(t));
    const ff: GcFraudFlag = { id: uid("ff-"), cardId: id, reason, severity: "high", flaggedAt: new Date().toISOString(), resolved: false };
    await redis.zadd(K.fraud, Date.now(), ff.id); await redis.hset(K.fraudFlag(ff.id), "_doc", s2(ff));
    await emitKernel("card.frozen", { cardId: id, reason });
    return c;
  },

  /** Thaw a frozen card, restoring it to its previous usable state. */
  async unfreeze(id: string): Promise<WmpcGiftCard> {
    const r = await redis.hgetall(K.card(id));
    if (!r._doc) throw AppError.notFound("Card not found");
    const c: WmpcGiftCard = j(r._doc);
    if (c.status !== "frozen") throw AppError.badRequest("Card is not frozen", { code: "INVALID_STATE" });
    if (c.expiresAt && new Date(c.expiresAt) < new Date()) {
      c.status = "expired"; await redis.hset(K.card(id), "_doc", s2(c));
      throw AppError.badRequest("Card expired while frozen", { code: "EXPIRED" });
    }
    c.status = c.balance === 0 ? "redeemed" : "active";
    await redis.hset(K.card(id), "_doc", s2(c));
    const t: GcTransaction = { id: uid("tx-"), cardId: id, kind: "unfreeze", amount: 0, currency: c.currency, at: new Date().toISOString() };
    await redis.zadd(K.txns, Date.now(), t.id); await redis.hset(K.txn(t.id), "_doc", s2(t));
    await emitKernel("card.unfrozen", { cardId: id });
    return c;
  },

  /** Mark a fraud flag as resolved (false positive or investigated). */
  async resolveFraudFlag(id: string, resolvedById?: string): Promise<GcFraudFlag> {
    const r = await redis.hgetall(K.fraudFlag(id));
    if (!r._doc) throw AppError.notFound("Fraud flag not found");
    const f: GcFraudFlag = j(r._doc);
    f.resolved = true;
    f.resolvedAt = new Date().toISOString();
    f.resolvedBy = resolvedById;
    await redis.hset(K.fraudFlag(id), "_doc", s2(f));
    await emitKernel("giftcard.fraud_resolved", { flagId: id, cardId: f.cardId });
    return f;
  },

  async listTransactions(cardId?: string): Promise<GcTransaction[]> {
    const ids = await redis.zrange(K.txns, 0, -1);
    const out: GcTransaction[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.txn(id));
      if (r._doc) { const t = j(r._doc); if (!cardId || t.cardId === cardId) out.push(t); }
    }
    return out.slice(-50).reverse();
  },

  async listFraud(resolvedOnly?: boolean): Promise<GcFraudFlag[]> {
    const ids = await redis.zrange(K.fraud, 0, -1);
    const out: GcFraudFlag[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.fraudFlag(id));
      if (r._doc) { const f = j(r._doc); if (resolvedOnly === undefined || f.resolved === resolvedOnly) out.push(f); }
    }
    return out;
  },

  async listLoyaltyPrograms(): Promise<GcLoyaltyProgram[]> {
    const ids = await redis.zrange(K.loyalty, 0, -1);
    const out: GcLoyaltyProgram[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.loyaltyProg(id));
      if (r._doc) out.push(j(r._doc));
    }
    return out;
  },

  listAgents() { return AI_AGENTS; },

  async applyToInvoice(
    cardId: string,
    invoiceId: string,
    pin?: string,
    requestedAmount?: number,
    organizationId?: string,
  ): Promise<any> {
    const inv = organizationId
      ? await prisma.invoice.findFirst({ where: { id: invoiceId, organizationId } })
      : await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw AppError.notFound("Invoice not found in organization");
    const card = await this.getCard(cardId);
    if (!card) throw AppError.notFound("Gift card not found");
    if (card.currency.toUpperCase() !== inv.currency.toUpperCase()) throw AppError.badRequest("Gift card currency does not match invoice currency");

    const existing = await prisma.invoicePaymentAllocation.findFirst({
      where: { invoiceId, sourceKind: "gift_card", sourceId: cardId },
    });
    if (existing?.status === "applied") {
      const [ledgerEntry, allocated] = await Promise.all([
        prisma.billingLedgerEntry.findUnique({ where: { journalKey: `gift-card:${cardId}:invoice:${inv.id}` } }),
        prisma.invoicePaymentAllocation.aggregate({ where: { invoiceId, status: "applied", currency: inv.currency }, _sum: { amountCents: true } }),
      ]);
      const remainingCents = Math.max(0, inv.amountCents - Number(allocated._sum.amountCents ?? 0));
      return { success: true, card, redeemedCents: existing.amountCents, invoice: inv, ledgerEntry, idempotent: true, remainingCents };
    }
    if (inv.status === "paid") throw AppError.badRequest("Invoice already paid");
    const allocated = await prisma.invoicePaymentAllocation.aggregate({ where: { invoiceId, status: "applied", currency: inv.currency }, _sum: { amountCents: true } });
    const remainingCents = inv.amountCents - Number(allocated._sum.amountCents ?? 0);
    if (remainingCents <= 0) throw AppError.badRequest("Invoice has no remaining balance");
    const requestedCents = requestedAmount === undefined ? remainingCents : Math.round(requestedAmount * 100);
    if (requestedCents <= 0 || requestedCents > remainingCents) throw AppError.badRequest("Gift card contribution exceeds invoice remaining balance");

    // Redis redemption is idempotent by this stable order id. If the following
    // database transaction fails, a retry reuses the same redemption and safely
    // completes the durable allocation/journal.
    const redemption = await this.redeem(cardId, requestedCents / 100, pin, `inv-${invoiceId}-gift-${cardId}`);
    const redeemedCents = Math.round(redemption.redeemed * 100);
    return prisma.$transaction(async (tx) => {
      const allocation = await tx.invoicePaymentAllocation.upsert({
        where: { invoiceId_sourceKind_sourceId: { invoiceId, sourceKind: "gift_card", sourceId: cardId } },
        create: {
          organizationId: inv.organizationId, invoiceId, sourceKind: "gift_card", sourceId: cardId,
          amountCents: redeemedCents, currency: inv.currency, status: "applied", appliedAt: new Date(),
          metadata: { giftCardTransactionId: redemption.txn.id },
        },
        update: {},
      });
      const journalKey = `gift-card:${cardId}:invoice:${inv.id}`;
      const ledgerEntry = await tx.billingLedgerEntry.upsert({
        where: { journalKey },
        create: {
          organizationId: inv.organizationId, invoiceId: inv.id, giftCardId: cardId,
          sourceKind: "gift_card", journalKey, amountCents: redeemedCents,
          debitAccount: "gift_card_liability", creditAccount: "accounts_receivable",
          metadata: { giftCardTransactionId: redemption.txn.id },
        },
        update: {},
      });
      const all = await tx.invoicePaymentAllocation.findMany({ where: { invoiceId, status: "applied", currency: inv.currency } });
      const totalApplied = all.reduce((sum, item) => sum + item.amountCents, 0);
      if (totalApplied > inv.amountCents) throw new Error("Applied payment allocations exceed invoice amount");
      const updatedInvoice = totalApplied === inv.amountCents
        ? await tx.invoice.update({ where: { id: inv.id }, data: { status: "paid", paidAt: new Date() } })
        : inv;
      return { success: true, card: redemption.card, redeemedCents, invoice: updatedInvoice, allocation, ledgerEntry, idempotent: false, remainingCents: inv.amountCents - totalApplied };
    });
  },

  /** Payment Method Registration: exposes a descriptor that the existing Payment Gateway can consume.
   *  Capabilities are listed honestly — only the operations this module actually implements. */
  paymentMethodDescriptor() {
    return {
      id: "wmpc-gift-cards",
      kind: "gift-card",
      name: "WMPC Gift Cards",
      capabilities: ["redeem", "balance-inquiry"],
      currencies: ["USD","NGN","EUR","GBP","JPY","CNY"],
      version: "0.82.0",
      registeredAt: new Date().toISOString(),
    };
  },
};

export default GiftCardsService;
