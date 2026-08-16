import { z } from "zod";

export const NativeContentPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(100_000) }),
  z.object({ type: z.literal("image_url"), image_url: z.object({ url: z.string().max(15_000_000), detail: z.enum(["auto", "low", "high"]).optional() }) }),
]);
export const NativeMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.union([z.string().max(100_000), z.array(NativeContentPartSchema).max(20)]),
  name: z.string().max(80).optional(),
  tool_call_id: z.string().max(120).optional(),
});
export const NativeToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/),
    description: z.string().max(1000).optional(),
    parameters: z.record(z.unknown()),
  }),
});
export const NativeChatCompletionSchema = z.object({
  model: z.string().min(1).max(120).default("windels-native"),
  messages: z.array(NativeMessageSchema).min(1).max(200),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(128_000).optional(),
  stream: z.boolean().default(false),
  tools: z.array(NativeToolSchema).max(64).optional(),
  tool_choice: z.union([z.literal("auto"), z.literal("none"), z.object({ type: z.literal("function"), function: z.object({ name: z.string() }) })]).optional(),
  response_format: z.object({ type: z.enum(["text", "json_object"]) }).optional(),
  user: z.string().max(200).optional(),
});
export type NativeChatCompletionInput = z.infer<typeof NativeChatCompletionSchema>;

export const NativeResponseSchema = z.object({
  model: z.string().min(1).max(120).default("windels-native"),
  input: z.union([z.string().min(1).max(100_000), z.array(NativeMessageSchema).min(1).max(200)]),
  instructions: z.string().max(20_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_output_tokens: z.number().int().min(1).max(128_000).optional(),
  stream: z.boolean().default(false),
  tools: z.array(NativeToolSchema).max(64).optional(),
  metadata: z.record(z.string().max(500)).optional(),
});
export type NativeResponseInput = z.infer<typeof NativeResponseSchema>;

export const NativeEmbeddingSchema = z.object({
  model: z.string().min(1).max(120).default("windels-embedding"),
  input: z.union([z.string().min(1).max(100_000), z.array(z.string().min(1).max(100_000)).min(1).max(2048)]),
  encoding_format: z.enum(["float"]).default("float"),
  user: z.string().max(200).optional(),
});
export type NativeEmbeddingInput = z.infer<typeof NativeEmbeddingSchema>;

export const NativeImageSchema = z.object({
  model: z.string().default("windels-image-1"),
  prompt: z.string().min(1).max(32_000),
  n: z.number().int().min(1).max(4).default(1),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]).default("1024x1024"),
  quality: z.enum(["low", "medium", "high"]).default("medium"),
  response_format: z.enum(["url", "b64_json"]).default("b64_json"),
});
export const NativeSpeechSchema = z.object({
  model: z.string().default("windels-speech-1"),
  input: z.string().min(1).max(4096),
  voice: z.enum(["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"]).default("alloy"),
  response_format: z.enum(["mp3", "opus", "aac", "flac", "wav", "pcm"]).default("mp3"),
  speed: z.number().min(0.25).max(4).default(1),
});

export interface NativePublicModel {
  id: string;
  object: "model";
  created: number;
  owned_by: "windels";
  capabilities: string[];
  modalities: string[];
  context_window?: number;
  max_output_tokens?: number;
  status: "available";
}
