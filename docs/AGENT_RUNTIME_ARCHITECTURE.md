# AGENT RUNTIME ARCHITECTURE — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** Technical Architecture  

---

## 1. AGENT RUNTIME OVERVIEW

The Agent Runtime is the software sandbox that controls agent behaviors, states, tool invocations, and memory lookups within WINDELS AI OS.

```
       +───────────────────────────────────────────+
       │               Agent Runtime               │
       +─────────────────────┬─────────────────────+
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   +─────────────────+               +─────────────────+
   │   Agent State   │               │ Memory Retriev. │
   +────────┬────────+               +────────┬────────+
            │                                 │
            ├─────────────────────────────────┘
            ▼
   +─────────────────+
   │   Tool Calling  │
   +─────────────────+
```

---

## 2. STATE REPOSITORIES & SESSION CONTEXT

Agents do not run in a stateless manner. The runtime manages:
*   **Active States**: Tracks active tasks and current execution context.
*   **Conversation Logs**: Records messages, parameters, and system messages.
*   **Task Queues**: Schedules tasks asynchronously.

---

## 3. TOOL INTEGRATIONS & FUNCTION REGISTRY

Agents can run predefined functions from the central function registry:
1.  **Registry Validation**: Checks if the tool parameters match strict Zod schemas.
2.  **Permission Check**: Verifies that the agent has permission to execute the tool (e.g., `hasPermission("API_WRITE")`).
3.  **Human-in-the-loop (HITL) Guarding**: Important actions like bank wire transfers require explicit human validation.
