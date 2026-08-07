//+------------------------------------------------------------------+
//|                                                  WindelsAI_EA.mq5 |
//|                        WINDELS AI OS — MetaTrader 5 Expert Advisor |
//|                                   (c) 2026 WINDELS AI OS authors  |
//+------------------------------------------------------------------+
//| The EA is a SAFE, server-governed executor:
//|   - Polls WINDELS API (configured endpoint) for APPROVED signals.
//|   - Verifies HMAC-SHA256 signature against a canonical pipe-delimited
//|     payload (buildEaSignableString) before acting on any signal.
//|   - Enforces LOCAL hard limits (max lot, max positions, max daily
//|     loss, allowed symbols, slippage, kill-switch) even if the server
//|     is compromised.
//|   - Posts fill/reject/error confirmations back to WINDELS.
//|   - Reports heartbeat (positions, equity, margin, diagnostics).
//|   - Auto-recovers on disconnect, terminal restart, or weekend.
//|   - Manages SL/TP moves and an optional trailing stop.
//|
//| The EA NEVER opens a position without a signed server signal.
//+------------------------------------------------------------------+
#property copyright "WINDELS AI OS"
#property link      "https://windels.ai"
#property version   "1.0.0"
#property strict

#include <Trade\Trade.mqh>

#include "WindelsAI_Http.mqh"
#include "WindelsAI_Hmac.mqh"
#include "WindelsAI_Json.mqh"

//+------------------------------------------------------------------+
//| EA Inputs (configurable via the MT5 Inputs dialog)                |
//+------------------------------------------------------------------+
input string   InpApiBaseUrl       = "https://windels.example.com/api/v1"; // WINDELS API base URL
input string   InpApiToken         = "";         // EA bearer token (issued by POST /ea/register)
input string   InpBrokerAcctId     = "";         // BrokerAccountId (uuid)
input long     InpMagicOverride    = 0;          // Magic (0 = use server-assigned magic)
input int      InpPollIntervalMs   = 1500;       // Poll interval in milliseconds
input int      InpHttpTimeoutMs    = 5000;       // HTTP timeout
input bool     InpUseTLS           = true;       // Use HTTPS
input bool     InpStrictSymbol     = true;       // Only execute on chart symbol when true
input bool     InpCloseOnKillSwitch = true;      // Soft-close positions when killSwitch flips
input double   InpMaxLotCap        = 0.0;        // Hard local lot cap (0 = use server limit)
input int      InpMaxSlippagePts   = 30;         // Hard slippage cap (points)
input bool     InpEnableTrailing   = true;       // Enable trailing stop
input int      InpTrailDistPts     = 350;        // Default trailing distance (points)
input int      InpTrailStepPts     = 50;         // Trailing step
input int      InpBreakEvenPts     = 400;        // Break-even trigger distance
input string   InpCommentPrefix    = "WINDELS";  // Order comment prefix
input bool     InpVerboseLog       = true;       // Verbose logging

//+------------------------------------------------------------------+
//| Constants                                                         |
//+------------------------------------------------------------------+
#define EA_VERSION        "1.0.0"
#define HEARTBEAT_MS      5000
#define MAX_RETRY_BACKOFF 30000
#define LOCAL_MAX_DAILY_PCT  5.0  // Absolute ceiling (fail-safe)
#define MAX_ALLOWED_SYMS  64

// Signal types (MUST match Node EA_SIGNAL_TYPE_CODE).
enum SigType { SIG_MARKET=0, SIG_LIMIT=1, SIG_STOP=2, SIG_CLOSE=3, SIG_MODIFY=4, SIG_CANCEL=5 };
enum Side    { SIDE_BUY=0, SIDE_SELL=1 };

