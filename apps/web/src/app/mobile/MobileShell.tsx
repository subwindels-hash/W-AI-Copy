import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { MobileTabBar } from "./MobileTabBar";
import { useSafeArea } from "./hooks/useSafeArea";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { flush } from "@/lib/mobile/offlineQueue";
import { useAuthStore } from "@/store/auth";
import { api } from "@/lib/api";
import { GlobalBrandingFooter } from "@/app/GlobalBrandingFooter";

/**
 * Mobile PWA app shell.
 * - Adds safe-area CSS vars for notches/home indicators
 * - Registers the mobile device on first mount so push/offline sync work
 * - Shows bottom tab bar on primary routes (not in immersive/fullscreen views)
 * - Flushes offline queue when reconnecting
 */
export function MobileShell() {
  useSafeArea();
  const { isOnline } = useOnlineStatus();
  const location = useLocation();
  const deviceId = useAuthStore((s) => s.deviceId);
  const setDevice = useAuthStore((s) => s.setDevice);

  // Immersive routes hide the bottom tab bar.
  const immersive =
    location.pathname.startsWith("/m/chat/") ||
    location.pathname.startsWith("/m/meetings/") ||
    location.pathname === "/m/auth";

  // Register this device on mount (idempotent).
  useEffect(() => {
    if (deviceId) return;
    let cancelled = false;
    (async () => {
      try {
        const dev = await api.post<{ id: string }>("/mobile/devices/register", {
          platform: "web-pwa",
          deviceName: navigator.platform || "Mobile",
          osVersion: navigator.userAgent.slice(0, 80),
          appVersion: "0.15.0",
        });
        if (!cancelled) setDevice(dev.id);
      } catch { /* ignore — device registration is best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [deviceId, setDevice]);

  // Flush offline queue whenever we come online.
  useEffect(() => {
    if (isOnline && deviceId) {
      flush(deviceId).catch(() => null);
    }
  }, [isOnline, deviceId]);

  return (
    <div className="min-h-screen w-full bg-bg-deep text-text-main relative pb-[calc(76px+var(--sab))]">
      <Outlet />
      {!immersive && <GlobalBrandingFooter compact />}
      {!immersive && <MobileTabBar />}
    </div>
  );
}
