# UI Design Brief — School Operating System (Merged Frontend Source of Truth)

**Version**: 2.0  
**Date**: 16 March 2026  
**Status**: Replacement frontend brief  
**Consumer**: Design agent / frontend developers / coding agent

**Purpose**: This file is the single frontend source of truth for the school operating system. It replaces the earlier standalone UI brief and folds in the later UI/UX uplift decisions. The frontend team should use this alongside the master plan when building pages, flows, components, dashboards, and cross-module navigation.

---

## 1. Core Product Experience Standard

This is not a generic admin template. It is a premium, calm, operational system used daily by principals, teachers, finance staff, office admins, parents, and platform operators. The UI must remain composed under real school pressure: dense data, urgent exceptions, cross-module work, bilingual content, and staff with mixed technical confidence.

The product should feel:
- premium, spacious, and intentionally designed
- fast to navigate even for users who do not think in modules
- trustworthy during sensitive actions such as invoicing, payroll, refunds, attendance amendments, and approvals
- genuinely bilingual in English and Arabic, not merely translated
- coherent across all modules, not like several mini-products joined together

**Primary UX goal**: reduce operational friction.  
**Secondary UX goal**: build confidence and clarity.  
**Anti-goal**: decorative UI that slows common workflows.

---

## 2. Experience Principles

### 2.1 Design Philosophy

Premium, spacious, approachable. Every screen should feel calm and uncluttered, even when displaying dense operational data. The interface should communicate “this was designed” not “this was generated.”

### 2.2 Product-wide Principles

1. **Action before ornament**  
   Every major screen must make the next action obvious.

2. **Records over modules**  
   Students, households, staff members, classes, invoices, payroll runs, applications, and approvals should feel like durable entities with history, related activity, and linked actions.

3. **Exception-first UX**  
   The system must treat failure, conflict, missing data, stale snapshots, approval exhaustion, and ambiguous matching as first-class states.

4. **High trust for sensitive operations**  
   Users should always understand what changed, why it changed, who changed it, and what the downstream effect is.

5. **Fast for repeat users**  
   Frequent users must have command palette access, keyboard-friendly tables, saved views, recent items, and persisted preferences.

6. **Forgiving for non-technical users**  
   Forms, imports, and multi-step workflows should guide, validate, explain, and recover gracefully.

7. **Native-feeling bilingual UX**  
   RTL must feel deliberate, not mirrored as an afterthought.

---

## 3. Navigation Architecture

### 3.1 Global Structure

**Pattern**: Full sidebar with grouped sections plus a sticky top bar.

**Sidebar behaviour**:
- Fixed position, always visible on desktop (≥1024px)
- Width: 260px
- Background: white in light mode, `slate-900` in dark mode
- Border-right: 1px `border-color` separator
- Collapsible to icon-only (56px) via toggle button at the bottom — user preference persisted
- On mobile (<1024px): hidden by default, slides in as an overlay with backdrop when hamburger is tapped

**Sidebar structure**:
```
[School logo + name]              ← from tenant_branding
─────────────────────
OVERVIEW (section label)
  Dashboard
  Inbox / Actions          ← if enabled for role shell

PEOPLE (section label)
  Students
  Staff
  Households

ACADEMICS (section label)
  Classes
  Attendance
  Gradebook

OPERATIONS (section label)
  Admissions
  Finance
  Payroll
  Communications
  Approvals                ← render when relevant for role

SCHOOL (section label)
  Website
  Settings
─────────────────────
[User avatar + name]              ← bottom-pinned
  Role context switcher (if multi-role)
  Locale switcher (en/ar)
  Theme toggle
  Logout
```

**Sidebar items**:
- Icon (Lucide icons, 18px) + label text
- Active state: emerald-50 background with emerald-700 text and a 3px emerald-600 inline-start border accent
- Hover state: subtle background shift (gray-50 light / slate-800 dark)
- Section labels: uppercase, 11px, letter-spacing 0.05em, text-tertiary colour, 24px top margin between sections

**Visibility rules**:
- Sidebar items are filtered by permissions and enabled modules
- Empty sections are hidden entirely
- Platform admin has a distinct shell and does not inherit school navigation patterns wholesale

### 3.2 Top Bar

**Top bar** (to the right of the sidebar, spans content area):
- Height: 56px
- Sticky on scroll
- Contains: page title (left), global search / command launch (centre), notifications + user avatar (right)
- Search bar: 320px max-width, rounded-full, placeholder such as “Search students, households, invoices...”

**Top bar additions**:
- command palette trigger hint (`⌘K` / `Ctrl+K`)
- breadcrumb trail on detail pages below or beside the page title
- optional page-level action cluster on the right for primary actions

### 3.2b Notification Panel

The notification bell in the top bar opens a **slide-down notification panel** (not a separate page).

**Panel design**:
- max-height 480px, scrollable, 320px wide
- surface bg, 16px radius, 1px border, subtle shadow
- header with "Notifications" title and "Mark all read" action

