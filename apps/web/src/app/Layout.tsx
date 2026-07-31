import { useState, type ReactNode, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { AIPanel } from "./AIPanel";
import { DesktopTitleBar } from "./desktop/DesktopTitleBar";
import { GlobalBrandingFooter } from "./GlobalBrandingFooter";
import { useLocation, useNavigate } from "react-router-dom";
import { useDesktop } from "./desktop/hooks/useDesktop";

export function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const desktop = useDesktop();
  // The dedicated /app/chat route has its own composition — hide the floating orb there.
  const isFullChat = location.pathname.startsWith("/app/chat");

  // When running in Electron, wire deep-link → navigation and mount the custom titlebar.
  useEffect(() => {
    if (!desktop) return;
    const origin = window.location.origin;
    const offNav = desktop.onNavigate((url) => {
      try { navigate(new URL(url, origin).pathname); } catch { navigate(url); }
    });
    const offDl = desktop.onDeepLink(({ path, token }) => {
      if (token) localStorage.setItem("windels:accessToken", token);
      if (path === "auth/login") navigate("/auth/login");
    });
    return () => { offNav(); offDl(); };
  }, [desktop, navigate]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden text-text-main">
      {desktop && <DesktopTitleBar />}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="hidden lg:block">
          <Sidebar collapsed={collapsed} />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar onToggleSidebar={() => setCollapsed((c) => !c)} />
          <main className="flex-1 overflow-y-auto">
            <div className={isFullChat ? "p-0 h-full" : "p-6 max-w-[1600px] mx-auto w-full"}>{children}</div>
          </main>
          <GlobalBrandingFooter />
        </div>
        {!isFullChat && <AIPanel />}
      </div>
    </div>
  );
}
