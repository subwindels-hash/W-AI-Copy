import { z } from "zod";
import {
  NativeChatCompletionSchema,
  NativeEmbeddingSchema,
  type NativePublicModel,
} from "./nativeAiApi.js";
export type { NativePublicModel } from "./nativeAiApi.js";

/**
 * Authenticated first-party Native AI Studio contract.
 *
 * This is deliberately separate from the API-key-only `/v1` compatibility
 * surface. It gives signed-in WINDELS members a narrow console for invoking
 * the exact same real-provider-only router, without pretending that browser
 * JWTs are external API keys.
 */
export const NativeAiConsoleChatSchema = NativeChatCompletionSchema.extend({
  // The studio intentionally supports non-streaming calls only. Public SSE is
  // available on `/v1/chat/completions` and remains API-key authenticated.
  stream: z.literal(false).default(false),
});
export type NativeAiConsoleChatInput = z.infer<typeof NativeAiConsoleChatSchema>;

export const NativeAiConsoleEmbeddingSchema = NativeEmbeddingSchema;
export type NativeAiConsoleEmbeddingInput = z.infer<typeof NativeAiConsoleEmbeddingSchema>;

export interface NativeAiConsoleStatus {
  /** True only when the operator explicitly enables publication of `/v1`. */
  publicApiEnabled: boolean;
  /** Current, health-gated aliases. An empty list never means a usable model. */
  models: NativePublicModel[];
  availability: "available" | "unavailable";
  unavailableReason: "native_api_disabled" | "no_accepted_real_model" | null;
  publicApi: {
    path: "/v1";
    authentication: "api_key";
    documentationPath: "/v1/openapi.json";
  };
  studio: {
    path: "/api/v1/native-ai";
    authentication: "session";
    streaming: false;
    demoFallbackExposed: false;
  };
}

export interface NativeAiConsoleCompletion {
  model: "windels-native";
  content: string | null;
  toolCalls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  finishReason: "stop" | "tool_calls";
  usage: { tokensIn: number; tokensOut: number; costMicros: number };
  durationMs: number;
  provenance: "real_provider";
}

export interface NativeAiConsoleEmbeddingResult {
  model: "windels-embedding";
  data: Array<{ index: number; embedding: number[] }>;
  usage: { tokensIn: number; costMicros: number };
  provenance: "real_provider";
}

export interface NativeAiConsoleUsage {
  generatedAt: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  aiCostMicros: number;
  quota: {
    configured: boolean;
    limit: number | null;
    used: number | null;
    remaining: number | null;
  };
}
