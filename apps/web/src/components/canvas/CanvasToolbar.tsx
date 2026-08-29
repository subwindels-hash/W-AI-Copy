import { useState } from "react";
import type { Canvas } from "@/lib/canvas";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

const BLOCKS = [
  { type: "heading", label: "Heading",   emoji: "H" },
  { type: "text",    label: "Text",      emoji: "T" },
  { type: "sticky",  label: "Sticky",    emoji: "📝" },
  { type: "ai",      label: "AI",        emoji: "✨" },
  { type: "todo",    label: "To-do",     emoji: "✓" },
  { type: "embed",   label: "Embed",     emoji: "🔗" },
];

export function CanvasToolbar({
  canvas, showSidebar, onToggleSidebar, onAddBlock, transform, setTransform, onTitleChange, onTitleBlur,
}: {
  canvas: Canvas | null;
  showSidebar: boolean;
  onToggleSidebar: () => void;
  onAddBlock: (type: string, x?: number, y?: number) => void;
  transform: { x: number; y: number; zoom: number };
  setTransform: (t: any) => void;
  onTitleChange: (t: string) => void;
  onTitleBlur: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  function zoomAt(factor: number) {
    setTransform((t: any) => ({ ...t, zoom: Math.min(2, Math.max(0.3, t.zoom * factor)) }));
  }
  function resetView() {
    setTransform({ x: 80, y: 80, zoom: 1 });
  }

  return (
    <div className="h-14 border-b border-white/10 bg-bg-dark/80 backdrop-blur flex items-center px-4 gap-3 shrink-0">
      <button onClick={onToggleSidebar}
        className={cn("w-8 h-8 rounded flex items-center justify-center hover:bg-white/10 transition", showSidebar ? "text-azure" : "text-text-muted")}
        title="Toggle sidebar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>
      </button>

      {canvas && (
        <Input
          value={canvas.title}
          onChange={(e) => onTitleChange(e.target.value)}
          onBlur={onTitleBlur}
          className="max-w-xs bg-transparent border-transparent hover:border-white/10 focus:border-white/20 font-semibold text-text-bright"
        />
      )}

      <div className="h-6 w-px bg-white/10 mx-2" />

      <div className="relative">
        <Button size="sm" variant="secondary" onClick={() => setMenuOpen((o) => !o)}>+ Add Block</Button>
        {menuOpen && (
          <div className="absolute top-full mt-1 left-0 bg-bg-elevated border border-white/10 rounded-lg shadow-xl p-2 w-48 z-50">
            {BLOCKS.map((b) => (
              <button key={b.type}
                onClick={() => { onAddBlock(b.type, -transform.x / transform.zoom + 200, -transform.y / transform.zoom + 160); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 p-2 rounded hover:bg-white/10 text-sm text-text-main text-left">
                <span className="w-6 text-center">{b.emoji}</span><span>{b.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button onClick={() => zoomAt(1 / 1.2)} className="w-8 h-8 rounded hover:bg-white/10 text-text-muted">−</button>
        <span className="text-xs text-text-muted w-12 text-center">{Math.round(transform.zoom * 100)}%</span>
        <button onClick={() => zoomAt(1.2)} className="w-8 h-8 rounded hover:bg-white/10 text-text-muted">+</button>
        <Button size="sm" variant="ghost" onClick={resetView}>Reset view</Button>
      </div>
    </div>
  );
}
