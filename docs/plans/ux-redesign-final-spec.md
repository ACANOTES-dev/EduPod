# EduPod UX Redesign — Final Design Spec

**Date:** 27 March 2026 · Hub & sub-page patterns added 22 April 2026
**Status:** Implemented in wellbeing, safeguarding, settings, learning, communications, operations, people, finance, regulatory — patterns codified in §14–15
**Approved by:** Ramadan Duadu (Founder)
**Vision document:** `Plans/ux-redesign-vision.md`
**Visual mockups:** `.superpowers/brainstorm/` directory
**Pattern reference code:** `apps/web/src/app/[locale]/(school)/wellbeing/page.tsx` · `.../safeguarding/page.tsx` · `.../safeguarding/concerns/page.tsx` · `.../settings/page.tsx`

---

## Decisions Summary

| Decision   | Choice                            | Rationale                                                                                                      |
| ---------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Navigation | **Option C — The Morphing Shell** | Innovation with familiarity. Dark cinematic bar that expands into module sub-tabs. No sidebar anywhere.        |
| Font       | **Figtree**                       | Sweet spot between Plus Jakarta Sans's warmth and DM Sans's crispness. Friendly, modern, great at small sizes. |
| Theme      | **Warm Stone**                    | Warm brown undertones in both modes. Cream-tinted light mode. Warm grey dark mode. Human, not clinical.        |

---

## 1. Typography — Figtree

**Primary font:** Figtree (Google Fonts)
**Arabic fallback:** System fonts (as current)
**Monospace:** JetBrains Mono (for IDs, codes, reference numbers)

### Type Scale

| Token         | Size | Weight  | Line Height | Letter Spacing | Usage                                        |
| ------------- | ---- | ------- | ----------- | -------------- | -------------------------------------------- |
| `heading-1`   | 24px | 700     | 1.3         | -0.025em       | Page greetings, major headings               |
| `heading-2`   | 18px | 600     | 1.4         | -0.015em       | Section headings, card titles                |
| `heading-3`   | 15px | 600     | 1.4         | 0              | Sub-sections, dialog titles                  |
| `body`        | 14px | 400     | 1.6         | 0              | Primary content text                         |
| `body-medium` | 14px | 500     | 1.6         | 0              | Feed item titles, table cells with emphasis  |
| `small`       | 13px | 400     | 1.5         | 0              | Secondary text, descriptions                 |
| `caption`     | 12px | 400     | 1.4         | 0              | Timestamps, helper text, tertiary info       |
| `label`       | 11px | 600     | 1.3         | 0.05em         | Section labels, stat labels (uppercase)      |
| `stat-value`  | 28px | 700     | 1.2         | -0.02em        | Dashboard stat numbers                       |
| `hub-item`    | 13px | 500/600 | 1           | 0              | Navigation hub pills                         |
| `strip-tab`   | 12px | 500/600 | 1           | 0              | Module sub-strip tabs                        |
| `button`      | 13px | 600     | 1           | 0              | Button labels                                |
| `badge`       | 11px | 500     | 1           | 0              | Status pills, count badges                   |
| `mono`        | 13px | 400     | 1.4         | 0              | JetBrains Mono — IDs, invoice numbers, codes |

### Implementation

```css
@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap');

:root {
  --font-sans: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-arabic: 'Noto Sans Arabic', 'Segoe UI', system-ui, sans-serif;
}

[dir='rtl'] {
  font-family: var(--font-arabic);
}
```

---

## 2. Colour System — Warm Stone

All colours are defined as CSS custom properties. The `<html>` element gets a class (`light` or `dark`) that swaps the entire palette. **No hardcoded colour values in components. Ever.** This structurally prevents the white-text-on-light-mode bug.

### Light Mode Palette

| Token                 | Value                      | Usage                                                  |
| --------------------- | -------------------------- | ------------------------------------------------------ |
| `--background`        | `#FAF9F7`                  | Page background — warm off-white, not harsh pure white |
| `--surface`           | `#FFFFFF`                  | Cards, modals, popovers                                |
| `--surface-secondary` | `#F5F4F1`                  | Stat cards, table headers, section fills — warm tinted |
| `--surface-hover`     | `#F0EFEC`                  | Row hover, interactive element hover                   |
| `--border`            | `#E7E5E1`                  | Default borders — warm stone                           |
| `--border-strong`     | `#D6D3CE`                  | Hover borders, dividers                                |
| `--text-primary`      | `#1C1917`                  | Headings, primary content                              |
| `--text-secondary`    | `#6B6560`                  | Descriptions, secondary info — warm                    |
| `--text-tertiary`     | `#9C9590`                  | Hints, timestamps, section labels — warm               |
| `--bar-bg`            | `#1C1917`                  | Morph bar background                                   |
| `--bar-text`          | `rgba(250, 250, 249, 0.5)` | Inactive hub pills                                     |
| `--bar-text-active`   | `#6EE7B7`                  | Active hub pill text                                   |
| `--bar-active-bg`     | `rgba(16, 185, 129, 0.2)`  | Active hub pill background                             |
| `--strip-bg`          | `#292524`                  | Module sub-strip background                            |
| `--strip-text`        | `rgba(250, 250, 249, 0.4)` | Inactive strip tabs                                    |
| `--strip-text-active` | `#FAFAF9`                  | Active strip tab text                                  |
| `--strip-active-bg`   | `rgba(255, 255, 255, 0.1)` | Active strip tab background                            |