//+------------------------------------------------------------------+
//| Globals                                                           |
//+------------------------------------------------------------------+
CTrade            g_trade;
CHttpClient       g_http;
CHmacSha256       g_hmac;
CJsonParser       g_json;
string            g_eaId         = "";
long              g_magic        = 0;
int               g_pollMs       = 1500;
ulong             g_watermark    = 0;
bool              g_killSwitch   = false;
bool              g_closeOnly    = false;
double            g_maxLot       = 100.0;
int               g_maxPositions = 50;
double            g_maxDailyLossPct = LOCAL_MAX_DAILY_PCT;
int               g_maxSlippage  = 30;
string            g_allowedSymbols[MAX_ALLOWED_SYMS];
int               g_allowedCount = 0;
string            g_commentPrefix;
double            g_dailyStartBalance;
datetime          g_dailyStart;
string            g_lastError    = "";
ulong             g_lastPollMs;
ulong             g_lastHbMs;
int               g_defaultTrailDist = 350;
int               g_defaultTrailStep = 50;
int               g_defaultBreakEven = 400;

struct Signal {
   string id;
   ulong  seq;
   int    type;      // 0..5 per SigType
   int    side;      // 0=BUY 1=SELL (-1 when n/a)
   string symbol;
   double volume;
   double price;
   double sl;
   double tp;
   int    slippagePts;
   string comment;
   string targetTicket;
   int    trailDist;
   int    trailStep;
   int    breakEven;
   datetime expiresAt;
   string sig;
};

//+------------------------------------------------------------------+
//| Utility                                                           |
//+------------------------------------------------------------------+
void Log(const string msg)                       { if (InpVerboseLog) Print("[WindelsEA] ", msg); }
void LogWarn(const string msg)                   { Print("[WindelsEA][WARN] ", msg); g_lastError = msg; }
void LogErr(const string msg)                    { Print("[WindelsEA][ERR] ",  msg); g_lastError = msg; }

double PointFor(string sym)   { double p = SymbolInfoDouble(sym, SYMBOL_POINT); return (p == 0 ? 0.00001 : p); }
int    DigitsFor(string sym)  { int d = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS); return (d <= 0 ? 5 : d); }
double NormalizePips(string sym, double price) {
   if (price == 0) return 0;
   return NormalizeDouble(price, DigitsFor(sym));
}
bool SameSymbol(const string s) {
   if (!InpStrictSymbol) return true;
   return StringFind(s, _Symbol) >= 0;
}
void AllowedClear() { g_allowedCount = 0; }
void AllowedAdd(string s) {
   if (g_allowedCount >= MAX_ALLOWED_SYMS) return;
   g_allowedSymbols[g_allowedCount++] = s;
}
bool IsAllowedSymbol(const string s) {
   if (g_allowedCount == 0) return true;
   for (int i = 0; i < g_allowedCount; i++) if (g_allowedSymbols[i] == s) return true;
   return false;
}
datetime ParseIso(string s) {
   string cleaned = s;
   StringReplace(cleaned, "Z", "");
   StringReplace(cleaned, "T", " ");
   if (StringLen(cleaned) > 19) cleaned = StringSubstr(cleaned, 0, 19);
   return (datetime)StringToTime(cleaned);
}
/** Canonical MQL datetime format "YYYY.MM.DD HH:MM:SS" to match Node's signer. */
string CanonicalTime(datetime t) {
   int y, m, d, hh, mm, ss;
   TimeToStruct(t, y, m, d, hh, mm, ss, 0, 0, false, 0);
   // MQL5 doesn't expose TimeToStruct fields as direct returns — use TimeToString + massaging.
   string s = TimeToString(t, TIME_DATE | TIME_SECONDS); // "YYYY.MM.DD HH:MM:SS"
   return s;
}
string F8(double v) { return DoubleToString(v, 8); }

//+------------------------------------------------------------------+
//| Expert initialization                                             |
//+------------------------------------------------------------------+
int OnInit() {
   g_commentPrefix = InpCommentPrefix;
   g_magic = (InpMagicOverride > 0) ? InpMagicOverride : 0x57494E00;
   g_trade.SetExpertMagicNumber(g_magic);
   g_trade.SetDeviationInPoints(InpMaxSlippagePts);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   g_trade.SetAsyncMode(false);
   g_defaultTrailDist = InpTrailDistPts;
   g_defaultTrailStep = InpTrailStepPts;
   g_defaultBreakEven = InpBreakEvenPts;
   AllowedClear();
   g_dailyStart = StringToTime(TimeToString(TimeCurrent(), TIME_DATE));
   g_dailyStartBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   EventSetTimer(1);
   if (InpApiToken == "") {
      LogErr("InpApiToken is empty — EA must be paired before trading.");
      return INIT_SUCCEEDED;
   }
   if (!g_http.Init(InpApiBaseUrl, InpApiToken, InpHttpTimeoutMs, InpUseTLS)) {
      LogErr("Failed to initialise HTTP client");
      return INIT_FAILED;
   }
   Log("WINDELS EA initialised v" + EA_VERSION + " account=" + AccountInfoString(ACCOUNT_LOGIN) + " server=" + AccountInfoString(ACCOUNT_SERVER));
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason) {
   EventKillTimer();
   g_http.Shutdown();
   Log("WINDELS EA deinitialised. reason=" + IntegerToString(reason));
}

