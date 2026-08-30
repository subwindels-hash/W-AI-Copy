import { describe, it, expect } from "vitest";
import { validateWorkflow, isImplemented, UNIMPLEMENTED_NODE_KINDS, NODE_DEFS } from "./nodes.js";
import { checkFilterOp, filterStringFor } from "./ffmpegOps.js";
import type { VtWorkflowNode, VtWorkflowConnection } from "@windels/shared";

const n = (id: string, kind: any, settings: Record<string, unknown> = {}): VtWorkflowNode => ({ id, kind, x: 0, y: 0, settings });
const c = (id: string, sn: string, sp: string, tn: string, tp: string, type: any = "video"): VtWorkflowConnection =>
  ({ id, sourceNode: sn, sourcePort: sp, targetNode: tn, targetPort: tp, type });

describe("S210 workflow validation rejects inert graphs", () => {
  it("accepts a correctly configured trim graph", () => {
    const wf = {
      nodes: [n("a", "video_input", { assetId: "v1" }), n("b", "video_trim", { startSec: 0, endSec: 5 }), n("o", "output", {})],
      connections: [c("c1", "a", "video", "b", "video"), c("c2", "b", "video", "o", "video")],
    };
    expect(validateWorkflow(wf)).toEqual([]);
  });

  it("rejects a trim node left at its default endSec of 0", () => {
    // This is the exact silent case: the node looked configured (endSec has a
    // default of 0) and the old executor just passed the source through.
    const wf = {
      nodes: [n("a", "video_input", { assetId: "v1" }), n("b", "video_trim", { startSec: 0, endSec: 0 })],
      connections: [c("c1", "a", "video", "b", "video")],
    };
    const errs = validateWorkflow(wf);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/End \(s\) greater than 0/);
  });

  it("rejects an inverted trim range", () => {
    const wf = { nodes: [n("a", "video_input"), n("b", "video_trim", { startSec: 9, endSec: 4 })], connections: [c("c1", "a", "video", "b", "video")] };
    expect(validateWorkflow(wf)[0]).toMatch(/must be greater than Start/);
  });

  it("rejects a crop with no dimensions set", () => {
    const wf = { nodes: [n("a", "video_input"), n("b", "video_crop", {})], connections: [c("c1", "a", "video", "b", "video")] };
    expect(validateWorkflow(wf)[0]).toMatch(/set both Width and Height/);
  });

  it("rejects declared-but-unimplemented nodes by name", () => {
    const wf = { nodes: [n("a", "image_input"), n("u", "image_upscaler", { scale: "2x" })], connections: [c("c1", "a", "image", "u", "image", "image")] };
    const errs = validateWorkflow(wf);
    expect(errs.some((e) => /Image Upscaler.*not implemented/.test(e))).toBe(true);
  });

  it("rejects a node with nothing connected to its inputs", () => {
    const wf = { nodes: [n("b", "video_resize", { resolution: "1080p" })], connections: [] };
    expect(validateWorkflow(wf)[0]).toMatch(/no inputs are connected/);
  });

  it("requires BOTH inputs on merge and composite", () => {
    const wf = {
      nodes: [n("a", "video_input"), n("m", "video_merge", {})],
      connections: [c("c1", "a", "video", "m", "a")],
    };
    expect(validateWorkflow(wf).some((e) => /required input "B" is not connected/.test(e))).toBe(true);
  });

  it("rejects an unknown resize resolution", () => {
    const wf = { nodes: [n("a", "video_input"), n("r", "video_resize", { resolution: "8k" })], connections: [c("c1", "a", "video", "r", "video")] };
    expect(validateWorkflow(wf)[0]).toMatch(/unknown resolution "8k"/);
  });
});

describe("S210 filter ops are real", () => {
  it("builds a crop filter from settings rather than ignoring them", () => {
    expect(filterStringFor({ kind: "crop", w: 640, h: 480, x: 10, y: 20 })).toBe("crop=640:480:10:20");
  });

  it("builds an aspect-preserving pad for resize", () => {
    expect(filterStringFor({ kind: "resize", resolution: "720p" }))
      .toBe("scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2");
  });

  it("keeps scaled dimensions even for yuv420p", () => {
    expect(filterStringFor({ kind: "scale", scale: 0.5 })).toBe("scale=trunc(iw*0.5/2)*2:trunc(ih*0.5/2)*2");
  });

  it("uses seek args, not a filter, for trim", () => {
    expect(filterStringFor({ kind: "trim", startSec: 1, endSec: 2 })).toBe("");
  });

  it("refuses a crop larger than the source", () => {
    const meta = { width: 640, height: 360, durationSec: 10, fps: 30, frameCount: 300 };
    expect(checkFilterOp({ kind: "crop", w: 1920, h: 1080 }, meta)).toMatch(/larger than the source \(640x360\)/);
    expect(checkFilterOp({ kind: "crop", w: 320, h: 180 }, meta)).toBeNull();
  });

  it("refuses a trim starting past the end of the source", () => {
    const meta = { width: 640, height: 360, durationSec: 10, fps: 30, frameCount: 300 };
    expect(checkFilterOp({ kind: "trim", startSec: 30, endSec: 40 }, meta)).toMatch(/beyond the source duration/);
  });

  it("bounds fps and scale", () => {
    expect(checkFilterOp({ kind: "fps", fps: 0 })).toMatch(/between 1 and 240/);
    expect(checkFilterOp({ kind: "fps", fps: 60 })).toBeNull();
    expect(checkFilterOp({ kind: "scale", scale: 99 })).toMatch(/<= 4/);
  });
});

describe("S210 palette honesty", () => {
  it("marks exactly the unimplemented kinds", () => {
    expect([...UNIMPLEMENTED_NODE_KINDS].sort()).toEqual(["condition", "image_editor", "image_upscaler"]);
    expect(isImplemented("video_trim")).toBe(true);
    expect(isImplemented("image_upscaler")).toBe(false);
    // condition emitted on BOTH branches regardless of its expression.
    expect(isImplemented("condition")).toBe(false);
  });

  it("every node kind in the palette has a definition", () => {
    expect(NODE_DEFS.length).toBe(35);
  });
});
