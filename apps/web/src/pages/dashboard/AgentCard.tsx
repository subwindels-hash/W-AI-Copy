import { cn } from "@/lib/cn";
import type { Agent } from "@/lib/useDashboard";

const colorVarMap: Record<string, { bg: string; text: string; ring: string; glow: string }> = {
  azure:   { bg: "bg-azure/15",   text: "text-sky",     ring: "ring-azure/40",   glow: "shadow-[0_0_20px_-4px_rgba(59,130,246,0.55)]" },
  violet:  { bg: "bg-violet/15",  text: "text-violet",  ring: "ring-violet/40",  glow: "shadow-[0_0_20px_-4px_rgba(139,92,246,0.55)]" },
  teal:    { bg: "bg-teal/15",    text: "text-teal",    ring: "ring-teal/40",    glow: "shadow-[0_0_20px_-4px_rgba(20,184,166,0.55)]" },
  fuchsia: { bg: "bg-fuchsia/15", text: "text-fuchsia", ring: "ring-fuchsia/40", glow: "shadow-[0_0_20px_-4px_rgba(217,70,239,0.55)]" },
  amber:   { bg: "bg-amber/15",   text: "text-amber",   ring: "ring-amber/40",   glow: "shadow-[0_0_20px_-4px_rgba(245,158,11,0.55)]" },
  emerald: { bg: "bg-emerald/15", text: "text-emerald", ring: "ring-emerald/40", glow: "shadow-[0_0_20px_-4px_rgba(16,185,129,0.55)]" },
  crimson: { bg: "bg-crimson/15", text: "text-crimson", ring: "ring-crimson/40", glow: "shadow-[0_0_20px_-4px_rgba(220,38,38,0.55)]" },
};

function StatusDot({ status }: { status: Agent["status"] }) {
  const color =
    status === "online"  ? "bg-emerald" :
    status === "working" ? "bg-amber animate-pulse" :
    status === "error"   ? "bg-crimson" : "bg-slate-400";
  return <span className={cn("inline-block h-2 w-2 rounded-full", color)} />;
}

export function AgentCard({ agent }: { agent: Agent }) {
  const c = colorVarMap[agent.color] ?? colorVarMap.azure!;
  const progressColor = {
    azure: "bg-azure", violet: "bg-violet", teal: "bg-teal",
    fuchsia: "bg-fuchsia", amber: "bg-amber", emerald: "bg-emerald", crimson: "bg-crimson",
  }[agent.color] ?? "bg-azure";
  return (
    <div className="glass p-4 flex flex-col gap-3 hover:bg-bg-hover transition-colors">
      <div className="flex items-start justify-between">
        <div className={cn("h-11 w-11 rounded-xl grid place-items-center text-xl ring-1", c.bg, c.ring)}>
          <span>{agent.emoji}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <StatusDot status={agent.status} />
          <span className="capitalize">{agent.status}</span>
        </div>
      </div>
      <div>
        <div className="font-semibold text-text-bright">{agent.name}</div>
        <div className={cn("text-[11px] uppercase tracking-wider font-medium mt-0.5", c.text)}>
          {agent.role}
        </div>
      </div>
      {agent.activeTask ? (
        <div className="space-y-1.5">
          <div className="text-xs text-text-muted truncate">{agent.activeTask.title}</div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className={cn("h-full rounded-full", progressColor)} style={{ width: `${agent.activeTask.progress}%` }} />
          </div>
        </div>
      ) : (
        <div className="text-xs text-text-muted italic">Idle</div>
      )}
    </div>
  );
}
