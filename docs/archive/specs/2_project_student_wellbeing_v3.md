---
name: Student Pastoral Care & Wellbeing
description: NON-NEGOTIABLE — Structured concern logging, safeguarding with defence-in-depth access control, immutable audit chronology, SST case management, NEPS referral tracking, intervention plans, wellbeing indicators feeding predictive early warning. The other half of behaviour management. Designed as secure case-management software, not a school engagement feature.
type: project
---

# Part 1 — Product Brief

**Priority:** Non-negotiable. This is legally mandated territory in Ireland (Children First Act 2015, Child Protection Procedures 2023, and the forthcoming 2025 revised procedures that schools must adopt by end of 2026) and the natural companion to behaviour management. Behaviour tracks what students _do_; wellbeing tracks how students _are_. Together they tell the school who is drifting into risk before the system fails them. This gives EduPod a Chronicle-equivalent that's integrated with every other module — something Compass cannot do because their modules are siloed.

---

## What it is

A structured pastoral care system for recording, triaging, tracking, and resolving student welfare concerns — from a teacher noticing a child seems withdrawn, through formal safeguarding referrals, to NEPS psychological assessments and multi-agency case conferences. It replaces the filing cabinet of handwritten concern forms, the deputy principal's notebook, the DLP's locked drawer of child protection records, and the ad-hoc "I mentioned it to the year head in the corridor" conversations that currently constitute pastoral care in most Irish schools.

**This is not a corporate wellness app.** There are no mindfulness prompts, no resilience content, no gamified mood tracking. This is an operational system for professionals who have legal obligations to document concerns, act on them, and demonstrate they acted. Every record in this system could be requested in a Tusla inquiry, a DES inspection, or a Section 26 review. It must be built with that gravity.

**Engineering standard:** This module should be designed more like secure case-management software than like a school engagement feature. The audit model, access control, and data integrity requirements are higher than any other module in EduPod.

---

## Irish regulatory context (why this must be right)

**Children First Act 2015:** Mandated persons (teachers, principals, SNAs) must report child protection concerns to Tusla. Schools must have a Child Safeguarding Statement and carry out risk assessments. Every concern must be documented whether or not it meets the threshold for a mandated report.

**Child Protection Procedures for Primary and Post-Primary Schools — 2017 original, 2023 revision, 2025 revision (adoption deadline: end of 2026):** Every school must have a Designated Liaison Person (DLP) and Deputy DLP. All child protection concerns are reported to the DLP. The DLP decides whether to report to Tusla. All records must be retained securely and separately from the student's general file. The 2023 and 2025 revisions strengthen procedural requirements around record-keeping, oversight reporting, and the Board of Management's role in reviewing the Child Safeguarding Statement. **EduPod must be built against the 2025 procedures.** The 2017 procedures are historical context only — the product must implement current and incoming requirements so that it is forward-compliant when schools adopt in 2025–2026.

**Wellbeing Policy Statement and Framework for Practice (2018–2023):** DES framework positioning wellbeing as a core dimension of school quality. Schools must have a continuum of support: whole-school → targeted group → individual intensive.

**Junior Cycle Wellbeing (400 hours):** CSPE, SPHE, PE, and Guidance now sit under a unified Wellbeing area. Schools must track and report on student engagement with wellbeing.

**NEPS (National Educational Psychological Service):** Schools refer students for psychological assessment. Referrals require documented evidence of interventions already attempted. The referral paperwork is substantial — EduPod can pre-populate it from the student's intervention history.

---

## Core definitions

These two concepts must be tightly defined in the UI, documentation, and data model. If they are not, schools will either create too many cases or never create them at all.

**A concern** is a single logged observation or disclosure. It is the atomic unit of the system. One teacher, one moment, one thing noticed. A concern may be trivial or critical, but it is always a point-in-time record. Concerns accumulate on a student's pastoral chronology. A concern does not require action — it may simply be "noted for record." Most concerns will never become cases.

**A case** is a coordinated support process with ownership, review dates, and actions. It is opened when a student's situation requires structured, multi-person response — typically by the SST. A case has a named case owner, a lifecycle (Open → Active → Monitoring → Resolved → Closed), review dates, intervention plans, and assigned actions. A case aggregates concerns, meeting notes, interventions, and referrals into a single managed record.

**The relationship:** One or more concerns can be linked to a case. A concern can exist without a case. A case cannot exist without at least one concern. The SST (or year head / DLP) decides when the threshold is crossed from "logged concerns" to "this student needs a case."

---

## What EduPod must build

### 1. Concern logging

Any staff member can log a concern about any student.

- **Quick-log entry:** Under 30 seconds from any screen — floating action button or ⌘K command palette entry. Teacher shouldn't have to navigate away from attendance/gradebook to log a concern.
- **Concern categories:** Configurable per tenant with sensible defaults:
  - Academic (struggling, disengaged, underperforming)
  - Social (isolation, peer conflict, friendship difficulties)
  - Emotional (anxiety, low mood, withdrawal, tearfulness)
  - Behavioural (links to behaviour module — cross-reference, not duplicate)
  - Attendance (links to attendance patterns — auto-suggested when chronic absence detected)
  - Family/home (disclosed difficulties, bereavement, separation, housing)
  - Health (physical health, medication, eating, sleep)
  - **Child protection** (disclosure, physical indicators, neglect indicators, online safety) — triggers DLP-only access tier immediately
  - Bullying (reported or suspected — separate from general behaviour)
  - Self-harm/suicidal ideation — triggers immediate DLP alert + highest access tier
  - Other (freeform)
- **Severity/urgency classification:**
  - Routine: logged for record, reviewed at next SST meeting
  - Elevated: flagged for year head / pastoral care coordinator attention within 48 hours
  - Urgent: immediate notification to DLP / deputy principal
  - Critical: immediate notification to DLP + principal + generates mandated report prompt
- **Structured fields:** Date, time, location, students involved, witnesses (staff/student), narrative (rich text), actions taken immediately, follow-up needed (yes/no + suggested action), linked to existing case (yes/no — dropdown of open cases for this student)
- **Masked-authorship concern option:** Staff can log a concern where their identity is hidden from lower-tier viewers, for sensitive disclosures where the student asked them not to tell. This is NOT true anonymity — the DLP and system administrators retain full visibility of the author. The UI must label this as "masked authorship" or "author hidden from general viewers," not "anonymous." Schools may disable this feature. (Configurable per tenant.)
- **Voice-to-text notes:** For teachers logging concerns on mobile between classes — speak the concern, auto-transcribed, review and submit.

### 2. Safeguarding access tiers (the DLP fortress)

This is the feature that makes or breaks trust with principals. Child protection records MUST be separated from general pastoral records with defence-in-depth access control: physical table separation, distinct RLS policies, explicit per-user access grants, least-privilege database roles, immutable access event logging, and no discoverability leakage.

- **Tier 1 — General pastoral:** Visible to the student's year head, form tutor, class teachers, guidance counsellor, pastoral care coordinator. This is where routine and elevated concerns live.
- **Tier 2 — Sensitive pastoral:** Visible to SST members, guidance counsellour, deputy principal, principal. Covers elevated concerns that involve family circumstances, mental health disclosures, or patterns that need coordinated response.
- **Tier 3 — Child protection (DLP-only):** Visible ONLY to DLP, Deputy DLP, and principal. This tier holds:
  - Child protection concern records
  - Mandated report records (submitted/pending/outcome)
  - Tusla correspondence tracking
  - Section 26 inquiry records
  - Records of disclosures
  - Records marked as "child protection" at any stage
  - Retrospective disclosures (adult disclosing childhood abuse)
- **Access control mechanics:**
  - Tier assignment is set at concern creation and can only be escalated (never downgraded without DLP approval + immutable audit event)
  - Tier 3 records do NOT appear in general student profile views, search results, parent portal, or any report that non-DLP users can access
  - Tier 3 access requires explicit permission grant per user (not role-based — the DLP manually approves each person who can see CP records)
  - Every access to a Tier 3 record is logged as an immutable audit event (timestamp, user, action, IP)
  - If a user without Tier 3 access searches for a student who has CP records, they see the general pastoral record only — no indication that CP records exist
- **Physical separation:** Tier 3 records stored in a separate database table (`cp_records`) with its own RLS policy that checks against a `cp_access_grants` table, not the general RBAC system. Defence in depth — even if RBAC is misconfigured, CP records don't leak.

### 3. Immutable audit chronology

This module's audit model must be stronger than a normal application audit trail. For pastoral care — and especially for Tier 3 — the standard is immutable chronology, not editable records with a changelog bolted on.

