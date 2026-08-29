import { randomUUID } from "node:crypto";
import { AppError } from "../utils/result.js";
import { aiRegistry } from "../services/ai/registry.js";
import type { ChatImage, ChatMessage, ModelInfo, UsageInfo } from "../services/ai/types.js";
import type { NativeChatCompletionInput, NativePublicModel, NativeToolSchema } from "@windels/shared/nativeAiApi";
import type { z } from "zod";

let catalogCache: { at: number; internal: ModelInfo[]; public: NativePublicModel[] } | null = null;
const CATALOG_TTL_MS = 30_000;
export function clearNativeModelCatalogCache() { catalogCache = null; }

function cap(model: ModelInfo, capability: string): boolean { return model.capabilities.includes(capability); }
function chatModels(models: ModelInfo[]): ModelInfo[] { return models.filter((model) => model.maxOutput > 0 && !cap(model, "embeddings")); }
function choose(models: ModelInfo[], required: string[], preferred?: string): ModelInfo | null {
  const candidates = models.filter((model) => required.every((capability) => cap(model, capability)));
  const configured = preferred ? candidates.find((model) => model.id === preferred) : undefined;
  return configured ?? candidates[0] ?? null;
}
function toPublicCatalog(models: ModelInfo[]): NativePublicModel[] {
  const created = Math.floor(Date.now() / 1000);
  const chat = chatModels(models);
  const capabilities = new Set<string>();
  if (chat.length) capabilities.add("chat");
  if (chat.some((model) => cap(model, "stream"))) capabilities.add("streaming");
  if (chat.some((model) => cap(model, "vision"))) capabilities.add("vision");
  if (chat.some((model) => cap(model, "json_mode"))) { capabilities.add("structured_output"); capabilities.add("tools"); }
  const output: NativePublicModel[] = [];
  if (chat.length) output.push({
    id: "windels-native", object: "model", created, owned_by: "windels",
    capabilities: [...capabilities], modalities: ["text", ...(capabilities.has("vision") ? ["image"] : [])],
    context_window: Math.max(...chat.map((model) => model.contextWindow)),
    max_output_tokens: Math.max(...chat.map((model) => model.maxOutput)), status: "available",
  });
  const embedding = models.filter((model) => cap(model, "embeddings"));
  if (embedding.length) output.push({ id: "windels-embedding", object: "model", created, owned_by: "windels", capabilities: ["embeddings"], modalities: ["text"], context_window: Math.max(...embedding.map((model) => model.contextWindow)), status: "available" });
  const openAiHealthy = models.some((model) => model.provider === "openai") && !!process.env.OPENAI_API_KEY;
  if (openAiHealthy) {
    output.push({ id: "windels-image-1", object: "model", created, owned_by: "windels", capabilities: ["image_generation"], modalities: ["text", "image"], status: "available" });
    output.push({ id: "windels-speech-1", object: "model", created, owned_by: "windels", capabilities: ["speech_generation", "transcription"], modalities: ["text", "audio"], status: "available" });
  }
  return output;
}

export async function nativeModelCatalog(force = false) {
  if (!force && catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache;
  const enabled = process.env.WINDELS_NATIVE_API_ENABLED === "true";
  const internal = enabled ? await aiRegistry.listPublicRoutableModels() : [];
  const publicModels = toPublicCatalog(internal);
  catalogCache = { at: Date.now(), internal, public: publicModels };
  return catalogCache;
}

function parseImage(url: string): ChatImage {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  if (!match) throw AppError.validation("Only inline data:image/png|jpeg|webp|gif;base64 vision inputs are currently supported");
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.length > 10 * 1024 * 1024) throw AppError.validation("Inline image exceeds 10MB");
  return { mimeType: match[1]!, dataBase64: match[2]! };
}
function toChatMessage(message: NativeChatCompletionInput["messages"][number]): ChatMessage {
  if (typeof message.content === "string") {
    const prefix = message.role === "tool" ? `[Tool result${message.tool_call_id ? ` for ${message.tool_call_id}` : ""}]\n` : "";
    return { role: message.role === "tool" ? "user" : message.role, content: `${prefix}${message.content}`, name: message.name, toolCallId: message.tool_call_id };
  }
  const text = message.content.filter((part) => part.type === "text").map((part: any) => part.text).join("\n");
  const images = message.content.filter((part) => part.type === "image_url").map((part: any) => parseImage(part.image_url.url));
  return { role: message.role === "tool" ? "user" : message.role, content: text, images, name: message.name, toolCallId: message.tool_call_id };
}
function validToolArguments(schema: Record<string, unknown>, args: Record<string, unknown>): boolean {
  const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
  if (required.some((field) => !(field in args))) return false;
  const properties = schema.properties && typeof schema.properties === "object" ? schema.properties as Record<string, any> : {};
  for (const [name, value] of Object.entries(args)) {
    const type = properties[name]?.type;
    if (type === "string" && typeof value !== "string") return false;
    if ((type === "number" || type === "integer") && typeof value !== "number") return false;
    if (type === "boolean" && typeof value !== "boolean") return false;
    if (type === "array" && !Array.isArray(value)) return false;
    if (type === "object" && (value === null || typeof value !== "object" || Array.isArray(value))) return false;
  }
  return true;
}
function toolSystemPrompt(tools: Array<z.infer<typeof NativeToolSchema>>, forced?: string): string {
  return [
    "You are WINDELS tool-selection middleware. Decide whether one supplied function is necessary.",
    forced ? `You MUST call the function named ${forced}.` : "Call a function only when it is needed; otherwise answer normally.",
    "Return exactly one JSON object, with no markdown. Either:",
    '{"type":"tool_call","name":"function_name","arguments":{}}',
    'or {"type":"message","content":"normal answer"}.',
    `Available functions: ${JSON.stringify(tools.map((tool) => tool.function))}`,
  ].join("\n");
}
export interface NativeCompletionResult {
  content: string | null;
  toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  finishReason: "stop" | "tool_calls";
  usage: UsageInfo;
  internalModel: string;
  provider: string;
  durationMs: number;
}

