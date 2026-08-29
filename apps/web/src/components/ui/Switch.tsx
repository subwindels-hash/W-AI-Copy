import { cn } from "@/lib/cn";

import type { ReactNode } from "react";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  id?: string;
  className?: string;
  "aria-label"?: string;
}

export function Switch({ checked, onChange, disabled, label, id, className, "aria-label": ariaLabel }: Props) {
  return (
    <label className={cn("inline-flex items-center gap-2 cursor-pointer select-none", disabled && "opacity-50 cursor-not-allowed", className)}>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
          "border border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/60",
          checked ? "bg-azure" : "bg-white/10"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform shadow",
            checked && "translate-x-4"
          )}
        />
      </button>
      {label && <span className="text-sm text-text-main">{label}</span>}
    </label>
  );
}
