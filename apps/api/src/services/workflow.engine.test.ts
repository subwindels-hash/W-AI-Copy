/**
 * WINDELS AI OS — Workflow Engine tests.
 *
 * Covers the workflow definition schema: every supported node type, edge
 * validation, and creation-schema rules — all pure Zod, no DB required.
 */
import { describe, it, expect, vi } from "vitest";

// The workflow service pulls in Prisma enums (as values), the AI registry, the
// event bus and workspace context. Stub the whole chain so we can test the pure
// schema/validation surface without a live DB or AI provider.
vi.mock("../db/client.js", () => ({
  prisma: {
    workflow: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    workflowRun: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    workflowRunNode: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    workflowApproval: { findMany: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@prisma/client", () => ({
  WorkflowStatus: { DRAFT: "DRAFT", ACTIVE: "ACTIVE", PAUSED: "PAUSED", ARCHIVED: "ARCHIVED" },
  WorkflowRunStatus: { PENDING: "PENDING", RUNNING: "RUNNING", SUCCEEDED: "SUCCEEDED", FAILED: "FAILED" },
}));
vi.mock("./ai/registry.js", () => ({ aiRegistry: { complete: vi.fn(), hasRealModelConfigured: () => false } }));
vi.mock("./eventBus.js", () => ({ EventBus: { publish: vi.fn(), subscribe: vi.fn() } }));
vi.mock("./workspace.service.js", () => ({ resolveUserContext: vi.fn() }));

const { NodeShape, EdgeShape, CreateWorkflowSchema, WorkflowNodeType } = await import("./workflow.service.js");

describe("node validation", () => {
  it("accepts every supported node type", () => {
    const types = ["TRIGGER", "ACTION", "AI", "CONDITION", "LOOP", "APPROVAL", "DELAY", "END"];
    for (const type of types) {
      const r = NodeShape.safeParse({ id: `n-${type}`, type, label: type, config: {} });
      expect(r.success).toBe(true);
    }
  });

  it("rejects unknown node types and missing required fields", () => {
    expect(NodeShape.safeParse({ id: "n", type: "MAGIC", label: "x" }).success).toBe(false);
    expect(NodeShape.safeParse({ type: "AI", label: "x" }).success).toBe(false); // missing id
    expect(NodeShape.safeParse({ id: "n", type: "AI" }).success).toBe(false); // missing label
    expect(NodeShape.safeParse({ id: "", type: "AI", label: "x" }).success).toBe(false); // empty id
  });

  it("node types constant matches the schema enum", () => {
    expect(Object.values(WorkflowNodeType).sort()).toEqual(["ACTION", "AI", "APPROVAL", "CONDITION", "DELAY", "END", "LOOP", "TRIGGER"].sort());
  });
});

describe("edge validation", () => {
  it("accepts a valid trigger→AI→action connection", () => {
    const edge = EdgeShape.safeParse({ id: "e1", fromId: "n-trigger", toId: "n-ai" });
    expect(edge.success).toBe(true);
    const edge2 = EdgeShape.safeParse({ id: "e2", fromId: "n-ai", toId: "n-email", condition: "true" });
    expect(edge2.success).toBe(true);
  });

  it("rejects broken edges (missing endpoints / bad ids)", () => {
    expect(EdgeShape.safeParse({ fromId: "a", toId: "b" }).success).toBe(false); // missing id
    expect(EdgeShape.safeParse({ id: "e", fromId: "", toId: "b" }).success).toBe(false);
    expect(EdgeShape.safeParse({ id: "e", fromId: "a", toId: "" }).success).toBe(false);
  });

  it("accepts condition-labeled edges", () => {
    expect(EdgeShape.safeParse({ id: "e", fromId: "a", toId: "b", condition: "true" }).success).toBe(true);
    expect(EdgeShape.safeParse({ id: "e", fromId: "a", toId: "b", condition: "false", label: "else" }).success).toBe(true);
  });

  it("handles optional edge condition/label", () => {
    // condition/label are optional; empty values are permitted.
    expect(EdgeShape.safeParse({ id: "e", fromId: "a", toId: "b", condition: "" }).success).toBe(true);
    expect(EdgeShape.safeParse({ id: "e", fromId: "a", toId: "b" }).success).toBe(true);
  });

  it("rejects edges missing the required endpoints", () => {
    expect(EdgeShape.safeParse({ id: "e", fromId: "", toId: "b" }).success).toBe(false);
    expect(EdgeShape.safeParse({ id: "e", fromId: "a", toId: "" }).success).toBe(false);
    expect(EdgeShape.safeParse({ id: "e", toId: "b" }).success).toBe(false); // missing fromId
    expect(EdgeShape.safeParse({ id: "e", fromId: "a" }).success).toBe(false); // missing toId
  });
});

describe("workflow creation schema", () => {
  it("accepts a complete workflow with nodes + edges", () => {
    const r = CreateWorkflowSchema.safeParse({
      name: "Lead → AI → Email",
      nodes: [
        { id: "n1", type: "TRIGGER", label: "Trigger" },
        { id: "n2", type: "AI", label: "AI Agent" },
        { id: "n3", type: "ACTION", label: "Send Email" },
        { id: "n4", type: "END", label: "End" },
      ],
      edges: [
        { id: "e1", fromId: "n1", toId: "n2" },
        { id: "e2", fromId: "n2", toId: "n3" },
        { id: "e3", fromId: "n3", toId: "n4" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("applies sensible defaults (nodes/edges/triggers/settings)", () => {
    const r = CreateWorkflowSchema.safeParse({ name: "Minimal" });
    expect(r.success).toBe(true);
    const wf = r.success ? r.data : null;
    expect(wf!.nodes).toEqual([]);
    expect(wf!.edges).toEqual([]);
    expect(wf!.triggers).toEqual([{ type: "manual", config: {} }]);
    expect(wf!.settings.retryCount).toBe(1);
    expect(wf!.settings.notifyOnFailure).toBe(true);
  });

  it("rejects invalid workflows (missing name, bad trigger, bad node)", () => {
    expect(CreateWorkflowSchema.safeParse({}).success).toBe(false); // no name
    expect(CreateWorkflowSchema.safeParse({ name: "x", triggers: [{ type: "cron" }] }).success).toBe(false); // bad trigger type
    expect(CreateWorkflowSchema.safeParse({ name: "x", nodes: [{ id: "n", type: "BAD", label: "x" }] }).success).toBe(false);
  });

  it("accepts all trigger types", () => {
    for (const type of ["manual", "schedule", "event", "webhook", "api"]) {
      const r = CreateWorkflowSchema.safeParse({ name: `wf-${type}`, triggers: [{ type }] });
      expect(r.success).toBe(true);
    }
  });

  it("rejects a workflow with an oversized name", () => {
    expect(CreateWorkflowSchema.safeParse({ name: "x".repeat(121) }).success).toBe(false);
  });

  it("honours settings constraints (retryCount range)", () => {
    expect(CreateWorkflowSchema.safeParse({ name: "x", settings: { retryCount: 11 } }).success).toBe(false);
    expect(CreateWorkflowSchema.safeParse({ name: "x", settings: { retryCount: 10 } }).success).toBe(true);
  });

  it("accepts a real workflow with all node kinds in sequence", () => {
    const r = CreateWorkflowSchema.safeParse({
      name: "Full pipeline",
      nodes: [
        { id: "t", type: "TRIGGER", label: "On webhook" },
        { id: "ai", type: "AI", label: "Summarize" },
        { id: "c", type: "CONDITION", label: "Is urgent?" },
        { id: "ap", type: "APPROVAL", label: "Manager OK" },
        { id: "d", type: "DELAY", label: "Wait 1h" },
        { id: "l", type: "LOOP", label: "For each" },
        { id: "a", type: "ACTION", label: "Notify" },
        { id: "e", type: "END", label: "Done" },
      ],
      edges: [
        { id: "e1", fromId: "t", toId: "ai" },
        { id: "e2", fromId: "ai", toId: "c" },
        { id: "e3", fromId: "c", toId: "ap", condition: "true" },
        { id: "e4", fromId: "ap", toId: "d" },
        { id: "e5", fromId: "d", toId: "l" },
        { id: "e6", fromId: "l", toId: "a" },
        { id: "e7", fromId: "a", toId: "e" },
      ],
    });
    expect(r.success).toBe(true);
  });
});
