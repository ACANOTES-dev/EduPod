---
name: Digital Forms & Consent Platform
description: SHOULD-HAVE — Replace paper permission slips, medical consent, trip forms, policy sign-offs with digital forms, e-signatures, and automated chase-up.
type: project
---

**Priority:** Should-have. Massive daily pain point for every school. High visibility.

**What it is:**
A form builder and consent management system that eliminates paper forms from school operations. Every Irish school sends hundreds of paper forms home per year — trip permissions, medical consent, photo consent, acceptable use policies, instrument hire, sports team sign-ups. Parents lose them. Kids forget them. Teachers spend hours chasing.

**What EduPod should build:**
- **Form builder:** reusable templates with field types (text, signature, checkbox, date, file upload, dropdown). Extend the existing admissions form builder.
- **E-signature:** legal digital signature capture (finger/stylus on mobile, typed on desktop)
- **Consent types:**
  - One-time (trip permission for a specific date)
  - Annual (photo consent, acceptable use policy — valid for academic year)
  - Standing (medical consent — valid until revoked)
- **Distribution:** send to specific students/classes/year groups/whole school. Multi-channel (in-app, email, push notification)
- **Chase-up automation:** configurable reminders to non-respondents (day 2, day 5, day 7). Dashboard showing "26/30 returned, here are the 4 outstanding" with one-click re-send
- **Medical info auto-attach:** when a parent consents to a trip, auto-include their child's medical notes, allergy info, and emergency contacts in the trip leader's pack
- **Consent archive:** searchable historical record of all consents with timestamps and signatures — GDPR audit trail
- **Parent experience:** parent receives notification → opens form in their language → reads, signs, submits → done in 60 seconds
- **Admin dashboard:** real-time completion rates, outstanding forms, overdue responses

**Why it's revolutionary:**
- No school MIS in Ireland handles this well. Schools use paper, Google Forms, or standalone tools like Consent2Go
- The integration with student medical data, emergency contacts, and parent portal is something standalone form tools can't do
- A trip that used to require 2 weeks of form chasing can be fully consented in 48 hours
- Principals consistently cite form management as one of their biggest time sinks

**Effort estimate:** Medium — the admissions form builder provides the architectural foundation. Main new work is e-signature, consent lifecycle management, and the chase-up automation. The notification infrastructure already exists.

**How to apply:** Build after core Irish statutory integrations. This is a feature that wins demos — "show me how you handle trip permission forms" is a question every principal asks. The answer should be a 60-second live demo, not "we don't do that."
