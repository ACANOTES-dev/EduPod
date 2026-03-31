---
name: Engagement & Activity Management (Master Feature)
description: SHOULD-HAVE — A unified, centralized engine for digital forms, e-signatures, school trips, event logistics, payments, and parent-teacher conference scheduling.
type: project
---

**Priority:** Should-have. This is a "wow" feature that replaces massive amounts of paper chasing and directly impacts every teacher, parent, and admin.

**What it is:**
Instead of building isolated silos for "Trips", "Consent Forms", and "Parent Evenings", this master feature acts as a unified "School-to-Home Interactions" engine. It handles any scenario where the school needs a parent to provide consent, make a payment, or book a time slot before a deadline.

**Why Combine Them:**

- **Zero Duplication:** We don't need to rebuild "Parent Portal Action Items", "Chase-up Notifications", or "Status Dashboards" three times.
- **Unified Parent Experience:** Parents get a single "Action Center" on their dashboard (e.g., "Sign IT Policy", "Pay for Geography Trip", "Book Parent Evening Slots").
- **Medical/Emergency Data Integration:** Because it's one system, any event that requires a "Trip Leader Pack" or "Information Sheet" automatically aggregates live medical profiles and emergency contacts.

---

### Architectural Pillars

#### 1. The Forms & E-Signature Engine (The Base Primitive)

An extension of the Admissions form builder tailored for enrolled students.

- **FormTemplates:** Reusable definitions (Risk Assessments, Generic Trip Consent, Annual IT Policy).
- **FormSubmissions:** Parent responses capturing digital signatures, checkboxes, and timestamps.
- **Consent Types:** Support for One-time (Trip), Annual (Photo consent), and Standing (Medical updates) forms.

#### 2. The Events & Scheduling Engine

A polymorphic model that caters to different event types:

- **School Trips & Events:** An `Event` with a date/time block, capacity limit, linked `FormTemplate` for consent, linked `Fee` for payment, and assigned `Staff`.
- **Parent-Teacher Conferences:** An `Event` comprised of multiple 10-minute `TimeSlots`. Parents book slots with their child's teachers. Built-in conflict prevention preventing double-booking.
- **Policy Sign-offs:** Essentially a "headless event" — just a widespread distribution of a `FormTemplate` requiring a signature by a specific date.

#### 3. The Automation & Workflow Engine

A central BullMQ worker process that monitors deadlines and triggers communications.

- **Reminders:** "Find all `Event` or `Form` requests where `status = pending` and `deadline_days < 3`, and trigger push notifications/emails."
- **Dashboards:** Real-time visibility for admins and teachers ("38/50 responded, 12 outstanding").

---

### Key Deliverables

**For Parents:**

- **Action Center:** Consolidated list of outstanding forms, payments, and bookings.
- **Mobile-first Forms:** 60-second sign-off process in their preferred language (i18n supported).
- **Self-service Booking:** Intuitive UI to pick available slots for parent-teacher evenings.

**For Staff & Teachers:**

- **The Trip Leader Pack (PDF):** Auto-generated document compiling attending students, highlighted medical flags/allergies, emergency contacts, and signed consent copies.
- **Conference Schedule Dashboard:** A clean visual breakdown of their evening, showing who they are speaking to and when.
- **Chase-up Automation:** One-click "Remind All Outstanding" button.

---

### Implementation Phasing

1. **Phase 1: The Forms Primitive:** Build the internal form builder, e-signature capture, and distribution engine. Use this to handle standalone school policies (e.g., Acceptable Use Policy).
2. **Phase 2: The Events Primitive & Module:** Introduce the `Event` entity. Link it to the forms primitive for trip consent and the existing finance module for payments.
3. **Phase 3: The Trip Leader Pack & Logistics:** Build the PDF generation engine that pulls live medical data and emergency contacts for the event's roster.
4. **Phase 4: The Scheduling Primitive (Conferences):** Extend the `Event` entity to support `TimeSlots` and conflict resolution logic, enabling parent conference bookings.
5. **Phase 5: Automation & Dashboards:** Implement the background chase-up jobs and the unified admin tracking dashboards.

---

**Competitor Status:**

- **Compass:** Has separate Events and Parent Conferences modules, but highly disjointed.
- **VSware:** Highly basic/non-existent equivalent features.
- Standalone tools like _Consent2Go_ or _Google Forms_ cannot automatically merge live medical/MIS data or process integrated payments.

**Effort Estimate:** High — but significantly less effort than building three disjointed features. It builds upon existing infrastructure (Forms, Notifications, Finance) to create a massive leap in capability.
