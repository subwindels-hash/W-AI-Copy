import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot, Plus, Zap } from "lucide-react";
import { MobileTopBar } from "@/app/mobile/MobileTopBar";
import { MAvatar } from "@/components/mobile/MAvatar";
import { MFab } from "@/components/mobile/MFab";
import { MEmptyState } from "@/components/mobile/MEmptyState";
import { agentsApi, type Agent } from "@/lib/agents";
import { useHaptics } from "@/app/mobile/hooks/useHaptics";

const ROLE_COLORS: Record<string, string> = {
  executor: "#3B82F6", researcher: "#8B5CF6", analyst: "#14B8A6",
  creative: "#D946EF", coordinator: "#F59E0B", default: "#3B82F6",
};

export function MobileAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const h = useHaptics();
  const navigate = useNavigate();

  useEffect(() => {
    agentsApi.list({ perPage: 100 })
      .then((result) => setAgents(result.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const online = agents.filter((agent) => agent.status === "online" || agent.status === "working").length;
  const assignedTasks = agents.reduce((sum, agent) => sum + (agent.stats?.tasks ?? 0), 0);

  return (
    <div className="pb-4">
      <MobileTopBar title="AI Employees" subtitle={`${agents.length} total`} />

      <div className="px-4 pt-4 grid grid-cols-2 gap-3">
        <StatBox label="Online" value={String(online)} color="text-emerald-400" />
        <StatBox label="Assigned tasks" value={String(assignedTasks)} color="text-azure-400" />
      </div>

      <div className="px-4 pt-5 space-y-2">
        {!loading && agents.length === 0 && (
          <MEmptyState icon={<Bot size={48} />} title="No AI employees yet" message="Create your first AI employee in the Workforce Hub." action="Open Workforce Hub" onAction={() => navigate("/app/workforce")} />
        )}
        {agents.map((agent) => (
          <Link
            key={agent.id}
            to={`/m/chat?agent=${agent.id}`}
            onClick={() => h.light()}
            className="flex items-center gap-3 p-3 rounded-2xl bg-bg-elevated border border-white/10 active:bg-white/5"
          >
            <MAvatar name={agent.name} color={agent.color || ROLE_COLORS[agent.role.toLowerCase()] || ROLE_COLORS.default} size="lg" status={agent.status === "paused" ? "idle" : agent.status} />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-text-bright truncate">{agent.name}</p>
              <p className="text-xs text-text-muted capitalize truncate">{agent.role} · {agent.description ?? "Ready to help"}</p>
              <div className="flex items-center gap-1 mt-1">
                <Zap size={12} className="text-amber-400" />
                <span className="text-[11px] text-text-muted">{agent.stats?.tasks ?? 0} assigned tasks</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <MFab aria-label="Open Workforce Hub" onClick={() => navigate("/app/workforce")}>
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
