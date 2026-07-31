import { cn } from "@/lib/cn";
import { Plus, Pin, MessageSquare } from "lucide-react";
import type { Conversation } from "@/lib/chat";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  loading?: boolean;
}

function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

export function ConversationList({ conversations, activeId, onSelect, onNew, loading }: Props) {
  const pinned = conversations.filter((c) => c.pinned);
  const recent = conversations.filter((c) => !c.pinned);

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-white/5">
        <button
          onClick={onNew}
          className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-azure text-white text-sm font-medium hover:bg-azure/90"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {loading && <div className="text-xs text-text-muted text-center py-4">Loading…</div>}
        {pinned.length > 0 && (
          <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-widest text-text-muted">Pinned</div>
        )}
        {pinned.map((c) => <ConvItem key={c.id} c={c} active={c.id === activeId} onSelect={onSelect} />)}
        {recent.length > 0 && pinned.length > 0 && (
          <div className="px-2 pt-3 pb-1 text-[10px] uppercase tracking-widest text-text-muted">Recent</div>
        )}
        {recent.map((c) => <ConvItem key={c.id} c={c} active={c.id === activeId} onSelect={onSelect} />)}
        {!loading && conversations.length === 0 && (
          <div className="text-xs text-text-muted text-center py-8 px-4">No conversations yet. Start one!</div>
        )}
      </div>
    </div>
  );
}

function ConvItem({ c, active, onSelect }: { c: Conversation; active: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect(c.id)}
      className={cn(
        "w-full text-left px-3 py-2 rounded-lg flex items-start gap-2 transition-colors",
        active ? "bg-white/10 text-text-bright" : "text-slate-300 hover:bg-white/5"
      )}
    >
      {c.pinned ? <Pin className="h-4 w-4 mt-0.5 text-amber shrink-0" /> : <MessageSquare className="h-4 w-4 mt-0.5 text-text-muted shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{c.title}</div>
        <div className="text-[11px] text-text-muted flex items-center gap-1.5">
          {c.messageCount ? `${c.messageCount} msg` : "new"}
          <span>·</span>
          <span>{timeAgo(c.lastMessageAt)}</span>
        </div>
      </div>
    </button>
  );
}
