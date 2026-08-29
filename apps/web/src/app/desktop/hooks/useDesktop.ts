import { useEffect, useState } from "react";
import type { DesktopAPI, DesktopWindowKind } from "@windels/shared/desktop";

/**
 * Returns the `window.desktop` API if running inside the Electron shell,
 * otherwise `null`. Safe to call from any renderer (including web and mobile).
 */
export function useDesktop(): DesktopAPI | null {
  const [api, setApi] = useState<DesktopAPI | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).desktop) {
      setApi((window as any).desktop);
    }
  }, []);
  return api;
}

/** Returns true when running under Electron. */
export function useIsDesktop(): boolean {
  return useDesktop() !== null;
}

export function useDesktopOpenWindow() {
  const d = useDesktop();
  return (kind: DesktopWindowKind, opts?: Record<string, unknown>) => d?.window.open(kind, opts);
}

export function useDesktopNotify() {
  const d = useDesktop();
  return (p: { title: string; body?: string; silent?: boolean; url?: string }) => d?.notify.send(p);
}
