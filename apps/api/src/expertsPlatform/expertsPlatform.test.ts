/**
 * Session 77A — Experts Platform: the expert-query path.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `ExpertsPlatformService.query()` answers questions addressed to "expert"
 * agents whose declared domains are **government, healthcare, pharmacy,
 * engineering, legal and lecturer**. It shipped as one line:
 *
 *     async query(id, _q) {
 *       await redis.incr(K.q24);
 *       return { response: "[expert response placeholder — ...]", ... };
 *     }
 *
 * The question was discarded (`_q`), nothing was consulted, and a hardcoded
 * string was returned — while the surrounding module reported `disclaimerEnforced:
 * true` and counted the call as a real query in its dashboard. For medical,
 * pharmacy and legal domains that is the most dangerous shape of fake
 * completion in the codebase: it looks like an answer.
 *
 * Two further defects sat on the same endpoint, invisible because nothing
 * exercised it end to end:
 *   - the route validated `{ q }` while the web client posted `{ question }`,
 *     so every call from the UI was rejected with a 400;
 *   - the service returned `response` while the client read `answer`, so even
 *     a successful call would have rendered `undefined`.
 *
 * These tests pin the corrected contract: a real model answers, and with no
 * model configured the service **refuses** rather than emitting placeholder
 * prose that a user could mistake for professional advice.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

/** Controls what the stubbed AI registry does for each case. */
const ai = {
  hasReal: false,
  tokens: [] as string[],
  fail: false,
};

vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: {
    hasRealModelConfigured: () => ai.hasReal,
    async *guardedStream() {
      if (ai.fail) {
        yield { type: "error", error: "provider exploded", errorCode: "AI_PROVIDER_ERROR" };
        return;
      }
      for (const t of ai.tokens) yield { type: "token", text: t, modelSource: "real" };
      yield { type: "done", usage: { tokensIn: 1, tokensOut: 1, costMicros: 0, model: "m" } };
    },
  },
}));

const { ExpertsPlatformService } = await import("./expertsPlatform.service.js");

const EXPERT_ID = "exp-1";

/**
 * Narrow to the refusal arm. The union deliberately hides `reason`/`message`
 * behind `available: false` so production code cannot read an answer that was
 * never produced — these helpers keep the tests honest about which arm they
 * are asserting on.
 */
function refusal(r: Awaited<ReturnType<typeof ExpertsPlatformService.query>>) {
  expect(r.available).toBe(false);
  if (r.available) throw new Error("expected a refusal");
  return r;
}
function answered(r: Awaited<ReturnType<typeof ExpertsPlatformService.query>>) {
  expect(r.available).toBe(true);
  if (!r.available) throw new Error(`expected an answer, got ${r.reason}`);
  return r;
}

/** Seed one online expert so query() has something to address. */
async function seedExpert(domain = "healthcare", disclaimer = "consult-professional") {
  const doc = {
    id: EXPERT_ID, name: "Clinical Advisor", domain, specialization: "general",
    status: "online", disclaimer, queries24h: 0, accuracyScore: 0,
    lastHeartbeat: new Date().toISOString(),
  };
  await kv.hset(`ep:agent:${EXPERT_ID}`, "_doc", JSON.stringify(doc));
  await kv.zadd("ep:agents", 1, EXPERT_ID);
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  ai.hasReal = false;
  ai.tokens = [];
  ai.fail = false;
});

describe("with no AI model configured, the service refuses rather than pretending", () => {
  it("does not return placeholder prose as an answer", async () => {
    await seedExpert();
    const res = await ExpertsPlatformService.query(EXPERT_ID, "Is 500mg of paracetamol safe every 4 hours?");

    // The specific regression: a hardcoded string presented in the answer slot.
    expect(res.answer ?? "").not.toMatch(/placeholder/i);
    expect(refusal(res).reason).toBe("AI_PROVIDER_NOT_CONFIGURED");
  });

  it("states plainly that no expert response was produced", async () => {
    await seedExpert();
    const res = await ExpertsPlatformService.query(EXPERT_ID, "Can I stop my blood pressure medication?");
    const r = refusal(res);
    expect(r.message).toMatch(/CONFIGURATION REQUIRED/i);
    // And it must say no answer was produced, rather than implying a degraded one.
    expect(r.message).toMatch(/no expert response was generated/i);
    expect(r.message).toMatch(/does not generate substitute professional advice/i);
  });

  it("still carries the consult-a-professional disclaimer", async () => {
    await seedExpert("legal", "informational-not-official-advice");
    const res = await ExpertsPlatformService.query(EXPERT_ID, "Is this contract clause enforceable?");
    expect(res.disclaimer).toBe("informational-not-official-advice");
  });

  it("does not count a refusal as a served query", async () => {
    await seedExpert();
    await ExpertsPlatformService.query(EXPERT_ID, "anything");
    // The dashboard's queries24h must reflect answers given, not attempts
    // rejected — otherwise usage looks healthy while nobody is being helped.
    const dash = await ExpertsPlatformService.dashboard();
    expect(dash.queries24h).toBe(0);
  });
});

describe("with a real model configured, the question is actually used", () => {
  beforeEach(() => { ai.hasReal = true; });

  it("returns the model's answer", async () => {
    await seedExpert();
    ai.tokens = ["Paracetamol ", "dosing depends ", "on body weight."];

    const res = answered(await ExpertsPlatformService.query(EXPERT_ID, "Paracetamol dosing?"));
    expect(res.answer).toBe("Paracetamol dosing depends on body weight.");
    expect(res.modelSource).toBe("real");
  });

  it("counts a served answer in the dashboard", async () => {
    await seedExpert();
    ai.tokens = ["ok"];
    await ExpertsPlatformService.query(EXPERT_ID, "q");
    const dash = await ExpertsPlatformService.dashboard();
    expect(dash.queries24h).toBe(1);
  });

  it("attaches the expert's disclaimer to a real answer too", async () => {
    await seedExpert("pharmacy", "consult-professional");
    ai.tokens = ["Some guidance."];
    const res = await ExpertsPlatformService.query(EXPERT_ID, "q");
    expect(res.disclaimer).toBe("consult-professional");
  });

  it("reports a provider failure instead of falling back to prose", async () => {
    await seedExpert();
    ai.fail = true;
    const res = await ExpertsPlatformService.query(EXPERT_ID, "q");
    expect(refusal(res).reason).toBe("AI_PROVIDER_ERROR");
    expect(res.answer ?? "").not.toMatch(/placeholder/i);
  });

  it("treats an empty model response as no answer", async () => {
    await seedExpert();
    ai.tokens = ["   "];
    expect(refusal(await ExpertsPlatformService.query(EXPERT_ID, "q")).reason).toBe("AI_EMPTY_RESPONSE");
  });
});

describe("expert addressing", () => {
  it("refuses a query for an expert that does not exist", async () => {
    ai.hasReal = true;
    await expect(ExpertsPlatformService.query("nope", "q")).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a query to an expert that is not online", async () => {
    ai.hasReal = true;
    await seedExpert();
    const doc = JSON.parse((await kv.hget(`ep:agent:${EXPERT_ID}`, "_doc"))!);
    doc.status = "paused";
    await kv.hset(`ep:agent:${EXPERT_ID}`, "_doc", JSON.stringify(doc));

    expect(refusal(await ExpertsPlatformService.query(EXPERT_ID, "q")).reason).toBe("EXPERT_UNAVAILABLE");
  });
});
