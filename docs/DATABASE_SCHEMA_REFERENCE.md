# DATABASE SCHEMA REFERENCE — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** Database Architecture  

---

## 1. PERSISTENCE ENGINE OVERVIEW

WINDELS AI OS uses a PostgreSQL 17 relational database mapped through Prisma ORM.

---

## 2. CORE DATABASE MODELS

### 2.1 User Management
*   **`User`**: System logins, emails, password hashes, and MFA secrets.
*   **`UserProfile`**: User profile parameters.
*   **`Organization`**: Tenancy scoping containers.

### 2.2 AI & Memory
*   **`Agent`**: Declared AI Employee records.
*   **`AgentMemory`**: Semantic vectors used for similarity search retrieval.
*   **`Conversation`**: Context threads.
*   **`Message`**: Individual conversational steps.

### 2.3 System Services
*   **`EtlPipeline`**: Customs ETL pipeline builder records.
*   **`EtlRun`**: Historical execution runs and errors.
*   **`CameraFeed`**: RTSP stream urls and locations.
*   **`CameraAlert`**: Vision alerts and snapshots.

---

## 3. PGVECTOR EMBEDDINGS

The `AgentMemory` table features raw embedding arrays (using size 1536) for semantic lookups:
```sql
CREATE INDEX ON "AgentMemory" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```
