/**
 * Image shopping (§12).
 *
 * Reuses the EXISTING vision pipeline (`aiRegistry.complete` with
 * `requiredCapabilities: ["vision"]`) — no second computer-vision platform is
 * built here. The flow is:
 *
 *   photo -> vision describes what it sees -> that description becomes a WMPC
 *   product search -> each returned product is labelled with an honest
 *   confidence tier.
 *
 * Truthfulness rules enforced structurally:
 *   - "exact_match" is only ever produced when vision read an explicit brand
 *     AND model identifier off the image AND that identifier appears in the
 *     product's own WMPC fields. Otherwise the tier is downgraded.
 *   - Every match carries a rationale in the user's language.
 *   - If vision cannot identify the object, the result is inconclusive and no
 *     matches are fabricated to fill the gap.
 */
import type {
  ImageMatchConfidence,
  ImageShoppingMatch,
  ImageShoppingResult,
  WmpcProduct,
} from "@windels/shared";
import { logger } from "../observability/logger.js";

export interface VisionObservation {
  description: string;
  category?: string;
  brand?: string;
  model?: string;
  attributes: Record<string, string>;
  /** Vision's own certainty that it identified the object at all, 0-1. */
  identificationConfidence: number;
}

const VISION_SYSTEM_PROMPT = `You identify products in photographs so they can be looked up in a marketplace catalogue.

Report only what is VISIBLE in the image. Do not guess a brand from styling, do not guess a model number, do not estimate a price, and do not describe features you cannot see.

Respond with JSON only:
{
  "description": "short shopping-style description, e.g. black leather ankle boot with a block heel",
  "category": "broad category or null",
  "brand": "brand ONLY if a logo or brand name is legible in the image, else null",
  "model": "model name/number ONLY if printed and legible in the image, else null",
  "attributes": { "color": "...", "material": "...", "style": "..." },
  "identificationConfidence": 0.0
}

Set identificationConfidence below 0.4 when the object is blurred, cropped, ambiguous, or is not a shoppable product.`;

function safeJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : undefined;
}

/**
 * Ask the existing vision model what is in the photo. Returns null when the
 * provider is unconfigured — the caller must then report the feature as
 * unavailable rather than invent an observation.
 */
