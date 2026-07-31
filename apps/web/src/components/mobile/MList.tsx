import { type ReactNode, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function MList({ children, header, footer }: { children: ReactNode; header?: string; footer?: string }) {
  return (
    <div className="px-4">
      {header && <p className="text-xs uppercase tracking-wide text-text-muted px-2 pb-1.5 pt-4">{header}</p>}
      <div className="bg-bg-elevated border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5">{children}</div>
      {footer && <p className="text-xs text-text-muted px-2 pt-2 pb-2">{footer}</p>}
    </div>
  );
}

type MListItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: ReactNode;
  icon?: ReactNode;
  trailing?: ReactNode; // chevron, badge, switch, etc.
  hint?: string;
  destructive?: boolean;
};
export function MListItem({ label, icon, trailing, hint, destructive, className, ...rest }: MListItemProps) {
  const isButton = Boolean(rest.onClick || rest.type === "submit");
  const Comp: any = isButton ? "button" : "div";
  return (
    <Comp
      {...(isButton ? { type: "button" } : {})}
      {...rest}
      className={cn(
        "w-full min-h-[52px] px-4 py-3 flex items-center gap-3 text-left active:bg-white/5 transition",
        destructive ? "text-crimson" : "text-text-main",
        !trailing && isButton && "after:content-['›'] after:text-text-muted after:text-lg after:ml-auto",
        className
      )}
    >
      {icon && <span className="flex-shrink-0 text-text-muted w-6 flex justify-center">{icon}</span>}
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] leading-tight truncate">{label}</span>
        {hint && <span className="block text-xs text-text-muted mt-0.5 truncate">{hint}</span>}
      </span>
      {trailing && <span className="flex-shrink-0 text-text-muted text-sm flex items-center gap-1">{trailing}</span>}
    </Comp>
  );
}
