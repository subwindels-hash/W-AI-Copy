import { useEffect, useState } from "react";

/**
 * Detect if the current viewport is the mobile layout (<768px) OR
 * if the app is running as an installed PWA (display-mode: standalone).
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
    return window.innerWidth < 768 || Boolean(standalone);
  });
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const standaloneMq = window.matchMedia("(display-mode: standalone)");
    const update = () => setIsMobile(mq.matches || standaloneMq.matches);
    update();
    mq.addEventListener?.("change", update);
    standaloneMq.addEventListener?.("change", update);
    return () => {
      mq.removeEventListener?.("change", update);
      standaloneMq.removeEventListener?.("change", update);
    };
  }, []);
  return isMobile;
}