export async function observeImage(
  image: { dataBase64: string; mimeType: string },
  hint: string | undefined,
  meta: { userId?: string; organizationId?: string; agentId?: string; conversationId?: string },
): Promise<VisionObservation | null> {
  try {
    const { aiRegistry } = await import("../services/ai/registry.js");
    const response = await aiRegistry.complete(
      {
        model: "",
        requiredCapabilities: ["vision"],
        temperature: 0,
        maxTokens: 400,
        messages: [
          { role: "system", content: VISION_SYSTEM_PROMPT },
          {
            role: "user",
            content: hint ? `The shopper said: ${hint}` : "Identify the product in this photo.",
            images: [{ mimeType: image.mimeType, dataBase64: image.dataBase64 }],
          },
        ],
      } as never,
      {
        channel: "ai-commerce",
        feature: "image-shopping",
        organizationId: meta.organizationId,
        userId: meta.userId,
        agentId: meta.agentId,
        conversationId: meta.conversationId,
      } as never,
    );

    const text = (response as any)?.content ?? (response as any)?.text ?? "";
    const parsed = safeJson(String(text));
    if (!parsed) return null;

    const rawAttrs = parsed.attributes;
    const attributes: Record<string, string> = {};
    if (rawAttrs && typeof rawAttrs === "object") {
      for (const [k, v] of Object.entries(rawAttrs as Record<string, unknown>)) {
        const s = str(v);
        if (s) attributes[k] = s;
      }
    }

    const confidence = Number(parsed.identificationConfidence);
    return {
      description: str(parsed.description) ?? "",
      category: str(parsed.category),
      brand: str(parsed.brand),
      model: str(parsed.model),
      attributes,
      identificationConfidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    };
  } catch (err) {
    logger.warn("[aiCommerce] vision observation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function norm(v: string | undefined): string {
  return (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(v: string): string[] {
  return norm(v).split(" ").filter((t) => t.length > 2);
}

/**
 * Grade one WMPC product against the vision observation.
 *
 * The ladder is deliberately conservative: a tier is only reached when the
 * evidence for it is present in WMPC's own product fields.
 */
export function gradeMatch(observation: VisionObservation, product: WmpcProduct): ImageShoppingMatch {
  const productText = norm(
    [product.name, product.brand, product.category, product.description, ...(product.specs ?? []).map((s: any) => `${s.label} ${s.value}`)]
      .filter(Boolean)
      .join(" "),
  );

  const brandSeen = observation.brand ? productText.includes(norm(observation.brand)) : false;
  const modelSeen = observation.model ? productText.includes(norm(observation.model)) : false;
  const categorySeen = observation.category ? productText.includes(norm(observation.category)) : false;

  const descTokens = tokens(observation.description);
  const overlap = descTokens.filter((t) => productText.includes(t));
  const overlapRatio = descTokens.length ? overlap.length / descTokens.length : 0;

  let confidence: ImageMatchConfidence;
  let rationale: string;

  if (brandSeen && modelSeen) {
    // Both the brand AND the model were legible in the photo and both appear
    // in WMPC's own data. This is the only path to "exact".
    confidence = "exact_match";
    rationale = `The brand (${observation.brand}) and model (${observation.model}) visible in your photo both match this listing.`;
  } else if (brandSeen && overlapRatio >= 0.5) {
    confidence = "likely_match";
    rationale = `The brand ${observation.brand} is visible in your photo and this listing matches most of what I can see. I could not read a model number, so I cannot confirm it is the identical item.`;
  } else if (overlapRatio >= 0.6) {
    confidence = "similar_product";
    rationale = "This listing matches most of the visible features in your photo, but nothing in the image identifies the exact product.";
  } else if (categorySeen || overlapRatio >= 0.3) {
    confidence = "same_category";
    rationale = "This is the same kind of product as the one in your photo.";
  } else {
    confidence = "visually_related";
    rationale = "This came up in the marketplace search built from your photo, but it is only loosely related.";
  }

  // A shaky identification can never produce a strong claim.
  if (observation.identificationConfidence < 0.6 && (confidence === "exact_match" || confidence === "likely_match")) {
    confidence = "similar_product";
    rationale = `${rationale} The photo was not clear enough for me to be certain.`;
  }

  return { product, confidence, rationale };
}

/**
 * Build a WMPC search query from what vision saw. The query is a description,
 * never a fabricated product id.
 */
export function observationToQuery(observation: VisionObservation): string {
  const parts = [observation.brand, observation.model, observation.description].filter(Boolean);
  const q = parts.join(" ").trim();
  return q || observation.category || "";
}

/** Assemble the final §12 result, honestly ordered by confidence. */
export function buildImageShoppingResult(
  observation: VisionObservation | null,
  products: WmpcProduct[],
): ImageShoppingResult {
  if (!observation) {
    return {
      observed: { description: "", attributes: {} },
      matches: [],
      inconclusiveReason:
        "Image recognition is not available right now, so I could not look at your photo. You can describe what you are looking for instead.",
    };
  }

  if (observation.identificationConfidence < 0.4 || !observation.description) {
    return {
      observed: {
        description: observation.description,
        category: observation.category,
        attributes: observation.attributes,
      },
      matches: [],
      inconclusiveReason:
        "I could not identify the product in that photo clearly enough to search for it. A sharper, closer photo — or a short description — would help.",
    };
  }

  const order: ImageMatchConfidence[] = [
    "exact_match",
    "likely_match",
    "similar_product",
    "same_category",
    "visually_related",
  ];

  const matches = products
    .map((p) => gradeMatch(observation, p))
    .sort((a, b) => order.indexOf(a.confidence) - order.indexOf(b.confidence));

  return {
    observed: {
      description: observation.description,
      category: observation.category,
      attributes: observation.attributes,
    },
    matches,
    ...(matches.length === 0
      ? { inconclusiveReason: "The marketplace returned no products for what I could see in your photo." }
      : {}),
  };
}
