/**
 * First-party Native AI Studio client.
 *
 * The public API-key surface remains available from `nativeAiApi.ts` at `/v1`.
 * This client uses the signed-in member session against `/api/v1/native-ai` and
 * never substitutes an echo/demo response when no accepted provider exists.
 */
import { api } from "./api";
import { nativeAiApi as nativeAiPublicApi } from "./nativeAiApi";
import type {
  NativeAiConsoleChatInput,
  NativeAiConsoleCompletion,
  NativeAiConsoleEmbeddingInput,
  NativeAiConsoleEmbeddingResult,
  NativeAiConsoleStatus,
  NativeAiConsoleUsage,
  NativePublicModel,
} from "@windels/shared/nativeAi";

// Keep the pre-existing public client exports available to any old consumer.
export * from "./nativeAiApi";
export type {
  NativeAiConsoleChatInput,
  NativeAiConsoleCompletion,
  NativeAiConsoleEmbeddingInput,
  NativeAiConsoleEmbeddingResult,
  NativeAiConsoleStatus,
  NativeAiConsoleUsage,
  NativePublicModel,
};

export const nativeAiStudioApi = {
  status: () => api<NativeAiConsoleStatus>("/native-ai/status"),
  models: () => api<NativePublicModel[]>("/native-ai/models"),
  usage: () => api<NativeAiConsoleUsage>("/native-ai/usage"),
  openApi: () => api<Record<string, unknown>>("/native-ai/openapi"),
  chat: (input: NativeAiConsoleChatInput) =>
    api<NativeAiConsoleCompletion>("/native-ai/chat", { method: "POST", json: input }),
  embeddings: (input: NativeAiConsoleEmbeddingInput) =>
    api<NativeAiConsoleEmbeddingResult>("/native-ai/embeddings", { method: "POST", json: input }),
};

/** Backward-compatible public-client alias retained from the former stub. */
export const nativeAiLegacyApi = nativeAiPublicApi;
