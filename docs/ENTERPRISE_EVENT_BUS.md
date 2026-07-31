# ENTERPRISE EVENT BUS MANUAL — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** Infrastructure Architecture  

---

## 1. CENTRALIZED PUB/SUB PATTERN

WINDELS AI OS uses a high-performance central Redis Pub/Sub Event Bus to enable asynchronous, microsecond communication across system services and agents.

```
  [Service/Agent] ──► [Redis Publisher] ──► [Redis Event Channel]
                                                    │
                                                    ▼
  [Client WebSockets] ◄── [SSE Delivery] ◄── [Redis Subscribers]
```

---

## 2. EVENT SCHEMAS

Every message on the bus must adhere to strict schemas:
```json
{
  "eventId": "evt_01f9b3...",
  "organizationId": "org_998f...",
  "topic": "surveillance:alarm_triggered",
  "payload": {
    "cameraId": "cam_12",
    "triggerClass": "intrusion_detected"
  },
  "timestamp": "2026-07-30T12:00:00Z"
}
```

---

## 3. RELIABILITY AND GUARANTEED DELIVERY

*   **Dual Connections**: Uses separate command and subscriber Redis clients to prevent event loop blocking.
*   **Reconnection Logic**: Standard auto-reconnection filters with backoffs handle temporary network dropouts.