**Individual notification cards** (not plain text lines):
- each notification is a mini card within the panel
- icon on the left indicating type (Lucide icon, semantic colour): invoice = receipt icon in info colour, payment = checkmark in success, attendance = alert in warning, approval = shield in emerald, etc.
- bold action line: "Invoice #INV-202603-0042 was paid"
- secondary context line in text-tertiary: "€2,450.00 from Al-Hassan household"
- relative timestamp: "2 minutes ago" / "Yesterday at 14:30"
- unread indicator: emerald-500 dot on the left edge
- clicking a notification navigates directly to the relevant record and marks it as read
- group by: Today / Yesterday / Earlier

**Badge on bell icon**: Unread count badge (emerald-700 bg, white text, rounded-full, 18px diameter). If count exceeds 9, show "9+". If zero unread, no badge.

### 3.3 Command Palette

The system must implement a global command palette.

**Trigger**:
- `⌘K` on macOS
- `Ctrl+K` on Windows/Linux
- click into global search field

**Capabilities**:
- Jump to record by name, ID, reference number, or common search terms
- Create new records from global entry points when permitted
- Navigate to modules and settings
- Surface recent items and pinned items before the user types
- Group results by type: Students, Households, Staff, Classes, Applications, Invoices, Payroll Runs, Approvals, Pages
- Respect tenant and permission scope

**Result design**:
- compact list with icon, primary label, secondary context, and keyboard highlight state
- search result subtitle should help disambiguate similar records (e.g. year group, student code, household billing parent)

### 3.4 Workflow Memory in Navigation

Persist the following per user:
- sidebar collapsed state
- last active role context
- locale and theme preference
- table column visibility and ordering
- saved filters and saved views
- recently viewed records
- pinned records
- last active internal tab on major record pages when appropriate

---

## 4. Information Architecture and Cross-Module Continuity

### 4.1 Record Hubs

Major entities must be built as **record hubs**, not isolated forms.

The following views must use a hub pattern:
- student
- household
- staff member
- class
- application
- invoice
- payroll run
- approval request

**Record hub pattern**:
- page header with title, subtitle, key status pills, reference number, and primary actions
- overview strip with key metrics and warnings
- section tabs or subsections for related data
- right-hand or lower audit / timeline / activity area where appropriate
- cross-links to related records

### 4.2 Minimum Hub Content

**Student hub** should surface:
- student status
- class / year group
- household summary
- attendance trend / alerts
- active fee or balance snapshot
- medical/allergy flags if applicable
- recent communications
- report cards / gradebook summary
- pending actions such as `needs_completion`

**Household hub** should surface:
- linked students and parents
- communication preferences
- emergency contact completeness
- open invoices and recent payments
- admissions conversion notes if relevant
- parent portal readiness / restrictions

**Class hub** should surface:
- assigned teacher(s)
- today’s session state
- attendance completion status
- gradebook activity
- timetable summary
- student roster count

**Invoice hub** should surface:
- lifecycle status
- balance and allocation summary
- payment history
- refunds / write-offs if present
- printable actions
- audit trail

**Payroll run hub** should surface:
- draft/finalised status
- period summary
- snapshot timestamp
- entry completeness state
- approvals if applicable
- export / payslip status

### 4.3 Breadcrumbs and Context Links

Detail pages must use breadcrumbs and linked context to make cross-module movement easy. Users should be able to move naturally from a student to a household, from a household to invoices, from a class to attendance, from an approval to the underlying action, and back again.

### 4.4 Hover Preview Cards

When hovering over any linked entity name — a student name in a table row, a household reference on an invoice, a teacher name on a schedule, a class name in an attendance view — the system must show a **floating preview card** after a 300ms hover delay.

This is not a tooltip with plain text. It is a compact, styled mini record card containing:
- entity name and reference number
- current status badge
- 2–3 key facts (e.g., year group and homeroom for a student, billing parent and balance for a household, compensation type and current rate for a staff member)
- a subtle "Click to open" hint at the bottom

**Design**:
- surface bg, 16px radius, 1px border, subtle shadow (this is one of the few places shadow is permitted)
- max-width 280px
- appears above or below the trigger text, avoiding viewport edges
- dismiss on mouse leave with 150ms fade-out
- does NOT appear on touch devices — touch triggers navigation directly
- data is fetched on hover (or prefetched if already in cache) — show a micro-skeleton if loading takes >200ms

This pattern saves users from constantly clicking into records to check one fact. It is especially valuable in tables where a principal is scanning 30 students and needs to glance at household or balance information without leaving the list.

---

## 5. Dashboards

Dashboards must be **role-sharp**, not merely role-aware. Each dashboard should answer: **what does this person need to do in the next 10 minutes?**

### 5.1 Dashboard Pattern

Each dashboard should contain:
- **personalised greeting header**: "Good morning, Ahmed" (time-of-day aware: morning/afternoon/evening) with a one-line contextual operational summary underneath — e.g., "3 approvals waiting · payroll draft open for March · 2 overdue invoices." This line is dynamic, assembled from the user's pending actions across modules. It changes throughout the day. This is not a static welcome message — it is a personalised operational briefing.
- key metrics or summary cards
- urgent tasks / action queue
- exception panels
- a small amount of trend or historical context
- recent activity or quick links

