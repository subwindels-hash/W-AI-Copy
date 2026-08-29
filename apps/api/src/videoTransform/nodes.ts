/**
 * WINDELS AI Video Transformation Studio — node catalogue + workflow engine.
 *
 * Strongly-typed node graph (§19–21): nodes expose typed ports; connections are
 * validated by port type. The executor topologically sorts the DAG and runs
 * each node, calling the real backend services (exact-frame extraction, matte
 * generation, image generation, Switch X compositing). Results are persisted
 * per-node so downstream nodes can consume them, and re-execution is cached.
 *
 * This is NOT a static demo: every node kind maps to a real operation.
 */
import type {
  VtNodeDef, VtNodeKind, VtPortType, VtWorkflow, VtWorkflowConnection, VtWorkflowNode, VtNodeResult,
} from "@windels/shared";
import { randomUUID } from "node:crypto";

const p = (id: string, name: string, type: VtPortType, direction: "in" | "out") => ({ id, name, type, direction });

export const NODE_DEFS: VtNodeDef[] = [
  // ── Inputs ──
  { kind: "video_input", label: "Video Input", category: "input",
    inputs: [], outputs: [p("video", "Video", "video", "out"), p("meta", "Meta", "metadata", "out")],
    settings: [{ key: "assetId", label: "Source video", type: "text" }] },
  { kind: "image_input", label: "Image Input", category: "input",
    inputs: [], outputs: [p("image", "Image", "image", "out")],
    settings: [{ key: "assetId", label: "Source image", type: "text" }] },
  { kind: "audio_input", label: "Audio Input", category: "input",
    inputs: [], outputs: [p("audio", "Audio", "audio", "out")],
    settings: [{ key: "assetId", label: "Source audio", type: "text" }] },
  { kind: "text_input", label: "Text / Prompt", category: "input",
    inputs: [], outputs: [p("text", "Text", "prompt", "out")],
    settings: [{ key: "text", label: "Text", type: "textarea" }] },

  // ── Video ──
  { kind: "video_preview", label: "Video Preview", category: "video",
    inputs: [p("video", "Video", "video", "in")], outputs: [],
    settings: [] },
  { kind: "exact_frame", label: "Exact Frame", category: "video",
    inputs: [p("video", "Video", "video", "in")],
    outputs: [p("frame", "Frame", "frame", "out"), p("image", "Image", "image", "out"), p("ts", "Timestamp", "metadata", "out")],
    settings: [{ key: "frameNumber", label: "Frame number", type: "number", default: 0, min: 0 }] },
  { kind: "video_matte", label: "Video Matte", category: "video",
    inputs: [p("video", "Video", "video", "in")],
    outputs: [p("alpha", "Alpha", "alpha", "out"), p("rgba", "RGBA", "rgba", "out"), p("mask", "Mask Video", "mask", "out")],
    settings: [
      { key: "featherPx", label: "Feather (px)", type: "slider", default: 3, min: 0, max: 20, step: 1 },
      { key: "expandPx", label: "Expand (px)", type: "slider", default: 2, min: 0, max: 20, step: 1 },
      { key: "hairRefinement", label: "Hair refinement", type: "boolean", default: true },
    ] },
  { kind: "video_trim", label: "Video Trim", category: "video",
    inputs: [p("video", "Video", "video", "in")], outputs: [p("video", "Video", "video", "out")],
    settings: [{ key: "startSec", label: "Start (s)", type: "number", default: 0 }, { key: "endSec", label: "End (s)", type: "number", default: 0 }] },
  { kind: "video_crop", label: "Video Crop", category: "video",
    inputs: [p("video", "Video", "video", "in")], outputs: [p("video", "Video", "video", "out")],
    settings: [{ key: "w", label: "Width", type: "number" }, { key: "h", label: "Height", type: "number" }] },
  { kind: "video_resize", label: "Video Resize", category: "video",
    inputs: [p("video", "Video", "video", "in")], outputs: [p("video", "Video", "video", "out")],
    settings: [{ key: "resolution", label: "Resolution", type: "select", options: ["480p", "720p", "1080p", "1440p", "4k"], default: "1080p" }] },
  { kind: "video_fps", label: "Video FPS", category: "video",
    inputs: [p("video", "Video", "video", "in")], outputs: [p("video", "Video", "video", "out")],
    settings: [{ key: "fps", label: "FPS", type: "number", default: 30 }] },
  { kind: "video_merge", label: "Video Merge", category: "video",
    inputs: [p("a", "A", "video", "in"), p("b", "B", "video", "in")], outputs: [p("video", "Video", "video", "out")], settings: [] },
  { kind: "video_composite", label: "Video Composite", category: "video",
    inputs: [p("bg", "Background", "video", "in"), p("fg", "Foreground", "rgba", "in")], outputs: [p("video", "Video", "video", "out")], settings: [] },
  { kind: "video_transform", label: "Video Transform", category: "video",
    inputs: [p("video", "Video", "video", "in")], outputs: [p("video", "Video", "video", "out")],
    settings: [{ key: "scale", label: "Scale", type: "slider", default: 1, min: 0.1, max: 2, step: 0.05 }] },
  { kind: "switch_x", label: "Switch X — AI Transform", category: "video",
    inputs: [p("source", "Source", "video", "in"), p("alpha", "Alpha", "alpha", "in"), p("prompt", "Prompt", "prompt", "in"), p("reference", "Reference", "reference", "in")],
    outputs: [p("video", "Video", "video", "out")],
    settings: [
      { key: "prompt", label: "Prompt", type: "textarea" },
      { key: "preserveSubject", label: "Preserve subject", type: "select", options: ["maximum", "high", "balanced", "creative"], default: "high" },
      { key: "transformMode", label: "Transform mode", type: "select", options: ["background_only", "subject_and_background", "full_scene", "environment_replacement", "cinematic_restyle"], default: "environment_replacement" },
      { key: "resolution", label: "Resolution", type: "select", options: ["480p", "720p", "1080p", "1440p", "4k"], default: "1080p" },
      { key: "previewSeconds", label: "Preview seconds", type: "number" },
    ] },

  // ── Image ──
  { kind: "image_generator", label: "Image Generator", category: "image",
    inputs: [p("prompt", "Prompt", "prompt", "in"), p("ref", "Reference", "reference", "in")],
    outputs: [p("image", "Image", "image", "out"), p("reference", "Reference", "reference", "out")],
    settings: [
      { key: "prompt", label: "Prompt", type: "textarea" },
      { key: "modelId", label: "Model", type: "text" },
      { key: "resolution", label: "Resolution", type: "select", options: ["1024x1024", "1536x1024", "2048x1072", "2048x1152"], default: "1536x1024" },
      { key: "quality", label: "Quality", type: "select", options: ["standard", "high", "ultra"], default: "high" },
      { key: "aspectRatio", label: "Aspect", type: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"], default: "16:9" },
      { key: "quantity", label: "Quantity", type: "select", options: ["1", "2", "4", "8"], default: "1" },
      { key: "referenceStrength", label: "Reference strength", type: "slider", default: 0.6, min: 0, max: 1, step: 0.05 },
    ] },
  { kind: "image_editor", label: "Image Editor", category: "image",
    inputs: [p("image", "Image", "image", "in"), p("prompt", "Prompt", "prompt", "in")], outputs: [p("image", "Image", "image", "out")],
    settings: [{ key: "prompt", label: "Edit instruction", type: "textarea" }] },
  { kind: "image_upscaler", label: "Image Upscaler", category: "image",
    inputs: [p("image", "Image", "image", "in")], outputs: [p("image", "Image", "image", "out")],
    settings: [{ key: "scale", label: "Scale", type: "select", options: ["2x", "4x"], default: "2x" }] },
  { kind: "image_reference", label: "Match Image", category: "image",
    inputs: [p("a", "Image 1", "image", "in"), p("b", "Image 2", "image", "in"), p("c", "Image 3", "image", "in")],
    outputs: [p("reference", "Reference", "reference", "out")], settings: [] },
  { kind: "image_preview", label: "Image Preview", category: "image",
    inputs: [p("image", "Image", "image", "in")], outputs: [], settings: [] },

  // ── AI ──
  { kind: "ai_prompt", label: "AI Prompt", category: "ai", inputs: [], outputs: [p("prompt", "Prompt", "prompt", "out")],
    settings: [{ key: "text", label: "Prompt", type: "textarea" }] },
  { kind: "ai_video_generator", label: "AI Video Generator", category: "ai",
    inputs: [p("prompt", "Prompt", "prompt", "in")], outputs: [p("video", "Video", "video", "out")],
    settings: [{ key: "resolution", label: "Resolution", type: "select", options: ["480p", "720p", "1080p"], default: "720p" }] },
  { kind: "ai_video_to_video", label: "AI Video-to-Video", category: "ai",
    inputs: [p("video", "Video", "video", "in"), p("prompt", "Prompt", "prompt", "in")], outputs: [p("video", "Video", "video", "out")], settings: [] },
  { kind: "ai_image_to_video", label: "AI Image-to-Video", category: "ai",
    inputs: [p("image", "Image", "image", "in")], outputs: [p("video", "Video", "video", "out")], settings: [] },
  { kind: "ai_background_replacement", label: "AI Background Replacement", category: "ai",
    inputs: [p("video", "Video", "video", "in"), p("reference", "Reference", "reference", "in")], outputs: [p("video", "Video", "video", "out")], settings: [] },
  { kind: "ai_subject_replacement", label: "AI Subject Replacement", category: "ai",
    inputs: [p("video", "Video", "video", "in"), p("reference", "Reference", "reference", "in")], outputs: [p("video", "Video", "video", "out")], settings: [] },
  { kind: "ai_relighting", label: "AI Relighting", category: "ai",
    inputs: [p("video", "Video", "video", "in"), p("prompt", "Prompt", "prompt", "in")], outputs: [p("video", "Video", "video", "out")], settings: [] },
  { kind: "ai_style_transfer", label: "AI Style Transfer", category: "ai",
    inputs: [p("video", "Video", "video", "in"), p("reference", "Reference", "reference", "in")], outputs: [p("video", "Video", "video", "out")], settings: [] },

  // ── Utility ──
  { kind: "switch", label: "Switch", category: "utility",
    inputs: [p("a", "A", "video", "in"), p("b", "B", "video", "in")], outputs: [p("out", "Out", "video", "out")],
    settings: [{ key: "selected", label: "Selected input", type: "select", options: ["a", "b"], default: "a" }] },
  { kind: "condition", label: "Condition", category: "utility",
    inputs: [p("in", "In", "video", "in")], outputs: [p("true", "True", "video", "out"), p("false", "False", "video", "out")],
    settings: [{ key: "expression", label: "Expression", type: "text" }] },
  { kind: "router", label: "Router", category: "utility",
    inputs: [p("in", "In", "video", "in")], outputs: [p("a", "A", "video", "out"), p("b", "B", "video", "out")], settings: [] },
  { kind: "combine", label: "Combine", category: "utility",
    inputs: [p("a", "A", "video", "in"), p("b", "B", "video", "in")], outputs: [p("out", "Out", "video", "out")], settings: [] },
  { kind: "cache", label: "Cache", category: "utility",
    inputs: [p("in", "In", "video", "in")], outputs: [p("out", "Out", "video", "out")], settings: [] },
  { kind: "delay", label: "Delay", category: "utility",
    inputs: [p("in", "In", "video", "in")], outputs: [p("out", "Out", "video", "out")], settings: [{ key: "ms", label: "Delay (ms)", type: "number", default: 0 }] },
  { kind: "output", label: "Output", category: "utility",
    inputs: [p("video", "Video", "video", "in"), p("image", "Image", "image", "in")], outputs: [],
    settings: [{ key: "name", label: "Output name", type: "text", default: "Final" }] },
];

const DEF_BY_KIND = new Map<VtNodeKind, VtNodeDef>(NODE_DEFS.map((d) => [d.kind, d]));
export function getNodeDef(kind: VtNodeKind): VtNodeDef {
  const d = DEF_BY_KIND.get(kind);
  if (!d) throw new Error(`unknown node kind ${kind}`);
  return d;
}

const TYPE_COMPAT: Record<VtPortType, VtPortType[]> = {
  video: ["video"], image: ["image"], alpha: ["alpha", "mask"], mask: ["mask", "alpha"],
  rgba: ["rgba", "video"], prompt: ["prompt", "metadata"], reference: ["reference", "image"],
  frame: ["frame", "image"], audio: ["audio"], metadata: ["metadata", "prompt"],
};

export function canConnect(sourceType: VtPortType, targetType: VtPortType): boolean {
  return TYPE_COMPAT[sourceType]?.includes(targetType) ?? sourceType === targetType;
}

export function validateConnection(conn: VtWorkflowConnection, nodes: VtWorkflowNode[]): string | null {
  const source = nodes.find((n) => n.id === conn.sourceNode);
  const target = nodes.find((n) => n.id === n.id && n.id === conn.targetNode);
  if (!source || !target) return "node missing";
  const sDef = getNodeDef(source.kind);
  const tDef = getNodeDef(target.kind);
  const sPort = sDef.outputs.find((o) => o.id === conn.sourcePort);
  const tPort = tDef.inputs.find((i) => i.id === conn.targetPort);
  if (!sPort) return "source port missing";
  if (!tPort) return "target port missing";
  if (conn.type !== sPort.type || conn.type !== tPort.type) return "port type mismatch";
  if (!canConnect(sPort.type, tPort.type)) return `cannot connect ${sPort.type} → ${tPort.type}`;
  return null;
}

/** Topological order; throws on cycles. */
export function topoSort(workflow: VtWorkflow): VtWorkflowNode[] {
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of workflow.nodes) { indeg.set(n.id, 0); adj.set(n.id, []); }
  for (const c of workflow.connections) {
    adj.get(c.sourceNode)!.push(c.targetNode);
    indeg.set(c.targetNode, (indeg.get(c.targetNode) ?? 0) + 1);
  }
  const q = workflow.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const out: VtWorkflowNode[] = [];
  while (q.length) {
    const id = q.shift()!;
    const node = workflow.nodes.find((n) => n.id === id)!;
    out.push(node);
    for (const next of adj.get(id) ?? []) {
      indeg.set(next, (indeg.get(next) ?? 1) - 1);
      if (indeg.get(next) === 0) q.push(next);
    }
  }
  if (out.length !== workflow.nodes.length) throw new Error("workflow contains a cycle");
  return out;
}

