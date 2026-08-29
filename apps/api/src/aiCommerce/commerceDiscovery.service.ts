/**
 * Product discovery, recommendation and comparison (§9, §10, §11).
 *
 * The single rule that governs this whole file:
 *
 *   EVERY PRODUCT FACT COMES FROM WMPC. NOTHING IS INVENTED.
 *
 * This layer may re-ORDER products WMPC returned and EXPLAIN why one looks
 * relevant, because ordering and explanation are AI work. It may never state a
 * price, stock level, vendor, specification, delivery date, warranty or return
 * policy that WMPC did not publish. Where a fact is missing, the output says
 * so explicitly ("not published by the marketplace") — it never guesses, and
 * it never treats "absent" as "no".
 */
import type {
  CommerceIntentFilters,
  ProductComparison,
  RankedProduct,
  WmpcProduct,
  WmpcProductSearchFilters,
  WmpcProductSearchRequest,
} from "@windels/shared";

/** Text shown wherever WMPC did not publish a fact. Never a guess. */
export const UNAVAILABLE = "Not published by the marketplace";

/**
 * Translate an intent's filters into a WMPC search request.
 *
 * Prices arrive from the intent engine in MAJOR units (50000 naira) and WMPC
 * speaks MINOR units, so they are converted here — a unit conversion, not a
 * price calculation. Nothing else about the money is touched.
 */