- **Append-only event log:** Every meaningful action generates an immutable event record. Events are never updated or deleted. The event types include:
  - Concern created (full snapshot of initial state)
  - Concern reclassified (old tier → new tier, reason, authorised by)
  - Concern narrative amended (previous text preserved in full, new text recorded, amended by, reason for amendment)
  - Concern accessed / viewed (user, timestamp, IP — Tier 3 by default, configurable for Tier 1/2)
  - Note added to concern
  - Case created (linked concerns, case owner, initial status)
  - Case status changed (old → new, changed by, reason)
  - Case ownership transferred
  - Intervention plan created / updated (full snapshot of previous state on update)
  - Action assigned / completed / overdue
  - Parent contacted (method, outcome, contacted by)
  - Record exported (user, timestamp, scope, purpose, export tier)
  - Tier 3 access granted / revoked (by DLP, for user, scope)
  - Mandated report generated / submitted
  - DSAR review routed / completed
- **No destructive edits:** A concern narrative cannot be overwritten. Amendments append a new version with the previous version preserved. The chronology shows every version. This is essential for Tusla inquiries and Section 26 reviews — the question is always "what did you know and when did you know it?"
- **Tier 3 enhanced logging:** For child protection records, view-access events are logged (not just mutations). Every time a DLP opens a CP record, that access is recorded. This is the "who looked at what" trail that a Section 26 inquiry may request.
- **Retention:** Pastoral audit events follow policy-driven retention with support for long-duration and legal-hold retention. The system does not silently become the retention policy — it enables the school's policy and legal obligations. Defaults: Tier 1/2 events follow the standard 36-month partitioned retention. Tier 3 events default to long-duration retention (configurable per tenant — schools typically retain CP records until the child reaches 25 or longer if proceedings are ongoing). A legal-hold flag can be applied to any record or case, overriding scheduled retention until explicitly released by the DLP. The product enables the school's policy; it does not impose one.
- **Immutability enforcement:** Audit event tables have no UPDATE or DELETE permissions granted to the application database user. Enforced at PostgreSQL role level, not just application layer. The application user has INSERT-only access to audit event tables.

### 4. Student Support Team (SST) case management

The SST (or equivalent — Student Welfare Team, Care Team, Pastoral Team) is the group that meets weekly/fortnightly to discuss students of concern. This is the operational heart of pastoral care.

- **SST roster:** Configurable per tenant — typically principal, deputy, year heads, guidance counsellor, SENCO, chaplain. Each member has Tier 1+2 access.
- **Case creation from concerns:** One or more concerns are linked when a case is opened. The SST assigns a case owner (the staff member responsible for coordinating the response), sets an initial review date, and records the rationale for opening the case.
- **Case lifecycle:** Open → Active (SST is working it) → Monitoring (interventions in place, watching) → Resolved → Closed. Cases can be reopened. Every transition is an immutable audit event with reason.
- **Meeting management:**
  - Schedule recurring SST meetings (weekly/fortnightly)
  - Auto-generate agenda from: new concerns since last meeting, active cases requiring review, flagged students from predictive early warning, upcoming NEPS appointments, intervention plan review dates
  - Meeting minutes template: per-student discussion notes, decisions made, actions assigned (who does what by when)
  - Action tracking: each action from a meeting is a task assigned to an SST member with a due date. Overdue actions surface in the next meeting's agenda automatically.
- **Student case file view:** Single chronological view per student showing all concerns (with full version history), meeting notes, interventions, referrals, parent contacts, and outcomes. This is the view the DLP opens when Tusla calls.
- **Multi-student cases:** Support for cases involving multiple students (e.g., bullying incident involving 3 students — one case, linked to all three student records).

### 5. Intervention plans

When a student needs structured support, the SST creates an intervention plan — the documented "what we're doing about it."

- **Intervention types:** Configurable per tenant with defaults:
  - Academic support (resource hours, learning support, subject change)
  - Behavioural support (links to behaviour module — intervention targets specific behaviours)
  - Social-emotional support (check-ins, friendship programmes, social skills groups)
  - Attendance support (links to attendance module — attendance improvement plan)
  - External referral (NEPS, CAMHS, Tusla, family support services, Jigsaw, Pieta House)
  - Reasonable accommodation (exam, classroom, SEN-related)
  - Safety plan (for students at risk of self-harm — structured safety plan template)
- **Plan structure:**
  - Student, created by, SST meeting reference
  - Target outcomes (specific, measurable — "attend 4/5 days per week" not "improve attendance")
  - Actions (who does what, frequency, start/end dates)
  - Review schedule (auto-reminder for plan review — typically 6-week cycles)
  - Parent involvement (documented whether parents were informed, consented, and their input)
  - Student voice (age-appropriate — document what the student wants/thinks)
  - Progress notes (chronological updates against target outcomes — append-only, not editable)
  - Outcome: Achieved / Partially achieved / Not achieved / Escalated / Withdrawn
- **Continuum of support mapping:** Each intervention is tagged to the DES continuum level:
  - Level 1: Whole-school/classroom (universal)
  - Level 2: School support (targeted)
  - Level 3: School support plus (intensive, multi-agency)
  - This mapping is critical for NEPS referrals — NEPS requires evidence of Level 1 and 2 interventions before accepting a Level 3 referral.

### 6. NEPS referral tracking

NEPS referrals are the bane of every guidance counsellor's existence. The paperwork requires documented evidence of interventions already attempted. EduPod auto-populates this.

- **Referral form pre-population:** Pull from the student's record:
  - Attendance summary (auto from attendance module)
  - Academic performance summary (auto from gradebook)
  - Behaviour summary (auto from behaviour module)
  - Interventions attempted with outcomes (auto from intervention plans)
  - Parent consultation dates (auto from concern logs where parent was contacted)
  - Standardised test results (manual entry — STEN scores, reading ages)
- **Referral lifecycle:** Draft → Submitted to NEPS → Acknowledged → Assessment scheduled → Assessment complete → Report received → Recommendations implemented
- **Recommendation tracking:** When the NEPS report comes back, recommendations are entered and each one becomes a trackable action item (assigned to a staff member, with review date).
- **NEPS visit calendar:** Track NEPS psychologist visits to the school, which students were seen, outcomes.
- **Waitlist visibility:** How long each referral has been waiting — surfaces in SST meetings and principal reports.

### 7. Wellbeing indicators (feeding predictive early warning)

The wellbeing module contributes signals to the early warning system:

- **Concern frequency:** Increasing rate of concerns logged for a student
- **Concern severity trajectory:** Escalating from routine → elevated → urgent
- **Open cases:** Student has an active SST case
- **Intervention outcomes:** Interventions marked "not achieved" or "escalated"
- **Self-check-in trajectory:** Declining mood trend over time (Phase 4 only — see below)
- **Behavioural correlation:** Wellbeing concerns + behaviour incidents + attendance dips occurring together (cross-module — the unique value proposition)
- **Parent engagement decay:** Parent stops opening digests, stops logging into portal, stops responding to school communications (from communications module) — combined with wellbeing concern = high-risk signal

**No automated risk labels on the pastoral screen.** The early warning system may compute a composite signal, and that signal may trigger a "review recommended" prompt. But the system MUST NOT display machine-authored risk badges (e.g., "HIGH RISK STUDENT") on pastoral screens, student profiles, or any staff-visible surface. Show contributing operational facts to authorised users ("attendance declined 3 consecutive weeks," "2 elevated concerns this month," "intervention plan not achieving targets"). Show "review recommended" when the composite signal crosses a threshold. Never create a machine-authored pastoral identity for a child. This is a hard product rule — it applies to the early warning integration, not just this module.

**Finance data:** Fee payment patterns are consumed by the predictive early warning composite score as one signal among many, but financial information is NEVER exposed on the pastoral record surface — not as a concern category, not as a visible indicator, not as an interpreted reason. Staff should never see "financial stress" attributed to a student in any pastoral context. The early warning system uses it behind the composite score only. This is a hard product rule, not a configuration option.

### 8. Student self-check-ins (Phase 4 — ship only with safeguarding operating model)

This is the one proactive/preventive component. Powerful but dangerous. The moment a student can type "I want to die" into a school-owned system, you have created an operational duty question: who sees it, how fast, during what hours, on weekends, during holidays, and what happens if nobody responds. **Do not ship this as a casual add-on.**

**Prerequisites before launch (all must be satisfied):**

