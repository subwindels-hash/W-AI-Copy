import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, Circle, ListChecks, Plus, X } from "lucide-react";
import { talkApi, type ActionItem } from "@/lib/talk";

interface Props {
  open: boolean;
  channelId?: string | null;
  meetingId?: string | null;
  onClose: () => void;
  onNew?: () => void;
}

const PRIORITY_COLOR: Record<string, string> = {
  low: "text-slate-400",
  medium: "text-amber",
  high: "text-fuchsia",
  urgent: "text-crimson",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

export function ActionItemsSidebar({ open, channelId, meetingId, onClose }: Props) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params: any = { perPage: 50 };
      if (channelId) params.channelId = channelId;
      if (meetingId) params.meetingId = meetingId;
      const r = await talkApi.listActionItems(params);
      setItems(r.items);
    } finally { setLoading(false); }
  }

  useEffect(() => { if (open) load(); }, [open, channelId, meetingId]);
  useEffect(() => {
    const h = () => open && load();
    window.addEventListener("talk:refresh", h);
    return () => window.removeEventListener("talk:refresh", h);
  }, [open, channelId, meetingId]);

  if (!open) return null;

  async function toggleDone(a: ActionItem) {
    await talkApi.updateActionItem(a.id, { status: a.status === "done" ? "OPEN" : "DONE" });
    load();
  }

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await talkApi.createActionItem({
        title: title.trim(),
        channelId: channelId ?? undefined,
        meetingId: meetingId ?? undefined,
      });
      setTitle(""); setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  return (
    <aside className="w-80 shrink-0 h-full flex flex-col bg-bg-dark/80 border-l border-white/5">
      <div className="h-12 shrink-0 px-3 flex items-center justify-between border-b border-white/5">
        <h3 className="text-sm font-semibold text-text-bright inline-flex items-center gap-1.5">
          <ListChecks className="h-4 w-4 text-teal" /> Action items
        </h3>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setShowForm((s) => !s)} title="Add action item" className="p-1.5 rounded hover:bg-white/5 text-text-muted"><Plus className="h-4 w-4" /></button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 text-text-muted"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={createItem} className="p-3 border-b border-white/5 flex flex-col gap-2">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New action item…"
            className="h-9 bg-white/5 border border-white/10 rounded-md px-2.5 text-sm text-text-main placeholder:text-text-muted"
          />
          <div className="flex gap-2 justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" loading={saving}>Add</Button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto py-2">
        {loading && <div className="p-4 text-sm text-text-muted">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="p-6 text-center text-xs text-text-muted">
            No action items yet. Create one from the + button or let the AI notetaker add them from a meeting.
          </div>
        )}
        {items.map((a) => (
          <div key={a.id} className="px-3 py-2 flex gap-2 hover:bg-white/5 group">
            <button onClick={() => toggleDone(a)} className="pt-0.5">
              {a.status === "done"
                ? <CheckCircle2 className="h-4 w-4 text-emerald" />
                : <Circle className={cn("h-4 w-4", PRIORITY_COLOR[a.priority] ?? "text-slate-400")} />
              }
            </button>
            <div className="flex-1 min-w-0">
              <div className={cn("text-sm", a.status === "done" ? "line-through text-text-muted" : "text-slate-200")}>{a.title}</div>
              <div className="text-[11px] text-text-muted flex items-center gap-2 mt-0.5">
                <span className={cn("px-1.5 rounded bg-white/5", PRIORITY_COLOR[a.priority])}>{a.priority}</span>
                <span>{STATUS_LABEL[a.status] ?? a.status}</span>
                {a.dueDate && <span>· due {new Date(a.dueDate).toLocaleDateString()}</span>}
                {a.assignee && <span>· {a.assignee.displayName}</span>}
                {a.meeting && <span className="text-teal">· 📞 {a.meeting.title}</span>}
                {/* Session 122 — AI-extracted items are labelled, never
                    presented as if a person typed them. */}
                {a.aiGenerated && (
                  <span className="rounded bg-violet/15 px-1.5 py-0.5 text-[10px] text-violet" title="Extracted from a meeting transcript by the AI notetaker">
                    AI-extracted
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
