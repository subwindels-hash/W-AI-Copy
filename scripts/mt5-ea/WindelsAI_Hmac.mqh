//+------------------------------------------------------------------+
//|                                            WindelsAI_Hmac.mqh     |
//|      HMAC-SHA256 used to verify server signal authenticity.        |
//| Uses advapi32.dll (CryptAcquireContext/CryptCreateHash/HMAC) on   |
//| Windows. Fails closed on platforms without the DLL — EA refuses   |
//| to execute any signal when HMAC cannot be computed.                |
//+------------------------------------------------------------------+
//| Defensive integrity check. Production deployments must run behind |
//| HTTPS (InpUseTLS=true) so TLS provides confidentiality + integrity;|
//| this HMAC prevents trivial forgery / LAN MITM.                     |
//+------------------------------------------------------------------+
#property copyright "WINDELS AI OS"
#property link      "https://windels.ai"

// advapi32 — CALG_SHA_256 = 0x800c, HP_HASHVAL = 2,
// PROV_RSA_AES = 24, CRYPT_VERIFYCONTEXT = 0xF0000000.
#define CALG_SHA_256  0x0000800c
#define HP_HASHVAL    2
#define PROV_RSA_AES  24
#define CRYPT_VERIFYCONTEXT 0xF0000000

#import "advapi32.dll"
   bool CryptAcquireContextW(int&, string, string, int, int);
   bool CryptCreateHash(int, int, int, int, int&);
   bool CryptHashData(int, uchar&[], int, int);
   bool CryptGetHashParam(int, int, uchar&[], int&, int);
   bool CryptDestroyHash(int);
   bool CryptReleaseContext(int, int);
#import

class CHmacSha256 {
public:
   /**
    * Compute HMAC-SHA256(key, msg) as lowercase hex.
    * Returns 64 '0' characters (failing closed) when advapi32 isn't available.
    */
   string Hex(string key, string msg) {
      uchar k[];  StringToCharArray(key, k, 0, StringLen(key), CP_UTF8);
      uchar m[];  StringToCharArray(msg, m, 0, StringLen(msg), CP_UTF8);
      uchar h[];
      if (!HmacSha256(k, m, h)) {
         ArrayResize(h, 32); ArrayInitialize(h, 0);
      }
      return HexEncode(h);
   }
private:
   bool HmacSha256(uchar &key[], uchar &msg[], uchar &out[]) {
      int prov = 0;
      // CRYPT_VERIFYCONTEXT avoids needing a key container.
      if (!CryptAcquireContextW(prov, NULL, NULL, PROV_RSA_AES, CRYPT_VERIFYCONTEXT)) return false;
      int bs = 64;
      uchar kp[]; ArrayResize(kp, bs); ArrayInitialize(kp, 0);
      int klen = ArraySize(key);
      if (klen > bs) {
         uchar kh[];
         if (!Sha256Raw(prov, key, klen, kh)) { CryptReleaseContext(prov, 0); return false; }
         ArrayCopy(kp, kh, 0, 0, ArraySize(kh));
      } else {
         ArrayCopy(kp, key, 0, 0, klen);
      }
      uchar ipad[]; ArrayResize(ipad, bs);
      uchar opad[]; ArrayResize(opad, bs);
      for (int i = 0; i < bs; ++i) { ipad[i] = kp[i] ^ 0x36; opad[i] = kp[i] ^ 0x5c; }

      uchar inner[]; ArrayResize(inner, bs + ArraySize(msg));
      ArrayCopy(inner, ipad, 0, 0, bs); ArrayCopy(inner, msg, bs, 0, ArraySize(msg));
      uchar ih[];
      if (!Sha256Raw(prov, inner, ArraySize(inner), ih)) { CryptReleaseContext(prov, 0); return false; }

      uchar outer[]; ArrayResize(outer, bs + 32);
      ArrayCopy(outer, opad, 0, 0, bs); ArrayCopy(outer, ih, bs, 0, 32);
      if (!Sha256Raw(prov, outer, ArraySize(outer), out)) { CryptReleaseContext(prov, 0); return false; }
      CryptReleaseContext(prov, 0);
      return true;
   }

   bool Sha256Raw(int prov, uchar &data[], int len, uchar &hash[]) {
      int hHash = 0;
      if (!CryptCreateHash(prov, CALG_SHA_256, 0, 0, hHash)) return false;
      bool ok = CryptHashData(hHash, data, len, 0);
      if (ok) {
         int sz = 32;
         ArrayResize(hash, 32);
         ok = CryptGetHashParam(hHash, HP_HASHVAL, hash, sz, 0);
      }
      CryptDestroyHash(hHash);
      return ok;
   }

   string HexEncode(uchar &b[]) {
      string s = "";
      for (int i = 0; i < ArraySize(b); ++i) s += StringFormat("%02x", b[i]);
      return s;
   }
};