export function intentFiltersToSearchRequest(
  query: string | undefined,
  filters: CommerceIntentFilters | undefined,
  opts: { limit?: number; sort?: WmpcProductSearchRequest["sort"] } = {},
): WmpcProductSearchRequest {
  const out: WmpcProductSearchRequest = {};
  if (query) out.query = query;

  if (filters) {
    const f: WmpcProductSearchFilters = {};
    const currency = typeof filters.currency === "string" ? filters.currency : undefined;

    if (typeof filters.min_price === "number") f.minPriceMinor = Math.round(filters.min_price * 100);
    if (typeof filters.max_price === "number") f.maxPriceMinor = Math.round(filters.max_price * 100);
    if (currency) f.currency = currency;
    if (typeof filters.category === "string") f.category = filters.category;
    if (typeof filters.brand === "string") f.brand = filters.brand;
    if (typeof filters.vendor === "string") f.vendorId = filters.vendor;

    // Colour/size/condition are attributes, not top-level filters — WMPC
    // decides how to apply them.
    const attributes: Record<string, string> = {};
    for (const k of ["color", "size", "condition"] as const) {
      const v = filters[k];
      if (typeof v === "string" && v) attributes[k] = v;
    }
    if (Object.keys(attributes).length) f.attributes = attributes;

    if (Object.keys(f).length) out.filters = f;
  }

  if (opts.limit !== undefined) out.limit = opts.limit;
  if (opts.sort) out.sort = opts.sort;
  return out;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * Re-rank the products WMPC returned against what the user actually asked for.
 *
 * The score is a RELEVANCE ordering, never a quality verdict and never a
 * statement about price fairness. Reasons cite only WMPC-published fields.
 */
export function rankProducts(
  products: WmpcProduct[],
  intent: { query?: string; filters?: CommerceIntentFilters },
): RankedProduct[] {
  const qTokens = intent.query ? tokens(intent.query) : [];
  const wantColor = typeof intent.filters?.color === "string" ? intent.filters.color.toLowerCase() : undefined;
  const wantBrand = typeof intent.filters?.brand === "string" ? intent.filters.brand.toLowerCase() : undefined;
  const maxPrice = typeof intent.filters?.max_price === "number" ? intent.filters.max_price * 100 : undefined;

  const ranked = products.map((product, index) => {
    let score = 0;
    const reasons: string[] = [];

    // Term overlap with the name (strongest signal).
    if (qTokens.length) {
      const nameTokens = new Set(tokens(product.name));
      const hits = qTokens.filter((t) => nameTokens.has(t));
      if (hits.length) {
        score += (hits.length / qTokens.length) * 50;
        reasons.push(`Matches "${hits.join(" ")}" in the product name`);
      }
      const haystack = `${product.description ?? ""} ${product.category ?? ""} ${product.brand ?? ""}`.toLowerCase();
      const secondary = qTokens.filter((t) => !nameTokens.has(t) && haystack.includes(t));
      if (secondary.length) score += (secondary.length / qTokens.length) * 12;
    }

    // Colour: only when WMPC published a colour-ish spec or it is in the name.
    if (wantColor) {
      const colorSpec = product.specs.find((s) => s.key.toLowerCase() === "color" || s.key.toLowerCase() === "colour");
      const inName = product.name.toLowerCase().includes(wantColor);
      if (colorSpec?.value.toLowerCase().includes(wantColor) || inName) {
        score += 18;
        reasons.push(`Listed as ${wantColor}`);
      }
    }

    if (wantBrand && product.brand && product.brand.toLowerCase().includes(wantBrand)) {
      score += 15;
      reasons.push(`Brand: ${product.brand}`);
    }

    // Within budget — stated as a comparison against WMPC's own price only.
    if (maxPrice !== undefined && product.price.amountMinor <= maxPrice) {
      score += 12;
      reasons.push("Within your budget");
    }

    // Availability, using WMPC's verdict verbatim.
    if (product.availability === "in_stock") {
      score += 8;
      reasons.push("In stock");
    } else if (product.availability === "low_stock") {
      score += 4;
      reasons.push("Low stock");
    } else if (product.availability === "out_of_stock") {
      score -= 25;
      reasons.push("Currently out of stock");
    } else if (product.availability === "preorder") {
      reasons.push("Available for pre-order");
    }
    // "unknown" availability adds nothing and claims nothing.

    if (product.rating && product.rating.count > 0) {
      score += Math.min(product.rating.average, 5) * 2;
      reasons.push(`Rated ${product.rating.average}/5 from ${product.rating.count} reviews`);
    }

    // Preserve WMPC's own ordering as the tie-breaker: it is the marketplace's
    // relevance signal and we should not discard it.
    score += Math.max(0, 10 - index * 0.5);

    if (!reasons.length) reasons.push("Returned by the marketplace for this search");

    return { product, score: Math.round(score * 100) / 100, reasons };
  });

  return ranked.sort((a, b) => b.score - a.score);
}

/**
 * Recommendations (§10). These are WMPC products re-ordered for a stated
 * context — never a synthesised catalogue, and never a claim that a product is
 * "the best". The rationale explains the ordering, nothing more.
 */
export function buildRecommendations(
  products: WmpcProduct[],
  context: { basedOnProductIds?: string[]; query?: string; filters?: CommerceIntentFilters; limit?: number },
): RankedProduct[] {
  const exclude = new Set(context.basedOnProductIds ?? []);
  const pool = products.filter((p) => !exclude.has(p.id));
  const ranked = rankProducts(pool, { query: context.query, filters: context.filters });
  const limit = context.limit ?? 5;

  return ranked.slice(0, limit).map((r) => ({
    ...r,
    reasons: exclude.size
      ? ["Related to what you were viewing", ...r.reasons]
      : r.reasons,
  }));
}

/**
 * Build a comparison table (§11).
 *
 * A spec that WMPC did not publish for a product becomes `undefined` in that
 * column and its key is listed in `unavailableSpecs`. It is never filled in
 * from another product, from the description, or from model knowledge.
 */
export function compareProducts(products: WmpcProduct[]): ProductComparison {
  const labelByKey = new Map<string, string>();
  for (const p of products) {
    for (const spec of p.specs) {
      if (!labelByKey.has(spec.key)) labelByKey.set(spec.key, spec.label || spec.key);
    }
  }

  const rows: ProductComparison["rows"] = [];
  const unavailableSpecs: string[] = [];

  // Always-present commercial rows, taken verbatim from WMPC.
  rows.push({
    key: "price",
    label: "Price",
    values: products.map((p) => p.price.display ?? `${p.price.currency} ${(p.price.amountMinor / 100).toFixed(2)}`),
  });
  rows.push({
    key: "availability",
    label: "Availability",
    values: products.map((p) => (p.availability === "unknown" ? undefined : p.availability.replace(/_/g, " "))),
  });
  if (products.some((p) => p.availability === "unknown")) unavailableSpecs.push("availability");

  rows.push({ key: "brand", label: "Brand", values: products.map((p) => p.brand) });
  if (products.some((p) => !p.brand)) unavailableSpecs.push("brand");

  rows.push({ key: "vendor", label: "Vendor", values: products.map((p) => p.vendor?.name) });
  if (products.some((p) => !p.vendor?.name)) unavailableSpecs.push("vendor");

  rows.push({
    key: "rating",
    label: "Rating",
    values: products.map((p) => (p.rating && p.rating.count > 0 ? `${p.rating.average}/5 (${p.rating.count})` : undefined)),
  });
  if (products.some((p) => !p.rating || p.rating.count === 0)) unavailableSpecs.push("rating");

  // Published specifications.
  for (const [k, label] of labelByKey) {
    const values = products.map((p) => p.specs.find((s) => s.key === k)?.value);
    rows.push({ key: k, label, values });
    if (values.some((v) => v === undefined)) unavailableSpecs.push(k);
  }

  // Policy rows — the most dangerous ones to guess, so they are explicit.
  for (const [k, label, get] of [
    ["warranty", "Warranty", (p: WmpcProduct) => p.warranty],
    ["returnPolicy", "Return policy", (p: WmpcProduct) => p.returnPolicy],
    ["deliveryEstimate", "Delivery estimate", (p: WmpcProduct) => p.deliveryEstimate],
  ] as Array<[string, string, (p: WmpcProduct) => string | undefined]>) {
    const values = products.map(get);
    rows.push({ key: k, label, values });
    if (values.some((v) => !v)) unavailableSpecs.push(k);
  }

  return {
    products,
    rows,
    unavailableSpecs: [...new Set(unavailableSpecs)],
    summary: describeComparison(products, rows),
  };
}

/**
 * A factual, non-evaluative summary. It states differences that are visible in
 * WMPC data and explicitly refuses to declare a winner, because "better"
 * depends on facts the marketplace has not published.
 */
function describeComparison(products: WmpcProduct[], rows: ProductComparison["rows"]): string | undefined {
  if (products.length < 2) return undefined;

  const parts: string[] = [];
  const sameCurrency = products.every((p) => p.price.currency === products[0]!.price.currency);
  if (sameCurrency) {
    const cheapest = products.reduce((a, b) => (b.price.amountMinor < a.price.amountMinor ? b : a));
    const dearest = products.reduce((a, b) => (b.price.amountMinor > a.price.amountMinor ? b : a));
    if (cheapest.id !== dearest.id) {
      parts.push(`${cheapest.name} is the lowest priced at ${cheapest.price.display ?? cheapest.price.amountMinor / 100}`);
    }
  }

  const inStock = products.filter((p) => p.availability === "in_stock").map((p) => p.name);
  if (inStock.length && inStock.length < products.length) {
    parts.push(`in stock right now: ${inStock.join(", ")}`);
  }

  const missing = rows.filter((r) => r.values.some((v) => v === undefined)).map((r) => r.label);
  if (missing.length) {
    parts.push(`the marketplace has not published ${missing.slice(0, 4).join(", ")} for every item, so those rows are marked unavailable`);
  }

  if (!parts.length) return undefined;
  return `${parts.join("; ")}.`;
}

/**
 * Render a product for display to a user, substituting an explicit
 * "unavailable" marker for every fact WMPC omitted.
 */
export function describeProductFacts(product: WmpcProduct): Record<string, string> {
  return {
    name: product.name,
    price: product.price.display ?? `${product.price.currency} ${(product.price.amountMinor / 100).toFixed(2)}`,
    availability: product.availability === "unknown" ? UNAVAILABLE : product.availability.replace(/_/g, " "),
    brand: product.brand ?? UNAVAILABLE,
    vendor: product.vendor?.name ?? UNAVAILABLE,
    description: product.description ?? UNAVAILABLE,
    warranty: product.warranty ?? UNAVAILABLE,
    returnPolicy: product.returnPolicy ?? UNAVAILABLE,
    deliveryEstimate: product.deliveryEstimate ?? UNAVAILABLE,
    rating: product.rating && product.rating.count > 0 ? `${product.rating.average}/5 (${product.rating.count})` : UNAVAILABLE,
  };
}
