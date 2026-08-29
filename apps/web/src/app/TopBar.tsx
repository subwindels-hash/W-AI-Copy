import { useState } from "react";
import { Bell, Menu, Search, Settings as SettingsIcon, ChevronDown, LogOut, User as UserIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "@/components/ui/Avatar";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/cn";

interface TopBarProps {
  onToggleSidebar: () => void;
  workspaceLabel?: string;
}

export function TopBar({ onToggleSidebar, workspaceLabel }: TopBarProps) {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    clear();
    navigate("/auth/login");
  }

  return (
    <header className="h-14 shrink-0 border-b border-white/5 bg-bg-dark/60 backdrop-blur flex items-center px-4 gap-4">
      <button
        onClick={onToggleSidebar}
        className="p-2 rounded-md hover:bg-white/5 text-slate-300 lg:hidden"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Workspace label */}
      <button className="hidden md:inline-flex items-center gap-1.5 text-sm text-text-bright font-medium hover:bg-white/5 rounded-md px-2 py-1">
        <span className="h-6 w-6 rounded bg-gradient-to-br from-teal to-azure grid place-items-center text-[10px] font-bold text-white">
          W
        </span>
        {workspaceLabel ?? "Default Workspace"}
        <ChevronDown className="h-4 w-4 text-text-muted" />
      </button>

      {/* Global search */}
      <div className="flex-1 max-w-xl mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            className="w-full h-9 rounded-lg bg-white/5 border border-white/10 pl-9 pr-3 text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-azure/40"
            placeholder="Ask Windels or Search… (⌘K)"
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button className="p-2 rounded-md hover:bg-white/5 text-slate-300" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </button>
        <button className="p-2 rounded-md hover:bg-white/5 text-slate-300" aria-label="Settings">
          <SettingsIcon className="h-5 w-5" />
        </button>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 ml-1 p-1 pr-2 rounded-full hover:bg-white/5"
          >
            <Avatar name={user?.displayName ?? user?.email} size={28} ring />
            <span className="hidden sm:inline text-sm text-slate-200 max-w-[120px] truncate">
              {user?.displayName ?? user?.email ?? "Guest"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-56 glass p-1.5 z-50">
                <div className="px-3 py-2 border-b border-white/5">
                  <div className="text-sm font-medium text-text-bright truncate">
                    {user?.displayName ?? user?.email}
                  </div>
                  <div className="text-[11px] text-text-muted truncate">{user?.email}</div>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); navigate("/app/account"); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-white/5 text-left text-slate-200"
                >
                  <UserIcon className="h-4 w-4 text-text-muted" /> My Account
                </button>
                <button
                  onClick={() => { setMenuOpen(false); navigate("/app/settings"); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-white/5 text-left text-slate-200"
                >
                  <SettingsIcon className="h-4 w-4 text-text-muted" /> Settings
                </button>
                <div className="h-px bg-white/5 my-1" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-crimson/15 text-left text-crimson"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