### Dark Mode Palette

| Token                 | Value                       | Usage                                       |
| --------------------- | --------------------------- | ------------------------------------------- |
| `--background`        | `#1A1816`                   | Page background — warm dark, not pure black |
| `--surface`           | `#242120`                   | Cards, modals — warm dark surface           |
| `--surface-secondary` | `#2D2926`                   | Stat cards, table headers — warm            |
| `--surface-hover`     | `#353130`                   | Row hover                                   |
| `--border`            | `#3A3532`                   | Default borders — warm dark                 |
| `--border-strong`     | `#4A4440`                   | Hover borders, dividers                     |
| `--text-primary`      | `#F5F0EB`                   | Headings — warm white, not harsh            |
| `--text-secondary`    | `#C8C0B8`                   | Descriptions — warm muted                   |
| `--text-tertiary`     | `#9C9590`                   | Hints, timestamps                           |
| `--bar-bg`            | `#12100E`                   | Morph bar — even darker than content        |
| `--bar-text`          | `rgba(245, 240, 235, 0.4)`  | Inactive hub pills                          |
| `--bar-text-active`   | `#6EE7B7`                   | Active hub pill text                        |
| `--bar-active-bg`     | `rgba(16, 185, 129, 0.2)`   | Active hub pill background                  |
| `--strip-bg`          | `#1E1B19`                   | Module sub-strip                            |
| `--strip-text`        | `rgba(245, 240, 235, 0.35)` | Inactive strip tabs                         |
| `--strip-text-active` | `#F5F0EB`                   | Active strip tab text                       |
| `--strip-active-bg`   | `rgba(255, 255, 255, 0.08)` | Active strip tab background                 |

### Semantic Colours (Same in Both Modes, Adjusted for Contrast)

| Token            | Light     | Dark                   | Usage                                        |
| ---------------- | --------- | ---------------------- | -------------------------------------------- |
| `--primary-50`   | `#ECFDF5` | `rgba(16,185,129,0.1)` | Light emerald fills                          |
| `--primary-500`  | `#10B981` | `#10B981`              | Links, accents, chart primary                |
| `--primary-600`  | `#059669` | `#34D399`              | Active borders, interactive                  |
| `--primary-700`  | `#047857` | `#6EE7B7`              | Primary button bg / Primary button bg (dark) |
| `--primary-800`  | `#065F46` | `#047857`              | Primary button hover                         |
| `--danger-bg`    | `#FFF1F2` | `rgba(244,63,94,0.1)`  | Error backgrounds                            |
| `--danger-text`  | `#9F1239` | `#FB7185`              | Error text                                   |
| `--danger-dot`   | `#F43F5E` | `#FB7185`              | Urgent indicators                            |
| `--warning-bg`   | `#FFFBEB` | `rgba(245,158,11,0.1)` | Warning backgrounds                          |
| `--warning-text` | `#92400E` | `#FBBF24`              | Warning text                                 |
| `--warning-dot`  | `#F59E0B` | `#FBBF24`              | Warning indicators                           |
| `--info-bg`      | `#EFF6FF` | `rgba(59,130,246,0.1)` | Info backgrounds                             |
| `--info-text`    | `#1E40AF` | `#60A5FA`              | Info text                                    |
| `--info-dot`     | `#3B82F6` | `#60A5FA`              | Info indicators                              |
| `--success-bg`   | `#ECFDF5` | `rgba(16,185,129,0.1)` | Success backgrounds                          |
| `--success-text` | `#065F46` | `#6EE7B7`              | Success text                                 |

### Button Colour Rules

Buttons **never** use hardcoded text colours. They always reference tokens:

```css
.btn-primary {
  background: var(--primary-700);
  color: var(--btn-primary-text); /* #fff in light, #fff in dark */
}
.btn-secondary {
  background: var(--primary-50);
  color: var(--primary-700);
}
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.btn-danger {
  background: var(--danger-bg);
  color: var(--danger-text);
}
```

**The invisible-button bug is eliminated by design.** Every text colour adapts with the theme because it references a CSS variable, never a hardcoded hex.

---

## 3. Navigation — The Morphing Shell

### 3a. The Morph Bar (Global Navigation)

A dark bar pinned to the top of every page. It has two modes: collapsed (on Home) and expanded (inside a module).

**Home mode — single bar (56px):**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [Logo] EduPod    Home  People  Learning  Operations  Finance  Reports  Settings    [Search ⌘K] [🔔] [👤]  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Module mode — bar + sub-strip (56px + 44px = 100px):**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [Logo] EduPod    Home  People  Learning  Operations  [Finance]  Reports  Settings    [Search ⌘K] [🔔] [👤]  │
├──────────────────────────────────────────────────────────────────────────┤
│  Overview   Fee Structures   [Invoices 24]   Payments 18   Credits   Refunds   Plans   Statements   Reports   Audit ▾  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Dashboard-style modules without a sub-strip (also acceptable):**

