# Scheduling World-Class Enhancement — Design Spec

## Overview

27 features that transform the scheduling module from "functional auto-scheduler" into a complete school operations platform. Covers substitution management, AI optimization, scenario planning, exam scheduling, multi-week rotation, personal timetables, and analytics.

**Golden Rule:** Everything configurable by the tenant. Fixed homeroom or free movement? Single week or A/B rotation? Auto-notify or admin-approved? The school decides.

**Foundation preserved:** The existing CSP solver, constraint system, period grid, curriculum requirements, and scheduling run lifecycle remain unchanged. All 27 features build on top.

---

## S1. Substitution Management

**Purpose:** When a teacher is absent, quickly find and assign a qualified substitute.

**Data Model:**
- `teacher_absences` — tenant_id, staff_profile_id, absence_date (date), full_day (boolean), period_from (int, nullable), period_to (int, nullable), reason (text, nullable), reported_by_user_id, reported_at (timestamptz), created_at, updated_at
  - Unique on (tenant_id, staff_profile_id, absence_date)
  - Index: idx_teacher_absences_tenant_date on (tenant_id, absence_date)
- `substitution_records` — tenant_id, absence_id, schedule_id, substitute_staff_id, status ('assigned' | 'confirmed' | 'declined' | 'completed'), assigned_by_user_id, assigned_at, confirmed_at, notes (text, nullable), created_at, updated_at
  - Index: idx_substitution_records_tenant_date on (tenant_id, created_at)

**Behavior:**
- Teacher self-reports absence OR admin marks it
- System identifies all affected schedule slots for that date
- For each slot: finds eligible substitutes (qualified for subject+year, available, not already teaching, lowest current cover count for fairness)
- Admin reviews suggestions, assigns substitute(s)
- Notification sent to: substitute teacher, admin
- No parent/student notifications

**Trigger:** Both self-report (teacher) and admin-initiated. Permission: `schedule.manage_substitutions`

---

## S2. AI Substitution Engine

**Purpose:** Instant best-match substitute suggestion using AI ranking.

**Behavior:**
- When an absence is reported, AI ranks all eligible substitutes by:
  - Qualification match (primary competency > backup)
  - Current weekly cover count (fairness — prefer least-loaded)
  - Teacher preferences (prefers this class/subject)
  - Proximity (if free-movement: prefer teacher already in adjacent room)
  - Historical cover patterns (avoid assigning the same substitute repeatedly)
- Returns ranked list with confidence + reasoning per candidate
- Admin sees the ranked list, one-click assigns top suggestion
- For same-day urgent absences (tenant configurable): auto-assign top match, notify admin after

**Tenant Settings:**
- `autoAssignUrgentSubstitutions` — boolean (default: false)
- `urgentThresholdMinutes` — number (default: 60). If absence reported within X minutes of period start, treat as urgent.

---

## S3. Live Substitution Board

**Purpose:** Wall-mounted display for staff room showing today's substitutions and upcoming absences.

**No new tables** — reads from teacher_absences and substitution_records.

**Display:**
- Today's view: table of absent teachers → substitute → period → room → subject
- Upcoming (rest of week): planned absences with assigned/unassigned status
- Auto-refreshes every 60 seconds
- Large, readable font designed for TV/monitor viewing
- School branding (logo, colors)

**UI:**
- Dedicated page: `/scheduling/substitution-board` — full-screen, no navigation chrome
- Designed for landscape display (1920x1080)
- Toggle: dark mode / light mode for different display environments
- URL parameter `?kiosk=true` hides all UI except the board

---

## S4. Cover Supervision Tracking

**Purpose:** Log all substitutions for reporting and fairness analysis.

**No new tables** — aggregates from substitution_records.

**Reports:**
- Cover frequency per teacher (who does the most cover)
- Cover distribution by department/subject
- Fairness index (standard deviation of cover assignments across staff)
- Monthly/termly trends

**UI:**
- Scheduling > "Cover Reports" page
- Table + charts (Recharts bar chart: cover count per teacher)
- Export to CSV/PDF
- Permission: schedule.view_reports

---

## S5. Quick Swap Tool

**Purpose:** Drag-and-drop two periods to swap, with real-time constraint validation.

**No new tables** — modifies existing schedule records.

**Behavior:**
- Admin views the timetable grid
- Drags a period slot onto another → system proposes a swap
- Before confirming: validates all hard constraints (teacher availability, room conflicts, competency)
- Shows impact: "This swap affects 2 teachers and moves Science from Room 3 to Room 7"
- Confirm → both schedule records updated atomically
- Audit log created

