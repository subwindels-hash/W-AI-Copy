/**
 * Rule engine — update_attribute action.
 *
 * The `update_attribute` case was a stub: it returned `{ updated: true }`
 * without touching the entity (a false success). It now resolves the target
 * entity (binding var or literal id), writes the attribute through
 * KnowledgeGraphService.upsertEntity, and honestly reports when the entity does
 * not exist. Exercised end-to-end through forwardChain with FakeKv backing both
 * the rule store and the knowledge graph — no real infra.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
vi.mock("../observability/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../config/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { KnowledgeGraphService } = await import("../enterprise/knowledgeGraph/knowledgeGraph.service.js");
const ruleEngine = await import("./ruleEngine.service.js");

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("update_attribute action", () => {
  it("actually writes the attribute onto the target entity", async () => {
    const entity = await KnowledgeGraphService.upsertEntity({
      kind: "concept" as any, name: "Widget", attributes: { status: "draft" },
    });

    await ruleEngine.createRule({
      name: "Publish drafts",
      description: "Set status=published on draft widgets",
      condition: { type: "attribute", entityId: entity.id, attributeName: "status", attributeValue: "draft" },
      action: { type: "update_attribute", entityId: entity.id, attributeName: "status", attributeValue: "published" },
    });

    const { activations } = await ruleEngine.forwardChain(1);
    expect(activations.some((a) => a.result?.updated === true)).toBe(true);

    const updated = KnowledgeGraphService.get(entity.id)!;
    expect((updated.attributes as any).status).toBe("published");
    expect((updated.attributes as any).updatedByRule).toBe(true);
  });

  it("reports updated:false when the target entity does not exist", async () => {
    // Call the action path directly via a rule whose condition binds nothing to
    // a real entity: use a literal, non-existent entityId in the action and a
    // trivially-true condition against an existing entity.
    const marker = await KnowledgeGraphService.upsertEntity({ kind: "concept" as any, name: "Marker", attributes: { flag: true } });

    await ruleEngine.createRule({
      name: "Touch ghost",
      description: "Attempts to update a missing entity",
      condition: { type: "attribute", entityId: marker.id, attributeName: "flag", attributeValue: true },
      action: { type: "update_attribute", entityId: "concept:does-not-exist", attributeName: "x", attributeValue: 1 },
    });

    const { activations } = await ruleEngine.forwardChain(1);
    const ghost = activations.find((a) => a.result && a.result.updated === false);
    expect(ghost?.result).toMatchObject({ updated: false, reason: "entity_not_found" });
  });

  it("throws when entityId is missing from the action", async () => {
    // executeAction is internal; drive it through forwardChain and confirm the
    // rule does not fire successfully (the throw is caught per-rule).
    const e = await KnowledgeGraphService.upsertEntity({ kind: "concept" as any, name: "NoId", attributes: { k: 1 } });
    await ruleEngine.createRule({
      name: "Missing entityId",
      description: "update_attribute without entityId",
      condition: { type: "attribute", entityId: e.id, attributeName: "k", attributeValue: 1 },
      action: { type: "update_attribute", attributeName: "k", attributeValue: 2 } as any,
    });
    const { activations } = await ruleEngine.forwardChain(1);
    // The action throws internally, so no successful update activation is recorded.
    expect(activations.some((a) => a.result?.updated === true)).toBe(false);
  });
});

describe("custom rule action (fail-closed registry)", () => {
  it("invokes a registered custom handler", async () => {
    ruleEngine.clearCustomRuleActions();
    const handler = vi.fn(() => ({ did: "work" }));
    ruleEngine.registerCustomRuleAction("notify", handler);
    const e = await KnowledgeGraphService.upsertEntity({ kind: "concept" as any, name: "Sig", attributes: { fire: true } });
    await ruleEngine.createRule({
      name: "Custom fire", description: "runs a registered custom handler",
      condition: { type: "attribute", entityId: e.id, attributeName: "fire", attributeValue: true },
      action: { type: "custom", handler: "notify" } as any,
    });
    const { activations } = await ruleEngine.forwardChain(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(activations.some((a) => a.result?.custom === true && a.result?.handler === "notify")).toBe(true);
  });

  it("does not fire (throws internally) for an unknown custom handler", async () => {
    ruleEngine.clearCustomRuleActions();
    const e = await KnowledgeGraphService.upsertEntity({ kind: "concept" as any, name: "Ghost", attributes: { fire: true } });
    await ruleEngine.createRule({
      name: "Custom ghost", description: "unknown handler",
      condition: { type: "attribute", entityId: e.id, attributeName: "fire", attributeValue: true },
      action: { type: "custom", handler: "does-not-exist" } as any,
    });
    const { activations } = await ruleEngine.forwardChain(1);
    expect(activations.some((a) => a.result?.custom === true)).toBe(false);
  });
});
