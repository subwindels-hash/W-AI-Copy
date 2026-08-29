import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Item {
  label: ReactNode;
  onSelect?: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

interface Props {
  trigger: ReactNode;
  items: Item[];
  align?: "start" | "end";
  className?: string;
}

export function Dropdown({ trigger, items, align = "end", className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-50 mt-1 min-w-[160px] rounded-lg border border-white/10 bg-bg-elevated/95 backdrop-blur-xl shadow-xl py-1 animate-in",
            align === "end" ? "right-0" : "left-0"
          )}
        >
          {items.map((it, i) =>
            it.separator ? (
              <div key={i} className="h-px bg-white/10 my-1" />
            ) : (
              <button
                key={i}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => { it.onSelect?.(); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition",
                  "hover:bg-white/10",
                  it.danger ? "text-crimson hover:bg-crimson/10" : "text-text-main",
                  it.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent"
                )}
              >
                {it.icon && <span className="text-text-muted">{it.icon}</span>}
                <span className="flex-1">{it.label}</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
