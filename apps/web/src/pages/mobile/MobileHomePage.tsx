import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Bell, Bot, Calendar, FileText, MessageSquare, MonitorSmartphone, Nfc, Plus, Sparkles, Zap } from "lucide-react";
import { MobileTopBar } from "@/app/mobile/MobileTopBar";
import { MAvatar } from "@/components/mobile/MAvatar";
import { MButton } from "@/components/mobile/MButton";
import { MFab } from "@/components/mobile/MFab";
import { MBadge } from "@/components/mobile/MBadge";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const QUICK_ACTIONS = [
  { to: "/m/chat", label: "Ask Windels", icon: Sparkles, color: "from-azure-500 to-sky-500" },
  { to: "/m/agents", label: "AI Agents", icon: Bot, color: "from-violet-500 to-fuchsia-500" },
  { to: "/m/talk/meetings", label: "Meetings", icon: Calendar, color: "from-teal-500 to-emerald-500" },
  { to: "/m/files", label: "Files", icon: FileText, color: "from-amber-500 to-orange-500" },
  { to: "/m/nfc", label: "NFC Cards", icon: Nfc, color: "from-sky-500 to-cyan-500" },
  { to: "/m/cloud-android", label: "Cloud Android", icon: MonitorSmartphone, color: "from-emerald-500 to-teal-500" },
];

export function MobileHomePage() {
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<{ agents: number; convos: number; tasks: number } | null>(null);
  const [unread, setUnread] = useState(2);

  useEffect(() => {
    Promise.all([
      api.get<any[]>("/agents").catch(() => []),
      api.get<any[]>("/conversations").catch(() => []),
    ]).then(([agents, convos]) => {
      setStats({ agents: agents.length, convos: convos.length, tasks: 3 });
    });
  }, []);

  const displayName = user?.displayName?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  return (
    <div className="pb-4">
      <MobileTopBar
        title="WINDELS"
        subtitle="AI OS"
        left={<MAvatar name={displayName} color="#3B82F6" size="sm" />}
        right={
          <Link to="/m/notifications" className="relative h-10 w-10 grid place-items-center rounded-full active:bg-white/10 text-text-main">
            <Bell size={22} />
            {unread > 0 && <MBadge count={unread} className="absolute top-1.5 right-1.5" />}
          </Link>
        }
      />

      <div className="px-5 pt-5">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-azure-600/30 via-violet-600/20 to-fuchsia-600/20 border border-white/10">
          <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-azure-500/20 blur-3xl" />
          <div className="relative">
            <p className="text-xs text-azure-200/80 uppercase tracking-widest">{greeting()}</p>
            <h2 className="text-2xl font-bold text-white mt-1">Hey {displayName}.</h2>
            <p className="text-white/70 text-sm mt-1 max-w-[260px]">Your AI workforce is online and ready to help today.</p>
            <div className="mt-4 flex gap-2">
              <Link to="/m/chat">
                <MButton size="md">
                  <Zap size={16} /> Start a task
                </MButton>
              </Link>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="px-4 mt-6">
        <h3 className="text-sm font-semibold text-text-bright px-1 mb-3">Quick actions</h3>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {QUICK_ACTIONS.map((a) => (
            <Link key={a.to} to={a.to} className="flex flex-col items-center gap-2 active:scale-95 transition">
              <span className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${a.color} grid place-items-center text-white shadow-lg`}>
                <a.icon size={22} />
              </span>
              <span className="text-xs text-text-main">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="px-4 mt-6">
        <h3 className="text-sm font-semibold text-text-bright px-1 mb-3">Today</h3>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="AI Agents" value={stats?.agents ?? "—"} color="text-violet-400" icon={Bot} />
          <StatCard label="Chats" value={stats?.convos ?? "—"} color="text-azure-400" icon={MessageSquare} />
          <StatCard label="Active Tasks" value={stats?.tasks ?? "—"} color="text-emerald-400" icon={Zap} />
        </div>
      </div>

      <div className="px-4 mt-6">
        <h3 className="text-sm font-semibold text-text-bright px-1 mb-3">Recent activity</h3>
        <div className="bg-bg-elevated border border-white/10 rounded-2xl divide-y divide-white/5">
          {[
            { icon: Bot, color: "text-violet-400", title: "Research agent drafted a summary", time: "2m ago" },
            { icon: MessageSquare, color: "text-azure-400", title: "New message from Assistant", time: "14m ago" },
            { icon: Calendar, color: "text-teal-400", title: "Design review starts in 30 min", time: "now" },
          ].map((e, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <span className={`h-9 w-9 rounded-xl bg-white/5 grid place-items-center ${e.color}`}>
                <e.icon size={18} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] text-text-main truncate">{e.title}</p>
                <p className="text-xs text-text-muted">{e.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <MFab aria-label="Quick compose" onClick={() => { window.location.hash = "#/m/chat"; }}>
        <Plus size={26} strokeWidth={2.5} />
      </MFab>
    </div>
  );
}

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number | string; color: string; icon: any }) {
  return (
    <div className="bg-bg-elevated border border-white/10 rounded-2xl p-3">
      <Icon size={18} className={color} />
      <p className="text-2xl font-bold text-text-bright mt-2 leading-none">{value}</p>
      <p className="text-[11px] text-text-muted mt-1">{label}</p>
    </div>
  );
}
