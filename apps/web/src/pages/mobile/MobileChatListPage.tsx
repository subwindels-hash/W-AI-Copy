import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Plus } from "lucide-react";
import { MobileTopBar } from "@/app/mobile/MobileTopBar";
import { MAvatar } from "@/components/mobile/MAvatar";
import { MFab } from "@/components/mobile/MFab";
import { MEmptyState } from "@/components/mobile/MEmptyState";
import { api } from "@/lib/api";
import { useHaptics } from "@/app/mobile/hooks/useHaptics";

type Convo = { id: string; title: string; updatedAt: string; lastMessage?: string };

export function MobileChatListPage() {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const h = useHaptics();

  useEffect(() => {
    api.get<Convo[]>("/conversations").then((c) => { setConvos(c); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = convos.filter((c) => c.title?.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <MobileTopBar
        title="Chats"
        left={null}
        right={null}
      />
      <div className="px-4 pt-3 pb-2 sticky top-[52px] bg-bg-deep/90 backdrop-blur z-10">
        <div className="flex items-center h-11 px-4 rounded-xl bg-white/5 border border-white/10 focus-within:border-azure-400">
          <Search size={18} className="text-text-muted mr-2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations…"
            className="flex-1 bg-transparent outline-none text-[15px] text-text-main placeholder:text-text-muted"
          />
        </div>
      </div>

      <div className="px-2 pt-2">
        {!loading && filtered.length === 0 && (
          <MEmptyState icon={<MessageSquare />} title="No conversations yet" message="Start a new chat to talk with AI employees." />
        )}
        {filtered.map((c) => (
          <Link
            key={c.id}
            to={`/m/chat/${c.id}`}
            onClick={() => h.light()}
            className="flex items-center gap-3 px-3 py-3 rounded-xl active:bg-white/5"
          >
            <MAvatar name={c.title || "Chat"} color="#8B5CF6" size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium text-text-main truncate">{c.title || "New chat"}</p>
              <p className="text-xs text-text-muted truncate">{c.lastMessage ?? "Tap to open"}</p>
            </div>
            <span className="text-[11px] text-text-muted">{formatTime(c.updatedAt)}</span>
          </Link>
        ))}
      </div>

      <MFab aria-label="New chat" onClick={() => newChat()}>
        <Plus size={24} strokeWidth={2.5} />
      </MFab>
    </div>
  );
}

async function newChat() {
  const c = await api.post<{ id: string; title: string }>("/conversations", { title: "New chat" });
  window.location.hash = `#/m/chat/${c.id}`;
  window.location.reload();
}

function MessageSquare({}: {}) {
  // Use inline icon to avoid extra import
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return d.toLocaleDateString();
}
