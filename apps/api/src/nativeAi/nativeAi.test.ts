import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const listPublicRoutableModels = vi.hoisted(() => vi.fn());
const complete = vi.hoisted(() => vi.fn());
const embed = vi.hoisted(() => vi.fn());
vi.mock("../services/ai/registry.js", () => ({ aiRegistry: { listPublicRoutableModels, complete, embed } }));
const { clearNativeModelCatalogCache, nativeComplete, nativeEmbed, nativeModelCatalog, selectNativeStreamingModel } = await import("./nativeAi.service.js");
const ctx = { userId: "user-a", organizationId: "org-a" };
const originalEnabled = process.env.WINDELS_NATIVE_API_ENABLED;
const realModels = [
  { id: "real-chat", provider: "provider-a", displayName: "Real Chat", contextWindow: 32000, maxOutput: 4096, capabilities: ["stream", "json_mode"] },
  { id: "real-vision", provider: "provider-b", displayName: "Real Vision", contextWindow: 64000, maxOutput: 8192, capabilities: ["stream", "vision", "json_mode"] },
  { id: "real-embed", provider: "provider-a", displayName: "Real Embed", contextWindow: 8192, maxOutput: 0, capabilities: ["embeddings"] },
];
beforeEach(() => { process.env.WINDELS_NATIVE_API_ENABLED = "true"; clearNativeModelCatalogCache(); listPublicRoutableModels.mockReset().mockResolvedValue(realModels); complete.mockReset(); embed.mockReset(); delete process.env.OPENAI_API_KEY; });
afterAll(() => { if (originalEnabled === undefined) delete process.env.WINDELS_NATIVE_API_ENABLED; else process.env.WINDELS_NATIVE_API_ENABLED = originalEnabled; });

describe("WINDELS native public model policy", () => {
  it("publishes only WINDELS aliases backed by real routable models", async () => {
    const catalog = await nativeModelCatalog(true);
    expect(catalog.public.map((model: any) => model.id)).toEqual(["windels-native", "windels-embedding"]);
    expect(JSON.stringify(catalog.public)).not.toContain("provider-a");
    expect(catalog.public[0]).toMatchObject({ capabilities: expect.arrayContaining(["chat", "streaming", "vision", "structured_output", "tools"]) });
  });

  it("returns an empty production catalog instead of placeholder models", async () => {
    listPublicRoutableModels.mockResolvedValueOnce([]);
    expect((await nativeModelCatalog(true)).public).toEqual([]);
  });

  it("routes vision and streaming requirements to a capable real internal model", async () => {
    const selected = await selectNativeStreamingModel({ model: "windels-native", stream: true, messages: [{ role: "user", content: [{ type: "text", text: "inspect" }, { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } }] }] });
    expect(selected.internal.id).toBe("real-vision");
    expect(selected.messages[0]?.images).toHaveLength(1);
  });
});

describe("native completion and external tool loop", () => {
  it("standardizes a real completion while keeping provider identity internal", async () => {
    complete.mockResolvedValueOnce({ content: "Real answer", usage: { tokensIn: 10, tokensOut: 4, costMicros: 12, model: "real-chat" }, model: "real-chat", provider: "provider-a", durationMs: 20, modelSource: "real" });
    const result = await nativeComplete({ model: "windels-native", messages: [{ role: "user", content: "Hello" }], stream: false }, ctx);
    expect(result).toMatchObject({ content: "Real answer", internalModel: "real-chat", finishReason: "stop" });
  });

  it("returns a validated structured tool call for an external agent to execute", async () => {
    complete.mockResolvedValueOnce({ content: JSON.stringify({ type: "tool_call", name: "check_inventory", arguments: { product_id: "p1" } }), usage: { tokensIn: 20, tokensOut: 10, costMicros: 30, model: "real-chat" }, model: "real-chat", provider: "provider-a", durationMs: 30, modelSource: "real" });
    const result = await nativeComplete({ model: "windels-native", stream: false, messages: [{ role: "user", content: "Do we have p1?" }], tools: [{ type: "function", function: { name: "check_inventory", description: "Check inventory", parameters: { type: "object", properties: { product_id: { type: "string" } }, required: ["product_id"] } } }] }, ctx);
    expect(result.finishReason).toBe("tool_calls");
    expect(result.toolCalls[0]).toMatchObject({ type: "function", function: { name: "check_inventory", arguments: '{"product_id":"p1"}' } });
  });

  it("never exposes hash-fallback embeddings", async () => {
    embed.mockResolvedValueOnce({ embeddings: [[0.1]], model: "fallback-hash-128", tokensIn: 1, costMicros: 0, durationMs: 1 });
    await expect(nativeEmbed("hello", "windels-embedding", ctx)).rejects.toThrow(/not exposed/i);
    embed.mockResolvedValueOnce({ embeddings: [[0.1, 0.2]], model: "real-embed", tokensIn: 2, costMicros: 1, durationMs: 2 });
    await expect(nativeEmbed("hello", "windels-embedding", ctx)).resolves.toMatchObject({ model: "real-embed", provider: "provider-a" });
  });
});
