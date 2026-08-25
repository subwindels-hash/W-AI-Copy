import { Outlet } from "react-router-dom";
import { AnnouncementBar } from "@/components/ui/AnnouncementBar";
import { SeoHead } from "@/components/site/SeoHead";
import { VisitorChat } from "@/components/site/VisitorChat";

export function PublicShell({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <AnnouncementBar />
      <SeoHead />
      {children ?? <Outlet />}
      <VisitorChat />
    </>
  );
}
