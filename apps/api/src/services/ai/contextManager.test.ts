/**
 * Session 3 — AI Chat: context window manager.
 *
 * The context manager (token estimation, budget allocation, message trimming,
 * and smart-context building) had no unit tests. These are the pure/deterministic
 * functions that prevent context overflow and dropped-message surprises, so they
 * are pinned here. Runs on FakePrisma + the shared @prisma/client enum mock.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakePrisma, cuid } from "../../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../../testUtils/prismaClientMock.js")) }));

const {
  estimateTokens,
  estimateMessagesTokens,
  calculateBudget,
  trimMessagesToBudget,
  buildSmartContext,
  needsSummarization,
} = await import("./contextManager.js");

beforeEach(() => { db.reset(); });

describe("estimateTokens", () => {
  it("returns 0 for empty input", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("")).toBe(0);
  });

  it("approximates ~4 chars per token for ASCII", () => {
    expect(estimateTokens("Hello world this is a test")).toBe(Math.ceil(25 / 4)); // 7
  });

  it("counts CJK as ~2 chars per token (higher density)", () => {
    const cjk = "你好世界这是一个中文测试消息";
    const nonCjk = cjk.replace(/[\u4e00-\u9fff\u3000-\u303f\uac00-\ud7af]/g, "");
    const cjkCount = cjk.length - nonCjk.length;
    expect(estimateTokens(cjk)).toBe(Math.ceil(cjkCount / 2 + nonCjk.length / 4));
  });
});

describe("estimateMessagesTokens", () => {
  it("adds per-message overhead", () => {
    const msgs = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ];
    const raw = estimateTokens("hello") + 4 + estimateTokens("hi there") + 4;
    expect(estimateMessagesTokens(msgs as any)).toBe(raw);
  });
});

describe("calculateBudget", () => {
  it("reserves 10% system, reserves output, rest is history", () => {
    const b = calculateBudget(10000, 2000);
    expect(b.systemTokens).toBe(1000);
    expect(b.currentTokens).toBe(2000);          // min(maxOutput, 20%)
    expect(b.historyTokens).toBe(10000 - 1000 - 2000);
  });

  it("never lets history go negative for tiny windows", () => {
    const b = calculateBudget(1000, 400);
    expect(b.historyTokens).toBeGreaterThanOrEqual(0);
  });
});

describe("trimMessagesToBudget", () => {
  it("keeps system messages and drops oldest non-system messages first", () => {
    const msgs = [
      { role: "system", content: "sys" },
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
      { role: "user", content: "three" },
    ];
    // Budget only fits system + ~1 message.
    const budget = estimateTokens("sys") + 4 + estimateTokens("three") + 4;
    const res = trimMessagesToBudget(msgs as any, budget);
    expect(res.messages[0]!.role).toBe("system");
    expect(res.dropped).toBeGreaterThan(0);
    // Newest non-system is kept.
    expect(res.messages.some((m) => m.content === "three")).toBe(true);
  });
});

describe("buildSmartContext", () => {
  function seedMessages(contents: string[]) {
    contents.forEach((c, i) => {
      db.seed("Message", [{
        id: `m${i}`, conversationId: "c1", role: "USER", content: c,
        status: "COMPLETED", userId: "u1", createdAt: new Date(i + 1),
      }]);
    });
  }

  it("includes system prompt first and returns measured counts", async () => {
    seedMessages(["hello", "world"]);
    const out = await buildSmartContext({ conversationId: "c1", systemPrompt: "You are helpful." });
    expect(out.messages[0]!.role).toBe("system");
    expect(out.messages[0]!.content).toBe("You are helpful.");
    expect(out.messagesIncluded).toBe(2);
    expect(out.messagesDropped).toBe(0);
    expect(out.truncated).toBe(false);
  });

  it("truncates when history exceeds budget and reports drops honestly", async () => {
    const long = "A".repeat(2000); // ~500 tokens each
    seedMessages([long, long, long, long]);
    // historyTokens = 1000 - 100 (10% system) - 200 (min(maxOutput,20%)) = 700,
    // so only ~1 of the four ~500-token messages fits → truncation + drops.
    const out = await buildSmartContext({ conversationId: "c1", contextWindow: 1000, maxOutput: 200 });
    expect(out.messagesDropped).toBeGreaterThan(0);
    expect(out.truncated).toBe(true);
  });

  it("ignores non-completed messages", async () => {
    db.seed("Message", [{
      id: "m1", conversationId: "c1", role: "USER", content: "draft",
      status: "STREAMING", userId: "u1", createdAt: new Date(1),
    }]);
    const out = await buildSmartContext({ conversationId: "c1" });
    expect(out.messagesIncluded).toBe(0);
  });
});

describe("needsSummarization", () => {
  it("returns true only at/above the threshold of COMPLETED messages", async () => {
    for (let i = 0; i < 5; i++) {
      db.seed("Message", [{ id: `m${i}`, conversationId: "c1", role: "USER", content: "x", status: "COMPLETED", userId: "u1", createdAt: new Date(i) }]);
    }
    await expect(needsSummarization("c1", 5)).resolves.toBe(true);
    await expect(needsSummarization("c1", 10)).resolves.toBe(false);
  });
});