The first viewport should always prioritize actionability over general reporting.

### 5.2 Teacher Dashboard

Must prioritize:
- today’s classes
- attendance still pending
- assessments awaiting grading
- recently returned / locked assessments
- alerts affecting students in today’s classes

### 5.3 School Admin / Principal Dashboard

Must prioritize:
- admissions awaiting review or conversion
- attendance exceptions
- fee collection risk / overdue totals
- approval items requiring action
- payroll cut-off or draft completeness alerts
- unresolved compliance or configuration issues

### 5.4 Finance Dashboard

Must prioritize:
- overdue total and ageing summary
- unallocated payments
- invoices awaiting issue approval
- refunds needing attention
- payment reconciliation warnings
- payroll actions if role permits

### 5.5 Parent Dashboard

Must prioritize:
- linked students
- today’s attendance or latest attendance visibility if enabled
- current balances due
- messages and announcements
- published report cards / transcripts if enabled
- required actions such as profile or communication preference completion

### 5.6 Platform Admin Dashboard

English only. Prioritize:
- tenant provisioning and domain verification states
- suspended/archived tenant issues
- platform alerts and failed jobs
- branding/setup completeness
- infrastructure or integration health where exposed in UI

---

## 6. Tables and Dense Data

Tables are core product surfaces and must be treated as premium workflow components.

### 6.1 Base Table Pattern

- Container: surface bg, 16px radius, 1px border, overflow hidden
- Header row: surface-secondary bg, 12px text, weight 500, text-tertiary colour, uppercase
- Body rows: 14px text, text-secondary, 1px bottom border between rows
- Row hover: surface-secondary bg (light mode), slightly lighter fill (dark mode)
- Selected row: emerald-50 bg
- Pagination: bottom of table, 12px text, pill-shaped page buttons

### 6.2 Required Table Capabilities

Admin-heavy tables should support as appropriate:
- sticky header
- sticky first column where useful
- saved filters
- saved views
- per-role default columns
- sortable columns
- clear filter chips
- row selection with batch actions
- row expansion for secondary details
- export respecting current filter state when the relevant feature exists
- keyboard-friendly focus order

### 6.3 Table Action Design

- Common row actions should be inline if they are frequent and safe
- Less common or destructive actions should live in overflow menus
- Bulk actions must show a preview/summary before applying destructive or high-impact changes

### 6.4 Mobile Table Behaviour

On mobile, dense tables should switch to card-list representation when horizontal scrolling would materially harm comprehension.

### 6.5 Empty, Filtered, and Error States

Tables must distinguish between:
- no records exist
- no results match current filters
- data failed to load
- user lacks access

Each state needs different wording and recovery guidance.

---

## 7. Forms, Wizards, and Data Entry

The product includes high-risk forms: admissions conversion, finance operations, payroll runs, approvals, imports, and settings. Forms must be forgiving, explicit, and confidence-building.

### 7.1 Base Form Styling

- Inputs: 40px height, 12px radius, 1px border, 14px text
- Focus ring: 2px emerald-500 with 2px offset
- Labels: 13px, weight 500, text-primary, 6px margin-bottom
- Helper text: 12px, text-tertiary, 4px margin-top
- Error state: danger border, danger helper text
- Required indicator: emerald-500 asterisk after label text
- Labels always above fields

### 7.2 Long-form UX Requirements

Long forms and multi-step flows must support:
- sticky validation summary when there are blocking errors
- section-level completion indicators
- draft preservation while navigating
- auto-save drafts where operationally safe
- inline duplicate warnings before final submit
- explicit review step for sensitive changes
- visible distinction between required and optional sections

### 7.3 Form Behaviour Rules

- Avoid modals for complex forms — use full-page views instead
- Use modals only for confirmations, quick edits, or simple destructive flows
- Never rely only on toast notifications for form errors
- Validation must be visible both inline and in a summary for long forms
- Forms must preserve entered values on server-side validation failures whenever possible

### 7.4 Compare and Review Patterns

For sensitive changes, use compare-before-save patterns.

Examples:
- current vs proposed billing parent
- current vs proposed grade override
- payroll snapshot before finalisation
- refund summary before confirmation
- admissions conversion mapping before conversion submit

### 7.5 Import Flows

CSV or batch import screens must support:
- file selection and template guidance
- pre-processing validation summary
- row-level errors
- downloadable or visible error detail
- clear “matched / unmatched / skipped” breakdown
- explicit confirmation before commit

---

## 8. Exception Handling and Problem-State UX

This product must handle non-happy paths gracefully. Problem states are core UX.

### 8.1 Required Exception UX Pattern

When an exception occurs, show:
- what happened
- why it happened
- what the user can do next
- whether there is any data risk or downstream impact
- who can resolve it if the current user cannot

### 8.2 Exception Surfaces

Use:
- inline banners for page-level blocking or warning states
- resolution drawers/panels for recoverable exceptions
- timeline entries for audit-significant failures
- persistent cards on dashboards for unresolved operational issues

### 8.3 Must-have Exception Workflows

