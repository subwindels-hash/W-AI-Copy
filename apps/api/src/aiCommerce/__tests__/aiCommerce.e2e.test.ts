/**
 * §34 — the seven named end-to-end tests.
 *
 *   1. "find me a phone under 200k"          -> search
 *   2. "compare these two"                   -> comparison
 *   3. "add the second one to my cart"       -> add to cart
 *   4. "checkout"                            -> checkout session
 *   5. "where is my order"                   -> order tracking
 *   6. WMPC emits payment.completed          -> WINDELS reacts
 *   7. unauthorized cross-user access        -> DENIED
 *
 * These run the FULL chain that production uses:
 *   utterance -> intent engine -> commerce tool -> guard -> connector -> WMPC.
 * Nothing is stubbed except the marketplace itself (the mock adapter) and the
 * two authorization dependencies the guard consults.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// The guard consults the real permissions module and feature-flag store.
// Neither has a database or Redis in this suite, so both are stubbed at the
// module boundary — the guard's own logic is exercised unmodified.
const grantedPermissions = new Set<string>();
let permissionsGranted = true;

vi.mock("../../permissions/permissions.module.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  permissionsModule: {
    async hasPermission(_userId: string, permission: string) {
      if (!permissionsGranted) return false;
      return grantedPermissions.size === 0 || grantedPermissions.has(permission);
    },
  },
}));

vi.mock("../../platformServices/featureFlags.service.js", () => ({
  FeatureFlagsService: {
    // No flag rows exist -> the guard's "not explicitly disabled" path.
    async findByKey() {
      return null;
    },
    async evaluate() {
      return true;
    },
  },
}));

vi.mock("../../audit/audit.service.js", () => ({
  auditService: { log: vi.fn(async () => undefined) },
}));

import type { ToolContext } from "../../services/tools/toolRegistry.js";
import { COMMERCE_TOOLS } from "../tools/commerceTools.js";
import { MockWmpcAdapter } from "../wmpc/mockWmpcAdapter.js";
import { setWmpcConnector } from "../wmpc/connectorFactory.js";
import { commerceIntentService } from "../commerceIntent.service.js";
import { commerceSessionService } from "../commerceSession.service.js";
import { wmpcEventConsumer, type WmpcEventOutcome, type WmpcEventRejection } from "../events/wmpcEventConsumer.service.js";

/**
 * `apps/api` compiles with strictNullChecks off, so a discriminant check does
 * not narrow. These helpers assert AND narrow the webhook outcome.
 */
function expectAccepted(o: WmpcEventOutcome) {
  expect(o.accepted).toBe(true);
  return o as Extract<WmpcEventOutcome, { accepted: true }>;
}

function expectRejected(o: WmpcEventOutcome, reason: WmpcEventRejection) {
  expect(o.accepted).toBe(false);
  expect((o as Extract<WmpcEventOutcome, { accepted: false }>).reason).toBe(reason);
}

