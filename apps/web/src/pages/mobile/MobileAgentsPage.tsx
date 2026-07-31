import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Plus, Zap } from "lucide-react";
import { MobileTopBar } from "@/app/mobile/MobileTopBar";
import { MAvatar } from "@/components/mobile/MAvatar";
import { MFab } from "@/components/mobile/MFab";
import { MEmptyState } from "@/components/mobile/MEmptyState";
import { api } from "@/lib/api";
import { useHaptics } from "@/app/mobile/hooks/useHaptics";

type Agent = { id: string; name: string; role?: string; color?: string; status?: string; description?: string; tasksCompleted?: number };

const ROLE_COLORS: Record<string, string> = {
  executor: "#3B82F6", researcher: "#8B5CF6", analyst: "#14B8A6",
  creative: "#D946EF", coordinator: "#F59E0B", default: "#3B82F6",
};

export function MobileAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const h = useHaptics();

  useEffect(() => {
    api.get<Agent[]>("/agents").then((a) => { setAgents(a); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="pb-4">
      <MobileTopBar title="AI Employees" subtitle={`${agents.length} active`} />

      <div className="px-4 pt-4 grid grid-cols-2 gap-3">
        <StatBox label="Online" value={String(agents.filter((a) => a.status !== "error").length)} color="text-emerald-400" />
        <StatBox label="Tasks today" value="—" color="text-azure-400" />
      </div>

      <div className="px-4 pt-5 space-y-2">
        {!loading && agents.length === 0 && (
          <MEmptyState icon={<Bot size={48} />} title="No AI employees yet" message="Create your first AI employee to start delegating tasks." action="Create agent" onAction={() => {}} />
        )}
        {agents.map((a) => (
          <Link
            key={a.id}
            to={`/m/chat?agent=${a.id}`}
            onClick={() => h.light()}
            className="flex items-center gap-3 p-3 rounded-2xl bg-bg-elevated border border-white/10 active:bg-white/5"
          >
            <MAvatar name={a.name} color={a.color || ROLE_COLORS[a.role || "default"]} size="lg" status={(a.status as any) || "online"} />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-text-bright truncate">{a.name}</p>
              <p className="text-xs text-text-muted capitalize truncate">{a.role || "Executor"} · {a.description ?? "Ready to help"}</p>
              <div className="flex items-center gap-1 mt-1">
                <Zap size={12} className="text-amber-400" />
                <span className="text-[11px] text-text-muted">{a.tasksCompleted ?? 0} tasks completed</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <MFab aria-label="New agent" onClick={() => {}}>
        <Plus size={24} strokeWidth={2.5} />
      </MFab>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-bg-elevated border border-white/10 rounded-2xl p-4">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-text-muted mt-1">{label}</p>
    </div>
  );
}
