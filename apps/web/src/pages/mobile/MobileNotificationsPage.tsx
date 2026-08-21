import { useEffect, useState } from "react";
import { ArrowLeft, Bell, CheckCheck, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MList, MListItem } from "@/components/mobile/MList";
import { MButton } from "@/components/mobile/MButton";
import { api } from "@/lib/api";

type Notif = { id: string; type: string; title: string; body: string; url?: string; readAt?: string | null; createdAt: string };

export function MobileNotificationsPage() {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  const load = () => {
    api.get<Notif[]>("/mobile/notifications?limit=50")
      .then(setNotifs)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const markAll = async () => {
    await api.post("/mobile/notifications/read-all", {});
    load();
  };

  return (
    <div>
      <div className="sticky top-0 z-20 bg-bg-dark/90 backdrop-blur-xl border-b border-white/5 flex items-center gap-2 px-2 py-2 app-sticky-top"
        style={{ paddingTop: "max(8px, var(--sat))" }}
      >
        <button onClick={() => nav(-1)} className="h-10 w-10 grid place-items-center rounded-full active:bg-white/10">
          <ArrowLeft size={22} />
        </button>
        <h1 className="flex-1 text-[17px] font-semibold text-text-bright">Notifications</h1>
        <button onClick={() => nav("/m/settings")} className="h-10 w-10 grid place-items-center rounded-full active:bg-white/10 text-text-main">
          <Settings size={20} />
        </button>
      </div>

      {!loading && notifs.length === 0 && (
        <div className="flex flex-col items-center text-center px-8 py-24 text-text-muted">
          <div className="h-20 w-20 rounded-full bg-white/5 grid place-items-center mb-4">
            <Bell size={32} className="text-text-muted/60" />
          </div>
          <h3 className="text-lg font-semibold text-text-main">All caught up</h3>
          <p className="text-sm mt-2">You don't have any new notifications.</p>
        </div>
      )}

      {notifs.length > 0 && (
        <>
          <div className="px-4 py-3 flex justify-end">
            <MButton size="md" variant="ghost" onClick={markAll}>
              <CheckCheck size={16} /> Mark all read
            </MButton>
          </div>
          <div className="px-4">
            <div className="bg-bg-elevated border border-white/10 rounded-2xl divide-y divide-white/5">
              {notifs.map((n) => (
                <div key={n.id} className="flex items-start gap-3 p-4 active:bg-white/5">
                  <div className="h-9 w-9 rounded-full bg-azure-500/20 text-azure-400 grid place-items-center flex-shrink-0 mt-0.5">
                    <Bell size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={"text-[14px] " + (n.readAt ? "text-text-muted" : "text-text-bright font-medium")}>{n.title}</p>
                    <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-[11px] text-text-muted mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.readAt && <span className="h-2 w-2 rounded-full bg-azure-500 flex-shrink-0 mt-2" />}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}