**UI:**
- Integrated into existing timetable grid view
- Drag handle on each cell
- Validation overlay: green = safe, red = constraint violation with explanation
- Undo within 5 minutes (stored in Redis)

---

## S6. Real-Time Schedule Changes

**Purpose:** Emergency changes when things go wrong (room flood, projector broken, etc.).

**No new tables** — extends existing schedule CRUD.

**Behavior:**
- Admin opens a schedule slot → "Emergency Change" button
- Quick form: new room, new teacher, or cancel period
- Validates constraints, applies immediately
- Change logged with reason
- Affected teachers notified

**UI:**
- Context menu on any schedule cell → "Emergency Change"
- Modal with room picker, teacher picker, "Cancel Period" option
- Reason field (required)

---

## S7. Schedule Change Notifications

**Purpose:** Notify affected teachers when their schedule changes.

**Data Model:**
- Uses existing notification system (notifications table + dispatch queue)

**Behavior:**
- On any schedule modification (swap, substitution, emergency change, new run applied):
  - Identify affected teachers (old assignment + new assignment)
  - Queue notification: in-app + email (per tenant config)
  - Content: "Your schedule for [Date] has changed: [Period X] is now [Subject] in [Room] (was: [old info])"
- Admin always receives a digest of all changes
- Teachers only receive changes affecting them

**Tenant Settings:**
- `notifyTeachersOnScheduleChange` — boolean (default: true)
- `scheduleChangeNotificationChannel` — 'in_app' | 'email' | 'both' (default: 'both')

---

## S8. Classroom Model (Fixed Homeroom vs Free Movement)

**Purpose:** Configure whether students stay in one room (teachers rotate) or students move to subject rooms.

**Data Model:**
- `year_groups.classroom_model` — enum: 'fixed_homeroom' | 'free_movement' (default: 'fixed_homeroom')
- `classes.homeroom_id` — UUID nullable FK to rooms (used when classroom_model = fixed_homeroom)

**Behavior:**
- **Fixed homeroom:** Class is permanently assigned to a room. Solver only assigns teachers to time slots, room is pre-set. Timetable shows: Subject, Teacher.
- **Free movement:** Solver assigns teacher AND room per slot. Timetable shows: Subject, Teacher, Backup Teacher, Room.
- **Hybrid:** Different year groups use different models. Primary = fixed, secondary = free movement.
- Solver checks year_group.classroom_model and adjusts constraint logic accordingly.

**UI:**
- Year group settings: "Classroom Model" dropdown (Fixed Homeroom / Free Movement)
- Class settings: "Homeroom" room picker (visible only when fixed_homeroom)
- Timetable display adapts based on model

---

## S9. Teacher Personal Timetable

**Purpose:** Clean "my week" view for teachers.

**No new tables** — queries schedules filtered by teacher.

**UI:**
- `/scheduling/my-timetable` — teacher's personal view
- Weekly grid: days across top, periods down side
- Each cell: subject, class, room (color-coded by subject)
- Swipe between weeks on mobile
- Today highlighted
- Shows substitution alerts ("You're covering Period 3 for Mr. Ahmed")
- Print-friendly layout

---

## S10. Parent Class Timetable

**Purpose:** Parents see their child's class schedule in the parent portal.

**No new tables** — queries schedules filtered by class.

**UI:**
- Parent portal > child's dashboard > "Timetable" tab
- Weekly grid showing class schedule
- Fixed homeroom: Subject, Teacher per slot
- Free movement: Subject, Teacher, Room per slot
- Read-only, no actions
- Multi-week rotation: shows current week with indicator ("Week A")

---

## S11. Mobile-Optimised Timetable Views

**Purpose:** All timetable views work on phones.

**No new tables** — responsive design.

**Behavior:**
- On mobile: switch from weekly grid to daily list view (swipe between days)
- Each period as a card: time, subject, teacher, room
- Color-coded by subject
- Collapsible period details (tap to expand)
- Pull-to-refresh

---

## S12. Calendar Integration (Live Sync)

**Purpose:** Teachers subscribe to a webcal:// URL that syncs their timetable to external calendars.

**Data Model:**
- `calendar_subscription_tokens` — tenant_id, user_id, token (varchar(64), unique), entity_type ('teacher' | 'class'), entity_id (uuid), created_at
  - Index on token for fast lookup

**Behavior:**
- Teacher generates a subscription URL from their personal timetable page
- URL format: `https://{domain}/api/v1/calendar/{token}.ics`
- Public endpoint (no auth — token is the auth). Returns .ics with all schedule entries
- Calendar apps (Google, Outlook, Apple) poll this URL periodically
- Schedule changes automatically reflected on next poll
- Includes substitution cover duties
- Multi-week rotation: events repeat with correct week pattern

