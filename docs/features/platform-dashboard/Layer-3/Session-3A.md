# Session 3A -- Dashboard Home Redesign

**Session:** 3A
**Layer:** 3 (Polish & Operations)
**Dependencies:** Layer 1 complete (WebSocket, health, alerts, onboarding), Layer 2 complete (metrics, queues, error diagnostics)
**Estimated effort:** Single session

---

## 1. Objective

Replace the current 4-stat-card platform dashboard (`/admin/page.tsx`) with the mixed-layout operational home screen described in the design spec (section 3.10). The new dashboard assembles five panels:

1. **Health Strip** -- horizontal bar showing Postgres, Redis, Meilisearch, BullMQ, Disk status dots; subscribes to WS `platform:health`
2. **Active Alerts Panel** -- unacknowledged alerts with severity icons and action buttons; subscribes to WS `platform:alerts`; links to full alerts page
3. **Tenant Cards** -- card per tenant with status badge, billing badge, onboarding progress, aggregate metrics (students, staff, active users), health indicator; click navigates to tenant detail page
4. **Activity Feed** -- real-time platform activity (support actions, alert fires/resolves, tenant state changes); subscribes to WS `platform:activity`
5. **Quick Actions** -- button bar for common actions (create tenant, impersonate, view queues)

**No new backend endpoints are required.** This session consumes APIs built in Layer 1 and Layer 2.

---

## 2. APIs Consumed

All existing, built in Layers 1-2:

| API                                                    | Purpose                        | Source             |
| ------------------------------------------------------ | ------------------------------ | ------------------ |
| `GET /v1/admin/dashboard`                              | Tenant/user aggregate counts   | Layer 0 (existing) |
| `GET /v1/admin/tenants?pageSize=100`                   | Full tenant list for cards     | Layer 0 (existing) |
| `GET /v1/admin/health/history`                         | Health component status        | Layer 1            |
| `GET /v1/admin/alerts/history?status=fired&pageSize=5` | Active (unacknowledged) alerts | Layer 1            |
| `PATCH /v1/admin/alerts/history/:id/acknowledge`       | Acknowledge alert from panel   | Layer 1            |
| `GET /v1/admin/tenants/:id/onboarding`                 | Onboarding progress per tenant | Layer 1            |
| `GET /v1/admin/tenants/:id/metrics`                    | Aggregate metrics per tenant   | Layer 2            |
| WebSocket `platform:health`                            | Real-time health updates       | Layer 1            |
| WebSocket `platform:alerts`                            | Real-time alert events         | Layer 1            |
| WebSocket `platform:activity`                          | Real-time activity feed        | Layer 1            |

---

## 3. Component Breakdown

### 3.1 HealthStrip

**File:** `apps/web/src/app/[locale]/(platform)/admin/_components/health-strip.tsx`

**Behaviour:**

- Horizontal bar with one item per health component: Postgres, Redis, Meilisearch, BullMQ, Disk
- Each item shows: component name + colored status dot (green = healthy, amber = degraded, red = unhealthy)
- On mount: fetch latest health from `GET /v1/admin/health/history?limit=1`
- Subscribe to WebSocket channel `platform:health` for live updates
- Click a component to navigate to `/admin/health` (anchored to that component)

**Props:**

```typescript
interface HealthStripProps {
  className?: string;
}
```

**Internal state:**

```typescript
interface ComponentHealth {
  name: string; // 'postgres' | 'redis' | 'meilisearch' | 'bullmq' | 'disk'
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency_ms?: number;
}
```

**Skeleton:** 5 horizontal shimmer boxes matching the strip layout.

### 3.2 ActiveAlertsPanel

**File:** `apps/web/src/app/[locale]/(platform)/admin/_components/active-alerts-panel.tsx`

**Behaviour:**

