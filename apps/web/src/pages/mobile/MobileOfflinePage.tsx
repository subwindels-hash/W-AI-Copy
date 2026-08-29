import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MButton } from "@/components/mobile/MButton";
import { useOnlineStatus } from "@/app/mobile/hooks/useOnlineStatus";
import { listAll, flush } from "@/lib/mobile/offlineQueue";
import { useAuthStore } from "@/store/auth";

export function MobileOfflinePage() {
  const nav = useNavigate();
  const { isOnline } = useOnlineStatus();
  const [queued, setQueued] = useState<any[]>([]);
  const deviceId = useAuthStore((s) => s.deviceId);

  useEffect(() => { listAll().then(setQueued); }, []);

  const trySync = async () => {
    if (!deviceId) return;
    await flush(deviceId);
    const list = await listAll();
    setQueued(list);
  };

  return (
    <div className="app-min-screen flex flex-col">
      <div className="sticky top-0 z-20 bg-bg-dark/90 backdrop-blur-xl border-b border-white/5 flex items-center gap-2 px-2 py-2 app-sticky-top"
        style={{ paddingTop: "max(8px,var(--sat))" }}>
        <button onClick={() => nav(-1)} className="h-10 w-10 grid place-items-center rounded-full active:bg-white/10">
          <ArrowLeft size={22} />
        </button>
        <h1 className="flex-1 text-[17px] font-semibold text-text-bright">Offline</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 text-center">
        <div className={`h-20 w-20 rounded-full grid place-items-center mb-5 ${isOnline ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
          {isOnline ? <Wifi size={34} /> : <WifiOff size={34} />}
        </div>
        <h2 className="text-xl font-bold text-text-bright">
          {isOnline ? "You're back online" : "You're offline"}
        </h2>
        <p className="text-text-muted text-sm mt-2 max-w-xs">
          {isOnline
            ? "Queued actions will sync automatically."
            : "Your recent work is saved locally. Actions will replay when you reconnect."}
        </p>
        <div className="mt-6 w-full max-w-xs">
          <MButton fullWidth size="lg" variant={isOnline ? "primary" : "secondary"} onClick={trySync}>
            <RefreshCw size={18} /> {isOnline ? `Sync ${queued.length} queued action${queued.length === 1 ? "" : "s"}` : "Check connection"}
          </MButton>
        </div>
      </div>

      {queued.length > 0 && (
        <div className="px-4 pb-10">
          <h3 className="text-xs uppercase tracking-wide text-text-muted px-2 pb-2">Queued actions</h3>
          <div className="bg-bg-elevated border border-white/10 rounded-2xl divide-y divide-white/5">
            {queued.map((a) => (
              <div key={a.id} className="px-4 py-3 text-sm">
                <p className="text-text-main font-medium">{a.method} {a.path.replace("/api/v1", "")}</p>
                <p className="text-xs text-text-muted mt-0.5">Queued {new Date(a.queuedAt).toLocaleTimeString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
