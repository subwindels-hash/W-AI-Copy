import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { MessageSquare, Users, FolderKanban, Zap, FileText, BarChart3, Video, GitBranch } from "lucide-react";

const items = [
  { to: "/app/chat",      label: "AI Chat",      icon: MessageSquare, color: "azure",   desc: "Start a conversation" },
  { to: "/app/workforce", label: "Workforce",    icon: Users,          color: "violet",  desc: "Manage AI employees" },
  { to: "/app/workspace", label: "Workspace",    icon: FolderKanban,   color: "teal",    desc: "Canvas & docs" },
  { to: "/app/flow",      label: "Flows",        icon: GitBranch,      color: "amber",   desc: "Automations" },
  { to: "/app/talk",      label: "Talk",         icon: Video,          color: "fuchsia", desc: "Meetings & messages" },
  { to: "/app/files",     label: "Files",        icon: FileText,       color: "emerald", desc: "Your documents" },
  { to: "/app/analytics", label: "Analytics",    icon: BarChart3,      color: "sky",     desc: "Insights" },
  { to: "/app/flow",      label: "Quick Action", icon: Zap,            color: "rose",    desc: "New automation" },
] as const;

const colorMap: Record<string,string> = {
  azure: "text-sky bg-azure/15", violet: "text-violet bg-violet/15",
  teal: "text-teal bg-teal/15", amber: "text-amber bg-amber/15",
  fuchsia: "text-fuchsia bg-fuchsia/15", emerald: "text-emerald bg-emerald/15",
  sky: "text-sky bg-sky/15", rose: "text-rose bg-rose/15",
};

export function QuickAccess() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {items.map((i) => (
        <Link key={i.to} to={i.to}>
          <Card className="hover:bg-bg-hover transition-colors cursor-pointer p-4 flex flex-col gap-2">
            <div className={`h-9 w-9 rounded-lg grid place-items-center ${colorMap[i.color]}`}>
              <i.icon className="h-4.5 w-4.5" />
            </div>
            <div className="font-semibold text-text-bright text-sm">{i.label}</div>
            <div className="text-[11px] text-text-muted">{i.desc}</div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
