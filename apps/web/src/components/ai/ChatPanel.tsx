import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { X, Maximize2, Loader2, Sparkles } from "lucide-react";
import { ChatBubble } from "./ChatBubble";
import { Composer } from "./Composer";
import { chatApi, type ChatMessage, type Conversation, type PromptTemplate } from "@/lib/chat";
import { useAuthStore } from "@/store/auth";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface AgentMention { id: string; name: string; color: string; emoji: string; role: string }

/**
 * Sliding chat panel (spec §4.1). 400px wide, slides from the right.
 * Uses a "quick conversation" that persists between opens but is separate
 * from the full-screen Chat page's conversation list.
 */
export function ChatPanel({ open, onClose }: Props) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [quickConv, setQuickConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentMention[]>([]);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [tpl] = await Promise.all([chatApi.listTemplates()]);
        setTemplates(tpl);
        // Dashboard agents
        const dash = await fetch("/api/v1/workspace/dashboard", {
          headers: { Authorization: `Bearer ${localStorage.getItem("windels:accessToken") ?? ""}` },
        }).then((r) => r.json());
        if (dash.ok) setAgents(dash.data.agents.map((a: any) => ({ id: a.id, name: a.name, color: a.color, emoji: a.emoji, role: a.role })));
      } catch { /* non-fatal */ }
    })();
  }, [open]);

  useEffect(() => {
    if (!open || quickConv) return;
    // Ensure there's a quick conversation; create if not.
    chatApi.listConversations().then(({ items }) => {
      const quick = items.find((c) => c.title === "Quick Chat");
      if (quick) {
        setQuickConv(quick);
        chatApi.listMessages(quick.id).then(({ messages }) => setMessages(messages));
      } else {
        chatApi.createConversation({ title: "Quick Chat" }).then((c) => {
          setQuickConv(c);
          setMessages([]);
        });
      }
    }).catch(() => {});
  }, [open, quickConv]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  async function handleSend(content: string, agentIds: string[], attachmentIds: string[]) {
    if (!quickConv || streaming) return;
    setStreaming(true);

    const optimisticUser: ChatMessage = {
      id: `pending-${Date.now()}`,
      role: "user",
      content,
      status: "completed",
      createdAt: new Date().toISOString(),
      user: user ? { id: user.id, email: user.email, displayName: user.displayName ?? null, avatarUrl: null } : null,
    };
    const assistantId = `streaming-${Date.now()}`;
    const optimisticAssistant: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimisticUser, optimisticAssistant]);
    setStreamingMsgId(assistantId);

    const ac = new AbortController();
    abortRef.current = ac;

    let currentContent = "";
    let finalId = assistantId;
    try {
      for await (const { event, data } of chatApi.streamMessage(quickConv.id, content, { agentIds, attachmentIds, signal: ac.signal })) {
        if (event === "message.created" && data.role === "assistant") {
          finalId = data.id;
          setMessages((m) => m.map((msg) => msg.id === assistantId ? { ...msg, id: data.id } : msg));
        } else if (event === "message.delta") {
          currentContent += data.delta;
          setMessages((m) => m.map((msg) => msg.id === finalId ? { ...msg, content: currentContent } : msg));
        } else if (event === "message.done") {
          setMessages((m) => m.map((msg) => msg.id === finalId ? { ...msg, content: data.content ?? currentContent, status: "completed" } : msg));
        } else if (event === "message.error") {
          setMessages((m) => m.map((msg) => msg.id === finalId ? { ...msg, status: "failed", content: currentContent || data.error || "Error" } : msg));
        }
      }
    } catch (e: any) {
      setMessages((m) => m.map((msg) => msg.id === finalId ? { ...msg, status: "failed", content: currentContent || e.message } : msg));
    } finally {
      setStreaming(false);
      setStreamingMsgId(null);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <aside
        className={cn(
          "fixed top-[calc(var(--announcement-bar-height)+var(--sat))] right-0 h-[calc(100dvh-var(--announcement-bar-height)-var(--sat))] w-full sm:w-[400px] bg-bg-dark/95 backdrop-blur-xl border-l border-white/10 z-50",
          "flex flex-col shadow-2xl",
          "animate-in slide-in-from-right duration-300"
        )}
        style={{ animation: "slideIn 0.25s ease-out" }}
      >
        <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        {/* Header */}
        <div className="h-14 px-4 flex items-center gap-3 border-b border-white/5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-azure to-violet grid place-items-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-text-bright text-sm">Windels AI</div>
            <div className="text-[11px] text-text-muted">Ask anything · @mention agents</div>
          </div>
          <button
            onClick={() => navigate("/app/chat")}
            className="p-2 rounded-md hover:bg-white/5 text-slate-300"
            title="Open full chat"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-white/5 text-slate-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center text-text-muted gap-3 py-12">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-azure/30 to-violet/30 grid place-items-center">
                <Sparkles className="h-7 w-7 text-azure" />
              </div>
              <div className="text-sm text-text-bright font-medium">Hi, I'm Windels</div>
              <p className="text-xs max-w-[260px]">
                Your AI assistant is ready. Ask a question, start a task, or @mention an AI employee.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <ChatBubble key={m.id} message={m} streaming={m.id === streamingMsgId} />
          ))}
        </div>

        {/* Composer */}
        <Composer
          onSend={handleSend}
          agents={agents}
          templates={templates}
          loading={streaming}
          onUploadFile={async (file) => {
            // Require a conversation first
            const form = new FormData();
            form.append("file", file);
            if (quickConv) form.append("conversationId", quickConv.id);
            const res = await fetch("/api/v1/attachments", {
              method: "POST",
              headers: { Authorization: `Bearer ${localStorage.getItem("windels:accessToken") ?? ""}` },
              body: form,
            });
            const json = await res.json();
            if (!json.ok) throw new Error(json.error?.message ?? "upload failed");
            return json.data;
          }}
          compact
        />
        {streaming && (
          <div className="px-4 pb-2">
            <button onClick={handleStop} className="text-xs text-crimson hover:underline inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Stop generating
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
