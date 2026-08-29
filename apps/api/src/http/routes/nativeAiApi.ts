import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiKeyAuth, requireScope } from "../middleware/apiKeyAuth.js";
import { nativeAiQuota } from "../middleware/nativeAiQuota.js";
import { validate } from "../middleware/validate.js";
import { multipartSingle } from "../middleware/multipart.js";
import { auditService } from "../../audit/audit.service.js";
import { aiRegistry } from "../../services/ai/registry.js";
import { uploadAttachment } from "../../attachments/attachments.service.js";
import { scanBufferWithClamav } from "../../projectContinuity/clamav.service.js";
import { NativeChatCompletionSchema, NativeEmbeddingSchema, NativeImageSchema, NativeResponseSchema, NativeSpeechSchema } from "@windels/shared/nativeAiApi";
import { nativeAiOpenApi } from "../../nativeAi/openapi.js";
import { nativeComplete, nativeEmbed, nativeModelCatalog, selectNativeStreamingModel } from "../../nativeAi/nativeAi.service.js";
import { generateNativeImage, generateNativeSpeech, transcribeNativeAudio } from "../../nativeAi/nativeMedia.service.js";
import { cancelExternalAgentRun, executeExternalAgent, getExternalAgent, getExternalAgentRun, listExternalAgents } from "../../nativeAi/externalAgent.service.js";
import { AppError } from "../../utils/result.js";
import { registerCloudAndroidPublicRoutes } from "./cloudAndroidPublic.js";

