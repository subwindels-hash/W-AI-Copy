//+------------------------------------------------------------------+
//|                                             WindelsAI_Http.mqh   |
//|          Minimal WinInet HTTP(S) client for WINDELS AI OS EA      |
//+------------------------------------------------------------------+
//| Uses WinINet (ships with every Windows MT5 terminal). On Wine,
//| wininet.dll is provided by the built-in wine-inet implementation.
//| Returns false cleanly on unreachable networks so the EA never hangs.
//+------------------------------------------------------------------+
#property copyright "WINDELS AI OS"
#property link      "https://windels.ai"

#import "wininet.dll"
   int      InternetOpenW(string, int, string, string, int);
   bool     InternetCloseHandle(int);
   int      InternetConnectW(int, string, int, string, string, int, int, int);
   int      HttpOpenRequestW(int, string, string, string, string, int&[], int, int);
   bool     HttpSendRequestW(int, string, int, char&[], int);
   bool     InternetReadFile(int, uchar&[], int, int&);
   bool     HttpQueryInfoW(int, int, void&[], int&[], int&[]);
   int      InternetSetOptionW(int, int, void&[], int);
   int      GetLastError();
   int      InternetQueryDataAvailable(int, int&, int, int);
#import

#define INTERNET_SERVICE_HTTP   3
#define INTERNET_FLAG_SECURE    0x00800000
#define INTERNET_FLAG_RELOAD    0x80000000
#define INTERNET_OPTION_CONNECT_TIMEOUT    2
#define INTERNET_OPTION_SEND_TIMEOUT      5
#define INTERNET_OPTION_RECEIVE_TIMEOUT    6
#define HTTP_QUERY_STATUS_CODE    19
#define HTTP_QUERY_FLAG_NUMBER    0x20000000
#define INTERNET_OPEN_TYPE_DIRECT 1
#define BUF_SIZE (16 * 1024)

class CHttpClient {
   string m_baseUrl;
   string m_token;
   int    m_timeoutMs;
   bool   m_tls;
   string m_host;
   string m_prefix;
   int    m_port;
public:
   bool Init(string baseUrl, string token, int timeoutMs, bool tls) {
      m_baseUrl = baseUrl;
      m_token = token;
      m_timeoutMs = MathMax(1000, timeoutMs);
      m_tls = tls;
      if (!ParseBase(baseUrl, m_host, m_prefix, m_port, m_tls)) {
         Print("[WindelsAI][Http] invalid base URL: ", baseUrl);
         return false;
      }
      return true;
   }
   void Shutdown() {}

   bool Get(string path, string &bodyOut, int &statusOut) {
      return DoRequest("GET", path, "", bodyOut, statusOut);
   }
   bool Post(string path, string body, string &bodyOut, int &statusOut) {
      return DoRequest("POST", path, body, bodyOut, statusOut);
   }

private:
   bool ParseBase(string url, string &host, string &prefix, int &port, bool &tls) {
      string u = url;
      if (StringFind(u, "https://") == 0) { tls = true; u = StringSubstr(u, 8); port = 443; }
      else if (StringFind(u, "http://") == 0) { tls = false; u = StringSubstr(u, 7); port = 80; }
      int slash = StringFind(u, "/");
      if (slash < 0) { host = u; prefix = "/"; }
      else { host = StringSubstr(u, 0, slash); prefix = StringSubstr(u, slash); }
      int colon = StringFind(host, ":");
      if (colon > 0) { port = (int)StringToInteger(StringSubstr(host, colon + 1)); host = StringSubstr(host, 0, colon); }
      if (prefix == "") prefix = "/";
      if (StringLen(prefix) > 0 && StringFind(prefix, "/") != 0) prefix = "/" + prefix;
      return StringLen(host) > 0;
   }

