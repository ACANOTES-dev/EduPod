# Chunk 04 — Sub-Strip (Module Contextual Tabs)

## What This Does

Adds the 44px dark sub-strip that appears below the morph bar when the user is inside a module. The sub-strip shows module-specific tabs. It slides in/out with animation.

## Pre-Read

- `docs/plans/ux-redesign-final-spec.md` — Section 3a (Sub-strip specs), Section 3b (Module Sub-Tab Mapping)
- The morph bar components from chunk 03
- `apps/web/src/lib/nav-config.ts` — the hub configs

## New Components to Create

### 1. `packages/ui/src/components/morph-bar/sub-strip.tsx`

The contextual sub-navigation strip.

**Container specs:**

- **Height:** 44px
- **Background:** `var(--color-strip-bg)` — `#292524` light / `#1E1B19` dark
- **Border bottom:** 1px `var(--color-strip-border)`
- **Layout:** Flex row, items-center, overflow hidden
- **Animation:** Slides down from morph bar (200ms ease-out on enter, 200ms ease-in on exit)

**Tab specs:**

- **Typography:** Figtree 12px weight-500 (`strip-tab` token)
- **Default state:** `var(--color-strip-text)`, transparent bg
- **Active state:** `var(--color-strip-text-active)`, `var(--color-strip-active-bg)`, weight-600
- **Shape:** `border-radius: 8px`, padding 6px 12px
- **Count badges:** Inline pill after label, `rgba(255,255,255,0.1)` bg. Active: `rgba(16,185,129,0.25)` bg, `#6EE7B7` text

**Props:**

```typescript
interface SubStripProps {
  tabs: SubStripTab[];
  activeTabHref: string;
  onTabClick: (href: string) => void;
}

interface SubStripTab {
  labelKey: string;
  href: string;
  count?: number;
  /** If true, this tab goes in the "More" dropdown */
  overflow?: boolean;
}
```

### 2. `packages/ui/src/components/morph-bar/more-dropdown.tsx`

The "More ▾" overflow dropdown for tabs that don't fit inline.

- **Trigger:** "More ▾" text styled as a strip tab
- **Dropdown:** Dark-themed popover matching the strip aesthetic
- **Background:** `var(--color-strip-bg)`, 1px `var(--color-strip-border)`, 12px radius
- **Items:** Same typography as strip tabs, with hover state `var(--color-strip-active-bg)`

## Files to Modify

### 3. `apps/web/src/lib/nav-config.ts`

Add the sub-strip tab mapping per hub. This defines which tabs appear for each module:

```typescript
export interface SubStripTabConfig {
  labelKey: string;
  href: string;
  overflow?: boolean; // true = goes in "More ▾" dropdown
  roles?: RoleKey[];
}

export const hubSubStripConfigs: Record<string, SubStripTabConfig[]> = {
  people: [
    { labelKey: 'nav.students', href: '/students' },
    { labelKey: 'nav.staff', href: '/staff', roles: ADMIN_ROLES },
    { labelKey: 'nav.households', href: '/households', roles: ADMIN_ROLES },
  ],
  learning: [
    { labelKey: 'nav.classes', href: '/classes' },
    { labelKey: 'nav.attendance', href: '/attendance' },
    { labelKey: 'nav.gradebook', href: '/gradebook' },
    { labelKey: 'nav.reportCards', href: '/report-cards' },
    { labelKey: 'nav.subjects', href: '/subjects', overflow: true, roles: ADMIN_ROLES },
    { labelKey: 'nav.curriculum', href: '/curriculum-matrix', overflow: true, roles: ADMIN_ROLES },
    { labelKey: 'nav.classAssignments', href: '/class-assignments', overflow: true },
    { labelKey: 'nav.promotion', href: '/promotion', overflow: true, roles: ADMIN_ROLES },
  ],
  operations: [
    { labelKey: 'nav.admissions', href: '/admissions' },
    { labelKey: 'nav.communications', href: '/communications' },
    { labelKey: 'nav.approvals', href: '/approvals' },
    { labelKey: 'nav.scheduling', href: '/scheduling', overflow: true },
    { labelKey: 'nav.rooms', href: '/rooms', overflow: true },
  ],
  finance: [
    { labelKey: 'nav.financeOverview', href: '/finance' },
    { labelKey: 'nav.feeStructures', href: '/finance/fee-structures' },
    { labelKey: 'nav.invoices', href: '/finance/invoices' },
    { labelKey: 'nav.payments', href: '/finance/payments' },
    { labelKey: 'nav.credits', href: '/finance/credit-notes' },
    { labelKey: 'nav.refunds', href: '/finance/refunds' },
    { labelKey: 'nav.paymentPlans', href: '/finance/payment-plans' },
    { labelKey: 'nav.statements', href: '/finance/statements' },
    { labelKey: 'nav.financeReports', href: '/finance/reports' },
    { labelKey: 'nav.audit', href: '/finance/audit', overflow: true },
    { labelKey: 'nav.scholarships', href: '/finance/scholarships', overflow: true },
    { labelKey: 'nav.discounts', href: '/finance/discounts', overflow: true },
    { labelKey: 'nav.feeAssignments', href: '/finance/fee-assignments', overflow: true },
  ],
  reports: [
    // Reports has a single page — no sub-strip needed
  ],
  settings: [
    { labelKey: 'nav.generalSettings', href: '/settings' },
    { labelKey: 'nav.behaviourSettings', href: '/behaviour/settings', overflow: true },
    { labelKey: 'nav.roles', href: '/settings/roles' },
    { labelKey: 'nav.closures', href: '/closures', overflow: true },
    { labelKey: 'nav.website', href: '/website', overflow: true },
  ],
};
```

Note: `home` and `reports` hubs have no sub-strip (single-page hubs). When the user is on these hubs, the sub-strip does not render.

### 4. `packages/ui/src/components/morph-bar/morph-bar.tsx`

Update the morph bar to conditionally render the sub-strip below it. Add a `subStripTabs` prop (or compose MorphBar + SubStrip in the layout).

### 5. `apps/web/src/app/[locale]/(school)/layout.tsx`

- Determine which hub is active from the current pathname
- Look up `hubSubStripConfigs[activeHub]` to get the tab list
- Filter tabs by user role
- Pass to SubStrip component
- Determine active tab from pathname match

**Transition logic:**

- When navigating from Home to a module: sub-strip slides down (200ms ease-out)
- When navigating back to Home: sub-strip slides up (200ms ease-in)
- When switching between modules: sub-strip content crossfades (150ms)

Use CSS transitions or Framer Motion (already a dependency if available, otherwise CSS-only).

## Verification

1. Navigate to Home — no sub-strip visible, only the 56px morph bar.
2. Click "Finance" hub — sub-strip slides down showing Finance tabs.
3. Click "Invoices" tab — navigates to `/finance/invoices`, tab highlighted.
4. Click "More ▾" — dropdown shows overflow tabs (Audit, Scholarships, Discounts, Assignments).
5. Switch to "People" hub — sub-strip crossfades to People tabs (Students, Staff, Households).
6. Click "Home" — sub-strip slides up and disappears.
7. RTL: tabs flow correctly, "More ▾" at the end side.
8. Dark mode: strip uses `#1E1B19` background with warm text.
9. Mobile: sub-strip becomes horizontally scrollable (basic — refined in chunk 08).

## What NOT to Change

- Do not redesign any page content below the navigation.
- Do not build the home page feed (chunk 06).
- Do not add count badges to tabs yet — that requires API integration per module.
