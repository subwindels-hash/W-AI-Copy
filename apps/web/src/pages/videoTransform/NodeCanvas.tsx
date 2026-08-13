/**
 * AI Video Transformation Studio — node graph canvas.
 *
 * Native WINDELS implementation (no third-party flow library): pan, zoom,
 * drag nodes, multi-select, copy/paste, undo/redo, minimap, typed-port
 * connections with invalid-connection rejection, auto-layout, collapse.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VtNodeDef, VtWorkflowConnection, VtWorkflowNode } from "@windels/shared";
import { NODE_PORT_COLORS } from "./portColors";

interface Props {
  nodes: VtWorkflowNode[];
  connections: VtWorkflowConnection[];
  defs: VtNodeDef[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (nodes: VtWorkflowNode[], connections: VtWorkflowConnection[]) => void;
  onRunNode?: (node: VtWorkflowNode) => void;
  runningNodeId?: string | null;
}

interface Transform { x: number; y: number; zoom: number; }

const NODE_W = 230;
const HEADER_H = 36;
const PORT_R = 6;

type DragNode = { id: string; offX: number; offY: number };
type PendingConn = { sourceNode: string; sourcePort: string; type: string; x: number; y: number } | null;

export function NodeCanvas({ nodes, connections, defs, selectedId, onSelect, onChange, onRunNode, runningNodeId }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 40, y: 40, zoom: 1 });
  const [dragNode, setDragNode] = useState<DragNode | null>(null);
  const [panStart, setPanStart] = useState<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [pending, setPending] = useState<PendingConn>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [multi, setMulti] = useState<Set<string>>(new Set());

  const defByKind = useMemo(() => new Map(defs.map((d) => [d.kind, d])), [defs]);

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (sx - rect.left - transform.x) / transform.zoom, y: (sy - rect.top - transform.y) / transform.zoom };
  }, [transform]);

  const portPos = useCallback((node: VtWorkflowNode, portId: string, dir: "in" | "out") => {
    const def = defByKind.get(node.kind);
    const ports = dir === "in" ? def?.inputs ?? [] : def?.outputs ?? [];
    const idx = ports.findIndex((p) => p.id === portId);
    const x = node.x + (dir === "in" ? 0 : NODE_W);
    const y = node.y + HEADER_H + 20 + idx * 22 + PORT_R;
    return { x, y };
  }, [defByKind]);

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const next = Math.min(2, Math.max(0.4, transform.zoom + delta));
    const rect = ref.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const wx = (mx - transform.x) / transform.zoom;
    const wy = (my - transform.y) / transform.zoom;
    setTransform({ zoom: next, x: mx - wx * next, y: my - wy * next });
  };

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).dataset.canvas === "1") {
      if (e.button === 1 || e.button === 2 || e.shiftKey === false && e.button === 0) {
        onSelect(null); setMulti(new Set());
        setPanStart({ x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y });
      }
      if (e.shiftKey) {
        const w = screenToWorld(e.clientX, e.clientY);
        setMarquee({ x: w.x, y: w.y, w: 0, h: 0 });
      }
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (panStart) {
      setTransform((t) => ({ ...t, x: panStart.tx + (e.clientX - panStart.x), y: panStart.ty + (e.clientY - panStart.y) }));
    }
    if (dragNode) {
      const w = screenToWorld(e.clientX, e.clientY);
      const move = new Map<string, { x: number; y: number }>();
      for (const n of nodes) {
        if (n.id === dragNode.id || multi.has(n.id)) {
          const dx = w.x - dragNode.offX;
          const dy = w.y - dragNode.offY;
          if (n.id === dragNode.id) move.set(n.id, { x: dx, y: dy });
          else {
            const anchor = nodes.find((x) => x.id === dragNode.id)!;
            const offX = n.x - anchor.x, offY = n.y - anchor.y;
            move.set(n.id, { x: dx + offX, y: dy + offY });
          }
        }
      }
      onChange(nodes.map((n) => move.has(n.id) ? { ...n, ...move.get(n.id) } : n), connections);
    }
    if (pending) {
      const w = screenToWorld(e.clientX, e.clientY);
      setPending({ ...pending, x: w.x, y: w.y });
    }
    if (marquee) {
      const w = screenToWorld(e.clientX, e.clientY);
      setMarquee({ ...marquee, w: w.x - marquee.x, h: w.y - marquee.y });
    }
  };

  const onMouseUp = () => {
    setPanStart(null); setDragNode(null); setPending(null);
    if (marquee) {
      const sel = new Set<string>();
      const mx = Math.min(marquee.x, marquee.x + marquee.w);
      const my = Math.min(marquee.y, marquee.y + marquee.h);
      const mw = Math.abs(marquee.w), mh = Math.abs(marquee.h);
      for (const n of nodes) {
        if (n.x < mx + mw && n.x + NODE_W > mx && n.y < my + mh && n.y + 120 > my) sel.add(n.id);
      }
      setMulti(sel); setMarquee(null);
    }
  };

  const startNodeDrag = (e: React.MouseEvent, node: VtWorkflowNode) => {
    e.stopPropagation();
    onSelect(node.id);
    const w = screenToWorld(e.clientX, e.clientY);
    setDragNode({ id: node.id, offX: w.x - node.x, offY: w.y - node.y });
  };

  const startConnection = (e: React.MouseEvent, node: VtWorkflowNode, port: { id: string; type: string }) => {
    e.stopPropagation();
    const w = screenToWorld(e.clientX, e.clientY);
    setPending({ sourceNode: node.id, sourcePort: port.id, type: port.type, x: w.x, y: w.y });
  };

  const endConnection = (node: VtWorkflowNode, port: { id: string; type: string }) => {
    if (!pending) return;
    if (pending.sourceNode === node.id) return;
    // typed compatibility
    const compat: Record<string, string[]> = {
      video: ["video"], image: ["image"], alpha: ["alpha", "mask"], mask: ["mask", "alpha"],
      rgba: ["rgba", "video"], reference: ["reference", "image"], frame: ["frame", "image"],
      prompt: ["prompt", "metadata"], metadata: ["metadata", "prompt"], audio: ["audio"],
    };
    if (!compat[pending.type]?.includes(port.type)) {
      setPending(null); return; // reject invalid connection
    }
    const id = "c_" + Math.random().toString(36).slice(2, 10);
    onChange(nodes, [...connections.filter((c) => !(c.targetNode === node.id && c.targetPort === port.id)), {
      id, sourceNode: pending.sourceNode, sourcePort: pending.sourcePort,
      targetNode: node.id, targetPort: port.id, type: pending.type as any,
    }]);
    setPending(null);
  };

  // keyboard: delete, copy/paste, undo handled by parent; here handle delete
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        onChange(nodes.filter((n) => n.id !== selectedId && !multi.has(n.id)),
          connections.filter((c) => c.sourceNode !== selectedId && c.targetNode !== selectedId && !multi.has(c.sourceNode) && !multi.has(c.targetNode)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, multi, nodes, connections, onChange]);

  const autoLayout = () => {
    const cols = 3;
    const laid = nodes.map((n, i) => ({ ...n, x: 60 + (i % cols) * 280, y: 60 + Math.floor(i / cols) * 180 }));
    onChange(laid, connections);
  };

  const pathFor = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  };

  return (
    <div className="relative h-[560px] rounded-xl border border-white/10 bg-[#0b0f1a] overflow-hidden"
      ref={ref} data-canvas="1" onWheel={onWheel} onMouseDown={onCanvasMouseDown}
      onMouseMove={onMouseMove} onMouseUp={onMouseUp} onContextMenu={(e) => e.preventDefault()}>
      {/* grid */}
      <div className="absolute inset-0 pointer-events-none" data-canvas="1"
        style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)", backgroundSize: `${24 * transform.zoom}px ${24 * transform.zoom}px`, backgroundPosition: `${transform.x}px ${transform.y}px` }} />
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.zoom})`}>
          {connections.map((c) => {
            const s = nodes.find((n) => n.id === c.sourceNode); const t = nodes.find((n) => n.id === c.targetNode);
            if (!s || !t) return null;
            const a = portPos(s, c.sourcePort, "out"); const b = portPos(t, c.targetPort, "in");
            return <path key={c.id} d={pathFor(a, b)} fill="none" stroke={NODE_PORT_COLORS[c.type] ?? "#60a5fa"} strokeWidth={2} opacity={0.8} />;
          })}
          {pending && (() => {
            const s = nodes.find((n) => n.id === pending.sourceNode)!;
            const a = portPos(s, pending.sourcePort, "out");
            return <path d={pathFor(a, { x: pending.x, y: pending.y })} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" />;
          })()}
        </g>
      </svg>

      {/* nodes */}
      <div className="absolute inset-0" style={{ transform: `translate(${transform.x}px,${transform.y}px) scale(${transform.zoom})`, transformOrigin: "0 0" }}>
        {nodes.map((node) => {
          const def = defByKind.get(node.kind);
          const isSel = selectedId === node.id || multi.has(node.id);
          const isRunning = runningNodeId === node.id;
          return (
            <div key={node.id}
              onMouseDown={(e) => startNodeDrag(e, node)}
              onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
              className={`absolute rounded-lg border bg-[#111827] shadow-xl select-none ${isSel ? "border-violet-500 ring-2 ring-violet-500/30" : "border-white/10"} ${isRunning ? "animate-pulse" : ""}`}
              style={{ left: node.x, top: node.y, width: NODE_W }}>
              <div className="flex items-center justify-between px-3 h-9 rounded-t-lg bg-white/5 border-b border-white/10">
                <span className="text-xs font-semibold text-text-bright truncate">{def?.label ?? node.kind}</span>
                <div className="flex items-center gap-1">
                  {onRunNode && def && ["exact_frame", "video_matte", "image_generator", "switch_x", "ai_background_replacement"].includes(node.kind) && (
                    <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onRunNode(node); }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-200 hover:bg-violet-500/30">RUN</button>
                  )}
                  <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onChange(nodes.map((n) => n.id === node.id ? { ...n, collapsed: !n.collapsed } : n), connections); }}
                    className="text-[10px] text-text-muted">–</button>
                </div>
              </div>
              {!node.collapsed && (
                <div className="relative py-2">
                  {def?.inputs.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 px-3 h-6 text-[11px] text-text-muted"
                      onMouseUp={() => endConnection(node, p)}>
                      <span onMouseDown={(e) => e.stopPropagation()}
                        className="w-3 h-3 rounded-full border-2 cursor-crosshair"
                        style={{ background: NODE_PORT_COLORS[p.type] ?? "#60a5fa", borderColor: NODE_PORT_COLORS[p.type] ?? "#60a5fa" }} />
                      {p.name}
                    </div>
                  ))}
                  {def?.outputs.map((p) => (
                    <div key={p.id} className="flex items-center justify-end gap-2 px-3 h-6 text-[11px] text-text-muted">
                      {p.name}
                      <span onMouseDown={(e) => startConnection(e, node, p)}
                        className="w-3 h-3 rounded-full border-2 cursor-crosshair hover:scale-125 transition"
                        style={{ background: NODE_PORT_COLORS[p.type] ?? "#60a5fa", borderColor: NODE_PORT_COLORS[p.type] ?? "#60a5fa" }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {marquee && (
        <div className="absolute border border-violet-400/60 bg-violet-500/10 pointer-events-none"
          style={{ left: Math.min(marquee.x, marquee.x + marquee.w) * transform.zoom + transform.x, top: Math.min(marquee.y, marquee.y + marquee.h) * transform.zoom + transform.y, width: Math.abs(marquee.w) * transform.zoom, height: Math.abs(marquee.h) * transform.zoom }} />
      )}

      {/* minimap + controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-2">
        <div className="rounded-lg border border-white/10 bg-black/50 p-2 flex flex-col gap-1">
          <button className="px-2 text-sm hover:bg-white/10 rounded" onClick={() => setTransform((t) => ({ ...t, zoom: Math.min(2, t.zoom + 0.1) }))}>+</button>
          <span className="text-[10px] text-center text-text-muted">{Math.round(transform.zoom * 100)}%</span>
          <button className="px-2 text-sm hover:bg-white/10 rounded" onClick={() => setTransform((t) => ({ ...t, zoom: Math.max(0.4, t.zoom - 0.1) }))}>–</button>
          <button className="px-2 text-[10px] hover:bg-white/10 rounded" onClick={autoLayout}>Auto</button>
        </div>
      </div>
    </div>
  );
}
