# AI AGENT DEVELOPMENT MANUAL — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** AI Engineering Standard  

---

## 1. AGENT ARCHITECTURE

WINDELS AI OS agents are built around a robust, type-safe agent lifecycle framework:

```
  [User Message] ──► Parse Persona & Instructions
                             │
                             ▼
                    [Reasoning/CoT Loop]
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
    [Tool Function Runs]              [Final Answer Stream]
```

---

## 2. WRITING AN AGENT PERSONA

Agents are defined inside `apps/api/src/services/ai/agents/`:
1.  **Instructions**: Create clean system messages instructing the model on its boundaries, roles, and formatting.
2.  **Tool Mappings**: Link specific backend functions to the agent context.
3.  **Validation**: Ensure agent outputs comply with configured formats.

---

## 3. AGENT TESTING

*   Verify personas using local mocks to prevent token exhaustion.
*   Assert that the prompt router redirects intents to the correct persona.
