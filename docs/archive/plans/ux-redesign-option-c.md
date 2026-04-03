# UX Redesign — Option C: "The Morphing Shell"

**Date:** 27 March 2026
**Status:** Draft concept — not approved
**Visual mockup:** `.superpowers/brainstorm/8072-1774644088/content/option-c.html`

---

## Philosophy

Same unified layers as A and B, but the navigation bar itself becomes the centrepiece. A dark, cinematic top bar that transforms — showing hub pills on home, expanding a sub-strip when you enter a module. The home page is feed-driven rather than card-driven.

The vibe: Cinematic, editorial, confident. Notion meets Superhuman. The dark bar makes a statement.

---

## Layer 1: The Morphing Bar (Global Navigation)

A dark top bar that serves as both global nav and module sub-nav — it expands rather than spawning separate UI elements.

### Home Mode (collapsed — single bar)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ██ [Logo] EduPod    Home  People  Learning  Operations  Finance  Reports  Settings    [Search ⌘K] [🔔] [👤]  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Module Mode (expanded — bar + sub-strip)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ██ [Logo] EduPod    Home  People  Learning  Operations  [Finance]  Reports  Settings    [Search ⌘K] [🔔] [👤]  │
├──────────────────────────────────────────────────────────────────────────┤
│  Overview   Fee Structures   [Invoices 24]   Payments 18   Credits   Refunds   Plans   Statements   Reports   Audit ▾  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Bar specifications:**

- **Height:** 56px (home mode), 56px + 44px = 100px (module mode)
- **Background:** `#1C1917` (stone-900) — dark, cinematic
- **Logo:** 28px emerald gradient square + "EduPod" in 15px weight-700, `#FAFAF9` text
- **Hub pills:** 13px, weight-500, `rgba(250, 250, 249, 0.5)` text, pill-shaped
- **Active hub pill:** `rgba(16, 185, 129, 0.2)` background, `#6EE7B7` text, weight-600
- **Hover:** `rgba(255,255,255,0.06)` background, text lightens to 80% opacity
- **Search pill:** `rgba(255,255,255,0.08)` background, `rgba(255,255,255,0.1)` border, ghost text at 40% opacity
- **Notification bell:** 2px border at 20% white opacity, red dot for unread

**Sub-strip specifications (module mode):**

- **Background:** `#292524` (stone-800) — slightly lighter than the bar, creates visual depth
- **Border:** 1px bottom border `#3f3b39`
- **Height:** 44px
- **Tabs:** 12px weight-500, `rgba(250, 250, 249, 0.4)` text, 8px radius
- **Active tab:** `#FAFAF9` text, `rgba(255,255,255,0.1)` background, weight-600
- **Hover:** `rgba(255,255,255,0.05)` background, text at 70% opacity
- **Count badges:** Inline pill, `rgba(255,255,255,0.1)` bg. Active tab count: `rgba(16,185,129,0.25)` bg, `#6EE7B7` text
- **Overflow:** "More ▾" at the end, `rgba(250,250,249,0.3)` text, auto-positioned to end
- **Animation:** Sub-strip slides down with 200ms ease-out when entering a module, slides up when returning to Home

**Transition behaviour:**

- Click "Home" → sub-strip collapses (200ms slide up)
- Click any hub pill → sub-strip expands or swaps content (150ms crossfade for tab content)
- The hub pills remain visible in module mode — you can jump between domains without going back to Home
- On "Home" hub, sub-strip is hidden — clean single-bar look

**7 hub items (same mapping as Options A/B):**
| Hub | Contains |
|-----|----------|
| Home | Feed-driven dashboard |
| People | Students, Staff, Households |
| Learning | Classes, Subjects, Curriculum, Attendance, Gradebook, Report Cards |
| Operations | Admissions, Communications, Approvals, Scheduling, Rooms |
| Finance | All finance sub-modules |
| Reports | Unified reports & analytics |
| Settings | School settings, Behaviour config, Website, Roles |

**Role-based filtering:** Same rules as A/B — fewer hub pills for teachers, parents, etc.

**Mobile behaviour:** Dark bar collapses to a hamburger menu (slides out a dark overlay panel with hub items). Sub-strip becomes a scrollable pill row below the page title. Could also use a bottom tab bar with the dark treatment.

---

## Layer 2: The Feed Home (Dashboard)

When "Home" is active, the content area shows a two-column command centre layout.

### Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Dark Morph Bar (Home active, no sub-strip)                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Good morning, Ram                                    🟢 3 items need    │
│  Thursday 27 March · NHQS                                attention       │
│                                                                          │
│  ┌─────────────────────────────────┐  ┌────────────────────────────┐    │
│  │ NEEDS YOUR ATTENTION       (3)  │  │ 📊 School Snapshot         │    │
│  │                                 │  │                            │    │
│  │ 💰 3 invoices overdue   [Review]│  │ 👥 Students         209   │    │
│  │    Kelly · Thompson · Johnston  │  │ 👨‍🏫 Staff             32   │    │
│  │                                 │  │ 📚 Classes           15   │    │
│  │ 📋 Kelly admission     [Approve]│  │ 📊 Attendance        98%  │    │
│  │    Applied 3 days ago           │  │ 💰 Collected       €12.4k │    │
│  │                                 │  ├────────────────────────────┤    │
│  │ 📊 Survey closes Fri.   [View] │  │ 📈 This Week              │    │
│  │    18/32 staff responded        │  │                            │    │
│  ├─────────────────────────────────┤  │ Attendance avg  ████░ 97% │    │
│  │ TODAY'S ACTIVITY                │  │ Wellbeing survey ███░  56% │    │
│  │                                 │  │ Fee collection  ███░░  60% │    │
│  │ 💳 Payment — Evans      2h ago │  ├────────────────────────────┤    │
│  │ 📝 Grades published     3h ago │  │ 🚀 Quick Actions           │    │
│  │ 💬 Inquiry — Hassan      5h ago │  │                            │    │
│  │ ✅ Attendance — Year 3   6h ago │  │ [➕ Register] [📝 Attend] │    │
│  │                                 │  │ [📄 Invoice] [📢 Announce]│    │
│  └─────────────────────────────────┘  │ [🔍 Find] [📊 Reports]   │    │
│                                       └────────────────────────────┘    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Grid:** `grid-template-columns: 1fr 360px`, 24px gap

### Left Column — Main Feed

A scrollable feed of cards, chronological and actionable.

**"Needs Your Attention" card:**

- Card: White bg, 1px border, 16px radius
- Header: 14px weight-600, `#1C1917`, with red count badge (`#FFF1F2` bg, `#DC2626` text)
- Feed items: 14px vertical padding, 1px top border `#F5F5F4`, hover → `#FAFAF9`
- Each item: Emoji icon in a 36px tinted square (10px radius), title (13px weight-500), description (12px `#78716C`), and an action button
- Action button: `#ECFDF5` bg, `#059669` text, 12px weight-600, pill-shaped, hover → `#D1FAE5`
- Maximum 5 priority items; overflow shows "View all →"
- Priority items are cross-module aggregated (same logic as A/B)

**"Today's Activity" card:**

- Same card structure but without action buttons
- Items: emoji icon, title (13px weight-500), description (12px `#78716C`)
- No limit — this is a scrollable chronological feed
- Items sourced from audit log / event stream
- "View all →" link in header

**Teacher feed:** "My Priorities" (pending attendance, grading queue). Activity = "My Classes Today"
**Parent feed:** "For Your Attention" (invoices due, forms to complete). Activity = child's recent grades/attendance

### Right Column — Context Panel

Fixed-width (360px) panel with stacked context cards.

**School Snapshot card:**

- Compact stat rows: icon (28px tinted square) + label (12px `#78716C`) + value (16px weight-700)
- Stats: Students, Staff, Classes, Attendance %, Revenue
- Each row is clickable — navigates to the relevant domain

**This Week card:**

- Progress bars showing key metrics with targets
- Each bar: label (12px), value (12px weight-600 `#1C1917`), 6px bar with coloured fill
- Bar colours: emerald (attendance), amber (survey), blue (revenue)
- Progress bars animate on load (0.6s ease transition)

**Quick Actions card:**

- Grid of pill-shaped navigation buttons (2 or 3 columns)
- Each pill: `#F5F5F4` bg, 10px radius, 12px weight-500, emoji prefix
- Hover: `#ECFDF5` bg, `#047857` text
- Role-specific action set

### Greeting Row

- Left: Greeting (24px weight-700) + subtext (13px `#78716C`)
- Right: Live indicator pill — `#F5F5F4` bg, 999px radius, 12px text, with pulsing 6px emerald dot (2s ease-in-out animation)
- Pill shows attention item count

---

## Layer 3: Module Navigation (In-Bar Sub-Strip)

No sidebar. No separate tab row. The dark bar itself expands to accommodate module sub-navigation.

**All modules use the morph strip.** The sub-tabs live in the dark bar, maintaining visual continuity and keeping the content area 100% full-width.

