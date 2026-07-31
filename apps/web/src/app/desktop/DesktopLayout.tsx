import { type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/app/Sidebar";
import { TopBar } from "@/app/TopBar";
import { AIPanel } from "@/app/AIPanel";
import { DesktopTitleBar } from "./DesktopTitleBar";
import { useDesktop } from "./hooks/useDesktop";

/**
 * Desktop-shell layout used for /d/* routes — same composition as AppLayout
 * but always shows Sidebar (since desktop windows are ≥960px wide) and mounts
 * the custom titlebar automatically.
 */
export function DesktopLayout({ children }: { children?: ReactNode }) {
  const d = useDesktop();
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden text-text-main">
      {d && <DesktopTitleBar />}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar collapsed={false} />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar onToggleSidebar={() => {}} />
          <main className="flex-1 overflow-y-auto">
            <div className="p-6 max-w-[1600px] mx-auto w-full">
              {children ?? <Outlet />}
            </div>
          </main>
        </div>
        <AIPanel />
      </div>
    </div>
  );
}
