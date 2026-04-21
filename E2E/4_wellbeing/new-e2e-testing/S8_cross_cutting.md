# S8 — Cross-cutting · Mobile + RTL + Roles + Isolation + Visual Polish

**Goal:** Hit the dimensions that each per-hub session only sampled — full mobile pass, full RTL pass, full role boundary pass, tenant isolation spot-check, and a dedicated visual-polish sweep for the bottom-margin / spacing issues the user flagged.

---

## 1. Prerequisites

- S0–S7 complete and verified
- Full dataset in place (seeded + UI-created + fix-driven changes from earlier sessions)
- NHQS stable — no open P0/P1 from earlier sessions

## 2. Dimensions

### 2a. Mobile viewport (375×667 — iPhone SE width)

Walk every hub landing page + two representative detail pages per hub, resized to 375px:

- `/en/behaviour`, `/en/behaviour/incidents`, `/en/behaviour/students/[id]`
- `/en/pastoral`, `/en/pastoral/cases`, `/en/pastoral/cases/[id]`
- `/en/safeguarding`, `/en/safeguarding/concerns`, `/en/safeguarding/concerns/[id]`
- `/en/early-warnings`, `/en/early-warnings/cohort`
- `/en/wellbeing`, `/en/wellbeing/dashboard`, `/en/wellbeing/surveys/[id]`
- `/en/wellbeing/survey` (parent / teacher / student flow)
- `/en/behaviour/parent-portal` (parent flow at 375px)

Per `frontend.md`:

- No horizontal scroll
- `min-w-0` on content container
- 44×44px touch targets
- `text-base` inputs (no iOS zoom)
- Tables have `overflow-x-auto` wrapper
- Action buttons collapsed to kebab where appropriate

### 2b. RTL (Arabic locale, `/ar/...`)

Same walk list as 2a but with `/ar/...`. For each:

- Logical CSS properties used (no `ml-`, `left-`, etc.)
- Punctuation and digits render correctly
- No hardcoded LTR layout assumptions (icon placement, button order)
- Form flows still submit correctly
- Translation keys all resolved (no `{{key}}` leaking through)

### 2c. Role boundaries

For each role below, log in and attempt to access every hub. Log each access decision as expected/unexpected.

| Role                             | Expected behaviour                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `owner@nhqs.test`                | Full access to everything                                                                                  |
| Teacher (`Sarah.daly@nhqs.test`) | Behaviour (limited), pastoral (very limited), no safeguarding admin, own staff wellbeing, see own workload |
| Parent (`parent@nhqs.test`)      | Parent portal only, own child's records only, no admin or safeguarding hub                                 |
| Student (`adam.moore@nhqs.test`) | Self-referral + own survey view only                                                                       |

Every unexpected access is a P0 or P1.

### 2d. Tenant isolation

Log in as `admin@stress-a.test` (different tenant). Try to:

- Open any NHQS URL by guessing ID
- Hit any NHQS API endpoint with the stress-a session cookie (via Playwright's fetch from within the authenticated session)
- Search for NHQS student names

Expected: nothing leaks. Actual?

Spot-check the reverse (NHQS admin trying to access stress-a records).

### 2e. Visual polish sweep (the user's explicit concern)

The user called out: content touching the browser edge at the bottom, no margin between last element and viewport bottom. Walk every hub landing and the most data-dense page in each hub at 1440×900. For each:

- Take a screenshot
- Inspect the bottom — is there at least ~24px padding below the last content element before the viewport edge?
- Same check at the sides (left/right)
- Same check with content that exceeds the viewport (scroll test)

Any page where this is wrong: P2 (polish), batched fix in one commit touching the offending layout primitives (likely a missing `pb-*` on a main container, or a missing `min-h-screen` wrapper).

Also sweep for:

- Inconsistent spacing between comparable cards (two dashboards with different gap sizes)
- Inconsistent border radius
- Inconsistent card elevations / shadows
- Heading hierarchy consistency across hubs
- Icon weight consistency

## 3. Tooling

- Playwright `browser_resize` for viewport toggles
- Locale switch by URL prefix (`/en` ↔ `/ar`)
- Role switch by logout + login
- Screenshots permitted for visual-polish evidence; delete before session close

## 4. Exit criteria

- [ ] Mobile walk complete on every listed route
- [ ] RTL walk complete on every listed route
- [ ] All four roles verified against expected access matrix
- [ ] Tenant isolation spot-check passes
- [ ] Visual-polish sweep done; bottom-margin check performed on every hub landing
- [ ] All S8 issues logged with `W-S8-NNN` IDs
- [ ] P0/P1/P2 fixed, deployed, verified; P3 fixed or deferred
- [ ] Screenshots deleted
- [ ] Session summary appended under S8 heading in the log