**Security:** Token is 64-char random hex. Revocable. No sensitive data beyond schedule (times, subjects, rooms).

---

## S13. AI Conflict Resolution Assistant

**Purpose:** When the solver can't place slots, AI explains why and suggests fixes.

**Behavior:**
- After a solver run with unassigned slots:
  - AI analyzes the constraint violations
  - For each unassigned slot: explains in plain language why it couldn't be placed
  - Suggests the minimal changes to resolve (e.g., "Increase Mr. Ahmed's max periods from 20 to 22" or "Add a second Science lab")
  - Ranks suggestions by impact (fewest changes, most slots resolved)
- Presented in the run review UI as an "AI Suggestions" panel

**AI Prompt includes:** unassigned slot details, constraint violations, current resource utilization, teacher workloads

---

## S14. AI Schedule Optimiser

**Purpose:** Post-solver improvement suggestions.

**Behavior:**
- After a successful solver run, AI analyzes the result for optimization opportunities
- Suggests swaps that would: reduce teacher gaps, improve preference satisfaction, balance workload better
- Each suggestion: "Swap Period 2 Monday (Teacher A ↔ Teacher B) → reduces Teacher A's gaps from 3 to 1"
- Admin can apply suggestions individually or in batch
- Does NOT re-run the solver — works within the existing solution

---

## S15. Predictive Staffing

**Purpose:** Predict future staffing needs based on curriculum growth.

**Behavior:**
- AI analyzes: current curriculum requirements, teacher competencies, workload utilization, planned year group additions
- Predicts: "Next year, if you add Year 12 with the proposed curriculum, you'll need: 2 additional Math teachers, 1 Science teacher, 0.5 FTE PE teacher"
- Based on: current teacher utilization rates + projected class counts + curriculum requirements
- Presented as a planning report

**UI:**
- Scheduling > "Staffing Forecast" page
- Input: select next academic year, projected class counts per year group
- Output: staffing gap analysis per subject

---

## S16. Exam Timetable Mode

**Purpose:** Separate scheduling mode for exam periods with solver assistance.

**Data Model:**
- `exam_sessions` — tenant_id, academic_period_id, name, start_date, end_date, status ('planning' | 'published' | 'completed'), created_at, updated_at
- `exam_slots` — tenant_id, exam_session_id, subject_id, year_group_id, date, start_time, end_time, room_id (nullable), duration_minutes, student_count, created_at, updated_at
  - Index: idx_exam_slots_tenant_session on (tenant_id, exam_session_id)
- `exam_invigilation` — tenant_id, exam_slot_id, staff_profile_id, role ('lead' | 'assistant'), created_at
  - Index: idx_exam_invigilation_tenant_slot on (tenant_id, exam_slot_id)

**Solver (exam mode):**
- Input: exam subjects, year groups, available rooms with capacities, available invigilators, student-subject enrolment (for clash detection)
- Constraints: no student sits two exams simultaneously, room capacity sufficient, invigilator available, spread exams across days (no two hard exams same day per student)
- Output: exam slot placements with room + invigilator assignments

**UI:**
- Scheduling > "Exam Timetable" page
- Create exam session (name, dates)
- Add exam subjects per year group (duration, student count)
- "Generate Exam Schedule" → solver runs
- Review, adjust, publish
- Published exam timetable visible to teachers and parents

---

## S17. What-If Scenario Planner

**Purpose:** Create hypothetical scheduling scenarios, compare them, present to decision-makers.

**Data Model:**
- `scheduling_scenarios` — tenant_id, name, description, academic_year_id, base_run_id (nullable — cloned from existing run), adjustments_json, solver_result_json (nullable), status ('draft' | 'solved' | 'approved' | 'rejected'), created_by_user_id, created_at, updated_at
  - adjustments_json: changes from baseline (added teachers, changed curriculum, etc.)
  - solver_result_json: solver output if scenario was solved

**Behavior:**
- Admin creates a scenario: "What if we hire 2 more Math teachers?"
- Clones current scheduling data, applies adjustments
- Runs solver on the scenario (background job)
- Compare scenarios side-by-side: utilization, gaps, preference scores, unassigned slots
- Approved scenarios become the basis for actual scheduling runs

**UI:**
- Scheduling > "Scenarios" page
- Create, list, compare (side-by-side table + charts)
- "Run Solver on Scenario" button
- "Approve & Apply" to convert to real run

