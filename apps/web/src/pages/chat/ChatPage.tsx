import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/lib/cn";
import { chatApi, type ChatMessage, type Conversation, type PromptTemplate } from "@/lib/chat";
import { api } from "@/lib/api";
import { aiApi, type AIHealth } from "@/lib/ai";
import { ChatBubble } from "@/components/ai/ChatBubble";
import { Composer } from "@/components/ai/Composer";
import { ConversationList } from "@/components/ai/ConversationList";
import { useAuthStore } from "@/store/auth";
import { DataBanner } from "@/components/ui/DataBanner";
import { Loader2, Sparkles, PanelLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface AgentMention { id: string; name: string; color: string; emoji: string; role: string }

export function ChatPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { id: paramId } = useParams<{ id?: string }>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  // Initialize activeId from URL param (if any); select handler will also sync URL.
  const [activeId, setActiveId] = useState<string | null>(paramId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [agents, setAgents] = useState<AgentMention[]>([]);
  const [models, setModels] = useState<Array<{ id: string; displayName: string; provider: string }>>([]);
  const [aiHealth, setAiHealth] = useState<AIHealth | null>(null);
  const [loadingConv, setLoadingConv] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Initial load
  useEffect(() => {
    (async () => {
      setLoadingConv(true);
      try {
        const [{ items }, tpl, mdls, dash, health] = await Promise.all([
          chatApi.listConversations(),
          chatApi.listTemplates(),
          chatApi.listModels(),
          fetch("/api/v1/workspace/dashboard", {
            headers: { Authorization: `Bearer ${localStorage.getItem("windels:accessToken") ?? ""}` },
          }).then((r) => r.json()),
          aiApi.getHealth().catch(() => null),
        ]);
        setConversations(items);
        setTemplates(tpl);
        setModels(mdls);
        setAiHealth(health);
        if (dash.ok) setAgents(dash.data.agents.map((a: any) => ({ id: a.id, name: a.name, color: a.color, emoji: a.emoji, role: a.role })));
        // If URL specifies :id, honor it; otherwise auto-select most recent.
        const targetId = paramId ?? (items.length > 0 ? items[0]!.id : null);
        if (targetId) setActiveId(targetId);
      } finally { setLoadingConv(false); }
    })();
  }, []);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    setLoadingMsgs(true);
    chatApi.listMessages(activeId)
      .then(({ messages }) => setMessages(messages))
      .catch(() => setMessages([]))
      .finally(() => setLoadingMsgs(false));
  }, [activeId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  async function newConversation(firstMessage?: string) {
    const c = await chatApi.createConversation({
      title: firstMessage ? firstMessage.slice(0, 60) : "New conversation",
      firstMessage,
    });
    setConversations((cs) => [c, ...cs]);
    setActiveId(c.id);
    setMessages([]);
    navigate(`/app/chat/${c.id}`, { replace: true });
    return c;
  }

  async function handleSend(content: string, agentIds: string[], attachmentIds: string[]) {
    let convId = activeId;
    if (!convId) {
      const c = await newConversation(content);
      convId = c.id;
    }
    if (!convId) return;

    setStreaming(true);
    const userMsg: ChatMessage = {
      id: `pending-${Date.now()}`, role: "user", content, status: "completed",
      createdAt: new Date().toISOString(),
      user: user ? { id: user.id, email: user.email, displayName: user.displayName ?? null, avatarUrl: null } : null,
    };
    const assistantId = `streaming-${Date.now()}`;
    const asstMsg: ChatMessage = {
      id: assistantId, role: "assistant", content: "", status: "streaming", createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg, asstMsg]);
    setStreamingMsgId(assistantId);

    const ac = new AbortController();
    abortRef.current = ac;
    let acc = "";
    let finalId = assistantId;
    try {
      for await (const { event, data } of chatApi.streamMessage(convId, content, { agentIds, attachmentIds, signal: ac.signal })) {
        if (event === "message.created" && data.role === "assistant") {
          finalId = data.id;
          setMessages((m) => m.map((msg) => msg.id === assistantId ? { ...msg, id: finalId } : msg));
        } else if (event === "message.delta") {
          acc += data.delta;
          setMessages((m) => m.map((msg) => msg.id === finalId ? { ...msg, content: acc } : msg));
        } else if (event === "message.done") {
          setMessages((m) => m.map((msg) => msg.id === finalId ? { ...msg, content: data.content ?? acc, status: "completed" } : msg));
          // Refresh conv list (for updated lastMessageAt)
          chatApi.listConversations().then(({ items }) => setConversations(items));
        } else if (event === "message.error") {
          // data.error can be string or {code,message}; normalize
          const errObj = typeof data.error === "object" && data.error ? data.error : null;
          const errMsg = errObj?.message ?? (typeof data.error === "string" ? data.error : data.message ?? "Error");
          setMessages((m) => m.map((msg) => msg.id === finalId ? { ...msg, status: "failed", content: acc || errMsg } : msg));
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages((m) => m.map((msg) => msg.id === finalId ? { ...msg, status: "failed", content: acc || e.message } : msg));
      }
    } finally {
      setStreaming(false);
      setStreamingMsgId(null);
      abortRef.current = null;
    }
  }

  function stop() { abortRef.current?.abort(); }

  async function handleDelete(id: string) {
    if (!id) return;
    if (!confirm("Delete this conversation? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await chatApi.deleteConversation(id);
      setConversations((cs) => cs.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
        navigate("/app/chat", { replace: true });
      }
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete conversation");
    } finally {
      setDeletingId(null);
    }
  }

  function handleSelect(id: string) {
    setActiveId(id);
    navigate(`/app/chat/${id}`, { replace: true });
  }

  async function handleUpload(file: File) {
    const form = new FormData(); form.append("file", file);
    if (activeId) form.append("conversationId", activeId);
    const res = await fetch("/api/v1/attachments", {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("windels:accessToken") ?? ""}` },
      body: form,
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error?.message ?? "upload failed");
    return json.data;
  }

  const active = conversations.find((c) => c.id === activeId);

  return (
    <div className="h-[calc(100vh-56px)] flex overflow-hidden">
      {/* Sidebar */}
      <div className={cn(
        "border-r border-white/5 bg-bg-dark/60 transition-all flex flex-col",
        sidebarOpen ? "w-72" : "w-0 overflow-hidden"
      )}>
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelect}
          onNew={() => newConversation()}
          loading={loadingConv}
        />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="h-14 border-b border-white/5 px-4 flex items-center gap-3">
          <button onClick={() => setSidebarOpen((o) => !o)} className="p-2 rounded-md hover:bg-white/5 text-slate-300">
            <PanelLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-text-bright truncate">
              {active?.title ?? "New conversation"}
            </div>
            {active && <div className="text-[11px] text-text-muted flex items-center gap-2">
              <Badge variant="azure">{active.modelId ?? "windels-assistant"}</Badge>
              <span>{active.participants.length} participant{active.participants.length === 1 ? "" : "s"}</span>
            </div>}
          </div>
          {active && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(active.id)}
              disabled={deletingId === active.id}
              title="Delete conversation"
              aria-label="Delete conversation"
            >
              {deletingId === active.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {aiHealth && !aiHealth.hasRealProvider && (
              <DataBanner
                variant="no-creds"
                title="AI PROVIDER CONFIGURATION REQUIRED"
                message="No real AI provider is configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or OLLAMA_BASE_URL+OLLAMA_MODEL to enable real responses. Until configured, the assistant cannot reply."
              />
            )}
            {!activeId && !loadingConv && (
              <div className="text-center py-20 space-y-4">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-azure/30 to-violet/30 grid place-items-center mx-auto">
                  <Sparkles className="h-8 w-8 text-azure" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-text-bright">Start a conversation</h2>
                  <p className="text-sm text-text-muted mt-1">Ask Windels anything, or @mention an AI employee.</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  {templates.slice(0, 4).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        const content = t.content.replace(/\{\{\s*\w+(?:\|[^}]*)?\s*\}\}/g, "…");
                        handleSend(content, [], []);
                      }}
                      className="text-xs glass px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors text-left max-w-[200px]"
                    >
                      <div className="text-text-bright font-medium">{t.icon} {t.title}</div>
                      {t.description && <div className="text-text-muted mt-0.5 line-clamp-2">{t.description}</div>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {loadingMsgs && (
              <div className="text-center py-12 text-text-muted text-sm flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
              </div>
            )}
            {messages.map((m) => (
              <ChatBubble key={m.id} message={m} streaming={m.id === streamingMsgId} />
            ))}
          </div>
        </div>

        {/* Composer */}
        <div className="max-w-3xl w-full mx-auto">
          <Composer
            onSend={handleSend}
            agents={agents}
            templates={templates}
            loading={streaming}
            disabled={aiHealth?.hasRealProvider === false}
            disabledReason={aiHealth?.hasRealProvider === false ? "Configure an AI provider (OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or OLLAMA_BASE_URL) to send messages." : undefined}
            onUploadFile={handleUpload}
          />
          {streaming && (
            <div className="px-4 pb-2 text-xs text-crimson">
              <button onClick={stop} className="hover:underline inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Stop generating
              </button>
            </div>
          )}
          <div className="px-4 pb-3 text-center text-[11px] text-text-muted">
            Windels may produce inaccurate information. Verify important facts.
          </div>
        </div>
      </div>
    </div>
  );
}
