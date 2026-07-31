import type { FlowNode } from "@/lib/workflow";
import { NODE_TEMPLATES } from "@/lib/workflow";
import { cn } from "@/lib/cn";

const NODE_W = 220;
const NODE_H = 86;

const typeBadge: Record<string, string> = {
  TRIGGER: "bg-amber/20 text-amber border-amber/40",
  ACTION: "bg-azure/20 text-azure border-azure/40",
  AI: "bg-violet/20 text-violet border-violet/40",
  CONDITION: "bg-teal/20 text-teal border-teal/40",
  LOOP: "bg-fuchsia/20 text-fuchsia border-fuchsia/40",
  APPROVAL: "bg-emerald/20 text-emerald border-emerald/40",
  DELAY: "bg-slate-500/20 text-slate-400 border-slate-500/40",
  END: "bg-crimson/20 text-crimson border-crimson/40",
};
const statusDot: Record<string, string> = {
  SUCCEEDED: "bg-emerald",
  FAILED: "bg-crimson",
  RUNNING: "bg-azure animate-pulse",
  WAITING_APPROVAL: "bg-amber animate-pulse",
  SKIPPED: "bg-slate-500",
  PENDING: "bg-slate-600",
  RETRYING: "bg-fuchsia animate-pulse",
};

export function NodeCard({
  node,
  selected,
  status,
  error,
  onMouseDown,
  onStartConnect,
  onFinishConnect,
  onSelect,
  onDelete,
}: {
  node: FlowNode;
  selected: boolean;
  status?: string;
  error?: string | null;
  onMouseDown: (e: React.MouseEvent) => void;
  onStartConnect: (e: React.MouseEvent) => void;
  onFinishConnect: (e: React.MouseEvent) => void;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const tmpl = NODE_TEMPLATES.find((t) => t.type === node.type);
  const color = tmpl?.color ?? "#64748B";
  const summary = getSummary(node);
  return (
    <div
      data-block
      className={cn(
        "absolute rounded-xl border backdrop-blur-md bg-bg-card/90 transition-shadow select-none",
        selected
          ? "border-azure/60 shadow-[0_0_0_1px_rgba(59,130,246,0.4),0_10px_30px_-10px_rgba(59,130,246,0.5)]"
          : "border-white/10 hover:border-white/20 shadow-lg shadow-black/30"
      )}
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
      onMouseDown={(e) => { onSelect(); onMouseDown(e); }}
      onMouseUp={onFinishConnect}
    >
      {/* Color stripe */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: color }} />
      {/* Header */}
      <div className="pl-3 pr-2 pt-2 flex items-start gap-2">
        <div className="h-6 w-6 rounded-md grid place-items-center text-sm shrink-0" style={{ background: `${color}20`, color }}>
          {tmpl?.icon ?? "▭"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border" style={{ borderColor: `${color}50`, color, background: `${color}18` }}>
              {node.type}
            </span>
            {status && <span className={cn("h-2 w-2 rounded-full", statusDot[status] ?? "bg-slate-600")} title={status} />}
          </div>
          <div className="text-sm font-medium text-text-bright truncate mt-0.5">{node.label}</div>
        </div>
        {selected && (
          <button
            className="text-slate-500 hover:text-crimson text-xs h-6 w-6 grid place-items-center rounded"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Delete node"
          >
            ✕
          </button>
        )}
      </div>
      {/* Body */}
      <div className="pl-3 pr-2 pb-2 pt-1 text-[11px] text-text-muted truncate">
        {summary}
        {error && <div className="text-crimson truncate mt-0.5" title={error}>⚠ {error}</div>}
      </div>
      {/* Input handle (left) */}
      {node.type !== "TRIGGER" && (
        <div
          className="absolute -left-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-bg-card bg-slate-600 hover:bg-azure hover:scale-125 transition cursor-crosshair"
          onMouseUp={(e) => { e.stopPropagation(); onFinishConnect(e); }}
        />
      )}
      {/* Output handle (right) */}
      {node.type !== "END" && (
        <div
          className="absolute -right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-bg-card grid place-items-center cursor-crosshair hover:scale-125 transition"
          style={{ background: color }}
          onMouseDown={(e) => { e.stopPropagation(); onStartConnect(e); }}
        >
          <span className="h-1.5 w-1.5 bg-white rounded-full" />
        </div>
      )}
    </div>
  );
}

function getSummary(n: FlowNode): string {
  const c = n.config ?? {};
  switch (n.type) {
    case "TRIGGER": return c.trigger ?? "Manual start";
    case "ACTION": {
      const action = c.action ?? "log";
      if (action === "sendMessage") return `→ ${c.channelId ? "channel" : "(pick channel)"}: ${String(c.message ?? "").slice(0, 40) || "(empty)"}`;
      if (action === "createTask") return `Task: ${String(c.title ?? "").slice(0, 40) || "(untitled)"}`;
      if (action === "createActionItem") return `Action: ${String(c.title ?? "").slice(0, 40) || "(untitled)"}`;
      if (action === "httpRequest") return `${c.method ?? "GET"} ${String(c.url ?? "").slice(0, 36) || "(set url)"}`;
      if (action === "log") return `log: ${String(c.message ?? "").slice(0, 48) || "(empty)"}`;
      return action;
    }
    case "AI": return c.prompt ? String(c.prompt).slice(0, 48) : "(write prompt)";
    case "CONDITION": return `if ${String(c.expr ?? "true").slice(0, 48)}`;
    case "LOOP": return `for each in ${String(c.collectionPath ?? "items").slice(0, 40)}`;
    case "APPROVAL": return c.requireHuman ? "⏸ Wait for human" : "Auto-approve";
    case "DELAY": return `Wait ${Math.round((c.delayMs ?? 1000) / 100) / 10}s`;
    case "END": return "Workflow complete";
    default: return "";
  }
}