---

## S18. Multi-Week Rotation

**Purpose:** Support A/B, A/B/C, or custom week rotation patterns.

**Data Model:**
- `rotation_configs` — tenant_id, academic_year_id, cycle_length (int, 1-8), week_labels_json (JSON array of strings, e.g., ["Week A", "Week B"]), effective_start_date (date), created_at, updated_at
  - Unique on (tenant_id, academic_year_id)
- `schedules.rotation_week` — int nullable (0-based: 0=Week A, 1=Week B, etc.). Null = applies to all weeks (non-rotating).

**Behavior:**
- Tenant sets cycle_length (1 = no rotation, 2 = A/B, 4 = monthly, etc.)
- Solver generates schedules for each week in the cycle as a linked problem
- Cross-week constraints: total periods per subject across cycle must match curriculum (e.g., 3 Maths across 2 weeks, not necessarily equal per week)
- System determines current rotation week from: `(weeks_since_effective_start) % cycle_length`
- Timetable views show current week with label ("Week A")
- Calendar sync includes all rotation weeks with correct dates

**Solver changes:**
- SolverInputV2 extended with `rotation_cycle_length` and `rotation_week_labels`
- Variables generated per week in the cycle
- Cross-week curriculum constraints added
- Output: assignments tagged with rotation_week

---

## S19. Exam Invigilation Assignment (AI-powered)

**Purpose:** AI assigns invigilators to exam slots optimally.

**Behavior:**
- Part of S16 (Exam Timetable Mode)
- AI/solver assigns staff to invigilation duties considering:
  - Staff availability
  - Exam subject (prefer teacher who teaches the subject for question-handling, but NOT required)
  - Fairness (distribute invigilation evenly)
  - Lead vs assistant roles
- Admin can override any assignment
- Invigilators notified of their duties

---

## S20. Schedule Efficiency Dashboard

**Purpose:** Operational metrics for scheduling quality.

**No new tables** — computed from schedules, substitution_records, and solver runs.

**Metrics:**
- Room utilization rate (% of available slots filled)
- Teacher utilization rate (teaching vs free periods)
- Average teacher gap count (free periods between teaching)
- Preference satisfaction score (from latest solver run)
- Substitution frequency (covers/week trending)
- Unassigned slot count
- Comparison: this term vs last term, this year vs last year

**UI:**
- Scheduling > "Dashboard" (enhanced from current)
- Cards + Recharts line/bar charts
- Export to PDF for board reports

---

## S21. Teacher Workload Heatmap

**Purpose:** Visual grid showing each teacher's weekly load distribution.

**No new tables** — computed from schedules.

**UI:**
- Scheduling > Dashboard > "Workload" tab
- Grid: teachers (rows) × weekday-period (columns)
- Color intensity: green = light, yellow = moderate, red = heavy
- Click teacher row → detail breakdown (subjects, classes, cover duties)
- Filter by department/subject
- Highlights: overloaded teachers (> max config), underloaded teachers (< 50% capacity)

---

## S22. Room Utilisation Analytics

**Purpose:** Identify room bottlenecks and underutilized spaces.

**No new tables** — computed from schedules + rooms.

**Metrics per room:**
- Utilization rate (filled slots / available slots)
- Peak times (heatmap: which periods are busiest)
- Average class size vs capacity (efficiency)
- Conflict frequency (how often this room is requested but unavailable)

**UI:**
- Scheduling > Dashboard > "Rooms" tab
- Room cards with utilization bars
- Heatmap: rooms × periods
- Recommendations: "Lab 2 is used 20% — consider reassigning" or "Room 5 is bottleneck at 95%"

---

## S23. Interactive Conflict Resolution UI

**Purpose:** When solver has unassigned slots, guide admin through fixing them.

**No new tables** — works with solver output.