const tool = (name: string) => {
  const t = COMMERCE_TOOLS.find((x) => x.definition.name === name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t;
};

const ALICE: ToolContext = {
  userId: "user-alice",
  organizationId: "org-1",
  agentId: "agent-commerce",
  conversationId: "conv-1",
  isAdmin: false,
} as ToolContext;

const MALLORY: ToolContext = {
  userId: "user-mallory",
  organizationId: "org-1",
  agentId: "agent-commerce",
  conversationId: "conv-2",
  isAdmin: false,
} as ToolContext;

let adapter: MockWmpcAdapter;

beforeEach(() => {
  adapter = new MockWmpcAdapter("test");
  setWmpcConnector(adapter);
  grantedPermissions.clear();
  permissionsGranted = true;
  wmpcEventConsumer.__resetSeen();
});

// ─── E2E 1 ────────────────────────────────────────────────────────────────────

describe('E2E 1 — "find me a phone under 200k"', () => {
  it("extracts the intent, budget and category, then returns real marketplace products", async () => {
    const utterance = "find me a phone under 200k";

    // Step 1: natural language -> structured intent (§3).
    const intent = await commerceIntentService.interpret(utterance, {
      userId: ALICE.userId,
      organizationId: ALICE.organizationId,
    });
    expect(intent.intent).toBe("PRODUCT_SEARCH");
    expect(intent.filters?.max_price).toBe(200_000);
    expect((intent.query ?? "").toLowerCase()).toContain("phone");

    // Step 2: intent -> tool call -> connector -> WMPC.
    const result = await tool("search_products").execute(
      { query: intent.query, max_price: intent.filters?.max_price, currency: "NGN" },
      ALICE,
    );

    expect(result.success).toBe(true);
    const data = result.data as any;
    expect(data.products.length).toBeGreaterThan(0);

    // Provenance: every id came from WMPC. The tool renders the marketplace's
    // own price string; WINDELS never recomputes it.
    for (const p of data.products) {
      expect(p.id).toMatch(/^WMPC-MOCK-/);
      expect(typeof p.price).toBe("string");
      expect(p.price.length).toBeGreaterThan(0);
    }

    // Cross-check against the connector: nothing over budget got through.
    const raw = await adapter.searchProducts(
      { userId: ALICE.userId, organizationId: ALICE.organizationId, channel: "chat" },
      { query: intent.query, filters: { maxPriceMinor: 200_000 * 100, currency: "NGN" } },
      { correlationId: "e2e-1" },
    );
    expect(raw.ok).toBe(true);
    if (!raw.ok) return;
    for (const p of raw.data.products) expect(p.price.amountMinor).toBeLessThanOrEqual(200_000 * 100);
  });

  it("returns an honest empty result rather than inventing a product", async () => {
    const result = await tool("search_products").execute({ query: "quantum teleporter" }, ALICE);
    expect(result.success).toBe(true);
    expect((result.data as any).products).toHaveLength(0);
  });
});

// ─── E2E 2 ────────────────────────────────────────────────────────────────────

describe('E2E 2 — "compare these two"', () => {
  it("builds a side-by-side comparison and marks unpublished specs unavailable", async () => {
    const search = await tool("search_products").execute({ query: "phone", limit: 3 }, ALICE);
    const products = (search.data as any).products;
    expect(products.length).toBeGreaterThanOrEqual(2);

    const intent = await commerceIntentService.interpret("compare these two", {
      userId: ALICE.userId,
      organizationId: ALICE.organizationId,
    });
    expect(intent.intent).toBe("PRODUCT_COMPARE");

    const result = await tool("compare_products").execute(
      { product_ids: [products[0].id, products[1].id] },
      ALICE,
    );

    expect(result.success).toBe(true);
    const comparison = result.data as any;
    expect(comparison.products).toHaveLength(2);
    expect(comparison.rows.length).toBeGreaterThan(0);

    // Any spec one product lacks is rendered as an explicit "not published"
    // string — never silently filled in from the other product.
    for (const row of comparison.rows) {
      expect(row.values).toHaveLength(2);
      for (const v of row.values) expect(typeof v).toBe("string");
    }
    expect(Array.isArray(comparison.unavailableSpecs)).toBe(true);
    const flat = comparison.rows.flatMap((r: any) => r.values).join(" ");
    if (comparison.unavailableSpecs.length > 0) {
      expect(flat).toContain("Not published by the marketplace");
    }

    // The comparison never declares a winner.
    if (comparison.summary) {
      const s = String(comparison.summary).toLowerCase();
      for (const forbidden of ["best", "winner", "you should buy", "better choice", "recommend"]) {
        expect(s).not.toContain(forbidden);
      }
    }
  });

  it("refuses to compare fewer than two products", async () => {
    const result = await tool("compare_products").execute({ product_ids: ["WMPC-MOCK-PHONE-001"] }, ALICE);
    expect(result.success).toBe(false);
  });
});

// ─── E2E 3 ────────────────────────────────────────────────────────────────────

describe('E2E 3 — "add the second one to my cart"', () => {
  it("resolves the ordinal from session context and adds the item to the WMPC cart", async () => {
    // A prior search puts result ids into the AI session (ids only — §8).
    const search = await tool("search_products").execute({ query: "phone", limit: 3 }, ALICE);
    const products = (search.data as any).products;

    const session = await commerceSessionService.getOrCreate({
      userId: ALICE.userId,
      organizationId: ALICE.organizationId,
      channel: "chat",
    });
    await commerceSessionService.rememberSearch(session, {
      query: "phone",
      resultIds: products.map((p: any) => p.id),
    });

    const reloaded = await commerceSessionService.get(ALICE.organizationId, session.sessionId, ALICE.userId);
    expect(reloaded.lastSearch.resultIds).toHaveLength(products.length);

    // "the second one" -> the session's own ordinal resolver.
    const secondId = commerceSessionService.resolveOrdinal(reloaded, 2);
    expect(secondId).toBe(products[1].id);

    const result = await tool("add_to_cart").execute({ product_id: secondId, quantity: 1 }, ALICE);
    expect(result.success).toBe(true);

    const cart = result.data as any;
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].productId).toBe(secondId);

    // The total is WMPC's; WINDELS did not compute it. Compare against the
    // marketplace's own figure rather than the tool's display rendering.
    const marketplaceProduct = await adapter.getProduct(
      { userId: ALICE.userId, organizationId: ALICE.organizationId, channel: "chat" },
      secondId,
      { correlationId: "e2e-3" },
    );
    expect(marketplaceProduct.ok).toBe(true);
    if (!marketplaceProduct.ok) return;
    expect(cart.subtotal.amountMinor).toBe(marketplaceProduct.data.price.amountMinor);
  });

  it("stores only ids in the session — never a second cart", async () => {
    const session = await commerceSessionService.getOrCreate({
      userId: ALICE.userId,
      organizationId: ALICE.organizationId,
      channel: "chat",
    });
    const serialized = JSON.stringify(session);
    expect(serialized).not.toContain("amountMinor");
    expect(serialized).not.toContain("subtotal");
    expect(session).not.toHaveProperty("items");
  });
});