   bool DoRequest(string method, string path, string body, string &bodyOut, int &statusOut) {
      bodyOut = ""; statusOut = 0;
      int hInet = InternetOpenW("WindelsAI-EA/" + EA_VERSION, INTERNET_OPEN_TYPE_DIRECT, NULL, NULL, 0);
      if (!hInet) return false;
      // Timeouts
      int to = m_timeoutMs;
      InternetSetOptionW(hInet, INTERNET_OPTION_CONNECT_TIMEOUT, to, 4);
      InternetSetOptionW(hInet, INTERNET_OPTION_SEND_TIMEOUT, to, 4);
      InternetSetOptionW(hInet, INTERNET_OPTION_RECEIVE_TIMEOUT, to, 4);

      int flags = m_tls ? (INTERNET_FLAG_SECURE | INTERNET_FLAG_RELOAD) : INTERNET_FLAG_RELOAD;
      int hConn = InternetConnectW(hInet, m_host, m_port, NULL, NULL, INTERNET_SERVICE_HTTP, 0, 0);
      if (!hConn) { InternetCloseHandle(hInet); return false; }

      string full = m_prefix;
      if (StringLen(full) > 0 && full[StringLen(full)-1] == '/' && StringLen(path) > 0 && path[0] == '/')
         path = StringSubstr(path, 1);
      full += path;
      int accept[] = {0};
      int hReq = HttpOpenRequestW(hConn, method, full, NULL, NULL, accept, flags, 0);
      if (!hReq) { InternetCloseHandle(hConn); InternetCloseHandle(hInet); return false; }

      string headers = "Authorization: Bearer " + m_token + "\r\n"
                     + "Content-Type: application/json\r\n"
                     + "Accept: application/json\r\n"
                     + "Connection: close\r\n";
      uchar bodyBuf[]; int bodyLen = 0;
      if (StringLen(body) > 0) {
         StringToCharArray(body, bodyBuf, 0, StringLen(body), CP_UTF8);
         bodyLen = ArrayRange(bodyBuf, 0);
      }
      bool ok = HttpSendRequestW(hReq, headers, StringLen(headers), bodyBuf, bodyLen);
      if (!ok) {
         statusOut = GetLastError();
         InternetCloseHandle(hReq); InternetCloseHandle(hConn); InternetCloseHandle(hInet);
         return false;
      }
      // Status code via HttpQueryInfoW (numeric — doesn't consume body bytes).
      statusOut = QueryStatusCode(hReq);
      bodyOut = ReadAll(hReq);
      InternetCloseHandle(hReq); InternetCloseHandle(hConn); InternetCloseHandle(hInet);
      return (statusOut >= 200 && statusOut < 300);
   }

   int QueryStatusCode(int hReq) {
      int code = 0;
      int dummy[] = {0};
      int sz = 4;
      uchar buf[4];
      int flags[] = {HTTP_QUERY_STATUS_CODE | HTTP_QUERY_FLAG_NUMBER};
      int idx[] = {0};
      if (HttpQueryInfoW(hReq, HTTP_QUERY_STATUS_CODE | HTTP_QUERY_FLAG_NUMBER, buf, sz, idx)) {
         // buf holds a DWORD (little-endian).
         code = (int)buf[0] | ((int)buf[1] << 8) | ((int)buf[2] << 16) | ((int)buf[3] << 24);
      }
      return code;
   }

   string ReadAll(int hReq) {
      string out;
      uchar buf[BUF_SIZE];
      // Drain until nothing available for a few polls OR EOF.
      int emptyReads = 0;
      while (emptyReads < 5) {
         int available = 0;
         if (!InternetQueryDataAvailable(hReq, available, 0, 0)) { Sleep(5); emptyReads++; continue; }
         if (available <= 0) { Sleep(5); emptyReads++; continue; }
         emptyReads = 0;
         int toRead = MathMin(available, BUF_SIZE - 1);
         int read = 0;
         if (!InternetReadFile(hReq, buf, toRead, read)) break;
         if (read <= 0) { emptyReads++; continue; }
         out += CharArrayToString(buf, 0, read, CP_UTF8);
      }
      return out;
   }
};
