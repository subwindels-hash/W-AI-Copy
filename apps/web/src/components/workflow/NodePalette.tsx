import { NODE_TEMPLATES, newNodeId, type FlowNode } from "@/lib/workflow";
import { cn } from "@/lib/cn";

interface Props {
  onAdd: (node: FlowNode) => void;
}

export function NodePalette({ onAdd }: Props) {
  function add(type: (typeof NODE_TEMPLATES)[number]) {
    onAdd({
      id: newNodeId(),
      type: type.type,
      x: 200 + Math.random() * 200,
      y: 160 + Math.random() * 120,
      label: type.label,
      config: { ...type.defaultConfig },
    });
  }
  return (
    <div className="p-3">
      <div className="text-[10px] uppercase tracking-widest text-text-muted mb-2">Node Library</div>
      <div className="space-y-1">
        {NODE_TEMPLATES.map((t) => (
          <button
            key={t.type}
            onClick={() => add(t)}
            className={cn(
              "w-full flex items-center gap-2 p-2 rounded-lg text-left text-sm",
              "border border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/15 transition"
            )}
          >
            <span className="h-7 w-7 shrink-0 grid place-items-center rounded-md text-sm" style={{ background: `${t.color}20`, color: t.color }}>
              {t.icon}
            </span>
            <span className="min-w-0 flex-1">
              <div className="text-text-bright text-sm font-medium">{t.label}</div>
              <div className="text-[11px] text-text-muted truncate">{t.description}</div>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-4 p-2 rounded-lg bg-white/[0.02] border border-white/5">
        <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">Tips</div>
        <ul className="text-[11px] text-text-muted space-y-0.5 list-disc list-inside">
          <li>Drag canvas to pan</li>
          <li>Ctrl+scroll to zoom</li>
          <li>Drag the colored dot to connect nodes</li>
          <li>Click a connection to delete it</li>
          <li>Use {"{{path}}"} in messages/prompts to inject context</li>
        </ul>
      </div>
    </div>
  );
}
