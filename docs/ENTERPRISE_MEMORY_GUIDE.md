# ENTERPRISE MEMORY GUIDE — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** AI Memory Architecture  

---

## 1. STRATEGIC MEMORY PATTERNS

Agents store and retrieve memories through three distinct storage loops:

```
                  ┌──► Transient Memory (Local RAM arrays)
                  │
  [Agent Context] ├──► Long-Term Relational (PostgreSQL chat tables)
                  │
                  └──► Semantic Memory (pgvector embeddings)
```

---

## 2. LONG-TERM MEMORY SEARCH

We perform similarity searches on historical records using embeddings:
1.  **Generate Embedding**: Convert query text into vectors.
2.  **Cosine Query**: Query PostgreSQL for related vector fragments:
    ```sql
    SELECT * FROM "AgentMemory" ORDER BY embedding <=> $1 LIMIT 5;
    ```
3.  **Context Injection**: Append memory fragments to the active agent prompt.

---

## 3. COMPRESSION & CLEANUP

To avoid token limits, background tasks compress historical chat threads:
*   Reduces chats into compact bullet points.
*   Archives raw conversations to cold storage.
