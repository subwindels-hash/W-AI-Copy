import { useCallback, useEffect, useRef, useState } from "react";
import { ChannelSidebar } from "@/components/talk/ChannelSidebar";
import { MessageBubble } from "@/components/talk/MessageBubble";
import { TalkComposer } from "@/components/talk/TalkComposer";
import { ThreadPanel } from "@/components/talk/ThreadPanel";
import { ActionItemsSidebar } from "@/components/talk/ActionItemsSidebar";
import { CreateChannelModal } from "@/components/talk/CreateChannelModal";
import { MeetingModal } from "@/components/talk/MeetingModal";
import { talkApi, type TalkChannel, type TalkMessage } from "@/lib/talk";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Hash, Info, ListChecks, Lock, MessageSquare, Radio, SendHorizontal, Users, Video } from "lucide-react";
import { useAuthStore } from "@/store/auth";

interface OrgUser { id: string; displayName: string; email: string }

export default function TalkPage() {
  const user = useAuthStore((s) => s.user)!;
  const [channels, setChannels] = useState<TalkChannel[]>([]);
  const [active, setActive] = useState<TalkChannel | null>(null);
  const [messages, setMessages] = useState<TalkMessage[]>([]);
  const [threadParent, setThreadParent] = useState<TalkMessage | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [modal, setModal] = useState<null | "channel" | "dm" | "meeting">(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollTimer = useRef<number | null>(null);
  const lastMsgId = useRef<string | null>(null);

  const loadChannels = useCallback(async () => {
    const r = await talkApi.listChannels({ perPage: 100 });
    setChannels(r.items);
    // Auto-select first channel if none active
    if (!active && r.items.length > 0) setActive(r.items[0]!);
    // Auto-select matching by id if stale
    if (active) {
      const fresh = r.items.find((c) => c.id === active.id) ?? null;
      if (fresh) setActive(fresh);
    }
  }, [active]);

  const loadMessages = useCallback(async (channelId: string) => {
    setLoadingMessages(true);
    try {
      const r = await talkApi.listMessages(channelId, { perPage: 100 });
      setMessages(r.items);
      lastMsgId.current = r.items[0]?.id ?? null;
    } finally { setLoadingMessages(false); }
  }, []);

  // Initial load
  useEffect(() => {
    loadChannels();
    talkApi.availableAgents().then(setAgents).catch(() => {});
    api.get<OrgUser[]>("/admin/users").then((u) => setOrgUsers(u)).catch(() => {
      // Fallback: fetch org users via me endpoint; if admin-only, fallback to empty.
      setOrgUsers([]);
    });
  }, []);

  // When channel changes, load messages
  useEffect(() => {
    if (active) loadMessages(active.id);
  }, [active?.id, loadMessages]);

  // Poll for new messages every 4s (MVP; WebSocket arrives in a later session)
  useEffect(() => {
    if (!active) return;
    const tick = async () => {
      try {
        const r = await talkApi.listMessages(active.id, { perPage: 100 });
        const latest = r.items;
        if (latest[0]?.id !== lastMsgId.current) {
          setMessages(latest);
          lastMsgId.current = latest[0]?.id ?? null;
          scrollToBottom();
        }
      } catch {}
    };
    pollTimer.current = window.setInterval(tick, 4000);
    return () => { if (pollTimer.current) window.clearInterval(pollTimer.current); };
  }, [active?.id]);

  // Refresh on talk:refresh event
  useEffect(() => {
    const h = () => { if (active) loadMessages(active.id); loadChannels(); };
    window.addEventListener("talk:refresh", h);
    return () => window.removeEventListener("talk:refresh", h);
  }, [active?.id, loadChannels, loadMessages]);

  // Scroll to bottom when messages change
  useEffect(() => { scrollToBottom(); }, [messages.length]);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }

  async function handleSend(content: string, opts: { attachmentIds?: string[] } = {}) {
    if (!active) return;
    setSending(true);
    try {
      await talkApi.sendMessage(active.id, { content, attachmentIds: opts.attachmentIds });
      const r = await talkApi.listMessages(active.id, { perPage: 100 });
      setMessages(r.items);
      lastMsgId.current = r.items[0]?.id ?? null;
      scrollToBottom();
    } finally { setSending(false); }
  }

  async function handleUpload(file: File) {
    const form = new FormData();
    form.append("file", file);
    const token = useAuthStore.getState().accessToken;
    const res = await fetch(import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/attachments` : "/api/v1/attachments", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const body = await res.json();
    if (!res.ok || !body.ok) throw new Error(body?.error?.message ?? "Upload failed");
    return body.data;
  }

  async function createSeededChannels() {
    // Ensure a #general channel exists for the org the first time Talk is opened.
    if (channels.some((c) => c.type === "channel")) return;
    try {
      await talkApi.createChannel({ type: "CHANNEL", name: "general", topic: "Company-wide announcements and watercooler chat." });
      await loadChannels();
    } catch {}
  }
  useEffect(() => { createSeededChannels(); }, [channels.length]);

  const mentionAgents = agents.map((a) => ({ id: a.id, name: a.name, color: a.color, emoji: a.emoji, role: a.role }));

  return (
    <div className="flex h-full w-full bg-bg-deep text-text-main">
      <div className="flex flex-1 min-w-0">
        <ChannelSidebar
          channels={channels}
          activeChannelId={active?.id}
          onSelect={(c) => setActive(c)}
          onCreateChannel={() => setModal("channel")}
          onCreateDM={() => setModal("dm")}
          onNewMeeting={() => setModal("meeting")}
        />

        {/* Main chat column */}
        <div className="flex-1 min-w-0 flex flex-col bg-bg-deep">
          {active ? (
            <>
              {/* Header */}
              <div className="h-12 shrink-0 border-b border-white/5 bg-bg-dark/60 backdrop-blur px-4 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  {active.type === "dm" ? (
                    <MessageSquare className="h-4 w-4 text-text-muted" />
                  ) : active.access === "private" ? (
                    <Lock className="h-4 w-4 text-text-muted" />
                  ) : (
                    <Hash className="h-4 w-4 text-text-muted" />
                  )}
                  <h2 className="font-semibold text-text-bright truncate">{active.displayName}</h2>
                  {active.topic && <span className="text-xs text-text-muted truncate hidden md:inline">— {active.topic}</span>}
                  <Badge variant={active.type === "dm" ? "violet" : "default"} className="ml-2">
                    <Users className="h-3 w-3 mr-0.5" />{active.membersCount}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setModal("meeting")} className="p-2 rounded hover:bg-white/5 text-teal inline-flex items-center gap-1 text-xs" title="Start meeting">
                    <Radio className="h-4 w-4" /> <span className="hidden md:inline">Meet</span>
                  </button>
                  <button onClick={() => setShowActions((s) => !s)} className={`p-2 rounded hover:bg-white/5 ${showActions ? "bg-white/10 text-teal" : "text-text-muted"}`} title="Action items">
                    <ListChecks className="h-4 w-4" />
                  </button>
                  <button onClick={() => setShowInfo((s) => !s)} className={`p-2 rounded hover:bg-white/5 ${showInfo ? "bg-white/10 text-azure" : "text-text-muted"}`} title="Channel info">
                    <Info className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto">
                {loadingMessages && messages.length === 0 ? (
                  <div className="p-8 text-sm text-text-muted text-center">Loading messages…</div>
                ) : messages.length === 0 ? (
                  <EmptyChannel channel={active} onMeet={() => setModal("meeting")} />
                ) : (
                  <>
                    <div className="py-4">
                      <div className="px-4 pb-3 border-b border-white/5 mb-2">
                        <div className="text-xs text-text-muted">
                          {active.type === "dm" ? "This is the beginning of your direct message history" : `Welcome to #${active.displayName.replace(/^#/, "")}`}
                        </div>
                        {active.topic && <div className="text-sm text-slate-300 mt-1">{active.topic}</div>}
                      </div>
                      {messages.slice().reverse().map((m) => (
                        <MessageBubble
                          key={m.id}
                          message={m}
                          currentUserId={user.id}
                          onReply={(msg) => setThreadParent(msg)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Composer */}
              <TalkComposer
                onSend={handleSend}
                agents={mentionAgents}
                loading={sending}
                onUploadFile={handleUpload}
                placeholder={active.type === "dm" ? `Message ${active.peer?.displayName ?? active.displayName}…` : `Message #${active.displayName.replace(/^#/, "")}…`}
              />
            </>
          ) : (
            <EmptyTalk onFirst={() => setModal("channel")} />
          )}
        </div>

        {threadParent && active && (
          <ThreadPanel
            channelId={active.id}
            parent={threadParent}
            currentUserId={user.id}
            agents={mentionAgents}
            onClose={() => setThreadParent(null)}
          />
        )}
        {showActions && active && !threadParent && (
          <ActionItemsSidebar
            open
            channelId={active.id}
            onClose={() => setShowActions(false)}
          />
        )}
        {showInfo && active && <ChannelInfoPanel channel={active} onClose={() => setShowInfo(false)} />}
      </div>

      <CreateChannelModal
        open={modal === "channel" || modal === "dm"}
        mode={modal === "dm" ? "dm" : "channel"}
        users={orgUsers.length ? orgUsers : channels.flatMap((c) => c.members.filter((m) => m.user).map((m) => ({ id: m.user!.id, displayName: m.user!.displayName, email: m.user!.email }))).filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i)}
        agents={agents}
        onClose={() => setModal(null)}
        onCreated={(c) => { loadChannels(); setActive(c); }}
      />
      <MeetingModal
        open={modal === "meeting"}
        channelId={active?.id}
        agents={agents}
        onClose={() => setModal(null)}
        onCreated={() => { loadChannels(); window.dispatchEvent(new CustomEvent("talk:refresh")); }}
      />
    </div>
  );
}

function EmptyTalk({ onFirst }: { onFirst: () => void }) {
  return (
    <div className="flex-1 grid place-items-center p-10 text-center">
      <div className="max-w-md">
        <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-azure to-violet grid place-items-center text-3xl">💬</div>
        <h2 className="mt-4 text-2xl font-bold text-text-bright">Windels Talk</h2>
        <p className="mt-2 text-sm text-text-muted">DMs, channels, AI teammates, meetings with AI notetaker — all in one place.</p>
        <Button onClick={onFirst} className="mt-5">Create your first channel</Button>
      </div>
    </div>
  );
}

function EmptyChannel({ channel, onMeet }: { channel: TalkChannel; onMeet: () => void }) {
  return (
    <div className="h-full grid place-items-center p-10 text-center">
      <div className="max-w-md">
        <div className="h-16 w-16 mx-auto rounded-2xl bg-white/5 grid place-items-center text-3xl">
          {channel.type === "dm" ? <MessageSquare className="h-8 w-8 text-violet" /> : <Hash className="h-8 w-8 text-azure" />}
        </div>
        <h2 className="mt-4 text-xl font-semibold text-text-bright">Start the conversation</h2>
        <p className="mt-1 text-sm text-text-muted">No messages yet. Be the first to say hi — AI teammates are listening.</p>
        <Button onClick={onMeet} variant="secondary" className="mt-4"><Video className="h-4 w-4 mr-1.5" />Start a meeting</Button>
      </div>
    </div>
  );
}

function ChannelInfoPanel({ channel, onClose }: { channel: TalkChannel; onClose: () => void }) {
  return (
    <aside className="w-72 shrink-0 h-full flex flex-col bg-bg-dark/80 border-l border-white/5">
      <div className="h-12 shrink-0 px-3 flex items-center justify-between border-b border-white/5">
        <h3 className="text-sm font-semibold text-text-bright inline-flex items-center gap-1.5"><Info className="h-4 w-4 text-azure" /> Details</h3>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 text-text-muted">✕</button>
      </div>
      <div className="p-4 space-y-4 overflow-y-auto">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted">Name</div>
          <div className="text-sm text-text-bright flex items-center gap-1">
            {channel.type === "dm" ? <MessageSquare className="h-3.5 w-3.5" /> : channel.access === "private" ? <Lock className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
            {channel.displayName}
          </div>
        </div>
        {channel.topic && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Topic</div>
            <div className="text-sm text-slate-200">{channel.topic}</div>
          </div>
        )}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Members ({channel.members.length})</div>
          <div className="space-y-1.5">
            {channel.members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-sm">
                <div className="h-6 w-6 rounded-full bg-white/10 grid place-items-center text-[10px]">
                  {m.agent ? m.agent.emoji : (m.user?.displayName ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <span className={m.agent ? "text-violet" : "text-slate-200"}>
                  {m.agent ? m.agent.name : m.user?.displayName}
                </span>
                {m.agent && <Badge variant="violet" className="ml-auto text-[9px]">AI</Badge>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
