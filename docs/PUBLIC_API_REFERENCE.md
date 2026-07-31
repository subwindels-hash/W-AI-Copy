# PUBLIC API REFERENCE — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** Public Developer Guide  

---

## 1. PUBLIC DEVELOPER INGRESS

Integrate external applications with WINDELS AI OS using our public developer API.

---

## 2. API ACCESS TOKENS

All requests must supply a valid API key in the headers:
```
Authorization: Bearer w_live_sec_...
X-Organization-Id: org_abc_123
```

---

## 3. CORE PUBLIC ENPOINTS

### 3.1 Data Ingest Webhooks
*   `POST /api/v1/public/etl/webhook`: Push raw CSV/JSON records to active data channels.

### 3.2 Notification Triggers
*   `POST /api/v1/public/notifications`: Trigger system-wide canvas alerts.

---

## 4. IP RATE LIMITS

*   Standard keys: 100 requests per minute.
*   Enterprise keys: 5,000 requests per minute.
