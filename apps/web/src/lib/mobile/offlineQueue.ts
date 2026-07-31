/**
 * Minimal IndexedDB-backed offline action queue. When the app detects it's offline
 * (via useOnlineStatus), non-GET requests can be queued here. When connectivity
 * returns, all actions are POSTed in order to /api/v1/mobile/offline/sync.
 *
 * This is the MVP slice — the server simply acknowledges receipt for audit and
 * returns recent notifications. Clients rely on their own data-refresh hooks to
 * reconcile state; a full CRDT/queue-replay would be a later hardening slice.
 */
import { api } from "../api";

const DB_NAME = "windels-offline";
const STORE = "actions";
const DB_VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("queuedAt", "queuedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type QueuedAction = {
  id: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  queuedAt: string;
};

export async function enqueue(a: Omit<QueuedAction, "id" | "queuedAt">) {
  if (typeof indexedDB === "undefined") return;
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).add({ ...a, id: crypto.randomUUID(), queuedAt: new Date().toISOString() });
  db.close();
}

export async function dequeue(id: string) {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  db.close();
}

export async function listAll(): Promise<QueuedAction[]> {
  const db = await open();
  try {
    return await new Promise<QueuedAction[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll() as IDBRequest<QueuedAction[]>;
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function clear() {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).clear();
  db.close();
}

let flushInFlight = false;
export async function flush(deviceId: string) {
  if (flushInFlight) return;
  flushInFlight = true;
  try {
    const actions = await listAll();
    if (actions.length === 0) return { received: 0 };
    const res = await api.post<{ received: number }>("/mobile/offline/sync", {
      deviceId,
      actions,
      lastSyncAt: new Date().toISOString(),
    });
    for (const a of actions) await dequeue(a.id);
    return res;
  } finally {
    flushInFlight = false;
  }
}