The UI must give first-class handling for at least:
- attendance not submitted
- attendance closure override
- retroactive closure conflict
- admissions conversion blocked due to missing required fields
- ambiguous household linking
- invoice issue approval required
- approval execution failed after retries
- refund blocked by guard rails
- payroll draft stale vs changed attendance inputs
- print/render template missing or failed

### 8.4 Wording Standard

Do not use vague wording like “Something went wrong” alone. Pair every error with grounded guidance.

Bad: “Refund failed.”  
Good: “Refund could not be completed because this payment has already been fully reversed. Review payment allocations or ask a supervisor to override.”

---

## 9. Trust, Audit, and Sensitive Actions

Confidence is part of UX.

### 9.1 Sensitive Action Patterns

Before high-impact actions, show a pre-flight summary. This applies to actions such as:
- issuing invoices in batch
- finalising payroll
- approving or rejecting admissions
- posting refunds
- grade overrides
- changing billing or communication-critical records

### 9.2 Confirmation Design

A good confirmation dialog or review page should include:
- action title
- affected record count or record name
- key consequences
- any irreversible effect
- primary action label that names the action exactly

Examples:
- “Issue 143 draft invoices”
- “Finalise payroll for March 2026”
- “Approve refund of €450.00”

### 9.3 Undo and Reversibility

Where safe, support undo. Where not safe, explicitly say so.

### 9.4 Audit Visibility

Show “last changed by / when” in the right places. Audit visibility is especially important on:
- finance records
- payroll runs
- applications
- student profile corrections
- settings changes
- approval requests

### 9.5 Snapshot Visibility

Any screen based on immutable or frozen data must expose the snapshot point clearly.

Examples:
- “Payroll snapshot frozen on 31 Mar 2026 at 18:42”
- “Published report card revision 2”
- “Invoice status derived 2 minutes ago” when relevant

---

## 10. Perceived Performance and Loading Behaviour

Users should feel the product is responsive even when complex work is happening.

### 10.1 Loading Rules

- Never use a full-page spinner. Always use skeletons that hint at incoming layout.
- Keep page shell stable while inner content loads.
- Prefetch likely next screens where practical.
- Prefer progressive disclosure over blocking entire pages.

### 10.2 Skeleton Patterns

- **Page load**: full-page skeleton matching layout
- **Table load**: 5 skeleton rows at realistic widths
- **Button loading**: replace label with a 16px spinner, keep width stable
- **Card load**: pulsing rounded rectangle matching final geometry

**Staggered appearance**: Skeleton elements must not appear all at once. Stagger their entrance with 50ms delays — first stat card, then second, then third, then fourth, then table skeleton rows cascade in. This creates a subtle top-down cascade that feels intentionally choreographed rather than "everything rendered simultaneously." The stagger applies to the skeleton placeholders, not the real data — real data replaces skeletons as it arrives, which may be in a different order. Respect `prefers-reduced-motion` — when set, all skeletons appear instantly without stagger.

### 10.3 Stale Data and Background Refresh

When background refresh occurs:
- avoid jarring reflow
- use subtle stale indicators if needed
- preserve user context and scroll position

### 10.4 Optimistic Behaviour

Use optimistic updates only where safe and reversible. Do not use them for high-risk finance/payroll state changes without strong reconciliation patterns.

---

## 11. Bilingual, RTL, and Mixed-Direction UX

### 11.1 Core Rules

All styling rules from the code standards still apply: logical CSS only, no physical left/right positioning.

Additional UI rules:
- Sidebar renders on the right in RTL
- Inline-start accent borders must flip automatically
- Search and text fields align by content and locale appropriately
- Table alignment must respect reading direction and content type
- Number axes stay LTR even in Arabic contexts
- Numbers remain western `0–9` in both locales

### 11.2 Native-feeling Arabic UX Standard

Arabic must not feel like a mirrored English interface.

Required expectations:
- Arabic labels and microcopy should sound natural to school users
- Mixed text (Arabic with names, numbers, phone numbers, IDs, and dates) must render cleanly
- PDF and printable outputs should look intentionally designed in both locales
- Empty states, error messages, confirmations, and helper text should all have Arabic-first review, not literal translation only

### 11.3 Typography Rules

**Font family**: Plus Jakarta Sans for Latin UI. Fallback: `system-ui, -apple-system, sans-serif`.

**Arabic**:
- use system Arabic fonts for Arabic locale
- do not load a separate Arabic web font in Phase 1 unless later testing proves necessary

**Scale**:

| Element | Size | Weight | Line Height | Letter Spacing |
|---------|------|--------|-------------|----------------|
| Page title (h1) | 24px | 600 | 1.3 | -0.025em |
| Section heading (h2) | 18px | 600 | 1.4 | -0.015em |
| Card heading (h3) | 15px | 600 | 1.4 | 0 |
| Body text | 14px | 400 | 1.6 | 0 |
| Small text | 13px | 400 | 1.5 | 0 |
| Caption / label | 12px | 500 | 1.4 | 0 |
| Section label (sidebar) | 11px | 600 | 1.3 | 0.05em |
| Stat value (large number) | 28px | 600 | 1.2 | -0.02em |

