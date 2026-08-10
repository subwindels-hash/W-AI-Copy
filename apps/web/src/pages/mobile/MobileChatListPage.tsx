import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Plus, MoreVertical, Pin, PinOff, Archive, ArchiveRestore, Pencil, Share2, Trash2 } from "lucide-react";
import { MobileTopBar } from "@/app/mobile/MobileTopBar";
import { MAvatar } from "@/components/mobile/MAvatar";
import { MFab } from "@/components/mobile/MFab";
import { MEmptyState } from "@/components/mobile/MEmptyState";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { chatApi, type Conversation } from "@/lib/chat";
import { shareApi } from "@/lib/shares";
import { toast } from "@/lib/toast";
import { useHaptics } from "@/app/mobile/hooks/useHaptics";

export function MobileChatListPage() {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [q, setQ] = useState("");
  const [viewArchived, setViewArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuFor, setMenuFor] = useState<Conversation | null>(null);
  const [deleteFor, setDeleteFor] = useState<Conversation | null>(null);
  const h = useHaptics();

  const load = useCallback(async (archived: boolean) => {
    setLoading(true);
    try {
      const { items } = await chatApi.listConversations({ archived });
      setConvos(items);
    } catch {
      /* keep last state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(false); }, [load]);

  function switchView(next: boolean) {
    setViewArchived(next);
    setQ("");
    void load(next);
  }

  const filtered = convos.filter((c) => c.title?.toLowerCase().includes(q.toLowerCase()));
  const pinned = filtered.filter((c) => c.pinned && !c.isArchived);
  const recent = filtered.filter((c) => !c.pinned && !c.isArchived);
  const archived = filtered.filter((c) => c.isArchived);

  async function act(fn: () => Promise<unknown>, message: string) {
    try {
      await fn();
      toast.success(message);
      h.medium();
      await load(viewArchived);
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed");
    }
    setMenuFor(null);
  }

  const menu = menuFor ? [
    { icon: <Pin className="h-4 w-4" />, label: "Pin", show: !menuFor.isArchived && !menuFor.pinned, run: () => act(() => chatApi.pinConversation(menuFor.id), "Chat pinned.") },
    { icon: <PinOff className="h-4 w-4" />, label: "Unpin", show: !menuFor.isArchived && menuFor.pinned, run: () => act(() => chatApi.unpinConversation(menuFor.id), "Chat unpinned.") },
    { icon: <Archive className="h-4 w-4" />, label: "Archive", show: !menuFor.isArchived, run: () => act(() => chatApi.archiveConversation(menuFor.id), "Chat archived.") },
    { icon: <ArchiveRestore className="h-4 w-4" />, label: "Unarchive", show: menuFor.isArchived, run: () => act(() => chatApi.unarchiveConversation(menuFor.id), "Chat restored.") },
    { icon: <Share2 className="h-4 w-4" />, label: "Share link", show: true, run: () => act(() => shareApi.create(menuFor.id, { access: "anyone_with_link", permissions: "view" }), "Share link created.") },
    { icon: <Pencil className="h-4 w-4" />, label: "Rename", show: true, run: rename },
    { icon: <Trash2 className="h-4 w-4" />, label: menuFor.isArchived ? "Delete permanently" : "Delete", show: true, run: () => setDeleteFor(menuFor), danger: true },
  ].filter((m) => m.show) : [];

  function rename() {
    setMenuFor(null);
    const c = menuFor!;
    const next = window.prompt("Rename chat", c.title)?.trim();
    if (!next) return;
    void act(() => chatApi.renameConversation(c.id, next), "Chat renamed successfully.");
  }

  async function doDelete() {
    const c = deleteFor;
    if (!c) return;
    try {
      await chatApi.deleteConversation(c.id);
      toast.success("Chat deleted.");
      await load(viewArchived);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete chat.");
    }
    setDeleteFor(null);
  }

  return (
    <div>
      <MobileTopBar title={viewArchived ? "Archived Chats" : "Chats"} left={null} right={null} />
      <div className="px-4 pt-3 pb-2 sticky top-[52px] bg-bg-deep/90 backdrop-blur z-10 space-y-2">
        <div className="flex items-center h-11 px-4 rounded-xl bg-white/5 border border-white/10 focus-within:border-azure-400">
          <Search size={18} className="text-text-muted mr-2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={viewArchived ? "Search archived…" : "Search conversations…"}
            className="flex-1 bg-transparent outline-none text-[15px] text-text-main placeholder:text-text-muted"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={() => switchView(false)}
            className={`px-3 py-1.5 rounded-full text-xs ${!viewArchived ? "bg-azure text-white" : "bg-white/5 text-text-muted"}`}>
            Active
          </button>
          <button onClick={() => switchView(true)}
            className={`px-3 py-1.5 rounded-full text-xs ${viewArchived ? "bg-azure text-white" : "bg-white/5 text-text-muted"}`}>
            Archived
          </button>
        </div>
      </div>

      <div className="px-2 pt-2 pb-24">
        {!loading && filtered.length === 0 && (
          <MEmptyState icon={<MessageSquareIcon />} title={viewArchived ? "No archived chats" : "No conversations yet"} message="Start a new chat to talk with AI employees." />
        )}
        {!viewArchived && pinned.length > 0 && <SectionTitle>Pinned</SectionTitle>}
        {!viewArchived && pinned.map((c) => <Row key={c.id} c={c} pinned onMenu={() => { setMenuFor(c); h.light(); }} />)}
        {!viewArchived && recent.length > 0 && <SectionTitle>Recent</SectionTitle>}
        {!viewArchived && recent.map((c) => <Row key={c.id} c={c} onMenu={() => { setMenuFor(c); h.light(); }} />)}
        {viewArchived && archived.map((c) => <Row key={c.id} c={c} archived onMenu={() => { setMenuFor(c); h.light(); }} />)}
      </div>

      {!viewArchived && (
        <MFab aria-label="New chat" onClick={async () => {
          const c = await chatApi.createConversation({ title: "New chat" });
          window.location.hash = `#/m/chat/${c.id}`;
          window.location.reload();
        }}>
          <Plus size={24} strokeWidth={2.5} />
        </MFab>
      )}

      {/* Action sheet */}
      <Modal open={Boolean(menuFor)} onClose={() => setMenuFor(null)} title={menuFor?.title ?? ""} size="sm" closeOnBackdrop>
        <div className="space-y-1">
          {menu.map((m, i) => (
            <button key={i} onClick={m.run}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-left ${m.danger ? "text-crimson hover:bg-crimson/10" : "text-text-main hover:bg-white/5"}`}>
              {m.icon}<span className="flex-1">{m.label}</span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={Boolean(deleteFor)} onClose={() => setDeleteFor(null)} title={deleteFor?.isArchived ? "Delete permanently?" : "Delete chat?"} size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => setDeleteFor(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => void doDelete()}>Delete</Button>
        </>}>
        <p className="text-sm text-text-main">"{deleteFor?.title}" and its messages will be {deleteFor?.isArchived ? "permanently removed." : "soft-deleted (restorable)."}</p>
      </Modal>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-widest text-text-muted">{children}</div>;
}

function Row({ c, pinned, archived, onMenu }: { c: Conversation; pinned?: boolean; archived?: boolean; onMenu: () => void }) {
  return (
    <div className="flex items-center gap-1 px-3 py-1">
      <Link to={`/m/chat/${c.id}`} className="flex flex-1 items-center gap-3 px-1 py-2 rounded-xl active:bg-white/5 min-w-0">
        <MAvatar name={c.title || "Chat"} color={pinned ? "#F59E0B" : "#8B5CF6"} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium text-text-main truncate flex items-center gap-1">
            {pinned && <Pin size={12} className="text-amber shrink-0" />}
            {archived && <Archive size={12} className="text-text-muted shrink-0" />}
            <span className="truncate">{c.title || "New chat"}</span>
          </p>
          <p className="text-xs text-text-muted truncate">{formatTime(c.lastMessageAt)} · {c.messageCount ? `${c.messageCount} msg` : "new"}</p>
        </div>
      </Link>
      <button onClick={onMenu} aria-label={`Actions for ${c.title}`} className="h-9 w-9 grid place-items-center rounded-lg text-text-muted active:bg-white/10 shrink-0">
        <MoreVertical size={18} />
      </button>
    </div>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return d.toLocaleDateString();
}

function MessageSquareIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
