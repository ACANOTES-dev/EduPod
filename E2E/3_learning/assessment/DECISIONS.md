# Assessment Bug Log — Decisions

Judgement calls made during the fix run.

---

- ASSESSMENT-001+004 (2026-04-13): Added `/assessments` and `/analytics` to ROUTE_ROLE_MAP with `[...ADMIN_ROLES, 'teacher']` — same pattern as existing `/gradebook` entry. — Claude Opus 4.6
- ASSESSMENT-003+006 (2026-04-13): Root cause was `<InlineApprovalQueue />` rendered inside `TeacherAssessmentsDashboard` despite comment saying "leadership only". The `/teaching-allocations/all` calls in the network trace were from the prior admin session (cumulative Playwright log). Removed the component from teacher branch. — Claude Opus 4.6
- ASSESSMENT-005 (2026-04-13): Blocked — requires production DB insert to link parent to students. Needs explicit user approval per CLAUDE.md. — Claude Opus 4.6
- ASSESSMENT-008 (2026-04-13): Won't Fix — count badges already implemented, conditional on `count > 0`. Both queues were empty during walkthrough. — Claude Opus 4.6
- ASSESSMENT-009 (2026-04-13): Blocked — spec-vs-code gap, not regression. Adding table columns is feature work needing UX decision. — Claude Opus 4.6
- ASSESSMENT-010 (2026-04-13): Blocked — same as ASSESSMENT-009. Teacher column needs backend name resolution. Feature work. — Claude Opus 4.6
- ASSESSMENT-011 (2026-04-13): Blocked — phased migration (HR-025). Multiple forms across multiple pages, too large for bug-fix run. — Claude Opus 4.6
- ASSESSMENT-012 (2026-04-13): Won't Fix — `disabled={computing}` throttle already exists with loading state. — Claude Opus 4.6
- ASSESSMENT-013 (2026-04-13): Blocked — cross-module issue (parent dashboard RBAC). Not assessment-specific. — Claude Opus 4.6
- ASSESSMENT-014 (2026-04-13): All three review services lacked self-approval guard. Added `created_by_user_id !== reviewerUserId` check to all three. — Claude Opus 4.6
- ASSESSMENT-015 (2026-04-13): Blocked — cross-module (main dashboard calls homework endpoints). Not assessment-specific. — Claude Opus 4.6
- ASSESSMENT-016 (2026-04-13): Blocked — feature work (token-based report card ack). Needs product decision. — Claude Opus 4.6
