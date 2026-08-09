import { useState } from "react";
import { cn } from "@/lib/cn";
import { Plus, Pin, MessageSquare, Search, Archive, ArchiveRestore, X } from "lucide-react";
import type { Conversation } from "@/lib/chat";
import { ChatContextMenu, type ChatMenuHandlers } from "./ChatContextMenu";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSearch: (q: string) => void;
  loading?: boolean;
  /** When true the list shows archived conversations instead of active ones. */
  archivedMode?: boolean;
  onToggleArchivedView: () => void;
  handlers: ChatMenuHandlers;
}

function timeAgo(iso: string) {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

export function ConversationList({
  conversations, activeId, onSelect, onNew, onSearch, loading,
  archivedMode, onToggleArchivedView, handlers,
}: Props) {
  const [q, setQ] = useState("");

  const searching = q.trim().length > 0;
  const pinned = conversations.filter((c) => c.pinned && !c.isArchived);
  const recent = conversations.filter((c) => !c.pinned && !c.isArchived && (Date.now() - new Date(c.lastMessageAt).getTime()) < WEEK_MS);
  const previous = conversations.filter((c) => !c.pinned && !c.isArchived && (Date.now() - new Date(c.lastMessageAt).getTime()) >= WEEK_MS);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="p-3 border-b border-white/5 space-y-2">
        {!archivedMode && (
          <button
            onClick={onNew}
            className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-azure text-white text-sm font-medium hover:bg-azure/90"
          >
            <Plus className="h-4 w-4" /> New chat
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="flex items-center flex-1 h-9 px-3 rounded-lg bg-white/5 border border-white/10 focus-within:border-azure/50 gap-2">
            <Search className="h-3.5 w-3.5 text-text-muted shrink-0" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); onSearch(e.target.value); }}
              placeholder={archivedMode ? "Search archived chats…" : "Search chats…"}
              className="flex-1 bg-transparent outline-none text-sm text-text-main placeholder:text-text-muted min-w-0"
            />
            {q && (
              <button onClick={() => { setQ(""); onSearch(""); }} className="text-text-muted hover:text-text-bright" aria-label="Clear search">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {loading && <div className="text-xs text-text-muted text-center py-4">Loading…</div>}

        {/* Archived view toggle */}
        <div className="px-2 pb-1">
          <button
            onClick={onToggleArchivedView}
            className={cn(
              "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              archivedMode ? "bg-white/10 text-text-bright" : "text-slate-300 hover:bg-white/5"
            )}
          >
            {archivedMode ? <ArchiveRestore className="h-4 w-4 text-text-muted" /> : <Archive className="h-4 w-4 text-text-muted" />}
            {archivedMode ? "Back to active chats" : "Archived chats"}
          </button>
        </div>

        {searching ? (
          <SearchResults conversations={conversations} activeId={activeId} onSelect={onSelect} handlers={handlers} archivedMode={archivedMode} />
        ) : archivedMode ? (
          <Group label="Archived" show={conversations.length > 0}>
            {conversations.map((c) => <ConvItem key={c.id} c={c} active={c.id === activeId} onSelect={onSelect} handlers={handlers} />)}
          </Group>
        ) : (
          <>
            <Group label="Pinned" show={pinned.length > 0}>
              {pinned.map((c) => <ConvItem key={c.id} c={c} active={c.id === activeId} onSelect={onSelect} handlers={handlers} />)}
            </Group>
            <Group label="Recent" show={recent.length > 0}>
              {recent.map((c) => <ConvItem key={c.id} c={c} active={c.id === activeId} onSelect={onSelect} handlers={handlers} />)}
            </Group>
            <Group label="Previous" show={previous.length > 0}>
              {previous.map((c) => <ConvItem key={c.id} c={c} active={c.id === activeId} onSelect={onSelect} handlers={handlers} />)}
            </Group>
          </>
        )}

        {!loading && conversations.length === 0 && !searching && (
          <div className="text-xs text-text-muted text-center py-8 px-4">
            {archivedMode ? "No archived chats." : "No conversations yet. Start one!"}
          </div>
        )}
        {!loading && searching && conversations.length === 0 && (
          <div className="text-xs text-text-muted text-center py-8 px-4">No matches.</div>
        )}
      </div>
    </div>
  );
}

function Group({ label, show, children }: { label: string; show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <>
      <div className="px-2 pt-3 pb-1 text-[10px] uppercase tracking-widest text-text-muted">{label}</div>
      {children}
    </>
  );
}

function SearchResults({ conversations, activeId, onSelect, handlers, archivedMode }: any) {
  if (conversations.length === 0) return null;
  return conversations.map((c: Conversation) => (
    <ConvItem key={c.id} c={c} active={c.id === activeId} onSelect={onSelect} handlers={handlers} archivedMode={archivedMode} />
  ));
}

function ConvItem({
  c, active, onSelect, handlers, archivedMode,
}: {
  c: Conversation; active: boolean; onSelect: (id: string) => void;
  handlers: ChatMenuHandlers; archivedMode?: boolean;
}) {
  return (
    <div
      onClick={() => onSelect(c.id)}
      className={cn(
        "w-full text-left px-2 py-2 rounded-lg flex items-start gap-2 transition-colors group cursor-pointer",
        active ? "bg-white/10 text-text-bright" : "text-slate-300 hover:bg-white/5"
      )}
    >
      <span className="mt-0.5 shrink-0">
        {c.pinned && !c.isArchived ? (
          <Pin className="h-4 w-4 text-amber" />
        ) : archivedMode || c.isArchived ? (
          <Archive className="h-4 w-4 text-text-muted" />
        ) : (
          <MessageSquare className="h-4 w-4 text-text-muted" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{c.title}</div>
        <div className="text-[11px] text-text-muted flex items-center gap-1.5">
          {c.messageCount ? `${c.messageCount} msg` : "new"}
          <span>·</span>
          <span>{timeAgo(c.lastMessageAt)}</span>
          {archivedMode && c.archivedAt && <span>· archived {timeAgo(c.archivedAt)}</span>}
        </div>
      </div>
      <ChatContextMenu conversation={c} handlers={handlers} />
    </div>
  );
}