Some modules — most notably Admissions and other "hub-tile" landing pages —
present their navigation as a grid of cards on a dashboard rather than as
horizontal sub-strip tabs. This pattern is fully supported and should NOT
be reported as a redesign violation; it is a deliberate alternative to the
sub-strip and is preferred when a module's children are heterogeneous or
look better as feature tiles than as tabs (e.g. Admissions Hub: Ready to
Admit, Conditional Approval, Waiting List, Approved, Rejected, Form
Preview, Overrides Log, Settings).

The morph bar itself is unchanged — only the 44px sub-strip below it is
absent, and its place is taken by the dashboard's hub tiles. Both patterns
are first-class members of the morphing-shell family. A module page may
be marked-up with EITHER pattern; the choice is per-module and should be
recorded in the module's own spec, not policed at the shell level.

**Bar specs:**

- Background: `var(--bar-bg)` — `#1C1917` light / `#12100E` dark
- Logo: 28px emerald gradient square + "EduPod" in Figtree 15px weight-700
- Hub pills: Figtree 13px weight-500, `var(--bar-text)`, pill-shaped (border-radius: 999px)
- Active pill: `var(--bar-active-bg)`, `var(--bar-text-active)`, weight-600
- Hover: subtle lighten (`rgba(255,255,255,0.06)`)
- Search pill: frosted bg (`rgba(255,255,255,0.08)`), ghost text
- Notification bell: with red dot badge for unread count
- Avatar: 32px circle, emerald gradient (or user photo)

**Sub-strip specs:**

- Background: `var(--strip-bg)` — `#292524` light / `#1E1B19` dark
- Border bottom: 1px `#3f3b39` light / `#2A2623` dark
- Tabs: Figtree 12px weight-500, `var(--strip-text)`, 8px radius
- Active tab: `var(--strip-text-active)`, `var(--strip-active-bg)`, weight-600
- Count badges: inline pill, `rgba(255,255,255,0.1)`. Active: `rgba(16,185,129,0.25)` bg, `#6EE7B7` text
- Overflow: "More ▾" dropdown at end, matching dark aesthetic

**Transition animations:**

- Entering a module: sub-strip slides down, 200ms ease-out
- Returning to Home: sub-strip slides up, 200ms ease-in
- Switching between modules: sub-strip content crossfades, 150ms

**7 Hub Items:**
| Hub | Contains |
|-----|----------|
| Home | Feed-driven dashboard |
| People | Students, Staff, Households |
| Learning | Classes, Subjects, Curriculum, Attendance, Gradebook, Report Cards, Promotion, Class Assignments |
| Operations | Admissions, Communications, Approvals, Scheduling, Rooms |
| Finance | Fee Structures, Invoices, Payments, Credit Notes, Refunds, Fee Assignments, Payment Plans, Discounts, Scholarships, Statements, Reports, Audit Trail |
| Reports | Unified reports & analytics across all domains |
| Settings | School settings, Closures, Behaviour settings, Website CMS, Roles |

**Role-based hub filtering:**
| Role | Visible Hubs |
|------|-------------|
| Principal / Admin | All 7 |
| Teacher | Home, Learning, Reports |
| Accounting | Home, Finance, Reports |
| Front Office | Home, People, Operations, Reports |
| Parent | Home, Learning, Finance |

**Mobile behaviour:**

- Bar collapses to a hamburger icon (top-left) that opens a dark overlay panel with hub items
- Sub-strip transforms to a horizontally scrollable pill row below the page title
- Bottom tab bar with 4-5 role-appropriate icons as an alternative (to be decided during implementation)

### 3b. Module Sub-Tab Mapping

| Module     | Inline Tabs                                                                                | In "More ▾"                                                     |
| ---------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Finance    | Overview, Fee Structures, Invoices, Payments, Credits, Refunds, Plans, Statements, Reports | Audit, Scholarships, Discounts, Assignments                     |
| Scheduling | Dashboard, Timetable, Substitutions, Preferences, Scenarios                                | Auto-scheduler, Exams, Rooms, Breaks, Cover, Config             |
| Behaviour  | Dashboard, Incidents, Students, Recognition, Analytics                                     | Sanctions, Exclusions, Interventions, Appeals, Documents, Tasks |
| Payroll    | Runs, Staff, Compensation, Reports                                                         | Exports, Attendance, Class Delivery                             |
| People     | Students, Staff, Households                                                                | —                                                               |
| Learning   | Classes, Attendance, Gradebook, Report Cards                                               | Subjects, Curriculum, Assignments, Promotion                    |
| Operations | Admissions, Communications, Approvals                                                      | Scheduling, Rooms                                               |
| Settings   | General, Behaviour, Roles                                                                  | Closures, Website                                               |

---

## 4. Home Page — Feed + Context Panel

### Layout

