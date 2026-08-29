import { cn } from "@/lib/cn";
import { CheckCircle2, Circle, Clock, Play, AlertCircle, X } from "lucide-react";
import type { Task, TaskStatus } from "@/lib/useDashboard";

const priorityMap = {
  LOW:     { label: "Low",    className: "text-slate-400 bg-white/5" },
  MEDIUM:  { label: "Medium", className: "text-sky bg-azure/15" },
  HIGH:    { label: "High",   className: "text-amber bg-amber/15" },
  URGENT:  { label: "Urgent", className: "text-crimson bg-crimson/15" },
} as const;

const statusMap: Record<TaskStatus, { icon: any; label: string; dot: string }> = {
  TODO:        { icon: Circle,      label: "To do",     dot: "bg-slate-400" },
  IN_PROGRESS: { icon: Play,        label: "In progress", dot: "bg-amber" },
  BLOCKED:     { icon: AlertCircle, label: "Blocked",  dot: "bg-crimson" },
  DONE:        { icon: CheckCircle2,label: "Done",     dot: "bg-emerald" },
  CANCELLED:   { icon: X,           label: "Cancelled",dot: "bg-slate-500" },
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function TaskCard({ task, onAdvance }: { task: Task; onAdvance: (id: string, next: TaskStatus) => void }) {
  const s = statusMap[task.status];
  const p = priorityMap[task.priority];
  const Icon = s.icon;
  const agentColorMap: Record<string,string> = {
    azure:"text-sky bg-azure/15", violet:"text-violet bg-violet/15", teal:"text-teal bg-teal/15",
    fuchsia:"text-fuchsia bg-fuchsia/15", amber:"text-amber bg-amber/15", emerald:"text-emerald bg-emerald/15",
  };
  const isDone = task.status === "DONE";
  return (
    <div className={cn(
      "group glass p-4 flex items-start gap-4 transition-all",
      isDone && "opacity-60"
    )}>
      <button
        onClick={() => onAdvance(task.id, isDone ? "TODO" : task.status === "TODO" ? "IN_PROGRESS" : "DONE")}
        className="mt-0.5 text-text-muted hover:text-emerald transition-colors"
        title={`Advance to next status`}
      >
        <Icon className={cn("h-5 w-5", isDone && "text-emerald")} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className={cn("font-medium text-text-bright truncate", isDone && "line-through")}>
            {task.title}
          </div>
          <span className={cn("shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide", p.className)}>
            {p.label}
          </span>
        </div>
        {task.description && (
          <p className="text-xs text-text-muted mt-1 line-clamp-2">{task.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2.5 text-[11px] text-text-muted">
          <span className={cn("inline-flex items-center gap-1 capitalize")}>
            <span className={cn("inline-block h-1.5 w-1.5 rounded-full", s.dot)} /> {s.label}
          </span>
          {task.dueDate && (
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(task.dueDate).toLocaleDateString()}</span>
          )}
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {timeAgo(task.createdAt)}</span>
          {task.agent && (
            <span className={cn("ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded", agentColorMap[task.agent.color] ?? "bg-white/5")}>
              <span>{task.agent.emoji}</span> {task.agent.name}
            </span>
          )}
        </div>
        {task.status === "IN_PROGRESS" && (
          <div className="h-1 bg-white/5 rounded-full mt-2.5 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-azure to-violet" style={{ width: `${task.progress}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
