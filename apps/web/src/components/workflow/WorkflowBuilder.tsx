import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { NodePalette } from "./NodePalette";
import { NodeCard } from "./NodeCard";
import { FlowConnectionLayer } from "./FlowConnectionLayer";
import { NodeInspector } from "./NodeInspector";
import { RunPanel } from "./RunPanel";
import {
  createWorkflow,
  getWorkflow,
  listWorkflows,
  newEdgeId,
  newNodeId,
  updateWorkflow,
  runWorkflow as runWorkflowApi,
  getRun,
  cancelRun as cancelRunApi,
  approveRun as approveRunApi,
  type FlowEdge,
  type FlowNode,
  type WorkflowDetail,
  type WorkflowRunDetail,
  type WorkflowSummary,
  NODE_TEMPLATES,
} from "@/lib/workflow";
import { cn } from "@/lib/cn";
import { motion, AnimatePresence } from "framer-motion";

type Transform = { x: number; y: number; zoom: number };

interface Props {
  workflowId?: string | null;
  onOpenWorkflow: (id: string) => void;
  onBack?: () => void;
}

export function WorkflowBuilder({ workflowId, onOpenWorkflow, onBack }: Props) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [title, setTitle] = useState("Untitled Flow");
  const [description, setDescription] = useState("");
  const [transform, setTransform] = useState<Transform>({ x: 60, y: 120, zoom: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ id: string; offX: number; offY: number } | null>(null);
  const [panState, setPanState] = useState<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [leftPanel, setLeftPanel] = useState<"palette" | "list" | "runs">("palette");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [running, setRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState<WorkflowRunDetail | null>(null);
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load list
  const loadList = useCallback(async () => {
    const r = await listWorkflows({ perPage: 50 });
    setWorkflows(r.items);
  }, []);

  // Load channels for action config
  useEffect(() => {
    fetch("/api/v1/talk/channels?perPage=50", { headers: { Authorization: `Bearer ${localStorage.getItem("windels:accessToken") ?? ""}` } })
      .then((r) => r.json())
      .then((d) => setChannels((d.data?.items ?? []).map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
    loadList();
  }, [loadList]);
  // Load workflow
  useEffect(() => {
    if (!workflowId) { setWorkflow(null); setNodes([]); setEdges([]); setTitle("Untitled Flow"); setDescription(""); setSelectedId(null); return; }
    getWorkflow(workflowId).then((w) => {
      setWorkflow(w);
      setNodes(w.nodes);
      setEdges(w.edges);
      setTitle(w.name);
      setDescription(w.description ?? "");
      setSelectedId(null);
      setCurrentRun(null);
    });
  }, [workflowId]);

  // Auto-save with debounce
  useEffect(() => {
    if (!workflow || !dirty) return;
    const t = setTimeout(async () => {
      setSaving(true);
      try {
        await updateWorkflow(workflow.id, { name: title, description, nodes, edges });
        setDirty(false);
        loadList();
      } finally { setSaving(false); }
    }, 600);
    return () => clearTimeout(t);
  }, [nodes, edges, title, description, dirty, workflow, loadList]);

  // Key handling
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setSelectedId(null); setConnectingFrom(null); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && (e.target as HTMLElement)?.tagName !== "INPUT" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") {
        deleteNode(selectedId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function createNew() {
    const node = newNodeId();
    const starterNodes: FlowNode[] = [
      { id: node, type: "TRIGGER", x: 40, y: 80, label: "Manual Start", config: { trigger: "manual" } },
    ];
    const w = await createWorkflow({ name: "New Workflow", nodes: starterNodes, edges: [] });
    onOpenWorkflow(w.id);
  }

  async function save() {
    if (!workflow) return;
    setSaving(true);
    try {
      await updateWorkflow(workflow.id, { name: title, description, nodes, edges });
      setDirty(false);
      loadList();
      showToast("Saved");
    } finally { setSaving(false); }
  }

  async function activate() {
    if (!workflow) return;
    await updateWorkflow(workflow.id, { status: workflow.status === "active" ? "DRAFT" : "ACTIVE" });
    const fresh = await getWorkflow(workflow.id);
    setWorkflow(fresh);
    showToast(fresh.status === "active" ? "Activated" : "Set to draft");
  }

  async function run() {
    if (!workflow) return;
    setRunning(true);
    try {
      // Make sure latest is saved
      await updateWorkflow(workflow.id, { name: title, description, nodes, edges });
      const r = await runWorkflowApi(workflow.id, { input: { startedAt: new Date().toISOString() } });
      // Poll a few times
      let detail: WorkflowRunDetail | null = null;
      for (let i = 0; i < 20; i++) {
        detail = await getRun(r.runId);
        setCurrentRun(detail);
        if (detail.status !== "running" && detail.status !== "queued") break;
        await new Promise((res) => setTimeout(res, 500));
      }
      loadList();
    } catch (e: any) {
      showToast(`Run failed: ${e?.message ?? e}`);
    } finally { setRunning(false); }
  }

  async function approveCurrent(approved: boolean) {
    if (!currentRun) return;
    await approveRunApi(currentRun.id, approved);
    const d = await getRun(currentRun.id);
    setCurrentRun(d);
  }
  async function cancelCurrent() {
    if (!currentRun) return;
    await cancelRunApi(currentRun.id);
    const d = await getRun(currentRun.id);
    setCurrentRun(d);
  }

  function addNode(n: FlowNode) { setNodes((prev) => [...prev, n]); setDirty(true); setSelectedId(n.id); }
  function deleteNode(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.fromId !== id && e.toId !== id));
    setSelectedId(null); setDirty(true);
  }
  function deleteEdge(id: string) { setEdges((prev) => prev.filter((e) => e.id !== id)); setDirty(true); }
  function updateNode(id: string, patch: Partial<FlowNode>) {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, ...patch, config: patch.config ? { ...n.config, ...patch.config } : n.config } : n));
    setDirty(true);
  }
  function setEdgeCondition(edgeId: string, condition: "true" | "false" | "") {
    setEdges((prev) => prev.map((e) => e.id === edgeId ? { ...e, condition: condition || undefined, label: condition || undefined } : e));
    setDirty(true);
  }

  const screenToCanvas = useCallback((sx: number, sy: number) => ({
    x: (sx - transform.x) / transform.zoom,
    y: (sy - transform.y) / transform.zoom,
  }), [transform]);

  function onCanvasMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-block]")) return;
    setSelectedId(null);
    const rect = containerRef.current!.getBoundingClientRect();
    setPanState({ startX: e.clientX - rect.left, startY: e.clientY - rect.top, origX: transform.x, origY: transform.y });
  }
  function onCanvasMouseMove(e: React.MouseEvent) {
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (panState) setTransform((t) => ({ ...t, x: panState.origX + (mx - panState.startX), y: panState.origY + (my - panState.startY) }));
    if (dragState) {
      const cp = screenToCanvas(mx, my);
      updateNode(dragState.id, { x: cp.x - dragState.offX, y: cp.y - dragState.offY });
    }
    if (connectingFrom) setMousePos(screenToCanvas(mx, my));
  }
  function onCanvasMouseUp() {
    setPanState(null); setDragState(null);
  }
  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const delta = -e.deltaY * 0.001;
    const newZoom = Math.min(2, Math.max(0.3, transform.zoom * (1 + delta)));
    const cx = (mx - transform.x) / transform.zoom;
    const cy = (my - transform.y) / transform.zoom;
    setTransform({ zoom: newZoom, x: mx - cx * newZoom, y: my - cy * newZoom });
  }
  function startNodeDrag(e: React.MouseEvent, node: FlowNode) {
    e.stopPropagation();
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const cp = screenToCanvas(mx, my);
    setDragState({ id: node.id, offX: cp.x - node.x, offY: cp.y - node.y });
    setSelectedId(node.id);
  }
  function startConnect(e: React.MouseEvent, node: FlowNode) {
    e.stopPropagation();
    setConnectingFrom(node.id);
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    setMousePos(screenToCanvas(mx, my));
  }
  function finishConnect(e: React.MouseEvent, node: FlowNode) {
    e.stopPropagation();
    if (connectingFrom && connectingFrom !== node.id) {
      if (!edges.some((x) => x.fromId === connectingFrom && x.toId === node.id)) {
        setEdges((prev) => [...prev, { id: newEdgeId(), fromId: connectingFrom, toId: node.id }]);
        setDirty(true);
      }
    }
    setConnectingFrom(null);
    setMousePos(null);
  }

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);
  const nodeStatuses = useMemo(() => {
    if (!currentRun) return {};
    const map: Record<string, { status: string; error?: string | null }> = {};
    for (const n of currentRun.nodeRuns ?? []) map[n.nodeId] = { status: n.status, error: n.error };
    return map;
  }, [currentRun]);

  return (
    <div className="flex h-[calc(100vh-56px)] w-full overflow-hidden bg-[#0A0F1A] relative">
      {/* Left panel */}
      <div className="w-64 shrink-0 bg-bg-dark/60 border-r border-white/10 flex flex-col">
        <div className="flex border-b border-white/10">
          {([["palette","Nodes"],["list","Flows"],["runs","Runs"]] as const).map(([k,lbl]) => (
            <button key={k} onClick={() => setLeftPanel(k)} className={cn("flex-1 py-2 text-xs font-medium", leftPanel === k ? "text-text-bright border-b-2 border-azure" : "text-text-muted hover:text-text-main")}>{lbl}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {leftPanel === "palette" && <NodePalette onAdd={addNode} />}
          {leftPanel === "list" && (
            <div className="p-3 space-y-2">
              <Button size="sm" className="w-full" onClick={createNew}>+ New workflow</Button>
              <div className="space-y-1 mt-2">
                {workflows.map((w) => (
                  <button key={w.id} onClick={() => onOpenWorkflow(w.id)} className={cn("w-full text-left p-2 rounded-lg border text-sm transition", workflow?.id === w.id ? "bg-white/10 border-azure/40" : "bg-white/[0.02] border-white/5 hover:bg-white/5")}>
                    <div className="font-medium text-text-bright truncate">{w.name}</div>
                    <div className="text-[11px] text-text-muted">{w.runsCount} runs · {w.successCount} ok · {w.failureCount} fail</div>
                  </button>
                ))}
                {workflows.length === 0 && <div className="text-xs text-text-muted">No workflows yet. Create one to get started.</div>}
              </div>
            </div>
          )}
          {leftPanel === "runs" && (
            <div className="p-3">
              <p className="text-xs text-text-muted">After running a workflow, execution details appear in the right panel.</p>
            </div>
          )}
        </div>
      </div>

      {/* Main canvas area */}
      <div className="flex-1 relative flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="h-12 px-3 border-b border-white/10 bg-bg-dark/40 flex items-center gap-2 shrink-0">
          {onBack && <button onClick={onBack} className="text-text-muted hover:text-white text-sm px-2">←</button>}
          <Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="h-8 max-w-xs !bg-transparent border-0 text-sm font-semibold px-1" />
          <span className="text-[11px] text-text-muted">
            {saving ? "saving…" : dirty ? "unsaved changes" : "saved"} · {nodes.length} nodes · {edges.length} edges
          </span>
          <div className="flex-1" />
          {workflow && (
            <>
              <span className={cn("text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border",
                workflow.status === "active" ? "text-emerald border-emerald/40 bg-emerald/10"
                : workflow.status === "paused" ? "text-amber border-amber/40 bg-amber/10"
                : "text-text-muted border-white/10 bg-white/5")}>{workflow.status}</span>
              <Button size="sm" variant="outline" onClick={activate}>{workflow.status === "active" ? "Pause" : "Activate"}</Button>
              <Button size="sm" variant="secondary" onClick={save} loading={saving}>Save</Button>
              <Button size="sm" onClick={run} loading={running}>▶ Run</Button>
            </>
          )}
        </div>

        {/* Canvas */}
        <div
          ref={containerRef}
          className={cn("flex-1 relative overflow-hidden", panState ? "cursor-grabbing" : "cursor-grab")}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onMouseLeave={onCanvasMouseUp}
          onWheel={onWheel}
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)",
            backgroundSize: `${24 * transform.zoom}px ${24 * transform.zoom}px`,
            backgroundPosition: `${transform.x}px ${transform.y}px`,
          }}
        >
          {!workflow && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-sm">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-azure to-violet grid place-items-center mx-auto mb-4 text-white text-2xl">⚡</div>
                <h1 className="text-xl font-semibold text-text-bright">Windels Flow</h1>
                <p className="text-sm text-text-muted mt-1">Build automations visually — connect triggers, AI steps, actions, conditions, and approvals.</p>
                <Button className="mt-4" onClick={createNew}>Create your first workflow</Button>
              </div>
            </div>
          )}

          <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})` }}>
            <FlowConnectionLayer
              nodes={nodes}
              edges={edges}
              onDeleteEdge={deleteEdge}
              connectingFrom={connectingFrom}
              mousePos={mousePos}
              nodeStatuses={nodeStatuses}
            />
            {nodes.map((n) => (
              <NodeCard
                key={n.id}
                node={n}
                selected={selectedId === n.id}
                status={nodeStatuses[n.id]?.status}
                error={nodeStatuses[n.id]?.error}
                onMouseDown={(e) => startNodeDrag(e, n)}
                onStartConnect={(e) => startConnect(e, n)}
                onFinishConnect={(e) => finishConnect(e, n)}
                onSelect={() => setSelectedId(n.id)}
                onDelete={() => deleteNode(n.id)}
              />
            ))}
          </div>

          {/* Zoom indicator */}
          <div className="absolute bottom-3 left-3 text-[11px] text-text-muted bg-bg-dark/60 border border-white/10 rounded px-2 py-1">{Math.round(transform.zoom * 100)}%</div>
        </div>
      </div>

      {/* Right panel: inspector or run */}
      <AnimatePresence>
        {(selectedNode || currentRun) && (
          <motion.aside
            initial={{ width: 0 }} animate={{ width: 320 }} exit={{ width: 0 }}
            className="bg-bg-dark/70 border-l border-white/10 shrink-0 overflow-hidden"
          >
            {currentRun ? (
              <RunPanel
                run={currentRun}
                onClose={() => setCurrentRun(null)}
                onApprove={approveCurrent}
                onCancel={cancelCurrent}
                onRerun={run}
              />
            ) : selectedNode && (
              <div className="flex flex-col h-full">
                <div className="p-3 border-b border-white/10 flex items-center justify-between">
                  <div className="text-sm font-semibold text-text-bright">Inspector</div>
                  <button onClick={() => setSelectedId(null)} className="text-slate-500 hover:text-white text-sm px-2">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <NodeInspector
                    node={selectedNode}
                    edges={edges}
                    channels={channels}
                    onChange={(p) => updateNode(selectedNode.id, p)}
                    onDelete={() => deleteNode(selectedNode.id)}
                    onAddEdgeCondition={setEdgeCondition}
                  />
                </div>
              </div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-bg-dark/90 border border-white/10 text-text-bright text-sm px-4 py-2 rounded-lg shadow-xl">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {connectingFrom && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-azure/20 border border-azure/40 text-azure text-xs px-3 py-1.5 rounded-full">
          Click another node's input handle to connect · Esc to cancel
        </div>
      )}
    </div>
  );
}
