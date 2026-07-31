# KNOWLEDGE GRAPH GUIDE — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** AI Architecture  

---

## 1. SEMANTIC RELATIONSHIPS

WINDELS AI OS coordinates metadata and agent associations using an integrated Knowledge Graph.

---

## 2. GRAPH MODEL DEFINITIONS

Entities and relations are stored as nodes and edges in PostgreSQL:
*   **Nodes**: Systems, users, files, companies, or servers.
*   **Edges**: Relationship keys (e.g. `OWNED_BY`, `CREATED`, `CONTAINS`).

---

## 3. GRAPH QUERIES

AI employees use graph relationships to discover dependencies, e.g. tracing back which pipeline produced a specific file alert:
```sql
SELECT n.name, r.type, t.name 
FROM "GraphNode" n
JOIN "GraphEdge" r ON r.source_id = n.id
JOIN "GraphNode" t ON r.target_id = t.id
WHERE n.id = $1;
```
This enables comprehensive root-cause analysis during security incidents or pipeline failures.
