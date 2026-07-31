# AI KERNEL ARCHITECTURE — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** Internal AI Architecture  

---

## 1. THE AI KERNEL LOOP

The AI Kernel represents the central hub:

```
  [System Event (e.g. S87 Camera Alert)]
                  │
                  ▼
         [EventBus Dispatcher]
                  │
                  ├───► [Pino Structured Logger (PII Redacted)]
                  │
                  ▼
         [AI Kernel Broker] ──► [scanPrompt Injection Shield]
                  │
                  ▼
         [Subscriber Hubs (e.g. Workflow Engine, UI websockets)]
```

### 1.1 In-Flight Prompt Guarding
Every query or event dispatched to an AI employee is filtered by the `scanPrompt` guard inside `apps/api/src/services/ai/registry.ts`:
*   Intercepts incoming prompt payloads.
*   Scans for system overrides or instructions leaks.
*   Blocks executions when scores exceed the strict limit threshold (score ≥ 80).

### 1.2 Model Failover & Echo fallbacks
The Kernel routes AI completions through the swappable `aiRegistry`:
*   **Primary Cloud**: OpenAI or Anthropic (if api keys exist).
*   **Local Hybrid**: Ollama node connections (`OLLAMA_BASE_URL`).
*   **Safety Fallback**: Windels Echo. Every streamed token is prefixed with a `[DEMO RESPONSE]` banner to prevent data fabrication.

---

## 2. REPRODUCIBLE EVENT BUS FLOWS

*   **Pub/Sub Messaging**: Uses a dual-client Redis configuration (`redisCmd` for standard keys, `redisSub` for pub/sub subscriptions) to allow synchronous event routing on every hop.
*   **Audit Gating**: Every automated action triggered by the Kernel (such as triggering an ETL run or camera violation) is logged in the `AuditLog` table and requires explicit human-in-the-loop approvals.
