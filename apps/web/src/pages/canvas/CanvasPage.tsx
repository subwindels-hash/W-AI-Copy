import { useEffect, useRef, useState, useCallback } from "react";
import { canvasApi, type Canvas, type CanvasBlock, type CanvasConnection } from "@/lib/canvas";
import { canvasCollabApi, type CcPresence } from "@/lib/canvasCollab";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BlockRenderer } from "@/components/canvas/BlockRenderer";
import { ConnectionLayer } from "@/components/canvas/ConnectionLayer";
import { CanvasToolbar } from "@/components/canvas/CanvasToolbar";
import { AIBlockPopover } from "@/components/canvas/AIBlockPopover";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";

type Transform = { x: number; y: number; zoom: number };

type BlockDef = { w: number; h: number; color: string; emoji: string; label: string };
const BLOCK_DEFAULTS: Record<string, BlockDef> = {
  heading: { w: 360, h: 80,  color: "azure",   emoji: "H", label: "Heading" },
  text:    { w: 320, h: 200, color: "slate",   emoji: "T", label: "Text" },
  sticky:  { w: 240, h: 200, color: "amber",   emoji: "📝", label: "Sticky" },
  ai:      { w: 340, h: 240, color: "violet",  emoji: "✨", label: "AI Block" },
  embed:   { w: 420, h: 280, color: "teal",    emoji: "🔗", label: "Embed" },
  todo:    { w: 280, h: 220, color: "emerald", emoji: "✓", label: "To-do" },
};
const DEFAULT_BLOCK: BlockDef = { w: 320, h: 200, color: "slate", emoji: "▭", label: "Block" };

