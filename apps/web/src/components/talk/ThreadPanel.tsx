import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { X } from "lucide-react";
import { talkApi, type TalkMessage } from "@/lib/talk";
import { MessageBubble } from "./MessageBubble";
import { TalkComposer } from "./TalkComposer";

interface Props {
  channelId: string;
  parent: TalkMessage | null;
  currentUserId: string;
  agents: any[];
  onClose: () => void;
}

export function ThreadPanel({ channelId, parent, currentUserId, agents, onClose }: Props) {
  const [replies, setReplies] = useState<TalkMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!parent) return;
    setLoading(true);
    talkApi.listMessages(channelId, { threadParentId: parent.id, perPage: 50 })
      .then((r) => setReplies(r.items))
      .finally(() => setLoading(false));
  }, [channelId, parent?.id]);

  useEffect(() => {
    if (!parent) return;
    const pid = parent.id;
    const onRefresh = () => {
      talkApi.listMessages(channelId, { threadParentId: pid, perPage: 50 })
        .then((r) => setReplies(r.items));
    };
    window.addEventListener("talk:refresh", onRefresh);
    return () => window.removeEventListener("talk:refresh", onRefresh);
  }, [channelId, parent?.id]);

  if (!parent) return null;
  const pid = parent.id;

  async function sendReply(content: string) {
    setSending(true);
    try {
      await talkApi.sendMessage(channelId, { content, threadParentId: pid });
      const r = await talkApi.listMessages(channelId, { threadParentId: pid, perPage: 50 });
      setReplies(r.items);
      window.dispatchEvent(new CustomEvent("talk:refresh"));
    } finally { setSending(false); }
  }

  return (
    <aside className="w-80 shrink-0 h-full flex flex-col bg-bg-dark/80 border-l border-white/5">
      <div className="h-12 shrink-0 px-3 flex items-center justify-between border-b border-white/5">
        <h3 className="text-sm font-semibold text-text-bright">Thread</h3>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 text-text-muted"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        <div className="border-b border-white/5 pb-2">
          <MessageBubble message={parent} currentUserId={currentUserId} showThreadButton={false} />
        </div>
        <div className="py-1">
          <div className="px-4 py-2 text-[11px] uppercase tracking-widest text-text-muted">{replies.length} {replies.length === 1 ? "reply" : "replies"}</div>
          {loading && <div className="px-4 py-4 text-sm text-text-muted">Loading…</div>}
          {replies.map((r) => (
            <MessageBubble key={r.id} message={r} currentUserId={currentUserId} showThreadButton={false} compact />
          ))}
        </div>
      </div>
      <TalkComposer onSend={sendReply} agents={agents} loading={sending} placeholder="Reply in thread…" />
    </aside>
  );
}
