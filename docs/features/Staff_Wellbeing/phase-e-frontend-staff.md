# Phase E: Frontend — Staff Experience

**Module:** Staff Wellbeing & Workload Intelligence
**Master Spec:** `Next_Feature/Staff_Wellbeing/staff-wellbeing-spec-v1-master.md`
**Identity:** The pages staff interact with daily. Trust is built here.
**Dependencies:** Phase B (survey submission endpoints), Phase D (workload data endpoints)
**Blocks:** Phase F (shared layout, components)
**Design reference:** `docs/plans/ux-redesign-final-spec.md`

---

## Prerequisites

- Phase B complete (survey CRUD, anonymous submission, active survey endpoint)
- Phase D complete (personal workload endpoints, EAP resource endpoint)
- Read master spec Sections 8 (Frontend Pages — V1 staff pages), 8.1 (UI Requirements — anonymity panels, active survey indicator, small school guidance, framing language)
- Read `docs/plans/ux-redesign-final-spec.md` for visual language
- All endpoints from B and D are functional and tested

---

## Non-Negotiable UI Rules (from master spec)

These are not guidelines — they are hard requirements:

1. **Anonymity explanation panels** on every survey-related page
2. **Active survey sidebar indicator** visible to all staff
3. **Framing language:** Use "workload pressure", "cover burden", "timetable strain" — NEVER "burnout", "at-risk", "underperforming"
4. **Mobile-first:** Usable at 375px (iPhone SE)
5. **RTL-safe:** Logical properties only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`)
6. **Bilingual:** `useTranslations()` for all text, translation keys for en + ar
7. **LTR enforcement** on: numbers, dates, percentages
8. **Server components by default** — `'use client'` only when interactivity required

---

## Deliverables

### E1. Personal Workload Dashboard — `/wellbeing/my-workload`

**Route:** `apps/web/app/(tenant)/wellbeing/my-workload/page.tsx`
**Role:** Any staff member (self-only view)
**Data source:** Phase D endpoints (`/my-workload/summary`, `/cover-history`, `/timetable-quality`)

**Layout:**

- Header: "My Workload" (i18n key)
- Summary cards row (responsive grid):
  - Teaching periods this week (number + "of X max" from tenant threshold)
  - Cover duties this term (number + school average for comparison)
  - Timetable quality score (0-100 with "Good" / "Moderate" / "Needs attention" label)
- Cover history section:
  - Table/card list of cover duties (date, period, subject, "Colleague" — never the absent teacher's name)
  - Running total for term
  - "School average: X" comparison line
- Timetable quality breakdown:
  - Free period distribution (small bar chart — periods across the week)
  - Consecutive teaching periods (max per day, highlighted if >= 4)
  - Split days count
  - Room changes per day
  - Each metric shows personal value vs school average
- Trend section (if previous term data exists):
  - Simple line/bar comparison: this term vs last term for key metrics

**Mobile (375px):**

- Summary cards stack vertically
- Cover history as card view (not table)
- Charts use full width, simplified labels

**Privacy note displayed at top:** "This dashboard is visible only to you. No one else — including your principal — can see your personal workload data."

### E2. Resources Page — `/wellbeing/resources`

**Route:** `apps/web/app/(tenant)/wellbeing/resources/page.tsx`
**Role:** All staff
**Data source:** Phase B endpoint (`/resources`)

**Layout:**

- Header: "Support & Resources" (not "Wellbeing Resources" — less clinical)
- EAP section (if configured):
  - Provider name, phone, website, hours, management body
  - Prominent "Call now" button (tel: link on mobile)
  - Last verified date with freshness indicator
- Crisis resources section (hardcoded, always visible):
  - Pieta House: 1800 247 247
  - Samaritans: 116 123
  - Text 50808
  - INTO helpline (primary teachers)
  - TUI helpline (post-primary teachers)
  - ASTI helpline (post-primary teachers)
  - Each with name, phone (tel: link), website, brief description
- External resources section (from tenant settings):
  - Configurable list of additional resources
- Management body contact (if configured):
  - JMB, ETBI, or equivalent contact details

**Mobile:** Full-width cards, large touch targets on phone numbers (44x44px min). Phone numbers are prominent — this page might be accessed in a moment of need.

**No login wall for crisis numbers:** Consider whether crisis numbers should be accessible without authentication. Decision for user — flag during implementation.

### E3. Survey Submission Page — `/wellbeing/survey`

**Route:** `apps/web/app/(tenant)/wellbeing/survey/page.tsx`
**Role:** All staff
**Data source:** Phase B endpoints (`/respond/active`, `POST /respond/:surveyId`)

**States:**

#### No Active Survey

- Clean message: "There are no active surveys at the moment. You'll be notified when a new survey opens."
- No empty-state sadness — just informational

#### Active Survey (Not Yet Responded)

- **Anonymity explanation panel (non-negotiable):**
  > "Your response is anonymous. We store no information that could identify you — not your name, not your account, not even the time you submitted. Results are only released after the survey closes."
  - Expandable "How is my anonymity protected?" section with plain-language architecture explanation:
    > "Your participation is verified using a one-way mathematical token that confirms you're a staff member without recording who you are. This token is automatically deleted 7 days after the survey closes. After that, even the system itself cannot determine who participated."
- Survey title and description
- Questions rendered by type:
  - **Likert 5:** Radio buttons with labels (Strongly Disagree → Strongly Agree), horizontal on desktop, vertical on mobile
  - **Single choice:** Radio buttons with custom option labels
  - **Freeform:** Textarea with character limit guidance
    - Submission warning above textarea: "Avoid names or details that could identify you or others. Your response is anonymous — help keep it that way."
- Submit button: "Submit Anonymous Response"
- Confirmation dialog before submit: "Once submitted, your response cannot be changed or withdrawn. Continue?"

#### Active Survey (Already Responded)

- "Thank you for your response. Your anonymous feedback has been recorded."
- "Results will be available after the survey closes on [date]."
- No option to re-submit or view their own response

**Form handling:**

- Client component (`'use client'`)
- Validate required questions before submit
- On submit: POST to `/respond/:surveyId`
- Handle 409 (already responded) gracefully
- Handle 403 (outside window) gracefully
- On success: redirect to thank-you state
- No loading states that could be observed by someone watching over a shoulder (submit should be instant-feeling)

### E4. Active Survey Sidebar Indicator

**Location:** Sidebar component (existing layout)
**Visibility:** All staff, when a survey is active for their tenant

**Implementation:**

- On layout load: check `/respond/active` endpoint
- If active survey exists and user has NOT responded: show badge/indicator on sidebar
  - Small dot or badge next to "Wellbeing" nav item
  - Tooltip or text: "Survey open"
  - Click navigates to `/wellbeing/survey`
- If active survey exists and user HAS responded: badge disappears (or changes to "Submitted" check)
- If no active survey: no indicator
- Badge disappears when survey window closes

**Mobile:** Indicator visible in mobile nav drawer. Same behaviour.

### E5. Small School Setup Guidance

**Trigger:** When staff count < 15 for the tenant
**Location:** Appears on first visit to any wellbeing page (dismissible per session, not persistent)

**Content:**

> "Your school has [X] staff members. Survey results will only appear when at least [threshold] staff respond. Department-level insights require departments with at least [dept_threshold] members."

**Behaviour:**

- Sections that can NEVER populate (e.g., department drill-down when no department exceeds threshold) are **hidden entirely** — not shown with "Not enough data" messages
- This applies to both staff and admin views
- The guidance is informational, not blocking — the module is still valuable for workload dashboards and EAP regardless of school size

---

## Translation Keys

All visible text must use i18n translation keys. Key prefix: `wellbeing.`

Key areas requiring translation:

- Page titles and section headers
- Anonymity explanation panels (both short and expanded versions)
- Submission warning text
- Survey question type labels
- Status messages (no active survey, already responded, thank you)
- Small school guidance text
- Resource page content (except provider names/numbers which are data)
- Framing language terms (workload pressure, cover burden, timetable strain)
- Metric labels and assessment terms (Good, Moderate, Needs attention)

**Western numerals (0-9) in both locales.** Gregorian calendar in both locales.

---

## Verification Checklist

- [ ] `/wellbeing/my-workload` shows personal data only (no other staff data)
- [ ] Privacy note displayed: "visible only to you"
- [ ] Cover history shows "Colleague" — never the absent teacher's name
- [ ] Timetable quality shows personal vs school average comparison
- [ ] `/wellbeing/resources` shows EAP info + crisis resources
- [ ] Crisis phone numbers are clickable (tel: links) with 44x44px touch targets
- [ ] `/wellbeing/survey` shows anonymity explanation panel
- [ ] Expandable architecture explanation works
- [ ] Submission warning shown before freeform textarea
- [ ] Survey handles all states: no active, active + not responded, active + already responded
- [ ] Confirmation dialog before submit
- [ ] 409 (already responded) handled gracefully
- [ ] Active survey sidebar indicator visible when survey is open
- [ ] Indicator disappears after responding or after survey closes
- [ ] Small school guidance shown when staff < 15
- [ ] Sections that can't populate are hidden (not "no data" messages)
- [ ] All text uses i18n translation keys (en + ar)
- [ ] RTL renders correctly (logical properties, no physical directional classes)
- [ ] Mobile responsive at 375px
- [ ] Framing language: no "burnout", "at-risk", "underperforming" anywhere
- [ ] `turbo lint` passes
- [ ] `turbo type-check` passes