Monospace for IDs, codes, and reference numbers: `JetBrains Mono` or system monospace, 13px.

---

## 12. Visual Design System

### 12.1 Colour Palette

#### Primary — Emerald

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `primary-50` | `#ECFDF5` | — | Active sidebar item bg, badge bg, light fills |
| `primary-100` | `#D1FAE5` | — | Hover states, secondary button bg |
| `primary-500` | `#10B981` | `#10B981` | Links, interactive elements, chart accents |
| `primary-600` | `#059669` | `#34D399` | Active borders, sidebar accent, icon active |
| `primary-700` | `#047857` | `#6EE7B7` | Primary button bg, strong emphasis |
| `primary-800` | `#065F46` | — | Primary button hover |
| `primary-900` | `#064E3B` | — | Darkest text on primary fills |

#### Neutral — Warm Stone

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `background` | `#FEFDFB` | `#0C0A09` | Page background |
| `surface` | `#FFFFFF` | `#1C1917` | Cards, sidebar, modals |
| `surface-secondary` | `#F5F5F4` | `#292524` | Stat cards, table headers, section fills |
| `border` | `#E7E5E4` | `#44403C` | Default borders |
| `border-strong` | `#D6D3D1` | `#57534E` | Hover borders, dividers |
| `text-primary` | `#1C1917` | `#FAFAF9` | Headings, primary content |
| `text-secondary` | `#78716C` | `#A8A29E` | Descriptions, secondary info |
| `text-tertiary` | `#A8A29E` | `#78716C` | Hints, timestamps, section labels |

#### Semantic

| Token | Light Fill | Light Text | Dark Fill | Dark Text | Usage |
|-------|-----------|-----------|-----------|-----------|-------|
| `success` | `#ECFDF5` | `#065F46` | `#064E3B` | `#6EE7B7` | Active status, pass, confirmed |
| `warning` | `#FFFBEB` | `#92400E` | `#78350F` | `#FCD34D` | Overdue, pending, attention needed |
| `danger` | `#FFF1F2` | `#9F1239` | `#881337` | `#FDA4AF` | Failed, rejected, destructive actions |
| `info` | `#EFF6FF` | `#1E40AF` | `#1E3A5F` | `#93C5FD` | Informational badges, links, help text |

#### Chart Colours

```
Emerald:  #10B981
Amber:    #F59E0B
Rose:     #F43F5E
Blue:     #3B82F6
Purple:   #8B5CF6
Teal:     #14B8A6
Orange:   #F97316
```

Use in this order for multi-series charts. Single-series charts use emerald only.

#### School Branding Accent

Each school tenant has `primary_color` and `secondary_color` stored in `tenant_branding`. These are NOT used for functional UI — the emerald system palette handles all interactive elements, buttons, badges, and states. However, the school's own brand colour appears as a subtle identity accent in the following places:

- **Sidebar logo area**: The school logo container uses the school's `primary_color` as a tinted background at 8% opacity, giving the sidebar header a warm, "this is our school" feel
- **Login page**: The school's `primary_color` appears as a gradient accent on the login card or page background — enough to identify the school before the user has logged in
- **Top bar school name**: If displayed, the school name can use the `primary_color` as text colour (with contrast check — fall back to text-primary if the brand colour fails WCAG AA)
- **PDF/printable headers**: Invoices, payslips, receipts, and report cards use the school's logo and `primary_color` in headers as defined by the Puppeteer templates

**Rules**:
- The brand accent must never replace the emerald system palette for any interactive element
- Brand colours are per-tenant and loaded from the resolved tenant context
- If a school has not configured brand colours, these accent areas use the default emerald palette
- The brand accent must work in both light and dark mode — use the colour at low opacity (8–12%) for backgrounds, or at full saturation for small text/borders only after contrast checking

### 12.2 Shape System

| Element | Radius | Tailwind Class |
|---------|--------|---------------|
| Buttons | 9999px (pill) | `rounded-full` |
| Inputs / selects | 12px | `rounded-xl` |
| Cards | 16px | `rounded-2xl` |
| Modals / dialogs | 20px | `rounded-[20px]` |
| Badges / pills | 9999px | `rounded-full` |
| Table containers | 16px | `rounded-2xl` |
| Sidebar items (active) | 8px | `rounded-lg` |
| Avatars | 9999px (circle) | `rounded-full` |
| Tooltips | 8px | `rounded-lg` |

### 12.3 Borders and Shadow Rules

- Default border: 1px using `border`
- No double borders
- Dividers inside cards should be inset
- Shadows should be minimal and used sparingly
- Toasts and overlays may use the clearest visual lift

### 12.4 Spacing

**Base unit**: 4px. All spacing values are multiples of 4.

| Context | Value | Tailwind |
|---------|-------|---------|
| Page padding (content area) | 32px | `p-8` |
| Card internal padding | 24px | `p-6` |
| Between cards / major sections | 24px | `gap-6` |
| Between form fields | 20px | `gap-5` |
| Between stat cards (grid) | 16px | `gap-4` |
| Table cell padding | 12px vertical, 16px horizontal | `py-3 px-4` |
| Badge internal padding | 4px vertical, 12px horizontal | `py-1 px-3` |
| Section label top margin | 24px | `mt-6` |

