import { NavLink } from "react-router-dom";
import { Home, MessageSquare, Users, Radio, User as UserIcon } from "lucide-react";
import { MBadge } from "@/components/mobile/MBadge";
import { useHaptics } from "./hooks/useHaptics";
import { cn } from "@/lib/cn";

const tabs = [
  { to: "/m", label: "Home", icon: Home, end: true },
  { to: "/m/chat", label: "Chat", icon: MessageSquare },
  { to: "/m/agents", label: "Agents", icon: Users },
  { to: "/m/talk", label: "Talk", icon: Radio },
  { to: "/m/profile", label: "Profile", icon: UserIcon },
];

export function MobileTabBar() {
  const h = useHaptics();
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 bg-bg-dark/95 backdrop-blur-xl border-t border-white/10 flex items-stretch"
      style={{ paddingBottom: "var(--sab)" }}
    >
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          onClick={() => h.light()}
          className={({ isActive }) =>
            cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition relative",
              isActive ? "text-azure-400" : "text-text-muted"
            )
          }
        >
          {({ isActive }) => (
            <>
              <t.icon size={22} strokeWidth={isActive ? 2.4 : 2} />
              <span>{t.label}</span>
              {t.to === "/m/chat" && <MBadge count={0} className="absolute top-1 right-4" />}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
