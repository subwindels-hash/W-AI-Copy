# AI EMPLOYEE FRAMEWORK — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** Enterprise AI Engineering  

---

## 1. AI EMPLOYEE PARADIGM

An **AI Employee** inside WINDELS AI OS is a structured, specialized persona integrated with specific tools, databases, and memory clusters to execute business tasks autonomously.

---

## 2. AGENT CONFIGURATION SCHEMAS

AI Employees are configured using declarative manifests in the database:
*   **Identity Manifest**: Name, role, division (e.g., Financial Analyst, HR recruiter), and custom system instructions.
*   **Assigned Capabilities**: Links to specific modules (e.g., `indicators` for the financial analyst).
*   **Security Context**: Associated organization keys and RBAC security levels.

---

## 3. LIFECYCLE & SCHEDULING

AI Employees have automated schedules:
1.  **Awake Phase**: The background scheduler wakes up employees on configured times.
2.  **Activity Scan**: The employee scans its human decision inbox or database tasks.
3.  **Task Run**: The employee executes its reasoning loop.
4.  **Reporting**: Log actions in the transaction tables and sleep.