Two-column layout: main feed (left, flexible) + context panel (right, 360px).

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Morph Bar (Home active, no sub-strip)                                   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Good morning, Ram                                    🟢 3 items need    │
│  Thursday 27 March · NHQS                                attention       │
│                                                                          │
│  ┌─────────────────────────────────┐  ┌────────────────────────────┐    │
│  │ NEEDS YOUR ATTENTION       (3)  │  │ 📊 School Snapshot         │    │
│  │                                 │  │ 👥 Students         209   │    │
│  │ 💰 3 invoices overdue   [Review]│  │ 👨‍🏫 Staff             32   │    │
│  │ 📋 Kelly admission     [Approve]│  │ 📊 Attendance        98%  │    │
│  │ 📊 Survey closes Fri.   [View] │  │ 💰 Collected       €12.4k │    │
│  ├─────────────────────────────────┤  ├────────────────────────────┤    │
│  │ TODAY'S ACTIVITY                │  │ 📈 This Week              │    │
│  │ 💳 Payment — Evans      2h ago │  │ Attendance avg  ████░ 97% │    │
│  │ 📝 Grades published     3h ago │  │ Wellbeing survey ███░  56% │    │
│  │ 💬 Inquiry — Hassan      5h ago │  │ Fee collection  ███░░  60% │    │
│  └─────────────────────────────────┘  ├────────────────────────────┤    │
│                                       │ 🚀 Quick Actions           │    │
│                                       │ [➕ Register] [📝 Attend] │    │
│                                       │ [📄 Invoice] [📢 Announce]│    │
│                                       └────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Greeting Row

- Left: Greeting (heading-1, `var(--text-primary)`) + subtext (caption, `var(--text-tertiary)`)
- Right: Live pulse tag — `var(--surface-secondary)` bg, 999px radius, caption text, with 6px pulsing emerald dot (2s ease-in-out)

### Left Column — Priority + Activity Feed

**"Needs Your Attention" card:**

- Card: `var(--surface)` bg, 1px `var(--border)`, 16px radius
- Header: heading-3, `var(--text-primary)`, with count badge (`var(--danger-bg)`, `var(--danger-text)`)
- Feed items: 14px padding, 1px top border `var(--surface-secondary)`, hover → `var(--surface-hover)`
- Each item: 36px tinted icon square (10px radius) + title (body-medium) + description (caption, `var(--text-tertiary)`) + action button
- Action button: `var(--primary-50)` bg, `var(--primary-600)` text, badge size (12px weight-600), pill shape
- Max 5 items, "View all →" overflow link
- Items aggregated cross-module from: overdue invoices, pending admissions, expiring surveys, incomplete households, upcoming deadlines, unresolved incidents

**"Today's Activity" card:**

- Same card structure, no action buttons
- Chronological event stream from audit log
- Each item: tinted icon + title + optional description
- "View all →" in header

### Right Column — Context Panel (360px)

**School Snapshot card:**

- Compact stat rows: 28px tinted icon + label (caption) + value (body weight-700)
- Each row clickable → navigates to domain

**This Week card:**

- Progress bars: label + value + 6px bar
- Colours: emerald (attendance), amber (survey), blue (revenue)
- Bars animate on load, 0.6s ease

**Quick Actions card:**

- 2-column grid of pill buttons
- `var(--surface-secondary)` bg, 10px radius, caption weight-500
- Hover: `var(--primary-50)` bg, `var(--primary-700)` text
- Role-specific action set

### Role-Specific Home Variants

| Role            | Priority Feed                                                   | Snapshot Stats                                         | Quick Actions                                         |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| Principal/Admin | Cross-module: finance, admissions, wellbeing, people, behaviour | Students, Staff, Classes, Attendance, Revenue          | Register, Attendance, Invoice, Announce, Find Student |
| Teacher         | My pending attendance, grading queue, upcoming classes          | My Classes, Pending Grades, Today's Schedule           | Take Attendance, Enter Grades, View Schedule          |
| Parent          | Invoices due, forms to complete, announcements                  | Child cards (one per student), Balance Due, Attendance | Pay Invoice, View Grades, Contact School              |
| Accounting      | Overdue invoices, pending payments, reconciliation alerts       | Outstanding, Collected, Overdue, Unallocated           | New Invoice, Record Payment, Run Report               |

### Mobile Layout

- Single column, context panel stacks below feed
- Quick Actions become a horizontally scrollable pill row above the feed
- Snapshot becomes a compact 2×2 stat grid

---

## 5. Module Pages — Full Width

Inside any module, the morph bar's sub-strip provides navigation. Content gets 100% of the remaining width.

### Page Structure

```
Morph Bar (hub active) ......... 56px
Sub-strip (module tabs) ........ 44px
Content area ................... remaining height
  ├── Page header (title + actions)
  ├── Stat cards row (if applicable)
  └── Main content (table, form, detail view)
```

### Page Header

- Title: heading-2, `var(--text-primary)`
- Actions: right-aligned, primary + secondary buttons
- Breadcrumb: in a future iteration, optionally shown between the sub-strip and content

### Stat Cards

