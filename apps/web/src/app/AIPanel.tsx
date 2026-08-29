import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { Sparkles } from "lucide-react";

const STORAGE_KEY = "windels:orb-position";

/**
 * The floating AI Orb (spec §4.1). Draggable, bottom-right by default,
 * opens the slide-out ChatPanel on click. Position persists in localStorage.
 */
export function AIPanel() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return { x: 24, y: 24 }; // inset from bottom-right
  });
  const dragging = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const orbRef = useRef<HTMLButtonElement>(null);
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  }, [pos]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - dragging.current.startX;
    const dy = e.clientY - dragging.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragging.current.moved = true;
    // x/y are insets from right/bottom
    setPos({
      x: Math.max(8, Math.min(window.innerWidth - 80, dragging.current.origX - dx)),
      y: Math.max(8, Math.min(window.innerHeight - 80, dragging.current.origY - dy)),
    });
  }
  function onPointerUp() {
    const wasClick = !dragging.current?.moved;
    dragging.current = null;
    if (wasClick) {
      setOpen(true);
      setPulse(false);
    }
  }

  return (
    <>
      <button
        ref={orbRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          "fixed z-30 h-14 w-14 rounded-full",
          "bg-gradient-to-br from-azure to-violet text-white shadow-2xl shadow-azure/40",
          "grid place-items-center cursor-grab active:cursor-grabbing select-none",
          "transition-transform hover:scale-110",
          "after:content-[''] after:absolute after:inset-0 after:rounded-full after:ring-2 after:ring-azure/50 after:animate-ping after:opacity-40"
        )}
        style={{ right: pos.x, bottom: pos.y }}
        aria-label="Open AI assistant"
      >
        <Sparkles className="h-6 w-6 relative z-10" />
        {pulse && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald ring-2 ring-bg-deep" />
        )}
      </button>
      <ChatPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
