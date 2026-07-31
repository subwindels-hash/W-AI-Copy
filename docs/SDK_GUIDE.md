# SOFTWARE DEVELOPMENT KIT (SDK) GUIDE — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** SDK Reference  

---

## 1. SDK TYPESCRIPT CLIENT

The `@windels/shared` package houses the official SDK types and API wrapper clients.

---

## 2. CLIENT INITIALIZATION

Connect to the platform using the standard JS SDK:
```typescript
import { WindelsClient } from '@windels/shared';

const client = new WindelsClient({
  baseUrl: 'https://api.windels.ai',
  apiKey: 'YOUR_SECURE_API_KEY',
  organizationId: 'YOUR_ORG_ID'
});
```

---

## 3. CORE WRAPPERS

*   **Ingest Data**: `client.etl.triggerRun(pipelineId)`
*   **Query Surveillance**: `client.camera.getAlerts(cameraId)`
*   **Query Memory Vectors**: `client.ai.searchMemory(query)`
