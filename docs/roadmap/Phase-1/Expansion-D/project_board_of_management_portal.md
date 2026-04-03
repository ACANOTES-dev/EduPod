---
name: Board of Management Portal
description: NICE-TO-HAVE — Dashboard for Board members with key metrics, meeting tools, compliance status, policy repository. Targets governance/decision-maker layer.
type: project
---

**Priority:** Nice-to-have. Targets decision-makers directly. Strong demo impresser.

**What it is:**
A dedicated portal for Board of Management members that gives them independent visibility into school performance without relying on the principal's verbal report at meetings. Irish school Boards meet ~8 times per year and are legally responsible for governance — but currently operate with minimal data access.

**What EduPod should build:**

- **Governance dashboard:** key metrics at a glance — enrolment, attendance rate, financial position, staff headcount, behaviour summary, admissions pipeline
- **Trend indicators:** up/down arrows and sparklines showing direction vs. previous period
- **Meeting tools:**
  - Agenda builder with linked data (e.g., "Attendance Report" agenda item links to live attendance dashboard)
  - Minutes recording with action items
  - Action item tracking (assigned, due date, status)
  - Document attachments per meeting
- **Policy repository:** school policies (acceptable use, anti-bullying, admissions, GDPR, health & safety) with version history, review dates, and expiry alerts
- **Compliance checklist:**
  - Children First Act compliance status
  - GDPR audit status
  - Health & Safety audit status
  - Garda vetting status for all staff
  - Policy review schedule (which policies are due for review)
- **Financial summary:** high-level income/expenditure, outstanding fees, cash position — without full finance module access
- **Configurable access:** Board members see aggregate data only, never individual student records. Principal controls what's visible.

**Competitor status:**

- No competitor offers this. Zero. Boards currently operate on verbal reports and printed summaries.

**Why it's valuable:**

- Board members who arrive informed ask better questions and make better decisions
- The Board Chairperson is often the person who influences MIS purchasing decisions — giving them a dedicated portal makes them an advocate
- Compliance dashboards remove inspection anxiety
- Meeting minutes and action tracking replace paper/email workflows
- This demonstrates that EduPod understands school GOVERNANCE, not just school ADMINISTRATION

**Effort estimate:** Medium — new role tier, new dashboard views, meeting management CRUD. Most underlying data already exists in other modules. The main work is aggregation views and access control.

**How to apply:** Build after core modules are stable. This is a differentiation feature for demos and a loyalty feature for retention. When the Board has their own portal, they're invested in the platform — and Board members who sit on multiple Boards spread the word.