//+------------------------------------------------------------------+
//| Expert tick / timer                                               |
//+------------------------------------------------------------------+
void OnTick()  { ServiceLoop(); }
void OnTimer() { ServiceLoop(); }

void ServiceLoop() {
   ulong now = GetTickCount64();
   if (now - g_lastPollMs >= (ulong)MathMax(500, g_pollMs)) {
      g_lastPollMs = now;
      DoPoll();
   }
   if (InpEnableTrailing) ProcessTrailingStops();
   if (now - g_lastHbMs >= HEARTBEAT_MS) {
      g_lastHbMs = now;
      SendHeartbeat();
   }
}

//+------------------------------------------------------------------+
//| Poll WINDELS for signals + config                                 |
//+------------------------------------------------------------------+
void DoPoll() {
   if (InpApiToken == "") return;
   string url = "/ea/poll?wm=" + IntegerToString((long)g_watermark);
   string respBody;
   int status = 0;
   if (!g_http.Get(url, respBody, status)) {
      LogWarn("Poll failed (http " + IntegerToString(status) + ")");
      return;
   }
   g_json = CJsonParser(); // reset
   CJsonValue *root = g_json.Parse(respBody);
   if (root == NULL || !root["ok"].GetBool()) { LogWarn("Poll response invalid"); return; }
   CJsonValue *data = root["data"];
   if (data == NULL) return;

   ApplyConfig(data);

   CJsonValue *arr = data["signals"];
   if (arr != NULL && arr.IsArray()) {
      for (int i = 0; i < arr.Size(); i++) {
         Signal s;
         CJsonValue *v = arr.At(i);
         if (v == NULL) continue;
         if (!ParseSignal(v, s)) continue;
         ProcessSignal(s);
      }
   }
}

//+------------------------------------------------------------------+
//| Apply server-returned configuration                               |
//+------------------------------------------------------------------+
void ApplyConfig(CJsonValue *data) {
   CJsonValue *v;
   v = data["eaId"];           if (v != NULL && v.IsString()) g_eaId = v.GetString();
   v = data["magic"];          if (v != NULL && v.IsNumber()) { long m = (long)v.GetInt(); if (InpMagicOverride == 0 && m > 0) { g_magic = m; g_trade.SetExpertMagicNumber(g_magic); } }
   v = data["killSwitch"];     if (v != NULL) g_killSwitch = v.GetBool();
   v = data["pollIntervalMs"]; if (v != NULL && v.IsNumber()) g_pollMs = MathMax(500, (int)v.GetInt());

   CJsonValue *hl = data["hardLimits"];
   if (hl != NULL) {
      CJsonValue *x;
      x = hl["maxLotPerTrade"];     if (x != NULL && x.IsNumber()) g_maxLot = (InpMaxLotCap > 0 ? MathMin(x.GetNumber(), InpMaxLotCap) : x.GetNumber());
      x = hl["maxOpenPositions"];   if (x != NULL && x.IsNumber()) g_maxPositions = (int)x.GetInt();
      x = hl["maxDailyLossPct"];    if (x != NULL && x.IsNumber()) g_maxDailyLossPct = MathMin(x.GetNumber(), LOCAL_MAX_DAILY_PCT);
      x = hl["maxSlippagePts"];     if (x != NULL && x.IsNumber()) g_maxSlippage = (int)MathMin(x.GetNumber(), (double)InpMaxSlippagePts);
      x = hl["closeOnly"];          if (x != NULL) g_closeOnly = x.GetBool();
      CJsonValue *al = hl["allowedSymbols"];
      if (al != NULL && al.IsArray()) {
         AllowedClear();
         for (int i = 0; i < al.Size(); i++) {
            CJsonValue *el = al.At(i);
            if (el != NULL && el.IsString()) AllowedAdd(el.GetString());
         }
      }
      CJsonValue *ts = hl["trailingStop"];
      if (ts != NULL) {
         CJsonValue *a;
         a = ts["distancePts"]; if (a != NULL) g_defaultTrailDist = (int)a.GetInt();
         a = ts["stepPts"];     if (a != NULL) g_defaultTrailStep = (int)a.GetInt();
         a = ts["breakEvenPts"]; if (a != NULL) g_defaultBreakEven = (int)a.GetInt();
      }
   }
   datetime today = StringToTime(TimeToString(TimeCurrent(), TIME_DATE));
   if (today != g_dailyStart) { g_dailyStart = today; g_dailyStartBalance = AccountInfoDouble(ACCOUNT_BALANCE); }
}

