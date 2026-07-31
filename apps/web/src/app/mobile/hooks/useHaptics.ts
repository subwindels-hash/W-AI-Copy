/**
 * Lightweight haptics via navigator.vibrate (no-op on unsupported devices/browsers).
 * Patterns:
 * - light (10ms) — button taps
 * - medium (20ms) — selections/toggles
 * - heavy (30ms) — destructive / success
 * - success (10,30,10)
 * - error (30,50,30)
 */
export function useHaptics() {
  const vibrate = (pattern: number | number[]) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(pattern); } catch { /* ignored */ }
    }
  };
  return {
    light: () => vibrate(10),
    medium: () => vibrate(20),
    heavy: () => vibrate(30),
    success: () => vibrate([10, 30, 10]),
    error: () => vibrate([30, 50, 30]),
  };
}
