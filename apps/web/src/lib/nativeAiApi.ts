/** Session 181 — Native AI API web client (public /v1 surface)
 * Thin wrapper over the public Native AI API (`/v1/chat/completions`,
 * `/v1/embeddings`, etc.) for the scanner and for the Developer Platform
 * playground that already exists. Real provider health is checked before use.
 */
import { api } from "./api";
import type { NativeChatCompletionInput, NativeEmbeddingInput } from "@windels/shared/nativeAiApi";
export type * from "@windels/shared/nativeAiApi";

export const nativeAiApi = {
  chat: (input: NativeChatCompletionInput) => api<any>("/native-ai/chat/completions", { method: "POST", json: input }),
  embeddings: (input: NativeEmbeddingInput) => api<any>("/native-ai/embeddings", { method: "POST", json: input }),
  models: () => api<any[]>("/native-ai/models"),
  health: () => api<any>("/native-ai/health"),
};
