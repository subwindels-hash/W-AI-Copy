import { Outlet } from "react-router-dom";
import { PublicNav } from "@/app/PublicNav";
import { PublicFooter } from "@/app/PublicFooter";
import { PublicShell } from "@/app/PublicShell";

export function MarketingLayout() {
  return (
    <PublicShell>
      <div className="app-min-screen bg-bg-dark text-text-main flex flex-col">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-azure/10 blur-[120px]"/>
          <div className="absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full bg-violet/10 blur-[140px]"/>
          <div className="absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full bg-teal/5 blur-[120px]"/>
        </div>
        <PublicNav />
        <main className="relative z-10 flex-1">
          <Outlet />
        </main>
        <PublicFooter />
      </div>
    </PublicShell>
  );
}