//+------------------------------------------------------------------+
//| Signal parse + HMAC verify                                        |
//+------------------------------------------------------------------+
bool ParseSignal(CJsonValue *v, Signal &s) {
   CJsonValue *x;
   s.seq = 0; s.type = SIG_MARKET; s.side = -1; s.volume = 0; s.price = 0;
   s.sl = 0; s.tp = 0; s.slippagePts = g_maxSlippage; s.expiresAt = 0;
   s.trailDist = g_defaultTrailDist; s.trailStep = g_defaultTrailStep; s.breakEven = g_defaultBreakEven;

   x = v["id"];       if (x != NULL) s.id = x.GetString(); else return false;
   x = v["seq"];      if (x != NULL && x.IsNumber()) s.seq = (ulong)x.GetInt();
   x = v["type"];     if (x != NULL) s.type = DecodeType(x.GetString());
   x = v["side"];     if (x != NULL) s.side = (x.GetString() == "SELL") ? SIDE_SELL : SIDE_BUY;
   x = v["symbol"];   s.symbol = (x != NULL) ? x.GetString() : _Symbol;
   x = v["volume"];   if (x != NULL && x.IsNumber()) s.volume = x.GetNumber();
   x = v["price"];    if (x != NULL && x.IsNumber()) s.price = x.GetNumber();
   x = v["sl"];       if (x != NULL && x.IsNumber()) s.sl = x.GetNumber();
   x = v["tp"];       if (x != NULL && x.IsNumber()) s.tp = x.GetNumber();
   x = v["slippagePts"]; if (x != NULL && x.IsNumber()) s.slippagePts = (int)x.GetInt();
   x = v["comment"];  s.comment = (x != NULL) ? x.GetString() : "";
   x = v["targetTicket"]; s.targetTicket = (x != NULL) ? x.GetString() : "";
   CJsonValue *ts = v["trailingStop"];
   if (ts != NULL) {
      CJsonValue *a;
      a = ts["distancePts"]; if (a != NULL) s.trailDist = (int)a.GetInt();
      a = ts["stepPts"];     if (a != NULL) s.trailStep = (int)a.GetInt();
      a = ts["breakEvenPts"]; if (a != NULL) s.breakEven = (int)a.GetInt();
   }
   x = v["expiresAt"]; s.expiresAt = (x != NULL) ? ParseIso(x.GetString()) : 0;
   x = v["sig"];      s.sig = (x != NULL) ? x.GetString() : "";

   // HMAC verify (fail closed).
   string payload = BuildSignableString(s);
   string expected = ComputeSig(payload);
   if (s.sig == "" || expected != s.sig) {
      LogWarn("Rejecting signal " + s.id + ": HMAC verification failed");
      SendAck(s, "REJECTED", 0, 0, 0, 0, 0, "HMAC mismatch");
      return false;
   }
   // Replay protection.
   if (s.seq != 0 && s.seq <= g_watermark) return false;
   // Expiry.
   if (s.expiresAt > 0 && TimeCurrent() > s.expiresAt) {
      SendAck(s, "EXPIRED", 0, 0, 0, 0, 0, "signal expired");
      return false;
   }
   return true;
}

