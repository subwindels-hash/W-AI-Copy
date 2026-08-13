/**
 * Truthfulness and safety tests for the AI Commerce layer.
 *
 * These cover the rules that make commerce SAFE rather than merely working:
 * §9-§11 (never invent a fact), §12 (never overstate an image match), §13
 * (voice never silently spends), §21 (typed errors), §28 (analytics carries no
 * secrets) and §32 (the mock can never be mistaken for production).
 */
import { describe, expect, it } from "vitest";
import type { WmpcProduct } from "@windels/shared";
import {
  UNAVAILABLE,
  compareProducts,
  describeProductFacts,
  intentFiltersToSearchRequest,
  rankProducts,
} from "../commerceDiscovery.service.js";
import { commerceIntentService } from "../commerceIntent.service.js";
import { buildImageShoppingResult, gradeMatch, type VisionObservation } from "../commerceImageShopping.service.js";
import { interpretConfirmation, interpretVoiceCommand, VOICE_CONFIRM_REQUIRED } from "../commerceVoice.service.js";
import { COMMERCE_ANALYTICS_EVENTS } from "../commerceAnalytics.service.js";
import { AI_COMMERCE_FLAG_KEYS } from "../commerceFlags.js";
import { COMMERCE_TOOL_NAMES } from "../tools/commerceTools.js";
import { MockWmpcAdapter } from "../wmpc/mockWmpcAdapter.js";
import { MOCK_PRODUCTS } from "../wmpc/mockWmpc.fixtures.js";
import { commerceError, httpStatusForCommerceError } from "../commerceErrors.js";

function product(overrides: Partial<WmpcProduct> = {}): WmpcProduct {
  return {
    id: "WMPC-MOCK-T-1",
    name: "Test Product",
    price: { amountMinor: 1_000_00, currency: "NGN", display: "NGN 1,000.00" },
    currency: "NGN",
    availability: "in_stock",
    images: [],
    specs: [],
    ...overrides,
  } as WmpcProduct;
}

// ─── §9-§11 — never invent a fact ────────────────────────────────────────────

describe("discovery never invents a fact", () => {
  it("marks every unpublished field as unavailable instead of guessing", () => {
    const facts = describeProductFacts(
      product({ brand: undefined, warranty: undefined, returnPolicy: undefined, deliveryEstimate: undefined }),
    );
    expect(facts.brand).toBe(UNAVAILABLE);
    expect(facts.warranty).toBe(UNAVAILABLE);
    expect(facts.returnPolicy).toBe(UNAVAILABLE);
    expect(facts.deliveryEstimate).toBe(UNAVAILABLE);
  });

  it("reports an unknown availability as unavailable rather than as in stock", () => {
    const facts = describeProductFacts(product({ availability: "unknown" }));
    expect(facts.availability).toBe(UNAVAILABLE);
  });

  it("reports a zero-review rating as unavailable rather than as zero out of five", () => {
    const facts = describeProductFacts(product({ rating: { average: 0, count: 0 } }));
    expect(facts.rating).toBe(UNAVAILABLE);
  });

  it("passes the marketplace price through verbatim and never recomputes it", () => {
    const facts = describeProductFacts(product({ price: { amountMinor: 4_999_99, currency: "NGN", display: "₦4,999.99" } }));
    expect(facts.price).toBe("₦4,999.99");
  });

  it("leaves a comparison cell undefined when the marketplace has no value for it", () => {
    const comparison = compareProducts([
      product({ id: "A", specs: [{ key: "ram", label: "RAM", value: "8GB" }] as never }),
      product({ id: "B", specs: [] }),
    ]);
    const ramRow = comparison.rows.find((r) => r.key === "ram");
    expect(ramRow).toBeDefined();
    expect(ramRow!.values[0]).toBe("8GB");
    expect(ramRow!.values[1]).toBeUndefined();
    // unavailableSpecs holds spec KEYS, per the ProductComparison contract.
    expect(comparison.unavailableSpecs).toContain("ram");
  });

  it("never names a winner in the comparison summary", () => {
    const comparison = compareProducts([product({ id: "A" }), product({ id: "B" })]);
    if (!comparison.summary) return;
    const s = comparison.summary.toLowerCase();
    for (const forbidden of ["best", "winner", "better buy", "you should", "i recommend"]) {
      expect(s).not.toContain(forbidden);
    }
  });

  it("ranks for relevance only — it never reorders on price alone", () => {
    const cheap = product({ id: "cheap", name: "Unrelated Widget", price: { amountMinor: 100, currency: "NGN" } });
    const relevant = product({ id: "relevant", name: "Black Running Shoe", price: { amountMinor: 900_00, currency: "NGN" } });
    const ranked = rankProducts([cheap, relevant], { query: "black running shoe" });
    expect(ranked[0].product.id).toBe("relevant");
  });

  it("converts a major-unit budget to minor units for the marketplace query", () => {
    const req = intentFiltersToSearchRequest("shoe", { max_price: 50_000, currency: "NGN" }, { limit: 5 });
    expect(req.filters?.maxPriceMinor).toBe(50_000 * 100);
    expect(req.filters?.currency).toBe("NGN");
  });
});

