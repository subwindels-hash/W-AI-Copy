import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg bg-white/5 border border-white/10 px-3 text-sm",
        "placeholder:text-slate-500 text-text-main",
        "focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure/50",
        "transition-colors",
        className
      )}
      {...rest}
    />
  )
);
Input.displayName = "Input";