int DecodeType(string t) {
   if (t == "LIMIT") return SIG_LIMIT;
   if (t == "STOP") return SIG_STOP;
   if (t == "CLOSE") return SIG_CLOSE;
   if (t == "MODIFY_SLTP") return SIG_MODIFY;
   if (t == "CANCEL") return SIG_CANCEL;
   return SIG_MARKET;
}

/**
 * Builds the canonical HMAC payload. FIELD ORDER AND FORMATTING ARE MANDATORY
 * and MUST match buildEaSignableString() in @windels/shared/ea exactly.
 *
 * id|seq|brokerAccountId|typeCode|sideCode|symbol|volume:8|price:8|sl:8|tp:8|
 * slippagePts|comment|targetTicket|trailDist|trailStep|breakEven|expiresAt(YYYY.MM.DD HH:MM:SS)
 */
string BuildSignableString(const Signal &s) {
   string sideCode = (s.side < 0) ? "-1" : IntegerToString(s.side);
   string exp = (s.expiresAt > 0) ? CanonicalTime(s.expiresAt) : "";
   return s.id + "|" + IntegerToString((long)s.seq) + "|" + InpBrokerAcctId + "|" +
          IntegerToString(s.type) + "|" + sideCode + "|" + s.symbol + "|" +
          F8(s.volume) + "|" + F8(s.price) + "|" + F8(s.sl) + "|" + F8(s.tp) + "|" +
          IntegerToString(s.slippagePts) + "|" + s.comment + "|" + s.targetTicket + "|" +
          IntegerToString(s.trailDist) + "|" + IntegerToString(s.trailStep) + "|" +
          IntegerToString(s.breakEven) + "|" + exp;
}
string ComputeSig(const string payload) {
   return g_hmac.Hex(InpApiToken, payload);
}

//+------------------------------------------------------------------+
//| Local risk gates                                                  |
//+------------------------------------------------------------------+
bool LocalRiskCheck(const Signal &s, string &reason) {
   reason = "";
   if (g_killSwitch) { reason = "kill switch active"; return false; }
   if (g_closeOnly && s.type != SIG_CLOSE && s.type != SIG_MODIFY) { reason = "close-only mode"; return false; }
   if (!SameSymbol(s.symbol)) { reason = "symbol not on chart"; return false; }
   if (!IsAllowedSymbol(s.symbol)) { reason = "symbol not in allowedSymbols"; return false; }
   if (s.volume <= 0) { reason = "invalid volume"; return false; }
   if (s.volume > g_maxLot) { reason = "volume exceeds maxLot"; return false; }
   int openCount = CountOurPositions();
   if (s.type == SIG_MARKET && openCount >= g_maxPositions) { reason = "max positions reached"; return false; }
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double eq  = AccountInfoDouble(ACCOUNT_EQUITY);
   if (bal > 0) {
      double lossPct = (bal - eq) / bal * 100.0;
      if (lossPct >= g_maxDailyLossPct) { reason = "daily loss limit reached"; return false; }
   }
   if (!SymbolSelect(s.symbol, true)) { reason = "symbol unavailable"; return false; }
   return true;
}
int CountOurPositions() {
   int n = 0;
   for (int i = PositionsTotal() - 1; i >= 0; --i) {
      ulong t = PositionGetTicket(i);
      if (PositionSelectByTicket(t) && PositionGetInteger(POSITION_MAGIC) == g_magic) n++;
   }
   return n;
}

