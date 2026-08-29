//+------------------------------------------------------------------+
//|                                            WindelsAI_Json.mqh     |
//| Minimal zero-allocation JSON pull-parser for WINDELS EA payloads. |
//| Supports: objects, arrays, strings, numbers, booleans, null.      |
//| This is intentionally tiny — it only parses the shapes the EA     |
//| actually consumes from the WINDELS API.                           |
//+------------------------------------------------------------------+
#property copyright "WINDELS AI OS"
#property link      "https://windels.ai"

enum JsonType { JSON_NULL, JSON_BOOL, JSON_NUMBER, JSON_STRING, JSON_OBJECT, JSON_ARRAY };

/**
 * Lightweight value reference. Holds a pointer into the owning parser so it
 * can re-extract fields on demand. Never store pointers across Parse() calls.
 */
class CJsonParser;
class CJsonValue {
   CJsonParser *m_parser;
   int          m_start;   // index in source where this value starts
   int          m_end;     // index after last char of this value
   JsonType     m_type;
   string       m_keyCache;
public:
   void Init(CJsonParser *p, int start, int end, JsonType t);
   bool         IsValid()   const { return m_type != JSON_NULL || m_end > m_start; }
   bool         IsNull()    const { return m_type == JSON_NULL; }
   bool         IsBool()    const { return m_type == JSON_BOOL; }
   bool         IsNumber()  const { return m_type == JSON_NUMBER; }
   bool         IsString()  const { return m_type == JSON_STRING; }
   bool         IsObject()  const { return m_type == JSON_OBJECT; }
   bool         IsArray()   const { return m_type == JSON_ARRAY; }
   JsonType     Type()      const { return m_type; }

   bool         GetBool()   const;
   double       GetNumber() const;
   int          GetInt()    const { return (int)GetNumber(); }
   string       GetString() const;
   int          Size()      const;     // array/object size

   /** Object field lookup by key. Returns a null value if missing. */
   CJsonValue  *operator[](const string key);
   /** Array index lookup. Same null semantics. */
   CJsonValue  *At(int idx);
};

class CJsonParser {
   string        m_src;
   int           m_len;
   int           m_pos;
   CJsonValue    m_root;
   bool          m_hadRoot;
   // Small reusable pool of CJsonValue objects — keeps allocations bounded.
   CJsonValue    m_pool[64];
   int           m_poolIdx;
public:
   CJsonValue   *Parse(const string s);

   // Helpers used by CJsonValue — not part of the public API.
   string        Src() const { return m_src; }
   CJsonValue   *Alloc();
   bool          ParseValue(CJsonValue *out);
private:
   void          SkipWs();
   bool          Expect(char c);
   bool          ParseStringBounds(int &start, int &end);
   bool          ParseNumberBounds(int &start, int &end);
   bool          SkipLiteral(int len);
   bool          SkipValue();
   CJsonValue   *FindKey(const CJsonValue *container, const string key);
   CJsonValue   *IndexAt(const CJsonValue *container, int idx);
};

/* ── CJsonValue implementation ─────────────────────────────── */

