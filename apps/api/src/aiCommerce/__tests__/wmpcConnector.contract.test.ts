/**
 * §33 — WMPC connector CONTRACT tests.
 *
 * These tests are written against the INTERFACE, not the mock. Every adapter
 * that implements `WmpcCommerceConnector` must pass them, so when the real
 * Stage 2 adapter arrives it can be dropped into `adapters` below and the same
 * expectations run against the live API.
 *
 * The contract covers all 16 operations plus the cross-cutting rules:
 *   - a result is ALWAYS a discriminated CommerceResult, never a bare throw
 *   - reads never mutate
 *   - mutations honour the idempotency key
 *   - one customer can never see another customer's cart, order or checkout
 *   - the adapter reports its own production status honestly
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { CommerceCustomerContext } from "@windels/shared";
import { MockWmpcAdapter } from "../wmpc/mockWmpcAdapter.js";
import { MOCK_ID_PREFIX } from "../wmpc/mockWmpc.fixtures.js";
import type { WmpcCallOptions, WmpcCommerceConnector } from "../wmpc/wmpcConnector.types.js";
import type { CommerceError, CommerceResult } from "@windels/shared";

/**
 * `apps/api` compiles with strictNullChecks off, so `if (res.ok) return;` does
 * not narrow a discriminated union. These helpers assert AND narrow.
 */
function expectOk<T>(res: CommerceResult<T>): T {
  expect(res.ok).toBe(true);
  return (res as { ok: true; data: T }).data;
}

function expectErr<T>(res: CommerceResult<T>): CommerceError {
  expect(res.ok).toBe(false);
  return (res as { ok: false; error: CommerceError }).error;
}

const alice: CommerceCustomerContext = {
  userId: "user-alice",
  organizationId: "org-1",
  channel: "chat",
  currency: "NGN",
};

const bob: CommerceCustomerContext = {
  userId: "user-bob",
  organizationId: "org-1",
  channel: "chat",
  currency: "NGN",
};

/** Alice's id in a DIFFERENT organization — must also be isolated. */
const aliceOtherOrg: CommerceCustomerContext = { ...alice, organizationId: "org-2" };

let seq = 0;
function opts(idempotencyKey?: string): WmpcCallOptions {
  seq += 1;
  return { correlationId: `test-corr-${seq}`, ...(idempotencyKey ? { idempotencyKey } : {}) };
}

/**
 * Adapters under contract. Stage 2 adds:
 *   { name: "http", make: () => new HttpWmpcAdapter({...}) }  // gated on creds
 */
const adapters: Array<{ name: string; make: () => WmpcCommerceConnector }> = [
  { name: "MockWmpcAdapter", make: () => new MockWmpcAdapter("test") },
];

