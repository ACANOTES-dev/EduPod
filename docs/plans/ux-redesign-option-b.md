# UX Redesign — Option B: "The Dock & Bento"

**Date:** 27 March 2026
**Status:** Draft concept — not approved
**Visual mockup:** `.superpowers/brainstorm/8072-1774644088/content/option-b.html`

---

## Philosophy

Same unified layers as Option A (C's shell + A's spatial home + B's depth), but with a fundamentally different execution:

- **Floating dock** at the bottom instead of a top hub bar — app-like, spatial, macOS-inspired
- **Bento grid** instead of uniform zone cards — editorial layout with visual hierarchy
- **Horizontal tabs** inside modules instead of a sidebar — no sidebar anywhere in the entire app

The vibe: Native app, not web app. Apple meets Arc. More bold, more spatial.

---

## Layer 1: The Floating Dock (Global Navigation)

A floating dock pinned to the bottom of the viewport, always visible on every page. Inspired by macOS Dock.

**Structure:**

```
                         ┌──────────────────────────────────────────────────┐
                         │  🏠  👥  📚  ⚡  │  💰  📊  ⚙️  │  🔍          │
                         └──────────────────────────────────────────────────┘
```

**Specifications:**

- **Position:** Fixed bottom, centred horizontally, 20px from bottom edge
- **Background:** `rgba(28, 25, 23, 0.92)` with `backdrop-filter: blur(20px)` — frosted glass effect
- **Shape:** Pill-shaped container, 20px border-radius
- **Shadow:** `0 8px 32px rgba(0,0,0,0.25)` + 1px white border at 8% opacity for subtle edge definition
- **Padding:** 8px 12px internal
- **Items:** 44x44px touch targets, 12px border-radius, 6px gap between items
- **Icons:** Emoji-based, 20px font size
- **Hover effect:** Item scales to 1.15x and lifts 4px (`translateY(-4px)`) with `rgba(255,255,255,0.12)` background
- **Active item:** `rgba(16, 185, 129, 0.25)` background + 4px emerald dot below
- **Tooltips:** On hover, 11px label appears above the item in a dark pill
- **Separators:** 1px vertical line at 12% white opacity between logical groups
- **Badges:** Red notification badges (16px circle, 9px white text) on items with pending actions

**Dock items:**
| Icon | Label | Domain |
|------|-------|--------|
| 🏠 | Home | Spatial workspace dashboard |
| 👥 | People | Students, Staff, Households |
| 📚 | Learning | Classes, Subjects, Curriculum, Attendance, Gradebook, Report Cards |
| ⚡ | Operations | Admissions, Communications, Approvals, Scheduling, Rooms |
| — | separator | — |
| 💰 | Finance | All finance sub-modules |
| 📊 | Reports | Unified reports & analytics |
| ⚙️ | Settings | School settings, Behaviour config, Website, Roles |
| — | separator | — |
| 🔍 | Search | Triggers ⌘K command palette |

**Role-based dock filtering:**

- **Teacher:** 🏠 📚 📊 🔍 (4 items, no separator needed)
- **Parent:** 🏠 📚 💰 🔍 (4 items — Learning = child's grades/attendance, Finance = invoices)
- **Accounting:** 🏠 💰 📊 🔍
- **Front Office:** 🏠 👥 ⚡ 🔍

**Mobile behaviour:** Dock transforms into a standard iOS/Android-style bottom tab bar (same items, no hover effects, no blur). Already at the bottom, so the pattern is native to mobile.

---

## Top Bar (Minimal)

With navigation moved to the dock, the top bar is freed up to be purely contextual.

**Structure:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [Logo] EduPod          Home                      [Search ⌘K] [🔔] [👤] │
└──────────────────────────────────────────────────────────────────────────┘
```

When inside a module:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [Logo] EduPod      Finance › Invoices            [Search ⌘K] [🔔] [👤] │
└──────────────────────────────────────────────────────────────────────────┘
```

**Specifications:**

- **Height:** 52px
- **Background:** White, 1px border-bottom
- **Left:** Logo (28px emerald gradient square) + "EduPod" (15px, weight-700)
- **Centre:** Breadcrumb navigation — current location as text. Single level = page name. Nested = "Domain › Page" with `›` separator
- **Right:** Search pill (with ⌘K hint), notification bell, user avatar (32px)
- **Breadcrumb:** 13px, `#A8A29E` for parent, `#1C1917` weight-600 for current

---

## Layer 2: The Bento Workspace (Home Page)

When Home is active, the content area shows an editorial bento grid with differently-sized cards.

**Layout (top to bottom):**

### 2a. Greeting

```
Good morning, Ram
Thursday 27 March · NHQS
```

- Greeting: 24px, weight-700, `#1C1917`, -0.025em letter-spacing
- Subtext: 13px, `#78716C`

### 2b. Bento Grid

A CSS Grid layout with `grid-template-columns: repeat(12, 1fr)` and variable card sizes.

**Card sizes:**
| Name | Grid span | Use case |
|------|-----------|----------|
| Hero | 8 cols × 2 rows | Today's Priorities — the most important card |
| Tall | 4 cols × 2 rows | Live Stats snapshot (students, attendance %, revenue) |
| Standard | 3 cols × 1 row | Domain zone cards (People, Learning, Operations, Finance) |
| Wide | 6 cols × 1 row | Quick Actions, Behaviour & Wellbeing combined |

**Card specifications:**

- Background: White, 1px border `#E7E5E4`, 16px radius, 20px padding
- Hover: Border → `#10B981`, subtle shadow, translateY(-2px), 0.25s ease transition
- Each card has: emoji icon (36px tinted square, 10px radius), title (14px weight-600), subtitle (11px `#A8A29E`)

**Hero card — Today's Priorities:**

- Largest card, top-left position
- Contains a priority list with inline action buttons
- Each priority row: 8px coloured dot (urgent=red, warning=amber, info=blue), label text, meta tag (which domain), and a pill-shaped action button ("Review", "Approve", "View")
- Priority rows have 10px radius hover state, 12px padding, 6px margin-bottom
- Action button: `#ECFDF5` bg, `#059669` text, 12px weight-600, 999px radius
- Items are cross-module: aggregated from Finance (overdue invoices), Admissions (pending approvals), Wellbeing (survey deadlines), People (incomplete records), etc.
- Maximum 5 items; overflow shows "+N more" link

**Tall card — Live Stats:**

- Right of hero card
- Three vertically stacked stat blocks with tinted backgrounds (`#F5F5F4`, 12px radius)
- Each stat: value (28px weight-700), label (11px `#78716C`), trend line (11px, green for positive, red for negative)
- Stats shown: Total Students (with term delta), Attendance Today (with average comparison), Revenue This Month (with outstanding amount)

**Standard zone cards (4 in a row):**

- Same structure as Option A zone cards but smaller (3-col width)
- Emoji icon + title + 2-3 stat lines with dot indicators
- Alert stats in red with red dot
- Clicking navigates to the domain (same as clicking dock icon)

**Wide cards:**

- Quick Actions: 2×2 grid of action buttons (`#F5F5F4` bg, 10px radius, 12px weight-500). Hover → `#ECFDF5` bg, `#047857` text
- Behaviour & Wellbeing: Combined card with 2-column stat layout

**Teacher bento:** Hero card = "My Day" (today's classes, pending attendance). Stats = "My Classes", "Pending Grades". Zone cards = "Grading Queue", "Schedule"
**Parent bento:** Hero card = child cards (one per linked student). Stats = attendance + balance. Zone cards = "Announcements", "Report Cards"

### 2c. Gap

- 14px gap between all bento cards
- 28px top/bottom padding on home content
- 36px horizontal padding
- 80px bottom padding to clear the floating dock

---

## Layer 3: Module Navigation (Horizontal Tabs)

No sidebar anywhere. All module sub-navigation uses horizontal tabs.

**Layout:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Top bar (breadcrumb: Finance › Invoices)                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Finance                                          [Export] [+ New Invoice]│
│                                                                          │
│  Overview   Fee Structures   Invoices(24)   Payments(18)   Credits  ...  │
│  ─────────────────────────────────────────────────────────────────────── │
│                                                                          │
│  [Outstanding: €8,240]  [Collected: €12,400]  [Overdue: 3]  [Pending: 2]│
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Household    │ Invoice #    │ Amount  │ Status   │              │    │
│  │ Kelly Family │ INV-2603-14  │ €1,200  │ Overdue  │ View →      │    │
│  │ Thompson     │ INV-2603-13  │ €800    │ Overdue  │ View →      │    │
│  │ Evans Family │ INV-2603-12  │ €1,200  │ Paid     │ View →      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│                         [Floating Dock]                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

**Tab bar specifications:**

- Position: Below module title and action buttons
- Style: Underline tabs — 13px weight-500, `#78716C`, 2px transparent bottom border
- Active tab: `#047857` text, weight-600, 2px `#10B981` bottom border
- Hover: `#1C1917` text
- Counts: Inline pill badges (20px height, `#F5F5F4` bg, 11px weight-600). Active tab count: `#ECFDF5` bg, `#047857` text
- Tab bar has 1px `#E7E5E4` border-bottom beneath it
- Tabs are scrollable horizontally on mobile with fade hints at edges

**Tab grouping for large modules:**
For modules with 9+ sub-pages (Finance has 12), the tabs show the most important items with a "More ▾" dropdown at the end:

```
Overview   Invoices(24)   Payments(18)   Fee Structures   Reports   More ▾
                                                                     ├── Credit Notes
                                                                     ├── Refunds
                                                                     ├── Fee Assignments
                                                                     ├── Payment Plans
                                                                     ├── Discounts
                                                                     ├── Scholarships
                                                                     ├── Statements
                                                                     └── Audit Trail
```

**Which modules use tabs:**
All of them. No module gets a sidebar. Consistency across the entire platform.

| Module     | Visible tabs                                           | In "More" dropdown                                                                    |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Finance    | Overview, Invoices, Payments, Fee Structures, Reports  | Credit Notes, Refunds, Assignments, Plans, Discounts, Scholarships, Statements, Audit |
| Scheduling | Dashboard, Timetable, Substitutions, Preferences       | Auto-scheduler, Scenarios, Exams, Rooms, Breaks, Cover Reports                        |
| Behaviour  | Dashboard, Incidents, Students, Recognition, Analytics | Sanctions, Exclusions, Interventions, Appeals, Documents, Tasks                       |
| Payroll    | Runs, Staff, Compensation, Reports                     | Exports, Staff Attendance, Class Delivery                                             |
| People     | Students, Staff, Households                            | (no overflow)                                                                         |
| Learning   | Classes, Attendance, Gradebook, Report Cards           | Subjects, Curriculum Matrix, Assignments, Promotion                                   |
| Operations | Admissions, Communications, Approvals                  | Scheduling, Rooms                                                                     |
| Settings   | General, Behaviour, Roles                              | Closures, Website                                                                     |

---

## Command Palette (⌘K)

Same as Option A — always available via keyboard shortcut or the 🔍 dock item.

---

## Navigation Flow Summary

```
User lands → Home (bento workspace with priority hero + zone cards)
  ├── Click zone card OR dock icon → Domain page (tab navigation)
  │     ├── Visible tabs → Direct sub-page access
  │     └── "More ▾" dropdown → Less-frequent sub-pages
  ├── Click priority action button → Direct to specific item
  ├── Click quick action → Direct to create/action page
  └── ⌘K / 🔍 dock icon → Command palette → Jump anywhere
```

---

## Key Design Qualities

- **App-like feel:** Floating dock + minimal top bar = feels like a native application, not a website
- **No sidebar anywhere:** Full-width content on every single page across the entire platform
- **Visual hierarchy on home:** Bento grid makes priorities visually dominant. Not everything gets equal real estate — the important stuff is bigger.
- **Mobile-native by design:** Dock is already at the bottom (natural for mobile). Tabs scroll horizontally. Bento cards stack vertically. Zero adaptation needed.
- **Bold differentiation:** No school management software looks like this. The floating dock alone is a statement.
- **RTL-compatible:** Dock is centred (no directional concern). Bento grid uses CSS Grid (direction-agnostic). Tabs flow with reading direction.

---

## Key Differences from Option A

| Dimension        | Option A                               | Option B                                   |
| ---------------- | -------------------------------------- | ------------------------------------------ |
| Global nav       | Top hub bar (text pills)               | Floating dock (emoji icons, bottom)        |
| Top bar          | Hub bar IS the top bar                 | Minimal — logo + breadcrumb + search       |
| Home layout      | Uniform 4-col zone grid                | Bento grid with hero/tall/standard sizes   |
| Priority actions | Horizontal chip strip                  | Hero-sized card with inline action buttons |
| Module depth     | Contextual sidebar for complex modules | Horizontal tabs for ALL modules            |
| Overflow         | Sidebar groups sub-pages               | "More ▾" dropdown on tab bar               |
| Overall vibe     | Clean web app (Linear + ClassDojo)     | Native app (Apple + Arc)                   |