- Horizontal row, 12-14px gap
- Each: `var(--surface)` bg, 1px `var(--border)`, 12px radius, 14-16px padding
- Label: label token (uppercase), `var(--text-tertiary)`
- Value: stat-value token, `var(--text-primary)` (or `var(--danger-text)` / `var(--success-text)` for semantic values)

### Tables

- Container: `var(--surface)` bg, 1px `var(--border)`, 12px radius
- Header: `var(--surface-secondary)` bg, label token, `var(--text-tertiary)`
- Rows: body token, `var(--text-secondary)`, 1px bottom border `var(--surface-secondary)`
- Row hover: `var(--surface-hover)`
- Status badges: pill-shaped, semantic colours from the palette
- All wrapped in `overflow-x-auto` for mobile

---

## 6. Component Token Reference

### Buttons

| Variant   | Background           | Text                    | Border                 | Hover                      |
| --------- | -------------------- | ----------------------- | ---------------------- | -------------------------- |
| Primary   | `var(--primary-700)` | `#FFFFFF`               | none                   | `var(--primary-800)`       |
| Secondary | `var(--primary-50)`  | `var(--primary-700)`    | none                   | `var(--primary-100)`       |
| Outline   | transparent          | `var(--text-primary)`   | `var(--border-strong)` | `var(--surface-secondary)` |
| Ghost     | transparent          | `var(--text-secondary)` | none                   | `var(--surface-secondary)` |
| Danger    | `var(--danger-bg)`   | `var(--danger-text)`    | none                   | darkened danger-bg         |

### Shape System

| Element          | Radius        |
| ---------------- | ------------- |
| Buttons          | 9999px (pill) |
| Inputs / Selects | 12px          |
| Cards            | 16px          |
| Modals / Dialogs | 20px          |
| Badges / Pills   | 9999px        |
| Table containers | 12px          |
| Feed item icons  | 10px          |
| Hub pills        | 9999px        |
| Strip tabs       | 8px           |
| Tooltips         | 8px           |
| Avatars          | 9999px        |

### Spacing (base: 4px)

| Token             | Value                          | Usage                   |
| ----------------- | ------------------------------ | ----------------------- |
| Page padding      | 32px                           | Main content area       |
| Card padding      | 20px                           | Standard cards          |
| Card gap          | 16px                           | Between cards           |
| Feed item padding | 14px vertical, 20px horizontal | Priority/activity items |
| Stat card padding | 14-16px                        | Stat cards              |
| Section gap       | 24px                           | Between major sections  |
| Form field gap    | 20px                           | Between form fields     |

---

## 7. The Invisible-Button Fix — Design Token Architecture

This is not optional. Every colour in the system is a CSS variable. Components never reference hex values directly.

```css
/* Theme is set on <html> */
html.light {
  --background: #faf9f7;
  --surface: #ffffff;
  --text-primary: #1c1917;
  --btn-primary-text: #ffffff;
  /* ... all tokens ... */
}

html.dark {
  --background: #1a1816;
  --surface: #242120;
  --text-primary: #f5f0eb;
  --btn-primary-text: #ffffff;
  /* ... all tokens ... */
}

/* Components ONLY use variables */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
}
.heading {
  color: var(--text-primary);
}
.btn-action {
  color: var(--primary-700);
  background: var(--primary-50);
}
```

**Rule:** If a PR introduces a hardcoded colour hex in a component file, it must be rejected. Colours live in the theme definition only.

---

## 8. Dark Mode Design Principles

The Warm Stone dark mode is not an inversion. It's a deliberate design:

1. **Warm, not cold** — Background is `#1A1816` (warm brown-black), not `#000000` or blue-tinted greys. Surfaces use `#242120` and `#2D2926`. The warmth prevents the "staring into the void" feeling.

2. **The bar goes darker** — In dark mode, the morph bar uses `#12100E` (darker than content). This maintains the "frame" effect — the bar is always the darkest element, content floats inside it.

3. **Text softens** — Primary text is `#F5F0EB` (warm off-white), not harsh `#FFFFFF`. Secondary text is `#C8C0B8`. This reduces eye strain for 8-hour sessions.

4. **Semantic colours lighten** — Danger red shifts from `#9F1239` to `#FB7185`. Warning amber from `#92400E` to `#FBBF24`. These maintain contrast ratios while feeling appropriate for dark surfaces.

5. **Borders warm up** — From `#E7E5E1` to `#3A3532`. Warm tone, not cool grey.

6. **Emerald stays emerald** — The brand colour `#10B981` works in both modes. Active states use it consistently.

---

## 9. Command Palette (⌘K)

Always available via keyboard shortcut or the search pill in the morph bar.

- **Trigger:** ⌘K (macOS), Ctrl+K (Windows/Linux), or click search pill
- **Appearance:** Centred modal, dark themed (matches morph bar aesthetic), 520px max-width
- **Grouped results:** Students, Households, Staff, Classes, Applications, Invoices, Payroll Runs, Pages, Actions
- **"Create new..." shortcuts** at the top
- **Recent items** section
- **Permission-scoped** — users only see results they have access to

---

## 10. Navigation Flow