**Content max-width**: 1280px.  
**Forms and detail views max-width**: 720px by default unless a wider operational layout is justified.

---

## 13. Core Components

### 13.1 Buttons

| Variant | Style |
|---------|-------|
| Primary | Emerald-700 bg, white text, pill shape. Hover: emerald-800. Active: scale(0.98). |
| Secondary | Emerald-50 bg, emerald-700 text, pill shape. Hover: emerald-100. |
| Outline | Transparent bg, border-strong border, text-primary. Hover: surface-secondary bg. |
| Destructive | Danger fill bg, danger text colour. Hover: darkened. |
| Ghost | Transparent bg, text-secondary. Hover: surface-secondary bg. No border. |

All buttons:
- 36px height default
- 32px height compact/table rows
- 44px height hero/CTA
- minimum 16px horizontal padding
- always use disabled state with reduced opacity and `cursor-not-allowed`

### 13.2 Cards

- Surface background, 16px radius, 24px padding
- Optional header with title, subtitle, and light divider treatment
- Cards on `surface-secondary` use no border where fill separation is enough

### 13.3 Stat Cards

- Surface-secondary bg
- 16px radius
- 20px padding
- Label: 12px uppercase, text-tertiary
- Value: 28px, weight 600, text-primary
- Trend indicator optional
- Use as quick signal, not as a replacement for action panels

**Animated value transitions**: When a stat card loads or its data refreshes, the numeric value must count up from 0 to its final value over 400ms with an `ease-out` curve. Percentages count up as percentages, currency values count up as currency (with proper formatting throughout the animation). This applies to all stat cards across all dashboards. The animation should respect `prefers-reduced-motion` — when set, values appear instantly without counting.

### 13.4 Badges / Status Pills

- Pill shape, 12px, weight 500
- Use semantic colours consistently
- Optional dot indicator
- Must map to actual system state semantics, not arbitrary colour preference

**Inline status transitions**: When a record's status changes while the user is viewing it (e.g., invoice goes from draft to issued, payroll goes from draft to finalised, application moves to accepted), the badge must transition smoothly — the old colour and label fade out over 200ms and the new colour and label fade in. The user should visually witness the change happening, especially on sensitive records where knowing "this just changed" builds trust. Never swap status badges instantly without transition.

### 13.5 Modals / Dialogs

- Backdrop: black at 40% opacity
- Modal: surface bg, 20px radius, 32px padding, max-width 520px standard or 720px wide
- Use for confirmations, quick edits, and destructive actions only
- Complex workflows must use full-page or side-panel surfaces

### 13.6 Drawers / Side Panels

Add a reusable drawer pattern for:
- quick record preview
- exception resolution
- audit detail
- timeline drill-down
- related record context without full-page navigation

### 13.7 Timeline / Activity Panel

Create a reusable activity timeline component for records where history matters.

Expected content:
- event label
- timestamp
- actor
- status badge when applicable
- expandable detail payload for audit-significant actions

### 13.8 Completeness Checklist Component

Reusable checklist component for setup and incomplete records.

Use cases:
- tenant setup
- household needs completion
- admissions conversion review
- parent onboarding readiness

---

## 14. Notifications, Empty States, and Feedback

### 14.1 Toast Notifications

- Surface bg, 16px radius, 1px border, subtle shadow
- Left-side semantic accent bar
- Auto-dismiss: 5 seconds for success
- Persistent for errors requiring awareness
- Stack up to 3
- Do not use toasts as the sole place where critical information appears

### 14.1b Workflow Completion Moments

When a significant operational workflow completes successfully, show a brief **success banner** that is more prominent than a toast but less intrusive than a modal. This applies to:
- payroll finalised
- all attendance submitted for the day
- a batch of invoices issued
- fee generation wizard completed
- bulk import completed without errors
- all approvals in queue resolved

**Design**:
- full-width banner across the top of the content area (below the top bar, above page content)
- emerald-50 background with a subtle left-to-right emerald gradient that fades to transparent
- emerald-700 text, weight 500, with a checkmark icon
- message is specific: "Payroll for March 2026 finalised — 58 payslips generated" not just "Success"
- auto-dismisses after 4 seconds with a smooth height collapse (200ms)
- dismissible via a close button
- no confetti, no animation beyond the entrance and exit transitions
- respect `prefers-reduced-motion`

This is the difference between a tool that processes your input and a system that acknowledges your work.

### 14.2 Empty States

Every list, table, and dashboard section must have an empty state.

Pattern:
- centred in content area
- subtle Lucide icon or simple illustration treatment
- heading, description, optional CTA
- wording must teach the next step when appropriate

**Intelligent context-aware empty states**: Empty states must be role-aware and workflow-aware. They do not just say "No records yet" — they explain what needs to happen and who needs to do it.

