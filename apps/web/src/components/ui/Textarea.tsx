import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-white/10 bg-bg-deep/60 px-3 py-2 text-sm text-text-bright placeholder:text-text-muted",
        "focus:outline-none focus:ring-2 focus:ring-azure/60 focus:border-azure/40 transition",
        "disabled:opacity-50 disabled:cursor-not-allowed resize-y",
        className
      )}
      {...rest}
    />
  )
);
Textarea.displayName = "Textarea";
