# Chunk 06 — Home Page Redesign

## What This Does

Replaces the current static stat-card dashboard with the feed-driven two-column layout: priority feed + activity feed on the left, context panel (school snapshot + this week + quick actions) on the right.

This chunk builds the Principal/Admin variant. Role-specific variants are in chunk 09.

## Pre-Read

- `docs/plans/ux-redesign-final-spec.md` — Section 4 (Home Page), all subsections
- `apps/web/src/app/[locale]/(school)/dashboard/page.tsx` — current dashboard
- The morph bar from chunks 03-04 (Home = no sub-strip visible)

## New Components to Create

All in `apps/web/src/app/[locale]/(school)/dashboard/_components/`:

### 1. `greeting-row.tsx`

- **Left:** "Good morning, {firstName}" in `heading-1` (24px, weight-700), `var(--color-text-primary)`
- **Subtext:** Day/date + school name in `caption` (12px), `var(--color-text-tertiary)`
- **Right:** Live pulse tag — `var(--color-surface-secondary)` bg, pill shape, caption text, with 6px pulsing emerald dot (CSS animation, 2s ease-in-out infinite)
- Greeting changes by time of day: "Good morning" / "Good afternoon" / "Good evening"

### 2. `priority-feed.tsx`

"Needs Your Attention" card:

- **Card:** `var(--color-surface)` bg, 1px `var(--color-border)`, 16px radius
- **Header:** `heading-3` with count badge (`var(--color-danger-fill)` bg, `var(--color-danger-text)`)
- **Items:** Each has a 36px tinted icon square (10px radius) + title (`body-medium`) + description (`caption`, `var(--color-text-tertiary)`) + action button
- **Action button:** `var(--color-primary-50)` bg, `var(--color-primary-600)` text, pill, 12px weight-600
- **Max 5 items**, "View all →" link at bottom
- **Item sources:** Aggregate from API — overdue invoices, pending approvals, expiring items, unresolved incidents

### 3. `activity-feed.tsx`

"Today's Activity" card:

- Same card structure as priority feed, no action buttons
- Chronological event stream from audit log API
- Each item: tinted icon + title + optional description + relative timestamp
- "View all →" in header

### 4. `school-snapshot.tsx`

Right column — compact stat rows:

- 28px tinted icon (emerald for students, blue for staff, etc.) + label (`caption`) + value (`body` weight-700)
- Each row clickable → navigates to the relevant domain
- Stats: Students count, Staff count, Classes count, Attendance %, Revenue collected

### 5. `this-week-card.tsx`

Progress bars card:

- Label + percentage + 6px bar
- Colours: emerald (attendance), amber (survey), blue (fee collection)
- Bars animate on load, 0.6s ease CSS transition

### 6. `quick-actions.tsx`

2-column grid of pill action buttons:

- `var(--color-surface-secondary)` bg, 10px radius, `caption` weight-500
- Hover: `var(--color-primary-50)` bg, `var(--color-primary-700)` text
- Actions: Register Family, Take Attendance, New Invoice, Send Announcement, Find Student

## Files to Modify

### 7. `apps/web/src/app/[locale]/(school)/dashboard/page.tsx`

Rewrite the page layout:

```
<div class="flex gap-6 p-8">
  <!-- Left column: flexible -->
  <div class="flex-1 min-w-0 space-y-6">
    <GreetingRow />
    <PriorityFeed />
    <ActivityFeed />
  </div>
  <!-- Right column: fixed 360px -->
  <div class="hidden lg:block w-[360px] shrink-0 space-y-6">
    <SchoolSnapshot />
    <ThisWeekCard />
    <QuickActions />
  </div>
</div>
```

### Data Fetching

Each component fetches its own data using the existing `apiClient` pattern:

- **Priority feed:** New API endpoint or aggregate from existing endpoints (overdue invoices count, pending approvals count, etc.)
- **Activity feed:** Existing audit log endpoint with `page=1&pageSize=10`
- **School snapshot:** Existing dashboard stats endpoint (or individual count endpoints)
- **This week:** Existing analytics/stats endpoints
- **Quick actions:** Static data, no API needed

If dashboard API endpoints don't exist yet for aggregated priority items, create a simple component that shows placeholder data and mark the API integration as a follow-up task. Do NOT block the visual redesign on backend work.

## Mobile Layout

- Single column, right panel stacks below left
- Quick actions become a horizontally scrollable pill row above the feed
- Snapshot becomes a 2x2 compact stat grid

```
<div class="lg:hidden">
  <!-- Quick actions: horizontal scroll -->
  <QuickActions variant="horizontal" />
  <!-- Snapshot: compact grid -->
  <SchoolSnapshot variant="compact" />
</div>
```

## Verification

1. Home page shows the two-column layout on desktop (≥1024px).
2. Greeting shows correct time-of-day text with the user's first name.
3. Priority feed card renders with tinted icons and action buttons.
4. Activity feed shows chronological events.
5. School snapshot shows clickable stat rows.
6. Progress bars animate on load.
7. Quick action pills have correct hover state.
8. Mobile: single column, scrollable actions, compact stats.
9. RTL: layout mirrors, text alignment correct.
10. Dark mode: all cards use warm surface, text is readable.
11. On Home, the morph bar has no sub-strip visible.

## What NOT to Change

- Do not build teacher/parent/accounting role variants yet (chunk 09).
- Do not modify any module pages.
- Do not create new backend endpoints — use existing ones or placeholder data.