Examples:
- A principal seeing an empty attendance screen: "No attendance recorded today — classes start at 8:00 AM. Teachers will submit attendance for each session."
- A finance user seeing an empty invoice list: "No invoices this term — create fee assignments first, then run the fee generation wizard." with a CTA button: "Go to fee assignments"
- A teacher seeing an empty gradebook: "No assessments created for this class yet." with a CTA: "Create first assessment"
- A parent seeing no announcements: "No announcements from the school yet. You'll see updates here when they're published."
- An admin seeing an empty admissions list: "No applications received yet. Share the public admissions page to start accepting applications." with a CTA: "View admissions page"

The empty state teaches the workflow, not just the feature. Each CTA links to the logical next step in the workflow for that role.

### 14.3 Help and Inline Guidance

Use helper text, contextual tips, and explanatory copy where users may hesitate. Prefer inline guidance over hidden documentation links.

---

## 14b. Print and PDF Preview

The system generates payslips, invoices, receipts, report cards, transcripts, and household statements. All of these share a single, consistent preview and export pattern.

### 14b.1 Individual Document Preview

**Trigger**: User clicks "Preview" or "View" on any printable document.

**Design**: Full-screen modal overlay with dark backdrop (black at 60% opacity — slightly darker than standard modals to create a "viewing room" feel).

**Layout**:
- toolbar pinned to the top: surface bg, 56px height, contains document title on the left and action buttons on the right
- action buttons: "Download PDF" (primary), "Print" (secondary), "Close" (ghost/X button)
- document rendered on a white "paper" surface centred in the viewport
- paper surface: white bg regardless of dark mode (it represents a physical printed page), subtle shadow for depth, max-width 720px (A4 proportion), auto-height based on content
- document content is rendered from the `snapshot_payload_json` using the locale-specific template
- school logo, name, and brand colours appear in the document header exactly as they will print
- generous dark space around the paper surface to focus attention

**Behaviour**:
- `Escape` key or backdrop click closes the preview
- `Ctrl+P` / `⌘P` triggers the browser print dialog with the document content
- the document must render before the modal opens — show a loading state in the modal if rendering takes >500ms

### 14b.2 Mass Export

**Trigger**: User clicks "Export all payslips" (or equivalent for batch invoices/report cards) from a list or dashboard.

**Design**: NOT a modal. Instead, show inline progress in the triggering button or a dedicated progress card.

**Flow**:
1. Button changes to loading state: "Generating 0 of 58 payslips..."
2. Progress updates in real-time as the BullMQ job processes: "Generating 34 of 58 payslips..."
3. On completion: button changes to "Download PDF" (primary style) — clicking downloads the consolidated PDF
4. The consolidated PDF contains all documents with page breaks between each, ready for a single print job
5. If generation fails partway: show "Generated 34 of 58 — 24 failed" with an error detail link and a "Retry failed" button

**Rules**:
- the user must be able to navigate away during generation and return to find the download ready (persist the job status)
- mass export is always a background job (BullMQ), never a synchronous operation
- the downloaded filename includes context: `payslips-march-2026-nhqs.pdf`, `invoices-term1-2025-mdad.pdf`

---

## 15. Responsive Behaviour

| Breakpoint | Width | Behaviour |
|-----------|-------|-----------|
| Desktop | ≥1024px | Full sidebar visible, 4-column stat grids, full tables |
| Tablet | 768–1023px | Sidebar collapsed to icons by default, 2-column grids, tables scroll or simplify |
| Mobile | <768px | Sidebar hidden, 1-column layout, cards stack, complex tables convert to card lists |

Mobile is a responsive web target, not a separate native design language. Preserve clarity over density.

---

## 16. Motion and Interaction

- 150ms for micro-interactions
- 200ms for transitions like modals, toasts, sidebar collapse
- 300ms maximum for page-level transitions
- Use `ease-out` for enters, `ease-in` for exits
- Respect `prefers-reduced-motion`
- No dramatic motion or decorative page slides

Interaction polish should support comprehension, not spectacle.

### 16.1 Page Transitions and Shell Stability

When navigating between pages, the sidebar and top bar must NEVER re-render, flash, or visually reset. The app shell (sidebar + top bar) is persistent and rock-solid. Only the content area transitions.

**Content area transition**: 150ms opacity crossfade — outgoing content fades to 0, incoming content fades from 0 to 1. No slide, no scale, no dramatic movement. Scroll position resets to top on navigation. The shell stays exactly where it is.

This is the single most important detail for making a web application feel like a native app. If the sidebar flickers on navigation, the entire product feels cheap regardless of how polished the individual screens are.

**Implementation**: Use Next.js App Router layouts to keep the shell in a layout component that wraps the page slot. The layout never unmounts during client-side navigation. Page transitions happen inside the slot only.

---

## 17. Dark Mode

**Implementation**: CSS custom properties toggled by a class on `<html>`, using `next-themes`.

Rules:
- every colour token must exist in both modes
- never hardcode colours in components
- logos are not inverted
- charts use the same approved chart palette
- dark mode should preserve hierarchy and readability, not merely invert surfaces

---

## 18. Search, Saved Views, and Power-user Features

