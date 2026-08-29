import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface TabsCtx {
  value: string;
  setValue: (v: string) => void;
  idBase: string;
}
const Ctx = createContext<TabsCtx | null>(null);

export function Tabs({
  defaultValue, value, onValueChange, children, className,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const v = value ?? internal;
  const idBase = useId();
  return (
    <Ctx.Provider value={{
      value: v,
      setValue: (nv) => { setInternal(nv); onValueChange?.(nv); },
      idBase,
    }}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex p-1 rounded-lg bg-white/5 border border-white/10 gap-1", className)}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const ctx = useContext(Ctx)!;
  const active = ctx.value === value;
  return (
    <button
      role="tab"
      type="button"
      aria-selected={active}
      id={`${ctx.idBase}-t-${value}`}
      aria-controls={`${ctx.idBase}-p-${value}`}
      onClick={() => ctx.setValue(value)}
      className={cn(
        "px-3 py-1.5 text-sm rounded-md transition",
        active ? "bg-white/10 text-text-bright shadow-sm" : "text-text-muted hover:text-text-main",
        className
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const ctx = useContext(Ctx)!;
  if (ctx.value !== value) return null;
  return (
    <div role="tabpanel" id={`${ctx.idBase}-p-${value}`} aria-labelledby={`${ctx.idBase}-t-${value}`} className={cn("mt-3", className)}>
      {children}
    </div>
  );
}
