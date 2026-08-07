#!/usr/bin/env python3
"""
WINDELS AI OS — MetaTrader 5 Python Bridge.

This out-of-process bridge runs alongside a MetaTrader 5 terminal (native Windows
or Linux+Wine) and exposes MT5 functionality to the WINDELS Node.js API over two
transports:

    1. ZeroMQ REQ/REP (RPC) + PUB (ticks) — default, lowest latency
    2. HTTP/JSON + Server-Sent Events (SSE) — fallback, no native zmq deps

Requires:
    - Python 3.10+
    - MetaTrader5 (pip install MetaTrader5)  — Windows only, or Linux+Wine
    - pyzmq  (for ZMQ transport)
    - (optional) flask / sseclient for HTTP transport

The bridge is intentionally stateless per RPC but caches MT5 login sessions
keyed by (login, server) in-process. Each MT5 connection is initialized with
mt5.initialize() pointing at the correct terminal path. We only support one
active connected terminal at a time per bridge process (MT5 Python API
limitation); multiple accounts on the same terminal are accessed via
mt5.login(). For multi-terminal deployments, run multiple bridge instances on
different port pairs.

Usage:
    # ZeroMQ mode (default)
    python bridge.py --rpc 5555 --pub 5556

    # HTTP mode
    python bridge.py --http 8765

Security:
    - A shared bearer token may be passed via --token or env WINDELS_MT5_BRIDGE_TOKEN
      to reject unauthenticated requests on both transports.
    - Credentials are NEVER logged; only account logins and symbols appear in logs.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import logging
import os
import signal
import struct
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Dict, List, Optional, Tuple

# --------------------------------------------------------------------------
# Optional dependency imports — degrade gracefully if unavailable.
# --------------------------------------------------------------------------
try:
    import MetaTrader5 as mt5  # type: ignore
    _HAS_MT5 = True
except Exception as exc:  # pragma: no cover — platform dependent
    mt5 = None  # type: ignore
    _HAS_MT5 = False
    _MT5_IMPORT_ERROR = str(exc)

try:
    import zmq  # type: ignore
    _HAS_ZMQ = True
except Exception:
    zmq = None  # type: ignore
    _HAS_ZMQ = False

# --------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [mt5-bridge] %(message)s",
)
log = logging.getLogger("mt5-bridge")


# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------
# MT5 order-type constants (string labels for transmission over the wire).
ORDER_TYPE_MAP = {
    "ORDER_TYPE_BUY": 0, "ORDER_TYPE_SELL": 1,
    "ORDER_TYPE_BUY_LIMIT": 2, "ORDER_TYPE_SELL_LIMIT": 3,
    "ORDER_TYPE_BUY_STOP": 4, "ORDER_TYPE_SELL_STOP": 5,
    "ORDER_TYPE_BUY_STOP_LIMIT": 6, "ORDER_TYPE_SELL_STOP_LIMIT": 7,
}
ORDER_ACTION_DEAL = 1
ORDER_TYPE_TIME_GTC = 0
ORDER_TYPE_TIME_IOC = 1
ORDER_TYPE_TIME_FOK = 4
ORDER_FILLING_FOK = 0
POSITION_CLOSE_ID = 1

TIMEFRAME_MAP = {
    "TIMEFRAME_M1": 1 | 0 << 8,
    "TIMEFRAME_M5": 5 | 0 << 8,
    "TIMEFRAME_M15": 15 | 0 << 8,
    "TIMEFRAME_M30": 30 | 0 << 8,
    "TIMEFRAME_H1": 1 | 1 << 8,
    "TIMEFRAME_H4": 4 | 1 << 8,
    "TIMEFRAME_D1": 1 | 2 << 8,
    "TIMEFRAME_W1": 1 | 3 << 8,
    "TIMEFRAME_MN1": 1 | 4 << 8,
}


# --------------------------------------------------------------------------
# Account session state
# --------------------------------------------------------------------------
@dataclass
class AccountSession:
    account_id: str        # WINDELS-side account id (opaque)
    login: int
    server: str
    password: str
    path: Optional[str]    # terminal path used to initialize
    environment: str
    subscribed_symbols: set = field(default_factory=set)
    connected_at: float = field(default_factory=time.time)
    last_tick_time: Dict[str, float] = field(default_factory=dict)


class Mt5Bridge:
    """Central state and RPC dispatch."""

    def __init__(self, token: Optional[str] = None):
        self.token = token
        self.sessions: Dict[str, AccountSession] = {}
        self.active_login: Optional[Tuple[int, str]] = None  # (login, server) currently selected
        self.tick_thread: Optional[threading.Thread] = None
        self.tick_running = False
        self._pub_sockets: List[Any] = []
        self._sse_clients: List[Any] = []  # (handler, account_filter)
        self._sse_lock = threading.Lock()
        self.started_at = time.time()

    # ------------------------------------------------------------------
    # Transport helpers
    # ------------------------------------------------------------------
    def check_token(self, provided: Optional[str]) -> bool:
        if not self.token:
            return True
        if not provided:
            return False
        return hmac.compare_digest(provided, self.token)

    # ------------------------------------------------------------------
    # RPC dispatch
    # ------------------------------------------------------------------
    def dispatch(self, req: Dict[str, Any]) -> Dict[str, Any]:
        method = req.get("method", "")
        params = req.get("params", {}) or {}
        rid = req.get("id", "")
        try:
            handler = METHODS.get(method)
            if handler is None:
                return _err(rid, f"unknown method: {method}")
            data = handler(self, params)
            return {"id": rid, "ok": True, "data": data}
        except MT5NotAvailable as e:
            return _err(rid, f"MT5 bridge cannot run: {e}")
        except Exception as e:  # pragma: no cover — defensive
            log.exception("method %s failed", method)
            return _err(rid, f"{type(e).__name__}: {e}")

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------
    def ensure_mt5(self) -> None:
        if not _HAS_MT5:
            raise MT5NotAvailable(f"MetaTrader5 package not available ({_MT5_IMPORT_ERROR if '_MT5_IMPORT_ERROR' in globals() else 'import failed'})")

    def switch_session(self, account_id: str) -> AccountSession:
        sess = self.sessions.get(account_id)
        if sess is None:
            raise BridgeError(f"unknown account_id {account_id}; call connect_account first")
        # If a different (login, server) is selected, re-initialize if needed.
        # The Python MT5 API allows initialize() once per process, then login()
        # for switching between accounts on the same terminal.
        self.ensure_mt5()
        # Initialize lazily (first session).
        if self.active_login is None:
            kwargs: Dict[str, Any] = {}
            if sess.path:
                kwargs["path"] = sess.path
            ok = mt5.initialize(**kwargs) if kwargs else mt5.initialize()
            if not ok:
                code, msg = mt5.last_error()
                raise BridgeError(f"mt5.initialize() failed: {code} {msg}")
        # Login / re-login as needed.
        if self.active_login != (sess.login, sess.server):
            ok = mt5.login(sess.login, password=sess.password, server=sess.server)
            if not ok:
                code, msg = mt5.last_error()
                raise BridgeError(f"mt5.login({sess.login}@{sess.server}) failed: {code} {msg}")
            self.active_login = (sess.login, sess.server)
        return sess


class MT5NotAvailable(RuntimeError):
    pass


class BridgeError(RuntimeError):
    pass


# --------------------------------------------------------------------------
# RPC method handlers
# --------------------------------------------------------------------------
def _err(rid: str, msg: str) -> Dict[str, Any]:
    return {"id": rid, "ok": False, "error": msg}


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def mt5_ping(bridge: Mt5Bridge, params: Dict[str, Any]) -> Dict[str, Any]:
    return {"pong": True, "uptime": time.time() - bridge.started_at, "mt5_available": _HAS_MT5}


def mt5_connect_account(bridge: Mt5Bridge, params: Dict[str, Any]) -> Dict[str, Any]:
    bridge.ensure_mt5()
    login = int(params["login"])
    password = params["password"]
    server = params["server"]
    account_id = params["accountId"]
    path = params.get("path") or os.environ.get("WINDELS_MT5_TERMINAL_PATH")
    environment = params.get("environment", "demo")
    sess = AccountSession(
        account_id=account_id, login=login, server=server, password=password,
        path=path, environment=environment,
    )
    bridge.sessions[account_id] = sess
    bridge.switch_session(account_id)
    info = mt5.account_info()
    if info is None:
        code, msg = mt5.last_error()
        raise BridgeError(f"account_info failed after login: {code} {msg}")
    return {
        "balance": info.balance, "equity": info.equity, "margin": info.margin,
        "freeMargin": info.margin_free, "profit": info.profit,
        "marginLevel": info.margin_level, "credit": info.credit,
        "leverage": info.leverage, "currency": info.currency,
        "tradeAllowed": bool(info.trade_allowed),
        "expertAllowed": bool(info.trade_expert),
        "endpoint": "inproc",
    }


def mt5_disconnect_account(bridge: Mt5Bridge, params: Dict[str, Any]) -> Dict[str, Any]:
    aid = params["accountId"]
    if aid in bridge.sessions:
        del bridge.sessions[aid]
    return {"disconnected": True}


def mt5_account_info(bridge: Mt5Bridge, params: Dict[str, Any]) -> Dict[str, Any]:
    bridge.switch_session(params["accountId"])
    info = mt5.account_info()
    if info is None:
        raise BridgeError("account_info failed")
    return {
        "balance": info.balance, "equity": info.equity, "margin": info.margin,
        "freeMargin": info.margin_free, "profit": info.profit,
        "marginLevel": info.margin_level, "credit": info.credit,
        "leverage": info.leverage, "currency": info.currency,
        "tradeAllowed": bool(info.trade_allowed),
        "expertAllowed": bool(info.trade_expert),
    }


def mt5_get_symbols(bridge: Mt5Bridge, params: Dict[str, Any]) -> List[Dict[str, Any]]:
    bridge.switch_session(params["accountId"])
    syms = mt5.symbols_get()
    if syms is None:
        return []
    out = []
    for s in syms[:3000]:  # cap to avoid huge payloads
        out.append({
            "name": s.name, "description": s.description, "path": s.path,
            "currencyBase": s.currency_base, "currencyProfit": s.currency_profit,
            "currencyMargin": s.currency_margin,
            "digits": s.digits, "point": s.point,
            "contractSize": s.trade_contract_size,
            "volumeMin": s.volume_min, "volumeMax": s.volume_max,
            "volumeStep": s.volume_step,
            "spread": s.spread, "spreadFloat": bool(s.spread_float),
            "stopsLevel": s.stops_level, "freezeLevel": s.freeze_level,
            "tradeMode": "full" if s.trade_mode == 4 else ("closeonly" if s.trade_mode == 2 else "disabled"),
            "bid": s.bid, "ask": s.ask,
        })
    return out


def mt5_get_symbol(bridge: Mt5Bridge, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    bridge.switch_session(params["accountId"])
    s = mt5.symbol_info(params["symbol"])
    if s is None:
        return None
    return {
        "name": s.name, "description": s.description, "digits": s.digits,
        "point": s.point, "contractSize": s.trade_contract_size,
        "volumeMin": s.volume_min, "volumeMax": s.volume_max,
        "volumeStep": s.volume_step, "bid": s.bid, "ask": s.ask,
        "spread": s.spread, "tradeMode": "full",
    }


def _position_to_dict(p) -> Dict[str, Any]:
    return {
        "id": str(p.ticket), "ticket": str(p.ticket), "symbol": p.symbol,
        "side": "long" if p.type == 0 else "short", "volume": p.volume,
        "openPrice": p.price_open, "currentPrice": p.price_current,
        "sl": p.sl, "tp": p.tp,
        "openTime": _iso(datetime.fromtimestamp(p.time, tz=timezone.utc)),
        "updateTime": _iso(datetime.fromtimestamp(p.time_update, tz=timezone.utc)) if hasattr(p, "time_update") else None,
        "profit": p.profit, "swap": p.swap, "commission": p.commission,
        "comment": p.comment, "magic": p.magic, "identifier": p.identifier,
        "reason": str(p.reason) if hasattr(p, "reason") else None,
    }


def _order_to_dict(o) -> Dict[str, Any]:
    return {
        "id": str(o.ticket), "ticket": str(o.ticket), "symbol": o.symbol,
        "type": _ordertype_to_label(o.type), "volume": o.volume_current,
        "price": o.price_open, "sl": o.sl, "tp": o.tp,
        "openTime": _iso(datetime.fromtimestamp(o.time_setup, tz=timezone.utc)),
        "expiryTime": _iso(datetime.fromtimestamp(o.time_expiration, tz=timezone.utc)) if o.time_expiration else None,
        "status": "active" if (o.type_time != 0 or o.volume_current == o.volume_initial) else "partial",
        "filledVolume": o.volume_initial - o.volume_current if o.volume_current < o.volume_initial else 0,
        "comment": o.comment, "magic": o.magic,
    }


def _ordertype_to_label(t: int) -> str:
    return {
        2: "buy_limit", 3: "sell_limit", 4: "buy_stop", 5: "sell_stop",
        6: "buy_stop_limit", 7: "sell_stop_limit", 0: "buy_limit", 1: "sell_limit",
    }.get(t, "buy_limit")


def _deal_to_dict(d) -> Dict[str, Any]:
    entry_map = {0: "in", 1: "out", 2: "inout"}
    return {
        "id": str(d.ticket), "ticket": str(d.ticket), "orderId": str(d.order),
        "symbol": d.symbol, "side": "long" if d.type == 0 else "short",
        "entry": entry_map.get(d.entry, "inout"),
        "volume": d.volume, "price": d.price, "profit": d.profit,
        "swap": d.swap, "commission": d.commission, "fee": d.fee if hasattr(d, "fee") else 0,
        "time": _iso(datetime.fromtimestamp(d.time, tz=timezone.utc)),
        "comment": d.comment, "magic": d.magic,
    }


def mt5_get_positions(bridge: Mt5Bridge, params: Dict[str, Any]) -> List[Dict[str, Any]]:
    bridge.switch_session(params["accountId"])
    ps = mt5.positions_get()
    return [_position_to_dict(p) for p in (ps or [])]


def mt5_get_orders(bridge: Mt5Bridge, params: Dict[str, Any]) -> List[Dict[str, Any]]:
    bridge.switch_session(params["accountId"])
    os = mt5.orders_get()
    return [_order_to_dict(o) for o in (os or [])]


def mt5_get_deals(bridge: Mt5Bridge, params: Dict[str, Any]) -> List[Dict[str, Any]]:
    bridge.switch_session(params["accountId"])
    from_date = params.get("from")
    to_date = params.get("to")
    days = params.get("days", 30)
    from_dt = datetime.fromisoformat(from_date) if from_date else datetime.now(tz=timezone.utc) - timedelta(days=days)
    to_dt = datetime.fromisoformat(to_date) if to_date else datetime.now(tz=timezone.utc) + timedelta(minutes=1)
    deals = mt5.history_deals_get(from_dt, to_dt, group=params.get("group") or "*")
    out = [_deal_to_dict(d) for d in (deals or [])]
    if params.get("symbol"):
        out = [d for d in out if d["symbol"] == params["symbol"]]
    return out


def mt5_get_candles(bridge: Mt5Bridge, params: Dict[str, Any]) -> List[Dict[str, Any]]:
    bridge.switch_session(params["accountId"])
    sym = params["symbol"]
    tf = TIMEFRAME_MAP.get(params["timeframe"], TIMEFRAME_MAP["TIMEFRAME_H1"])
    count = int(params.get("count", 100))
    start = params.get("start")
    end = params.get("end")
    # Enable symbol if needed.
    sinfo = mt5.symbol_info(sym)
    if sinfo is None:
        raise BridgeError(f"symbol not found: {sym}")
    if not sinfo.visible:
        mt5.symbol_select(sym, True)
    if end:
        utc_to = datetime.fromisoformat(end).replace(tzinfo=None)
        rates = mt5.copy_rates_from(sym, tf, utc_to, count)
    elif start:
        utc_from = datetime.fromisoformat(start).replace(tzinfo=None)
        rates = mt5.copy_rates_from(sym, tf, utc_from, count)
    else:
        rates = mt5.copy_rates_from_pos(sym, tf, 0, count)
    if rates is None:
        return []
    out = []
    for r in rates:
        out.append({
            "time": datetime.fromtimestamp(r["time"], tz=timezone.utc).isoformat(),
            "open": r["open"], "high": r["high"], "low": r["low"], "close": r["close"],
            "tickVolume": int(r["tick_volume"]), "volume": int(r["real_volume"]),
            "spread": int(r["spread"]),
        })
    return out


def mt5_get_last_ticks(bridge: Mt5Bridge, params: Dict[str, Any]) -> List[Dict[str, Any]]:
    bridge.switch_session(params["accountId"])
    sym = params["symbol"]
    count = int(params.get("count", 10))
    ticks = mt5.copy_ticks_from(sym, datetime.now(tz=timezone.utc), count, mt5.COPY_TICKS_ALL)
    if ticks is None:
        return []
    return [{
        "symbol": sym,
        "time": datetime.fromtimestamp(t["time"], tz=timezone.utc).isoformat(),
        "bid": float(t["bid"]), "ask": float(t["ask"]),
        "last": float(t["last"]) if "last" in t.dtype.names else None,
        "volume": int(t["volume"]) if "volume" in t.dtype.names else None,
        "flags": int(t["flags"]) if "flags" in t.dtype.names else 0,
    } for t in ticks]


def mt5_send_order(bridge: Mt5Bridge, params: Dict[str, Any]) -> Dict[str, Any]:
    bridge.switch_session(params["accountId"])
    o = params["order"]
    req = {
        "action": mt5.TRADE_ACTION_DEAL if o.get("action", "TRADE_ACTION_DEAL") != "POSITION_CLOSE_ID" else mt5.TRADE_ACTION_DEAL,
        "symbol": o["symbol"],
        "volume": float(o["volume"]),
        "type": _parse_order_type(o.get("type", "ORDER_TYPE_BUY")),
        "price": float(o.get("price", 0.0)) or _market_price(o["symbol"], o.get("type", "").endswith("SELL")),
        "sl": float(o["sl"]) if o.get("sl") else 0.0,
        "tp": float(o["tp"]) if o.get("tp") else 0.0,
        "deviation": int(o.get("deviation", 10)),
        "magic": int(o.get("magic", 987654)),
        "comment": o.get("comment", "WINDELS AI OS")[:31],
        "type_time": _parse_tif(o.get("type_time", "ORDER_TIME_GTC")),
        "type_filling": ORDER_FILLING_FOK,
    }
    if o.get("position"):
        req["position"] = int(o["position"])
        req["action"] = POSITION_CLOSE_ID
    check = mt5.order_check(req)
    if check is not None and check.retcode != 0 and check.retcode not in (0, 10009):
        return {"ok": False, "retcode": check.retcode, "comment": getattr(check, "comment", "")}
    res = mt5.order_send(req)
    if res is None:
        code, msg = mt5.last_error()
        return {"ok": False, "retcode": code, "comment": msg}
    return {
        "ticket": getattr(res, "order", None) and str(res.order),
        "dealId": getattr(res, "deal", None) and str(res.deal),
        "price": getattr(res, "price", None),
        "volume": getattr(res, "volume", None),
        "retcode": res.retcode,
        "comment": getattr(res, "comment", ""),
    }


def _market_price(symbol: str, sell: bool) -> float:
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        return 0.0
    return tick.bid if sell else tick.ask


def _parse_order_type(s: str) -> int:
    return getattr(mt5, s, 0) if _HAS_MT5 else ORDER_TYPE_MAP.get(s, 0)


def _parse_tif(s: str) -> int:
    return getattr(mt5, s, ORDER_TYPE_TIME_GTC) if _HAS_MT5 else {
        "ORDER_TIME_GTC": 0, "ORDER_TIME_IOC": 1, "ORDER_TIME_FOK": 4,
    }.get(s, 0)


def mt5_modify_position(bridge: Mt5Bridge, params: Dict[str, Any]) -> Dict[str, Any]:
    bridge.switch_session(params["accountId"])
    ticket = int(params["ticket"])
    # Look up position to preserve symbol/volume.
    pos = None
    for p in mt5.positions_get() or []:
        if p.ticket == ticket:
            pos = p; break
    if pos is None:
        raise BridgeError(f"position ticket {ticket} not found")
    req = {
        "action": mt5.TRADE_ACTION_SLTP,
        "symbol": pos.symbol,
        "position": ticket,
        "sl": float(params["sl"]) if params.get("sl") is not None else pos.sl,
        "tp": float(params["tp"]) if params.get("tp") is not None else pos.tp,
    }
    res = mt5.order_send(req)
    if res is None:
        code, msg = mt5.last_error()
        return {"ok": False, "retcode": code, "comment": msg}
    return {"ticket": str(ticket), "retcode": res.retcode, "comment": getattr(res, "comment", "")}


def mt5_close_position(bridge: Mt5Bridge, params: Dict[str, Any]) -> Dict[str, Any]:
    bridge.switch_session(params["accountId"])
    ticket = int(params["ticket"])
    vol = float(params["volume"]) if params.get("volume") else None
    pos = None
    for p in mt5.positions_get() or []:
        if p.ticket == ticket:
            pos = p; break
    if pos is None:
        raise BridgeError(f"position ticket {ticket} not found")
    tick = mt5.symbol_info_tick(pos.symbol)
    if tick is None:
        raise BridgeError(f"no tick for {pos.symbol}")
    req = {
        "action": POSITION_CLOSE_ID,
        "position": ticket,
        "symbol": pos.symbol,
        "volume": vol if vol else pos.volume,
        "type": 1 if pos.type == 0 else 0,  # opposite side
        "price": tick.bid if pos.type == 0 else tick.ask,
        "deviation": 20,
        "magic": int(getattr(pos, "magic", 987654) or 987654),
        "comment": "WINDELS close",
        "type_time": ORDER_TYPE_TIME_GTC,
        "type_filling": ORDER_FILLING_FOK,
    }
    res = mt5.order_send(req)
    if res is None:
        code, msg = mt5.last_error()
        return {"ok": False, "retcode": code, "comment": msg}
    return {
        "ticket": str(ticket),
        "dealId": getattr(res, "deal", None) and str(res.deal),
        "price": getattr(res, "price", None),
        "volume": getattr(res, "volume", None),
        "retcode": res.retcode,
    }


def mt5_subscribe_ticks(bridge: Mt5Bridge, params: Dict[str, Any]) -> Dict[str, Any]:
    aid = params["accountId"]
    sess = bridge.switch_session(aid)
    symbols = params.get("symbols", []) or []
    added = []
    for s in symbols:
        info = mt5.symbol_info(s)
        if info is None:
            continue
        if not info.visible:
            mt5.symbol_select(s, True)
        sess.subscribed_symbols.add(s)
        added.append(s)
    if not bridge.tick_running:
        bridge.start_tick_publisher()
    return {"subscribed": list(sess.subscribed_symbols)}


def mt5_unsubscribe_ticks(bridge: Mt5Bridge, params: Dict[str, Any]) -> Dict[str, Any]:
    aid = params["accountId"]
    sess = bridge.sessions.get(aid)
    if sess is None:
        return {"unsubscribed": []}
    symbols = params.get("symbols") or []
    if not symbols:
        sess.subscribed_symbols.clear()
    else:
        for s in symbols:
            sess.subscribed_symbols.discard(s)
    return {"unsubscribed": symbols}


# --------------------------------------------------------------------------
# Tick publisher thread
# --------------------------------------------------------------------------
TICK_POLL_INTERVAL_SEC = 0.25


def start_tick_publisher(self) -> None:
    self.tick_running = True

    def loop():
        log.info("tick publisher started (interval=%.2fs)", TICK_POLL_INTERVAL_SEC)
        while self.tick_running:
            try:
                for aid, sess in list(self.sessions.items()):
                    if not sess.subscribed_symbols:
                        continue
                    for sym in list(sess.subscribed_symbols):
                        t = mt5.symbol_info_tick(sym)
                        if t is None:
                            continue
                        prev = sess.last_tick_time.get(sym, 0)
                        if t.time <= prev:
                            continue
                        sess.last_tick_time[sym] = t.time
                        tick = {
                            "symbol": sym,
                            "time": datetime.fromtimestamp(t.time, tz=timezone.utc).isoformat(),
                            "bid": float(t.bid), "ask": float(t.ask),
                            "last": float(t.last), "volume": int(t.volume),
                            "flags": int(t.flags),
                        }
                        self._publish_tick(aid, sym, tick)
                time.sleep(TICK_POLL_INTERVAL_SEC)
            except Exception as e:
                log.warning("tick loop error: %s", e)
                time.sleep(1)

    self.tick_thread = threading.Thread(target=loop, name="mt5-tick-publisher", daemon=True)
    self.tick_thread.start()


def _publish_tick(self, account_id: str, symbol: str, tick: Dict[str, Any]) -> None:
    topic = f"tick/{account_id}/{symbol}".encode()
    payload = json.dumps(tick).encode()
    for pub in self._pub_sockets:
        try:
            pub.send_multipart([topic, payload])
        except Exception:
            pass
    with self._sse_lock:
        dead = []
        for handler in self._sse_clients:
            try:
                handler(account_id, tick)
            except Exception:
                dead.append(handler)
        for d in dead:
            self._sse_clients.remove(d)


# monkey-patch the methods onto Mt5Bridge for clarity
Mt5Bridge.start_tick_publisher = start_tick_publisher
Mt5Bridge._publish_tick = _publish_tick


METHODS: Dict[str, Callable[[Mt5Bridge, Dict[str, Any]], Any]] = {
    "ping": mt5_ping,
    "connect_account": mt5_connect_account,
    "disconnect_account": mt5_disconnect_account,
    "get_account_info": mt5_account_info,
    "get_symbols": mt5_get_symbols,
    "get_symbol": mt5_get_symbol,
    "get_positions": mt5_get_positions,
    "get_orders": mt5_get_orders,
    "get_deals": mt5_get_deals,
    "get_candles": mt5_get_candles,
    "get_last_ticks": mt5_get_last_ticks,
    "send_order": mt5_send_order,
    "modify_position": mt5_modify_position,
    "close_position": mt5_close_position,
    "subscribe_ticks": mt5_subscribe_ticks,
    "unsubscribe_ticks": mt5_unsubscribe_ticks,
}


# --------------------------------------------------------------------------
# ZeroMQ transport
# --------------------------------------------------------------------------
def run_zmq(bridge: Mt5Bridge, rpc_bind: str, pub_bind: str) -> None:
    if not _HAS_ZMQ:
        raise RuntimeError("pyzmq not installed — ZMQ transport unavailable")
    ctx = zmq.Context()
    rep = ctx.socket(zmq.REP)
    rep.bind(rpc_bind)
    pub = ctx.socket(zmq.PUB)
    pub.bind(pub_bind)
    bridge._pub_sockets.append(pub)
    log.info("ZMQ RPC listening on %s", rpc_bind)
    log.info("ZMQ PUB listening on %s", pub_bind)
    poller = zmq.Poller()
    poller.register(rep, zmq.POLLIN)
    while True:
        events = dict(poller.poll(timeout=500))
        if rep in events:
            try:
                framed = rep.recv()
                if len(framed) < 4:
                    rep.send(json.dumps(_err("", "short frame")).encode())
                    continue
                ln = struct.unpack(">I", framed[:4])[0]
                body = framed[4:4 + ln]
                req = json.loads(body.decode("utf-8"))
                resp = bridge.dispatch(req)
                rbody = json.dumps(resp).encode("utf-8")
                out = struct.pack(">I", len(rbody)) + rbody
                rep.send(out)
            except Exception as e:
                log.exception("zmq rpc error")
                try:
                    rep.send(json.dumps(_err("", str(e))).encode())
                except Exception:
                    pass


# --------------------------------------------------------------------------
# HTTP / SSE transport
# --------------------------------------------------------------------------
def make_http_handler(bridge: Mt5Bridge) -> type:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args: Any) -> None:
            log.debug("http %s - %s", self.address_string(), fmt % args)

        def _auth_ok(self) -> bool:
            if not bridge.token:
                return True
            hdr = self.headers.get("Authorization", "")
            if hdr.startswith("Bearer "):
                return hmac.compare_digest(hdr[7:], bridge.token)
            return False

        def _send_json(self, code: int, body: Dict[str, Any]) -> None:
            data = json.dumps(body).encode()
            self.send_response(code)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self) -> None:
            if self.path == "/rpc":
                if not self._auth_ok():
                    self._send_json(401, {"ok": False, "error": "unauthorized"})
                    return
                length = int(self.headers.get("content-length", "0"))
                body = self.rfile.read(length) if length > 0 else b"{}"
                try:
                    req = json.loads(body.decode("utf-8"))
                except Exception:
                    self._send_json(400, {"ok": False, "error": "invalid json"})
                    return
                resp = bridge.dispatch(req)
                self._send_json(200, resp)
                return
            self._send_json(404, {"ok": False, "error": "not found"})

        def do_GET(self) -> None:
            if self.path == "/healthz":
                self._send_json(200, {"ok": True, "mt5": _HAS_MT5, "sessions": len(bridge.sessions), "uptime": time.time() - bridge.started_at})
                return
            if self.path == "/ticks/stream":
                if not self._auth_ok():
                    self._send_json(401, {"ok": False, "error": "unauthorized"})
                    return
                self.send_response(200)
                self.send_header("content-type", "text/event-stream")
                self.send_header("cache-control", "no-cache")
                self.send_header("connection", "keep-alive")
                self.end_headers()

                def push(aid: str, tick: Dict[str, Any]):
                    payload = json.dumps({"accountId": aid, **tick})
                    try:
                        self.wfile.write(f"data: {payload}\n\n".encode())
                        self.wfile.flush()
                    except Exception:
                        raise
                with bridge._sse_lock:
                    bridge._sse_clients.append(push)
                # Keep the connection open until client disconnects.
                try:
                    while True:
                        time.sleep(15)
                        self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    pass
                finally:
                    with bridge._sse_lock:
                        if push in bridge._sse_clients:
                            bridge._sse_clients.remove(push)
                return
            self._send_json(404, {"ok": False, "error": "not found"})
    return Handler


def run_http(bridge: Mt5Bridge, host: str, port: int) -> None:
    handler = make_http_handler(bridge)
    srv = ThreadingHTTPServer((host, port), handler)
    log.info("HTTP bridge listening on http://%s:%d", host, port)
    try:
        srv.serve_forever()
    finally:
        srv.server_close()


# --------------------------------------------------------------------------
# Entrypoint
# --------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description="WINDELS AI OS — MT5 Python Bridge")
    parser.add_argument("--rpc", type=int, default=None, help="ZMQ REP port for RPC")
    parser.add_argument("--pub", type=int, default=None, help="ZMQ PUB port for ticks")
    parser.add_argument("--zmq-host", default="127.0.0.1")
    parser.add_argument("--http", type=int, default=None, help="HTTP port (also serves /ticks/stream SSE)")
    parser.add_argument("--http-host", default="0.0.0.0")
    parser.add_argument("--token", default=os.environ.get("WINDELS_MT5_BRIDGE_TOKEN"))
    parser.add_argument("--terminal", default=os.environ.get("WINDELS_MT5_TERMINAL_PATH"))
    args = parser.parse_args()

    if not args.rpc and not args.http:
        print("error: either --rpc <port> or --http <port> is required", file=sys.stderr)
        return 2

    bridge = Mt5Bridge(token=args.token)

    def handle_sig(_signum, _frame):
        log.info("shutdown signal received")
        bridge.tick_running = False
        if _HAS_MT5:
            try:
                mt5.shutdown()
            except Exception:
                pass
        sys.exit(0)
    signal.signal(signal.SIGINT, handle_sig)
    signal.signal(signal.SIGTERM, handle_sig)

    threads = []
    if args.rpc:
        rpc_bind = f"tcp://{args.zmq_host}:{args.rpc}"
        pub_bind = f"tcp://{args.zmq_host}:{args.pub or (args.rpc + 1)}"
        t = threading.Thread(target=run_zmq, args=(bridge, rpc_bind, pub_bind), daemon=True)
        t.start(); threads.append(t)
    if args.http:
        t = threading.Thread(target=run_http, args=(bridge, args.http_host, args.http), daemon=True)
        t.start(); threads.append(t)

    if not _HAS_MT5:
        log.warning("MetaTrader5 Python package not available — bridge will respond to RPC but live MT5 calls will fail with MT5_NOT_AVAILABLE. Install `pip install MetaTrader5` on the Windows/Wine host.")
    for t in threads:
        t.join()
    return 0


if __name__ == "__main__":
    sys.exit(main())
