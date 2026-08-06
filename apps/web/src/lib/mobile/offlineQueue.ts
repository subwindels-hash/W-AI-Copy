/**
 * IndexedDB-backed offline action queue. When the app detects it is offline
 * (via useOnlineStatus), non-GET requests are queued here. When connectivity
 * returns they are handed to the server, which stores them, and then replayed
 * through the ordinary API.
 *
 * WHAT THIS USED TO DO, AND WHY IT WAS DANGEROUS (fixed in Session 117)
 * ---------------------------------------------------------------------
 * `flush()` POSTed the whole queue to `/mobile/offline/sync` and then deleted
 * every action from IndexedDB — unconditionally, without looking at the
 * response. The server stored none of them: its handler updated `lastSeenAt`,
 * answered `received: <n>` and dropped the array. So a message written in a
 * tunnel was destroyed the moment the phone found signal, and the user was
 * shown a successful sync.
 *
 * Now:
 *   1. the actions are submitted to the durable endpoint, which returns a
 *      receipt per action;
 *   2. only ids the server reports as `stored` or `duplicate` are removed from
 *      IndexedDB — a rejected action sets `retainLocally` and stays put, with
 *      its reason recorded so the UI can show it;
 *   3. each stored action is then replayed through the ordinary authenticated
 *      API, so authorization, validation and rate limits apply exactly as they
 *      would have online, and the outcome is reported back to the server.
 *
 * Nothing is replayed twice on purpose: an action the server already holds as
 * `applied` is not in the replay plan, because the endpoints these actions
 * target are not idempotent.
 */
import { api, ApiError } from "../api";
import type { MobileActionDetail } from "@windels/shared/mobile";
import { mobileSyncApi } from "./sync";

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

export type FlushResult = {
  /** Actions handed to the server. */
  submitted: number;
  /** Accepted and now held durably. */
  stored: number;
  /** Already held from an earlier attempt. */
  duplicates: number;
  /** Refused by the server. These stay on the device — see `rejections`. */
  rejected: number;
  rejections: Array<{ actionId: string; reason: string | null; detail: string }>;
  /** Replayed successfully through the ordinary API. */
  applied: number;
  /** Replayed and refused by the target endpoint. */
  failed: number;
};

let flushInFlight = false;

/**
 * Hand the queue to the server, then replay what it accepted.
 *
 * Returns counts rather than a bare acknowledgement, because "we sent 12 and 3
 * of them were refused" is exactly the thing the previous implementation hid.
 */
export async function flush(deviceId: string): Promise<FlushResult> {
  const empty: FlushResult = {
    submitted: 0, stored: 0, duplicates: 0, rejected: 0, rejections: [], applied: 0, failed: 0,
  };
  if (flushInFlight) return empty;
  flushInFlight = true;
  try {
    const actions = await listAll();
    if (actions.length === 0) return empty;

    const submission = await mobileSyncApi.submitActions(
      deviceId,
      actions.map((a) => ({ id: a.id, method: a.method, path: a.path, body: a.body, queuedAt: a.queuedAt })),
      new Date().toISOString(),
    );

    const result: FlushResult = {
      submitted: actions.length,
      stored: submission.stored,
      duplicates: submission.duplicates,
      rejected: submission.rejected,
      rejections: submission.receipts
        .filter((r) => r.outcome === "rejected")
        .map((r) => ({ actionId: r.actionId, reason: r.reason, detail: r.detail })),
      applied: 0,
      failed: 0,
    };

    // Delete locally ONLY what the server confirmed it is holding. A rejected
    // action keeps its place in IndexedDB; losing it is what this fix exists
    // to prevent.
    const held = new Set(
      submission.receipts.filter((r) => !r.retainLocally).map((r) => r.actionId),
    );
    for (const a of actions) if (held.has(a.id)) await dequeue(a.id);

    // Replay through the ordinary API, in the order the server accepted them.
    const plan = await mobileSyncApi.replayPlan(deviceId).catch(() => null);
    for (const queued of plan?.actions ?? []) {
      let detail: MobileActionDetail | null = null;
      try {
        detail = await mobileSyncApi.action(queued.id);
      } catch {
        continue;
      }
      try {
        await api(detail.path.replace(/^\/api\/v1/, ""), {
          method: detail.method,
          json: detail.bodyStored ? detail.body : undefined,
        });
        result.applied += 1;
        await mobileSyncApi.resolve(queued.id, "applied", { statusCode: 200 }).catch(() => null);
      } catch (err) {
        result.failed += 1;
        const status = err instanceof ApiError ? err.status : undefined;
        const message = err instanceof Error ? err.message : String(err);
        await mobileSyncApi
          .resolve(queued.id, "failed", { statusCode: status, error: message.slice(0, 500) })
          .catch(() => null);
      }
    }

    return result;
  } finally {
    flushInFlight = false;
  }
}
