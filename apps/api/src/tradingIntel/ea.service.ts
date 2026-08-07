/**
 * WINDELS AI OS — Expert Advisor (EA) Service (Phase 2).
 *
 * Lifecycle of MQL5 EAs running inside MetaTrader terminals:
 *   1. PAIRING  — the EA registers on first attach; we issue a scoped bearer
 *                 token bound to a single BrokerAccount + terminal.
 *   2. SIGNAL   — the EA polls /ea/poll; we return a bundle of APPROVED signals
 *                 (monotonic seq, HMAC-signed with canonical pipe-delimited
 *                 payload), hard risk limits, the current kill-switch state,
 *                 and an expected-position list for reconciliation.
 *   3. FILL     — after each signal the EA POSTs a fill ack; we mark the
 *                 TradeExecution as filled/failed and trigger a sync.
 *   4. HEARTBEAT— the EA reports positions/equity/diagnostics so we have an
 *                 honest state even when a direct bridge is unavailable.
 *
 * Security:
 *   - Signals are HMAC-SHA256 signed over a canonical pipe-delimited string
 *     (see `buildEaSignableString` in @windels/shared/ea); the EA builds the
 *     exact same string locally and rejects any signature mismatch.
 *   - Tokens are 256-bit random, stored hashed (SHA-256), and bound to broker
 *     account id + terminal name.
 *   - The EA is given HARD LOCAL LIMITS (max lot, max positions, max daily
 *     loss, allowed symbols, kill switch) and refuses to violate them even
 *     when the server is compromised.
 *
 * Transport note:
 *   - When a live connector (ZMQ/HTTP/MetaApi) is configured for an account,
 *     signals are delivered through the direct connector. The EA may still be
 *     attached as a redundant executor + position monitor.
 *   - When NO live connector is configured ("pure EA" mode), the EA is the
 *     ONLY path to the broker.
 */
import { randomBytes, createHash, createHmac } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { logger } from "../config/logger.js";
import { Mt5Monitor } from "./mt5/mt5-monitor.js";
import { buildEaSignableString } from "@windels/shared/ea";
import type {
  EaRegistration, EaSession, EaSignal, EaSignalBundle, EaFillAck, EaHeartbeat,
} from "@windels/shared/ea";
import type {
  BrokerAccount, TradeExecution, BrokerRiskControls, BrokerPosition,
} from "@windels/shared/brokerIntegration";

const K = {
  token:     (hash: string)     => `ea:token:${hash}`,
  session:   (eaId: string)     => `ea:session:${eaId}`,
  seq:       (eaId: string)     => `ea:seq:${eaId}`,
  wmark:     (eaId: string)     => `ea:wmark:${eaId}`,
  pending:   (eaId: string)     => `ea:pending:${eaId}`,
  signal:    (eaId: string, id: string) => `ea:sig:${eaId}:${id}`,
  sigIdx:    (eaId: string)     => `ea:sigidx:${eaId}`, // set of signal ids in pending
  fills:     (eaId: string)     => `ea:fills:${eaId}`,
  orgEas:    (oid: string)      => `ea:org:${oid}`,
  acctEas:   (aid: string)      => `ea:acct:${aid}`,
  hb:        (eaId: string)     => `ea:hb:${eaId}`,
};

const TOKEN_TTL_SEC = 60 * 60 * 24 * 30; // 30 days
export const COMMENT_PREFIX = "WINDELS";
export const DEFAULT_MAGIC_BASE = 0x57494E00; // "WIN" prefix — 0x57494E00
const DEFAULT_POLL_MS = 1500;
const MAX_SIGNALS_PER_POLL = 20;
const SIGNAL_TTL_MS = 5 * 60_000;
const FILL_HISTORY_CAP = 500;

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);
const now = () => new Date().toISOString();
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
type SignableSig = Omit<EaSignal, "sig">;
const signEaSignal = (secret: string, sig: SignableSig, brokerAccountId: string) =>
  createHmac("sha256", secret).update(buildEaSignableString(sig, brokerAccountId), "utf8").digest("hex");

/** Deterministic magic slot derived from eaId so registrations are stable. */
function magicSlot(eaId: string): number {
  const h = createHash("sha256").update(eaId).digest();
  return h[0]!; // 0..255
}

