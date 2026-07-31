import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { CornerDownRight, Pencil, Smile, Trash2, X } from "lucide-react";
import type { TalkMessage } from "@/lib/talk";
import { talkApi } from "@/lib/talk";

const AGENT_COLORS: Record<string, string> = {
  azure: "from-azure/40 to-azure/20 border-azure/30",
  violet: "from-violet/40 to-violet/20 border-violet/30",
  teal: "from-teal/40 to-teal/20 border-teal/30",
  fuchsia: "from-fuchsia/40 to-fuchsia/20 border-fuchsia/30",
  amber: "from-amber/40 to-amber/20 border-amber/30",
  emerald: "from-emerald/40 to-emerald/20 border-emerald/30",
  crimson: "from-crimson/40 to-crimson/20 border-crimson/30",
};

const QUICK_EMOJI = ["👍","❤️","😂","🎉","🔥","✅","👀","🙏"];

interface Props {
  message: TalkMessage;
  currentUserId: string;
  onReply?: (message: TalkMessage) => void;
  onReact?: () => void;
  showThreadButton?: boolean;
  compact?: boolean;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function MessageBubble({ message, currentUserId, onReply, showThreadButton = true, compact }: Props) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const isMine = message.userId === currentUserId;
  const isAI = !!message.agentId;
  const name = isAI ? message.agent?.name ?? "AI" : message.user?.displayName ?? (isMine ? "You" : "User");
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const color = message.agent?.color ?? (isMine ? "azure" : "secondary");
  const isMeeting = message.type === "meeting_summary";

  async function toggle(emoji: string) {
    try {
      await talkApi.toggleReaction(message.id, emoji);
      window.dispatchEvent(new CustomEvent("talk:refresh"));
    } catch {}
    setShowEmoji(false);
  }

  async function saveEdit() {
    if (!editText.trim()) return;
    try {
      await talkApi.editMessage(message.id, editText.trim());
      window.dispatchEvent(new CustomEvent("talk:refresh"));
    } catch {}
    setEditing(false);
  }

  async function deleteMsg() {
    if (!confirm("Delete this message?")) return;
    try {
      await talkApi.deleteMessage(message.id);
      window.dispatchEvent(new CustomEvent("talk:refresh"));
    } catch {}
  }

  const reactions = message.reactions ?? {};
  const myReactors = Object.values(reactions).flat();

  return (
    <div className={cn("group flex gap-2.5 px-4 py-1.5 hover:bg-white/[0.02]", compact && "py-1")}>
      <div className={cn(
        "h-8 w-8 shrink-0 rounded-full grid place-items-center text-[11px] font-semibold",
        isAI
          ? cn("bg-gradient-to-br border", AGENT_COLORS[color] ?? AGENT_COLORS.azure)
          : isMine
            ? "bg-azure/20 text-azure border border-azure/30"
            : "bg-white/10 text-slate-200 border border-white/10"
      )}>
        {isAI ? message.agent?.emoji ?? "🤖" : initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={cn("text-sm font-semibold", isAI ? cn({ azure: "text-azure", violet: "text-violet", teal: "text-teal", fuchsia: "text-fuchsia", amber: "text-amber", emerald: "text-emerald", crimson: "text-crimson" }[color]) : isMine ? "text-azure" : "text-text-bright")}>
            {name}
          </span>
          {isAI && <span className="text-[10px] px-1 py-0.5 rounded bg-violet/15 text-violet/90 border border-violet/20">AI</span>}
          {isMeeting && <span className="text-[10px] px-1 py-0.5 rounded bg-teal/15 text-teal border border-teal/20">Meeting</span>}
          <span className="text-[11px] text-text-muted">{formatTime(message.createdAt)}{message.editedAt ? " · edited" : ""}</span>
        </div>

        {editing ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <textarea
              className="w-full bg-white/5 border border-white/10 rounded-md p-2 text-sm text-text-main resize-none focus:outline-none focus:ring-2 focus:ring-azure/40"
              rows={3}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditText(message.content); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className={cn(
            "text-sm text-slate-200 whitespace-pre-wrap break-words leading-relaxed",
            isMeeting && "bg-teal/5 border border-teal/15 rounded-md p-3"
          )}>
            {message.content || (message.deletedAt ? <em className="text-text-muted text-xs">This message was deleted.</em> : "")}
          </div>
        )}

        {message.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {message.attachments.map((a) => (
              <a
                key={a.id}
                href={`/api/v1/attachments/${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-2 py-1 text-xs text-slate-200"
              >
                📎 <span className="max-w-[200px] truncate">{a.filename}</span>
                <span className="text-text-muted">({(a.sizeBytes/1024).toFixed(1)} KB)</span>
              </a>
            ))}
          </div>
        )}

        {Object.keys(reactions).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {Object.entries(reactions).map(([emoji, reactors]) => (
              <button
                key={emoji}
                onClick={() => toggle(emoji)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border transition-colors",
                  reactors.some((r) => r === `user:${currentUserId}`)
                    ? "bg-azure/20 border-azure/40 text-azure"
                    : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                )}
              >
                <span>{emoji}</span>
                <span className="text-[10px]">{reactors.length}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
          <button
            onClick={() => setShowEmoji((s) => !s)}
            className="p-1 rounded hover:bg-white/10 text-text-muted"
            title="Add reaction"
          >
            <Smile className="h-3.5 w-3.5" />
          </button>
          {onReply && showThreadButton && (
            <button
              onClick={() => onReply(message)}
              className="p-1 rounded hover:bg-white/10 text-text-muted"
              title="Reply in thread"
            >
              <CornerDownRight className="h-3.5 w-3.5" />
            </button>
          )}
          {isMine && !editing && !message.deletedAt && (
            <>
              <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-white/10 text-text-muted" title="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={deleteMsg} className="p-1 rounded hover:bg-crimson/20 text-crimson" title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        {showEmoji && (
          <div className="mt-1 relative z-10 -ml-1">
            <div className="inline-flex items-center gap-0.5 bg-[#162033] border border-white/10 rounded-lg p-1 shadow-lg">
              {QUICK_EMOJI.map((e) => (
                <button key={e} onClick={() => toggle(e)} className="h-7 w-7 rounded hover:bg-white/10 text-sm">{e}</button>
              ))}
              <button onClick={() => setShowEmoji(false)} className="h-7 w-7 rounded hover:bg-white/10 grid place-items-center text-text-muted">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {message.replyCount > 0 && onReply && showThreadButton && (
          <button
            onClick={() => onReply(message)}
            className="mt-1 text-xs text-azure hover:underline inline-flex items-center gap-1"
          >
            <CornerDownRight className="h-3 w-3" />
            {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"} in thread
            {message.lastReplyAt && <span className="text-text-muted">· {formatTime(message.lastReplyAt)}</span>}
          </button>
        )}
      </div>
    </div>
  );
}
