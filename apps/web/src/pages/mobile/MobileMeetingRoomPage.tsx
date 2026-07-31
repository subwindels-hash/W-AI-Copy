import { useEffect, useState } from "react";
import { ArrowLeft, Mic, MicOff, PhoneOff, Users, Video as VideoIcon } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { MButton } from "@/components/mobile/MButton";
import { api } from "@/lib/api";

export function MobileMeetingRoomPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [muted, setMuted] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [meeting, setMeeting] = useState<any>(null);
  const [transcript, setTranscript] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    api.get<any>(`/talk/meetings/${id}`).then(setMeeting).catch(() => {});
    setTranscript([
      "Meeting started.",
      "AI Notetaker is listening…",
    ]);
  }, [id]);

  return (
    <div className="flex flex-col h-screen bg-black text-white">
      <div className="flex items-center justify-between px-4 pt-[max(14px,var(--sat))] pb-3">
        <button onClick={() => nav(-1)} className="h-10 w-10 grid place-items-center rounded-full bg-white/10"><ArrowLeft size={20} /></button>
        <div className="text-center">
          <p className="text-sm font-semibold">{meeting?.title ?? "Meeting"}</p>
          <p className="text-xs text-white/60">{formatTime(0)}</p>
        </div>
        <button className="h-10 w-10 grid place-items-center rounded-full bg-white/10"><Users size={18} /></button>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-32 w-32 rounded-full bg-gradient-to-br from-azure-500 to-violet-500 grid place-items-center text-white text-4xl font-bold shadow-2xl">
            W
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 h-48 overflow-y-auto text-xs text-white/70 space-y-1">
          <p className="text-white font-semibold text-sm mb-1">AI Notetaker</p>
          {transcript.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 pb-[max(24px,var(--sab))] pt-4 bg-black/60">
        <ControlButton active={!muted} onClick={() => setMuted((v) => !v)} label={muted ? "Unmute" : "Mute"}>
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </ControlButton>
        <button
          onClick={() => nav("/m/talk")}
          className="h-16 w-16 rounded-full bg-crimson grid place-items-center text-white shadow-lg active:scale-95"
          aria-label="End call"
        >
          <PhoneOff size={26} />
        </button>
        <ControlButton active={camOn} onClick={() => setCamOn((v) => !v)} label="Camera">
          <VideoIcon size={22} />
        </ControlButton>
      </div>
    </div>
  );
}

function ControlButton({ active, onClick, children, label }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-14 w-14 rounded-full grid place-items-center active:scale-95 transition ${active ? "bg-white/15 text-white" : "bg-white/10 text-white/60"}`}
      aria-label={label}
    >{children}</button>
  );
}
function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}