```
User logs in → Home (feed + context panel, morph bar collapsed)
  │
  ├── Click hub pill → Module page
  │     └── Sub-strip slides in (200ms)
  │           ├── Click inline tab → Sub-page (content swaps)
  │           └── Click "More ▾" → Dropdown → Less-frequent sub-page
  │
  ├── Click priority action button → Direct to specific item/record
  │
  ├── Click zone stat in context panel → Navigate to domain
  │
  ├── Click quick action pill → Direct to create/action page
  │
  ├── ⌘K → Command palette → Jump anywhere
  │
  └── Click "Home" hub → Sub-strip collapses (200ms), back to feed
```

---

## 11. What This Replaces

| Current                          | New                                            |
| -------------------------------- | ---------------------------------------------- |
| 30-item sidebar with 12 sections | 7-item morph bar with contextual sub-strips    |
| Static stat cards dashboard      | Feed-driven priority + activity command centre |
| Same navigation for all roles    | Role-filtered hubs, feeds, and quick actions   |
| Plus Jakarta Sans                | Figtree                                        |
| Cool grey palette                | Warm Stone palette with brown undertones       |
| Theme-unaware hardcoded colours  | Full CSS variable token system                 |
| Sidebar on every page            | No sidebar anywhere — full-width content       |

---

## 12. Implementation Sequence (Recommended)

1. **Design token system** — Set up CSS variables for Warm Stone light + dark. This must land first; everything depends on it.
2. **Figtree font swap** — Replace Plus Jakarta Sans with Figtree globally.
3. **Morph bar component** — Build the dark bar with hub pills + search + notifications + avatar. No sub-strip yet.
4. **Sub-strip component** — Add the expanding module sub-navigation.
5. **Home page redesign** — Build the feed + context panel layout.
6. **Module page migration** — Replace sidebar navigation with sub-strip for each module, one at a time.
7. **Mobile responsive pass** — Adapt morph bar, sub-strip, and home for mobile breakpoints.
8. **Command palette upgrade** — Enhance ⌘K with the new grouped results and dark styling.
9. **Role-specific home variants** — Build teacher, parent, accounting, front office home views.
10. **Polish pass** — Transitions, animations, skeleton states, empty states.

---

## 13. Files to Reference

| File                            | Purpose                                           |
| ------------------------------- | ------------------------------------------------- |
| `Plans/ux-redesign-vision.md`   | The emotional vision — why we're doing this       |
| `Plans/ux-redesign-option-a.md` | Option A spec (rejected — kept for reference)     |
| `Plans/ux-redesign-option-b.md` | Option B spec (rejected — kept for reference)     |
| `Plans/ux-redesign-option-c.md` | Option C spec (approved — base for this document) |
| `.superpowers/brainstorm/`      | All visual mockups from the brainstorming session |

---

_This spec is the single source of truth for the EduPod UX redesign. When in doubt, refer to the vision document for the emotional intent, and this spec for the technical details._

---

## 14. Page Patterns — Canonical Hub & Sub-Page Composition

Added 2026-04-22. Derived from the shipped wellbeing + safeguarding hubs, which are the reference implementation. All new hubs and sub-pages MUST follow these patterns. The patterns are intentionally tight: deviating from them fragments the product and we lose the coherence the morph shell is designed to create.

### 14.1 Shared layout primitives

Every page lives inside the school layout's `AppShell` and is rendered as a single flex-col column:

```tsx
<div className="flex min-w-0 flex-col gap-6 pb-10">
  <PageHeader ... />
  {/* sections */}
</div>
```

- Top-level gap: `gap-6` for sub-pages, `gap-8` for hub pages (slightly more breathing room).
- `min-w-0` is non-negotiable — flex items default to content-width and will overflow on mobile otherwise.
- `pb-10` gives room for the scroll to breathe above the OS chrome on mobile.

### 14.2 `PageHeader` — every page starts here

Signature: `PageHeader({ title, description, actions?, back? })`.

- `title` — Figtree 24/700, `text-text-primary`.
- `description` — Figtree 14/400, `text-text-secondary`, optional but strongly preferred on hubs.
- `back` — used on every sub-page; renders a small back chevron above the title that links to the owning hub. Chevron gets `rtl:rotate-180`.
- `actions` — top-right slot for the primary CTA (e.g., "Report concern", "Export records"). Primary buttons use `bg-primary text-primary-foreground`. Secondary actions use `border-border bg-surface`.

### 14.3 Hub-page composition

Reference: `apps/web/src/app/[locale]/(school)/wellbeing/page.tsx` and `.../safeguarding/page.tsx`.

Stack order, top to bottom:

