# WORKFLOW ENGINE GUIDE — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** Technical Guide  

---

## 1. FLOW ENGINE ARCHITECTURE

The Workflow Engine manages execution flow charts for multi-step automated sequences.

---

## 2. WORKFLOW DECLARATIONS

Workflows are stored in PostgreSQL using the `Workflow` and `WorkflowRun` tables:
*   **Step Definitions**: Individual blocks containing type, configurations, and connections.
*   **Conditions**: Branching logic evaluating execution variables.

---

## 3. ENGINE PROCESSING

The background worker loops through active runs:
1.  **Read State**: Checks current progress.
2.  **Execute Step**: Invokes the corresponding microservice or agent.
3.  **Transit State**: Moves to the next step or handles errors gracefully by alerting the Human Decision Inbox.