- Shows up to 5 unacknowledged alerts sorted by severity (critical first), then by `fired_at` desc
- Each alert row: severity icon (red circle for critical, amber triangle for warning, blue info for info), alert message, relative timestamp (e.g., "2 min ago"), Acknowledge button
- Acknowledge button calls `PATCH /v1/admin/alerts/history/:id/acknowledge`, then removes from list
- "View All" link at top-right navigates to `/admin/alerts`
- Subscribe to WebSocket channel `platform:alerts` for new alerts (prepend to list) and resolved alerts (remove from list)
- When empty: show subtle "No active alerts" message with a green checkmark icon

**Props:**

```typescript
interface ActiveAlertsPanelProps {
  className?: string;
}
```

### 3.3 TenantCards

**File:** `apps/web/src/app/[locale]/(platform)/admin/_components/tenant-cards.tsx`

**Behaviour:**

- Fetch tenant list from `GET /v1/admin/tenants?pageSize=100` on mount
- For each tenant, fetch latest metrics from `GET /v1/admin/tenants/:id/metrics` (parallel, with error tolerance -- if metrics fail for one tenant, show "N/A")
- For tenants with `status === 'onboarding'` (or those that have an onboarding tracker), fetch `GET /v1/admin/tenants/:id/onboarding` to get step progress
- Render a card per tenant showing:
  - Tenant name (bold)
  - Status badge: `active` (green), `suspended` (red), `archived` (gray)
  - Billing badge: `active` (green), `past_due` (amber), `cancelled` (red) -- from `billing_status` field
  - If onboarding in progress: progress bar showing `completed / total` steps
  - Metrics row: students count, staff count, active users (24h)
  - Health indicator dot at top-right (derived from tenant-specific error rate from metrics)
- Click card navigates to `/admin/tenants/[id]`
- Last card is always a "+ New Tenant" card that navigates to `/admin/tenants/new`
- Cards use responsive grid: 1 column on mobile, 2 on `sm:`, 3 on `lg:`

**Props:**

```typescript
interface TenantCardsProps {
  className?: string;
}
```

### 3.4 ActivityFeed

**File:** `apps/web/src/app/[locale]/(platform)/admin/_components/activity-feed.tsx`

**Behaviour:**

- Displays a chronological list of platform-level activity events
- On mount: fetch recent activity (support actions from audit log, alert events, tenant state changes) -- the exact API depends on what Layer 1/2 built. If a unified activity endpoint exists, use it. Otherwise, merge results from:
  - `GET /v1/admin/alerts/history?pageSize=10` (alert events)
  - `GET /v1/admin/audit-actions?pageSize=10` (support actions, once 3B is built -- degrade gracefully if 404)
- Subscribe to WebSocket channel `platform:activity` for real-time updates (prepend new events)
- Each event: icon (by type), description text, relative timestamp
- "View All" link at top-right (navigates to `/admin/audit-log` or a dedicated activity page)
- Max 10 items displayed; scroll for overflow
- When empty: show "No recent activity" placeholder

**Props:**

```typescript
interface ActivityFeedProps {
  className?: string;
}
```

### 3.5 QuickActions

**File:** `apps/web/src/app/[locale]/(platform)/admin/_components/quick-actions.tsx`

**Behaviour:**

- Horizontal button bar with common platform actions:
  - **Create Tenant** -- navigates to `/admin/tenants/new`
  - **View Queues** -- navigates to `/admin/queues`
  - **View Alerts** -- navigates to `/admin/alerts`
  - **View Health** -- navigates to `/admin/health`
- Each button: icon + label, styled as secondary/outlined button
- On mobile: wrap to 2x2 grid
- Uses `useParams` to read locale for href construction

**Props:**

```typescript
interface QuickActionsProps {
  className?: string;
}
```

---

## 4. Page Layout

**File:** `apps/web/src/app/[locale]/(platform)/admin/page.tsx` (complete rewrite)

Layout structure:

```
<PageHeader title="Platform Dashboard" description="..." />

<HealthStrip />                           // full width

<div grid 2-column on lg:>
  <div left-column>
    <ActiveAlertsPanel />                 // full width of left col
    <TenantCards />                       // full width of left col
  </div>
  <div right-column>
    <QuickActions />                      // right col top
    <ActivityFeed />                      // right col bottom, fills remaining
  </div>
</div>
```

