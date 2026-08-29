import type { HTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "default" | "secondary" | "outline" | "azure" | "violet" | "teal" | "fuchsia" | "amber" | "warning" | "emerald" | "success" | "crimson" | "slate" | "danger";

const styles: Record<Variant, string> = {
  default: "bg-white/10 text-text-main border-white/10",
  secondary: "bg-white/5 text-text-muted border-white/10",
  outline: "bg-transparent text-text-main border-white/20",
  azure: "bg-azure/15 text-azure border-azure/30",
  violet: "bg-violet/15 text-violet border-violet/30",
  teal: "bg-teal/15 text-teal border-teal/30",
  fuchsia: "bg-fuchsia/15 text-fuchsia border-fuchsia/30",
  amber: "bg-amber/15 text-amber border-amber/30",
  warning: "bg-amber/15 text-amber border-amber/30",
  emerald: "bg-emerald/15 text-emerald border-emerald/30",
  success: "bg-emerald/15 text-emerald border-emerald/30",
  crimson: "bg-crimson/15 text-crimson border-crimson/30",
  danger: "bg-crimson/15 text-crimson border-crimson/30",
  slate: "bg-slate-600/20 text-slate-300 border-slate-600/30",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...rest }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        styles[variant],
        className
      )}
      {...rest}
    />
  )
);
Badge.displayName = "Badge";