export interface NodeExecutionContext {
  organizationId: string;
  userId: string;
  jobId?: string;
  onProgress?: (message: string, percent: number) => void;
  /** Executor-supplied handler that actually runs a node; returns per-port results. */
  runNode: (node: VtWorkflowNode, inputs: Record<string, VtNodeResult[]>) => Promise<Record<string, VtNodeResult>>;
}

export async function executeWorkflow(workflow: VtWorkflow, ctx: NodeExecutionContext): Promise<Record<string, Record<string, VtNodeResult>>> {
  const order = topoSort(workflow);
  const results = new Map<string, Record<string, VtNodeResult>>();
  let i = 0;
  for (const node of order) {
    const inputs: Record<string, VtNodeResult[]> = {};
    for (const conn of workflow.connections.filter((c) => c.targetNode === node.id)) {
      const upstream = results.get(conn.sourceNode)?.[conn.sourcePort];
      if (upstream) (inputs[conn.targetPort] ??= []).push(upstream);
    }
    ctx.onProgress?.(`Running ${getNodeDef(node.kind).label}`, Math.round((i / order.length) * 100));
    const nodeResults = await ctx.runNode(node, inputs);
    results.set(node.id, nodeResults);
    i++;
  }
  ctx.onProgress?.("Workflow complete", 100);
  return Object.fromEntries(results) as Record<string, Record<string, VtNodeResult>>;
}

export function makeNodeId(): string { return "n_" + randomUUID().slice(0, 8); }
export function makeConnectionId(): string { return "c_" + randomUUID().slice(0, 8); }