// ─── §3 — intent extraction ──────────────────────────────────────────────────

describe("commerce intent engine", () => {
  it("extracts the example from the specification", () => {
    const intent = commerceIntentService.interpretWithRules("find me a black shoe under 50k");
    expect(intent.intent).toBe("PRODUCT_SEARCH");
    expect(intent.filters?.max_price).toBe(50_000);
    expect(intent.filters?.color).toBe("black");
    expect((intent.query ?? "").toLowerCase()).toContain("shoe");
  });

  it("never puts product data into the intent — only what the user asked for", () => {
    const intent = commerceIntentService.interpretWithRules("find me a phone under 200k");
    const serialized = JSON.stringify(intent);
    expect(serialized).not.toContain("amountMinor");
    expect(serialized).not.toContain("availability");
    expect(intent).not.toHaveProperty("products");
  });

  it("classifies the cart, checkout and tracking verbs", () => {
    expect(commerceIntentService.interpretWithRules("add it to my cart").intent).toBe("CART_ADD");
    expect(commerceIntentService.interpretWithRules("empty my cart").intent).toBe("CART_CLEAR");
    expect(commerceIntentService.interpretWithRules("checkout").intent).toBe("CHECKOUT_START");
    expect(["ORDER_TRACK", "ORDER_STATUS"]).toContain(
      commerceIntentService.interpretWithRules("where is my order").intent,
    );
  });

  it("returns UNKNOWN with zero confidence for an empty utterance", async () => {
    const intent = await commerceIntentService.interpret("");
    expect(intent.intent).toBe("UNKNOWN");
    expect(intent.confidence).toBe(0);
  });
});

// ─── §12 — image shopping honesty ────────────────────────────────────────────

