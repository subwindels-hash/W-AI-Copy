import { type ReactNode } from "react";
import { MButton } from "./MButton";

export function MEmptyState({
  icon, title, message, action, onAction,
}: { icon?: ReactNode; title: string; message?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center text-center px-8 py-16 text-text-muted">
      {icon && <div className="text-text-muted/50 mb-4 scale-150">{icon}</div>}
      <h3 className="text-lg font-semibold text-text-main">{title}</h3>
      {message && <p className="text-sm mt-2 max-w-xs">{message}</p>}
      {action && onAction && (
        <MButton variant="secondary" className="mt-6" onClick={onAction}>{action}</MButton>
      )}
    </div>
  );
}