function ctx(req: any) { return { organizationId: req.apiOrganization.id as string, userId: req.apiUser.id as string, apiKeyId: req.apiKey.id as string }; }
function enrich(res: any, data: Record<string, unknown>) { res.locals = { ...(res.locals ?? {}), apiUsage: { ...(res.locals?.apiUsage ?? {}), ...data, productSlug: "native-ai" } }; }
function requestId(req: any) { return req.requestId ?? `req_${randomUUID().replace(/-/g, "").slice(0, 24)}`; }
function publicId(prefix: string) { return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 24)}`; }
function toolScope(req: any, hasTools: boolean) {
  if (!hasTools) return;
  const granular: string[] = req.apiKeyGranularScopes ?? [];
  if (granular.length && !granular.includes("tools:execute")) throw AppError.forbidden("API key missing required scope: tools:execute");
}
async function audit(req: any, action: any, metadata: Record<string, unknown>) {
  await auditService.log({ organizationId: req.apiOrganization.id, userId: req.apiUser.id, apiKeyId: req.apiKey.id, action, resourceType: "native_ai_request", requestId: req.requestId, metadata });
}

const AgentExecute = z.object({
  model: z.string().default("windels-native"),
  messages: NativeChatCompletionSchema.shape.messages,
  tools: NativeChatCompletionSchema.shape.tools.optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(128_000).optional(),
});
const AgentId = z.object({ agentId: z.string().min(1).max(120) });
const AgentRunId = z.object({ agentId: z.string().min(1).max(120), runId: z.string().cuid() });

/** New top-level /v1 WINDELS Native AI API. /api/rest/v1 remains unchanged. */
export function registerNativeAiApiRoutes(router: Router) {
  // The OpenAPI document is public; every operation it describes remains API-key protected.
  router.get("/openapi.json", (req, res) => res.type("application/vnd.oai.openapi+json").json(nativeAiOpenApi(`${req.protocol}://${req.get("host")}`)));
  router.use(apiKeyAuth);
  router.use((req, res, next) => req.path.startsWith("/cloud-android") ? next() : nativeAiQuota(req, res, next));
  router.use((req: any, res, next) => {
    let recorded = false;
    const record = (status: number) => { if (recorded) return; recorded = true; void auditService.log({ organizationId: req.apiOrganization.id, userId: req.apiUser.id, apiKeyId: req.apiKey.id, action: "native_api.request", resourceType: "native_ai_request", requestId: req.requestId, metadata: { method: req.method, path: `/v1${req.path}`, status } }); };
    res.on("finish", () => record(res.statusCode));
    res.on("close", () => { if (!res.writableEnded) record(499); });
    next();
  });

  router.get("/models", requireScope("models:read", "ai:read"), async (req, res, next) => {
    try {
      const catalog = await nativeModelCatalog(true);
      enrich(res, { endpoint: "native.models.list", channel: "models", permission: "models:read" });
      await audit(req, "native_api.models_listed", { availableModels: catalog.public.map((model) => model.id) });
      res.json({ object: "list", data: catalog.public });
    } catch (error) { next(error); }
  });

  router.post("/chat/completions", requireScope("ai:execute"), validate({ body: NativeChatCompletionSchema }), async (req, res, next) => {
    const input = req.body as z.infer<typeof NativeChatCompletionSchema>;
    enrich(res, { endpoint: "native.chat.completions", channel: "ai", permission: input.tools?.length ? "tools:execute" : "ai:execute", model: input.model });
    try {
      toolScope(req, !!input.tools?.length);
      if (!input.stream) {
        const result = await nativeComplete(input, ctx(req));
        enrich(res, { endpoint: "native.chat.completions", channel: "ai", permission: input.tools?.length ? "tools:execute" : "ai:execute", model: "windels-native", provider: result.provider, tokensIn: result.usage.tokensIn, tokensOut: result.usage.tokensOut, aiCostMicros: result.usage.costMicros, actualCostMicros: null, toolCalls: result.toolCalls.length });
        await audit(req, "native_api.chat_completed", { model: "windels-native", internalModel: result.internalModel, tokensIn: result.usage.tokensIn, tokensOut: result.usage.tokensOut, toolCalls: result.toolCalls.length });
        const id = publicId("chatcmpl");
        return res.json({ id, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: "windels-native", choices: [{ index: 0, message: { role: "assistant", content: result.content, ...(result.toolCalls.length ? { tool_calls: result.toolCalls } : {}) }, finish_reason: result.finishReason, logprobs: null }], usage: { prompt_tokens: result.usage.tokensIn, completion_tokens: result.usage.tokensOut, total_tokens: result.usage.tokensIn + result.usage.tokensOut }, request_id: requestId(req) });
      }

      const selected = await selectNativeStreamingModel(input);
      const id = publicId("chatcmpl");
      const created = Math.floor(Date.now() / 1000);
      const controller = new AbortController();
      req.on("close", () => { if (!res.writableEnded) controller.abort(new Error("client disconnected")); });
      res.status(200).set({ "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
      res.flushHeaders();
      let tokensIn = 0, tokensOut = 0, costMicros = 0;
      for await (const chunk of aiRegistry.guardedStream({ model: selected.internal.id, messages: selected.messages, temperature: input.temperature, maxTokens: input.max_tokens, stream: true, signal: controller.signal, requiredCapabilities: ["stream"] }, { userId: ctx(req).userId, organizationId: ctx(req).organizationId, channel: "api", feature: "native-ai-api-stream" })) {
        if (chunk.type === "token" && chunk.text) res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: "windels-native", choices: [{ index: 0, delta: { content: chunk.text }, finish_reason: null }] })}\n\n`);
        if (chunk.type === "done" && chunk.usage) {
          tokensIn = chunk.usage.tokensIn; tokensOut = chunk.usage.tokensOut; costMicros = chunk.usage.costMicros;
          res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: "windels-native", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut, total_tokens: tokensIn + tokensOut } })}\n\n`);
        }
        if (chunk.type === "error") {
          enrich(res, { endpoint: "native.chat.completions", channel: "ai", permission: "ai:execute", model: "windels-native", provider: selected.internal.provider, errorCode: chunk.errorCode ?? "stream_error" });
          res.write(`data: ${JSON.stringify({ error: { message: chunk.error, type: "api_error", code: chunk.errorCode ?? "stream_error", param: null }, request_id: requestId(req) })}\n\n`);
          res.write("data: [DONE]\n\n"); return res.end();
        }
      }
      enrich(res, { endpoint: "native.chat.completions", channel: "ai", permission: "ai:execute", model: "windels-native", provider: selected.internal.provider, tokensIn, tokensOut, aiCostMicros: costMicros, actualCostMicros: null });
      await audit(req, "native_api.chat_streamed", { model: "windels-native", internalModel: selected.internal.id, tokensIn, tokensOut });
      res.write("data: [DONE]\n\n"); res.end();
    } catch (error) { if (res.headersSent) { enrich(res, { endpoint: "native.chat.completions", channel: "ai", permission: "ai:execute", model: "windels-native", errorCode: (error as any)?.code ?? "stream_error" }); res.write(`data: ${JSON.stringify({ error: { message: error instanceof Error ? error.message : String(error), type: "api_error", code: (error as any)?.code ?? "stream_error", param: null }, request_id: requestId(req) })}\n\ndata: [DONE]\n\n`); res.end(); } else { enrich(res, { errorCode: (error as any)?.code ?? "api_error" }); next(error); } }
  });

  router.post("/responses", requireScope("ai:execute"), validate({ body: NativeResponseSchema }), async (req, res, next) => {
    try {
      const input = req.body as z.infer<typeof NativeResponseSchema>;
      if (input.stream) throw AppError.validation("Streaming is currently supported on /v1/chat/completions; /v1/responses streaming is outside the tested compatibility subset");
      toolScope(req, !!input.tools?.length);
      const messages = typeof input.input === "string" ? [{ role: "user" as const, content: input.input }] : input.input;
      if (input.instructions) messages.unshift({ role: "system", content: input.instructions });
      const result = await nativeComplete({ model: input.model, messages, tools: input.tools, stream: false, temperature: input.temperature, max_tokens: input.max_output_tokens }, ctx(req));
      enrich(res, { endpoint: "native.responses", channel: "ai", permission: input.tools?.length ? "tools:execute" : "ai:execute", model: "windels-native", provider: result.provider, tokensIn: result.usage.tokensIn, tokensOut: result.usage.tokensOut, aiCostMicros: result.usage.costMicros, actualCostMicros: null, toolCalls: result.toolCalls.length });
      await audit(req, "native_api.response_completed", { internalModel: result.internalModel, tokensIn: result.usage.tokensIn, tokensOut: result.usage.tokensOut, toolCalls: result.toolCalls.length });
      const id = publicId("resp");
      res.json({ id, object: "response", created_at: Math.floor(Date.now() / 1000), status: "completed", model: "windels-native", output: result.toolCalls.length ? result.toolCalls.map((call) => ({ type: "function_call", id: call.id, call_id: call.id, name: call.function.name, arguments: call.function.arguments, status: "completed" })) : [{ type: "message", id: publicId("msg"), status: "completed", role: "assistant", content: [{ type: "output_text", text: result.content ?? "", annotations: [] }] }], output_text: result.content ?? "", usage: { input_tokens: result.usage.tokensIn, output_tokens: result.usage.tokensOut, total_tokens: result.usage.tokensIn + result.usage.tokensOut }, metadata: input.metadata ?? {}, request_id: requestId(req) });
    } catch (error) { next(error); }
  });

  router.post("/embeddings", requireScope("ai:execute", "knowledge:search"), validate({ body: NativeEmbeddingSchema }), async (req, res, next) => {
    try {
      const input = req.body as z.infer<typeof NativeEmbeddingSchema>;
      const result = await nativeEmbed(input.input, input.model, ctx(req));
      const values = Array.isArray(input.input) ? input.input : [input.input];
      enrich(res, { endpoint: "native.embeddings", channel: "knowledge", permission: "ai:execute", model: "windels-embedding", provider: result.provider, tokensIn: result.tokensIn, aiCostMicros: result.costMicros, actualCostMicros: null });
      await audit(req, "native_api.embeddings_created", { internalModel: result.internalModel, inputs: values.length, tokensIn: result.tokensIn });
      res.json({ object: "list", data: result.embeddings.map((embedding, index) => ({ object: "embedding", embedding, index })), model: "windels-embedding", usage: { prompt_tokens: result.tokensIn, total_tokens: result.tokensIn }, request_id: requestId(req) });
    } catch (error) { next(error); }
  });

  router.post("/files", requireScope("files:write"), multipartSingle("file", { maxBytes: 25 * 1024 * 1024 }), async (req, res, next) => {
    try {
      const file = (req as any).file; if (!file) throw AppError.validation("Multipart file field is required");
      const malware = await scanBufferWithClamav(file.buffer);
      if (malware.status !== "clean") throw AppError.serviceUnavailable(malware.status === "infected" ? `File rejected by malware scanner: ${malware.signature ?? "malware detected"}` : "File malware scanning is unavailable; upload fails closed");
      const stored = await uploadAttachment(ctx(req).userId, file);
      enrich(res, { endpoint: "native.files.create", channel: "files", permission: "files:write", storageBytes: stored.sizeBytes });
      await audit(req, "native_api.file_uploaded", { fileId: stored.id, sizeBytes: stored.sizeBytes, mimeType: stored.mimeType });
      res.status(201).json({ id: stored.id, object: "file", bytes: stored.sizeBytes, created_at: Math.floor(new Date(stored.createdAt).getTime() / 1000), filename: stored.filename, purpose: String(req.body?.purpose ?? "assistants"), status: "processed", status_details: null });
    } catch (error) { next(error); }
  });

  router.post("/images", requireScope("images:generate", "media:generate"), validate({ body: NativeImageSchema }), async (req, res, next) => {
    try {
      const result = await generateNativeImage(req.body);
      enrich(res, { endpoint: "native.images.generate", channel: "media", permission: "images:generate", model: "windels-image-1", provider: result.provider, images: result.data.length });
      await audit(req, "native_api.image_generated", { model: "windels-image-1", actualModel: result.actualModel, count: result.data.length });
      res.json({ created: result.created, data: result.data, model: "windels-image-1", request_id: requestId(req) });
    } catch (error) { next(error); }
  });

  router.post("/audio/speech", requireScope("audio:generate", "voice:generate"), validate({ body: NativeSpeechSchema }), async (req, res, next) => {
    try {
      const result = await generateNativeSpeech(req.body);
      enrich(res, { endpoint: "native.audio.speech", channel: "voice", permission: "audio:generate", model: "windels-speech-1", provider: result.provider, storageBytes: result.buffer.length });
      await audit(req, "native_api.speech_generated", { model: "windels-speech-1", actualModel: result.actualModel, bytes: result.buffer.length });
      res.status(200).type(result.contentType).set("x-request-id", requestId(req)).send(result.buffer);
    } catch (error) { next(error); }
  });

  router.post("/audio/transcriptions", requireScope("audio:transcribe"), multipartSingle("file", { maxBytes: 25 * 1024 * 1024 }), async (req, res, next) => {
    try {
      const file = (req as any).file; if (!file) throw AppError.validation("Multipart file field is required");
      const malware = await scanBufferWithClamav(file.buffer);
      if (malware.status !== "clean") throw AppError.serviceUnavailable(malware.status === "infected" ? `Audio rejected by malware scanner: ${malware.signature ?? "malware detected"}` : "Audio malware scanning is unavailable; transcription fails closed");
      const result = await transcribeNativeAudio(file);
      enrich(res, { endpoint: "native.audio.transcriptions", channel: "voice", permission: "audio:transcribe", model: "windels-speech-1", provider: result.provider, storageBytes: file.size });
      await audit(req, "native_api.audio_transcribed", { model: "windels-speech-1", actualModel: result.actualModel, inputBytes: file.size, outputCharacters: result.text.length });
      res.json({ text: result.text, language: result.language, model: "windels-speech-1", request_id: requestId(req) });
    } catch (error) { next(error); }
  });

  router.get("/agents", requireScope("agents:read"), async (req, res, next) => { try { const data = await listExternalAgents(ctx(req)); enrich(res, { endpoint: "native.agents.list", channel: "agents", permission: "agents:read" }); res.json({ object: "list", data }); } catch (error) { next(error); } });
  router.get("/agents/:agentId", requireScope("agents:read"), validate({ params: AgentId }), async (req, res, next) => { try { enrich(res, { endpoint: "native.agents.get", channel: "agents", permission: "agents:read" }); res.json(await getExternalAgent(ctx(req), req.params.agentId)); } catch (error) { next(error); } });
  const execute = async (req: any, res: any, next: any) => {
    try {
      toolScope(req, !!req.body.tools?.length);
      const run = await executeExternalAgent(ctx(req), req.params.agentId, req.body, String(req.header("idempotency-key") || randomUUID()));
      const persisted: any = await (await import("../../db/client.js")).prisma.externalAgentRun.findFirst({ where: { id: run.id, organizationId: ctx(req).organizationId } });
      const usage: any = persisted?.usage ?? {};
      enrich(res, { endpoint: "native.agents.execute", channel: "agents", permission: "agents:execute", model: "windels-native", provider: persisted?.provider ?? null, tokensIn: usage.tokensIn ?? 0, tokensOut: usage.tokensOut ?? 0, aiCostMicros: usage.costMicros ?? 0, actualCostMicros: null, toolCalls: persisted?.toolCalls ?? 0, agentRuns: 1 });
      await audit(req, "native_api.agent_executed", { agentId: req.params.agentId, runId: run.id, status: run.status });
      res.status(run.status === "failed" ? 502 : 200).json(run);
    } catch (error) { next(error); }
  };
  router.post("/agents/:agentId/execute", requireScope("agents:execute"), validate({ params: AgentId, body: AgentExecute }), execute);
  router.post("/agents/:agentId/messages", requireScope("agents:execute"), validate({ params: AgentId, body: AgentExecute }), execute);
  router.get("/agents/:agentId/runs/:runId", requireScope("agents:read"), validate({ params: AgentRunId }), async (req, res, next) => { try { enrich(res, { endpoint: "native.agents.runs.get", channel: "agents", permission: "agents:read" }); res.json(await getExternalAgentRun(ctx(req), req.params.agentId, req.params.runId)); } catch (error) { next(error); } });
  router.post("/agents/:agentId/runs/:runId/cancel", requireScope("agents:execute"), validate({ params: AgentRunId }), async (req, res, next) => { try { enrich(res, { endpoint: "native.agents.runs.cancel", channel: "agents", permission: "agents:execute" }); res.json(await cancelExternalAgentRun(ctx(req), req.params.agentId, req.params.runId)); } catch (error) { next(error); } });

  registerCloudAndroidPublicRoutes(router);
  router.use((req, res) => res.status(404).json({ error: { message: `Route ${req.method} /v1${req.path} not found`, type: "invalid_request_error", code: "not_found", param: null }, request_id: requestId(req) }));
}
