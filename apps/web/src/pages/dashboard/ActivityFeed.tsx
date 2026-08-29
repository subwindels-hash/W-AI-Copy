import { cn } from "@/lib/cn";
import type { Activity } from "@/lib/useDashboard";
import { Avatar } from "@/components/ui/Avatar";

function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

const iconForType = (a: Activity) => {
  switch (a.type) {
    case "TASK_CREATED":     return "➕";
    case "TASK_COMPLETED":   return "✅";
    case "TASK_UPDATED":     return "🔄";
    case "USER_JOINED":      return "👋";
    case "AGENT_STATUS_CHANGED": return a.agent?.emoji ?? "🤖";
    case "FILE_UPLOADED":    return "📎";
    case "COMMENT_ADDED":    return "💬";
    case "NOTE_ADDED":       return "📝";
    case "WORKSPACE_UPDATED": return "⚙️";
    case "SYSTEM":
    default:                 return "•";
  }
};

export function ActivityFeed({ activities }: { activities: Activity[] }) {
  return (
    <div className="glass p-0 overflow-hidden">
      <div className="p-5 border-b border-white/5">
        <h3 className="text-lg font-semibold text-text-bright">Recent Activity</h3>
        <p className="text-sm text-text-muted mt-0.5">Live workspace events</p>
      </div>
      <ul className="divide-y divide-white/5 max-h-[520px] overflow-y-auto">
        {activities.length === 0 && (
          <li className="p-8 text-center text-text-muted text-sm">No activity yet.</li>
        )}
        {activities.map((a) => (
          <li key={a.id} className="p-4 flex items-start gap-3 hover:bg-white/5 transition-colors">
            <div className="shrink-0 h-8 w-8 rounded-full bg-white/5 grid place-items-center text-sm">
              {a.agent ? <span>{a.agent.emoji}</span> : iconForType(a)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-text-main leading-snug">
                {a.agent ? (
                  <span className="font-medium text-text-bright">{a.agent.name}</span>
                ) : a.user?.displayName ? (
                  <span className="font-medium text-text-bright">{a.user.displayName}</span>
                ) : a.user ? (
                  <span className="font-medium text-text-bright">{a.user.email}</span>
                ) : (
                  <span className="text-text-muted italic">System</span>
                )}{" "}
                <span className="text-text-muted">{a.message}</span>
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">{timeAgo(a.createdAt)} ago</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
