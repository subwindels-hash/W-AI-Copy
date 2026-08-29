/**
 * Typed client for the public, API-key-authenticated WINDELS Native AI API.
 *
 * This deliberately does not use the browser session `api()` helper: `/v1`
 * requires an explicit WND API key and lives outside `/api/v1`. UI code should
 * not collect or persist API keys; it should direct signed-in members to the
 * Native AI Studio instead. This client exists for developer tooling/examples.
 */
import type { NativeChatCompletionInput, NativeEmbeddingInput } from "@windels/shared/nativeAiApi";
export type * from "@windels/shared/nativeAiApi";

export class NativeAiPublicApiError extends Error {
  constructor(public status: number, public code: string | null, message: string) {
    super(message);
    this.name = "NativeAiPublicApiError";
  }
}

function baseUrl() {
  return (import.meta.env.VITE_PUBLIC_API_ORIGIN ?? "").replace(/\/$/, "");
}

async function request<T>(path: string, apiKey: string, init: RequestInit = {}): Promise<T> {
  if (!apiKey.trim()) throw new NativeAiPublicApiError(401, "invalid_api_key", "A WND API key is required for the public /v1 API");
  const response = await fetch(`${baseUrl()}/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) {
    throw new NativeAiPublicApiError(response.status, body?.error?.code ?? null, body?.error?.message ?? response.statusText);
  }
  return body as T;
}

export const nativeAiApi = {
  chat: (input: NativeChatCompletionInput, apiKey: string) =>
    request<any>("/chat/completions", apiKey, { method: "POST", body: JSON.stringify(input) }),
  embeddings: (input: NativeEmbeddingInput, apiKey: string) =>
    request<any>("/embeddings", apiKey, { method: "POST", body: JSON.stringify(input) }),
  models: (apiKey: string) => request<any>("/models", apiKey),
  openApi: async () => {
    const response = await fetch(`${baseUrl()}/v1/openapi.json`);
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new NativeAiPublicApiError(response.status, body?.error?.code ?? null, body?.error?.message ?? response.statusText);
    return body as Record<string, unknown>;
  },
};