To move the system beyond “clean admin app” into “excellent daily tool,” implement the following where relevant:
- command palette
- recent items
- pinned items
- saved table views
- persistent filters
- role-specific defaults
- keyboard-friendly row selection and navigation
- fast-access create actions

These features are not optional polish. They are part of the target UX quality.

### 18.1 Keyboard Shortcut Hints

Frequent action buttons must teach their keyboard shortcuts organically through hover hints.

**Behaviour**: When hovering over a major action button for 600ms, a small keyboard shortcut badge appears adjacent to the button (not inside it — beside it or below it). The badge uses surface-secondary bg, text-tertiary text, 10px monospace font, 4px vertical / 6px horizontal padding, rounded-md.

**Shortcuts to hint**:
- "Create student" → `⌘N` / `Ctrl+N`
- "Save" → `⌘S` / `Ctrl+S`
- "Search" → `⌘K` / `Ctrl+K`
- "Cancel" / "Close" → `Esc`
- "Submit attendance" → `⌘Enter` / `Ctrl+Enter`
- "Next step" in wizards → `⌘Enter` / `Ctrl+Enter`

**Rules**:
- Only show hints on desktop (≥1024px) — never on touch devices
- Show platform-appropriate modifier: `⌘` on macOS, `Ctrl` on Windows/Linux (detect via `navigator.platform` or `navigator.userAgentData`)
- Do not show hints on every button — only on primary actions that users perform frequently within a module
- The hint badge has a 150ms fade-in and fades out instantly on mouse leave
- Respect `prefers-reduced-motion` — when set, hint appears instantly without fade

---

## 19. Onboarding and First-use Experience

The product must orient users quickly.

### 19.1 First-run Patterns

Support:
- setup checklists for admins
- contextual empty-state CTAs
- progressive disclosure in complex modules
- sensible defaults
- clear difference between required setup and optional refinement

### 19.2 Role-specific Guidance

- teachers should understand today-first workflows quickly
- principals should see action queues and configuration completeness
- finance users should understand overdue, unallocated, and approval states clearly
- parents should see only relevant, reassuring, low-clutter information

---

## 20. Module-specific UX Guidance

### 20.1 Admissions

- application list must support status, ambiguity, and conversion readiness views
- conversion screen must be an editable, pre-populated review form with validation summary
- ambiguous household matching must surface side-by-side comparison and a deliberate choice

### 20.2 Attendance

- attendance marking screen must be fast and interruption-resistant
- closure and override states must be explicit
- exception dashboard should prioritize “needs action now” over general metrics

### 20.3 Gradebook

- grade entry should optimise for speed, but never hide lock state, missing-grade policy, or snapshot logic
- report card publication/revision must visibly distinguish draft, published, and revised states

### 20.4 Finance

- invoices, allocations, refunds, and write-offs must feel highly trustworthy
- every finance action should show clear impact on status and balance
- unallocated funds and blocked refund states must be obvious and actionable

### 20.5 Payroll

- draft vs finalised state must be unmistakable
- snapshot/freeze timing must be visible
- stale draft inputs should surface with clear refresh guidance
- manual adjustment pathways must feel controlled, not improvised

### 20.6 Communications

- channel preference and fallback behaviour should be transparent where surfaced to staff
- message history should make delivery channel and status clear

### 20.7 Website / CMS

- editing should remain calm and non-technical
- preview and publish states should be clearly separated

---

## 21. Design-system Implementation Notes

The shared component library should include reusable patterns for:
- app shell
- command palette
- stat card
- table wrapper and toolbar
- saved view bar
- record hub header
- audit timeline
- status banner
- validation summary
- compare-before-save panel
- completeness checklist
- empty state
- loading skeletons
- detail drawer
- confirmation surfaces

The goal is consistency across modules and faster implementation without UI drift.

---

## 22. Acceptance Standard for Frontend Work

A frontend implementation is not complete just because it matches the colours and spacing.

A screen is complete only when it:
- respects role and permission context
- works in English and Arabic
- handles empty, loading, success, warning, and error states
- makes the next action obvious
- preserves trust on sensitive operations
- links correctly to related records where relevant
- behaves coherently across responsive breakpoints
- uses design-system patterns rather than ad hoc UI

If a screen looks polished but fails under operational pressure, it is not done.

---

## 23. Phase-aware Implementation Priority

### Must land in the main build, not deferred polish
- command palette foundation
- record hub pattern for major entities
- role-sharp dashboards
- exception-state surfaces
- validation summaries for long forms
- saved filters / persisted table preferences for core admin tables
- bilingual/RTL correctness across all role shells
- trust-building confirmations and snapshot visibility for finance/payroll/approvals

### Can follow shortly after core implementation if sequencing requires
- pinned records
- saved views beyond core modules
- richer timeline drill-downs
- more advanced onboarding helpers
- additional keyboard shortcuts beyond command palette

---

## 24. Final Standard

This UI should feel like a premium operating system for schools, not a beautiful spreadsheet wrapper. Calm visual design matters, but the real quality marker is whether users can move quickly, recover from problems, and trust what the system is doing.

That is the bar.
