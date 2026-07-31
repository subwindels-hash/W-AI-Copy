# DEVELOPER CONTRIBUTING MANUAL — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** Open Reference  

---

## 1. CODE CONTRIBUTION WORKFLOW

Ensure all codebase extensions adhere to our architectural standards:

---

## 2. REPOSITORY STANDARDS

*   **100% TypeScript Compile-Safety**: No `any` or loose parameter types.
*   **Zod Validations**: All routes and inputs must be validated.
*   **PR Approval Gates**: Code must pass automated linting and the vitest suite before merge.

---

## 3. BRANCHING & MERGING

All modifications must target the dedicated workspace session branch:
```bash
git checkout arena/019faafb-windels
# make changes
git add .
git commit -m "feat: implement new service module"
git push origin arena/019faafb-windels
```
Never push changes directly to master.