for (const { name, make } of adapters) {
  describe(`WMPC connector contract — ${name}`, () => {
    let c: WmpcCommerceConnector;

    beforeEach(() => {
      c = make();
    });

    // ── identity ───────────────────────────────────────────────────────────

    it("reports its adapter identity and whether it serves production data", () => {
      expect(typeof c.name).toBe("string");
      expect(c.name.length).toBeGreaterThan(0);
      expect(typeof c.isProduction).toBe("boolean");
      // A mock adapter must never claim to be production.
      if (c.name.includes("mock")) expect(c.isProduction).toBe(false);
    });

    it("answers a health probe without throwing", async () => {
      const health = await c.health();
      expect(health).toHaveProperty("healthy");
      expect(health).toHaveProperty("adapter");
      expect(typeof health.healthy).toBe("boolean");
    });

    // ── products/search ────────────────────────────────────────────────────

    describe("searchProducts", () => {
      it("returns a paginated result with products, total and the echoed query", async () => {
        const res = await c.searchProducts(alice, { query: "phone", limit: 10 }, opts());
        const d = expectOk(res);
        expect(Array.isArray(d.products)).toBe(true);
        expect(typeof d.total).toBe("number");
        expect(d.total).toBeGreaterThanOrEqual(d.products.length);
      });

      it("every returned product carries the required Product shape", async () => {
        const res = await c.searchProducts(alice, { query: "phone", limit: 5 }, opts());
        const d = expectOk(res);
        for (const p of d.products) {
          expect(typeof p.id).toBe("string");
          expect(typeof p.name).toBe("string");
          expect(typeof p.price.amountMinor).toBe("number");
          expect(typeof p.price.currency).toBe("string");
          expect(["in_stock", "low_stock", "out_of_stock", "preorder", "unknown"]).toContain(p.availability);
          expect(Array.isArray(p.images)).toBe(true);
          expect(Array.isArray(p.specs)).toBe(true);
        }
      });

      it("honours a max-price filter without recomputing any price", async () => {
        const cap = 20_000_00;
        const res = await c.searchProducts(alice, { filters: { maxPriceMinor: cap, currency: "NGN" } }, opts());
        const d = expectOk(res);
        for (const p of d.products) expect(p.price.amountMinor).toBeLessThanOrEqual(cap);
      });

      it("returns an empty list rather than an error when nothing matches", async () => {
        const res = await c.searchProducts(alice, { query: "zzzzz-nonexistent-zzzzz" }, opts());
        const d = expectOk(res);
        expect(d.products).toHaveLength(0);
        expect(d.total).toBe(0);
      });
    });

    // ── products/{id} ──────────────────────────────────────────────────────

    describe("getProduct", () => {
      it("returns the product for a known id", async () => {
        const search = await c.searchProducts(alice, { query: "phone", limit: 1 }, opts());
        const d = expectOk(search);
        const id = d.products[0].id;

        const res = await c.getProduct(alice, id, opts());
        const d2 = expectOk(res);
        expect(d2.id).toBe(id);
      });

      it("returns PRODUCT_NOT_FOUND for an unknown id — never an invented product", async () => {
        const res = await c.getProduct(alice, "definitely-not-a-real-product", opts());
        const err = expectErr(res);
        expect(err.code).toBe("PRODUCT_NOT_FOUND");
        expect(typeof err.message).toBe("string");
      });
    });

    // ── cart ───────────────────────────────────────────────────────────────

    describe("cart", () => {
      it("returns an empty cart for a new customer instead of erroring", async () => {
        const res = await c.getCart(alice, opts());
        const d = expectOk(res);
        expect(d.items).toHaveLength(0);
        expect(d.subtotal.amountMinor).toBe(0);
      });

      it("adds an item and returns the WHOLE cart with marketplace-computed totals", async () => {
        const search = await c.searchProducts(alice, { query: "phone", limit: 1 }, opts());
        if (!search.ok) throw new Error("search failed");
        const product = search.data.products[0];

        const res = await c.addToCart(alice, { productId: product.id, quantity: 2 }, opts("idem-add-1"));
        const d = expectOk(res);
        expect(d.items).toHaveLength(1);
        expect(d.items[0].productId).toBe(product.id);
        expect(d.items[0].quantity).toBe(2);
        // The cart's own arithmetic comes from the marketplace, not from us.
        expect(d.subtotal.amountMinor).toBe(product.price.amountMinor * 2);
        expect(d.total.amountMinor).toBeGreaterThanOrEqual(d.subtotal.amountMinor);
      });

      it("is idempotent: the same idempotency key does not double-add", async () => {
        const search = await c.searchProducts(alice, { query: "phone", limit: 1 }, opts());
        if (!search.ok) throw new Error("search failed");
        const product = search.data.products[0];
        const key = "idem-stable-key";

        const first = await c.addToCart(alice, { productId: product.id, quantity: 1 }, opts(key));
        const second = await c.addToCart(alice, { productId: product.id, quantity: 1 }, opts(key));
        expect(first.ok && second.ok).toBe(true);
        if (!first.ok || !second.ok) return;

        expect(second.data.items).toHaveLength(1);
        expect(second.data.items[0].quantity).toBe(1);
        expect(second.data.subtotal.amountMinor).toBe(first.data.subtotal.amountMinor);
      });

      it("rejects adding an unknown product", async () => {
        const res = await c.addToCart(alice, { productId: "no-such-product", quantity: 1 }, opts("idem-bad"));
        const err = expectErr(res);
        expect(err.code).toBe("PRODUCT_NOT_FOUND");
      });

      it("updates a line quantity", async () => {
        const search = await c.searchProducts(alice, { query: "phone", limit: 1 }, opts());
        if (!search.ok) throw new Error("search failed");
        const added = await c.addToCart(alice, { productId: search.data.products[0].id, quantity: 1 }, opts("u1"));
        if (!added.ok) throw new Error("add failed");

        const res = await c.updateCartItem(alice, { itemId: added.data.items[0].id, quantity: 3 }, opts("u2"));
        const d = expectOk(res);
        expect(d.items[0].quantity).toBe(3);
      });

      it("returns CART_UPDATE_FAILED when updating a line that is not there", async () => {
        // §21 defines exactly 13 error codes; a missing cart line is a cart
        // update failure, not a bespoke code.
        const res = await c.updateCartItem(alice, { itemId: "nope", quantity: 2 }, opts("u3"));
        const err = expectErr(res);
        expect(err.code).toBe("CART_UPDATE_FAILED");
      });

      it("removes a line", async () => {
        const search = await c.searchProducts(alice, { query: "phone", limit: 1 }, opts());
        if (!search.ok) throw new Error("search failed");
        const added = await c.addToCart(alice, { productId: search.data.products[0].id, quantity: 1 }, opts("r1"));
        if (!added.ok) throw new Error("add failed");

        const res = await c.removeCartItem(alice, { itemId: added.data.items[0].id }, opts("r2"));
        const d = expectOk(res);
        expect(d.items).toHaveLength(0);
        expect(d.subtotal.amountMinor).toBe(0);
      });

      it("clears the cart", async () => {
        const search = await c.searchProducts(alice, { query: "phone", limit: 2 }, opts());
        if (!search.ok) throw new Error("search failed");
        for (const p of search.data.products) {
          await c.addToCart(alice, { productId: p.id, quantity: 1 }, opts(`c-${p.id}`));
        }

        const res = await c.clearCart(alice, opts("clear-1"));
        const d = expectOk(res);
        expect(d.items).toHaveLength(0);
      });

      it("ISOLATION: Bob's cart is unaffected by Alice's cart", async () => {
        const search = await c.searchProducts(alice, { query: "phone", limit: 1 }, opts());
        if (!search.ok) throw new Error("search failed");
        await c.addToCart(alice, { productId: search.data.products[0].id, quantity: 4 }, opts("iso-1"));

        const bobCart = await c.getCart(bob, opts());
        const d = expectOk(bobCart);
        expect(d.items).toHaveLength(0);
      });

      it("ISOLATION: the same user id in another organization gets a separate cart", async () => {
        const search = await c.searchProducts(alice, { query: "phone", limit: 1 }, opts());
        if (!search.ok) throw new Error("search failed");
        await c.addToCart(alice, { productId: search.data.products[0].id, quantity: 1 }, opts("iso-2"));

        const other = await c.getCart(aliceOtherOrg, opts());
        const d = expectOk(other);
        expect(d.items).toHaveLength(0);
      });
    });

    // ── checkout ───────────────────────────────────────────────────────────

    describe("checkout", () => {
      async function aliceWithCart() {
        const search = await c.searchProducts(alice, { query: "phone", limit: 1 }, opts());
        if (!search.ok) throw new Error("search failed");
        const added = await c.addToCart(alice, { productId: search.data.products[0].id, quantity: 1 }, opts("ck-add"));
        if (!added.ok) throw new Error("add failed");
        return added.data;
      }

      it("creates a checkout session carrying WMPC's own totals", async () => {
        const cart = await aliceWithCart();
        const res = await c.createCheckout(alice, { cartId: cart.id }, opts("ck-1"));
        const d = expectOk(res);
        expect(typeof d.id).toBe("string");
        expect(d.subtotal.amountMinor).toBe(cart.subtotal.amountMinor);
        expect(d.total.amountMinor).toBeGreaterThanOrEqual(d.subtotal.amountMinor);
        expect(Array.isArray(d.paymentMethods)).toBe(true);
      });

      it("refuses to create a checkout for an empty cart", async () => {
        const res = await c.createCheckout(bob, {}, opts("ck-empty"));
        const err = expectErr(res);
        expect(err.code).toBe("CHECKOUT_FAILED");
        expect(err.message.toLowerCase()).toContain("empty");
      });

      it("is idempotent: the same key returns the same checkout id", async () => {
        await aliceWithCart();
        const a = await c.createCheckout(alice, {}, opts("ck-same"));
        const b = await c.createCheckout(alice, {}, opts("ck-same"));
        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect(b.data.id).toBe(a.data.id);
      });

      it("reads back a checkout by id", async () => {
        await aliceWithCart();
        const created = await c.createCheckout(alice, {}, opts("ck-2"));
        if (!created.ok) throw new Error("checkout failed");

        const res = await c.getCheckout(alice, created.data.id, opts());
        const d = expectOk(res);
        expect(d.id).toBe(created.data.id);
      });

      it("ISOLATION: Bob cannot read Alice's checkout", async () => {
        await aliceWithCart();
        const created = await c.createCheckout(alice, {}, opts("ck-3"));
        if (!created.ok) throw new Error("checkout failed");

        const res = await c.getCheckout(bob, created.data.id, opts());
        const err = expectErr(res);
        // The adapter must not leak that the checkout exists for someone else.
        expect(["FORBIDDEN", "CHECKOUT_FAILED"]).toContain(err.code);
      });
    });

    // ── payment ────────────────────────────────────────────────────────────

    describe("payment", () => {
      it("lists payment methods offered by the marketplace", async () => {
        const res = await c.getPaymentMethods(alice, opts());
        const d = expectOk(res);
        expect(Array.isArray(d)).toBe(true);
        for (const m of d) {
          expect(typeof m.id).toBe("string");
          expect(typeof m.label).toBe("string");
        }
      });

      it("never returns anything resembling a payment credential", async () => {
        const res = await c.getPaymentMethods(alice, opts());
        const d = expectOk(res);
        const serialized = JSON.stringify(d).toLowerCase();
        for (const forbidden of ["cvv", "cvc", "cardnumber", "card_number", "pan", "secret", "privatekey"]) {
          expect(serialized).not.toContain(forbidden);
        }
      });

      it("errors on an unknown payment id rather than inventing a status", async () => {
        // Critically: it must NOT return a fabricated "pending" or "succeeded".
        const res = await c.getPaymentStatus(alice, "no-such-payment", opts());
        const err = expectErr(res);
        expect(["ORDER_NOT_FOUND", "INVALID_REQUEST"]).toContain(err.code);
      });
    });

    // ── orders ─────────────────────────────────────────────────────────────

    describe("orders", () => {
      it("returns an empty order list for a customer with no orders", async () => {
        const res = await c.listOrders(bob, {}, opts());
        const d = expectOk(res);
        expect(d.orders).toHaveLength(0);
        expect(d.total).toBe(0);
      });

      it("returns ORDER_NOT_FOUND for an unknown order", async () => {
        const res = await c.getOrder(alice, "no-such-order", opts());
        const err = expectErr(res);
        expect(err.code).toBe("ORDER_NOT_FOUND");
      });

      it("returns ORDER_NOT_FOUND for tracking on an unknown order", async () => {
        const res = await c.getOrderTracking(alice, "no-such-order", opts());
        const err = expectErr(res);
        expect(err.code).toBe("ORDER_NOT_FOUND");
      });
    });

    // ── gift cards ─────────────────────────────────────────────────────────

    describe("gift cards", () => {
      it("validates a known gift card and reports its marketplace balance", async () => {
        const res = await c.validateGiftCard(alice, `${MOCK_ID_PREFIX}GIFT-5000`, opts());
        const d = expectOk(res);
        expect(d.valid).toBe(true);
        expect(d.balance?.amountMinor).toBeGreaterThan(0);
      });

      it("reports an unknown gift card as invalid rather than erroring", async () => {
        const res = await c.validateGiftCard(alice, "NOT-A-REAL-CARD", opts());
        const d = expectOk(res);
        expect(d.valid).toBe(false);
        expect(typeof d.reason).toBe("string");
      });

      it("reports a zero-balance card as invalid", async () => {
        const res = await c.validateGiftCard(alice, `${MOCK_ID_PREFIX}GIFT-EMPTY`, opts());
        const d = expectOk(res);
        expect(d.valid).toBe(false);
      });

      it("reports an invalid gift card as not applied, with a reason", async () => {
        // A rejected gift card is a business outcome, not a transport error —
        // but `applied` must be false and no discount may appear.
        const res = await c.applyGiftCard(alice, { code: "NOT-A-REAL-CARD" }, opts("gc-1"));
        const d = expectOk(res);
        expect(d.applied).toBe(false);
        expect(typeof d.reason).toBe("string");
        expect(d.amountApplied).toBeUndefined();
      });
    });

    // ── cross-cutting ──────────────────────────────────────────────────────

    describe("cross-cutting guarantees", () => {
      it("never throws — every failure arrives as a typed CommerceResult", async () => {
        const calls: Array<Promise<{ ok: boolean }>> = [
          c.getProduct(alice, "", opts()),
          c.getCheckout(alice, "", opts()),
          c.getPaymentStatus(alice, "", opts()),
          c.getOrder(alice, "", opts()),
          c.getOrderTracking(alice, "", opts()),
          c.validateGiftCard(alice, "", opts()),
          c.updateCartItem(alice, { itemId: "", quantity: 1 }, opts("x1")),
          c.removeCartItem(alice, { itemId: "" }, opts("x2")),
        ];
        const results = await Promise.all(calls);
        for (const r of results) expect(typeof r.ok).toBe("boolean");
      });

      it("every error carries a code and a human-readable message", async () => {
        const res = await c.getProduct(alice, "missing", opts());
        const err = expectErr(res);
        expect(typeof err.code).toBe("string");
        expect(err.message.length).toBeGreaterThan(0);
      });

      it("reads do not mutate: repeated getCart calls are stable", async () => {
        const search = await c.searchProducts(alice, { query: "phone", limit: 1 }, opts());
        if (!search.ok) throw new Error("search failed");
        await c.addToCart(alice, { productId: search.data.products[0].id, quantity: 2 }, opts("stable-1"));

        const a = await c.getCart(alice, opts());
        const b = await c.getCart(alice, opts());
        if (!a.ok || !b.ok) throw new Error("getCart failed");
        expect(b.data.items).toHaveLength(a.data.items.length);
        expect(b.data.subtotal.amountMinor).toBe(a.data.subtotal.amountMinor);
      });
    });
  });
}
