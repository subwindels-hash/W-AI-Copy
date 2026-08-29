import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { FlowEdge, FlowNode } from "@/lib/workflow";
import { cn } from "@/lib/cn";
import { useState } from "react";

interface Props {
  node: FlowNode;
  edges: FlowEdge[];
  channels?: { id: string; name: string }[];
  agents?: { id: string; name: string }[];
  onChange: (patch: Partial<FlowNode>) => void;
  onDelete: () => void;
  onAddEdgeCondition: (edgeId: string, condition: "true" | "false" | "") => void;
}

export function NodeInspector({ node, edges, channels, agents, onChange, onDelete, onAddEdgeCondition }: Props) {
  const c = node.config ?? {};
  const outEdges = edges.filter((e) => e.fromId === node.id);

  function setConfig(patch: Record<string, any>) {
    onChange({ config: { ...c, ...patch } });
  }

  return (
    <div className="p-4 space-y-4 text-sm">
      <div>
        <label className="text-[11px] uppercase tracking-widest text-text-muted">Label</label>
        <Input value={node.label} onChange={(e) => onChange({ label: e.target.value })} className="mt-1" />
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-widest text-text-muted mb-1">Type</div>
        <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-text-main">{node.type}</div>
      </div>

      {node.type === "TRIGGER" && (
        <div>
          <label className="text-[11px] uppercase tracking-widest text-text-muted">Trigger type</label>
          <select
            value={c.trigger ?? "manual"}
            onChange={(e) => setConfig({ trigger: e.target.value })}
            className="mt-1 w-full rounded-md border border-white/10 bg-bg-deep px-3 py-2 text-text-main text-sm"
          >
            <option value="manual">Manual</option>
            <option value="schedule">Schedule</option>
            <option value="event">Event</option>
            <option value="webhook">Webhook</option>
          </select>
        </div>
      )}

      {node.type === "ACTION" && (
        <ActionEditor config={c} channels={channels} agents={agents} setConfig={setConfig} />
      )}

      {node.type === "AI" && (
        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-widest text-text-muted">Prompt</label>
            <textarea
              value={c.prompt ?? ""}
              onChange={(e) => setConfig({ prompt: e.target.value })}
              placeholder="Describe what this AI step should do. Use {{path}} for variables."
              className="mt-1 w-full h-24 rounded-md border border-white/10 bg-bg-deep px-3 py-2 text-text-main text-sm resize-none"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-text-muted">System prompt (optional)</label>
            <textarea
              value={c.systemPrompt ?? ""}
              onChange={(e) => setConfig({ systemPrompt: e.target.value })}
              placeholder="Override the default system prompt"
              className="mt-1 w-full h-20 rounded-md border border-white/10 bg-bg-deep px-3 py-2 text-text-main text-sm resize-none"
            />
          </div>
        </div>
      )}

      {node.type === "CONDITION" && (
        <div>
          <label className="text-[11px] uppercase tracking-widest text-text-muted">Expression</label>
          <Input value={c.expr ?? "true"} onChange={(e) => setConfig({ expr: e.target.value })} className="mt-1 font-mono text-xs" placeholder="e.g. input.score > 80" />
          <p className="text-[11px] text-text-muted mt-1">Supports ==, !=, &lt;, &gt;, &lt;=, &gt;= and truthy paths like `input.approved`. Connect outgoing edges and tag them true/false below.</p>
          <div className="mt-2 space-y-1">
            {outEdges.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-xs">
                <span className="text-text-muted">→ edge</span>
                {(["true", "false", ""] as const).map((b) => (
                  <button
                    key={b || "none"}
                    onClick={() => onAddEdgeCondition(e.id, b)}
                    className={cn(
                      "px-2 py-0.5 rounded border text-[11px]",
                      (e.condition ?? "") === b
                        ? b === "true" ? "border-emerald/60 bg-emerald/10 text-emerald"
                          : b === "false" ? "border-crimson/60 bg-crimson/10 text-crimson"
                          : "border-white/20 bg-white/10 text-text-bright"
                        : "border-white/10 text-text-muted hover:text-text-main"
                    )}
                  >
                    {b === "" ? "always" : b}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {node.type === "LOOP" && (
        <div>
          <label className="text-[11px] uppercase tracking-widest text-text-muted">Collection path</label>
          <Input value={c.collectionPath ?? "items"} onChange={(e) => setConfig({ collectionPath: e.target.value })} className="mt-1 font-mono text-xs" />
          <p className="text-[11px] text-text-muted mt-1">Iterates over the list at this context path (max 20 items). Loop body is the nodes connected to this output.</p>
        </div>
      )}

      {node.type === "APPROVAL" && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.requireHuman !== false} onChange={(e) => setConfig({ requireHuman: e.target.checked })} />
            <span>Require human approval</span>
          </label>
          <label className="text-[11px] uppercase tracking-widest text-text-muted block">Prompt</label>
          <Input value={c.prompt ?? ""} onChange={(e) => setConfig({ prompt: e.target.value })} />
        </div>
      )}

      {node.type === "DELAY" && (
        <div>
          <label className="text-[11px] uppercase tracking-widest text-text-muted">Delay (ms)</label>
          <Input type="number" min={0} max={60000} value={c.delayMs ?? 1000} onChange={(e) => setConfig({ delayMs: Number(e.target.value) })} className="mt-1" />
        </div>
      )}

      <div className="pt-2 border-t border-white/10">
        <Button variant="danger" size="sm" onClick={onDelete} className="w-full">Delete node</Button>
      </div>
    </div>
  );
}

function ActionEditor({
  config, channels, agents, setConfig,
}: {
  config: Record<string, any>;
  channels?: { id: string; name: string }[];
  agents?: { id: string; name: string }[];
  setConfig: (p: Record<string, any>) => void;
}) {
  const action = config.action ?? "log";
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] uppercase tracking-widest text-text-muted">Action</label>
        <select
          value={action}
          onChange={(e) => setConfig({ action: e.target.value })}
          className="mt-1 w-full rounded-md border border-white/10 bg-bg-deep px-3 py-2 text-text-main text-sm"
        >
          <option value="log">Log a message</option>
          <option value="sendMessage">Send Talk message</option>
          <option value="createTask">Create task</option>
          <option value="createActionItem">Create action item</option>
          <option value="httpRequest">HTTP request (webhook)</option>
        </select>
      </div>

      {action === "log" && (
        <div>
          <label className="text-[11px] uppercase tracking-widest text-text-muted">Message</label>
          <Input value={config.message ?? ""} onChange={(e) => setConfig({ message: e.target.value })} placeholder="Log text" />
        </div>
      )}

      {action === "sendMessage" && (
        <>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-text-muted">Channel</label>
            <select value={config.channelId ?? ""} onChange={(e) => setConfig({ channelId: e.target.value })} className="mt-1 w-full rounded-md border border-white/10 bg-bg-deep px-3 py-2 text-text-main text-sm">
              <option value="">— select channel —</option>
              {channels?.map((ch) => <option key={ch.id} value={ch.id}># {ch.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-text-muted">Message</label>
            <textarea value={config.message ?? ""} onChange={(e) => setConfig({ message: e.target.value })} placeholder="Use {{path}} for template variables" className="mt-1 w-full h-20 rounded-md border border-white/10 bg-bg-deep px-3 py-2 text-text-main text-sm resize-none" />
          </div>
        </>
      )}

      {action === "createTask" && (
        <>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-text-muted">Title</label>
            <Input value={config.title ?? ""} onChange={(e) => setConfig({ title: e.target.value })} placeholder="Task title" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-text-muted">Description</label>
            <textarea value={config.description ?? ""} onChange={(e) => setConfig({ description: e.target.value })} className="mt-1 w-full h-16 rounded-md border border-white/10 bg-bg-deep px-3 py-2 text-text-main text-sm resize-none" />
          </div>
        </>
      )}

      {action === "createActionItem" && (
        <>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-text-muted">Title</label>
            <Input value={config.title ?? ""} onChange={(e) => setConfig({ title: e.target.value })} placeholder="Action item title" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-text-muted">Channel (optional)</label>
            <select value={config.channelId ?? ""} onChange={(e) => setConfig({ channelId: e.target.value })} className="mt-1 w-full rounded-md border border-white/10 bg-bg-deep px-3 py-2 text-text-main text-sm">
              <option value="">— none —</option>
              {channels?.map((ch) => <option key={ch.id} value={ch.id}># {ch.name}</option>)}
            </select>
          </div>
        </>
      )}

      {action === "httpRequest" && (
        <>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-text-muted">Method</label>
            <select value={config.method ?? "GET"} onChange={(e) => setConfig({ method: e.target.value })} className="mt-1 w-full rounded-md border border-white/10 bg-bg-deep px-3 py-2 text-text-main text-sm">
              <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-text-muted">URL</label>
            <Input value={config.url ?? ""} onChange={(e) => setConfig({ url: e.target.value })} placeholder="https://..." />
          </div>
        </>
      )}
    </div>
  );
}