1. **`PageHeader`** — hub title + description.
2. **Optional privacy/context banner** — rounded-2xl, slate or primary tint. Use for safety-critical areas (safeguarding, child-protection, AI audit) to remind users of data-access rules.
3. **Error banner** — `border-danger-200 bg-danger-50`, shown only when a fetch fails. Includes `RefreshCw` retry.
4. **KPI strip** — `grid grid-cols-2 gap-3 sm:grid-cols-4` of `KpiTile`s. Each tile: uppercase 11px label with icon, `stat-value` 28/700 number, optional secondary breakdown string, optional `href` to drill in, optional tooltip. Loading state: animated pulse bar.
5. **Quick actions** — `grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4` of `QuickAction` pills. Per-role gating. Each pill: icon in tinted square, label, hover ArrowRight, gradient underline on hover.
6. **Hub cards** — `grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3` of `HubTile` components. Each tile has accent bar (top gradient strip), large tinted icon, title + description, optional count pill. Loading state: `CardSkeleton`.
7. **Contextual feed section(s)** — a rounded-2xl surface containing a divided list of recent/priority items. Optional gradient top bar for visual identity (`from-indigo-400 via-purple-500 to-pink-500` for activity feeds; semantic warning/danger gradients for urgency feeds).
8. **Resource ribbon** (optional) — footer-style strip with 2–3 resource links for the module (only when useful; skip on admin-only hubs).
9. **Audit footer** (optional) — thin dashed-border strip noting who sees what and who the designated lead is.

### 14.4 Module colour identity

Each module has one accent gradient and one tinted icon background. Pick the pair from the table below and reuse consistently across that module's hub, tiles, badges, and section headers. Do not mix palettes within a module.

| Module               | Gradient (`accent`)                            | Icon bg (`iconBg`)              |
| -------------------- | ---------------------------------------------- | ------------------------------- |
| Behaviour            | `from-rose-400 via-rose-500 to-rose-600`       | `bg-rose-100 text-rose-700`     |
| Pastoral             | `from-pink-400 via-pink-500 to-pink-600`       | `bg-pink-100 text-pink-700`     |
| Safeguarding         | `from-slate-500 via-slate-600 to-slate-700`    | `bg-slate-100 text-slate-700`   |
| Child Protection     | `from-zinc-600 via-zinc-700 to-zinc-800`       | `bg-zinc-100 text-zinc-700`     |
| Early Warnings       | `from-amber-400 via-amber-500 to-amber-600`    | `bg-amber-100 text-amber-700`   |
| Staff Wellbeing      | `from-violet-400 via-violet-500 to-violet-600` | `bg-violet-100 text-violet-700` |
| AI Audit / AI Flags  | `from-indigo-400 via-indigo-500 to-indigo-600` | `bg-indigo-100 text-indigo-700` |
| Notifications config | `from-sky-400 via-sky-500 to-sky-600`          | `bg-sky-100 text-sky-700`       |
| Queue Admin          | `from-stone-500 via-stone-600 to-stone-700`    | `bg-stone-100 text-stone-700`   |
| Regulatory           | `from-teal-400 via-teal-500 to-teal-600`       | `bg-teal-100 text-teal-700`     |
| Settings             | `from-zinc-400 via-zinc-500 to-zinc-600`       | `bg-zinc-100 text-zinc-700`     |

### 14.5 Sub-page (list) composition

Reference: `.../safeguarding/concerns/page.tsx`.

1. **`PageHeader`** with `back` pointing to the owning hub and `actions` holding the primary CTA (e.g., "New record").
2. **Error banner** (same contract as §14.3).
3. **Summary strip** (optional) — 3-up `SummaryCard` grid for tonal counts (`danger` / `warning` / `success`). Only when the data has meaningful bucketed totals.
4. **Filters section** — rounded-2xl with `bg-surface`, leading with a Filter icon + "Filters" label + "Reset" ghost button. Controls in a `grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4`. Each control is a labelled `Select` or `Input`. Changing any filter resets `page` to 1.
5. **Results section** — rounded-2xl with an internal `<header>` showing "N results · page X of Y", then either:
   - Skeleton rows (6 rows, animated pulse) while loading
   - Empty state (centered, 12 units of vertical padding, small muted copy)
   - `<ul className="divide-y divide-border/50">` of row links
6. **Pagination** — Prev / "Page X of Y" / Next buttons in a flex-between row. Only render when `totalPages > 1`.

### 14.6 Sub-page (detail) composition

1. **`PageHeader`** with `back` to the parent list and `actions` holding contextual buttons (edit, export, close, etc.).
2. **Identity strip** — rounded-2xl header card with entity reference number (`font-mono`), status badges, and key metadata inline.
3. **Tabbed or stacked sections** — each section is a rounded-2xl `bg-surface` card with its own h2 heading. Prefer vertical stacking over tabs unless there are ≥5 sections.
4. **Side-by-side layout at `lg:`** — on desktop, split into `lg:grid-cols-[2fr_1fr]` with the primary narrative on the left and a sidebar (audit log, access grants, recent activity) on the right.
5. **Danger zone** (optional) — last section, `border-danger-200 bg-danger-50/40`, for destructive actions (archive, seal, legal-hold).

### 14.7 Form-page composition

- Wrap in `react-hook-form` with `zodResolver(schema)` — schema lives in `@school/shared`.
- Break forms into `<fieldset>`-style sections matching `<section>` rounded-2xl cards when they have ≥6 fields.
- Field gap inside a section: `gap-4`. Inter-section gap: `gap-6`.
- Submit button is right-aligned in a flex row at the bottom, matched with a `Cancel` / back link on the left.
- Inline error messages use `text-danger-700 text-xs` directly below the offending field.
- For destructive confirmations (delete, seal), use the shared `ConfirmDialog`.

