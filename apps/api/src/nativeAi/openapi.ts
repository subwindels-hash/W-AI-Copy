export function nativeAiOpenApi(origin = "https://api.windels.ai") {
  const error = { type: "object", properties: { error: { type: "object", properties: { message: { type: "string" }, type: { type: "string" }, code: { type: "string" }, param: { type: ["string", "null"] } } }, request_id: { type: "string" } } };
  return {
    openapi: "3.1.0",
    info: { title: "WINDELS Native AI API", version: "1.0.0", description: "Health-gated AI, embeddings, files, multimodal generation and tenant-scoped agent execution. This is an OpenAI-pattern compatibility subset; unsupported behavior is rejected explicitly." },
    servers: [{ url: `${origin.replace(/\/$/, "")}/v1` }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "WND API key" } },
      schemas: {
        Error: error,
        Message: { type: "object", required: ["role", "content"], properties: { role: { enum: ["system", "user", "assistant", "tool"] }, content: { type: "string" }, tool_call_id: { type: "string" } } },
      },
    },
    paths: {
      "/models": { get: { summary: "List currently health-verified WINDELS models", responses: { "200": { description: "Model list" }, "401": { description: "Invalid key", content: { "application/json": { schema: error } } } } } },
      "/chat/completions": { post: { summary: "Create a chat completion", description: "Supports SSE with stream=true. Tool calls are supported for non-streaming requests in the tested compatibility subset.", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["model", "messages"], properties: { model: { const: "windels-native" }, messages: { type: "array", items: { $ref: "#/components/schemas/Message" } }, stream: { type: "boolean" }, tools: { type: "array" }, response_format: { type: "object" } } } } } }, responses: { "200": { description: "Completion or text/event-stream" }, "400": { description: "Invalid request" }, "503": { description: "No tested real model available" } } } },
      "/responses": { post: { summary: "Create a WINDELS response", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["input"], properties: { model: { const: "windels-native" }, input: { oneOf: [{ type: "string" }, { type: "array" }] }, instructions: { type: "string" }, tools: { type: "array" } } } } } }, responses: { "200": { description: "Response object" } } } },
      "/embeddings": { post: { summary: "Create real provider-backed embeddings", responses: { "200": { description: "Embedding list" }, "503": { description: "No tested real embedding model" } } } },
      "/files": { post: { summary: "Upload a tenant-scoped file", requestBody: { content: { "multipart/form-data": { schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" }, purpose: { type: "string" } } } } } }, responses: { "200": { description: "File object" } } } },
      "/images": { post: { summary: "Generate images when a real health-verified provider is available", responses: { "200": { description: "Image result" }, "503": { description: "Provider unavailable" } } } },
      "/audio/speech": { post: { summary: "Generate speech", responses: { "200": { description: "Audio bytes" } } } },
      "/audio/transcriptions": { post: { summary: "Transcribe audio", responses: { "200": { description: "Transcript" } } } },
      "/agents": { get: { summary: "List organization-scoped WINDELS agents", responses: { "200": { description: "Agent list" } } } },
      "/agents/{agent_id}/execute": { post: { summary: "Execute a WINDELS agent", parameters: [{ name: "agent_id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Persistent agent run" } } } },
      "/agents/{agent_id}/runs/{run_id}": { get: { summary: "Get a tenant-scoped agent run", parameters: [{ name: "agent_id", in: "path", required: true }, { name: "run_id", in: "path", required: true }], responses: { "200": { description: "Agent run" } } } },
      "/agents/{agent_id}/runs/{run_id}/cancel": { post: { summary: "Cancel an active agent run", responses: { "200": { description: "Cancellation requested" } } } },
      "/cloud-android/devices": { get: { summary: "List tenant-scoped Cloud Android devices", responses: { "200": { description: "Device list" } } }, post: { summary: "Provision a device through the configured provider", responses: { "201": { description: "Provider-confirmed device" }, "503": { description: "No healthy provider" } } } },
      "/cloud-android/devices/{id}/screen": { get: { summary: "Capture structured screen, accessibility tree and device state", responses: { "200": { description: "Device observation" } } } },
      "/cloud-android/devices/{id}/ui/tap": { post: { summary: "Prepare, authorize, execute and verify a tap", responses: { "200": { description: "Action or approval request" } } } },
      "/cloud-android/sessions": { get: { summary: "List device control sessions", responses: { "200": { description: "Session list" } } } },
      "/cloud-android/audit": { get: { summary: "List device action audit records", responses: { "200": { description: "Audit list" } } } },
    },
  };
}
