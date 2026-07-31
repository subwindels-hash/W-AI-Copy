import { useEffect, useState } from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useAuthStore } from "@/store/auth";
import { useDashboard, type TaskStatus } from "@/lib/useDashboard";
import { AgentCard } from "./AgentCard";
import { TaskCard } from "./TaskCard";
import { ActivityFeed } from "./ActivityFeed";
import { QuickAccess } from "./QuickAccess";
import { CommandBar } from "./CommandBar";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function rotatingStatus(agents: number, tasks: number) {
  const lines = [
    `${agents} AI employees online`,
    `${tasks} active tasks`,
    "All systems operational",
    "Ready to assist",
  ];
  return lines[Math.floor(Date.now() / 4000) % lines.length]!;
}

export function UserDashboard() {
  const user = useAuthStore((s) => s.user);
  const { data, loading, error, fetch, updateTaskStatus } = useDashboard();
  const [, setTick] = useState(0);

  useEffect(() => {
    void fetch();
    const id = setInterval(() => setTick((t) => t + 1), 4000);
    return () => clearInterval(id);
  }, [fetch]);

  if (loading && !data) {
    return (
      <div className="h-[60vh] grid place-items-center">
        <div className="flex flex-col items-center gap-3 text-text-muted">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Loading workspace…</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-8 text-center">
        <CardTitle>Unable to load workspace</CardTitle>
        <CardDescription>{error ?? "Unknown error"}</CardDescription>
        <button
          onClick={() => void fetch()}
          className="mt-4 inline-flex items-center gap-2 text-sm text-azure hover:underline"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </Card>
    );
  }

  const activeTasks = data.tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED");
  const handleAdvance = (id: string, next: TaskStatus) => {
    void updateTaskStatus(id, next);
  };

  return (
    <div className="space-y-6">
      {/* ── Hero / Greeting ── */}
      <div className="relative overflow-hidden rounded-2xl p-8 glass">
        <div className="absolute inset-0 pointer-events-none">
          <div className="ambient-orb absolute -top-20 -right-10 h-[400px] w-[400px] rounded-full bg-azure/20 blur-3xl" />
          <div className="ambient-orb absolute -bottom-20 -left-10 h-[300px] w-[300px] rounded-full bg-violet/20 blur-3xl" />
        </div>
        <div className="relative">
          <Badge variant="azure" className="mb-3">
            <Sparkles className="h-3 w-3 mr-1" /> {rotatingStatus(data.stats.agentsOnline, data.stats.tasksActive)}
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold text-text-bright tracking-tight">
            {greeting()}, {user?.displayName ?? user?.email?.split("@")[0] ?? "there"}
          </h1>
          <p className="text-text-muted mt-2 max-w-2xl">
            Welcome to <span className="text-text-bright font-semibold">{data.workspace?.name ?? "your workspace"}</span> —
            your intelligent operating system is online. Your AI workforce is ready.
          </p>
        </div>
      </div>

      {/* ── Command bar ── */}
      <CommandBar />

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="AI Employees" value={data.stats.agentsTotal} sub={`${data.stats.agentsOnline} online`} accent="violet" />
        <KPI label="Active tasks" value={data.stats.tasksActive} sub="in progress" accent="amber" />
        <KPI label="Pending" value={data.stats.tasksPending} sub="in queue" accent="azure" />
        <KPI label="Completed" value={data.stats.tasksDone} sub="all time" accent="emerald" />
      </div>

      {/* ── Workforce Status Grid (Slice 6) ── */}
      <section>
        <SectionHeader title="AI Workforce" subtitle={`${data.stats.agentsOnline} of ${data.stats.agentsTotal} online`} />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {data.agents.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      </section>

      {/* ── Main grid: Tasks + Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active tasks (Slice 7) */}
        <div className="lg:col-span-2 space-y-3">
          <SectionHeader title="Active Tasks" subtitle={`${activeTasks.length} requiring attention`} />
          <div className="space-y-3">
            {activeTasks.length === 0 && (
              <Card>
                <CardDescription>No active tasks. Create one from the command bar above.</CardDescription>
              </Card>
            )}
            {activeTasks.slice(0, 6).map((t) => (
              <TaskCard key={t.id} task={t} onAdvance={handleAdvance} />
            ))}
          </div>
        </div>

        {/* Recent activity (Slice 8) */}
        <div>
          <SectionHeader title="Recent Activity" subtitle={`${data.activities.length} events`} />
          <ActivityFeed activities={data.activities} />
        </div>
      </div>

      {/* ── Quick Access (Slice 9) ── */}
      <section>
        <SectionHeader title="Quick Access" subtitle="Jump into any module" />
        <QuickAccess />
      </section>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-lg font-semibold text-text-bright tracking-tight">{title}</h2>
      {subtitle && <span className="text-xs text-text-muted">{subtitle}</span>}
    </div>
  );
}

function KPI({
  label, value, sub, accent,
}: { label: string; value: number; sub?: string; accent: "azure"|"violet"|"amber"|"emerald" }) {
  const colorMap = {
    azure: "from-azure/20 to-transparent text-sky",
    violet: "from-violet/20 to-transparent text-violet",
    amber: "from-amber/20 to-transparent text-amber",
    emerald: "from-emerald/20 to-transparent text-emerald",
  } as const;
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-br ${colorMap[accent]} pointer-events-none`} />
      <div className="relative">
        <div className="text-xs uppercase tracking-wider text-text-muted font-medium">{label}</div>
        <div className="text-2xl font-bold text-text-bright mt-1">{value}</div>
        {sub && <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>}
      </div>
    </Card>
  );
}
