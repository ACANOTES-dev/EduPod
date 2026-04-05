# Chunk 03 — Morph Bar (Global Navigation)

## What This Does

Replaces the 260px sidebar with the dark "Morph Bar" — a 56px top navigation bar with 7 hub pills. This is the biggest structural change in the redesign. The sidebar is removed entirely.

## Pre-Read

- `docs/plans/ux-redesign-final-spec.md` — Section 3a (The Morph Bar), Section 10 (Navigation Flow)
- `packages/ui/src/components/app-shell/` — all current shell components (sidebar.tsx, top-bar.tsx, app-shell.tsx, mobile-sidebar.tsx, sidebar-item.tsx, sidebar-section.tsx)
- `apps/web/src/app/[locale]/(school)/layout.tsx` — current school shell orchestration
- `apps/web/src/lib/nav-config.ts` — current navigation structure

## New Components to Create

### 1. `packages/ui/src/components/morph-bar/morph-bar.tsx`

The main dark navigation bar. Specs:

- **Height:** 56px, full width, fixed/sticky top
- **Background:** `var(--color-bar-bg)` — `#1C1917` light / `#12100E` dark
- **Z-index:** Above all content (z-50)
- **Layout:** Flex row, items-center, justify-between
- **Left section:** Logo (28px emerald gradient square + "EduPod" in Figtree 15px weight-700, white text)
- **Center section:** Hub pills row
- **Right section:** Search pill + Notification bell + User avatar

**Props:**

```typescript
interface MorphBarProps {
  schoolName: string;
  logoUrl?: string;
  activeHub: string | null; // null = Home
  hubs: HubConfig[];
  onHubClick: (hubKey: string) => void;
  onSearchClick: () => void;
  notificationCount: number;
  onNotificationClick: () => void;
  userAvatar?: string;
  userName: string;
  onUserClick: () => void;
}
```

### 2. `packages/ui/src/components/morph-bar/hub-pill.tsx`

Individual hub navigation pill.

- **Typography:** Figtree 13px weight-500 (`hub-item` token)
- **Default state:** `var(--color-bar-text)`, transparent bg
- **Hover:** `rgba(255,255,255,0.06)` bg
- **Active:** `var(--color-bar-active-bg)` bg, `var(--color-bar-text-active)` text, weight-600
- **Shape:** `border-radius: 9999px` (pill), padding 8px 14px
- **Cursor:** pointer

### 3. `packages/ui/src/components/morph-bar/search-pill.tsx`

The search trigger in the morph bar.

- **Background:** `rgba(255,255,255,0.08)` (frosted)
- **Text:** Ghost placeholder text "Search..." with ⌘K hint
- **Shape:** Pill, ~200px width
- **Click:** Opens command palette (calls `onSearchClick`)

### 4. `packages/ui/src/components/morph-bar/index.ts`

Barrel export for all morph-bar components.

## Files to Modify

### 5. `packages/ui/src/components/app-shell/app-shell.tsx`

Rewrite the AppShell layout:

**Current structure:**

```
<div class="flex h-screen">
  <Sidebar />          ← 260px fixed left
  <div class="flex-1">
    <TopBar />          ← 56px sticky
    <main />            ← remaining
  </div>
</div>
```

**New structure:**

```
<div class="flex flex-col h-screen">
  <MorphBar />          ← 56px fixed top
  <SubStrip />          ← 44px (only when inside a module, chunk 04)
  <main class="flex-1 overflow-y-auto" />
</div>
```

The sidebar components (`sidebar.tsx`, `sidebar-item.tsx`, `sidebar-section.tsx`, `mobile-sidebar.tsx`) remain in the codebase but are no longer rendered. Do NOT delete them yet — they'll be removed in a cleanup pass after the full migration is verified.

### 6. `apps/web/src/app/[locale]/(school)/layout.tsx`

Major rewrite of the school shell:

- Remove sidebar rendering, sidebar state management, sidebar toggle
- Add MorphBar with hub configuration
- Map the current 14-section nav config to 7 hubs (see hub mapping below)
- Determine `activeHub` from the current route pathname
- Keep: command palette, notification panel, auth guards, providers

### 7. `apps/web/src/lib/nav-config.ts`

Add a new `hubConfigs` export alongside the existing `navSectionConfigs` (keep the old one for reference during migration):

```typescript
export interface HubConfig {
  key: string;
  labelKey: string;
  /** Base path — used to determine activeHub from pathname */
  basePaths: string[];
  /** Role filter — if set, hub only visible to these roles */
  roles?: RoleKey[];
}

export const hubConfigs: HubConfig[] = [
  {
    key: 'home',
    labelKey: 'nav.home',
    basePaths: ['/dashboard'],
  },
  {
    key: 'people',
    labelKey: 'nav.people',
    basePaths: ['/students', '/staff', '/households'],
    roles: STAFF_ROLES,
  },
  {
    key: 'learning',
    labelKey: 'nav.learning',
    basePaths: [
      '/classes',
      '/subjects',
      '/curriculum-matrix',
      '/class-assignments',
      '/attendance',
      '/gradebook',
      '/homework',
      '/report-cards',
      '/promotion',
      '/diary',
    ],
    roles: [...STAFF_ROLES, 'parent'],
  },
  {
    key: 'operations',
    labelKey: 'nav.operations',
    basePaths: ['/admissions', '/communications', '/approvals', '/scheduling', '/rooms'],
    roles: STAFF_ROLES,
  },
  {
    key: 'finance',
    labelKey: 'nav.finance',
    basePaths: ['/finance', '/payroll'],
    roles: [...ADMIN_ROLES, 'parent'],
  },
  {
    key: 'reports',
    labelKey: 'nav.reports',
    basePaths: ['/reports'],
  },
  {
    key: 'settings',
    labelKey: 'nav.settings',
    basePaths: ['/settings', '/closures', '/behaviour/settings', '/website'],
    roles: ADMIN_ROLES,
  },
];
```

**Role-based hub filtering (from spec):**

| Role              | Visible Hubs                      |
| ----------------- | --------------------------------- |
| Principal / Admin | All 7                             |
| Teacher           | Home, Learning, Reports           |
| Accounting        | Home, Finance, Reports            |
| Front Office      | Home, People, Operations, Reports |
| Parent            | Home, Learning, Finance           |

## RTL Considerations

- The morph bar layout is the same in RTL — hub pills flow naturally with `flex` direction.
- Logo stays at the `start` side (left in LTR, right in RTL).
- Search/notification/avatar stay at the `end` side.
- Use `ms-`/`me-` for all internal spacing.

## Verification

1. The sidebar is gone. Full-width content on every page.
2. The dark morph bar appears at the top with 7 hub pills.
3. Clicking a hub navigates to the first route in that hub's `basePaths`.
4. The active hub is highlighted with emerald pill styling.
5. On the Home/dashboard page, no hub is highlighted (or Home is highlighted).
6. Search pill opens the command palette.
7. Notification bell shows unread count.
8. Avatar shows user menu.
9. RTL: bar mirrors correctly, logo on right, actions on left.
10. Dark mode: bar uses `#12100E` background (darker than content area).

## What NOT to Change

- Do not build the sub-strip yet (chunk 04).
- Do not redesign the home page content (chunk 06).
- Do not change any module page content — only the shell around it.
- Keep the `(platform)/` admin layout untouched — it retains its own sidebar.
