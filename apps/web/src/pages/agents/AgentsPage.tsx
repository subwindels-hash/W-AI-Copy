import { useEffect, useMemo, useState } from "react";
import { agentsApi, type Agent } from "@/lib/agents";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { AgentEditor } from "@/components/agents/AgentEditor";
import { TaskAssignmentModal } from "@/components/agents/TaskAssignmentModal";

type ColorToken = { bg: string; ring: string; text: string; dot: string };
const colorMap: Record<string, ColorToken> = {
  azure:   { bg: "bg-azure/20",    ring: "ring-azure/40",    text: "text-azure",    dot: "bg-azure" },
  violet:  { bg: "bg-violet/20",   ring: "ring-violet/40",   text: "text-violet",   dot: "bg-violet" },
  teal:    { bg: "bg-teal/20",     ring: "ring-teal/40",     text: "text-teal",     dot: "bg-teal" },
  fuchsia: { bg: "bg-fuchsia/20",  ring: "ring-fuchsia/40",  text: "text-fuchsia",  dot: "bg-fuchsia" },
  amber:   { bg: "bg-amber/20",    ring: "ring-amber/40",    text: "text-amber",    dot: "bg-amber" },
  emerald: { bg: "bg-emerald/20",  ring: "ring-emerald/40",  text: "text-emerald",  dot: "bg-emerald" },
  crimson: { bg: "bg-crimson/20",  ring: "ring-crimson/40",  text: "text-crimson",  dot: "bg-crimson" },
};
const _azureEntry: ColorToken = { bg: "bg-azure/20", ring: "ring-azure/40", text: "text-azure", dot: "bg-azure" };
const DEFAULT_COLOR: ColorToken = _azureEntry;
function getColor(c: string | undefined): ColorToken {
  if (!c) return DEFAULT_COLOR;
  return colorMap[c] ?? DEFAULT_COLOR;
}

function statusColor(s: string) {
  switch (s) {
    case "working": return "bg-amber animate-pulse";
    case "online":  return "bg-emerald";
    case "error":   return "bg-crimson";
    case "paused":  return "bg-slate-400";
    case "offline": return "bg-slate-600";
    default:        return "bg-slate-500";
  }
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [assignFor, setAssignFor] = useState<Agent | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await agentsApi.list({ perPage: 100 });
      setAgents(res.items);
      if (!selectedId && res.items.length && res.items[0]) setSelectedId(res.items[0].id);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const selected = useMemo(() => agents.find((a) => a.id === selectedId) ?? null, [agents, selectedId]);
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return agents;
    return agents.filter((a) => (a.name + " " + a.role + " " + (a.description ?? "")).toLowerCase().includes(ql));
  }, [agents, q]);

  const totalOnline = agents.filter((a) => a.status === "online" || a.status === "working").length;
  const totalWorking = agents.filter((a) => a.status === "working").length;

  return (
    <div className="flex h-[calc(100vh-56px)] w-full">
      {/* Left: agent list */}
      <aside className="w-[320px] shrink-0 border-r border-white/10 bg-bg-dark/50 flex flex-col">
        <div className="p-4 border-b border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-text-bright">Workforce Hub</h1>
              <p className="text-xs text-text-muted">AI Employees</p>
            </div>
            <Button size="sm" onClick={() => setCreating(true)}>+ New</Button>
          </div>
          <Input placeholder="Search employees..." value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex gap-2 text-xs">
            <Badge variant="secondary">{agents.length} total</Badge>
            <Badge variant="success">{totalOnline} online</Badge>
            {totalWorking > 0 && <Badge variant="warning">{totalWorking} working</Badge>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading && <div className="p-4 text-text-muted text-sm">Loading…</div>}
          {filtered.map((a) => {
            const c = getColor(a.color);
            const active = a.id === selectedId;
            return (
              <motion.button
                key={a.id}
                whileHover={{ x: 2 }}
                onClick={() => setSelectedId(a.id)}
                className={cn(
                  "w-full text-left p-3 rounded-lg flex items-center gap-3 transition",
                  active ? "bg-white/10 ring-1 " + c.ring : "hover:bg-white/5"
                )}
              >
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 relative", c.bg)}>
                  <span>{a.emoji}</span>
                  <span className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-dark", statusColor(a.status))} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-bright truncate">{a.name}</span>
                    {a.isBuiltIn && <Badge variant="secondary" className="text-[10px]">built-in</Badge>}
                  </div>
                  <div className="text-xs text-text-muted truncate">{a.role} · {a.department}</div>
                  <div className="text-[11px] text-text-muted mt-0.5 flex gap-2">
                    <span>{a.stats?.tasks ?? 0} tasks</span>
                    <span>·</span>
                    <span>{a.stats?.memories ?? 0} memories</span>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </aside>

      {/* Right: editor */}
      <main className="flex-1 overflow-y-auto">
        {selected ? (
          <AgentEditor
            agent={selected}
            onSaved={(a) => { setAgents((prev) => prev.map((x) => x.id === a.id ? { ...x, ...a } : a)); }}
            onAssign={() => setAssignFor(selected)}
            onDeleted={() => { setAgents((prev) => prev.filter((x) => x.id !== selected.id)); setSelectedId(null); }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-text-muted">
            Select an AI employee or create a new one.
          </div>
        )}
      </main>

      {creating && (
        <AgentEditor
          creating
          onClose={() => setCreating(false)}
          onSaved={(a) => { setAgents((prev) => [a, ...prev]); setSelectedId(a.id); setCreating(false); }}
        />
      )}

      {assignFor && (
        <TaskAssignmentModal
          agent={assignFor}
          onClose={() => setAssignFor(null)}
          onAssigned={() => { setAssignFor(null); load(); }}
        />
      )}
    </div>
  );
}
