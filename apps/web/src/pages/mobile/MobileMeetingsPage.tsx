import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, Plus, Video } from "lucide-react";
import { MobileTopBar } from "@/app/mobile/MobileTopBar";
import { MAvatar } from "@/components/mobile/MAvatar";
import { MFab } from "@/components/mobile/MFab";
import { MEmptyState } from "@/components/mobile/MEmptyState";
import { api } from "@/lib/api";
import { useHaptics } from "@/app/mobile/hooks/useHaptics";

type Meeting = { id: string; title: string; startsAt?: string; status?: string; summary?: string };

export function MobileMeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const h = useHaptics();

  useEffect(() => {
    api.get<Meeting[]>("/talk/meetings").then((m) => { setMeetings(m); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const upcoming = meetings.filter((m) => m.status !== "ended");
  const past = meetings.filter((m) => m.status === "ended");

  return (
    <div className="pb-4">
      <MobileTopBar title="Meetings" subtitle="AI Notetaker" />

      <div className="px-4 pt-4">
        {!loading && meetings.length === 0 && (
          <MEmptyState
            icon={<Calendar size={48} />}
            title="No meetings yet"
            message="Start a quick meeting or schedule one — Windels will take notes and extract action items."
          />
        )}
        {upcoming.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-text-bright px-1 mb-2">Upcoming</h3>
            <div className="space-y-2 pb-4">
              {upcoming.map((m) => (
                <Link key={m.id} to={`/m/meetings/${m.id}`} onClick={() => h.light()} className="block p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 active:scale-[0.99]">
                  <div className="flex items-center gap-3">
                    <span className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 grid place-items-center"><Video size={18} /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-text-bright truncate">{m.title}</p>
                      <p className="text-xs text-text-muted">{m.startsAt ? new Date(m.startsAt).toLocaleString() : "No date"} · {m.status ?? "scheduled"}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">Join</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
        {past.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-text-bright px-1 mb-2 mt-2">Past</h3>
            <div className="bg-bg-elevated border border-white/10 rounded-2xl divide-y divide-white/5">
              {past.map((m) => (
                <Link key={m.id} to={`/m/meetings/${m.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-white/5">
                  <MAvatar name={m.title} color="#14B8A6" size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-text-main truncate">{m.title}</p>
                    <p className="text-xs text-text-muted truncate">{m.summary ?? "Meeting notes available"}</p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <MFab aria-label="New meeting"><Plus size={24} strokeWidth={2.5} /></MFab>
    </div>
  );
}
