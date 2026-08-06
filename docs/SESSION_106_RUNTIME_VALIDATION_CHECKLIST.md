# Session 106 Runtime Validation Checklist — Autonomous Organization

> **Status:** 🟡 pending target-environment execution. Run with live Redis 8 and
> authenticated API access.

- [ ] Authenticated users can read the dashboard/register; only admins can
      submit, resolve or delete proposals.
- [ ] Two organizations create decisions with the same title/department; each
      organization lists, reads, resolves and deletes only its own records.
- [ ] New decisions persist under `aut:decision:i:<org>:<id>` and
      `aut:decision:idx:<org>`; the Session 89 audit reports both `aut:*`
      namespaces as conforming.
- [ ] Empty organizations show zero governance evidence, no departments, no
      plans/budgets and `impactKind: none` rather than a fabricated 100% score.
- [ ] Pending proposals remain blocked; invalid/duplicate resolutions fail and
      do not change the record.
- [ ] Approved impact is labeled as an approved estimate, not realized savings;
      no execution side effect occurs.
- [ ] Legacy `aut:<org>:decisions` data migrates once into individual records
      and is removed without duplication.
- [ ] `/app/autonomous` displays real register data and read-only controls for
      non-admin users.
- [ ] Capture request IDs, RBAC results, Redis audit output and this checklist
      before marking Session 106 🟢.

**Operator:** ____________________  **Environment:** ____________________

**Executed at (UTC):** ___________  **Release/commit:** ____________________