export default function CanvasPage() {
  const user = useAuthStore((state) => state.user);
  const [canvases, setCanvases] = useState<any[]>([]);
  const [canvasId, setCanvasId] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [presence, setPresence] = useState<CcPresence[]>([]);
  const [transform, setTransform] = useState<Transform>({ x: 80, y: 80, zoom: 1 });
  const [showSidebar, setShowSidebar] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ id: string; offX: number; offY: number } | null>(null);
  const [panState, setPanState] = useState<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [aiPopover, setAiPopover] = useState<{ x: number; y: number; blockId: string } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  async function loadList() {
    const res = await canvasApi.list({ perPage: 50 });
    setCanvases(res.items);
    if (!canvasId && res.items[0]) setCanvasId(res.items[0].id);
  }

  async function loadCanvas(id: string) {
    const c = await canvasApi.get(id);
    setCanvas(c);
    setTransform({ x: c.viewportX || 80, y: c.viewportY || 80, zoom: c.viewportZoom || 1 });
  }

  useEffect(() => { loadList(); }, []);
  useEffect(() => { if (canvasId) loadCanvas(canvasId); }, [canvasId]);

  // Presence heartbeat + active collaborator list. The API verifies canvas
  // organization access before touching the org-scoped Redis keys.
  useEffect(() => {
    if (!canvasId || !user) return;
    const displayName = user.displayName ?? user.email;
    const heartbeat = () => canvasCollabApi.heartbeat(canvasId, displayName).catch(() => {});
    const refreshPresence = () => canvasCollabApi.presence(canvasId).then(setPresence).catch(() => {});
    heartbeat(); refreshPresence();
    const beat = window.setInterval(heartbeat, 12_000);
    const refresh = window.setInterval(refreshPresence, 4_000);
    return () => {
      window.clearInterval(beat); window.clearInterval(refresh);
      void canvasCollabApi.leave(canvasId).catch(() => {});
      setPresence([]);
    };
  }, [canvasId, user]);

  // Collaboration fallback: refresh the shared document regularly. This works
  // across multiple API instances and is deliberately kept separate from local
  // drag state; WebSocket/CRDT transport can replace it without changing data.
  useEffect(() => {
    if (!canvasId) return;
    const refresh = () => loadCanvas(canvasId).catch(() => {});
    const timer = window.setInterval(refresh, 4000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [canvasId]);

  // Debounced viewport save
  useEffect(() => {
    if (!canvas) return;
    const t = setTimeout(() => {
      canvasApi.update(canvas.id, { viewportX: transform.x, viewportY: transform.y, viewportZoom: transform.zoom } as any).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [transform.x, transform.y, transform.zoom, canvas?.id]);

  async function createCanvas() {
    const title = newTitle.trim() || "Untitled Canvas";
    const c = await canvasApi.create({ title, access: "WORKSPACE" } as any);
    setNewTitle("");
    await loadList();
    setCanvasId(c.id);
  }

  async function createBlock(type: string, x = 200, y = 200) {
    if (!canvas) return;
    const def: BlockDef = BLOCK_DEFAULTS[type] ?? DEFAULT_BLOCK;
    const content: any =
      type === "heading" ? { text: "New heading" } :
      type === "text" ? { text: "Start writing..." } :
      type === "sticky" ? { text: "", color: def.color } :
      type === "ai" ? { prompt: "", result: "", streaming: false } :
      type === "embed" ? { url: "", title: "" } :
      type === "todo" ? { items: [{ text: "Task 1", done: false }] } : {};
    const b = await canvasApi.addBlock(canvas.id, { type: type as any, x, y, width: def.w, height: def.h, content } as any);
    setCanvas((c) => c ? { ...c, blocks: [...c.blocks, b] } : c);
    setSelectedId(b.id);
    if (type === "ai") setAiPopover({ x: x + def.w + 10, y, blockId: b.id });
  }

  async function updateBlock(blockId: string, patch: Partial<CanvasBlock>) {
    if (!canvas) return;
    // optimistic
    setCanvas((c) => c ? { ...c, blocks: c.blocks.map((b) => b.id === blockId ? { ...b, ...patch } : b) } : c);
    await canvasApi.updateBlock(canvas.id, blockId, patch);
  }

  async function deleteBlock(blockId: string) {
    if (!canvas) return;
    await canvasApi.deleteBlock(canvas.id, blockId);
    setCanvas((c) => c ? {
      ...c,
      blocks: c.blocks.filter((b) => b.id !== blockId),
      connections: c.connections.filter((conn) => conn.fromId !== blockId && conn.toId !== blockId),
    } : c);
    if (selectedId === blockId) setSelectedId(null);
  }

  async function deleteConnection(connId: string) {
    if (!canvas) return;
    await canvasApi.deleteConnection(canvas.id, connId);
    setCanvas((c) => c ? { ...c, connections: c.connections.filter((x) => x.id !== connId) } : c);
  }

  async function createConnection(fromId: string, toId: string) {
    if (!canvas || fromId === toId) return;
    // dedupe
    if (canvas.connections.some((c) => c.fromId === fromId && c.toId === toId)) return;
    const conn = await canvasApi.addConnection(canvas.id, { fromId, toId });
    setCanvas((c) => c ? { ...c, connections: [...c.connections, conn] } : c);
  }

  // Mouse handling for pan/drag/zoom
  const screenToCanvas = useCallback((sx: number, sy: number) => ({
    x: (sx - transform.x) / transform.zoom,
    y: (sy - transform.y) / transform.zoom,
  }), [transform]);

  function onCanvasMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-block]")) return;
    setSelectedId(null);
    setConnectingFrom(null);
    const rect = containerRef.current!.getBoundingClientRect();
    setPanState({ startX: e.clientX - rect.left, startY: e.clientY - rect.top, origX: transform.x, origY: transform.y });
  }
  function onCanvasMouseMove(e: React.MouseEvent) {
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (panState) {
      setTransform((t) => ({ ...t, x: panState.origX + (mx - panState.startX), y: panState.origY + (my - panState.startY) }));
    }
    if (dragState) {
      const cp = screenToCanvas(mx, my);
      updateBlock(dragState.id, { x: cp.x - dragState.offX, y: cp.y - dragState.offY });
    }
  }
  function onCanvasMouseUp() {
    setPanState(null);
    setDragState(null);
  }
  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const delta = -e.deltaY * 0.001;
    const newZoom = Math.min(2, Math.max(0.3, transform.zoom * (1 + delta)));
    // Zoom towards cursor
    const cx = (mx - transform.x) / transform.zoom;
    const cy = (my - transform.y) / transform.zoom;
    setTransform({ zoom: newZoom, x: mx - cx * newZoom, y: my - cy * newZoom });
  }

  function startBlockDrag(e: React.MouseEvent, block: CanvasBlock) {
    e.stopPropagation();
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const cp = screenToCanvas(mx, my);
    setDragState({ id: block.id, offX: cp.x - block.x, offY: cp.y - block.y });
    setSelectedId(block.id);
  }

  function onBlockHandleClick(e: React.MouseEvent, block: CanvasBlock, which: "out") {
    e.stopPropagation();
    if (which === "out") setConnectingFrom(block.id);
  }

  function onBlockMouseUp(e: React.MouseEvent, block: CanvasBlock) {
    if (connectingFrom && connectingFrom !== block.id) {
      createConnection(connectingFrom, block.id);
      setConnectingFrom(null);
    }
  }

  async function runAIBlock(blockId: string, prompt: string) {
    if (!canvas) return;
    // Optimistic: mark streaming
    const block = canvas.blocks.find((b) => b.id === blockId);
    if (!block) return;
    updateBlock(blockId, { content: { ...block.content, prompt, result: "", streaming: true } });
    try {
      const data = await canvasApi.generateBlock(canvas.id, blockId, { prompt });
      updateBlock(blockId, { content: { ...block.content, prompt, result: data.result, streaming: false } });
    } catch (error: any) {
      updateBlock(blockId, { content: { ...block.content, prompt, result: `Error: ${error?.message ?? "failed"}`, streaming: false } });
    }
  }

  if (!canvasId) {
    return (
      <div className="h-[calc(100vh-56px)] flex items-center justify-center flex-col gap-4">
        <h1 className="text-2xl font-semibold text-text-bright">Windels Workspace</h1>
        <p className="text-text-muted">Create your first canvas to get started.</p>
        <div className="flex gap-2">
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Canvas title" />
          <Button onClick={createCanvas}>Create Canvas</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-56px)] w-full overflow-hidden bg-[#0A0F1A] relative">
      {/* Sidebar */}
      <AnimatePresence>
        {showSidebar && (
          <motion.aside
            initial={{ width: 0 }} animate={{ width: 260 }} exit={{ width: 0 }}
            className="bg-bg-dark/60 border-r border-white/10 overflow-hidden shrink-0 flex flex-col"
          >
            <div className="p-3 border-b border-white/10">
              <Link to="/app" className="text-xs text-text-muted hover:text-text-main">← Dashboard</Link>
              <h2 className="text-sm font-semibold text-text-bright mt-2">Canvases</h2>
            </div>
            <div className="p-3 border-b border-white/10 flex gap-2">
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New canvas…" className="text-xs" />
              <Button size="sm" onClick={createCanvas}>+</Button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {canvases.map((c) => (
                <button key={c.id} onClick={() => setCanvasId(c.id)}
                  className={cn("w-full text-left p-2 rounded-lg text-sm transition",
                    canvasId === c.id ? "bg-white/10 ring-1 ring-azure/40" : "hover:bg-white/5")}>
                  <div className="font-medium text-text-bright truncate">{c.title}</div>
                  <div className="text-[11px] text-text-muted">{c.blocksCount} blocks · {c.connectionsCount} connections</div>
                </button>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Canvas area */}
      <div className="flex-1 relative flex flex-col">
        <CanvasToolbar
          canvas={canvas}
          showSidebar={showSidebar}
          onToggleSidebar={() => setShowSidebar((s) => !s)}
          onAddBlock={createBlock}
          transform={transform}
          setTransform={setTransform}
          onTitleChange={(t) => canvas && setCanvas({ ...canvas, title: t })}
          onTitleBlur={() => canvas && canvasApi.update(canvas.id, { title: canvas.title })}
        />
        <div className="absolute right-3 top-2 z-20 flex items-center gap-1 rounded-full border border-white/10 bg-bg-dark/80 px-2 py-1 text-[11px] text-text-muted backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-emerald" /> {presence.length} collaborator{presence.length === 1 ? "" : "s"}
          {presence.slice(0, 3).map((person) => <span key={person.userId} title={person.displayName} className="ml-1 grid h-5 w-5 place-items-center rounded-full text-[9px] text-white" style={{ backgroundColor: person.avatarColor }}>{person.displayName.slice(0, 1).toUpperCase()}</span>)}
        </div>

        <div
          ref={containerRef}
          className={cn("flex-1 relative overflow-hidden", panState ? "cursor-grabbing" : "cursor-grab")}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onMouseLeave={onCanvasMouseUp}
          onWheel={onWheel}
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
            backgroundSize: `${24 * transform.zoom}px ${24 * transform.zoom}px`,
            backgroundPosition: `${transform.x}px ${transform.y}px`,
          }}
        >
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})` }}
          >
            {/* Connections */}
            <ConnectionLayer
              blocks={canvas?.blocks ?? []}
              connections={canvas?.connections ?? []}
              connectingFrom={connectingFrom}
              onDeleteConnection={deleteConnection}
            />
            {/* Blocks */}
            {(canvas?.blocks ?? []).map((b) => (
              <BlockRenderer
                key={b.id}
                block={b}
                selected={selectedId === b.id}
                connecting={connectingFrom === b.id}
                onMouseDown={(e) => startBlockDrag(e, b)}
                onMouseUp={(e) => onBlockMouseUp(e, b)}
                onChange={(patch) => updateBlock(b.id, patch)}
                onDelete={() => deleteBlock(b.id)}
                onRunAI={() => setAiPopover({ x: b.x + b.width + 10, y: b.y, blockId: b.id })}
                onHandleOut={(e) => onBlockHandleClick(e, b, "out")}
                onCancelConnect={() => setConnectingFrom(null)}
              />
            ))}
          </div>

          {/* Empty state */}
          {canvas && canvas.blocks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-lg text-text-bright font-medium">Blank canvas</p>
                <p className="text-sm text-text-muted mt-1">Use the toolbar to add blocks. Drag to pan, Ctrl+scroll to zoom.</p>
              </div>
            </div>
          )}
        </div>

        {/* AI popover */}
        <AnimatePresence>
          {aiPopover && canvas && (
            <AIBlockPopover
              x={aiPopover.x}
              y={aiPopover.y}
              block={canvas.blocks.find((b) => b.id === aiPopover.blockId)!}
              onClose={() => setAiPopover(null)}
              onGenerate={(prompt) => { runAIBlock(aiPopover.blockId, prompt); setAiPopover(null); }}
            />
          )}
        </AnimatePresence>

        {connectingFrom && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-azure/20 border border-azure/40 text-azure text-xs px-3 py-1.5 rounded-full">
            Click another block to connect · Press Esc to cancel
          </div>
        )}
      </div>
    </div>
  );
}
