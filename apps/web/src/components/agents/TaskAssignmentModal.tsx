import { useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Agent } from "@/lib/agents";

export function TaskAssignmentModal({ agent, onClose, onAssigned }: { agent: Agent; onClose: () => void; onAssigned: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"LOW"|"MEDIUM"|"HIGH"|"URGENT">("MEDIUM");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) { setError("Title is required"); return; }
    setSubmitting(true); setError(null);
    try {
      await api.post("/workspace/tasks", { title: title.trim(), description: description.trim() || undefined, priority, agentId: agent.id });
      onAssigned();
    } catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-text-bright mb-1">Assign task to {agent.name}</h3>
        <p className="text-sm text-text-muted mb-4">{agent.emoji} {agent.role} will execute this using their configured model and memory.</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wide">Task title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Draft Q3 roadmap" autoFocus />
          </div>
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wide">Details</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-azure/40"
              placeholder="Describe the task clearly enough for the agent to execute…" />
          </div>
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wide">Priority</label>
            <div className="flex gap-2 mt-1">
              {(["LOW","MEDIUM","HIGH","URGENT"] as const).map((p) => (
                <button key={p} onClick={() => setPriority(p)}
                  className={
                    "px-3 py-1 rounded-full text-xs font-medium transition border " +
                    (priority === p
                      ? "bg-azure/20 border-azure text-azure"
                      : "bg-white/5 border-white/10 text-text-muted hover:text-text-main")
                  }>{p}</button>
              ))}
            </div>
          </div>
          {error && <div className="text-sm text-crimson">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Assigning…" : "Assign Task"}</Button>
        </div>
      </Card>
    </div>
  );
}