- School has defined monitoring ownership (named person(s) responsible for reviewing flagged check-ins)
- School has defined monitoring hours (e.g., school days only, 8am–4pm) and the system displays these hours to students
- School has defined escalation protocol (what happens if a flag is raised at 3pm Friday before a bank holiday?)
- School has acknowledged in writing that self-check-ins are not monitored as an emergency service
- Students see a clear, permanent disclaimer on the check-in screen: "This is not an emergency service. If you are in immediate danger or need help right now, contact: Childline 1800 66 66 66 / text 50808 / 999." This disclaimer is hardcoded, not configurable.
- EduPod's Terms of Service explicitly state that self-check-ins do not constitute a monitored crisis service

**Feature spec (when prerequisites are met):**

- **Quick emotional check-in:** Student taps a mood indicator (5-point emoji or colour scale) on login to student portal. Optional one-line "anything you want to tell us?" text field. Takes 5 seconds.
- **Configurable frequency:** Daily, weekly, or off — per tenant. Schools decide.
- **Privacy design:** Individual check-in responses are visible only to the student's designated monitoring owner(s) and guidance counsellor. Not visible to class teachers, not visible to parents, not included in any report with individual names.
- **Aggregate analytics (school-level only):** Year group mood trends over time, day-of-week patterns, before/after exam period comparisons. All anonymised — no individual identification from aggregate views. Minimum cohort size (e.g., 10 students) before any aggregation is displayed.
- **Alert threshold:** If a student selects the lowest mood rating for 3+ consecutive check-ins, OR writes a keyword from a configurable flagged-word list, a concern is auto-generated for the designated monitoring owner at Tier 2 severity. The student immediately sees helpline numbers (Childline, text 50808, Jigsaw) in a warm, normalising message that provides agency and explicitly reminds them this is not a live-monitored service.
- **NOT a clinical tool:** This is a low-friction engagement mechanism, not a mental health assessment. The school's response to flagged check-ins is through the existing pastoral care pathway (concern → SST → intervention), not through the app.
- **Out-of-hours flagged check-ins:** If a check-in triggers a flag outside defined monitoring hours, the system queues it for first-thing review and does NOT imply to the student that someone is reading it now. The student sees the standard helpline information.

### 9. Critical incident response

When something serious happens — bereavement, serious accident, community trauma — schools activate a critical incident response. This is typically coordinated with NEPS Critical Incident Team.

- **Critical incident declaration:** Principal declares a critical incident with type, date, scope (whole school / year group / class / individual students)
- **Response plan template:** Pre-configured per tenant with NEPS CI Management Team guidelines:
  - Immediate response (first 24 hours) — actions checklist
  - Short-term response (first week) — actions checklist
  - Medium-term response (first month) — actions checklist
  - Long-term follow-up — review schedule
- **Affected student tracking:** Tag students directly or indirectly affected. These students get a temporary wellbeing flag visible to all their teachers (Tier 1) — "be aware this student may be affected by a recent event" without disclosing the event details.
- **Staff affected tracking:** Link to staff wellbeing module — staff involved in critical incidents are flagged for follow-up support.
- **External support log:** Record NEPS CI team visits, external counsellors brought in, and their availability schedule for students.
- **Communication coordination:** Link to communications module — draft and send parent notifications about the incident and school's response.

### 10. Parent engagement in pastoral care

**Default posture: internal unless explicitly marked shareable.** Concerns are internal school records by default. Teachers will log things that are pastoral, incomplete, exploratory, or context-sensitive. Automatic parent surfacing will make staff self-censor and will damage adoption. The system must protect the candour of the concern log.

- **Tier 1 (general):** Concerns are NOT visible to parents by default. The logging teacher or year head can explicitly mark a concern as "shareable with parents" — this is a deliberate action, not an automatic one. When marked shareable, parents see a summary (category + date + brief note) in the parent portal. The narrative detail is controlled by the school — configurable between "category only," "category + summary," or "full detail."
- **Tier 2 (sensitive):** Parents are contacted by the school directly (phone/meeting). The system records that parent was contacted, date, outcome. Parents do NOT see Tier 2 records in the portal — this is deliberate (family circumstances, mental health concerns require careful in-person communication).
- **Tier 3 (child protection):** Parent engagement follows Children First Act and 2025 procedures protocols. In some cases parents are NOT informed (if informing them would put the child at further risk). DLP manages this entirely outside the parent portal.
- **Parent self-referral:** Parents can submit a concern about their own child through the parent portal ("I'm worried about my child because..."). This creates a Tier 1 concern assigned to the year head / form tutor, who triages it.
- **Intervention plan involvement:** When an intervention plan is created, if parent involvement is marked "yes," the parent sees a summary of the plan goals and their role in the parent portal. They don't see SST meeting minutes or other students' information.

### 11. DSAR and data subject access handling

Pastoral care records — especially Tier 3 — require careful handling under GDPR data subject access requests. The product must support lawful review without making blanket legal judgments on the school's behalf.

