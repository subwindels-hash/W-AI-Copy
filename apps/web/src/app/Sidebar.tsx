import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  MessagesSquare,
  SquareDashedMousePointer,
  MessageCircle,
  GitBranch,
  BarChart3,
  PieChart,
  Folder,
  Settings,
  Code2,
  Building2,
  Shield,
  Globe2,
  Lock,
  Monitor,
  TrendingUp,
  Mic,
  Film,
  BookOpen,
  FolderKanban,
  UsersRound,
  ClipboardList,
  Megaphone,
  Music,
  Clapperboard,
  Landmark,
  GraduationCap,
  Lightbulb,
  ShieldCheck,
  Mail,
  Package,
  Hash,
  LifeBuoy,
  Headset,
  Factory,
  Search,
  Layers,
  WalletCards,
  UserCog,
  Coins,
  Radio,
  KeyRound,
  Paperclip,
  Crown,
  CreditCard,
  Camera,
  Brain,
  Radar,
  Inbox,
  Sigma,
  Bell,
  Fingerprint,
  Smartphone,
  Gauge,
  SquarePen,
  Leaf,
  Workflow,
  Wand2,
  Puzzle,
  Bot,
  Box,
  Atom,
  Gavel,
  School,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/cn";

const navItems = [
  { to: "/app", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/app/trading", icon: TrendingUp, label: "Trading Intel" },
  { to: "/app/trading/brokers", icon: Landmark, label: "Broker Trading" },
  { to: "/app/voice", icon: Mic, label: "Voice Studio" },
  { to: "/app/voice-console", icon: Mic, label: "Voice" },
  { to: "/app/media", icon: Film, label: "Media Factory" },
  { to: "/app/learn", icon: BookOpen, label: "Lecturer AI" },
  { to: "/app/education", icon: School, label: "Learning Platform" },
  { to: "/app/projects", icon: FolderKanban, label: "Project Continuity" },
  { to: "/app/leads", icon: UsersRound, label: "Lead Discovery" },
  { to: "/app/lead-pipeline", icon: ClipboardList, label: "Lead Pipeline" },
  { to: "/app/mfa-assurance", icon: ShieldCheck, label: "MFA Assurance" },
  { to: "/app/mobile-devices", icon: Smartphone, label: "Mobile Devices" },
  { to: "/app/opex", icon: Gauge, label: "Operational Excellence" },
  { to: "/app/prompt-templates", icon: SquarePen, label: "Prompt Templates" },
  { to: "/app/public-api", icon: Globe2, label: "Public API" },
  { to: "/app/sustainability", icon: Leaf, label: "Sustainability" },
  { to: "/app/usage", icon: BarChart3, label: "Usage" },
  { to: "/app/ai-engineering", icon: Workflow, label: "AI Engineering" },
  { to: "/app/identity-knowledge", icon: ShieldCheck, label: "Identity Knowledge" },
  { to: "/app/events", icon: Radio, label: "Real-Time Events" },
  { to: "/app/webhook", icon: Inbox, label: "Webhook Inbox" },
  { to: "/app/marketing", icon: Megaphone, label: "Marketing" },
  { to: "/app/ads", icon: Megaphone, label: "Advertising" },
  { to: "/app/music", icon: Music, label: "Music Studio" },
  { to: "/app/music-video", icon: Clapperboard, label: "Music Video" },
  { to: "/app/video-studio", icon: Clapperboard, label: "AI Video Studio" },
  { to: "/app/video-transform", icon: Clapperboard, label: "Switch X Studio" },
  { to: "/app/cinematic-studio", icon: Clapperboard, label: "Cinematic Studio" },
  { to: "/app/video-editor", icon: Wand2, label: "AI Video Editor" },
  { to: "/app/workforce", icon: Users, label: "Workforce Hub" },
  { to: "/app/canvas", icon: SquareDashedMousePointer, label: "Canvas" },
  { to: "/app/chat", icon: MessagesSquare, label: "AI Chat" },
  { to: "/app/talk", icon: MessageCircle, label: "Talk" },
  { to: "/app/flow", icon: GitBranch, label: "Flow" },
  { to: "/app/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/app/developers", icon: Code2, label: "Developers" },
  { to: "/app/developer-portal", icon: Code2, label: "Developer Portal" },
  { to: "/app/enterprise", icon: Building2, label: "Enterprise" },
  { to: "/app/governance", icon: Shield, label: "Governance" },
  { to: "/app/platform", icon: Globe2, label: "Platform" },
  { to: "/app/security", icon: Lock, label: "Security" },
  { to: "/app/tenant-isolation", icon: ShieldCheck, label: "Tenant Isolation" },
  { to: "/app/crm", icon: UsersRound, label: "CRM" },
  { to: "/app/email-intel", icon: Mail, label: "Email Intel" },
  { to: "/app/erp", icon: Package, label: "ERP" },
  { to: "/app/website-builder", icon: Globe2, label: "Website Builder" },
  { to: "/app/social", icon: Hash, label: "Social Platform" },
  { to: "/app/helpdesk", icon: LifeBuoy, label: "Helpdesk" },
  { to: "/app/my-support", icon: LifeBuoy, label: "My Support" },
  { to: "/app/contact-center", icon: Headset, label: "Contact Center" },
  { to: "/app/app-builder", icon: Factory, label: "Software Factory" },
  { to: "/app/bi", icon: PieChart, label: "Business Intel" },
  { to: "/app/search", icon: Search, label: "Search" },
  { to: "/app/software-factory", icon: Layers, label: "Factory Studios" },
  { to: "/app/finops", icon: WalletCards, label: "Enterprise FinOps" },
  { to: "/app/ai-economy", icon: Coins, label: "AI Economy" },
  { to: "/app/api-keys", icon: KeyRound, label: "API Keys" },
  { to: "/app/attachments", icon: Paperclip, label: "Attachments" },
  { to: "/app/autonomous", icon: Crown, label: "Autonomous Org" },
  { to: "/app/billing", icon: CreditCard, label: "Billing" },
  { to: "/app/payments", icon: CreditCard, label: "Payment Gateways" },
  { to: "/app/knowledge", icon: BookOpen, label: "Global Knowledge" },
  { to: "/app/religions", icon: BookOpen, label: "World Religions" },
  { to: "/app/politics", icon: Landmark, label: "Politics & Government" },
  { to: "/app/life-principles", icon: Lightbulb, label: "Rules of Life" },
  { to: "/app/cyber-cloud-academy", icon: ShieldCheck, label: "Cyber & Cloud Academy" },
  { to: "/app/university", icon: GraduationCap, label: "University Education" },
  { to: "/app/cyber", icon: Shield, label: "Cyber & Cloud Posture" },
  { to: "/app/robotics", icon: Bot, label: "Robotics" },
  { to: "/app/spatial", icon: Box, label: "Spatial" },
  { to: "/app/quantum", icon: Atom, label: "Quantum Readiness" },
  { to: "/app/legal", icon: Gavel, label: "Legal Intelligence" },
  { to: "/app/scientific", icon: FlaskConical, label: "Scientific Research" },
  { to: "/app/education-engine", icon: BookOpen, label: "Higher Education Engine" },
  { to: "/app/geo-billing", icon: Globe2, label: "Geo-Billing Engine" },
  { to: "/app/camera", icon: Camera, label: "Camera Intelligence" },
  { to: "/app/cognitive", icon: Brain, label: "Cognitive / World Model" },
  { to: "/app/command", icon: Radar, label: "Global Command Center" },
  { to: "/app/conversations", icon: Inbox, label: "Conversation Ops" },
  { to: "/app/derivatives", icon: Sigma, label: "Derivatives Desk" },
  { to: "/app/audit", icon: ShieldCheck, label: "Audit Trail" },
  { to: "/app/commerce", icon: Package, label: "Commerce" },
  { to: "/app/notifications", icon: Bell, label: "Notifications" },
  { to: "/app/permissions", icon: Shield, label: "Permissions" },
  { to: "/app/publishing", icon: Megaphone, label: "Publishing" },
  { to: "/app/google-identity", icon: Fingerprint, label: "Google Identity" },
  { to: "/admin", icon: UserCog, label: "Admin Console" },
  { to: "/admin/api-platform", icon: Code2, label: "API Control Center" },
  { to: "/app/files", icon: Folder, label: "Files" },
  { to: "/app/extensions", icon: Puzzle, label: "Extensions" },
  { to: "/app/settings", icon: Settings, label: "Settings" },
  { to: "/d", icon: Monitor, label: "Desktop" },
];

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={cn(
        "shrink-0 h-full bg-bg-dark/80 border-r border-white/5 flex flex-col transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center gap-2 px-4 border-b border-white/5">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-azure to-violet grid place-items-center text-white font-bold">
          W
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-text-bright tracking-tight">WINDELS</span>
            <span className="text-[10px] uppercase tracking-widest text-text-muted">AI OS</span>
          </div>
        )}
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-slate-300 hover:bg-white/5 hover:text-white",
                isActive &&
                  "bg-white/10 text-white border-l-2 border-azure rounded-l-none pl-[11px]"
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="p-2 border-t border-white/5">
        <div
          className={cn(
            "rounded-lg p-2 text-[11px] text-text-muted",
            !collapsed && "bg-white/5"
          )}
        >
          {collapsed ? "v0.90" : "Sessions 84–85 · v0.90.0"}
        </div>
      </div>
    </aside>
  );
}
