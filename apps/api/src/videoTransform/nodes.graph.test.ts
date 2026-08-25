/**
 * Session 200 — deeper Video Transform node-graph coverage.
 *
 * The base suite covers basic canConnect + one topoSort DAG/cycle. This suite
 * hardens the graph engine that everything else depends on: the type-compat
 * matrix, every validateConnection error branch, executeWorkflow ordering +
 * fan-in + progress, matte preview filters, and NODE_DEFS integrity.
 */
import { describe, it, expect, vi } from "vitest";
import {
  NODE_DEFS, getNodeDef, canConnect, validateConnection, topoSort, executeWorkflow,
  makeNodeId, makeConnectionId,
} from "./nodes.js";
import { mattePreviewFilter } from "./ffmpegOps.js";

describe("canConnect — type compatibility matrix", () => {
  it("accepts identical and documented cross-compatible types", () => {
    expect(canConnect("video", "video")).toBe(true);
    expect(canConnect("alpha", "mask")).toBe(true);
    expect(canConnect("mask", "alpha")).toBe(true);
    expect(canConnect("rgba", "video")).toBe(true);
    expect(canConnect("reference", "image")).toBe(true);
    expect(canConnect("frame", "image")).toBe(true);
    expect(canConnect("prompt", "metadata")).toBe(true);
  });
  it("rejects incompatible types", () => {
    expect(canConnect("image", "video")).toBe(false);
    expect(canConnect("audio", "video")).toBe(false);
    expect(canConnect("video", "audio")).toBe(false);
  });
});

describe("validateConnection — error branches", () => {
  const nodes: any = [
    { id: "vin", kind: "video_input" },
    { id: "frame", kind: "exact_frame" },
  ];

  it("returns null for a well-typed connection", () => {
    const conn: any = { sourceNode: "vin", targetNode: "frame", sourcePort: "video", targetPort: "video", type: "video" };
    expect(validateConnection(conn, nodes)).toBeNull();
  });
  it("flags a missing node", () => {
    const conn: any = { sourceNode: "ghost", targetNode: "frame", sourcePort: "video", targetPort: "video", type: "video" };
    expect(validateConnection(conn, nodes)).toBe("node missing");
  });
  it("flags a missing source port", () => {
    const conn: any = { sourceNode: "vin", targetNode: "frame", sourcePort: "nope", targetPort: "video", type: "video" };
    expect(validateConnection(conn, nodes)).toBe("source port missing");
  });
  it("flags a missing target port", () => {
    const conn: any = { sourceNode: "vin", targetNode: "frame", sourcePort: "video", targetPort: "nope", type: "video" };
    expect(validateConnection(conn, nodes)).toBe("target port missing");
  });
  it("flags a declared type that mismatches the actual ports", () => {
    const conn: any = { sourceNode: "vin", targetNode: "frame", sourcePort: "video", targetPort: "video", type: "audio" };
    expect(validateConnection(conn, nodes)).toBe("port type mismatch");
  });
});

describe("topoSort", () => {
  it("orders a diamond DAG and rejects a cycle", () => {
    const wf: any = {
      nodes: [{ id: "a", kind: "video_input" }, { id: "b", kind: "video_trim" }, { id: "c", kind: "video_crop" }, { id: "d", kind: "video_preview" }],
      connections: [
        { sourceNode: "a", targetNode: "b" }, { sourceNode: "a", targetNode: "c" },
        { sourceNode: "b", targetNode: "d" }, { sourceNode: "c", targetNode: "d" },
      ],
    };
    const order = topoSort(wf).map((n) => n.id);
    expect(order.indexOf("a")).toBe(0);
    expect(order.indexOf("d")).toBe(3);
    const cyclic = { ...wf, connections: [...wf.connections, { sourceNode: "d", targetNode: "a" }] };
    expect(() => topoSort(cyclic)).toThrow(/cycle/);
  });
});

describe("executeWorkflow", () => {
  it("runs nodes in topological order, wires fan-in inputs, and reports progress", async () => {
    const wf: any = {
      nodes: [
        { id: "a", kind: "video_input" },
        { id: "b", kind: "image_input" },
        { id: "x", kind: "switch_x" },
      ],
      connections: [
        { sourceNode: "a", targetNode: "x", sourcePort: "video", targetPort: "source", type: "video" },
        { sourceNode: "b", targetNode: "x", sourcePort: "image", targetPort: "reference", type: "reference" },
      ],
    };
    const executed: string[] = [];
    const progress: number[] = [];
    const seenInputs: Record<string, string[]> = {};
    await executeWorkflow(wf, {
      organizationId: "org", userId: "u",
      onProgress: (_m, p) => progress.push(p),
      runNode: async (node, inputs) => {
        executed.push(node.id);
        seenInputs[node.id] = Object.keys(inputs);
        // produce a result per declared output port
        const def = getNodeDef(node.kind);
        const out: Record<string, any> = {};
        for (const o of def.outputs) out[o.id] = { kind: o.type, value: `${node.id}:${o.id}` };
        return out;
      },
    });
    // inputs before the switch
    expect(executed.indexOf("a")).toBeLessThan(executed.indexOf("x"));
    expect(executed.indexOf("b")).toBeLessThan(executed.indexOf("x"));
    // the switch node saw both wired input ports
    expect(seenInputs["x"].sort()).toEqual(["reference", "source"]);
    // progress ends at 100
    expect(progress[progress.length - 1]).toBe(100);
  });
});

describe("mattePreviewFilter", () => {
  it("maps each preview mode to its ffmpeg filter", () => {
    expect(mattePreviewFilter("alpha")).toContain("gray");
    expect(mattePreviewFilter("transparent")).toContain("colorkey");
    expect(mattePreviewFilter("overlay")).toContain("rgba");
    expect(mattePreviewFilter("difference")).toContain("difference");
    expect(mattePreviewFilter("rgba")).toBe("null");
  });
});

describe("NODE_DEFS integrity", () => {
  it("has unique kinds and resolvable ports", () => {
    const seen = new Set<string>();
    for (const d of NODE_DEFS) {
      expect(seen.has(d.kind), `duplicate node kind ${d.kind}`).toBe(false);
      seen.add(d.kind);
      expect(getNodeDef(d.kind).label).toBe(d.label);
      for (const port of [...d.inputs, ...d.outputs]) expect(port.type).toBeTruthy();
    }
    expect(NODE_DEFS.length).toBeGreaterThan(5);
  });
  it("getNodeDef throws for an unknown kind", () => {
    expect(() => getNodeDef("not_a_node" as any)).toThrow(/unknown node kind/);
  });
  it("id factories produce prefixed unique ids", () => {
    expect(makeNodeId()).toMatch(/^n_/);
    expect(makeConnectionId()).toMatch(/^c_/);
    expect(makeNodeId()).not.toBe(makeNodeId());
  });
});
