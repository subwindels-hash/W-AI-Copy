import { useEffect, useState } from "react";

/**
 * Exposes the PWA beforeinstallprompt event so we can surface an
 * "Install WINDELS AI OS" banner/button. Returns `null` on unsupported
 * browsers or after install.
 */
export function useInstallPrompt() {
  const [promptEvt, setPromptEvt] = useState<Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> } | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
  });

  useEffect(() => {
    const onBefore = (e: Event) => { e.preventDefault(); setPromptEvt(e as any); };
    const onInstalled = () => { setInstalled(true); setPromptEvt(null); };
    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function prompt() {
    if (!promptEvt) return { outcome: "unavailable" as const };
    await promptEvt.prompt();
    const choice = await promptEvt.userChoice;
    setPromptEvt(null);
    return { outcome: choice.outcome as "accepted" | "dismissed" };
  }

  return { canInstall: Boolean(promptEvt) && !installed, installed, prompt };
}
