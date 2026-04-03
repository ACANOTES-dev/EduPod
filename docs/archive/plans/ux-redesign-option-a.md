# UX Redesign — Option A: "The Unified Layers"

**Date:** 27 March 2026
**Status:** Draft concept — not approved
**Visual mockup:** `.superpowers/brainstorm/8072-1774644088/content/unified-concept.html`

---

## Philosophy

Three approaches fused into one layered system:

- **C's Hub Bar** as the permanent global shell (top navigation)
- **A's Spatial Workspace** as the Home page (living zone cards with real-time data)
- **B's Module Sidebar** for deep modules only (contextual sub-navigation)

No traditional sidebar. No 30-item menu. Navigation scales by revealing depth only when needed.

---

## Layer 1: The Hub Bar (Global Shell)

A horizontal navigation bar at the top of every page. Always visible, never changes.

**Structure:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [Logo] EduPod    Home  People  Learning  Operations  Finance  Reports  Settings    [Search ⌘K] [🔔] [Avatar] │
└──────────────────────────────────────────────────────────────────────────┘
```

**Specifications:**

- **Height:** 54px
- **Background:** White (`#FFFFFF`), 1px border-bottom
- **Logo:** 28px square with emerald gradient, followed by "EduPod" in 15px weight-700
- **Hub pills:** 13px, weight-500, `#78716C` text, pill-shaped (`border-radius: 999px`)
- **Active pill:** `#ECFDF5` background, `#047857` text, weight-600
- **Right section:** Search pill (with ⌘K hint), notification bell (with red dot badge for unread), user avatar (32px circle, emerald gradient)
- **7 hub items:** Home, People, Learning, Operations, Finance, Reports, Settings

**Hub-to-domain mapping (admin/principal view):**
| Hub | Contains |
|-----|----------|
| Home | Spatial workspace dashboard, announcements, calendar |
| People | Students, Staff, Households |
| Learning | Classes, Subjects, Curriculum Matrix, Class Assignments, Promotion, Attendance, Gradebook, Report Cards |
| Operations | Admissions, Communications, Approvals, Scheduling, Rooms |
| Finance | Fee Structures, Invoices, Payments, Credit Notes, Refunds, Fee Assignments, Payment Plans, Discounts, Scholarships, Statements, Reports, Audit Trail |
| Reports | Unified reports & analytics across all domains |
| Settings | School settings, Closures, Behaviour settings, Website CMS, Roles |

**Role-based hub filtering:**

