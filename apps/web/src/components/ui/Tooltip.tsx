import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  delay?: number;
  className?: string;
}

export function Tooltip({ content, children, side = "top", delay = 300, className }: Props) {
  const [open, setOpen] = useState(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const show = () => { timer = setTimeout(() => setOpen(true), delay); };
  const hide = () => { if (timer) clearTimeout(timer); setOpen(false); };
  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-white/10 bg-bg-elevated/95 px-2 py-1 text-xs text-text-bright shadow-lg backdrop-blur",
            side === "top" && "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
            side === "bottom" && "top-full left-1/2 -translate-x-1/2 mt-1.5",
            side === "left" && "right-full top-1/2 -translate-y-1/2 mr-1.5",
            side === "right" && "left-full top-1/2 -translate-y-1/2 ml-1.5",
            className
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