### 14.8 Settings-hub composition

Reference: `.../settings/page.tsx`.

1. **`PageHeader`** — "Settings" + short description.
2. **Grid** — `grid grid-cols-1 gap-6 lg:grid-cols-2` of `CategorySection` cards.
3. Each `CategorySection` is a rounded-2xl card with accent top bar, tinted icon, category title + description, and an inner `grid grid-cols-1 gap-2.5 sm:grid-cols-2` of compact tiles.
4. Compact tile = rounded-xl surface with icon, label, description, hover-reveal ArrowRight.

New settings pages (e.g., Wellbeing Notifications, AI Audit) register themselves as a tile inside the appropriate category. If the settings category doesn't exist yet, add it in `apps/web/src/app/[locale]/(school)/settings/page.tsx` (hub), then create the actual page underneath.

### 14.9 Platform-admin pages

Reference: `apps/web/src/app/[locale]/(platform)/admin/...`.

- These pages use the `(platform)` layout which has a left sidebar nav, NOT the morph shell. Do not try to force morph-shell patterns here.
- English-only — no translation keys required.
- Same token system, same spacing, same `PageHeader`, same KPI strip and list/detail primitives as school routes.
- Register new admin pages by adding an entry to `navItems` in `apps/web/src/app/[locale]/(platform)/layout.tsx`.

### 14.10 Permission-denied state

When `canView === false` on a gated page, render a centred state inside a rounded-2xl surface:

```tsx
<section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
    <Lock className="h-6 w-6" />
  </div>
  <div className="max-w-md space-y-2">
    <h2 className="text-lg font-semibold text-text-primary">{t('denied.title')}</h2>
    <p className="text-sm text-text-secondary">{t('denied.body')}</p>
  </div>
  <Link href={`/${locale}/{hub}`} className="... border-border bg-surface ...">
    {t('denied.backToHub')}
  </Link>
</section>
```

### 14.11 Skeletons & empty states

- **Loading skeletons** come from `@/components/kpi-tile` (`CardSkeleton`) or are inlined as `animate-pulse rounded bg-border/60` boxes sized to match the content they replace.
- **Empty states** are centred columns inside rounded-2xl surfaces. Use a tinted circular icon (`bg-emerald-100 text-emerald-700` when the empty state is positive, `bg-slate-100 text-slate-700` when neutral), a short heading, and a subtitle explaining what to do next.

### 14.12 Internationalisation & RTL

- All user-facing strings come from `useTranslations()`. Tenant-facing pages (A1, A3, A4) ship English + Arabic. Platform-admin pages (A2) ship English only (see §14.9).
- Use logical CSS properties exclusively — `ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`, `border-s-`/`border-e-`, `rounded-s-`/`rounded-e-`, `text-start`/`text-end`. Physical classes (`ml-`, `left-`, etc.) are a lint error.
- Chevrons and arrows that point "forward" (next, view more, drill in) must include `rtl:rotate-180`.
- Any field displaying a strictly-LTR value (email, phone, UUID, invoice number) wraps the value in `dir="ltr"` and uses `font-mono` when the value is a code/ID.

### 14.13 Don'ts

- No inline hex colours. Ever. Use tokens.
- No Redux / Zustand / global state libraries.
- No server-component data fetching in authenticated shells — use `apiClient<T>()` inside `useEffect`.
- No `useState`-per-field forms in new code — always `react-hook-form` + `zodResolver`.
- No physical direction classes (`ml-`, `pl-`, `text-left`, etc.).
- No sub-strip for hubs whose navigation surface is the dashboard itself (wellbeing, operations, finance, communications, people, settings, regulatory).
- No bottom tab bar on mobile — the mobile navigation uses the hamburger-triggered overlay and horizontally scrollable sub-strip.

---

## 15. Adding a New Hub-Level Surface

When you introduce a brand new feature with enough depth to warrant a hub (or a significant settings section), follow this exact sequence:

1. **Backend first** — make sure every endpoint the UI needs exists and is permission-gated. Thin controllers on top of existing services are fine; inventing new business logic is not.
2. **Zod schemas in `@school/shared`** — define request/response schemas there before touching the UI.
3. **Translation keys** — add English and Arabic under the matching namespace in `apps/web/messages/{en,ar}.json`. Platform-admin pages skip `ar.json`.
4. **Page implementation** — build the hub/list/detail/form pages following §14.
5. **Discoverability** — pick ONE surface to add the new tile to (hub dashboard, settings hub, platform admin sidebar, or the owning module's sub-strip). Do not add the same destination in multiple places.
6. **Wire sub-strip or hub cards** — if the new surface needs nested navigation, prefer hub cards on a dashboard over a new sub-strip. Sub-strips should only be added when the user will frequently swap between siblings.
7. **Test the happy path** — unit tests for services, a co-located spec for the page if there's non-trivial client logic.
8. **Verify on prod** after deploy — navigate the flow end to end, then update this spec or `docs/architecture/feature-map.md` if the change touches the canonical surface inventory.