void CJsonValue::Init(CJsonParser *p, int start, int end, JsonType t) {
   m_parser = p; m_start = start; m_end = end; m_type = t; m_keyCache = "";
}
bool CJsonValue::GetBool() const {
   if (m_type != JSON_BOOL) return false;
   string s = StringSubstr(m_parser.Src(), m_start, m_end - m_start);
   return s == "true";
}
double CJsonValue::GetNumber() const {
   if (m_type != JSON_NUMBER) return 0.0;
   string s = StringSubstr(m_parser.Src(), m_start, m_end - m_start);
   return StringToDouble(s);
}
string CJsonValue::GetString() const {
   if (m_type != JSON_STRING) return "";
   // m_start points at opening quote, m_end just past closing quote.
   string raw = StringSubstr(m_parser.Src(), m_start + 1, m_end - m_start - 2);
   // Unescape common sequences.
   string out = "";
   int i = 0;
   while (i < StringLen(raw)) {
      ushort c = StringGetCharacter(raw, i);
      if (c == '\\' && i + 1 < StringLen(raw)) {
         ushort n = StringGetCharacter(raw, i + 1);
         switch (n) {
            case '"':  out += "\""; i += 2; continue;
            case '\\': out += "\\"; i += 2; continue;
            case '/':  out += "/";  i += 2; continue;
            case 'n':  out += "\n"; i += 2; continue;
            case 'r':  out += "\r"; i += 2; continue;
            case 't':  out += "\t"; i += 2; continue;
            case 'b':  out += "\b"; i += 2; continue;
            case 'f':  out += "\f"; i += 2; continue;
            case 'u': {
               // \uXXXX — crude ASCII pass (good enough for API payloads).
               if (i + 5 < StringLen(raw)) {
                  string hex = StringSubstr(raw, i + 2, 4);
                  int code = (int)StringToInteger("0x" + hex);
                  if (code >= 32) out += ShortToString((ushort)code);
                  i += 6; continue;
               }
               out += "?"; i += 2; continue;
            }
         }
      }
      out += ShortToString(c);
      i++;
   }
   return out;
}
int CJsonValue::Size() const {
   if (!m_parser) return 0;
   if (m_type == JSON_ARRAY) {
      int n = 0; int pos = m_start + 1;
      // Count top-level values between [ and ].
      int depth = 0; bool inStr = false; bool hadVal = false;
      for (int i = pos; i < m_end - 1; i++) {
         ushort ch = StringGetCharacter(m_parser.Src(), i);
         if (inStr) { if (ch == '"' && (i == 0 || StringGetCharacter(m_parser.Src(), i-1) != '\\')) inStr = false; continue; }
         if (ch == '"') inStr = true;
         else if (ch == '[' || ch == '{') depth++;
         else if (ch == ']' || ch == '}') depth--;
         else if (ch == ',' && depth == 0) { n++; hadVal = false; }
         else if (ch > ' ') hadVal = true;
      }
      if (hadVal) n++;
      return n;
   }
   if (m_type == JSON_OBJECT) {
      int n = 0; int depth = 0; bool inStr = false;
      for (int i = m_start + 1; i < m_end - 1; i++) {
         ushort ch = StringGetCharacter(m_parser.Src(), i);
         if (inStr) { if (ch == '"' && (i == 0 || StringGetCharacter(m_parser.Src(), i-1) != '\\')) inStr = false; continue; }
         if (ch == '"') inStr = true;
         else if (ch == '[' || ch == '{') depth++;
         else if (ch == ']' || ch == '}') depth--;
         else if (ch == ':' && depth == 0) n++;
      }
      return n;
   }
   return 0;
}
CJsonValue *CJsonValue::operator[](const string key) {
   if (!m_parser) return NULL;
   return m_parser.FindKey(this, key);
}
CJsonValue *CJsonValue::At(int idx) {
   if (!m_parser) return NULL;
   return m_parser.IndexAt(this, idx);
}

/* ── CJsonParser implementation ────────────────────────────── */

CJsonValue *CJsonParser::Parse(const string s) {
   m_src = s; m_len = StringLen(s); m_pos = 0; m_poolIdx = 0; m_hadRoot = false;
   m_root.Init(NULL, 0, 0, JSON_NULL);
   SkipWs();
   if (!ParseValue(&m_root)) return NULL;
   return &m_root;
}

CJsonValue *CJsonParser::Alloc() {
   if (m_poolIdx >= 64) return NULL;
   CJsonValue *v = &m_pool[m_poolIdx++];
   v.Init(this, 0, 0, JSON_NULL);
   return v;
}

