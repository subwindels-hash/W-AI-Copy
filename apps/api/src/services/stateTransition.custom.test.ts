/**
 * State-transition custom evaluators & effect handlers.
 *
 * Previously both `custom` branches were stubs:
 *   - a custom PRECONDITION returned `true` unconditionally (fail-OPEN: an
 *     unknown gate approved every transition), and
 *   - a custom EFFECT did nothing (a transition reported success having applied
 *     nothing).
 * They now use a name-keyed registry and FAIL CLOSED for unknown names: an
 * unregistered custom precondition evaluates to false (transition refused) and
 * an unregistered custom effect throws. Registered functions run normally.
 *
 * Exercised end-to-end through defineAction + executeTransition with FakeKv
 * backing Redis and the knowledge graph — no Postgres.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
vi.mock("../config/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { KnowledgeGraphService } = await import("../enterprise/knowledgeGraph/knowledgeGraph.service.js");
const st = await import("./stateTransition.service.js");

async function baseStateWithEntity() {
  await KnowledgeGraphService.upsertEntity({ kind: "concept" as any, name: "Doc", attributes: { status: "draft" } });
  const state = await (await import("./worldState.service.js")).captureState("base");
  return state;
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  st.clearCustomRegistries();
});

describe("custom precondition evaluator (fail-closed)", () => {
  it("refuses the transition when the named evaluator is not registered", async () => {
    const state = await baseStateWithEntity();
    const action = await st.defineAction({
      name: "Approve",
      description: "Approve with a custom gate",
      parameters: [],
      preconditions: [{ type: "custom", evaluator: "isBusinessHours" }],
      effects: [{ type: "add_entity", entityKind: "concept", entityName: "Approval" }],
    });
    const result = await st.executeTransition(state.id, { actionId: action.id, parameters: {} });
    expect(result.success).toBe(false);
    expect(result.preconditionsMet).toBe(false);
  });

  it("runs a registered evaluator and allows the transition when it returns true", async () => {
    st.registerCustomEvaluator("always", () => true);
    const state = await baseStateWithEntity();
    const action = await st.defineAction({
      name: "Approve",
      description: "Approve with a registered gate",
      parameters: [],
      preconditions: [{ type: "custom", evaluator: "always" }],
      effects: [{ type: "add_entity", entityKind: "concept", entityName: "Approval" }],
    });
    const result = await st.executeTransition(state.id, { actionId: action.id, parameters: {} });
    expect(result.success).toBe(true);
    expect(result.preconditionsMet).toBe(true);
  });

  it("refuses when a registered evaluator returns false", async () => {
    st.registerCustomEvaluator("never", () => false);
    const state = await baseStateWithEntity();
    const action = await st.defineAction({
      name: "Approve", description: "gate", parameters: [],
      preconditions: [{ type: "custom", evaluator: "never" }],
      effects: [{ type: "add_entity", entityKind: "concept", entityName: "X" }],
    });
    const result = await st.executeTransition(state.id, { actionId: action.id, parameters: {} });
    expect(result.success).toBe(false);
  });

  it("fails closed when the custom precondition has no evaluator name", async () => {
    const state = await baseStateWithEntity();
    const action = await st.defineAction({
      name: "NoName", description: "gate", parameters: [],
      preconditions: [{ type: "custom" }],
      effects: [{ type: "add_entity", entityKind: "concept", entityName: "X" }],
    });
    const result = await st.executeTransition(state.id, { actionId: action.id, parameters: {} });
    expect(result.success).toBe(false);
  });
});

describe("custom effect handler (fail-closed)", () => {
  it("throws for an unknown handler rather than silently applying nothing", async () => {
    const state = await baseStateWithEntity();
    const action = await st.defineAction({
      name: "DoThing", description: "custom effect", parameters: [],
      preconditions: [],
      effects: [{ type: "custom", handler: "notRegistered" }],
    });
    await expect(st.executeTransition(state.id, { actionId: action.id, parameters: {} })).rejects.toThrow(/Unknown custom effect handler/);
  });

  it("invokes a registered handler and applies its returned state", async () => {
    const marker = vi.fn((_e: any, s: any) => ({ ...s, metadata: { ...(s.metadata ?? {}), touchedByCustom: true } }));
    st.registerCustomEffectHandler("touch", marker as any);
    const state = await baseStateWithEntity();
    const action = await st.defineAction({
      name: "Touch", description: "custom effect", parameters: [],
      preconditions: [],
      effects: [{ type: "custom", handler: "touch" }],
    });
    const result = await st.executeTransition(state.id, { actionId: action.id, parameters: {} });
    expect(result.success).toBe(true);
    expect(marker).toHaveBeenCalledTimes(1);
  });
});
