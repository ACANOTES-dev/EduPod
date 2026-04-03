---
name: Event & Trip Management
description: NICE-TO-HAVE — End-to-end trip logistics: risk assessment, digital consent, payment, medical info aggregation, trip leader pack PDF, post-event reporting.
type: project
---

**Priority:** Nice-to-have. High visibility, demonstrates the "all-in-one" value.

**What it is:**
An integrated module for managing school events and trips — from planning through consent collection, payment, logistics, and post-event reporting. School trips are currently a logistics nightmare involving multiple disconnected processes.

**What EduPod should build:**

- **Event creation:**
  - Type: day trip, overnight, sports event, cultural event, in-school event, after-school activity
  - Date, time, location, capacity, cost per student
  - Linked year groups/classes (who's eligible)
  - Staff supervisors assigned (with staff-to-student ratio tracking)
- **Risk assessment:** template-based risk assessment form attached to event. Required before consent can be sent.
- **Digital consent:** auto-generated consent form sent to parents of eligible students (uses digital forms & consent module)
  - Trip-specific questions (e.g., "can your child swim?" for water activities)
  - Medical info auto-pulled from student profile
  - Payment collection integrated (uses finance module)
- **Real-time dashboard:** "42/50 consented, 38/50 paid, 5 outstanding consent, 7 outstanding payment" with one-click reminders
- **Trip leader pack (PDF):**
  - Auto-generated document for the supervising teacher
  - Attending student list with photos
  - Medical notes, allergies (highlighted), medications
  - Emergency contacts per student
  - Dietary requirements
  - Consent form copies
  - Risk assessment copy
  - School emergency contacts
- **On-the-day:** attendance check-off (mobile), headcount confirmation, emergency contact quick-dial
- **Post-event:** attendance confirmation, incident reporting if needed, financial reconciliation
- **Calendar integration:** events appear in school calendar and parent portal

**Competitor status:**

- Compass: has "Events" module with payments and consents. No trip leader pack.
- VSware: no events module
- Standalone tools like Consent2Go exist but aren't integrated with MIS data

**Why it's valuable:**

- Trip organisation currently takes teachers 2-3 weeks of paper chasing
- The trip leader pack alone is worth the feature — teachers currently compile this manually from multiple sources
- Medical info auto-aggregation from student profiles is something no standalone tool can do
- Payment integration means no separate collection process
- High parent visibility — parents see a professional, organised process

**Effort estimate:** Medium — integrates with digital forms, finance, student profiles, calendar, and PDF rendering. Each integration point already exists. Main new work is the event entity, trip leader pack template, and the orchestration workflow.

**How to apply:** Build after digital forms & consent module (dependency). This is a natural extension that demonstrates the power of integrated data — trip consent + payment + medical info + emergency contacts all flowing from existing student and household records.
