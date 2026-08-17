import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakePrisma } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
const nativeModelCatalog = vi.hoisted(() => vi.fn());
const nativeComplete = vi.hoisted(() => vi.fn());
const nativeEmbed = vi.hoisted(() => vi.fn());
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("./nativeAi.service.js", () => ({ nativeModelCatalog, nativeComplete, nativeEmbed }));

const { NativeAiConsoleService } = await import("./console.service.js");
const originalEnabled = process.env.WINDELS_NATIVE_API_ENABLED;
const ctx = { organizationId: "org-a", userId: "user-a" };

beforeEach(() => {
  db.reset();
  nativeModelCatalog.mockReset();
  nativeComplete.mockReset();
  nativeEmbed.mockReset();
});
afterAll(() => {
  if (originalEnabled === undefined) delete process.env.WINDELS_NATIVE_API_ENABLED;
  else process.env.WINDELS_NATIVE_API_ENABLED = originalEnabled;
});

describe("Native AI Studio facade", () => {
  it("reports unavailable truthfully when public publication is disabled", async () => {
    process.env.WINDELS_NATIVE_API_ENABLED = "false";
    nativeModelCatalog.mockResolvedValue({ public: [] });
    await expect(NativeAiConsoleService.status()).resolves.toMatchObject({
      publicApiEnabled: false,
      availability: "unavailable",
      unavailableReason: "native_api_disabled",
      models: [],
      studio: { streaming: false, demoFallbackExposed: false },
    });
  });

  it("does not leak the selected internal provider or model from a Studio completion", async () => {
    nativeComplete.mockResolvedValue({
      content: "A real answer",
      toolCalls: [],
      finishReason: "stop",
      usage: { tokensIn: 10, tokensOut: 4, costMicros: 12 },
      internalModel: "private-provider-model",
      provider: "private-provider",
      durationMs: 21,
    });
    const result = await NativeAiConsoleService.complete({
      model: "windels-native",
      messages: [{ role: "user", content: "Hello" }],
      stream: false,
    }, ctx);
    expect(nativeComplete).toHaveBeenCalledWith(expect.objectContaining({ stream: false }), ctx);
    expect(result).toMatchObject({ model: "windels-native", content: "A real answer", provenance: "real_provider" });
    expect(JSON.stringify(result)).not.toContain("private-provider");
    expect(JSON.stringify(result)).not.toContain("private-provider-model");
  });

  it("uses the real embedding adapter result without manufacturing vectors", async () => {
    nativeEmbed.mockResolvedValue({
      embeddings: [[0.1, 0.2]],
      tokensIn: 2,
      costMicros: 3,
      internalModel: "real-embedding",
      provider: "private-provider",
    });
    await expect(NativeAiConsoleService.embed({ model: "windels-embedding", input: "hello", encoding_format: "float", user: undefined }, ctx)).resolves.toEqual({
      model: "windels-embedding",
      data: [{ index: 0, embedding: [0.1, 0.2] }],
      usage: { tokensIn: 2, costMicros: 3 },
      provenance: "real_provider",
    });
  });

  it("reads only the caller organization native-ai ledger and subscription", async () => {
    db.seed("ApiUsageRecord", [
      { id: "a", organizationId: "org-a", productSlug: "native-ai", tokensIn: 10, tokensOut: 4, aiCostMicros: 7 },
      { id: "b", organizationId: "org-b", productSlug: "native-ai", tokensIn: 99, tokensOut: 99, aiCostMicros: 99 },
      { id: "c", organizationId: "org-a", productSlug: "other", tokensIn: 50, tokensOut: 50, aiCostMicros: 50 },
    ]);
    db.seed("ApiProduct", [{ id: "prod", organizationId: null, slug: "native-ai", enabled: true }]);
    db.seed("ApiSubscription", [{ id: "sub", organizationId: "org-a", productId: "prod", status: "active", quota: 20, usedThisMonth: 7 }]);
    const usage = await NativeAiConsoleService.usage("org-a");
    expect(usage).toMatchObject({
      requests: 1,
      tokensIn: 10,
      tokensOut: 4,
      aiCostMicros: 7,
      quota: { configured: true, limit: 20, used: 7, remaining: 13 },
    });
  });
});
