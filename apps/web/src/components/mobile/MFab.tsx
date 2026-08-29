import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const MFab = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...rest }, ref) => (
    <button
      ref={ref}
      {...rest}
      className={cn(
        "fixed z-30 bottom-[calc(76px+var(--sab))] right-5 h-14 w-14 rounded-full bg-gradient-to-br from-azure-500 to-violet-500 text-white shadow-azure-500/40 shadow-2xl flex items-center justify-center active:scale-95 transition",
        className
      )}
    >
      {children}
    </button>
  )
);
MFab.displayName = "MFab";