void CJsonParser::SkipWs() {
   while (m_pos < m_len) {
      ushort c = StringGetCharacter(m_src, m_pos);
      if (c == ' ' || c == '\t' || c == '\n' || c == '\r') m_pos++;
      else break;
   }
}
bool CJsonParser::Expect(char c) {
   SkipWs();
   if (m_pos >= m_len) return false;
   if (StringGetCharacter(m_src, m_pos) == c) { m_pos++; return true; }
   return false;
}
bool CJsonParser::ParseStringBounds(int &start, int &end) {
   SkipWs();
   if (m_pos >= m_len || StringGetCharacter(m_src, m_pos) != '"') return false;
   start = m_pos;
   m_pos++;
   bool esc = false;
   while (m_pos < m_len) {
      ushort c = StringGetCharacter(m_src, m_pos);
      if (esc) { esc = false; m_pos++; continue; }
      if (c == '\\') { esc = true; m_pos++; continue; }
      if (c == '"') { m_pos++; end = m_pos; return true; }
      m_pos++;
   }
   return false;
}
bool CJsonParser::ParseNumberBounds(int &start, int &end) {
   SkipWs();
   int s = m_pos;
   if (m_pos < m_len && (StringGetCharacter(m_src, m_pos) == '-' || StringGetCharacter(m_src, m_pos) == '+')) m_pos++;
   while (m_pos < m_len) {
      ushort c = StringGetCharacter(m_src, m_pos);
      if ((c >= '0' && c <= '9') || c == '.' || c == 'e' || c == 'E' || c == '-' || c == '+') m_pos++;
      else break;
   }
   if (m_pos == s) return false;
   start = s; end = m_pos; return true;
}
bool CJsonParser::SkipLiteral(int len) { m_pos += len; return true; }

bool CJsonParser::SkipValue() {
   SkipWs();
   if (m_pos >= m_len) return false;
   ushort c = StringGetCharacter(m_src, m_pos);
   if (c == '"') { int a, b; return ParseStringBounds(a, b); }
   if (c == '{' || c == '[') {
      char open = (char)c, close = (c == '{' ? '}' : ']');
      m_pos++;
      int depth = 1; bool inStr = false; bool esc = false;
      while (m_pos < m_len) {
         ushort ch = StringGetCharacter(m_src, m_pos);
         if (inStr) {
            if (esc) esc = false;
            else if (ch == '\\') esc = true;
            else if (ch == '"') inStr = false;
            m_pos++; continue;
         }
         if (ch == '"') inStr = true;
         else if (ch == open) depth++;
         else if (ch == close) { depth--; if (depth == 0) { m_pos++; return true; } }
         m_pos++;
      }
      return false;
   }
   if (c == 't' && StringSubstr(m_src, m_pos, 4) == "true") return SkipLiteral(4);
   if (c == 'f' && StringSubstr(m_src, m_pos, 5) == "false") return SkipLiteral(5);
   if (c == 'n' && StringSubstr(m_src, m_pos, 4) == "null") return SkipLiteral(4);
   int a, b; return ParseNumberBounds(a, b);
}

bool CJsonParser::ParseValue(CJsonValue *out) {
   SkipWs();
   if (m_pos >= m_len) return false;
   int start = m_pos;
   ushort c = StringGetCharacter(m_src, m_pos);
   if (c == '"') {
      int a, b;
      if (!ParseStringBounds(a, b)) return false;
      out->Init(this, a, b, JSON_STRING); return true;
   }
   if (c == '{') {
      m_pos++; int depth = 1; bool inStr = false; bool esc = false;
      while (m_pos < m_len) {
         ushort ch = StringGetCharacter(m_src, m_pos);
         if (inStr) { if (esc) esc = false; else if (ch == '\\') esc = true; else if (ch == '"') inStr = false; m_pos++; continue; }
         if (ch == '"') inStr = true;
         else if (ch == '{' || ch == '[') depth++;
         else if (ch == '}' || ch == ']') { depth--; if (depth == 0) { m_pos++; out->Init(this, start, m_pos, JSON_OBJECT); return true; } }
         m_pos++;
      }
      return false;
   }
   if (c == '[') {
      m_pos++; int depth = 1; bool inStr = false; bool esc = false;
      while (m_pos < m_len) {
         ushort ch = StringGetCharacter(m_src, m_pos);
         if (inStr) { if (esc) esc = false; else if (ch == '\\') esc = true; else if (ch == '"') inStr = false; m_pos++; continue; }
         if (ch == '"') inStr = true;
         else if (ch == '[' || ch == '{') depth++;
         else if (ch == ']' || ch == '}') { depth--; if (depth == 0) { m_pos++; out->Init(this, start, m_pos, JSON_ARRAY); return true; } }
         m_pos++;
      }
      return false;
   }
   if (c == 't' || c == 'f') {
      int len = (c == 't') ? 4 : 5;
      m_pos += len; out->Init(this, start, m_pos, JSON_BOOL); return true;
   }
   if (c == 'n') { m_pos += 4; out->Init(this, start, m_pos, JSON_NULL); return true; }
   // number
   int a, b;
   if (ParseNumberBounds(a, b)) { out->Init(this, a, b, JSON_NUMBER); return true; }
   return false;
}

