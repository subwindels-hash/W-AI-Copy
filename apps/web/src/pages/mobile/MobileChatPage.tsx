import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Paperclip, Send, Smile } from "lucide-react";
import { MAvatar } from "@/components/mobile/MAvatar";
import { api } from "@/lib/api";
import { streamSSE } from "@/lib/sse";
import { useAuthStore } from "@/store/auth";
import { useHaptics } from "@/app/mobile/hooks/useHaptics";
import { cn } from "@/lib/cn";

type Msg = { id: string; role: "user" | "assistant" | "system"; content: string; pending?: boolean; error?: boolean; createdAt?: string };

export function MobileChatPage({ listMode = false }: { listMode?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const [convoId, setConvoId] = useState<string | null>(id ?? null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [title, setTitle] = useState("New chat");
  const scrollRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);
  const nav = useNavigate();
  const h = useHaptics();

  // Load conversation when id changes
  useEffect(() => {
    if (!convoId) {
      // Fresh chat — no load.
      setMessages([]);
      setTitle("New chat");
      return;
    }
    let active = true;
    api.get<any>(`/conversations/${convoId}`).then((c) => {
      if (!active) return;
      setTitle(c.title || "Chat");
    }).catch(() => {});
    api.get<Msg[]>(`/conversations/${convoId}/messages?limit=100`).then((m) => {
      if (!active) return;
      setMessages(m.map((x) => ({ ...x })));
    }).catch(() => {});
    return () => { active = false; };
  }, [convoId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    h.medium();
    let cid = convoId;
    if (!cid) {
      const created = await api.post<{ id: string; title: string }>("/conversations", { title: text.slice(0, 48) });
      cid = created.id;
      setConvoId(cid);
      setTitle(created.title);
    }
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: text, createdAt: new Date().toISOString() };
    const aiMsg: Msg = { id: crypto.randomUUID(), role: "assistant", content: "", pending: true, createdAt: new Date().toISOString() };
    setMessages((m) => [...m, userMsg, aiMsg]);
    setStreaming(true);

    // Persist user message first
    try {
      await api.post(`/conversations/${cid}/messages`, { role: "user", content: text });
    } catch { /* ignore */ }

    try {
      let first = true;
      let acc = "";
      for await (const { event, data } of streamSSE(`/api/v1/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${useAuthStore.getState().accessToken}` },
        body: JSON.stringify({ conversationId: cid, content: text, stream: true }),
      })) {
        if (event === "token" && typeof data?.token === "string") {
          acc += data.token;
          if (first) { h.light(); first = false; }
          setMessages((m) => m.map((x) => x.id === aiMsg.id ? { ...x, content: acc, pending: false } : x));
        }
        if (event === "done") break;
        if (event === "error") throw new Error(data?.message || "Stream error");
      }
      setMessages((m) => m.map((x) => x.id === aiMsg.id ? { ...x, pending: false } : x));
    } catch (e: any) {
      setMessages((m) => m.map((x) => x.id === aiMsg.id ? { ...x, pending: false, error: true, content: x.content || e?.message || "Error" } : x));
      h.error();
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex flex-col h-screen w-full">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-bg-dark/90 backdrop-blur-xl border-b border-white/5 flex items-center gap-2 px-2 py-2"
        style={{ paddingTop: "max(8px, var(--sat))" }}
      >
        <button
          onClick={() => nav(listMode ? "/m" : "/m/chat")}
          className="h-10 w-10 grid place-items-center rounded-full active:bg-white/10 text-text-main"
          aria-label="Back"
        >
          <ArrowLeft size={22} />
        </button>
        <MAvatar name={title || "W"} color="#8B5CF6" size="sm" status="online" />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-text-bright truncate leading-tight">{title}</p>
          <p className="text-[11px] text-emerald-400 leading-tight">Windels AI · Online</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-text-muted text-sm mt-20">
            <div className="h-20 w-20 rounded-full bg-gradient-to-br from-azure-500 to-violet-500 grid place-items-center mx-auto mb-4 shadow-xl">
              <span className="text-white font-black text-3xl">W</span>
            </div>
            <p className="text-text-bright font-semibold text-lg">How can I help today?</p>
            <p className="text-text-muted mt-1 text-sm">Ask anything — or @mention an AI employee.</p>
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} userName={user?.displayName ?? user?.email ?? "You"} />
        ))}
        {streaming && messages[messages.length - 1]?.content === "" && (
          <div className="flex">
            <div className="bg-bg-elevated rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
              <Dot delay={0} /> <Dot delay={150} /> <Dot delay={300} />
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-white/5 bg-bg-dark/90 backdrop-blur px-3 pt-2 pb-[max(12px,var(--sab))]">
        <div className="flex items-end gap-2 bg-white/5 border border-white/10 rounded-3xl px-2 py-1.5">
          <button className="h-10 w-10 flex-shrink-0 grid place-items-center rounded-full text-text-muted active:bg-white/10" aria-label="Attach">
            <Paperclip size={20} />
          </button>
          <textarea
            rows={1}
            value={input}
            onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Message Windels AI…"
            className="flex-1 resize-none bg-transparent outline-none text-[15px] text-text-main placeholder:text-text-muted py-2 max-h-[120px] leading-5"
          />
          <button className="h-10 w-10 flex-shrink-0 grid place-items-center rounded-full text-text-muted active:bg-white/10" aria-label="Emoji">
            <Smile size={20} />
          </button>
          <button
            onClick={send}
            disabled={!input.trim() || streaming}
            className={cn(
              "h-10 w-10 flex-shrink-0 grid place-items-center rounded-full transition",
              input.trim() && !streaming ? "bg-azure-500 text-white active:scale-95" : "bg-white/10 text-text-muted"
            )}
            aria-label="Send"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ msg, userName }: { msg: Msg; userName: string }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex items-end gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && <MAvatar name="Windels" color="#3B82F6" size="sm" />}
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug whitespace-pre-wrap break-words shadow",
          isUser
            ? "bg-azure-500 text-white rounded-br-sm"
            : "bg-bg-elevated text-text-main border border-white/5 rounded-bl-sm",
          msg.error && "border-crimson/50 bg-crimson/10"
        )}
      >
        {msg.content}
      </div>
      {isUser && <MAvatar name={userName} color="#10B981" size="sm" />}
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="h-2 w-2 rounded-full bg-text-muted inline-block"
      style={{ animation: `windels-bounce 1.2s infinite ${delay}ms` }}
    />
  );
}