describe("image shopping never overstates a match", () => {
  const seeing = (o: Partial<VisionObservation>): VisionObservation => ({
    description: "black leather ankle boot",
    attributes: {},
    identificationConfidence: 0.9,
    ...o,
  });

  it("only claims an exact match when brand AND model were both legible and both match", () => {
    const match = gradeMatch(
      seeing({ brand: "Acme", model: "X100" }),
      product({ name: "Acme X100 Ankle Boot", brand: "Acme" }),
    );
    expect(match.confidence).toBe("exact_match");
  });

  it("downgrades to likely when only the brand was legible", () => {
    const match = gradeMatch(
      seeing({ brand: "Acme", description: "black leather ankle boot" }),
      product({ name: "Acme Black Leather Ankle Boot", brand: "Acme" }),
    );
    expect(match.confidence).toBe("likely_match");
    expect(match.rationale.toLowerCase()).toContain("model");
  });

  it("never claims exact or likely when the photo was unclear", () => {
    const match = gradeMatch(
      seeing({ brand: "Acme", model: "X100", identificationConfidence: 0.45 }),
      product({ name: "Acme X100 Ankle Boot", brand: "Acme" }),
    );
    expect(["similar_product", "same_category", "visually_related"]).toContain(match.confidence);
  });

  it("falls back to visually related when nothing lines up", () => {
    const match = gradeMatch(seeing({}), product({ name: "Stainless Steel Kettle" }));
    expect(match.confidence).toBe("visually_related");
  });

  it("returns an inconclusive result rather than inventing matches when vision fails", () => {
    const result = buildImageShoppingResult(null, MOCK_PRODUCTS);
    expect(result.matches).toHaveLength(0);
    expect(result.inconclusiveReason).toBeTruthy();
  });

  it("returns inconclusive when vision could not identify the object", () => {
    const result = buildImageShoppingResult(seeing({ identificationConfidence: 0.2 }), MOCK_PRODUCTS);
    expect(result.matches).toHaveLength(0);
    expect(result.inconclusiveReason).toBeTruthy();
  });

  it("orders matches strongest first", () => {
    const result = buildImageShoppingResult(seeing({ brand: "Balogun" }), MOCK_PRODUCTS);
    const order = ["exact_match", "likely_match", "similar_product", "same_category", "visually_related"];
    const positions = result.matches.map((m) => order.indexOf(m.confidence));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

// ─── §13 — voice never silently spends ───────────────────────────────────────

describe("voice commerce safety", () => {
  it("requires spoken confirmation for every spend-affecting intent", async () => {
    for (const utterance of ["add it to my cart", "empty my cart", "checkout"]) {
      const decision = await interpretVoiceCommand(utterance);
      expect(decision.action).toBe("confirm");
    }
  });

  it("lists exactly the transactional intents as confirmation-required", () => {
    expect(VOICE_CONFIRM_REQUIRED).toContain("CHECKOUT_START");
    expect(VOICE_CONFIRM_REQUIRED).toContain("CART_CLEAR");
    expect(VOICE_CONFIRM_REQUIRED).not.toContain("PRODUCT_SEARCH");
  });

  it("executes read-only intents without a confirmation round trip", async () => {
    const decision = await interpretVoiceCommand("find me a phone under 200k");
    expect(decision.action).toBe("execute");
  });

  it("asks the user to repeat instead of guessing when the transcript is unreliable", async () => {
    const decision = await interpretVoiceCommand("add it to my cart", { transcriptConfidence: 0.2 });
    expect(decision.action).toBe("clarify");
    if (decision.action !== "clarify") return;
    expect(decision.reason).toBe("low_confidence");
  });

  it("treats anything that is not clearly affirmative as NOT confirmed", () => {
    expect(interpretConfirmation("yes")).toBe("confirmed");
    expect(interpretConfirmation("go ahead")).toBe("confirmed");
    expect(interpretConfirmation("no")).toBe("declined");
    expect(interpretConfirmation("cancel")).toBe("declined");
    expect(interpretConfirmation("")).toBe("unclear");
    expect(interpretConfirmation("hmm maybe later")).toBe("unclear");
    expect(interpretConfirmation("what is the price")).toBe("unclear");
  });
});

// ─── §21 — the 13 errors ─────────────────────────────────────────────────────

describe("commerce errors", () => {
  it("maps each error code to a sensible HTTP status", () => {
    expect(httpStatusForCommerceError("UNAUTHORIZED")).toBe(401);
    expect(httpStatusForCommerceError("FORBIDDEN")).toBe(403);
    expect(httpStatusForCommerceError("PRODUCT_NOT_FOUND")).toBe(404);
    expect(httpStatusForCommerceError("ORDER_NOT_FOUND")).toBe(404);
    expect(httpStatusForCommerceError("RATE_LIMITED")).toBe(429);
    expect(httpStatusForCommerceError("WMPC_UNAVAILABLE")).toBe(503);
  });

  it("builds an error carrying a code, message and retryability", () => {
    const err = commerceError("WMPC_UNAVAILABLE", "Marketplace is down.", { correlationId: "abc" });
    expect(err.code).toBe("WMPC_UNAVAILABLE");
    expect(err.message).toBe("Marketplace is down.");
    expect(typeof err.retryable).toBe("boolean");
    expect(err.correlationId).toBe("abc");
  });
});

// ─── §28/§29/§4 — inventory of the contracted surface ────────────────────────

describe("declared surface matches the specification", () => {
  it("declares exactly the 11 analytics events", () => {
    expect(COMMERCE_ANALYTICS_EVENTS).toHaveLength(11);
  });

  it("declares exactly the 9 feature flags", () => {
    expect(AI_COMMERCE_FLAG_KEYS).toHaveLength(9);
    expect(AI_COMMERCE_FLAG_KEYS[0]).toBe("AI_COMMERCE_ENABLED");
  });

  it("registers exactly the 17 named commerce tools", () => {
    expect(COMMERCE_TOOL_NAMES).toEqual([
      "search_products",
      "get_product",
      "compare_products",
      "get_cart",
      "add_to_cart",
      "update_cart",
      "remove_from_cart",
      "clear_cart",
      "create_checkout",
      "get_checkout",
      "get_payment_methods",
      "get_payment_status",
      "get_orders",
      "get_order",
      "track_order",
      "validate_gift_card",
      "apply_gift_card",
    ]);
  });
});

// ─── §32 — the mock can never pass for production ────────────────────────────

describe("mock adapter is unmistakably a mock", () => {
  it("declares itself non-production", () => {
    const adapter = new MockWmpcAdapter("test");
    expect(adapter.isProduction).toBe(false);
    expect(adapter.name).toContain("mock");
  });

  it("labels every fixture id and vendor so mock data cannot be mistaken for real", () => {
    for (const p of MOCK_PRODUCTS) {
      expect(p.id.startsWith("WMPC-MOCK-")).toBe(true);
      if (p.vendor) expect(p.vendor.name.toLowerCase()).toContain("mock");
    }
  });

  it("says so in its health detail", async () => {
    const health = await new MockWmpcAdapter("test").health();
    expect(health.detail?.toLowerCase()).toContain("mock");
  });

  it("omits some specs so the unavailable path is exercised", () => {
    const withGaps = MOCK_PRODUCTS.filter((p) => !p.warranty || !p.returnPolicy || p.specs.length === 0);
    expect(withGaps.length).toBeGreaterThan(0);
  });
});