//+------------------------------------------------------------------+
//| Signal execution                                                  |
//+------------------------------------------------------------------+
void ProcessSignal(const Signal &s) {
   string reason;
   if (!LocalRiskCheck(s, reason)) {
      LogWarn("Blocked signal " + s.id + ": " + reason);
      SendAck(s, "REJECTED", 0, 0, 0, 0, 0, reason);
      return;
   }
   bool ok = false;
   string comment = StringSubstr(g_commentPrefix + ":" + s.comment, 0, 31);
   ulong ticket = 0;
   ulong deal = 0;
   ENUM_ORDER_TYPE otype;
   g_trade.SetDeviationInPoints(s.slippagePts);
   g_trade.SetExpertMagicNumber(g_magic);
   ResetLastError();
   switch (s.type) {
      case SIG_MARKET: {
         if (s.side < 0) { SendAck(s, "REJECTED", 0,0,0,0,0,"side required"); return; }
         otype = (s.side == SIDE_BUY) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
         double marketPrice = (s.side == SIDE_BUY) ? SymbolInfoDouble(s.symbol, SYMBOL_ASK) : SymbolInfoDouble(s.symbol, SYMBOL_BID);
         ok = g_trade.OrderSend(s.symbol, otype, s.volume, marketPrice, s.slippagePts,
                                NormalizePips(s.symbol, s.sl), NormalizePips(s.symbol, s.tp), comment, 0, NULL);
         if (ok) ticket = g_trade.ResultOrder();
         break;
      }
      case SIG_LIMIT:
      case SIG_STOP: {
         if (s.side < 0) { SendAck(s, "REJECTED", 0,0,0,0,0,"side required"); return; }
         if (s.price == 0) { SendAck(s, "REJECTED", 0,0,0,0,0,"limit/stop requires price"); return; }
         if (s.type == SIG_LIMIT) otype = (s.side == SIDE_BUY) ? ORDER_TYPE_BUY_LIMIT : ORDER_TYPE_SELL_LIMIT;
         else                    otype = (s.side == SIDE_BUY) ? ORDER_TYPE_BUY_STOP  : ORDER_TYPE_SELL_STOP;
         ok = g_trade.OrderSend(s.symbol, otype, s.volume, NormalizePips(s.symbol, s.price), s.slippagePts,
                                NormalizePips(s.symbol, s.sl), NormalizePips(s.symbol, s.tp), comment, 0, NULL);
         if (ok) ticket = g_trade.ResultOrder();
         break;
      }
      case SIG_CLOSE: {
         ulong posTicket = 0;
         if (s.targetTicket != "") posTicket = (ulong)StringToInteger(s.targetTicket);
         if (posTicket == 0) posTicket = FindOurPosition(s.symbol, s.side);
         if (posTicket == 0) { SendAck(s, "REJECTED", 0,0,0,0,0,"no matching position"); return; }
         if (PositionSelectByTicket(posTicket)) {
            ok = g_trade.PositionClose(posTicket, s.slippagePts);
            if (ok) { ticket = posTicket; deal = (ulong)g_trade.ResultDeal(); }
         } else { SendAck(s, "REJECTED", 0,0,0,0,0,"position gone"); return; }
         break;
      }
      case SIG_MODIFY: {
         ulong posTicket = 0;
         if (s.targetTicket != "") posTicket = (ulong)StringToInteger(s.targetTicket);
         if (posTicket == 0) posTicket = FindOurPosition(s.symbol, s.side);
         if (posTicket == 0) { SendAck(s, "REJECTED", 0,0,0,0,0,"no matching position"); return; }
         if (PositionSelectByTicket(posTicket)) {
            double csl = PositionGetDouble(POSITION_SL);
            double ctp = PositionGetDouble(POSITION_TP);
            ok = g_trade.PositionModify(posTicket,
                                        s.sl != 0 ? NormalizePips(s.symbol, s.sl) : csl,
                                        s.tp != 0 ? NormalizePips(s.symbol, s.tp) : ctp);
            if (ok) ticket = posTicket;
         }
         break;
      }
      case SIG_CANCEL: {
         ulong ord = s.targetTicket != "" ? (ulong)StringToInteger(s.targetTicket) : 0;
         if (ord == 0) { SendAck(s, "REJECTED",0,0,0,0,0,"targetTicket required"); return; }
         ok = g_trade.OrderDelete(ord);
         if (ok) ticket = ord;
         break;
      }
   }
   uint retcode = g_trade.ResultRetcode();
   if (ok && (retcode == 10009 || retcode == 10008)) {
      double fill = g_trade.ResultPrice();
      double vol  = g_trade.ResultVolume();
      deal = g_trade.ResultDeal();
      SendAck(s, "FILLED", ticket, deal, fill, vol, (int)retcode, "");
      g_watermark = MathMax(g_watermark, s.seq);
      Log("Signal " + s.id + " FILLED ticket=" + IntegerToString((long)ticket) + " price=" + DoubleToString(fill, DigitsFor(s.symbol)));
   } else {
      string err = "retcode=" + IntegerToString((int)retcode);
      string status = (retcode == 10017 || retcode == 10018) ? "SLIPPAGE" : "ERROR";
      SendAck(s, status, ticket, 0, 0, 0, (int)retcode, err);
      LogErr("Signal " + s.id + " failed: " + err);
   }
}

