import { useEffect, useState, useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  const on = () => cb();
  window.addEventListener("online", on);
  window.addEventListener("offline", on);
  return () => {
    window.removeEventListener("online", on);
    window.removeEventListener("offline", on);
  };
}
function getSnapshot() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/**
 * Returns navigator.onLine reactive status. On mount also pings /healthz to confirm
 * real connectivity (navigator.onLine lies in captive portals).
 */
export function useOnlineStatus() {
  const online = useSyncExternalStore(subscribe, getSnapshot, () => true);
  const [reachable, setReachable] = useState<boolean>(true);
  useEffect(() => {
    let active = true;
    const ping = async () => {
      try {
        const r = await fetch("/healthz", { cache: "no-store" });
        if (active) setReachable(r.ok);
      } catch {
        if (active) setReachable(false);
      }
    };
    ping();
    const id = setInterval(ping, 15_000);
    return () => { active = false; clearInterval(id); };
  }, []);
  return { online, reachable, isOnline: online && reachable };
}
