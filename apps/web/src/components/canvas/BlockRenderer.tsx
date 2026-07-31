import { useState, useEffect, useRef } from "react";
import type { CanvasBlock } from "@/lib/canvas";
import { cn } from "@/lib/cn";

const colorBg: Record<string, string> = {
  azure: "bg-azure/15 border-azure/40",
  violet: "bg-violet/15 border-violet/40",
  teal: "bg-teal/15 border-teal/40",
  fuchsia: "bg-fuchsia/15 border-fuchsia/40",
  amber: "bg-amber/15 border-amber/50",
  emerald: "bg-emerald/15 border-emerald/40",
  crimson: "bg-crimson/15 border-crimson/40",
  slate: "bg-white/5 border-white/10",
};

export function BlockRenderer(props: {
  block: CanvasBlock;
  selected: boolean;
  connecting: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onChange: (patch: Partial<CanvasBlock>) => void;
  onDelete: () => void;
  onRunAI: () => void;
  onHandleOut: (e: React.MouseEvent) => void;
  onCancelConnect: () => void;
}) {
  const { block, selected, connecting, onMouseDown, onMouseUp, onChange, onDelete, onRunAI, onHandleOut } = props;
  const [editing, setEditing] = useState(false);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selected) return;
      if (e.key === "Escape") props.onCancelConnect();
      if ((e.key === "Delete" || e.key === "Backspace") && !editing) onDelete();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, editing, onDelete, props.onCancelConnect]);

  const c = block.content as any;
  const bgClass = colorBg[c.color] ?? (block.type === "sticky" ? colorBg.amber : colorBg.slate);
  const borderClass = selected ? "ring-2 ring-azure shadow-lg shadow-azure/20" : "border";

  function renderContent() {
    switch (block.type) {
      case "heading":
        return (
          <textarea
            ref={textRef}
            value={c.text ?? ""}
            onChange={(e) => onChange({ content: { ...c, text: e.target.value } })}
            onFocus={() => setEditing(true)} onBlur={() => setEditing(false)}
            className="w-full h-full bg-transparent text-2xl font-bold text-text-bright resize-none outline-none"
            placeholder="Heading…"
          />
        );
      case "text":
        return (
          <textarea
            ref={textRef}
            value={c.text ?? ""}
            onChange={(e) => onChange({ content: { ...c, text: e.target.value } })}
            onFocus={() => setEditing(true)} onBlur={() => setEditing(false)}
            className="w-full h-full bg-transparent text-sm text-text-main resize-none outline-none leading-relaxed"
            placeholder="Start writing…"
          />
        );
      case "sticky":
        return (
          <textarea
            ref={textRef}
            value={c.text ?? ""}
            onChange={(e) => onChange({ content: { ...c, text: e.target.value } })}
            onFocus={() => setEditing(true)} onBlur={() => setEditing(false)}
            className="w-full h-full bg-transparent text-sm text-amber-50/90 resize-none outline-none"
            placeholder="Note…"
          />
        );
      case "ai":
        return (
          <div className="flex flex-col h-full gap-2">
            <div className="flex items-center gap-2 text-xs text-violet">
              <span>✨</span><span className="uppercase tracking-wide font-medium">AI Block</span>
              {c.streaming && <span className="ml-auto text-[11px] animate-pulse">generating…</span>}
            </div>
            <textarea
              value={c.prompt ?? ""}
              onChange={(e) => onChange({ content: { ...c, prompt: e.target.value } })}
              onFocus={() => setEditing(true)} onBlur={() => setEditing(false)}
              rows={2}
              className="w-full bg-white/5 rounded p-2 text-xs text-text-main resize-none outline-none"
              placeholder="Ask the AI to generate content…"
            />
            <div className="flex-1 overflow-y-auto text-sm text-text-main bg-white/5 rounded p-2 whitespace-pre-wrap">
              {c.result || <span className="text-text-muted">Generated result will appear here.</span>}
              {c.error && <div className="text-crimson text-xs mt-1">{c.error}</div>}
            </div>
            <button onClick={onRunAI} className="text-xs py-1 rounded bg-violet/20 text-violet hover:bg-violet/30 transition">
              {c.result ? "Regenerate" : "Generate"}
            </button>
          </div>
        );
      case "embed":
        return (
          <div className="flex flex-col h-full gap-2">
            <input
              value={c.url ?? ""}
              onChange={(e) => onChange({ content: { ...c, url: e.target.value, title: c.title } })}
              className="w-full bg-white/5 rounded px-2 py-1 text-xs text-text-main outline-none"
              placeholder="Paste URL or embed code…"
            />
            {c.url ? (
              <div className="flex-1 rounded bg-white/5 flex items-center justify-center text-xs text-text-muted overflow-hidden">
                {c.url.startsWith("http") ? (
                  <a href={c.url} target="_blank" rel="noreferrer" className="text-azure underline truncate px-2">{c.url}</a>
                ) : <span>Embed preview</span>}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-text-muted">🔗 Enter a URL to embed</div>
            )}
          </div>
        );
      case "todo":
        return (
          <div className="flex flex-col h-full gap-1 overflow-y-auto">
            <div className="text-xs uppercase tracking-wide text-emerald font-medium mb-1">✓ To-do</div>
            {(c.items ?? []).map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!item.done}
                  onChange={(e) => {
                    const items = [...(c.items ?? [])];
                    items[i] = { ...items[i], done: e.target.checked };
                    onChange({ content: { ...c, items } });
                  }}
                  className="accent-emerald" />
                <input
                  value={item.text ?? ""}
                  onChange={(e) => {
                    const items = [...(c.items ?? [])];
                    items[i] = { ...items[i], text: e.target.value };
                    onChange({ content: { ...c, items } });
                  }}
                  onFocus={() => setEditing(true)} onBlur={() => setEditing(false)}
                  className={cn("flex-1 bg-transparent outline-none text-sm", item.done ? "line-through text-text-muted" : "text-text-main")}
                />
                <button onClick={(e) => { e.stopPropagation(); const items = [...(c.items ?? [])]; items.splice(i, 1); onChange({ content: { ...c, items } }); }}
                  className="text-text-muted hover:text-crimson text-xs">×</button>
              </div>
            ))}
            <button
              onClick={(e) => { e.stopPropagation(); onChange({ content: { ...c, items: [...(c.items ?? []), { text: "", done: false }] } }); }}
              className="text-xs text-emerald hover:text-emerald/80 mt-1 text-left">+ Add item</button>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div
      data-block
      className={cn(
        "absolute rounded-xl backdrop-blur-sm shadow-lg transition-shadow",
        bgClass, borderClass,
        connecting && "ring-2 ring-amber/60"
      )}
      style={{ left: block.x, top: block.y, width: block.width, height: block.height, zIndex: block.zIndex }}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
    >
      <div className="p-3 h-full relative">
        {/* Resize handle (bottom-right) */}
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
          onMouseDown={(e) => {
            e.stopPropagation();
            const startX = e.clientX, startY = e.clientY;
            const startW = block.width, startH = block.height;
            function move(ev: MouseEvent) {
              const w = Math.max(160, startW + (ev.clientX - startX));
              const h = Math.max(100, startH + (ev.clientY - startY));
              onChange({ width: w, height: h });
            }
            function up() {
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
            }
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
        >
          <svg viewBox="0 0 10 10" className="w-3 h-3 absolute bottom-1 right-1 text-white/30"><path d="M9 1 L1 9 M9 5 L5 9 M9 9 L9 9" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
        </div>
        {/* Out handle (right-middle) */}
        <div
          className="absolute top-1/2 -right-2 w-4 h-4 rounded-full bg-azure border-2 border-bg-dark -translate-y-1/2 cursor-crosshair hover:scale-110 transition"
          onMouseDown={(e) => { e.stopPropagation(); onHandleOut(e); }}
          title="Drag to connect"
        />
        {selected && (
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-crimson text-white text-xs flex items-center justify-center shadow-md hover:scale-110 transition">×</button>
        )}
        {renderContent()}
      </div>
    </div>
  );
}
