import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import type { ChatMessage } from "@/lib/chat";
import { CheckCircle, Loader2, AlertTriangle } from "lucide-react";

function formatTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

const roleStyles = {
  user: "justify-end",
  assistant: "justify-start",
  system: "justify-center",
  tool: "justify-start",
} as const;

export function ChatBubble({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isFailed = message.status === "failed";

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <div className="text-[11px] text-text-muted italic px-3 py-1 rounded-full bg-white/5">
          {message.content || "system"}
        </div>
      </div>
    );
  }

  const bubbleClass = isUser
    ? "bg-azure/20 text-text-bright rounded-2xl rounded-br-md"
    : isFailed
      ? "bg-crimson/10 border border-crimson/30 text-text-main rounded-2xl rounded-bl-md"
      : "bg-white/5 text-text-main rounded-2xl rounded-bl-md";

  const displayName =
    isUser
      ? message.user?.displayName ?? message.user?.email ?? "You"
      : message.agent?.name ?? "Windels AI";

  const displayAvatar = isUser ? (
    <Avatar name={message.user?.displayName ?? message.user?.email} size={32} />
  ) : message.agent ? (
    <div
      className={cn(
        "h-8 w-8 rounded-full grid place-items-center text-base shrink-0",
        {
          azure: "bg-azure/20", violet: "bg-violet/20", teal: "bg-teal/20",
          fuchsia: "bg-fuchsia/20", amber: "bg-amber/20", emerald: "bg-emerald/20",
          crimson: "bg-crimson/20",
        }[message.agent.color] ?? "bg-white/10"
      )}
    >
      <span>{message.agent.emoji}</span>
    </div>
  ) : (
    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-azure to-violet grid place-items-center text-white font-bold text-sm shrink-0">W</div>
  );

  return (
    <div className={cn("flex gap-2.5 w-full", roleStyles[message.role as keyof typeof roleStyles], isUser && "flex-row-reverse")}>
      {displayAvatar}
      <div className={cn("max-w-[75%] flex flex-col gap-1", isUser && "items-end")}>
        <div className={cn("flex items-center gap-2 text-[11px] text-text-muted px-1", isUser && "flex-row-reverse")}>
          <span className="font-medium text-text-main/80">{displayName}</span>
          <span>{formatTime(message.createdAt)}</span>
          {streaming && <Loader2 className="h-3 w-3 animate-spin text-azure" />}
          {message.status === "completed" && !streaming && <CheckCircle className="h-3 w-3 text-emerald/70" />}
          {isFailed && <AlertTriangle className="h-3 w-3 text-crimson" />}
        </div>
        <div className={cn("px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words", bubbleClass)}>
          {message.content || (streaming ? <span className="text-text-muted">thinking…</span> : "")}
          {streaming && <span className="inline-block w-1.5 h-4 bg-azure/80 ml-0.5 animate-pulse align-middle" />}
        </div>
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {message.attachments.map((a) => (
              <div key={a.id} className="text-[11px] bg-white/5 rounded-md px-2 py-1 text-text-muted inline-flex items-center gap-1">
                📎 {a.filename}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