// ─── E2E 4 ────────────────────────────────────────────────────────────────────

describe('E2E 4 — "checkout"', () => {
  async function fillCart() {
    const search = await tool("search_products").execute({ query: "phone", limit: 1 }, ALICE);
    const productId = (search.data as any).products[0].id;
    await tool("add_to_cart").execute({ product_id: productId, quantity: 1 }, ALICE);
    // Return the marketplace record so tests can assert on real money values.
    const record = await adapter.getProduct(
      { userId: ALICE.userId, organizationId: ALICE.organizationId, channel: "chat" },
      productId,
      { correlationId: "e2e-4" },
    );
    if (!record.ok) throw new Error("product lookup failed");
    return record.data;
  }

  it("requires explicit confirmation before creating a checkout session", async () => {
    await fillCart();
    const unconfirmed = await tool("create_checkout").execute({}, ALICE);
    expect(unconfirmed.success).toBe(false);
    expect(String(unconfirmed.error).toLowerCase()).toContain("confirm");
  });

  it("creates a WMPC checkout session and passes through every marketplace figure", async () => {
    const product = await fillCart();

    const intent = await commerceIntentService.interpret("checkout", {
      userId: ALICE.userId,
      organizationId: ALICE.organizationId,
    });
    expect(intent.intent).toBe("CHECKOUT_START");

    const result = await tool("create_checkout").execute({ confirmed: true }, ALICE);
    expect(result.success).toBe(true);

    const checkout = result.data as any;
    expect(typeof checkout.id).toBe("string");
    expect(checkout.subtotal.amountMinor).toBe(product.price.amountMinor);
    expect(checkout.total.amountMinor).toBeGreaterThanOrEqual(checkout.subtotal.amountMinor);
    expect(Array.isArray(checkout.paymentMethods)).toBe(true);

    // WINDELS must never have recomputed the total itself: reading the session
    // back returns exactly the marketplace figure, tax and shipping included.
    const readBack = await tool("get_checkout").execute({ checkout_id: checkout.id }, ALICE);
    expect(readBack.success).toBe(true);
    expect((readBack.data as any).total.amountMinor).toBe(checkout.total.amountMinor);
  });

  it("never returns a payment credential in the checkout payload", async () => {
    await fillCart();
    const result = await tool("create_checkout").execute({ confirmed: true }, ALICE);
    const serialized = JSON.stringify(result.data).toLowerCase();
    for (const forbidden of ["cvv", "cvc", "cardnumber", "card_number", "pan\"", "secret"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

// ─── E2E 5 ────────────────────────────────────────────────────────────────────

describe('E2E 5 — "where is my order"', () => {
  async function placeOrder() {
    const search = await tool("search_products").execute({ query: "phone", limit: 1 }, ALICE);
    const product = (search.data as any).products[0];
    await tool("add_to_cart").execute({ product_id: product.id, quantity: 1 }, ALICE);
    const checkout = await tool("create_checkout").execute({ confirmed: true }, ALICE);
    const checkoutId = (checkout.data as any).id;
    // WMPC — not WINDELS — creates the order.
    const order = adapter.seedOrderFromCheckout(
      { userId: ALICE.userId, organizationId: ALICE.organizationId, channel: "chat" },
      checkoutId,
    );
    if (!order) throw new Error("order seeding failed");
    return order;
  }

  it("finds the order and returns WMPC's tracking timeline", async () => {
    const order = await placeOrder();

    const intent = await commerceIntentService.interpret("where is my order", {
      userId: ALICE.userId,
      organizationId: ALICE.organizationId,
    });
    expect(["ORDER_TRACK", "ORDER_STATUS", "ORDER_LIST"]).toContain(intent.intent);

    const list = await tool("get_orders").execute({}, ALICE);
    expect(list.success).toBe(true);
    expect((list.data as any).orders.length).toBeGreaterThan(0);

    const tracking = await tool("track_order").execute({ order_id: order.id }, ALICE);
    expect(tracking.success).toBe(true);

    const t = tracking.data as any;
    expect(t.orderId).toBe(order.id);
    expect(Array.isArray(t.events)).toBe(true);
    expect(t.events.length).toBeGreaterThan(0);
    for (const ev of t.events) {
      expect(typeof ev.status).toBe("string");
      expect(typeof ev.occurredAt).toBe("string");
    }
  });

  it("reports an unknown order honestly instead of guessing a location", async () => {
    const tracking = await tool("track_order").execute({ order_id: "WMPC-MOCK-ORD-NOPE" }, ALICE);
    expect(tracking.success).toBe(false);
    expect(String(tracking.error).length).toBeGreaterThan(0);
  });
});

// ─── E2E 6 ────────────────────────────────────────────────────────────────────

describe("E2E 6 — WMPC emits payment.completed and WINDELS reacts", () => {
  const SECRET = "test-wmpc-webhook-secret-value";

  function sign(rawBody: string, timestamp: string) {
    // Same construction the consumer verifies: HMAC over `${ts}.${body}`.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createHmac } = require("node:crypto");
    return createHmac("sha256", SECRET).update(`${timestamp}.${rawBody}`).digest("hex");
  }

  function envelope(id: string) {
    return {
      id,
      type: "payment.completed",
      occurredAt: new Date().toISOString(),
      orderId: "WMPC-MOCK-ORD-123",
      paymentId: "WMPC-MOCK-PAY-123",
      data: { organizationId: "org-1", windelsUserId: "user-alice", status: "succeeded" },
    };
  }

  beforeEach(async () => {
    const { env } = await import("../../config/env.js");
    (env as any).WMPC_WEBHOOK_SECRET = SECRET;
  });

  it("accepts a correctly signed, fresh event and dispatches it", async () => {
    const body = JSON.stringify(envelope("evt-pay-1"));
    const ts = String(Date.now());

    const outcome = await wmpcEventConsumer.handleInbound({
      rawBody: body,
      signature: sign(body, ts),
      timestamp: ts,
    });

    const accepted = expectAccepted(outcome);
    expect(accepted.duplicate).toBe(false);
    expect(accepted.event.type).toBe("payment.completed");
  });

  it("rejects a forged signature", async () => {
    const body = JSON.stringify(envelope("evt-pay-2"));
    const ts = String(Date.now());

    const outcome = await wmpcEventConsumer.handleInbound({
      rawBody: body,
      signature: "0".repeat(64),
      timestamp: ts,
    });

    expectRejected(outcome, "invalid_signature");
  });

  it("rejects a replayed old timestamp even with a valid signature", async () => {
    const body = JSON.stringify(envelope("evt-pay-3"));
    const ts = String(Date.now() - 60 * 60 * 1000); // one hour ago

    const outcome = await wmpcEventConsumer.handleInbound({
      rawBody: body,
      signature: sign(body, ts),
      timestamp: ts,
    });

    expectRejected(outcome, "stale_timestamp");
  });

  it("is idempotent: the same event id is accepted once and then flagged duplicate", async () => {
    const body = JSON.stringify(envelope("evt-pay-idem"));
    const ts = String(Date.now());
    const sig = sign(body, ts);

    const first = await wmpcEventConsumer.handleInbound({ rawBody: body, signature: sig, timestamp: ts });
    const second = await wmpcEventConsumer.handleInbound({ rawBody: body, signature: sig, timestamp: ts });

    expect(expectAccepted(first).duplicate).toBe(false);
    expect(expectAccepted(second).duplicate).toBe(true);
  });

  it("rejects a payload that does not match the event contract", async () => {
    const body = JSON.stringify({ id: "evt-bad", type: "not.a.real.event", data: {} });
    const ts = String(Date.now());

    const outcome = await wmpcEventConsumer.handleInbound({
      rawBody: body,
      signature: sign(body, ts),
      timestamp: ts,
    });

    expectRejected(outcome, "invalid_payload");
  });

  it("refuses every event when no webhook secret is configured", async () => {
    const { env } = await import("../../config/env.js");
    const saved = (env as any).WMPC_WEBHOOK_SECRET;
    (env as any).WMPC_WEBHOOK_SECRET = undefined;

    const body = JSON.stringify(envelope("evt-pay-4"));
    const outcome = await wmpcEventConsumer.handleInbound({
      rawBody: body,
      signature: "anything",
      timestamp: String(Date.now()),
    });

    (env as any).WMPC_WEBHOOK_SECRET = saved;

    expectRejected(outcome, "not_configured");
  });
});

// ─── E2E 7 ────────────────────────────────────────────────────────────────────

describe("E2E 7 — unauthorized cross-user access is DENIED", () => {
  it("Mallory cannot read Alice's checkout", async () => {
    const search = await tool("search_products").execute({ query: "phone", limit: 1 }, ALICE);
    await tool("add_to_cart").execute({ product_id: (search.data as any).products[0].id, quantity: 1 }, ALICE);
    const created = await tool("create_checkout").execute({ confirmed: true }, ALICE);
    const checkoutId = (created.data as any).id;

    const attempt = await tool("get_checkout").execute({ checkout_id: checkoutId }, MALLORY);

    expect(attempt.success).toBe(false);
    // A denial must be an explicit refusal, never an empty-but-successful result.
    expect(attempt.data).toBeUndefined();
    expect(String(attempt.error).length).toBeGreaterThan(0);
  });

  it("Mallory cannot see items in Alice's cart", async () => {
    const search = await tool("search_products").execute({ query: "phone", limit: 1 }, ALICE);
    await tool("add_to_cart").execute({ product_id: (search.data as any).products[0].id, quantity: 3 }, ALICE);

    const mallorysCart = await tool("get_cart").execute({}, MALLORY);
    expect(mallorysCart.success).toBe(true);
    expect((mallorysCart.data as any).items).toHaveLength(0);
  });

  it("Mallory cannot list Alice's orders", async () => {
    const search = await tool("search_products").execute({ query: "phone", limit: 1 }, ALICE);
    await tool("add_to_cart").execute({ product_id: (search.data as any).products[0].id, quantity: 1 }, ALICE);
    const created = await tool("create_checkout").execute({ confirmed: true }, ALICE);
    adapter.seedOrderFromCheckout(
      { userId: ALICE.userId, organizationId: ALICE.organizationId, channel: "chat" },
      (created.data as any).id,
    );

    const orders = await tool("get_orders").execute({}, MALLORY);
    expect(orders.success).toBe(true);
    expect((orders.data as any).orders).toHaveLength(0);
  });

  it("a session belonging to Alice is never returned to Mallory", async () => {
    const session = await commerceSessionService.getOrCreate({
      userId: ALICE.userId,
      organizationId: ALICE.organizationId,
      channel: "chat",
    });

    const stolen = await commerceSessionService.get("org-1", session.sessionId, MALLORY.userId);
    expect(stolen).toBeNull();
  });

  it("an unauthenticated caller is denied before the connector is reached", async () => {
    const anonymous = { userId: undefined, organizationId: undefined, isAdmin: false } as unknown as ToolContext;
    const attempt = await tool("get_cart").execute({}, anonymous);

    expect(attempt.success).toBe(false);
    expect((attempt.metadata as any)?.code).toBe("UNAUTHORIZED");
  });

  it("a user without the required permission is denied a cart mutation", async () => {
    permissionsGranted = false;
    const attempt = await tool("add_to_cart").execute({ product_id: "WMPC-MOCK-PHONE-001", quantity: 1 }, ALICE);

    expect(attempt.success).toBe(false);
    expect((attempt.metadata as any)?.code).toBe("FORBIDDEN");
  });

  it("AI reasoning cannot bypass the guard: the tool itself enforces it", async () => {
    // Even with a perfectly-formed payload the agent could construct, the
    // guard runs first and the connector is never called.
    permissionsGranted = false;
    const spy = vi.spyOn(adapter, "clearCart");

    const attempt = await tool("clear_cart").execute({ confirmed: true }, ALICE);

    expect(attempt.success).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