function randomToken(): string {
  return randomBytes(32).toString("hex");
}

export interface StoredSession {
  eaId: string;
  brokerAccountId: string;
  organizationId: string;
  tokenHash: string;
  secret: string;
  terminalName: string;
  mt5Login: string;
  mt5Server: string;
  chartSymbol?: string;
  chartTimeframe?: string;
  eaVersion: string;
  terminalVersion: string;
  magic: number;
  createdAt: string;
  expiresAt: string;
  lastPollAt?: string;
}

interface StoredSignal extends EaSignal {}

// Lazy import to avoid circular dependency between ea.service and brokerIntegration.
let _bri: typeof import("./brokerIntegration.service.js").BrokerIntegrationService | null = null;
async function bri() {
  if (!_bri) _bri = (await import("./brokerIntegration.service.js")).BrokerIntegrationService;
  return _bri;
}

export const EaService = {
  /* ── Registration / pairing ─────────────────────────────── */

  async register(oid: string, registration: EaRegistration): Promise<EaSession> {
    const B = await bri();
    const acct = await B.getAccount(oid, registration.brokerAccountId);
    if (!acct) throw new AppError("NOT_FOUND", `Broker account ${registration.brokerAccountId} not found`, 404);
    if (acct.broker !== "mt5") throw new AppError("BAD_REQUEST", "EA is currently supported only for MT5 accounts", 400);
    if (acct.login !== registration.mt5Login) {
      throw new AppError("BAD_REQUEST", "MT5 login does not match broker account on record", 400);
    }

    const token = randomToken();
    const secret = randomBytes(32).toString("hex");
    const eaId = "ea-" + randomBytes(8).toString("hex");
    const tokenHash = sha256(token);
    const magic = DEFAULT_MAGIC_BASE + magicSlot(eaId);
    const createdAt = now();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SEC * 1000).toISOString();

    const sess: StoredSession = {
      eaId, brokerAccountId: acct.id, organizationId: oid, tokenHash, secret,
      terminalName: registration.terminalName, mt5Login: registration.mt5Login,
      mt5Server: registration.mt5Server, chartSymbol: registration.chartSymbol,
      chartTimeframe: registration.chartTimeframe, eaVersion: registration.eaVersion,
      terminalVersion: registration.terminalVersion, magic, createdAt, expiresAt,
    };

    const tx = redis.multi();
    tx.set(K.token(tokenHash), s2(sess), "EX", TOKEN_TTL_SEC);
    tx.set(K.session(eaId), s2(sess), "EX", TOKEN_TTL_SEC);
    tx.set(K.seq(eaId), "0");
    tx.set(K.wmark(eaId), "0");
    tx.sadd(K.orgEas(oid), eaId);
    tx.sadd(K.acctEas(acct.id), eaId);
    await tx.exec();

    const limits = this.hardLimitsFrom(acct, await B.getRiskControls(oid));
    logger.info(`[ea] registered ${eaId} for account ${acct.id} (login=${acct.login} magic=0x${magic.toString(16)})`, { eaId, brokerAccountId: acct.id });
    await Mt5Monitor.audit(oid, acct.id, "connect", { phase: "ea-registered", eaId, terminal: registration.terminalName }).catch(() => {});
    return {
      token, expiresAt, eaId, mode: acct.mode, hardLimits: limits,
      magic, pollIntervalMs: DEFAULT_POLL_MS, callbackPath: "/api/v1/ea/fill",
    };
  },

  /* ── Auth ─────────────────────────────────────────────────── */

  async authenticateToken(token: string): Promise<StoredSession> {
    const hash = sha256(token);
    const raw = await redis.get(K.token(hash));
    if (!raw) throw new AppError("UNAUTHORIZED", "Invalid or expired EA token", 401);
    const sess = JSON.parse(raw) as StoredSession;
    if (Date.parse(sess.expiresAt) < Date.now()) {
      await redis.del(K.token(hash));
      throw new AppError("UNAUTHORIZED", "EA token expired", 401);
    }
    return sess;
  },

  async getSession(eaId: string): Promise<StoredSession | null> {
    return j<StoredSession>(await redis.get(K.session(eaId)));
  },

  /* ── Signal pull (poll) ──────────────────────────────────── */

  async poll(sess: StoredSession, watermarkIn: number): Promise<EaSignalBundle> {
    const B = await bri();
    sess.lastPollAt = now();
    await redis.set(K.session(sess.eaId), s2(sess), "EX", TOKEN_TTL_SEC);
    await redis.expire(K.token(sess.tokenHash), TOKEN_TTL_SEC);

    const acct = await B.mustGetAccount(sess.organizationId, sess.brokerAccountId);
    const risk = await B.getRiskControls(sess.organizationId);

    const pendingIds = await redis.lrange(K.pending(sess.eaId), 0, MAX_SIGNALS_PER_POLL - 1);
    let serverSeq = Number((await redis.get(K.seq(sess.eaId))) ?? "0");
    const watermark = Math.max(watermarkIn, Number((await redis.get(K.wmark(sess.eaId))) ?? "0"));
    const signals: EaSignal[] = [];
    for (const sigId of pendingIds) {
      const raw = await redis.get(K.signal(sess.eaId, sigId));
      if (!raw) { await redis.lrem(K.pending(sess.eaId), 1, sigId); await redis.srem(K.sigIdx(sess.eaId), sigId); continue; }
      const stored = JSON.parse(raw) as StoredSignal;
      if (Date.parse(stored.expiresAt) < Date.now()) {
        await redis.lrem(K.pending(sess.eaId), 1, sigId);
        await redis.srem(K.sigIdx(sess.eaId), sigId);
        await redis.del(K.signal(sess.eaId, sigId));
        continue;
      }
      if (stored.seq <= watermark) {
        await redis.lrem(K.pending(sess.eaId), 1, sigId);
        await redis.srem(K.sigIdx(sess.eaId), sigId);
        continue;
      }
      signals.push(stored);
      serverSeq = Math.max(serverSeq, stored.seq);
    }

    const positions = await B.listPositions(sess.organizationId, acct.id);
    const limits = this.hardLimitsFrom(acct, risk);
    return {
      watermark: serverSeq,
      serverTime: now(),
      eaId: sess.eaId,
      hardLimits: limits,
      mode: acct.mode,
      magic: sess.magic,
      signals,
      expectedPositions: positions.map((p) => ({
        ticket: p.ticket ?? p.id,
        symbol: p.symbol,
        side: p.side === "long" ? ("BUY" as const) : ("SELL" as const),
        volume: p.volume,
        openPrice: p.openPrice,
        sl: p.sl, tp: p.tp,
      })),
      killSwitch: risk.killSwitch,
      config: { commentPrefix: COMMENT_PREFIX },
    };
  },

  /**
   * Called by BrokerIntegrationService when an execution reaches "approved" and
   * an EA is attached to the account. Builds a signed signal and enqueues it.
   */
  async enqueueApprovedExecution(oid: string, acct: BrokerAccount, exec: TradeExecution): Promise<void> {
    const eaIds = await redis.smembers(K.acctEas(acct.id));
    if (!eaIds.length) return;
    const B = await bri();
    for (const eaId of eaIds) {
      try {
        const sess = await this.getSession(eaId);
        if (!sess) continue;
        // De-dupe: if this exec id is already enqueued for this EA, skip.
        if ((await redis.sismember(K.sigIdx(eaId), exec.id)) === 1) continue;

        const nextSeq = Number((await redis.get(K.seq(eaId))) ?? "0") + 1;
        await redis.set(K.seq(eaId), String(nextSeq));

        const sigType = this.execToSignalType(exec);
        // Resolve target ticket for CLOSE/MODIFY/CANCEL.
        let targetTicket: string | undefined = exec.brokerTicket;
        if ((sigType === "CLOSE" || sigType === "MODIFY_SLTP") && !targetTicket) {
          const positions = await B.listPositions(oid, acct.id);
          const pos = positions.find((p) => p.symbol === exec.symbol);
          if (pos) targetTicket = pos.ticket ?? pos.id;
        }

        const signal: StoredSignal = {
          id: exec.id, seq: nextSeq, brokerAccountId: acct.id,
          type: sigType,
          side: exec.side === "long" ? "BUY" : exec.side === "short" ? "SELL" : undefined,
          symbol: exec.symbol,
          volume: exec.volume,
          price: exec.price,
          sl: exec.stopLoss,
          tp: exec.takeProfit,
          slippagePts: 20,
          comment: (COMMENT_PREFIX + ":" + (exec.strategyId ?? exec.source ?? "AI")).slice(0, 31),
          targetTicket,
          expiresAt: new Date(Date.now() + SIGNAL_TTL_MS).toISOString(),
          sig: "",
        };
        signal.sig = signEaSignal(sess.secret, signal, acct.id);

        await redis.set(K.signal(eaId, signal.id), s2(signal));
        await redis.sadd(K.sigIdx(eaId), signal.id);
        await redis.lpush(K.pending(eaId), signal.id);
        await redis.ltrim(K.pending(eaId), 0, 99);
      } catch (e) {
        logger.warn("[ea] failed to enqueue signal for EA", { eaId, execId: exec.id, err: (e as Error).message });
      }
    }
  },

  /* ── Fill ack ─────────────────────────────────────────────── */

  async ackFill(sess: StoredSession, ack: EaFillAck): Promise<{ ok: true }> {
    const B = await bri();
    const oid = sess.organizationId;
    const acct = await B.mustGetAccount(oid, sess.brokerAccountId);

    await redis.lpush(K.fills(sess.eaId), s2({ ...ack, receivedAt: now() }));
    await redis.ltrim(K.fills(sess.eaId), 0, FILL_HISTORY_CAP - 1);

    if (ack.signalId) {
      const raw = await redis.get(K.signal(sess.eaId, ack.signalId));
      if (raw) {
        const sig = JSON.parse(raw) as StoredSignal;
        const curWm = Number((await redis.get(K.wmark(sess.eaId))) ?? "0");
        if (sig.seq > curWm) await redis.set(K.wmark(sess.eaId), String(sig.seq));
        await redis.lrem(K.pending(sess.eaId), 1, ack.signalId);
        await redis.srem(K.sigIdx(sess.eaId), ack.signalId);
        await redis.del(K.signal(sess.eaId, ack.signalId));
      }
      try {
        const exec = await B.mustGetExecution(oid, ack.signalId);
        if (ack.status === "FILLED" || ack.status === "PARTIAL") {
          exec.status = "filled";
          exec.brokerTicket = ack.ticket;
          exec.brokerDealId = ack.dealId;
          exec.fillPrice = ack.fillPrice;
          exec.filledVolume = ack.filledVolume ?? exec.volume;
          exec.filledAt = now();
          exec.sentAt = exec.sentAt ?? now();
          exec.brokerLatencyMs = ack.latencyMs;
          exec.connectorTransport = exec.connectorTransport ?? "ea";
          exec.updatedAt = now();
          await redis.set(`bri:${oid}:exec:${exec.id}`, s2(exec));
          await Mt5Monitor.audit(oid, acct.id, ack.status === "FILLED" ? "order_fill" : "order_send", {
            eaId: sess.eaId, ticket: ack.ticket, symbol: exec.symbol,
            volume: ack.filledVolume, price: ack.fillPrice,
          }, ack.latencyMs).catch(() => {});
        } else if (["REJECTED", "ERROR", "SLIPPAGE", "EXPIRED"].includes(ack.status)) {
          exec.status = "failed";
          exec.error = ack.error ?? ack.status;
          exec.updatedAt = now();
          await redis.set(`bri:${oid}:exec:${exec.id}`, s2(exec));
          await Mt5Monitor.audit(oid, acct.id, "order_fail", {
            eaId: sess.eaId, error: ack.error, retcode: ack.retcode, status: ack.status,
          }).catch(() => {});
        }
      } catch (e) {
        logger.warn("[ea] ack fill could not update execution", { signalId: ack.signalId, err: (e as Error).message });
      }
    }

    B.syncAccount(oid, acct.id, { account: true, positions: true, orders: true }).catch((e) => {
      logger.warn("[ea] post-fill sync failed", { err: (e as Error).message, eaId: sess.eaId });
    });
    return { ok: true };
  },

  /* ── Heartbeat (state + diagnostics) ─────────────────────── */

  async heartbeat(sess: StoredSession, hb: EaHeartbeat): Promise<{ ok: true; serverTime: string }> {
    const B = await bri();
    const oid = sess.organizationId;
    await redis.set(K.hb(sess.eaId), s2({ ...hb, receivedAt: now() }), "EX", 300);

    const curWm = Number((await redis.get(K.wmark(sess.eaId))) ?? "0");
    if (hb.watermark > curWm) await redis.set(K.wmark(sess.eaId), String(hb.watermark));

    const acct = await B.getAccount(oid, sess.brokerAccountId);
    if (acct && (!acct.transport || acct.transport === "ea" || acct.status !== "connected")) {
      // Pure-EA path: heartbeat IS the source of truth for positions + account snapshot.
      await B.applyEaHeartbeat(oid, acct, hb);
    }

    if (hb.diagnostics?.length) {
      for (const d of hb.diagnostics) {
        if (d.level === "error") logger.warn(`[ea] ${sess.eaId} diagnostic: ${d.message}`, { code: d.code });
      }
    }
    return { ok: true, serverTime: now() };
  },

  /* ── Listing / revoke ────────────────────────────────────── */

  async listEa(oid: string) {
    const ids = await redis.smembers(K.orgEas(oid));
    const out: Array<{ eaId: string; brokerAccountId: string; magic: number; terminalName: string; mt5Login: string; createdAt: string; lastPollAt?: string; connected: boolean }> = [];
    for (const id of ids) {
      const s = j<StoredSession>(await redis.get(K.session(id)));
      if (!s) continue;
      const hb = j<EaHeartbeat & { receivedAt?: string }>(await redis.get(K.hb(id)));
      const lastHb = hb ? (hb as any).receivedAt : undefined;
      const connected = !!(lastHb && Date.now() - Date.parse(lastHb) < 15_000);
      out.push({
        eaId: s.eaId, brokerAccountId: s.brokerAccountId, magic: s.magic,
        terminalName: s.terminalName, mt5Login: s.mt5Login,
        createdAt: s.createdAt, lastPollAt: s.lastPollAt, connected,
      });
    }
    return out;
  },

  async revoke(oid: string, eaId: string): Promise<void> {
    const s = j<StoredSession>(await redis.get(K.session(eaId)));
    if (!s || s.organizationId !== oid) throw new AppError("NOT_FOUND", "EA not found", 404);
    const pendingIds = await redis.lrange(K.pending(eaId), 0, -1);
    const sigKeys = pendingIds.map((id) => K.signal(eaId, id));
    const delKeys = [
      K.token(s.tokenHash), K.session(eaId), K.seq(eaId), K.wmark(eaId),
      K.pending(eaId), K.hb(eaId), K.fills(eaId), K.sigIdx(eaId),
      ...sigKeys,
    ];
    if (delKeys.length) await redis.del(...delKeys);
    await redis.srem(K.orgEas(oid), eaId);
    await redis.srem(K.acctEas(s.brokerAccountId), eaId);
    await Mt5Monitor.audit(oid, s.brokerAccountId, "disconnect", { phase: "ea-revoked", eaId }).catch(() => {});
  },

  /* ── Helpers ─────────────────────────────────────────────── */

  hardLimitsFrom(acct: BrokerAccount, risk: BrokerRiskControls): EaSession["hardLimits"] {
    const maxLotPerTrade = Math.max(0.01, Math.min(acct.leverage / 10, 10));
    return {
      maxLotPerTrade,
      maxOpenPositions: 15,
      maxDailyLossPct: risk.maxDailyLossPct,
      maxSlippagePts: 30,
      allowedSymbols: acct.connectorConfig?.allowedSymbols ?? [],
      closeOnly: !!risk.killSwitch || acct.connectorConfig?.readOnly === true,
    };
  },

  execToSignalType(exec: TradeExecution): EaSignal["type"] {
    if (exec.source === "manual-close" || /close/i.test(exec.source ?? "")) return "CLOSE";
    if (exec.stopLoss && exec.takeProfit && exec.price && exec.price > 0) return "LIMIT";
    return "MARKET";
  },
};

// Expose the canonical signer for tests (not part of the public surface but useful).
export const __test = { buildEaSignableString, signEaSignal };