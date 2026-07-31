# WEBHOOK ARCHITECTURE & REFERENCE — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** Developer Reference  

---

## 1. WEBHOOK DISPATCH SCHEMES

The platform dispatches real-time webhooks to registered subscriber URLs when important events occur.

---

## 2. EVENT SCHEMAS

### 2.1 `camera.alert_triggered`
Dispatched when YOLO detects a PPE violation or perimeter crossing:
```json
{
  "event": "camera.alert_triggered",
  "organizationId": "org_uuid",
  "data": {
    "cameraId": "cam_1",
    "severity": "CRITICAL",
    "triggerClass": "intrusion_detected"
  }
}
```

---

## 3. WEBHOOK SIGNATURE VERIFICATION

All webhook payloads are signed with SHA256 HMAC keys to prevent spoofing. Recipients should verify the header signature:
```crypto
const hash = crypto
  .createHmac('sha256', webhookSecret)
  .update(JSON.stringify(payload))
  .digest('hex');
```
Compare the result with the `X-Windels-Signature` header.
