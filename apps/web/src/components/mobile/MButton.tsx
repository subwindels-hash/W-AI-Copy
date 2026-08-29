import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-azure-500 text-white active:bg-azure-600 shadow-azure-500/30 shadow-lg",
  secondary: "bg-white/10 text-text-main active:bg-white/15 border border-white/10",
  ghost: "bg-transparent text-text-main active:bg-white/10",
  danger: "bg-crimson text-white active:bg-red-700",
  success: "bg-emerald-500 text-white active:bg-emerald-600",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-[15px] rounded-xl",
  lg: "h-12 px-6 text-base rounded-2xl font-semibold",
};

export const MButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; fullWidth?: boolean }>(
  ({ variant = "primary", size = "md", fullWidth, className, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        {...rest}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none",
          variants[variant],
          sizes[size],
          fullWidth && "w-full",
          className
        )}
      >
        {children}
      </button>
    );
  }
);
MButton.displayName = "MButton";
