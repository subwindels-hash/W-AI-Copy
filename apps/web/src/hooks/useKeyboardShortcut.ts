import { useEffect } from "react";

/**
 * Register a global keyboard shortcut. Matches when focus is not in an input/textarea/contenteditable.
 */
export function useKeyboardShortcut(
  combo: { key: string; meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean },
  handler: (e: KeyboardEvent) => void,
  deps: unknown[] = []
) {
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      const metaOk = combo.meta ? e.metaKey || e.ctrlKey : true;
      const ctrlOk = combo.ctrl ? e.ctrlKey || e.metaKey : true;
      const shiftOk = combo.shift ? e.shiftKey : !e.shiftKey;
      const altOk = combo.alt ? e.altKey : !e.altKey;
      if (e.key.toLowerCase() === combo.key.toLowerCase() && metaOk && ctrlOk && shiftOk && altOk) {
        e.preventDefault();
        handler(e);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