- **DSAR routing:** When a DSAR is received (via the compliance module), any records in the pastoral care module for the data subject are flagged and routed to a manual DLP/legal review workflow. The system does NOT auto-include or auto-exclude pastoral records from DSAR responses.
- **Review workflow:** The DLP (and/or the school's data protection contact) reviews each flagged pastoral record and decides: include in DSAR response / redact partially (with reason) / exclude with legal basis documented. The system provides a structured interface for this review — each record is presented with its tier, content summary, and a decision dropdown.
- **Legal basis prompts:** When the reviewer chooses to exclude a record, the system requires selection of a legal basis (e.g., "would adversely affect the rights of another individual," "child protection proceedings," "legal professional privilege") and a freeform justification. This creates an auditable record of the exclusion decision.
- **Tier 3 enhanced review:** Child protection records are presented with an additional warning: "These records may be subject to exemptions under the Children First Act and Data Protection Act 2018 Section 60. Consult legal advice before disclosing." The system does not decide — it ensures the school's decision is informed and documented.
- **No hard-coded exclusions:** The system never automatically excludes records from DSARs. Every exclusion is a human decision with a documented legal basis. EduPod facilitates the review; the school (with legal advice) makes the call.

### 12. Tier 3 export controls

Generating a Tier 3 disclosure pack (for Tusla, Section 26 inquiry, legal proceedings) is a high-consequence action. One-click generation is fine, but one-click download is not. The export workflow must match the seriousness of the record.

- **Purpose selection (required):** Before any Tier 3 export, the user must select a purpose from a controlled list: Tusla request, Section 26 inquiry, legal proceedings, school transfer (CP records), Board of Management oversight, other (freeform required). Purpose is recorded in the immutable audit chronology.
- **Confirmation step:** After purpose selection, the user sees a summary of what will be exported (record count, date range, tier) and must explicitly confirm. No "export and forget."
- **Watermarking:** Every exported PDF is watermarked with: exporting user's name, date/time of export, stated purpose, and a unique export reference ID. The watermark is embedded in the document metadata as well as visually on every page.
- **Export metadata in chronology:** The export event is recorded in the immutable audit log with: user, timestamp, IP, purpose, record scope (which records were included), export reference ID, and whether the export was completed or cancelled after preview.
- **Tier 1/2 exports:** Standard export flow (one-click PDF generation with audit event). No watermarking or purpose selection required — these are operational records, not safeguarding records.

### 13. Reporting and compliance

- **Student pastoral summary:** One-page view per student — all concerns (with version history), cases, interventions, current status. Exportable as PDF for school transfer, DES inspection, or parent meeting. Self-check-in trends included only in Phase 4+.
- **SST activity report:** Cases opened/closed, average resolution time, intervention success rates, concern volume trends.
- **Safeguarding compliance report:** For the Board of Management — number of concerns at each tier, number of mandated reports submitted, training compliance (DLP/staff Children First training dates), Child Safeguarding Statement review date. Aligned to 2025 procedures oversight reporting requirements.
- **Wellbeing programme report:** For Junior Cycle — student engagement with wellbeing area, aggregate self-check-in trends (Phase 4+), intervention coverage (what % of students received Level 2+ support).
- **DES inspection readiness:** Pre-formatted data for Whole-School Evaluation (WSE) and Subject Inspection — evidence of pastoral care structures, intervention documentation, referral pathways.
- **Tusla request response:** DLP generates a structured disclosure pack via the Tier 3 export controls (Section 12 above).

---

## Data model integration points

| Source module  | Data consumed                            | Purpose                                                                                                                                   |
| -------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Attendance     | Chronic absence alerts, daily attendance | Auto-concern generation, NEPS referral pre-pop, early warning signal                                                                      |
| Behaviour      | Incident history, trend data             | Behavioural intervention plans, cross-referencing, early warning signal                                                                   |
| Gradebook      | Grade trends, assessment results         | Academic intervention plans, NEPS referral pre-pop, early warning signal                                                                  |
| Communications | Parent engagement metrics                | Early warning signal (parent disengagement)                                                                                               |
| Finance        | Fee payment patterns                     | **Behind composite score only.** Never surfaced on pastoral record. Never visible to staff as an attributed indicator. Hard product rule. |
| Scheduling     | Student timetable                        | Context for concerns (which class was the student in), substitute teacher correlation                                                     |
| Admissions     | Application notes                        | Historical context for new students with known concerns                                                                                   |

---

## Build phases

**Phase 1 — Credible core**
Concern logging, tiered access (all three tiers with full defence-in-depth), immutable audit/event model, student pastoral chronology, case creation with concern linkage, concern-vs-case distinction in UI.

**Phase 2 — Operational workflow**
SST meeting agendas (auto-generated), action tracking with overdue reminders, intervention plans (full lifecycle), parent-contact logging (with explicit share/don't-share control), basic reporting (SST activity, safeguarding compliance).

**Phase 3 — Evidence packs and admin time savings**
NEPS referral pre-population, support-file exports (PDF pastoral summary), DES inspection-ready reports, Tier 3 export controls (purpose/confirm/watermark), DSAR review workflow, Board of Management oversight reporting.

**Phase 4 — Predictive signals and (conditionally) self-check-ins**
Wellbeing indicators feeding the early warning system. Student self-check-ins ship ONLY once the school has completed the safeguarding operating model prerequisites.

**Phase 5 — Critical incident management**
Critical incident declaration, response plan templates, affected student/staff tracking, external support logging, communication coordination.

---

## Competitor status

- **Compass:** Chronicle does pastoral workflows — behaviour + safeguarding + wellbeing + permissioned access, with linking to attendance and personalised alerts, support plans, and mental health check-ins. It is a competent product. EduPod's wedge is not "Compass can't do pastoral" — it is that EduPod is **Irish-native in safeguarding governance**: built against 2025 Child Protection Procedures, structured for NEPS evidence assembly and continuum-of-support mapping, with DSAR review workflows, Tusla/inspection-defensible immutable audit chronologies, and a data model designed for the Irish SST/DLP operational reality. Compass is built for the Australian/UK context. EduPod is built for the Irish regulatory environment. That is a strong wedge and a truthful one.
- **VSware:** No pastoral care / wellbeing module. Zero capability here.
- **Tyro:** No dedicated wellbeing module.
- **Aladdin (primary):** Has some pastoral notes capability but not structured case management.
- **Nobody in the Irish market** offers: NEPS referral pre-population, immutable safeguarding audit trails with INSERT-only enforcement, DSAR review workflows, Tier 3 export controls with watermarking, or continuum-of-support mapping.

---

## Why this is world-class

1. **Chronicle-equivalent with cross-module intelligence** — Compass's pastoral capability, rebuilt with the advantage of EduPod's unified data platform. Every concern is contextualised by attendance, grades, and behaviour data automatically.
2. **Built against 2025 procedures** — Forward-compliant for the adoption window schools are entering now.
3. **Defence-in-depth safeguarding** — Physical table separation, distinct RLS policies, explicit per-user access grants, least-privilege database roles, immutable access event logging, no discoverability leakage. Not a marketing phrase — an architecture.
4. **Immutable chronology** — Not "last edited by" but a full append-only event history with INSERT-only database role enforcement. When Tusla asks "what did you know and when did you know it?", the answer is in the audit log, uneditable after the fact.
5. **SST operational efficiency** — Auto-generated agendas, action tracking, overdue reminders. The weekly SST meeting goes from 90 minutes to 45 minutes.
6. **NEPS referral pre-population** — The guidance counsellor's 2-hour compilation becomes a 15-minute review.
7. **Conservative parent visibility** — Default to internal. Staff can log freely without self-censoring. Parents see what the school deliberately chooses to share.
8. **DSAR handled honestly** — Routes to human review with legal basis prompts. The school makes the decision; EduPod makes the decision auditable.
9. **No automated risk labels** — Contributing facts and "review recommended," never "high risk student." Protects the child from machine-authored pastoral identity.
10. **Tier 3 export controls** — Purpose, confirmation, watermarking, chronology. Matches the seriousness of the record.
11. **Finance kept invisible** — Behind composite score only. Never attributed to a student on the pastoral surface. Staff judgment protected from distortion.

---

## The strategic frame

Behaviour tells the school what happened.
Pastoral care tells the school what is changing.
Together they tell the school who is drifting into risk before the system fails them.

Commercially, this module changes the sales conversation. You are no longer selling timetable, attendance, and grades. You are selling institutional memory, safeguarding discipline, and evidence of action. That is a different category of trust.

---

## Effort estimate

**Medium-High.** The immutable audit model and Tier 3 physical separation are the most architecturally novel components — they require careful PostgreSQL-level enforcement (INSERT-only roles, separate RLS policies) and thorough testing. SST meeting management and NEPS referral pre-population are the highest-effort features.

---

## Dependencies

- **Behaviour management:** Must be built first.
- **Attendance:** Already built — consumed read-only.
- **Gradebook:** Already built — consumed read-only.
- **Communications:** Already built — used for parent notifications and engagement metrics.
- **Compliance module:** Already built — DSAR review workflow extends it.
- **Predictive early warning:** Consumer of wellbeing signals, not a dependency.

---

# Part 2 — Implementation Blueprint

## Database tables

All tables follow EduPod conventions: UUID PKs via `gen_random_uuid()`, `tenant_id NOT NULL FK` with RLS, TIMESTAMPTZ dates, `set_updated_at()` trigger where applicable. Append-only tables omit `updated_at`.

### pastoral_concerns

The atomic unit. One observation, one moment.

```
pastoral_concerns
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── student_id            UUID NOT NULL FK → students(id)
├── logged_by_user_id     UUID NOT NULL FK → users(id)
├── author_masked         BOOLEAN NOT NULL DEFAULT false
├── category              VARCHAR(50) NOT NULL        -- from tenant_settings.pastoral_concern_categories
├── severity              VARCHAR(20) NOT NULL        -- 'routine' | 'elevated' | 'urgent' | 'critical'
├── tier                  SMALLINT NOT NULL DEFAULT 1 -- 1, 2, or 3
├── occurred_at           TIMESTAMPTZ NOT NULL        -- when the concern was observed
├── location              VARCHAR(255)
├── witnesses             JSONB                       -- [{type: 'staff'|'student', id: UUID, name: text}]
├── actions_taken         TEXT                        -- immediate actions
├── follow_up_needed      BOOLEAN NOT NULL DEFAULT false
├── follow_up_suggestion  TEXT
├── case_id               UUID FK → pastoral_cases(id) -- NULL if not linked to a case
├── parent_shareable      BOOLEAN NOT NULL DEFAULT false -- explicit opt-in, NOT default visible
├── parent_share_level    VARCHAR(20) DEFAULT 'category_only' -- 'category_only' | 'category_summary' | 'full_detail'
├── shared_by_user_id     UUID FK → users(id)         -- who marked it shareable (NULL if not shared)
├── shared_at             TIMESTAMPTZ                  -- when it was marked shareable
├── legal_hold            BOOLEAN NOT NULL DEFAULT false
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
├── updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Constraints:**

- `CHECK (tier IN (1, 2, 3))`
- `CHECK (severity IN ('routine', 'elevated', 'urgent', 'critical'))`
- `CHECK (tier >= 1)` — tier can only be escalated via `pastoral_events`, never decremented directly (enforced at service layer + trigger)
- RLS: `tenant_id = current_setting('app.current_tenant_id')::uuid`
- Index: `(tenant_id, student_id, created_at DESC)`
- Index: `(tenant_id, tier, created_at DESC)` — for tier-filtered queries
- Index: `(tenant_id, case_id)` — for case-linked concern lookups

**Note:** When `category = 'child_protection'` or `category = 'self_harm'`, a trigger automatically sets `tier = 3` and creates a corresponding `cp_records` entry. The concern row remains in `pastoral_concerns` (for general chronology queries at Tier 1/2 with narrative redacted), but the full sensitive content lives only in `cp_records`.

### pastoral_concern_versions (append-only)

Every narrative edit preserves the previous state. No `updated_at`.

```
pastoral_concern_versions
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── concern_id            UUID NOT NULL FK → pastoral_concerns(id)
├── version_number        INTEGER NOT NULL             -- monotonic per concern
├── narrative             TEXT NOT NULL                 -- the full narrative text at this version
├── amended_by_user_id    UUID NOT NULL FK → users(id)
├── amendment_reason      TEXT                          -- required for version > 1
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Constraints:**

- `UNIQUE (concern_id, version_number)`
- `CHECK (version_number >= 1)`
- `CHECK (version_number = 1 OR amendment_reason IS NOT NULL)` — reason required for edits
- RLS: `tenant_id = current_setting('app.current_tenant_id')::uuid`
- **No UPDATE/DELETE grants** on this table for the application database role.

### cp_records

Physically separated child protection records. Own RLS policy. Own access grant table.

```
cp_records
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── student_id            UUID NOT NULL FK → students(id)
├── concern_id            UUID FK → pastoral_concerns(id) -- links back to the general concern (which has redacted narrative for non-Tier-3 viewers)
├── record_type           VARCHAR(50) NOT NULL         -- 'concern' | 'mandated_report' | 'tusla_correspondence' | 'section_26' | 'disclosure' | 'retrospective_disclosure'
├── logged_by_user_id     UUID NOT NULL FK → users(id)
├── narrative             TEXT NOT NULL                 -- full sensitive narrative (NOT in pastoral_concerns for Tier 3)
├── mandated_report_status VARCHAR(30)                 -- NULL | 'draft' | 'submitted' | 'acknowledged' | 'outcome_received'
├── mandated_report_ref   VARCHAR(100)                 -- Tusla reference number
├── tusla_contact_name    VARCHAR(255)
├── tusla_contact_date    TIMESTAMPTZ
├── legal_hold            BOOLEAN NOT NULL DEFAULT false
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
├── updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

**RLS policy (SEPARATE from general pastoral RLS):**

```sql
CREATE POLICY cp_records_tenant_and_grant ON cp_records
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND EXISTS (
      SELECT 1 FROM cp_access_grants
      WHERE cp_access_grants.tenant_id = cp_records.tenant_id
        AND cp_access_grants.user_id = current_setting('app.current_user_id')::uuid
        AND cp_access_grants.revoked_at IS NULL
    )
  );
```

**Indexes:**

- `(tenant_id, student_id, created_at DESC)`
- `(tenant_id, record_type)`

**Critical:** This table is NOT queried by general pastoral services. Only `CpRecordService` (in the `ChildProtectionModule`) accesses it.

### cp_access_grants

Per-user, DLP-managed access to Tier 3.

```
cp_access_grants
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── user_id               UUID NOT NULL FK → users(id) -- the user being granted access
├── granted_by_user_id    UUID NOT NULL FK → users(id) -- the DLP who granted it
├── granted_at            TIMESTAMPTZ NOT NULL DEFAULT now()
├── revoked_at            TIMESTAMPTZ                   -- NULL = active grant
├── revoked_by_user_id    UUID FK → users(id)
├── revocation_reason     TEXT
```

**Constraints:**

- `UNIQUE (tenant_id, user_id) WHERE revoked_at IS NULL` — one active grant per user per tenant
- RLS: standard tenant RLS (this table is accessed by DLP management endpoints)

### pastoral_cases

Coordinated support process with ownership.

```
pastoral_cases
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── student_id            UUID NOT NULL FK → students(id) -- primary student (multi-student cases link via pastoral_case_students)
├── case_number           VARCHAR(20) NOT NULL          -- tenant-scoped sequence (e.g., PC-2026-001)
├── status                VARCHAR(20) NOT NULL DEFAULT 'open' -- 'open' | 'active' | 'monitoring' | 'resolved' | 'closed'
├── owner_user_id         UUID NOT NULL FK → users(id)  -- case owner (SST member responsible)
├── opened_by_user_id     UUID NOT NULL FK → users(id)
├── opened_reason         TEXT NOT NULL                  -- rationale for opening the case
├── next_review_date      DATE
├── tier                  SMALLINT NOT NULL DEFAULT 1    -- highest tier among linked concerns
├── legal_hold            BOOLEAN NOT NULL DEFAULT false
├── resolved_at           TIMESTAMPTZ
├── closed_at             TIMESTAMPTZ
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
├── updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Constraints:**

- `UNIQUE (tenant_id, case_number)`
- `CHECK (status IN ('open', 'active', 'monitoring', 'resolved', 'closed'))`
- RLS: standard tenant RLS
- Index: `(tenant_id, student_id, status)`
- Index: `(tenant_id, owner_user_id, status)` — for "my cases" view
- Index: `(tenant_id, next_review_date)` — for SST agenda generation

### pastoral_case_students

Multi-student case support.

```
pastoral_case_students
├── case_id               UUID NOT NULL FK → pastoral_cases(id)
├── student_id            UUID NOT NULL FK → students(id)
├── added_at              TIMESTAMPTZ NOT NULL DEFAULT now()
├── PRIMARY KEY (case_id, student_id)
```

### pastoral_interventions

Intervention plans created within a case.

```
pastoral_interventions
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── case_id               UUID NOT NULL FK → pastoral_cases(id)
├── student_id            UUID NOT NULL FK → students(id)
├── intervention_type     VARCHAR(50) NOT NULL          -- from tenant_settings.pastoral_intervention_types
├── continuum_level       SMALLINT NOT NULL             -- 1 (whole-school), 2 (school support), 3 (school support plus)
├── target_outcomes       JSONB NOT NULL                -- [{description: text, measurable_target: text}]
├── review_cycle_weeks    INTEGER NOT NULL DEFAULT 6
├── next_review_date      DATE NOT NULL
├── parent_informed       BOOLEAN NOT NULL DEFAULT false
├── parent_consented      BOOLEAN
├── parent_input          TEXT
├── student_voice         TEXT
├── status                VARCHAR(20) NOT NULL DEFAULT 'active' -- 'active' | 'achieved' | 'partially_achieved' | 'not_achieved' | 'escalated' | 'withdrawn'
├── outcome_notes         TEXT
├── created_by_user_id    UUID NOT NULL FK → users(id)
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
├── updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

### pastoral_intervention_actions

Actions assigned within an intervention plan.

```
pastoral_intervention_actions
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── intervention_id       UUID NOT NULL FK → pastoral_interventions(id)
├── description           TEXT NOT NULL
├── assigned_to_user_id   UUID NOT NULL FK → users(id)
├── frequency             VARCHAR(50)                   -- 'once' | 'daily' | 'weekly' | 'fortnightly' | 'as_needed'
├── start_date            DATE NOT NULL
├── due_date              DATE
├── completed_at          TIMESTAMPTZ
├── completed_by_user_id  UUID FK → users(id)
├── status                VARCHAR(20) NOT NULL DEFAULT 'pending' -- 'pending' | 'in_progress' | 'completed' | 'overdue' | 'cancelled'
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
├── updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

### pastoral_intervention_progress (append-only)

```
pastoral_intervention_progress
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── intervention_id       UUID NOT NULL FK → pastoral_interventions(id)
├── note                  TEXT NOT NULL
├── recorded_by_user_id   UUID NOT NULL FK → users(id)
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

**No UPDATE/DELETE grants** for the application database role.

### pastoral_referrals

NEPS and external referrals.

```
pastoral_referrals
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── case_id               UUID FK → pastoral_cases(id)
├── student_id            UUID NOT NULL FK → students(id)
├── referral_type         VARCHAR(50) NOT NULL          -- 'neps' | 'camhs' | 'tusla_family_support' | 'jigsaw' | 'pieta_house' | 'other_external'
├── referral_body_name    VARCHAR(255)                  -- for 'other_external'
├── status                VARCHAR(30) NOT NULL DEFAULT 'draft' -- 'draft' | 'submitted' | 'acknowledged' | 'assessment_scheduled' | 'assessment_complete' | 'report_received' | 'recommendations_implemented'
├── submitted_at          TIMESTAMPTZ
├── submitted_by_user_id  UUID FK → users(id)
├── pre_populated_data    JSONB                         -- snapshot of auto-populated referral data at time of generation
├── manual_additions      JSONB                         -- STEN scores, reading ages, etc.
├── external_reference    VARCHAR(100)                  -- external body's reference number
├── report_received_at    TIMESTAMPTZ
├── report_summary        TEXT
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
├── updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

### pastoral_referral_recommendations (append-only)

```
pastoral_referral_recommendations
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── referral_id           UUID NOT NULL FK → pastoral_referrals(id)
├── recommendation        TEXT NOT NULL
├── assigned_to_user_id   UUID FK → users(id)
├── review_date           DATE
├── status                VARCHAR(20) NOT NULL DEFAULT 'pending' -- 'pending' | 'in_progress' | 'implemented' | 'not_applicable'
├── status_note           TEXT
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
├── updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

### sst_members

SST roster — separate from RBAC roles because SST membership is pastoral-specific.

```
sst_members
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── user_id               UUID NOT NULL FK → users(id)
├── role_description      VARCHAR(100)                  -- 'Year Head - 1st Year', 'Guidance Counsellor', 'SENCO', etc.
├── active                BOOLEAN NOT NULL DEFAULT true
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
├── updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Constraint:** `UNIQUE (tenant_id, user_id)`

### sst_meetings

```
sst_meetings
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── scheduled_at          TIMESTAMPTZ NOT NULL
├── status                VARCHAR(20) NOT NULL DEFAULT 'scheduled' -- 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
├── attendees             JSONB                         -- [{user_id, name, present: bool}]
├── general_notes         TEXT
├── created_by_user_id    UUID NOT NULL FK → users(id)
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
├── updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

### sst_meeting_agenda_items

Auto-generated + manual items.

```
sst_meeting_agenda_items
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── meeting_id            UUID NOT NULL FK → sst_meetings(id)
├── source                VARCHAR(30) NOT NULL          -- 'auto_new_concern' | 'auto_case_review' | 'auto_overdue_action' | 'auto_early_warning' | 'auto_neps' | 'auto_intervention_review' | 'manual'
├── student_id            UUID FK → students(id)
├── case_id               UUID FK → pastoral_cases(id)
├── concern_id            UUID FK → pastoral_concerns(id)
├── description           TEXT NOT NULL
├── discussion_notes      TEXT                          -- filled during/after meeting
├── decisions             TEXT
├── display_order         INTEGER NOT NULL DEFAULT 0
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
├── updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

### sst_meeting_actions

Tasks assigned from meetings.

```
sst_meeting_actions
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── meeting_id            UUID NOT NULL FK → sst_meetings(id)
├── agenda_item_id        UUID FK → sst_meeting_agenda_items(id)
├── student_id            UUID FK → students(id)
├── case_id               UUID FK → pastoral_cases(id)
├── description           TEXT NOT NULL
├── assigned_to_user_id   UUID NOT NULL FK → users(id)
├── due_date              DATE NOT NULL
├── completed_at          TIMESTAMPTZ
├── completed_by_user_id  UUID FK → users(id)
├── status                VARCHAR(20) NOT NULL DEFAULT 'pending'
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
├── updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

### pastoral_parent_contacts (append-only)

```
pastoral_parent_contacts
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── student_id            UUID NOT NULL FK → students(id)
├── concern_id            UUID FK → pastoral_concerns(id)
├── case_id               UUID FK → pastoral_cases(id)
├── parent_id             UUID NOT NULL FK → parents(id)
├── contacted_by_user_id  UUID NOT NULL FK → users(id)
├── contact_method        VARCHAR(30) NOT NULL          -- 'phone' | 'in_person' | 'email' | 'portal_message' | 'letter'
├── contact_date          TIMESTAMPTZ NOT NULL
├── outcome               TEXT NOT NULL
├── parent_response       TEXT
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

**No UPDATE/DELETE grants** for the application database role.

### pastoral_events (append-only — immutable audit chronology)

The core audit table. INSERT-only at the PostgreSQL role level.

```
pastoral_events
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── event_type            VARCHAR(60) NOT NULL          -- see event type enum below
├── entity_type           VARCHAR(30) NOT NULL          -- 'concern' | 'case' | 'intervention' | 'referral' | 'cp_record' | 'checkin' | 'critical_incident' | 'cp_access_grant' | 'dsar_review' | 'export'
├── entity_id             UUID NOT NULL                 -- FK to the relevant table (not enforced as FK to allow cross-table references)
├── student_id            UUID FK → students(id)        -- denormalised for student-chronology queries
├── actor_user_id         UUID NOT NULL FK → users(id)  -- who performed the action
├── tier                  SMALLINT NOT NULL              -- access tier of the record at time of event
├── payload               JSONB NOT NULL                 -- event-specific data (see event schema below)
├── ip_address            INET                           -- for access events
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Critical constraints:**

- **No `updated_at` column.** Append-only.
- **No UPDATE or DELETE grants** for the application database role. Enforced via:
  ```sql
  REVOKE UPDATE, DELETE ON pastoral_events FROM edupod_app;
  GRANT INSERT, SELECT ON pastoral_events TO edupod_app;
  ```
- Partitioned by month on `created_at` (same strategy as general `audit_logs`)
- Tier 3 events: partition retention is policy-driven per tenant (see retention section)
- RLS: `tenant_id = current_setting('app.current_tenant_id')::uuid`
- Index: `(tenant_id, student_id, created_at DESC)` — student chronology
- Index: `(tenant_id, entity_type, entity_id, created_at DESC)` — entity-specific chronology
- Index: `(tenant_id, event_type, created_at DESC)` — for compliance reporting

### pastoral_dsar_reviews

DSAR review workflow for pastoral records.

```
pastoral_dsar_reviews
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── compliance_request_id UUID NOT NULL FK → compliance_requests(id) -- from compliance module
├── entity_type           VARCHAR(30) NOT NULL          -- 'concern' | 'case' | 'intervention' | 'cp_record'
├── entity_id             UUID NOT NULL
├── tier                  SMALLINT NOT NULL
├── decision              VARCHAR(20)                   -- NULL (pending) | 'include' | 'redact' | 'exclude'
├── legal_basis           VARCHAR(100)                  -- required when decision = 'exclude' or 'redact'
├── justification         TEXT                          -- freeform reason
├── reviewed_by_user_id   UUID FK → users(id)
├── reviewed_at           TIMESTAMPTZ
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
├── updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

### student_checkins (Phase 4)

```
student_checkins
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── student_id            UUID NOT NULL FK → students(id)
├── mood_score            SMALLINT NOT NULL              -- 1–5
├── freeform_text         TEXT                           -- optional "anything you want to tell us?"
├── flagged               BOOLEAN NOT NULL DEFAULT false -- true if keyword match or consecutive low scores
├── flag_reason           VARCHAR(50)                    -- 'keyword_match' | 'consecutive_low' | NULL
├── auto_concern_id       UUID FK → pastoral_concerns(id) -- concern auto-generated from flag
├── checkin_date          DATE NOT NULL                   -- date only, no timestamp (privacy)
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Constraints:**

- `UNIQUE (tenant_id, student_id, checkin_date)` — one per student per day
- `CHECK (mood_score BETWEEN 1 AND 5)`
- RLS: standard tenant RLS. Additional application-layer restriction: only designated monitoring owners and guidance counsellor can query individual records.

### critical_incidents (Phase 5)

```
critical_incidents
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── incident_type         VARCHAR(50) NOT NULL           -- 'bereavement' | 'serious_accident' | 'community_trauma' | 'other'
├── description           TEXT NOT NULL
├── occurred_at           TIMESTAMPTZ NOT NULL
├── scope                 VARCHAR(30) NOT NULL           -- 'whole_school' | 'year_group' | 'class' | 'individual'
├── scope_ids             JSONB                          -- year_group_ids or class_ids if scoped
├── declared_by_user_id   UUID NOT NULL FK → users(id)
├── status                VARCHAR(20) NOT NULL DEFAULT 'active' -- 'active' | 'monitoring' | 'closed'
├── response_plan         JSONB                          -- checklist items per phase
├── external_support_log  JSONB                          -- [{provider, contact, dates, notes}]
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
├── updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

### critical_incident_affected (Phase 5)

```
critical_incident_affected
├── id                    UUID PK DEFAULT gen_random_uuid()
├── tenant_id             UUID NOT NULL FK → tenants(id)
├── incident_id           UUID NOT NULL FK → critical_incidents(id)
├── affected_type         VARCHAR(10) NOT NULL           -- 'student' | 'staff'
├── student_id            UUID FK → students(id)
├── staff_profile_id      UUID FK → staff_profiles(id)
├── impact_level          VARCHAR(20) NOT NULL           -- 'direct' | 'indirect'
├── notes                 TEXT
├── support_offered       BOOLEAN NOT NULL DEFAULT false
├── created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
├── updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

---

## Event schema — `pastoral_events.payload` by event type

| event_type                    | payload structure                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `concern_created`             | `{concern_id, student_id, category, severity, tier, narrative_version: 1, narrative_snapshot: text}` |
| `concern_tier_escalated`      | `{concern_id, old_tier, new_tier, reason, authorised_by_user_id}`                                    |
| `concern_narrative_amended`   | `{concern_id, version_number, previous_narrative: text, new_narrative: text, reason}`                |
| `concern_accessed`            | `{concern_id, tier}` — Tier 3 always logged, Tier 1/2 configurable                                   |
| `concern_note_added`          | `{concern_id, note_text}`                                                                            |
| `concern_shared_with_parent`  | `{concern_id, share_level, shared_by_user_id}`                                                       |
| `case_created`                | `{case_id, student_id, case_number, linked_concern_ids: UUID[], owner_user_id, reason}`              |
| `case_status_changed`         | `{case_id, old_status, new_status, reason}`                                                          |
| `case_ownership_transferred`  | `{case_id, old_owner_user_id, new_owner_user_id, reason}`                                            |
| `intervention_created`        | `{intervention_id, case_id, type, continuum_level, target_outcomes}`                                 |
| `intervention_status_changed` | `{intervention_id, old_status, new_status, outcome_notes}`                                           |
| `intervention_updated`        | `{intervention_id, previous_snapshot: JSONB, changed_fields: string[]}`                              |
| `action_assigned`             | `{action_id, source: 'intervention'                                                                  | 'meeting', assigned_to_user_id, description, due_date}` |
| `action_completed`            | `{action_id, completed_by_user_id}`                                                                  |
| `action_overdue`              | `{action_id, assigned_to_user_id, due_date, days_overdue}`                                           |
| `parent_contacted`            | `{parent_contact_id, student_id, parent_id, method, outcome_summary}`                                |
| `record_exported`             | `{export_tier, entity_type, entity_ids: UUID[], purpose, export_ref_id, watermarked: boolean}`       |
| `cp_access_granted`           | `{grant_id, granted_to_user_id, granted_by_user_id}`                                                 |
| `cp_access_revoked`           | `{grant_id, user_id, revoked_by_user_id, reason}`                                                    |
| `cp_record_accessed`          | `{cp_record_id, student_id}`                                                                         |
| `mandated_report_generated`   | `{cp_record_id, student_id}`                                                                         |
| `mandated_report_submitted`   | `{cp_record_id, student_id, tusla_ref}`                                                              |
| `dsar_review_routed`          | `{dsar_review_id, compliance_request_id, entity_type, entity_id, tier}`                              |
| `dsar_review_completed`       | `{dsar_review_id, decision, legal_basis}`                                                            |
| `checkin_alert_generated`     | `{checkin_id, student_id, flag_reason, auto_concern_id}`                                             |

All payloads are validated by Zod schemas in `packages/shared/src/schemas/pastoral-event.schema.ts`.

---

## Permission matrix

### RBAC permissions (registered in the standard RBAC system)

| Permission                           | Description                                                 | Default roles                                                         |
| ------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `pastoral.log_concern`               | Create a concern for any student                            | All staff roles                                                       |
| `pastoral.view_tier1`                | View Tier 1 (general pastoral) concerns                     | Year head, form tutor, class teachers, guidance, pastoral coordinator |
| `pastoral.view_tier2`                | View Tier 2 (sensitive pastoral) concerns and cases         | SST members, guidance, deputy principal, principal                    |
| `pastoral.manage_cases`              | Create/edit cases, assign owners, change status             | SST members, deputy principal, principal                              |
| `pastoral.manage_interventions`      | Create/edit intervention plans and actions                  | SST members, guidance, deputy principal, principal                    |
| `pastoral.manage_referrals`          | Create/edit NEPS and external referrals                     | Guidance counsellor, SENCO, deputy principal, principal               |
| `pastoral.manage_sst`                | Manage SST roster, schedule meetings, manage agenda         | Deputy principal, principal                                           |
| `pastoral.manage_checkins`           | Configure self-check-in settings, view individual check-ins | Designated monitoring owner(s), guidance counsellor                   |
| `pastoral.view_checkin_aggregate`    | View anonymised aggregate check-in analytics                | Principal, deputy principal                                           |
| `pastoral.export_tier1_2`            | Export Tier 1/2 records (standard flow)                     | Deputy principal, principal, guidance                                 |
| `pastoral.manage_critical_incidents` | Declare and manage critical incidents                       | Principal, deputy principal                                           |
| `pastoral.view_reports`              | View pastoral reports and analytics                         | Principal, deputy principal, SST members                              |
| `pastoral.dsar_review`               | Review pastoral records for DSAR responses                  | DLP, data protection contact, principal                               |
| `pastoral.parent_self_referral`      | Submit a concern about own child                            | Parent roles                                                          |

### Tier 3 access (NOT in RBAC — separate grant system)

| Action                  | Controlled by                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| View `cp_records`       | `cp_access_grants` table — DLP manually grants per user                                    |
| Grant/revoke CP access  | Only users with `pastoral.manage_cp_access` permission (DLP, principal)                    |
| Export Tier 3 records   | User must have both `cp_access_grants` active AND `pastoral.export_tier3` permission       |
| Manage mandated reports | User must have `cp_access_grants` active AND `pastoral.manage_mandated_reports` permission |

**Additional RBAC permissions for Tier 3 operations:**

| Permission                         | Description                                                 | Default roles   |
| ---------------------------------- | ----------------------------------------------------------- | --------------- |
| `pastoral.manage_cp_access`        | Grant/revoke CP access to other users                       | DLP, principal  |
| `pastoral.export_tier3`            | Export Tier 3 records (with purpose/confirm/watermark flow) | DLP, principal  |
| `pastoral.manage_mandated_reports` | Create/submit mandated reports                              | DLP, deputy DLP |

### Author masking rules

| Viewer tier         | `author_masked = false` | `author_masked = true`                                |
| ------------------- | ----------------------- | ----------------------------------------------------- |
| Tier 1 viewer       | Sees author name        | Sees "Author masked"                                  |
| Tier 2 viewer (SST) | Sees author name        | Sees "Author masked"                                  |
| Tier 3 viewer (DLP) | Sees author name        | **Sees author name** (DLP always has full visibility) |
| Parent (if shared)  | Never sees author       | Never sees author                                     |

---

## Service boundaries (NestJS modules)

### `modules/pastoral/` — Core pastoral care (Phases 1–3)

```
modules/pastoral/
├── pastoral.module.ts
├── controllers/
│   ├── concerns.controller.ts          -- CRUD + tier management
│   ├── cases.controller.ts             -- case lifecycle + concern linking
│   ├── interventions.controller.ts     -- intervention plans + actions + progress
│   ├── referrals.controller.ts         -- NEPS + external referrals
│   ├── sst.controller.ts              -- SST roster, meetings, agendas, actions
│   ├── parent-contacts.controller.ts   -- parent contact logging
│   ├── pastoral-reports.controller.ts  -- reporting endpoints
│   └── parent-pastoral.controller.ts   -- parent portal: self-referral, shared concerns, intervention summaries
├── services/
│   ├── concern.service.ts
│   ├── concern-version.service.ts      -- narrative versioning
│   ├── case.service.ts
│   ├── intervention.service.ts
│   ├── intervention-action.service.ts
│   ├── referral.service.ts
│   ├── referral-prepopulate.service.ts -- cross-module aggregation for NEPS forms
│   ├── sst.service.ts
│   ├── sst-agenda-generator.service.ts -- auto-agenda from concerns, cases, reviews, early warning
│   ├── parent-contact.service.ts
│   ├── pastoral-event.service.ts       -- immutable audit event writer (INSERT-only)
│   ├── pastoral-export.service.ts      -- PDF generation for Tier 1/2 exports
│   └── pastoral-report.service.ts
├── guards/
│   ├── tier-access.guard.ts            -- enforces tier-based visibility (checks RBAC permissions + for Tier 3, checks cp_access_grants)
│   └── concern-author-mask.guard.ts    -- applies author masking based on viewer tier
├── dto/                                -- request/response DTOs
├── interfaces/                         -- types
└── pastoral.constants.ts               -- severity levels, concern-vs-case rules, default categories
```

**Module imports:** `StudentsModule`, `AttendanceModule`, `GradebookModule`, `BehaviourModule`, `CommunicationsModule`, `ComplianceModule`, `SearchModule`, `TenantsModule` (sequences).

**Module does NOT import:** `FinanceModule`. Finance data is consumed only by the early warning engine (separate module), never by pastoral services. This is enforced by module boundary — not by convention.

### `modules/child-protection/` — Tier 3 operations (Phase 1)

```
modules/child-protection/
├── child-protection.module.ts
├── controllers/
│   ├── cp-records.controller.ts        -- CRUD for cp_records (Tier 3 only)
│   ├── cp-access.controller.ts         -- grant/revoke CP access
│   └── cp-export.controller.ts         -- Tier 3 export with purpose/confirm/watermark
├── services/
│   ├── cp-record.service.ts            -- uses separate Prisma client or explicit transaction with CP-specific RLS SET
│   ├── cp-access.service.ts
│   ├── cp-export.service.ts            -- PDF generation + watermarking + export metadata
│   └── mandated-report.service.ts
├── guards/
│   └── cp-access.guard.ts             -- checks cp_access_grants table directly
└── dto/
```

**Module imports:** `PastoralModule` (for linking concerns), `TenantsModule`, `CommunicationsModule` (for DLP alerts).

**Critical:** `CpRecordService` uses its own Prisma interactive transaction with `SET LOCAL app.current_user_id` to activate the `cp_records` RLS policy. It does NOT share the general pastoral query path.

### `modules/pastoral-dsar/` — DSAR review workflow (Phase 3)

```
modules/pastoral-dsar/
├── pastoral-dsar.module.ts
├── controllers/
│   └── pastoral-dsar.controller.ts     -- review interface endpoints
├── services/
│   └── pastoral-dsar.service.ts        -- routes pastoral records to review, records decisions
└── dto/
```

**Module imports:** `PastoralModule`, `ChildProtectionModule`, `ComplianceModule`.

### `modules/pastoral-checkins/` — Student self-check-ins (Phase 4)

```
modules/pastoral-checkins/
├── pastoral-checkins.module.ts
├── controllers/
│   ├── checkins.controller.ts          -- student-facing check-in submission
│   ├── checkin-admin.controller.ts     -- monitoring owner view, aggregate analytics
│   └── checkin-config.controller.ts    -- prerequisite verification, settings
├── services/
│   ├── checkin.service.ts
│   ├── checkin-alert.service.ts        -- keyword matching, consecutive-low detection, auto-concern generation
│   ├── checkin-analytics.service.ts    -- aggregate views with minimum cohort enforcement
│   └── checkin-prerequisite.service.ts -- validates school has completed safeguarding operating model setup
└── dto/
```

### `modules/critical-incidents/` — Critical incident management (Phase 5)

```
modules/critical-incidents/
├── critical-incidents.module.ts
├── controllers/
│   └── critical-incidents.controller.ts
├── services/
│   ├── critical-incident.service.ts
│   └── affected-tracking.service.ts   -- student/staff affected tracking, staff wellbeing module linkage
└── dto/
```

---

## Non-negotiable invariants (database-level enforcement)

These are the rules that cannot be violated even if the application layer has a bug. They are enforced at PostgreSQL level.

### 1. Immutable audit events

```sql
-- Applied in post_migrate.sql
REVOKE UPDATE, DELETE ON pastoral_events FROM edupod_app;
REVOKE UPDATE, DELETE ON pastoral_concern_versions FROM edupod_app;
REVOKE UPDATE, DELETE ON pastoral_intervention_progress FROM edupod_app;
REVOKE UPDATE, DELETE ON pastoral_parent_contacts FROM edupod_app;

GRANT INSERT, SELECT ON pastoral_events TO edupod_app;
GRANT INSERT, SELECT ON pastoral_concern_versions TO edupod_app;
GRANT INSERT, SELECT ON pastoral_intervention_progress TO edupod_app;
GRANT INSERT, SELECT ON pastoral_parent_contacts TO edupod_app;
```

### 2. Tier can only escalate

```sql
-- Trigger on pastoral_concerns
CREATE OR REPLACE FUNCTION prevent_tier_downgrade()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tier < OLD.tier THEN
    RAISE EXCEPTION 'Pastoral concern tier cannot be downgraded (% → %)', OLD.tier, NEW.tier;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_tier_downgrade
  BEFORE UPDATE OF tier ON pastoral_concerns
  FOR EACH ROW
  EXECUTE FUNCTION prevent_tier_downgrade();
```

### 3. CP records isolated by separate RLS

```sql
-- cp_records has its OWN RLS policy, not the standard tenant-only policy
ALTER TABLE cp_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_records FORCE ROW LEVEL SECURITY;

CREATE POLICY cp_records_access ON cp_records
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND EXISTS (
      SELECT 1 FROM cp_access_grants
      WHERE cp_access_grants.tenant_id = cp_records.tenant_id
        AND cp_access_grants.user_id = current_setting('app.current_user_id')::uuid
        AND cp_access_grants.revoked_at IS NULL
    )
  );
