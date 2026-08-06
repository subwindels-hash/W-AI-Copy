import { useEffect, useState } from "react";
import { agentsApi, type Agent, type AgentEvent, type AgentMemory, type AgentKnowledge } from "@/lib/agents";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

const COLORS = [
  { id: "azure", cls: "bg-azure" },
  { id: "violet", cls: "bg-violet" },
  { id: "teal", cls: "bg-teal" },
  { id: "fuchsia", cls: "bg-fuchsia" },
  { id: "amber", cls: "bg-amber" },
  { id: "emerald", cls: "bg-emerald" },
  { id: "crimson", cls: "bg-crimson" },
];

const COLOR_BG: Record<string, string> = {
  azure: "bg-azure/20", violet: "bg-violet/20", teal: "bg-teal/20", fuchsia: "bg-fuchsia/20",
  amber: "bg-amber/20", emerald: "bg-emerald/20", crimson: "bg-crimson/20",
};

type Tab = "profile" | "memories" | "knowledge" | "activity";

export function AgentEditor(props: {
  agent?: Agent | null;
  creating?: boolean;
  onClose?: () => void;
  onSaved: (a: Agent) => void;
  onDeleted?: () => void;
  onAssign?: () => void;
}) {
  const { agent, creating, onClose, onSaved, onDeleted, onAssign } = props;

  const [tab, setTab] = useState<Tab>("profile");
  const [form, setForm] = useState({
    name: agent?.name ?? "",
    role: agent?.role ?? "",
    emoji: agent?.emoji ?? "🤖",
    color: agent?.color ?? "azure",
    description: agent?.description ?? "",
    systemPrompt: agent?.systemPrompt ?? "",
    department: agent?.department ?? "General",
    temperature: agent?.temperature ?? 0.7,
    modelId: agent?.modelId ?? "",
    capabilities: (agent?.capabilities ?? []).join(", "),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memories tab state
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [newMemory, setNewMemory] = useState("");
  // Knowledge tab state
  const [knowledge, setKnowledge] = useState<AgentKnowledge[]>([]);
  const [newKTitle, setNewKTitle] = useState("");
  const [newKContent, setNewKContent] = useState("");
  // Activity
  const [events, setEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    if (!agent || creating) return;
    agentsApi.memories.list(agent.id).then((r) => setMemories(r.items)).catch(() => {});
    agentsApi.knowledge.list(agent.id).then((r) => setKnowledge(r.items)).catch(() => {});
    agentsApi.events(agent.id, { perPage: 30 }).then((r) => setEvents(r.items)).catch(() => {});
  }, [agent?.id, creating]);

  async function save() {
    setSaving(true); setError(null);
    try {
      const payload = {
        name: form.name, role: form.role, emoji: form.emoji, color: form.color,
        description: form.description, systemPrompt: form.systemPrompt,
        department: form.department, temperature: Number(form.temperature),
        modelId: form.modelId || undefined,
        capabilities: form.capabilities.split(",").map((s) => s.trim()).filter(Boolean),
      };
      const a = creating
        ? await agentsApi.create(payload as any)
        : await agentsApi.update(agent!.id, payload as any);
      onSaved(a);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function del() {
    if (!agent) return;
    if (!confirm(`Delete AI employee "${agent.name}"?`)) return;
    await agentsApi.delete(agent.id);
    onDeleted?.();
  }

  async function addMemory() {
    if (!agent || !newMemory.trim()) return;
    const m = await agentsApi.memories.create(agent.id, { content: newMemory, type: "FACT", importance: 0.6 });
    setMemories((prev) => [m, ...prev]);
    setNewMemory("");
  }

  async function delMemory(id: string) {
    if (!agent) return;
    await agentsApi.memories.delete(agent.id, id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  async function addKnowledge() {
    if (!agent || !newKTitle.trim() || !newKContent.trim()) return;
    const k = await agentsApi.knowledge.create(agent.id, { title: newKTitle, content: newKContent, type: "SNIPPET" });
    setKnowledge((prev) => [k, ...prev]);
    setNewKTitle(""); setNewKContent("");
  }

  async function delKnowledge(id: string) {
    if (!agent) return;
    await agentsApi.knowledge.delete(agent.id, id);
    setKnowledge((prev) => prev.filter((k) => k.id !== id));
  }

  const bgClass = COLOR_BG[form.color] ?? COLOR_BG.azure;

  return (
    <div className="p-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center text-3xl", bgClass)}>
            {form.emoji}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-text-bright">
              {creating ? "New AI Employee" : agent?.name}
            </h2>
            <p className="text-sm text-text-muted">
              {creating ? "Configure your new team member" : agent?.role}
              {agent?.department ? ` · ${agent.department}` : ""}
            </p>
            {agent && (
              <div className="flex items-center gap-2 mt-1">
                <span className={cn("inline-block w-2 h-2 rounded-full",
                  agent.status === "working" ? "bg-amber animate-pulse" :
                  agent.status === "online" ? "bg-emerald" :
                  agent.status === "error" ? "bg-crimson" : "bg-slate-500")} />
                <span className="text-xs text-text-muted capitalize">{agent.status}</span>
                {agent.isBuiltIn && <Badge variant="secondary" className="text-[10px]">built-in</Badge>}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onClose && <Button variant="ghost" onClick={onClose}>Close</Button>}
          {!creating && agent && !agent.isBuiltIn && <Button variant="danger" onClick={del}>Delete</Button>}
          {!creating && agent && onAssign && <Button onClick={onAssign}>Assign Task</Button>}
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : (creating ? "Create" : "Save")}</Button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-crimson/10 border border-crimson/30 text-crimson text-sm">{error}</div>}

      {/* Tabs */}
      {!creating && (
        <div className="flex gap-1 mb-4 border-b border-white/10">
          {(["profile","memories","knowledge","activity"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 transition -mb-px",
                tab === t ? "border-azure text-text-bright" : "border-transparent text-text-muted hover:text-text-main"
              )}
            >
              {t === "profile" ? "Profile" : t === "memories" ? `Memory (${memories.length})` : t === "knowledge" ? `Knowledge (${knowledge.length})` : `Activity (${events.length})`}
            </button>
          ))}
        </div>
      )}

      {(creating || tab === "profile") && (
        <Card className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Executor" />
            </Field>
            <Field label="Role">
              <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Task Executor" />
            </Field>
            <Field label="Emoji">
              <Input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} maxLength={4} />
            </Field>
            <Field label="Department">
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </Field>
            <Field label="Temperature" hint="0 = deterministic, 2 = creative">
              <input type="range" min={0} max={2} step={0.1} value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })}
                className="w-full accent-azure" />
              <span className="text-xs text-text-muted">{form.temperature.toFixed(1)}</span>
            </Field>
            <Field label="Color">
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button key={c.id}
                    onClick={() => setForm({ ...form, color: c.id })}
                    className={cn("w-8 h-8 rounded-full ring-2 transition", c.cls, form.color === c.id ? "ring-white" : "ring-transparent")} />
                ))}
              </div>
            </Field>
            <Field label="Capabilities" hint="Comma-separated" full>
              <Input value={form.capabilities} onChange={(e) => setForm({ ...form, capabilities: e.target.value })} placeholder="research, code, analyze" />
            </Field>
            <Field label="Description" full>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-azure/40" />
            </Field>
            <Field label="System Prompt" full hint="Defines how this employee behaves">
              <textarea value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                rows={6}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-text-main font-mono focus:outline-none focus:ring-2 focus:ring-azure/40" />
            </Field>
          </div>
          {agent?.stats && (
            <div className="grid grid-cols-5 gap-3 pt-4 border-t border-white/10">
              <Stat label="Tasks" value={agent.stats.tasks} />
              <Stat label="Messages" value={agent.stats.messages} />
              <Stat label="Memories" value={agent.stats.memories} />
              <Stat label="Knowledge" value={agent.stats.knowledge} />
              <Stat label="Events" value={agent.stats.events} />
            </div>
          )}
        </Card>
      )}

      {!creating && tab === "memories" && (
        <Card className="p-6 space-y-4">
          <div className="flex gap-2">
            <Input value={newMemory} onChange={(e) => setNewMemory(e.target.value)}
              placeholder="Teach this employee a fact, preference, or procedure…"
              onKeyDown={(e) => e.key === "Enter" && addMemory()} />
            <Button onClick={addMemory}>Add Memory</Button>
          </div>
          <div className="space-y-2">
            {memories.length === 0 && <p className="text-sm text-text-muted">No memories yet. Add one above.</p>}
            {memories.map((m) => (
              <div key={m.id} className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary">{m.type}</Badge>
                    <span className="text-[11px] text-text-muted">importance {m.importance.toFixed(2)}</span>
                  </div>
                  <p className="text-sm text-text-main">{m.content}</p>
                </div>
                <button onClick={() => delMemory(m.id)} className="text-text-muted hover:text-crimson text-xs">Delete</button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!creating && tab === "knowledge" && (
        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <Input value={newKTitle} onChange={(e) => setNewKTitle(e.target.value)} placeholder="Knowledge title (e.g. Q3 Product Strategy)" />
            <textarea value={newKContent} onChange={(e) => setNewKContent(e.target.value)}
              rows={4} placeholder="Paste document content, notes, instructions…"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-azure/40" />
            <Button onClick={addKnowledge}>Add to Knowledge Base</Button>
          </div>
          <div className="space-y-2">
            {knowledge.length === 0 && <p className="text-sm text-text-muted">No knowledge yet.</p>}
            {knowledge.map((k) => (
              <div key={k.id} className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-text-bright text-sm">{k.title}</span>
                      <Badge variant="secondary">{k.type}</Badge>
                      <span className="text-[11px] text-text-muted">~{k.tokens} tokens</span>
                    </div>
                    <p className="text-xs text-text-muted">{k.contentPreview}</p>
                  </div>
                  <button onClick={() => delKnowledge(k.id)} className="text-text-muted hover:text-crimson text-xs">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!creating && tab === "activity" && (
        <Card className="p-6">
          <div className="space-y-3">
            {events.length === 0 && <p className="text-sm text-text-muted">No activity yet.</p>}
            {events.map((e) => (
              <div key={e.id} className="flex gap-3 items-start">
                <div className="w-2 h-2 rounded-full bg-azure mt-1.5 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge>{e.type.replace(/_/g, " ")}</Badge>
                    <span className="text-[11px] text-text-muted">{new Date(e.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-text-main mt-1">{e.message}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Field(props: { label: string; hint?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1", props.full && "col-span-2")}>
      <label className="text-xs font-medium text-text-muted uppercase tracking-wide">{props.label}</label>
      {props.children}
      {props.hint && <p className="text-[11px] text-text-muted">{props.hint}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center p-2 rounded-lg bg-white/5">
      <div className="text-xl font-semibold text-text-bright">{value}</div>
      <div className="text-[11px] text-text-muted uppercase tracking-wide">{label}</div>
    </div>
  );
}
