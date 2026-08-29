import { cn } from "@/lib/cn";
import { useOnlineStatus } from "./hooks/useOnlineStatus";

export function MobileTopBar({
  title, left, right, subtitle,
}: { title: string; left?: React.ReactNode; right?: React.ReactNode; subtitle?: string }) {
  const { isOnline } = useOnlineStatus();
  return (
    <div className={cn(
      "sticky top-0 z-20 bg-bg-dark/90 backdrop-blur-xl border-b border-white/5 px-4 pt-3 pb-2 flex items-center gap-3 app-sticky-top",
    )}
    style={{ paddingTop: "max(12px, var(--sat))" }}
    >
      <div className="flex items-center flex-1 min-w-0 gap-3">
        {left}
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] font-semibold text-text-bright truncate leading-tight">{title}</h1>
          {subtitle && <p className="text-xs text-text-muted truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!isOnline && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
            OFFLINE
          </span>
        )}
        {right}
      </div>
    </div>
  );
}
