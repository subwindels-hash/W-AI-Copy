import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...rest }, ref) => (
    <select
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-white/10 bg-bg-deep/60 px-3 py-2 text-sm text-text-bright",
        "focus:outline-none focus:ring-2 focus:ring-azure/60 focus:border-azure/40 transition",
        "disabled:opacity-50 disabled:cursor-not-allowed appearance-none",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2394A3B8%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>')] bg-no-repeat bg-[right_0.75rem_center] pr-9",
        className
      )}
      {...rest}
    >
      {children}
    </select>
  )
);
Select.displayName = "Select";
