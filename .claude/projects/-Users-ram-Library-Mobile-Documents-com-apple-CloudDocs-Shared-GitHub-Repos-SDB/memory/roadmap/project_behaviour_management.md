---
name: Behaviour Management Module
description: NON-NEGOTIABLE — Positive/negative incident tracking, teacher-initiated logging, parent visibility, behaviour reports. Schools track this daily.
type: project
---

**Priority:** Non-negotiable. Irish schools track behaviour obsessively. Both competitors offer this.

**What it is:**
A module for recording, tracking, and reporting on student behaviour — both positive recognition and negative incidents. Used daily by teachers and reviewed by management and parents.

**What EduPod must build:**
- Incident creation: teacher-initiated, categorised (positive/negative), severity levels
- Incident types: configurable per tenant (praise, merit, warning, detention, suspension, expulsion, etc.)
- Points/merit system: configurable positive/negative point values per incident type
- Quick-log for teachers: fast entry from mobile during/between classes
- Student behaviour profile: chronological record, summary stats, trends
- Parent visibility: parents see behaviour record in portal (configurable what they see)
- Behaviour reports: per student, per class, per year group, school-wide
- Behaviour analytics: trends over time, hotspots (time of day, subject, teacher), comparisons
- Safeguarding/child protection: permissioned access to sensitive records (like Compass's Chronicle)
- Intervention tracking: link behaviour patterns to interventions with outcomes
- Integration with attendance patterns (correlation analysis)

**Competitor status:**
- Compass: Chronicle is one of their strongest selling points — behaviour + safeguarding + wellbeing + permissioned access. Consistently praised in testimonials.
- VSware: basic positive/negative behaviour recording with individual student reports
- Tyro: behaviour tracking included

**Effort estimate:** Medium-High — this is a full module with its own data model, UI, reports, and parent portal integration. However, the architectural patterns are well-established in EduPod (similar to attendance in terms of per-student daily recording).

**How to apply:** Build before approaching Irish schools. This is a daily-use feature for teachers — its absence would be immediately noticed in any demo. The behaviour data also feeds into the ETB analytics dashboard vision (cross-school behaviour comparisons).