On mobile (below `lg:`): single column, all panels stacked vertically in order: Health Strip, Active Alerts, Tenant Cards, Quick Actions, Activity Feed.

---

## 5. Files to Create

| File                                                                             | Purpose                           |
| -------------------------------------------------------------------------------- | --------------------------------- |
| `apps/web/src/app/[locale]/(platform)/admin/_components/health-strip.tsx`        | Health status strip component     |
| `apps/web/src/app/[locale]/(platform)/admin/_components/active-alerts-panel.tsx` | Active alerts panel component     |
| `apps/web/src/app/[locale]/(platform)/admin/_components/tenant-cards.tsx`        | Tenant summary cards component    |
| `apps/web/src/app/[locale]/(platform)/admin/_components/activity-feed.tsx`       | Real-time activity feed component |
| `apps/web/src/app/[locale]/(platform)/admin/_components/quick-actions.tsx`       | Quick action buttons component    |

## 6. Files to Modify

| File                                                  | Change                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/web/src/app/[locale]/(platform)/admin/page.tsx` | Complete rewrite -- replace StatCard dashboard with mixed layout importing the 5 new components |

---

## 7. WebSocket Integration Notes

The WebSocket client should already be set up in Layer 1. The dashboard components need to:

1. Import the shared WebSocket hook/context from the platform layout (created in Layer 1)
2. Subscribe to the appropriate channels on mount
3. Unsubscribe on unmount (cleanup in `useEffect` return)
4. Handle reconnection gracefully (re-fetch latest state on reconnect)

If the WebSocket client is not yet available (e.g., Layer 1 used polling), fall back to polling with:

- Health: poll every 30 seconds
- Alerts: poll every 15 seconds
- Activity: poll every 30 seconds

---

## 8. Testing Strategy

### Frontend Tests

Since this is a pure frontend session with no new backend work, testing focuses on:

1. **Component rendering tests** (optional, lightweight):
   - Each component renders without crashing when given mock data
   - Loading states show skeletons
   - Error states show error messages
   - Empty states show appropriate placeholders

2. **Manual verification (mandatory):**
   - Dashboard loads and shows all 5 panels
   - Health strip reflects actual component status
   - Alerts panel shows real unacknowledged alerts; acknowledge button works
   - Tenant cards show correct data for each tenant; click navigates to detail
   - Activity feed shows recent events; updates in real-time via WebSocket
   - Quick actions navigate to correct pages
   - Mobile layout: all panels stack vertically, no horizontal overflow
   - RTL layout: logical properties used, no directional breakage

### Regression

Run `turbo test` to verify no existing tests broken by the page rewrite.

---

## 9. Acceptance Criteria

- [ ] Old 4-stat-card dashboard is fully replaced
- [ ] Health strip shows 5 components with correct status colors
- [ ] Health strip updates via WebSocket (or polling fallback)
- [ ] Active alerts panel shows up to 5 unacknowledged alerts
- [ ] Acknowledge button removes alert from panel
- [ ] "View All" link navigates to alerts page
- [ ] Tenant cards show one card per tenant with name, status, billing, metrics
- [ ] Onboarding progress shown for tenants still onboarding
- [ ] "+ New Tenant" card navigates to tenant creation
- [ ] Click tenant card navigates to tenant detail page
- [ ] Activity feed shows recent platform activity
- [ ] Activity feed updates in real-time
- [ ] Quick actions bar shows 4 buttons with correct navigation
- [ ] Responsive: single column on mobile, 2-column grid on desktop
- [ ] RTL-safe: all styling uses logical properties (no `ml-`, `mr-`, `pl-`, `pr-`, etc.)
- [ ] No `any` types, no `@ts-ignore`, all imports ordered
- [ ] `turbo lint` and `turbo type-check` pass
- [ ] `turbo test` passes with zero regressions
