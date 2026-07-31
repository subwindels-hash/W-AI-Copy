import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Hash, Lock, MessageSquare, Plus, Search, UserPlus, Video } from "lucide-react";
import type { TalkChannel } from "@/lib/talk";

interface Props {
  channels: TalkChannel[];
  activeChannelId?: string | null;
  onSelect: (channel: TalkChannel) => void;
  onCreateChannel: () => void;
  onCreateDM: () => void;
  onNewMeeting: () => void;
}

export function ChannelSidebar({ channels, activeChannelId, onSelect, onCreateChannel, onCreateDM, onNewMeeting }: Props) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => channels.filter((c) => c.displayName.toLowerCase().includes(q.toLowerCase())),
    [channels, q]
  );
  const dms = filtered.filter((c) => c.type === "dm");
  const publics = filtered.filter((c) => c.type === "channel" && c.access === "public");
  const privates = filtered.filter((c) => c.type === "channel" && c.access === "private");

  return (
    <aside className="w-64 shrink-0 h-full flex flex-col bg-bg-dark border-r border-white/5">
      <div className="p-3 border-b border-white/5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-text-bright tracking-tight">Windels Talk</h2>
          <div className="flex items-center gap-0.5">
            <button onClick={onNewMeeting} title="Start a meeting" className="p-1.5 rounded hover:bg-white/5 text-slate-300"><Video className="h-4 w-4" /></button>
            <button onClick={onCreateDM} title="New DM" className="p-1.5 rounded hover:bg-white/5 text-slate-300"><UserPlus className="h-4 w-4" /></button>
            <button onClick={onCreateChannel} title="New channel" className="p-1.5 rounded hover:bg-white/5 text-slate-300"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-full h-7 pl-7 pr-2 bg-white/5 border border-white/10 rounded-md text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-azure/40"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-3">
        <Section label="Channels" count={publics.length}>
          {publics.map((c) => (
            <ChannelItem key={c.id} channel={c} active={activeChannelId === c.id} onClick={() => onSelect(c)} />
          ))}
        </Section>
        {privates.length > 0 && (
          <Section label="Private" count={privates.length}>
            {privates.map((c) => (
              <ChannelItem key={c.id} channel={c} active={activeChannelId === c.id} onClick={() => onSelect(c)} />
            ))}
          </Section>
        )}
        <Section label="Direct Messages" count={dms.length}>
          {dms.map((c) => (
            <ChannelItem key={c.id} channel={c} active={activeChannelId === c.id} onClick={() => onSelect(c)} />
          ))}
        </Section>
      </div>
    </aside>
  );
}

function Section({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mt-3 px-1">
      <div className="flex items-center justify-between px-2 mb-0.5">
        <span className="text-[11px] uppercase tracking-wider text-text-muted font-medium">{label}</span>
        <span className="text-[10px] text-text-muted">{count}</span>
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function ChannelItem({ channel, active, onClick }: { channel: TalkChannel; active: boolean; onClick: () => void }) {
  const isDM = channel.type === "dm";
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors w-full text-left",
        active ? "bg-white/10 text-text-bright" : "text-slate-300 hover:bg-white/5"
      )}
    >
      {isDM ? (
        <MessageSquare className="h-3.5 w-3.5 text-text-muted" />
      ) : channel.access === "private" ? (
        <Lock className="h-3.5 w-3.5 text-text-muted" />
      ) : (
        <Hash className="h-3.5 w-3.5 text-text-muted" />
      )}
      <span className="truncate flex-1">{channel.displayName}</span>
      {channel.messagesCount > 0 && !active && (
        <span className="text-[10px] text-text-muted">{channel.messagesCount > 99 ? "99+" : channel.messagesCount}</span>
      )}
    </button>
  );
}