```

### 4. Concern version requires amendment reason after v1

```sql
ALTER TABLE pastoral_concern_versions
  ADD CONSTRAINT chk_amendment_reason
  CHECK (version_number = 1 OR amendment_reason IS NOT NULL);
```

### 5. Case requires at least one linked concern

Enforced at service layer (not database — FK from `pastoral_concerns.case_id` to `pastoral_cases.id` is nullable, and the constraint is "case cannot exist without at least one concern pointing to it"). Validated by `CaseService.create()` which requires `concern_ids: UUID[]` with minimum length 1. Additionally, a scheduled integrity check (cron) flags orphaned cases (cases with zero linked concerns) for review.

### 6. CP records excluded from search index

```typescript
// In SearchModule indexing — explicit exclusion
// When indexing students, NEVER include data from cp_records or pastoral_concerns with tier = 3
// This is enforced by the SearchModule not importing ChildProtectionModule
// and by PastoralModule's search indexing service explicitly filtering tier < 3
```

### 7. Finance module not importable by pastoral services

```typescript
// ESLint rule in packages/eslint-config — analogous to the existing $transaction prohibition rule
// Rule: modules/pastoral/**, modules/child-protection/**, modules/pastoral-checkins/**, modules/pastoral-dsar/**
//   may NOT import from modules/finance/**
// This is a hard boundary, not a convention.
```

### 8. No automated risk labels on pastoral surfaces

This is a UI/API invariant: no endpoint in the pastoral module returns a computed risk score, risk level, or risk label for a student. The early warning module may compute scores, but pastoral endpoints return operational facts only. Enforced by code review and API contract tests.

---

## tenant_settings JSONB keys (pastoral)

All keys use Zod `.default()` — no backfill needed.

```typescript
// In packages/shared/src/schemas/tenant-settings.schema.ts
pastoral: z.object({
  concern_categories: z.array(z.object({
    key: z.string(),
    label: z.string(),
    auto_tier: z.number().min(1).max(3).optional(), // e.g., 'child_protection' → auto_tier: 3
    active: z.boolean().default(true),
  })).default(DEFAULT_CONCERN_CATEGORIES),

  intervention_types: z.array(z.object({
    key: z.string(),
    label: z.string(),
    active: z.boolean().default(true),
  })).default(DEFAULT_INTERVENTION_TYPES),

  parent_share_default_level: z.enum(['category_only', 'category_summary', 'full_detail']).default('category_only'),

  tier1_access_logging: z.boolean().default(false),  // log view events for Tier 1
  tier2_access_logging: z.boolean().default(false),  // log view events for Tier 2
  // Tier 3 access logging is ALWAYS on — not configurable

  masked_authorship_enabled: z.boolean().default(true),

  cp_retention_years: z.number().min(7).default(25),  // policy-driven, school sets this

  checkins: z.object({
    enabled: z.boolean().default(false),  // off by default — requires prerequisites
    frequency: z.enum(['daily', 'weekly']).default('weekly'),
    monitoring_owner_user_ids: z.array(z.string().uuid()).default([]),
    monitoring_hours_start: z.string().default('08:00'),
    monitoring_hours_end: z.string().default('16:00'),
    monitoring_days: z.array(z.number().min(0).max(6)).default([1,2,3,4,5]), // Mon-Fri
    flagged_keywords: z.array(z.string()).default(DEFAULT_FLAGGED_KEYWORDS),
    consecutive_low_threshold: z.number().min(2).default(3),
    min_cohort_for_aggregate: z.number().min(5).default(10),
    prerequisites_acknowledged: z.boolean().default(false), // school has completed setup
  }).default({}),

  sst: z.object({
    meeting_frequency: z.enum(['weekly', 'fortnightly', 'monthly']).default('fortnightly'),
    auto_agenda_sources: z.array(z.enum([
      'new_concerns', 'case_reviews', 'overdue_actions', 'early_warning', 'neps', 'intervention_reviews'
    ])).default(['new_concerns', 'case_reviews', 'overdue_actions', 'intervention_reviews']),
  }).default({}),
}).default({}),
```

---

## How to apply

Build immediately after behaviour management, phased as described. In demos, walk the principal through this scenario: "A teacher notices Sarah seems withdrawn. They log a concern in 20 seconds from their phone. The system shows Sarah's attendance has dropped 15% this month and her maths grades are declining. The SST reviews it at their Wednesday meeting — the agenda was auto-generated. They create an intervention plan. Six weeks later, it's review time — the system reminds them. Sarah's attendance has recovered. The intervention is marked 'achieved.' When the DES inspector asks about your pastoral care structures, you generate a report in one click. When Tusla calls, the DLP opens Sarah's case file and sees an immutable chronology of everything the school knew and did, in order, uneditable after the fact."

That story — from concern to resolution to compliance evidence to legal defensibility — is what no competitor can tell.

The only warning: do not let the "wellbeing" label soften the engineering standards. This module should be designed more like secure case-management software than like a school engagement feature.
