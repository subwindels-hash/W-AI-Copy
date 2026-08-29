import { create } from "zustand";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { cn } from "./cn";

type ToastKind = "info" | "success" | "error" | "warning";
interface ToastItem {
  id: string;
  kind: ToastKind;
  title?: string;
  message: string;
  duration: number;
}

interface Store {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, "id">) => string;
  dismiss: (id: string) => void;
}

let idSeq = 0;
export const useToastStore = create<Store>((set) => ({
  toasts: [],
  push: (t) => {
    const id = `t_${++idSeq}`;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    if (t.duration > 0) setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.duration);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(message: string, opts?: Partial<Omit<ToastItem, "id" | "message">>) {
  return useToastStore.getState().push({ message, kind: opts?.kind ?? "info", title: opts?.title, duration: opts?.duration ?? 3500 });
}
toast.success = (m: string, title?: string) => toast(m, { kind: "success", title });
toast.error = (m: string, title?: string) => toast(m, { kind: "error", title, duration: 6000 });
toast.warn = (m: string, title?: string) => toast(m, { kind: "warning", title });
toast.info = (m: string, title?: string) => toast(m, { kind: "info", title });

const styles: Record<ToastKind, { ring: string; icon: string; iconBg: string }> = {
  info: { ring: "border-azure/30", icon: "i", iconBg: "bg-azure/20 text-azure" },
  success: { ring: "border-emerald/30", icon: "✓", iconBg: "bg-emerald/20 text-emerald" },
  error: { ring: "border-crimson/30", icon: "!", iconBg: "bg-crimson/20 text-crimson" },
  warning: { ring: "border-amber/30", icon: "⚠", iconBg: "bg-amber/20 text-amber" },
};

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed z-[100] bottom-4 right-4 flex flex-col gap-2 pointer-events-none" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "pointer-events-auto w-[320px] rounded-xl border bg-bg-dark/95 backdrop-blur-xl shadow-xl px-3 py-3 flex gap-3 items-start",
              styles[t.kind].ring
            )}
            onClick={() => dismiss(t.id)}
          >
            <span className={cn("h-7 w-7 shrink-0 rounded-full grid place-items-center text-sm font-bold", styles[t.kind].iconBg)}>
              {styles[t.kind].icon}
            </span>
            <div className="min-w-0 flex-1">
              {t.title && <div className="text-sm font-semibold text-text-bright">{t.title}</div>}
              <div className="text-xs text-text-main break-words">{t.message}</div>
            </div>
            <button className="text-text-muted hover:text-text-bright text-sm px-1" aria-label="Dismiss" onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}>✕</button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}
