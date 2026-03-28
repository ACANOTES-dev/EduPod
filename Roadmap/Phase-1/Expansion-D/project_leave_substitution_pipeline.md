---
name: Leave → Substitution → Timetable Pipeline
description: SHOULD-HAVE — Automated flow: teacher requests leave → system finds substitute → updates timetable → notifies everyone. Replaces deputy principal's 7am phone scramble.
type: project
---

**Priority:** Should-have. 80% of the pieces already exist. Connecting them is transformative.

**What it is:**
An integrated pipeline that connects staff leave management to the existing substitution and timetabling systems. Currently when a teacher calls in sick, the deputy principal manually checks who's free, phones substitute teachers, manually updates the timetable, and manually notifies affected classes. Three separate manual processes under time pressure at 7am.

**What EduPod should build:**
- **Staff leave management:**
  - Leave types: sick, personal, professional development, maternity/paternity, force majeure, other
  - Leave request submission (mobile-friendly — teacher submits from bed at 6:30am)
  - Leave balance tracking (entitlements per type per year)
  - Approval workflow (principal/deputy approves)
  - Calendar view of all staff leave (past and upcoming)
  - Leave reports for DES/management
- **Automated substitution trigger:**
  - Approved leave → system identifies affected classes from timetable
  - AI suggests best substitute based on: availability, subject competency, existing workload, preferences (existing substitution AI)
  - Deputy principal confirms or overrides suggestion with one tap
  - If external substitute needed: flag for manual handling
- **Timetable auto-update:**
  - Confirmed substitute assignment → timetable automatically updated
  - Students see updated timetable in their portal/app
  - Substitute teacher sees their temporary schedule
  - Room assignments adjusted if needed
- **Notification cascade:**
  - Substitute teacher: notified of assignment with class details, room, time, lesson plan link
  - Students/parents: notified of teacher change (configurable — some schools prefer not to notify parents)
  - Admin: dashboard of today's substitutions and coverage gaps
- **Reporting:**
  - Staff absence frequency and patterns
  - Substitution costs (if external subs are paid)
  - Coverage gap analysis (periods that couldn't be covered)
  - Substitute teacher utilisation

**What already exists in EduPod:**
- Timetabling engine with full scheduling
- Substitution management module with teacher absences and substitute assignment
- AI-powered substitution suggestions
- Cover tracking and cover reports
- Substitution board
- Staff availability data
- Notification infrastructure (multi-channel)

**What's new:**
- Staff leave request/approval workflow
- Leave balance tracking
- The automated trigger connecting leave → substitution → timetable update → notifications
- External substitute teacher management

**Why it's revolutionary:**
- The deputy principal's morning is transformed from 45 minutes of phone calls to 5 minutes of confirmations
- No school MIS fully automates this pipeline. Compass has separate modules. VSware has supervision scheduling. Nobody connects leave → sub → timetable → notify in one flow.
- This is the feature that deputy principals will talk about in staff rooms across the country

**Effort estimate:** Low-Medium — most components exist. The new work is leave management (straightforward CRUD + approval) and the orchestration pipeline connecting existing modules.

**How to apply:** Build after behaviour management. The substitution module already exists and is sophisticated. Staff leave management is a natural extension. The pipeline orchestration is the innovative layer — it's not a new module, it's connecting existing modules intelligently.
