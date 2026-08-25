import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { siteApi, type SpChatReply } from "@/lib/sitePlatform";
import { useSitePublic } from "@/lib/useSitePublic";

const APP_PREFIXES = ["/app", "/admin", "/platform", "/m", "/d"];

export function VisitorChat() {
  const loc = useLocation();
  const site = useSitePublic();
  const avatar = site.brand.chatAvatar;
  const fallback = site.brand.chatAvatarFallback;
  const hidden = APP_PREFIXES.some((p) => loc.pathname === p || loc.pathname.startsWith(`${p}/`));
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [healthNote, setHealthNote] = useState<string | null>(null);
  const [session, setSession] = useState<SpChatReply | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void siteApi.chatHealth().then((h) => setHealthNote(h.note)).catch(() => {});
  }, []);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [session?.messages.length, open]);

  if (hidden) return null;

  const send = async () => {
    const msg = text.trim();
    if (!msg || busy) return;
    setBusy(true);
    setText("");
    const startedAt = new Date().toISOString();
    setSession((prev) => ({
      conversationId: prev?.conversationId ?? "pending",
      reply: "",
      source: prev?.source ?? "UNCONFIGURED",
      links: prev?.links ?? [],
      messages: [
        ...(prev?.messages ?? []),
        { role: "user", content: msg, at: startedAt },
        { role: "assistant", content: "", at: startedAt },
      ],
    }));
    try {
      const next = await siteApi.streamChat(msg, session?.conversationId, (event, data) => {
        if (event === "token" && typeof data?.text === "string") {
          setSession((prev) => {
            if (!prev) return prev;
            const messages = prev.messages.slice();
            const last = messages[messages.length - 1];
            if (last?.role === "assistant") messages[messages.length - 1] = { ...last, content: last.content + data.text };
            return { ...prev, reply: (prev.reply ?? "") + data.text, messages };
          });
        }
        if (event === "meta" && data?.conversationId) {
          setSession((prev) => prev ? { ...prev, conversationId: data.conversationId, source: data.source ?? prev.source, links: data.links ?? prev.links } : prev);
        }
      });
      setSession(next);
    } catch {
      try {
        const fallback = session
          ? await siteApi.chatMessage(session.conversationId, msg)
          : await siteApi.startChat(msg);
        setSession(fallback);
      } catch (e) {
        setSession((prev) => ({
          conversationId: prev?.conversationId ?? "local",
          reply: e instanceof Error ? e.message : "The assistant is unavailable.",
          source: "UNCONFIGURED",
          links: [{ href: "/contact", label: "Contact" }],
          messages: [
            ...(prev?.messages ?? []).filter((m) => m.content),
            { role: "user", content: msg, at: startedAt },
            { role: "assistant", content: e instanceof Error ? e.message : "Unavailable.", at: new Date().toISOString() },
          ],
        }));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed right-4 z-[250] flex flex-col items-end gap-2" style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
      {open ? (
        <div className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/15 bg-bg-elevated shadow-2xl">
          <div className="flex items-center gap-3 border-b border-white/10 bg-bg-dark px-3 py-2">
            <div className="relative">
              <img src={avatar} alt="" className="h-10 w-10 rounded-full object-cover bg-navy-deep" onError={(e) => { (e.currentTarget as HTMLImageElement).src = fallback; }} />
              <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-emerald ring-2 ring-bg-dark" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-text-bright">{site.brand.chatName}</div>
              <div className="truncate text-[11px] text-text-muted">{healthNote ?? "Ask about the product, pricing, or how to sign in."}</div>
            </div>
            <button className="text-text-muted hover:text-white" onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
          </div>
          <div ref={scroller} className="max-h-80 space-y-2 overflow-y-auto px-3 py-3 text-sm">
            <div className="rounded-xl bg-white/5 px-3 py-2 text-text-main">Hello! How can I help you today?</div>
            {(session?.messages ?? []).map((m, i) => (
              m.content || (busy && i === (session?.messages.length ?? 0) - 1) ? (
              <div key={i} className={`rounded-xl px-3 py-2 ${m.role === "user" ? "ml-8 bg-azure/20 text-white" : "mr-4 bg-white/5 text-text-main"}`}>
                {m.content || "…"}
              </div>
              ) : null
            ))}
            {busy ? <div className="text-xs text-text-muted">{session?.reply ? "Streaming…" : "Thinking…"}</div> : null}
          </div>
          <form className="flex gap-2 border-t border-white/10 p-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <input
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-text-bright"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message…"
            />
            <button type="submit" disabled={busy || !text.trim()} className="rounded-lg bg-azure-600 px-3 text-sm font-semibold text-white disabled:opacity-40">Send</button>
          </form>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-bg-elevated shadow-xl"
        aria-label="Open WINDELS AI Assistant"
      >
        <img src="/brand/ai-assistant-avatar.png" alt="" className="h-12 w-12 rounded-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/brand/ai-assistant-fallback.png"; }} />
      </button>
    </div>
  );
}