export async function nativeComplete(input: NativeChatCompletionInput, context: { userId: string; organizationId: string; signal?: AbortSignal }): Promise<NativeCompletionResult> {
  if (input.model !== "windels-native") throw AppError.notFound(`Model ${input.model} is not available`);
  if (input.stream && input.tools?.length) throw AppError.validation("Streaming tool-call emulation is not in the currently tested compatibility subset; use stream:false for tool calls");
  const messages = input.messages.map(toChatMessage);
  const required = new Set<string>();
  if (messages.some((message) => message.images?.length)) required.add("vision");
  if (input.response_format?.type === "json_object" || input.tools?.length) required.add("json_mode");
  if (input.stream) required.add("stream");
  const catalog = await nativeModelCatalog();
  const internal = choose(chatModels(catalog.internal), [...required], process.env.WINDELS_NATIVE_CHAT_MODEL);
  if (!internal) throw AppError.serviceUnavailable(`No tested WINDELS model is available for required capabilities: ${[...required].join(", ") || "chat"}`);
  const forced = typeof input.tool_choice === "object" ? input.tool_choice.function.name : undefined;
  if (input.tools?.length && input.tool_choice !== "none") messages.unshift({ role: "system", content: toolSystemPrompt(input.tools, forced) });
  const result = await aiRegistry.complete({
    model: internal.id, messages, temperature: input.temperature, maxTokens: input.max_tokens,
    signal: context.signal, requiredCapabilities: [...required],
    responseFormat: input.tools?.length ? { type: "json_object" } : input.response_format,
  }, { userId: context.userId, organizationId: context.organizationId, channel: "api", feature: "native-ai-api" });
  if (result.modelSource !== "real") throw AppError.serviceUnavailable("No real AI runtime is available");
  if (input.tools?.length && input.tool_choice !== "none") {
    try {
      const decision = JSON.parse(result.content);
      if (decision?.type === "tool_call") {
        const allowed = input.tools.find((tool) => tool.function.name === decision.name);
        if (allowed && decision.arguments && typeof decision.arguments === "object" && !Array.isArray(decision.arguments) && validToolArguments(allowed.function.parameters, decision.arguments)) return {
          content: null,
          toolCalls: [{ id: `call_${randomUUID().replace(/-/g, "").slice(0, 24)}`, type: "function", function: { name: allowed.function.name, arguments: JSON.stringify(decision.arguments) } }],
          finishReason: "tool_calls", usage: result.usage, internalModel: result.model, provider: result.provider, durationMs: result.durationMs,
        };
        if (allowed) throw AppError.upstream(`Model returned invalid arguments for tool ${allowed.function.name}`);
      }
      if (decision?.type === "message" && typeof decision.content === "string") return { content: decision.content, toolCalls: [], finishReason: "stop", usage: result.usage, internalModel: result.model, provider: result.provider, durationMs: result.durationMs };
    } catch { /* fall through with the real model output */ }
  }
  return { content: result.content, toolCalls: [], finishReason: "stop", usage: result.usage, internalModel: result.model, provider: result.provider, durationMs: result.durationMs };
}

export async function selectNativeStreamingModel(input: NativeChatCompletionInput): Promise<{ internal: ModelInfo; messages: ChatMessage[] }> {
  if (input.model !== "windels-native") throw AppError.notFound(`Model ${input.model} is not available`);
  if (input.tools?.length) throw AppError.validation("Streaming with tools is not in the tested compatibility subset");
  const messages = input.messages.map(toChatMessage);
  const required = ["stream"];
  if (messages.some((message) => message.images?.length)) required.push("vision");
  if (input.response_format?.type === "json_object") required.push("json_mode");
  const catalog = await nativeModelCatalog();
  const internal = choose(chatModels(catalog.internal), required, process.env.WINDELS_NATIVE_CHAT_MODEL);
  if (!internal) throw AppError.serviceUnavailable(`No tested streaming model is available for: ${required.join(", ")}`);
  return { internal, messages };
}

export async function nativeEmbed(input: string | string[], publicModel: string, context: { userId: string; organizationId: string }) {
  if (publicModel !== "windels-embedding") throw AppError.notFound(`Model ${publicModel} is not available`);
  const catalog = await nativeModelCatalog();
  const internal = choose(catalog.internal, ["embeddings"], process.env.WINDELS_NATIVE_EMBEDDING_MODEL);
  if (!internal) throw AppError.serviceUnavailable("No tested real embedding model is available");
  const result = await aiRegistry.embed({ model: internal.id, input }, { userId: context.userId, organizationId: context.organizationId, feature: "native-ai-api" });
  if (result.model === "fallback-hash-128") throw AppError.serviceUnavailable("Hash fallback embeddings are not exposed by the public WINDELS API");
  return { ...result, internalModel: result.model, provider: internal.provider };
}