- **Teacher:** Home, Learning (simplified), Reports
- **Parent:** Home (parent dashboard), Learning (child's grades/attendance), Finance (invoices/payments)
- **Accounting:** Home, Finance, Reports
- **Front Office:** Home, People, Operations (Admissions), Reports

**Mobile behaviour:** Hub bar collapses to a bottom tab bar with 5 items (Home, primary hubs for role, More). "More" opens a sheet with remaining hubs.

---

## Layer 2: The Spatial Workspace (Home Page)

When "Home" is the active hub, the content area shows a living workspace.

**Layout (top to bottom):**

### 2a. Greeting & Context

```
Good morning, Ram
Thursday 27 March · NHQS · 3 items need attention
```

- Greeting: 22px, weight-700, `#1C1917`, time-of-day aware
- Subtext: 13px, `#78716C`, shows date + school name + attention item count

### 2b. Urgent Action Chips

A horizontal row of dismissible action chips for items requiring immediate attention.

```
[🔴 3 invoices overdue — €2,340]  [🟡 Kelly admission awaiting approval]  [🔵 Wellbeing survey closes Friday — 18/32]
```

- Chips: Rounded rectangle (12px radius), semantic colours (danger/warning/info), 13px weight-500
- Each chip is clickable and navigates directly to the relevant item
- Chips are generated from cross-module priority aggregation
- Maximum 5 chips shown; overflow collapses to "+N more"

### 2c. Zone Cards Grid

A 4-column grid of domain zone cards, each showing live summary data.

**Card structure:**

```
┌─────────────────────┐
│ [emoji-icon]  Title │
│                     │
│ • 209 students      │
│ • 32 staff          │
│ ⚠ 8 incomplete      │
└─────────────────────┘
```

- Card: White bg, 1px border `#E7E5E4`, 14px radius, 18px padding
- Emoji icon: 36px square with tinted background (each domain has its own colour)
- Title: 14px, weight-600, `#1C1917`
- Stats: 12px, `#78716C`, with 5px dot prefix
- Alert stats: 12px, `#DC2626`, weight-500, red dot prefix
- Hover: Border changes to `#10B981`, subtle shadow, translateY(-1px)
- Click: Navigates to the domain (same as clicking the hub pill)

**Zone cards (admin view):**
| Zone | Emoji | Colour Tint | Stats shown |
|------|-------|-------------|-------------|
| People | 👥 | Blue | Student count, staff count, incomplete households |
| Learning | 📚 | Purple | Active classes, assessments due |
| Operations | ⚡ | Orange | Pending admissions, pending approvals |
| Finance | 💰 | Emerald | Revenue this month, overdue invoices |
| Behaviour | 🛡️ | Amber | Open incidents, recognitions today |
| Scheduling | 📅 | Teal | Substitutions needed, next period |
| Wellbeing | ❤️ | Rose | Survey status, response rate |
| Reports | 📊 | Indigo | Board report deadline |

**Teacher home:** Different zones — "My Classes", "Attendance Today", "Grading Queue", "My Schedule"
**Parent home:** Different zones — "My Children" (one card per child), "Balances", "Announcements"

### 2d. Bottom Row (Two Panels)

```
┌─────────────────────────────┐  ┌─────────────────────────────┐
│ Quick Actions               │  │ Recent Activity             │
│ [+ Register] [📝 Attend.]  │  │ • Payment — Evans    2h ago │
│ [📄 Invoice] [📢 Announce] │  │ • Grade pub — Y5     3h ago │
│ [🔍 Find Student]          │  │ • Inquiry — Hassan   5h ago │
└─────────────────────────────┘  └─────────────────────────────┘
```

- Quick Actions: Role-specific pill chips (`#F5F5F4` bg, 12px weight-500, 999px radius)
- Recent Activity: Compact list with dot indicator, action text, relative timestamp

---

## Layer 3: Module Navigation (Deep Pages)

### 3a. Simple Modules (no sub-nav)

Modules with few pages go directly to content. The hub bar shows which domain is active. A context strip below the hub bar provides section tabs if needed.

**Context strip** (optional, for modules with 2-7 sub-sections):

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Hub bar (Finance active)                                               │
├──────────────────────────────────────────────────────────────────────────┤
│  Overview    Invoices    Payments    Fee Structures    Reports           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [Full-width content area]                                              │
│                                                                         │
└──────────────────────────────────────────────────────────────────────────┘
```

- Strip: `#FAFAF9` bg, 1px border-bottom, 10px vertical padding
- Tabs: 12px weight-500, `#78716C`, 8px radius
- Active tab: White bg, `#1C1917`, subtle box-shadow, weight-600

### 3b. Complex Modules (with sub-nav sidebar)

Modules with many sub-pages (Finance, Scheduling, Behaviour, Payroll) show a contextual sidebar within the content area.

**Layout:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Hub bar (Finance active)                                               │
├────────────┬─────────────────────────────────────────────────────────────┤
│            │                                                             │
│  BILLING   │  Invoices                            [Export] [+ New]       │
│  Fee Str.  │                                                             │
│  Invoices ◄│  [Outstanding: €8,240] [Collected: €12,400] [Overdue: 3]   │
│  Payments  │                                                             │
│  Credits   │  ┌─────────────────────────────────────────────────────┐   │
│  Refunds   │  │ Household    │ Invoice # │ Amount │ Status │       │   │
│            │  │ Kelly Family │ INV-0014  │ €1,200 │ Overdue│ View  │   │
│  PLANNING  │  │ Thompson     │ INV-0013  │ €800   │ Overdue│ View  │   │
│  Assign.   │  │ Evans Family │ INV-0012  │ €1,200 │ Paid   │ View  │   │
│  Plans     │  └─────────────────────────────────────────────────────┘   │
│  Discounts │                                                             │
│  Scholars. │                                                             │
│            │                                                             │
│  INSIGHTS  │                                                             │
│  Stmts     │                                                             │
│  Reports   │                                                             │
│  Audit     │                                                             │
│            │                                                             │
└────────────┴─────────────────────────────────────────────────────────────┘
```

- Sidebar width: 210px
- Background: `#FAFAF9`, 1px border-right
- Section labels: 10px, weight-600, uppercase, `#A8A29E`, 0.06em letter-spacing
- Items: 13px, `#78716C`, 8px radius, 8px vertical padding
- Active item: `#ECFDF5` bg, `#047857` text, weight-500
- Content area: Full remaining width, `#FEFDFB` bg, 24-28px padding

**Which modules get the sub-nav sidebar:**
| Module | Sub-pages | Sub-nav? |
|--------|-----------|----------|
| Finance | 12+ | Yes — grouped into Billing, Planning, Insights |
| Scheduling | 15+ | Yes — grouped into Timetabling, Configuration, Substitutions |
| Behaviour | 12+ | Yes — grouped into Incidents, Students, Management, Analytics |
| Payroll | 8+ | Yes — grouped into Runs, Staff, Reports |
| People | 3 | No — use context strip tabs |
| Learning | 7 | Borderline — context strip with overflow |
| Operations | 5 | No — use context strip tabs |
| Settings | 8+ | Yes — grouped into General, Behaviour, Roles |

---

## Command Palette (⌘K)

Always available. Primary power-user navigation mechanism.

- Trigger: ⌘K / Ctrl+K, or click the search pill
- Grouped results: Students, Households, Staff, Classes, Applications, Invoices, Payroll Runs, Pages, Actions
- "Create new..." shortcuts
- Recent items
- Permission-scoped results

---

## Navigation Flow Summary

```
User lands → Home (spatial workspace with zone cards)
  ├── Click zone card OR hub pill → Domain page
  │     ├── Simple module → Context strip tabs + content
  │     └── Complex module → Module sidebar + content
  ├── Click urgent chip → Direct to specific item
  ├── Click quick action → Direct to create/action page
  └── ⌘K → Command palette → Jump anywhere
```

**Back navigation:** Browser back button + hub bar always shows where you are. Clicking "Home" hub always returns to the spatial workspace.

---

## Key Design Qualities

- **First impression:** Clean hub bar + spatial workspace = premium, alive, modern
- **No clutter:** Maximum 7 items visible in the hub bar at any time
- **Progressive depth:** Navigation reveals itself as you go deeper, never all at once
- **Full-width content:** No global sidebar stealing horizontal space on every page
- **Mobile-native:** Hub bar → bottom tabs. Zone cards → vertical scroll. Module sidebar → collapsible drawer
- **Role-adaptive:** Hub items, zone cards, and quick actions all filter by role