**Tab overflow handling:**
For modules with many sub-pages, show the most important tabs inline with a "More ▾" dropdown at the end:

```
Overview  Fee Structures  [Invoices 24]  Payments 18  Credits  Refunds  Plans  Statements  Reports  Audit ▾
```

"More ▾" dropdown: Dark-themed dropdown matching the bar aesthetics (`#292524` bg, same text treatment).

**Module sub-tab mapping:**
| Module | Inline tabs | In "More ▾" |
|--------|------------|-------------|
| Finance | Overview, Fee Structures, Invoices, Payments, Credits, Refunds, Plans, Statements, Reports | Audit Trail, Scholarships, Discounts, Assignments |
| Scheduling | Dashboard, Timetable, Substitutions, Preferences, Scenarios | Auto-scheduler, Exams, Rooms, Breaks, Cover, Config |
| Behaviour | Dashboard, Incidents, Students, Recognition, Analytics | Sanctions, Exclusions, Interventions, Appeals, Documents |
| Payroll | Runs, Staff, Compensation, Reports | Exports, Attendance, Class Delivery |
| People | Students, Staff, Households | (no overflow) |
| Learning | Classes, Attendance, Gradebook, Report Cards | Subjects, Curriculum, Assignments, Promotion |
| Operations | Admissions, Communications, Approvals | Scheduling, Rooms |
| Settings | General, Behaviour, Roles | Closures, Website |

---

## The Dark Bar's Emotional Purpose

The dark bar isn't just aesthetic — it creates a **frame** for the content. The light content area floats inside a dark cinematic shell, creating visual depth and a sense of premium enclosure. It's the same principle Apple uses: dark bezels make the screen content pop. The bar says _"I'm the platform, and everything below me is your workspace."_

It also creates a natural visual boundary between navigation and content — you never confuse the two. The sub-strip being part of the same dark bar (just slightly lighter) maintains the single-element illusion while providing the depth needed.

---

## Command Palette (⌘K)

Same as A/B. Search pill in the dark bar triggers the command palette.

---

## Navigation Flow Summary

```
User lands → Home (feed + context panel, morph bar collapsed)
  ├── Click hub pill → Module page (morph bar expands, sub-strip slides in)
  │     ├── Sub-tabs inline → Direct sub-page access
  │     └── "More ▾" → Less-frequent sub-pages
  ├── Click priority action button → Direct to specific item
  ├── Click quick action pill → Direct to create/action page
  ├── Click stat row in context panel → Navigate to domain
  └── ⌘K → Command palette → Jump anywhere
```

**Back to Home:** Click "Home" hub pill → sub-strip collapses with 200ms slide-up animation.

---

## Key Design Qualities

- **Cinematic presence:** Dark bar creates a premium frame. Light content pops against it. Feels like a high-end application, not a website.
- **Morphing continuity:** The bar expanding is more elegant than spawning separate UI elements (sidebar, tab row). One navigation element, two modes.
- **Feed-driven home:** Priority actions are inline and actionable (with buttons). Activity is chronological and contextual. More information-dense than zone cards, but structured.
- **Full-width everywhere:** Sub-navigation is in the bar, never in the content area. Every page gets 100% content width.
- **Progress visibility:** The context panel's progress bars give at-a-glance understanding of where things stand this week — a feature neither A nor B has.
- **Dark/light contrast:** The dark bar + light content creates natural visual separation. In dark mode, the bar would shift to an even darker shade while content uses dark surface colours.

---

## Key Differences from Options A and B

| Dimension        | Option A                                | Option B                      | Option C                                  |
| ---------------- | --------------------------------------- | ----------------------------- | ----------------------------------------- |
| Global nav       | White top hub bar                       | Floating dark dock (bottom)   | Dark cinematic top bar                    |
| Module sub-nav   | Sidebar (complex modules)               | Horizontal tabs (all modules) | Morphing sub-strip (in the bar)           |
| Home layout      | Uniform zone card grid                  | Bento grid with hero card     | Two-column: feed + context panel          |
| Home personality | Spatial, at-a-glance                    | Editorial, visual hierarchy   | Editorial, action-oriented                |
| Content width    | Full (home), narrower (sidebar modules) | Full everywhere               | Full everywhere                           |
| Signature move   | Zone cards with live data               | Floating dock + bento grid    | Dark bar that morphs                      |
| Mobile story     | Hub bar → bottom tabs                   | Dock already at bottom        | Hamburger + bottom tabs                   |
| Overall vibe     | Clean web app (Linear + ClassDojo)      | Native app (Apple + Arc)      | Cinematic editorial (Notion + Superhuman) |
