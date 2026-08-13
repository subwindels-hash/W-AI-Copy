/**
 * Voice commerce (§13).
 *
 * This adds NO voice platform. It is a thin bridge between the existing Voice
 * Command Center (wake word -> STT -> command -> TTS) and the commerce intent
 * engine, so a spoken sentence reaches exactly the same tools as a typed one.
 *
 * Safety posture for voice, which is materially riskier than text because a
 * misheard sentence can spend money:
 *   - Read-only intents (search, compare, track, view cart) run directly.
 *   - Any intent that changes a cart, starts a checkout or applies a gift card
 *     requires a SPOKEN CONFIRMATION step first. Voice can never silently
 *     complete a transaction.
 *   - Low STT confidence forces a clarification instead of a guess.
 */
import type { CommerceIntent, CommerceIntentName } from "@windels/shared";
import { logger } from "../observability/logger.js";
import { commerceIntentService } from "./commerceIntent.service.js";

/** Intents that must be confirmed out loud before they are executed. */
export const VOICE_CONFIRM_REQUIRED: CommerceIntentName[] = [
  "CART_ADD",
  "CART_UPDATE",
  "CART_REMOVE",
  "CART_CLEAR",
  "CHECKOUT_START",
  "GIFT_CARD_APPLY",
];

/** Below this transcription confidence we ask the user to repeat. */
const MIN_TRANSCRIPT_CONFIDENCE = 0.55;

export type VoiceCommerceDecision =
  | { action: "execute"; intent: CommerceIntent; speak: string }
  | { action: "confirm"; intent: CommerceIntent; speak: string; confirmationToken: string }
  | { action: "clarify"; speak: string; reason: "low_confidence" | "unclear_intent" };

function summarizeForSpeech(intent: CommerceIntent): string {
  const q = intent.filters?.query || (intent as any).query || "";
  switch (intent.intent) {
    case "CART_ADD":
      return `add ${q || "that item"} to your cart`;
    case "CART_UPDATE":
      return "change the quantity in your cart";
    case "CART_REMOVE":
      return "remove that item from your cart";
    case "CART_CLEAR":
      return "empty your cart";
    case "CHECKOUT_START":
      return "start checkout";
    case "GIFT_CARD_APPLY":
      return "apply that gift card";
    default:
      return "do that";
  }
}

/**
 * Turn a transcript into a decision. Never executes anything itself — the
 * caller runs the same commerce tools any other channel would.
 */
export async function interpretVoiceCommand(
  transcript: string,
  opts: {
    transcriptConfidence?: number;
    userId?: string;
    organizationId?: string;
  } = {},
): Promise<VoiceCommerceDecision> {
  const text = (transcript || "").trim();

  if (!text) {
    return { action: "clarify", speak: "I did not catch that. What are you looking for?", reason: "low_confidence" };
  }

  const sttConfidence = opts.transcriptConfidence ?? 1;
  if (sttConfidence < MIN_TRANSCRIPT_CONFIDENCE) {
    logger.info("[aiCommerce] voice transcript below confidence floor", { sttConfidence });
    return {
      action: "clarify",
      speak: "I did not hear that clearly. Could you say it again?",
      reason: "low_confidence",
    };
  }

  const intent = await commerceIntentService.interpret(text, {
    userId: opts.userId,
    organizationId: opts.organizationId,
  });

  if (intent.intent === "UNKNOWN" || intent.confidence < 0.4) {
    return {
      action: "clarify",
      speak: "I am not sure what you would like to do. You can ask me to search for a product, check your cart, or track an order.",
      reason: "unclear_intent",
    };
  }

  if (VOICE_CONFIRM_REQUIRED.includes(intent.intent)) {
    // Spend-affecting actions always route through an explicit spoken yes.
    return {
      action: "confirm",
      intent,
      speak: `Just to confirm — you want me to ${summarizeForSpeech(intent)}. Should I go ahead?`,
      // Correlates the follow-up "yes" with this specific request so an
      // unrelated later "yes" cannot authorize it.
      confirmationToken: `vc_${Date.now().toString(36)}_${intent.intent.toLowerCase()}`,
    };
  }

  return { action: "execute", intent, speak: "" };
}

const AFFIRMATIVE = /^(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|confirm|confirmed|please do)\b/i;
const NEGATIVE = /^(no|nope|cancel|stop|don'?t|never mind|nevermind|wait)\b/i;

/**
 * Interpret the reply to a confirmation prompt. Anything that is not clearly
 * affirmative is treated as "not confirmed" — silence and ambiguity never
 * authorize a transaction.
 */
export function interpretConfirmation(reply: string): "confirmed" | "declined" | "unclear" {
  const text = (reply || "").trim();
  if (!text) return "unclear";
  if (NEGATIVE.test(text)) return "declined";
  if (AFFIRMATIVE.test(text)) return "confirmed";
  return "unclear";
}

/**
 * Render a tool result as speech-friendly text. Deliberately terse: spoken
 * responses that list ten products are unusable, and reading out figures the
 * marketplace did not publish would be a fabrication.
 */
export function speakableSummary(input: {
  intent: CommerceIntentName;
  products?: Array<{ name: string; price?: { display?: string } }>;
  message?: string;
}): string {
  if (input.message) return input.message;

  const products = input.products ?? [];
  if (input.intent === "PRODUCT_SEARCH") {
    if (products.length === 0) return "I could not find anything matching that on the marketplace.";
    const top = products.slice(0, 3);
    const spoken = top
      .map((p) => (p.price?.display ? `${p.name} at ${p.price.display}` : `${p.name}, price not published`))
      .join("; ");
    const more = products.length > top.length ? ` I found ${products.length} in total.` : "";
    return `Here are the top results: ${spoken}.${more}`;
  }

  return "Done.";
}