/**
 * Walk the object value looking for a quoted key matching `key`; return the
 * value that follows the colon at depth 0.
 */
CJsonValue *CJsonParser::FindKey(const CJsonValue *container, const string key) {
   if (!container || container->Type() != JSON_OBJECT) return NULL;
   int savedPos = m_pos;
   m_pos = container->m_start + 1;
   int depth = 0; bool inStr = false; bool esc = false;
   CJsonValue *found = NULL;
   while (m_pos < container->m_end - 1) {
      SkipWs();
      if (m_pos >= container->m_end - 1) break;
      ushort c = StringGetCharacter(m_src, m_pos);
      if (depth == 0 && c == '}') break;
      if (inStr) {
         // handled by ParseStringBounds below
      }
      if (c == '"') {
         int ks, ke;
         int mark = m_pos;
         if (!ParseStringBounds(ks, ke)) { m_pos = savedPos; return NULL; }
         string k = "";
         // Extract the raw key string (unquoted).
         int qs = ks + 1, qe = ke - 1;
         // Simplistic unescape for keys (keys don't usually contain escapes).
         k = StringSubstr(m_src, qs, qe - qs);
         StringReplace(k, "\\\"", "\""); StringReplace(k, "\\\\", "\\");
         SkipWs();
         if (m_pos < container->m_end - 1 && StringGetCharacter(m_src, m_pos) == ':') m_pos++;
         CJsonValue *val = Alloc();
         if (!val) { m_pos = savedPos; return NULL; }
         if (!ParseValue(val)) { m_pos = savedPos; return NULL; }
         if (depth == 0 && k == key) { found = val; break; }
         // Skip to next sibling at this depth.
         SkipWs();
         // Handle nested contents — already consumed by ParseValue which walked
         // to the end of the value. The loop continues at the comma or close.
         if (m_pos < container->m_end - 1) {
            ushort ch = StringGetCharacter(m_src, m_pos);
            if (ch == ',') m_pos++;
            else if (ch == '}') break;
         }
         // Tracking depth is unnecessary because ParseValue consumed subtrees.
         continue;
      }
      if (c == '{' || c == '[') { SkipValue(); continue; }
      m_pos++;
   }
   if (!found) m_pos = savedPos;
   return found;
}

CJsonValue *CJsonParser::IndexAt(const CJsonValue *container, int idx) {
   if (!container || container->Type() != JSON_ARRAY) return NULL;
   int savedPos = m_pos;
   m_pos = container->m_start + 1;
   int i = 0;
   CJsonValue *found = NULL;
   while (m_pos < container->m_end - 1) {
      SkipWs();
      if (m_pos >= container->m_end - 1) break;
      ushort c = StringGetCharacter(m_src, m_pos);
      if (c == ']') break;
      CJsonValue *val = Alloc();
      if (!val) { m_pos = savedPos; return NULL; }
      if (!ParseValue(val)) { m_pos = savedPos; return NULL; }
      if (i == idx) { found = val; break; }
      i++;
      SkipWs();
      if (m_pos < container->m_end - 1) {
         ushort ch = StringGetCharacter(m_src, m_pos);
         if (ch == ',') m_pos++;
         else if (ch == ']') break;
      }
   }
   if (!found) m_pos = savedPos;
   return found;
}
