import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { X } from "lucide-react";
import { talkApi } from "@/lib/talk";

interface Agent { id: string; name: string; emoji: string; color: string; role: string; isBuiltIn: boolean }

interface Props {
  open: boolean;
  channelId?: string | null;
  agents: Agent[];
  onClose: () => void;
  onCreated: (m: any) => void;
}

export function MeetingModal({ open, channelId, agents, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [instant, setInstant] = useState(true);
  const [notetakerAgentId, setNotetakerAgentId] = useState<string>("");
  const [aiPartIds, setAiPartIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(""); setDesc(""); setScheduledStart(""); setInstant(true); setNotetakerAgentId(""); setAiPartIds([]); setError(null);
      const coord = agents.find((a) => a.name.toLowerCase().includes("coordinator"));
      if (coord) setNotetakerAgentId(coord.id);
    }
  }, [open, agents]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Meeting title is required"); return; }
    setLoading(true); setError(null);
    try {
      const m = await talkApi.createMeeting({
        title: title.trim(),
        description: desc.trim() || undefined,
        channelId: channelId ?? undefined,
        scheduledStart: instant ? undefined : scheduledStart ? new Date(scheduledStart).toISOString() : undefined,
        notetakerAgentId: notetakerAgentId || undefined,
        agentParticipantIds: aiPartIds,
      });
      onCreated(m);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Failed to create meeting");
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
      <form onSubmit={submit} className="glass w-full max-w-md p-5 flex flex-col gap-3 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-bright">Start a meeting</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/5 text-text-muted"><X className="h-4 w-4" /></button>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">Title</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 bg-white/5 border border-white/10 rounded-md px-3 text-text-main" placeholder="Weekly sync" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">Description (optional)</span>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-text-main resize-none" />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setInstant(true)} className={`flex-1 h-9 rounded-md border text-sm ${instant ? "bg-teal/20 border-teal/40 text-teal" : "bg-white/5 border-white/10 text-slate-300"}`}>Start now</button>
          <button type="button" onClick={() => setInstant(false)} className={`flex-1 h-9 rounded-md border text-sm ${!instant ? "bg-teal/20 border-teal/40 text-teal" : "bg-white/5 border-white/10 text-slate-300"}`}>Schedule</button>
        </div>
        {!instant && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">When</span>
            <input type="datetime-local" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} className="h-10 bg-white/5 border border-white/10 rounded-md px-3 text-text-main" />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">AI notetaker</span>
          <select value={notetakerAgentId} onChange={(e) => setNotetakerAgentId(e.target.value)} className="h-10 bg-white/5 border border-white/10 rounded-md px-3 text-text-main">
            <option value="">None</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name} — {a.role}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">AI participants</span>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
            {agents.map((a) => (
              <button type="button" key={a.id} onClick={() => setAiPartIds((ids) => ids.includes(a.id) ? ids.filter((x) => x !== a.id) : [...ids, a.id])}
                className={`px-2 py-1 rounded-full text-xs border ${aiPartIds.includes(a.id) ? "bg-violet/20 border-violet/40 text-violet" : "bg-white/5 border-white/10 text-slate-300"}`}>
                {a.emoji} {a.name}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="text-xs text-crimson">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{instant ? "Start meeting" : "Schedule"}</Button>
        </div>
      </form>
    </div>
  );
}