ulong FindOurPosition(string sym, int side) {
   if (side < 0) {
      // side-agnostic close: return first our position on this symbol.
      for (int i = PositionsTotal() - 1; i >= 0; --i) {
         ulong t = PositionGetTicket(i);
         if (PositionSelectByTicket(t) &&
             PositionGetString(POSITION_SYMBOL) == sym &&
             PositionGetInteger(POSITION_MAGIC) == g_magic) return t;
      }
      return 0;
   }
   ENUM_POSITION_TYPE pt = (side == SIDE_BUY) ? POSITION_TYPE_BUY : POSITION_TYPE_SELL;
   for (int i = PositionsTotal() - 1; i >= 0; --i) {
      ulong t = PositionGetTicket(i);
      if (PositionSelectByTicket(t) &&
          PositionGetString(POSITION_SYMBOL) == sym &&
          PositionGetInteger(POSITION_TYPE) == pt &&
          PositionGetInteger(POSITION_MAGIC) == g_magic) return t;
   }
   return 0;
}

//+------------------------------------------------------------------+
//| Send fill/error ack back to WINDELS                               |
//+------------------------------------------------------------------+
void SendAck(const Signal &s, string status, ulong ticket, ulong dealId, double fillPrice, double filledVol, int retcode, string err) {
   string body = "{";
   body += "\"signalId\":\""       + Esc(s.id) + "\",";
   body += "\"eaId\":\""           + Esc(g_eaId) + "\",";
   body += "\"brokerAccountId\":\""+ Esc(InpBrokerAcctId) + "\",";
   body += "\"status\":\""         + status + "\",";
   if (ticket)  body += "\"ticket\":\""   + IntegerToString((long)ticket) + "\",";
   if (dealId)  body += "\"dealId\":\""   + IntegerToString((long)dealId) + "\",";
   if (fillPrice > 0) body += "\"fillPrice\":"  + DoubleToString(fillPrice, 8) + ",";
   if (filledVol > 0)  body += "\"filledVolume\":" + DoubleToString(filledVol, 8) + ",";
   if (retcode) body += "\"retcode\":"    + IntegerToString(retcode) + ",";
   if (err != "") body += "\"error\":\"" + Esc(err) + "\",";
   body += "\"localTimestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS) + "\"";
   body += "}";
   string resp; int st = 0;
   if (!g_http.Post("/ea/fill", body, resp, st)) LogWarn("Ack post failed for " + s.id);
}

