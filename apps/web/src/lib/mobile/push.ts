import { api } from "../api";

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function subscribePush(deviceId: string) {
  const cfg = await api.get<{ ok: true; data: { vapidPublicKey: string } }>("/mobile/config");
  const reg = await navigator.serviceWorker?.ready?.catch(() => null);
  if (!reg) throw new Error("Service worker not ready");
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(cfg.data.vapidPublicKey),
  });
  const subJson = sub.toJSON();
  if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
    throw new Error("Incomplete push subscription");
  }
  return api.post("/mobile/push/subscribe", {
    deviceId,
    endpoint: subJson.endpoint,
    keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
  });
}

export async function unsubscribePush() {
  const reg = await navigator.serviceWorker?.ready?.catch(() => null);
  const sub = await reg?.pushManager?.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => null);
    await api.delete(`/mobile/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`).catch(() => null);
  }
}

export async function sendTestPush() {
  return api.post("/mobile/push/test", {});
}
