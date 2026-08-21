import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export function OfflineBanner() {
  const [offline, setOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed top-[calc(var(--announcement-bar-height)+var(--sat))] left-0 right-0 z-[200] bg-amber/20 border-b border-amber/40 text-amber text-xs text-center py-1.5 backdrop-blur-md"
          role="status"
        >
          You’re offline. Changes will sync when your connection returns.
        </motion.div>
      )}
    </AnimatePresence>
  );
}