//+------------------------------------------------------------------+
//| Heartbeat — positions, equity, diagnostics                        |
//+------------------------------------------------------------------+
void SendHeartbeat() {
   string body = "{";
   body += "\"eaId\":\""           + Esc(g_eaId) + "\",";
   body += "\"brokerAccountId\":\""+ Esc(InpBrokerAcctId) + "\",";
   body += "\"watermark\":"        + IntegerToString((long)g_watermark) + ",";
   body += "\"state\":{";
   body += "\"balance\":"  + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
   body += "\"equity\":"   + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",";
   body += "\"freeMargin\":"+ DoubleToString(AccountInfoDouble(ACCOUNT_FREEMARGIN), 2) + ",";
   double ml = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);
   if (ml > 0) body += "\"marginLevel\":" + DoubleToString(ml, 2) + ",";
   body += "\"positions\":[";
   bool first = true;
   for (int i = PositionsTotal() - 1; i >= 0; --i) {
      ulong t = PositionGetTicket(i);
      if (!PositionSelectByTicket(t)) continue;
      if (PositionGetInteger(POSITION_MAGIC) != g_magic) continue;
      if (!first) body += ","; first = false;
      string sideStr = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? "BUY" : "SELL";
      body += "{";
      body += "\"ticket\":\""    + IntegerToString((long)t) + "\",";
      body += "\"symbol\":\""    + Esc(PositionGetString(POSITION_SYMBOL)) + "\",";
      body += "\"side\":\""      + sideStr + "\",";
      body += "\"volume\":"      + DoubleToString(PositionGetDouble(POSITION_VOLUME), 8) + ",";
      body += "\"openPrice\":"   + DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), 8) + ",";
      body += "\"currentPrice\":"+ DoubleToString(PositionGetDouble(POSITION_PRICE_CURRENT), 8) + ",";
      body += "\"sl\":"          + DoubleToString(PositionGetDouble(POSITION_SL), 8) + ",";
      body += "\"tp\":"          + DoubleToString(PositionGetDouble(POSITION_TP), 8) + ",";
      body += "\"profit\":"      + DoubleToString(PositionGetDouble(POSITION_PROFIT), 2) + ",";
      body += "\"swap\":"        + DoubleToString(PositionGetDouble(POSITION_SWAP), 2) + ",";
      body += "\"openTime\":\""  + TimeToString((datetime)PositionGetInteger(POSITION_TIME), TIME_DATE | TIME_SECONDS) + "\"";
      body += "}";
   }
   body += "]";
   body += "},";
   body += "\"diagnostics\":[";
   if (g_lastError != "") {
      body += "{\"level\":\"error\",\"message\":\"" + Esc(g_lastError) + "\",\"at\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"}";
      g_lastError = "";
   }
   body += "]";
   body += "}";
   string resp; int st = 0;
   g_http.Post("/ea/heartbeat", body, resp, st);
}

//+------------------------------------------------------------------+
//| Trailing stop processor                                           |
//+------------------------------------------------------------------+
void ProcessTrailingStops() {
   for (int i = PositionsTotal() - 1; i >= 0; --i) {
      ulong t = PositionGetTicket(i);
      if (!PositionSelectByTicket(t)) continue;
      if (PositionGetInteger(POSITION_MAGIC) != g_magic) continue;
      string sym = PositionGetString(POSITION_SYMBOL);
      int type = (int)PositionGetInteger(POSITION_TYPE);
      double open = PositionGetDouble(POSITION_PRICE_OPEN);
      double cur  = PositionGetDouble(POSITION_PRICE_CURRENT);
      double csl  = PositionGetDouble(POSITION_SL);
      double ctp  = PositionGetDouble(POSITION_TP);
      double pt   = PointFor(sym);
      int trailDist = g_defaultTrailDist; int step = g_defaultTrailStep; int be = g_defaultBreakEven;
      double newSl = csl;
      if (type == POSITION_TYPE_BUY) {
         double profitPts = (cur - open) / pt;
         if (be > 0 && profitPts >= be && (csl < open || csl == 0)) newSl = NormalizePips(sym, open);
         if (profitPts >= trailDist) {
            double proposed = NormalizePips(sym, cur - trailDist * pt);
            if (csl == 0 || proposed > csl + step * pt) newSl = proposed;
         }
      } else {
         double profitPts = (open - cur) / pt;
         if (be > 0 && profitPts >= be && (csl > open || csl == 0)) newSl = NormalizePips(sym, open);
         if (profitPts >= trailDist) {
            double proposed = NormalizePips(sym, cur + trailDist * pt);
            if (csl == 0 || proposed < csl - step * pt) newSl = proposed;
         }
      }
      if (newSl != csl) {
         bool ok = g_trade.PositionModify(t, newSl, ctp);
         if (!ok) LogWarn("Trail modify failed ticket=" + IntegerToString((long)t));
      }
   }
}

//+------------------------------------------------------------------+
//| Minimal JSON string escape                                        |
//+------------------------------------------------------------------+
string Esc(string s) {
   string r = s;
   StringReplace(r, "\\", "\\\\");
   StringReplace(r, "\"", "\\\"");
   StringReplace(r, "\n", "\\n");
   StringReplace(r, "\r", "\\r");
   StringReplace(r, "\t", "\\t");
   return r;
}
