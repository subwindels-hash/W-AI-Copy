import { useEffect } from "react";

/**
 * Inject env(safe-area-inset-*) CSS variables onto :root so they can be used
 * via tailwind arbitrary values: `pt-[max(12px,env(safe-area-inset-top))]`.
 * Called once at MobileShell mount.
 */
export function useSafeArea() {
  useEffect(() => {
    const root = document.documentElement;
    if (!document.getElementById("windels-safe-area-style")) {
      const s = document.createElement("style");
      s.id = "windels-safe-area-style";
      s.textContent = `
        :root {
          --sat: env(safe-area-inset-top, 0px);
          --sar: env(safe-area-inset-right, 0px);
          --sab: env(safe-area-inset-bottom, 0px);
          --sal: env(safe-area-inset-left, 0px);
        }
        html, body { overscroll-behavior-y: contain; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        body { padding-top: var(--sat); padding-bottom: var(--sab); }
      `;
      document.head.appendChild(s);
    }
  }, []);
}
