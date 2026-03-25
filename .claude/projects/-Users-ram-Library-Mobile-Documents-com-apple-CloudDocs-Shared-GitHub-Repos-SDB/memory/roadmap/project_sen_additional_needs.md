---
name: SEN / Additional Needs Module
description: SHOULD-HAVE — IEP management, SENO hour tracking, SNA allocation, progress monitoring against goals. ~25% of students affected. No competitor does this well.
type: project
---

**Priority:** Should-have. Affects ~25% of students. Schools would switch MIS for this alone.

**What it is:**
A dedicated module for managing students with Special Educational Needs (SEN) or additional needs. Ireland has a specific framework: SENO (Special Educational Needs Organiser) allocates resource hours, schools must create Student Support Plans / Individual Education Plans (IEPs), and SNAs (Special Needs Assistants) are assigned to students. Currently managed in paper files and Word documents across every school.

**What EduPod should build:**
- **Student support profiles:** SEN category (learning, emotional/behavioural, physical, sensory, ASD, etc.), diagnosis, professional assessments, support level (school support, school support plus)
- **IEP/Student Support Plan builder:**
  - Goals (SMART format): target, baseline, current level, target date
  - Strategies and interventions per goal
  - Progress recording against each goal (periodic updates)
  - Review scheduling (typically termly)
  - Parent collaboration — parents view and contribute to plans via portal
  - Historical plan archive with version tracking
- **Resource allocation:**
  - SENO resource hours allocated to the school
  - Hours assigned per student
  - Utilisation tracking (hours used vs allocated)
  - SNA assignment (which SNA supports which students, schedule)
- **Professional involvement tracking:** educational psychologist, speech therapy, occupational therapy, CAMHS — referral dates, assessment dates, recommendations
- **Accommodation records:** exam accommodations (reader, scribe, extra time), classroom accommodations, assistive technology
- **Transition planning:** primary-to-post-primary transition reports, class-to-class handover information
- **Compliance reporting:** NCSE (National Council for Special Education) return data, inspection readiness
- **Confidentiality:** tiered access — only assigned teachers, resource teachers, SEN coordinator, and principal see full records
- **Integration with other modules:**
  - Gradebook: track academic progress in context of IEP goals
  - Attendance: flag SEN students in attendance patterns
  - Behaviour: contextualise behaviour incidents with SEN profile
  - Timetabling: resource teacher scheduling, learning support room allocation
  - Predictive early warning: SEN status as a risk factor

**Competitor status:**
- Compass: has "Interventions" module (tracks interventions with cost) but no proper IEP/Student Support Plan system
- VSware: student profiles include SEN details field but no dedicated module
- Aladdin: has SENO integration for primary schools
- Nobody has a comprehensive SEN module with IEP goal tracking and progress monitoring

**Why it's revolutionary:**
- Resource teachers currently spend hours writing IEPs in Word, printing, filing, and retrieving them for reviews
- Progress monitoring is manual and often neglected because the process is too cumbersome
- NCSE inspections require schools to produce SEN records — currently a scramble through paper files
- Parents of SEN children are often the most engaged and demanding — giving them portal access to their child's support plan builds enormous trust and loyalty

**Effort estimate:** Medium-High — new data models, new UI, integration points with multiple existing modules. However, the patterns (profiles, plans, goals, reviews) are well-established in the codebase.

**How to apply:** Build after behaviour and wellbeing modules (they share the pastoral care data model). This is a module that resource teachers and SEN coordinators would evangelise within their school — and SEN coordinators talk to each other across schools. Strong word-of-mouth potential.
