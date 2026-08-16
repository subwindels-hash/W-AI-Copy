import { AppError } from "../utils/result.js";
import { transcribeAudio } from "../channels/whatsapp/whatsappMediaExtract.js";
import { nativeModelCatalog } from "./nativeAi.service.js";
import type { z } from "zod";
import { NativeImageSchema, NativeSpeechSchema } from "@windels/shared/nativeAiApi";

async function requireModel(id: string) {
  const catalog = await nativeModelCatalog();
  if (!catalog.public.some((model) => model.id === id)) throw AppError.serviceUnavailable(`Model ${id} is not currently available or health-verified`);
}
function openAiConfig() {
  if (!process.env.OPENAI_API_KEY) throw AppError.serviceUnavailable("No health-verified image/audio provider is configured");
  return { key: process.env.OPENAI_API_KEY, base: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "") };
}

export async function generateNativeImage(input: z.infer<typeof NativeImageSchema>) {
  if (input.model !== "windels-image-1") throw AppError.notFound(`Model ${input.model} is not available`);
  await requireModel("windels-image-1");
  const cfg = openAiConfig();
  const response = await fetch(`${cfg.base}/images/generations`, {
    method: "POST", signal: AbortSignal.timeout(120_000),
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: process.env.WINDELS_IMAGE_MODEL || "gpt-image-1", prompt: input.prompt, n: input.n, size: input.size, quality: input.quality, response_format: input.response_format }),
  });
  if (!response.ok) throw AppError.upstream(`Image generation failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const json: any = await response.json();
  return {
    created: Number(json.created ?? Math.floor(Date.now() / 1000)),
    data: (json.data ?? []).map((item: any) => ({ ...(input.response_format === "url" && item.url ? { url: item.url } : {}), ...(item.b64_json ? { b64_json: item.b64_json } : {}), ...(item.revised_prompt ? { revised_prompt: item.revised_prompt } : {}) })),
    provider: "openai", actualModel: process.env.WINDELS_IMAGE_MODEL || "gpt-image-1",
  };
}

export async function generateNativeSpeech(input: z.infer<typeof NativeSpeechSchema>) {
  if (input.model !== "windels-speech-1") throw AppError.notFound(`Model ${input.model} is not available`);
  await requireModel("windels-speech-1");
  const cfg = openAiConfig();
  const response = await fetch(`${cfg.base}/audio/speech`, {
    method: "POST", signal: AbortSignal.timeout(120_000),
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: process.env.WINDELS_SPEECH_MODEL || "gpt-4o-mini-tts", input: input.input, voice: input.voice, response_format: input.response_format, speed: input.speed }),
  });
  if (!response.ok) throw AppError.upstream(`Speech generation failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const contentType = response.headers.get("content-type") || ({ mp3: "audio/mpeg", opus: "audio/opus", aac: "audio/aac", flac: "audio/flac", wav: "audio/wav", pcm: "application/octet-stream" } as const)[input.response_format];
  return { buffer: Buffer.from(await response.arrayBuffer()), contentType, provider: "openai", actualModel: process.env.WINDELS_SPEECH_MODEL || "gpt-4o-mini-tts" };
}

export async function transcribeNativeAudio(file: { buffer: Buffer; mimetype: string; originalname: string }) {
  await requireModel("windels-speech-1");
  const result: any = await transcribeAudio(file.buffer, file.mimetype, file.originalname);
  if (!result.ok) throw AppError.upstream(result.message ?? "Transcription failed", { code: result.configurationRequired ? "transcription_provider_not_configured" : "transcription_failed", configurationRequired: result.configurationRequired });
  return { text: result.text, language: result.analysis?.language ?? null, provider: "openai", actualModel: result.analysis?.model ?? result.via ?? "configured-stt" };
}