**UI:**
- Scheduling run review page → "Resolve Conflicts" tab
- List of unassigned slots with: subject, class, why unplaceable
- For each: suggested actions (from AI #13)
- Admin clicks a suggestion → system shows preview of impact
- Apply suggestion → re-validates remaining conflicts
- Iterative: fix one conflict, remaining conflicts may auto-resolve

---

## S24. Historical Comparison

**Purpose:** Compare scheduling metrics across years/terms.

**No new tables** — queries historical scheduling_runs and schedules.

**UI:**
- Scheduling > Dashboard > "Trends" tab
- Side-by-side: this year vs last year (or any two periods)
- Metrics: utilization, gaps, preference scores, substitution rates
- Charts: trend lines across terms

---

## S25. Personal Timetable Export (PDF)

**Purpose:** Generate a printable PDF of a teacher's weekly timetable.

**Behavior:**
- Teacher or admin generates PDF from personal timetable view
- Clean layout: weekly grid with all details
- Includes: rotation week labels, cover duties, room assignments
- Puppeteer renders to A4 PDF (landscape)
- Batch export: admin generates PDFs for all teachers as ZIP

---

## S26. Substitution Analytics

**Purpose:** Track cover patterns for fairness and reporting.

**No new tables** — aggregates from substitution_records + teacher_absences.

**Metrics:**
- Cover count per teacher (who does the most)
- Cover distribution fairness (coefficient of variation)
- Absence patterns per teacher (frequent absent days, total days missed)
- Cover by department (which department needs most cover)
- Trending: monthly cover demand

**UI:**
- Scheduling > "Cover Reports" page (same as S4)
- Charts + exportable tables

---

## S27. Classroom Model Configuration

**Purpose:** Fixed homeroom vs free movement per year group.

**Data Model:**
- New enum: `ClassroomModel` — 'fixed_homeroom' | 'free_movement'
- `year_groups.classroom_model` — ClassroomModel (default: 'fixed_homeroom')
- `classes.homeroom_id` — UUID nullable FK to rooms

**Behavior:**
- Fixed homeroom: class assigned to a room permanently. Solver skips room assignment for these classes. Timetable shows Subject + Teacher.
- Free movement: solver assigns rooms. Timetable shows Subject + Teacher + Backup Teacher + Room.
- Per year group — hybrid is natural (primary = fixed, secondary = free).
- Solver reads classroom_model from year group and adjusts variable generation.

**UI:**
- Year group settings: "Classroom Model" dropdown
- Class settings: "Homeroom" room picker (visible only for fixed_homeroom)
- Timetable adapts columns based on model

---

## New Database Tables Summary

| Table | Purpose |
|---|---|
| `teacher_absences` | Teacher absence records |
| `substitution_records` | Cover assignment tracking |
| `calendar_subscription_tokens` | Webcal subscription tokens |
| `exam_sessions` | Exam period definitions |
| `exam_slots` | Individual exam time/room placements |
| `exam_invigilation` | Invigilator assignments per exam |
| `scheduling_scenarios` | What-if scenario definitions + results |
| `rotation_configs` | Multi-week rotation cycle config |

All tables tenant-scoped with RLS.

---

## New Enums

| Enum | Values |
|---|---|
| `ClassroomModel` | fixed_homeroom, free_movement |
| `SubstitutionStatus` | assigned, confirmed, declined, completed |
| `ExamSessionStatus` | planning, published, completed |
| `ScenarioStatus` | draft, solved, approved, rejected |

---

## Modified Existing Tables

| Table | Change |
|---|---|
| `year_groups` | Add `classroom_model ClassroomModel` (default: fixed_homeroom) |
| `classes` | Add `homeroom_id UUID?` FK to rooms |
| `schedules` | Add `rotation_week Int?` (0-based week index in rotation cycle) |

---

## New Permissions

| Permission | Description |
|---|---|
| `schedule.manage_substitutions` | Report absences, assign substitutes |
| `schedule.view_reports` | View cover reports, analytics, workload |
| `schedule.manage_exams` | Create/edit exam timetables |
| `schedule.manage_scenarios` | Create/manage what-if scenarios |
| `schedule.view_personal_timetable` | View own timetable (teacher) |

---

## New Tenant Settings

**scheduling section (in tenant_settings.settings):**
- `autoAssignUrgentSubstitutions` — boolean (default: false)
- `urgentThresholdMinutes` — number (default: 60)
- `notifyTeachersOnScheduleChange` — boolean (default: true)
- `scheduleChangeNotificationChannel` — 'in_app' | 'email' | 'both' (default: 'both')

---

## Implementation Order

1. **Foundation:** S8 (classroom model) + S18 (multi-week rotation) — these modify the solver
2. **Substitution:** S1 + S2 + S3 + S4 + S26 — complete cover management system
3. **Tools:** S5 (quick swap) + S6 (emergency changes) + S7 (notifications) + S23 (conflict resolution)
4. **Views:** S9 (teacher timetable) + S10 (parent timetable) + S11 (mobile) + S12 (calendar sync) + S25 (PDF export)
5. **AI:** S13 (conflict resolution AI) + S14 (optimiser) + S15 (predictive staffing)
6. **Exam:** S16 + S19 (exam timetable + invigilation)
7. **Planning:** S17 (scenarios) + S20-S24 (analytics + dashboard)
