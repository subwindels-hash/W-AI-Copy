import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import type { WorkflowRunDetail } from "@/lib/workflow";
import { NODE_TEMPLATES } from "@/lib/workflow";

const statusStyle: Record<string, string> = {
  succeeded: "bg-emerald/20 text-emerald border-emerald/40",
  failed: "bg-crimson/20 text-crimson border-crimson/40",
  running: "bg-azure/20 text-azure border-azure/40 animate-pulse",
  waiting_approval: "bg-amber/20 text-amber border-amber/40",
  cancelled: "bg-slate-500/20 text-slate-400 border-slate-500/40",
  queued: "bg-slate-600/20 text-slate-400 border-slate-600/40",
};
const nodeStatusStyle: Record<string, string> = {
  SUCCEEDED: "text-emerald",
  FAILED: "text-crimson",
  RUNNING: "text-azure",
  WAITING_APPROVAL: "text-amber",
  SKIPPED: "text-slate-500",
  PENDING: "text-slate-600",
  RETRYING: "text-fuchsia",
};

export function RunPanel({
  run,
  onClose,
  onApprove,
  onCancel,
  onRerun,
}: {
  run: WorkflowRunDetail | null;
  onClose: () => void;
  onApprove?: (approved: boolean) => void;
  onCancel?: () => void;
  onRerun?: () => void;
}) {
  if (!run) return null;
  return (
    <div className="w-80 shrink-0 bg-bg-dark/70 border-l border-white/10 flex flex-col h-full">
      <div className="p-3 border-b border-white/10 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-text-muted">Run</div>
          <div className="text-sm font-semibold text-text-bright truncate">{run.workflowName}</div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white text-sm px-2">✕</button>
      </div>
      <div className="p-3 space-y-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className={cn("px-2 py-0.5 rounded-full border text-[11px]", statusStyle[run.status] ?? statusStyle.queued)}>{run.status}</span>
          <span className="text-[11px] text-text-muted">{run.triggerType}</span>
        </div>
        {run.startedAt && <div className="text-[11px] text-text-muted">Started {new Date(run.startedAt).toLocaleString()}</div>}
        {run.endedAt && <div className="text-[11px] text-text-muted">Ended {new Date(run.endedAt).toLocaleString()}</div>}
        {run.error && <div className="text-xs text-crimson rounded-md bg-crimson/10 border border-crimson/30 p-2">{run.error}</div>}
        <div className="flex gap-2 pt-1">
          {run.status === "waiting_approval" && onApprove && (
            <>
              <Button size="sm" variant="success" onClick={() => onApprove(true)}>Approve</Button>
              <Button size="sm" variant="danger" onClick={() => onApprove(false)}>Reject</Button>
            </>
          )}
          {(run.status === "running" || run.status === "waiting_approval" || run.status === "queued") && onCancel && (
            <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
          )}
          {(run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") && onRerun && (
            <Button size="sm" variant="secondary" onClick={onRerun}>Run again</Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">Nodes</div>
        {(run.nodeRuns ?? []).map((n, i) => {
          const tmpl = NODE_TEMPLATES.find((t) => t.type === n.type);
          return (
            <div key={i} className="rounded-md border border-white/10 bg-white/[0.02] p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm" style={{ color: tmpl?.color ?? "#94A3B8" }}>{tmpl?.icon ?? "▭"}</span>
                  <span className="text-xs font-medium text-text-bright truncate">{n.label}</span>
                </div>
                <span className={cn("text-[11px] font-medium", nodeStatusStyle[n.status] ?? "text-slate-400")}>{n.status.toLowerCase()}</span>
              </div>
              <div className="text-[10px] text-text-muted mt-1">
                {n.attempts > 1 && <span>{n.attempts} attempts · </span>}
                {n.durationMs}ms
              </div>
              {n.error && <div className="text-[11px] text-crimson mt-1 break-words">{n.error}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
