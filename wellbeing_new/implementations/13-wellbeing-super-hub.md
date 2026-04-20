# Implementation 13 — Wellbeing Super-Hub + Sub-Strip Removal

> **Wave:** 5 (**parallel-risky** — apply rules H1–H10)
> **Classification:** frontend
> **Depends on:** 03, 12
> **Deploys:** Web restart only

---

## Goal

Create the new `/wellbeing` landing — the WOW-grade super-hub that replaces the morph-bar sub-strip pattern entirely. Modelled on `/people` (the user's favourite reference), with KPI strip, quick actions, six hub navigation cards (with dynamic counts and tooltips), pending-attention banner, and a recent activity feed. Remove `hubSubStripConfigs.wellbeing` from nav-config so the morph-bar Wellbeing pill always lands users on the new hub.

This is the **showpiece** of the rebuild. Use the `frontend-design` skill freely; be bold. The user has explicitly endorsed experimentation here. Aim for "screams WOW" — dynamic cards, gradient accents, motion (subtle stagger on load, hover lift + glow), tooltips on every tile, polished typography, distinctive treatment that doesn't feel like generic AI-rendered UI.

## Shared files this impl touches

- `apps/web/src/lib/nav-config.ts` — set `hubSubStripConfigs.wellbeing = []` and ensure morph-bar pill resolves to `/wellbeing`. Edit late, single line block.
- `apps/web/messages/en.json` + `ar.json` — add `wellbeingHub.*` namespace. Apply Rules H8 + H9 — scratch first, deep-merge in final commit window.
- `apps/web/src/components/kpi-tile.tsx` — NEW (extract `KpiTile` from `/people/_components/dashboard-parts.tsx` to `apps/web/src/components/kpi-tile.tsx` for cross-module reuse). The original stays in place re-exporting from the new location for back-compat. Coordinate carefully with sibling impls 14, 15, 16, 17 — all of them want to import KpiTile. Suggested rule: **impl 13 owns the KpiTile extraction. Impls 14–17 import from `@/components/kpi-tile`.** Communicate this in your completion record so siblings pick it up.
- `apps/web/src/components/quick-action.tsx` — NEW (same extraction logic for `QuickAction` from `/finance/page.tsx`).
- `apps/web/src/components/hub-tile.tsx` — NEW (extract the hub-tile button pattern from `/people/page.tsx` lines ~450–488 into a reusable component).
- `apps/web/src/components/page-header.tsx` — already exists; verify, don't duplicate.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **HIGHEST in this wave.** This impl is the foundation for sibling impls 14–17 to import shared components. **Ship the component extractions first** (own commit), so siblings don't race you trying to import a file that doesn't exist yet.

## What to build

### 1. Component extractions (commit 1 of this impl)

Create three reusable components in `apps/web/src/components/`:

#### `kpi-tile.tsx`

Copy the existing `KpiTile` implementation from `apps/web/src/app/[locale]/(school)/people/_components/dashboard-parts.tsx`. Extend with optional `tooltip?: string` prop that wraps the rendered tile in a Radix tooltip. Re-export from the original location:

```ts
// apps/web/src/app/[locale]/(school)/people/_components/dashboard-parts.tsx
export { KpiTile, CardSkeleton, UtilisationBadge } from '@/components/kpi-tile';
```

#### `quick-action.tsx`

Extract the Finance quick-action pattern (lines ~103–132 of `/finance/page.tsx`). Props: `icon: LucideIcon`, `label: string`, `href: string`, `accent: string` (Tailwind bg/text class), `gradient: string` (Tailwind gradient class for the bottom accent bar), `tooltip?: string`. Renders the same compact pill with icon, label, hover-arrow, hover-bottom-bar.

#### `hub-tile.tsx`

Extract the hub-tile button pattern from `/people/page.tsx` lines ~450–488. Props: `icon: LucideIcon`, `title: string`, `description: string`, `href: string`, `accent: string` (gradient for top bar), `iconBg: string` (icon container colour), `glow: string` (gradient for hover overlay), `count?: number` (badge top-right; renders only when > 0), `tooltip?: string`, `onClick?: () => void`.

Commit 1 commits these three files plus the people re-export. Pathspec the four files explicitly.

### 2. New super-hub page (commit 2)

Create `apps/web/src/app/[locale]/(school)/wellbeing/page.tsx`.

Top-down structure (per `wellbeing_new/PLAN.md` §2a):

```tsx
'use client';

export default function WellbeingHubPage() {
  const t = useTranslations('wellbeingHub');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();

  const [summary, setSummary] = React.useState<WellbeingDashboardSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    apiClient<{ data: WellbeingDashboardSummary }>('/api/v1/wellbeing/dashboard-summary')
      .then((res) => {
        if (!cancelled) setSummary(res.data);
      })
      .catch((err) => {
        console.error('[WellbeingHub] dashboard summary failed', err);
        if (!cancelled) setError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  // Render: PageHeader → PendingAttentionBanner → KPIs → QuickActions → HubCards → RecentActivity → ResourceRibbon
}
```

#### Sections

1. **PageHeader** — title (`t('title')`), description (`t('description')`).
2. **PendingAttentionBanner** — only renders when `summary.pending_attention.length > 0`. Cards stack horizontally on desktop (snap-scroll) or vertically on mobile. Each card: severity-coloured left border, icon, title, detail, due-date pill, "View" link to `href`. Cap at first 5 visible; "+N more" link to a future `/wellbeing/attention` page (out-of-scope; for now, link to `/behaviour/tasks`).
3. **KpiTile strip** — 4-column grid (`grid-cols-2 sm:grid-cols-4`). Tooltips on each tile explaining what the number means.
4. **QuickAction grid** — 4-column grid. Bold gradient bottom bars on hover.
5. **HubTile grid** — 6 cards in a 2-column grid (`md:grid-cols-2 xl:grid-cols-3`). Each tile rendered with its dynamic count badge (from `summary.hub_counts`), tooltip, and gradient. Filtered by role + module flag — invisible cards aren't rendered. Stagger animation on mount: tiles fade-in with 60ms incremental delay (use Tailwind's `animation-delay-*` utilities or a small framer-motion wrapper if available; investigate first — don't add a new dep).
6. **RecentActivity feed** — last 8 events from `summary.recent_activity`. Each row: kind icon (incident=triangle, concern=heart, ack=check, etc.), title, actor name, relative time. Click → navigates to event's `href`.
7. **ResourceRibbon** — small footer band (admin/teacher only, hidden if no resources). Three quick links to support docs, EAP, training.

#### Visual treatment

- Page wrapper: `flex min-w-0 flex-col gap-8 pb-10`
- Use the design tokens from `docs/plans/ux-redesign-final-spec.md` — never hardcode hex
- Hub tile gradients (suggested):
  - Behaviour: `from-rose-400 via-rose-500 to-rose-600` icon `bg-rose-100 text-rose-700`
  - Pastoral: `from-pink-400 via-pink-500 to-pink-600` icon `bg-pink-100 text-pink-700`
  - Safeguarding: `from-slate-500 via-slate-600 to-slate-700` icon `bg-slate-100 text-slate-700`
  - Early Warnings: `from-amber-400 via-amber-500 to-amber-600` icon `bg-amber-100 text-amber-700`
  - Staff Wellbeing: `from-violet-400 via-violet-500 to-violet-600` icon `bg-violet-100 text-violet-700`
  - Settings: `from-zinc-400 via-zinc-500 to-zinc-600` icon `bg-zinc-100 text-zinc-700`
- Use `frontend-design` skill for the polish pass — distinctive section headers, opinionated spacing, decorative elements where they earn their keep. Avoid generic flat cards.
- Mobile: tiles stack to single column; KPI grid collapses to 2-column; pending-attention switches to vertical scroll list.

### 3. Nav-config edit (commit 3)

Edit `apps/web/src/lib/nav-config.ts`:

- Find `hubSubStripConfigs` and set `wellbeing: []` (replace the existing array).
- Find the morph-bar Wellbeing pill resolver (likely a `defaultHref` field on the wellbeing entry in `hubConfigs`). Set `defaultHref: '/wellbeing'`. If no `defaultHref` mechanism exists, add one — coordinate with the shell rendering code.
- Verify the wellbeing hub still highlights when on `/behaviour`, `/pastoral`, etc. (basePaths matching).
- Read the file fresh immediately before editing (Rule H9). Pathspec exactly that one file. Commit.

### 4. Translation additions (commit 4)

Apply Rule H8 — scratch first, deep-merge into `en.json` + `ar.json` in this final commit. New namespace `wellbeingHub`:

```json
{
  "wellbeingHub": {
    "title": "Wellbeing & Safeguarding",
    "description": "Monitor student wellbeing, manage incidents and safeguarding, support staff, and surface early warnings — all in one place.",
    "loadError": "Couldn't load the wellbeing summary. Refresh to try again.",
    "kpis": {
      "studentsAtRisk": "At risk",
      "openIncidents": "Open incidents",
      "openCases": "Open pastoral cases",
      "overdueActions": "Overdue actions"
    },
    "quickActions": {
      "logIncident": "Log incident",
      "logConcern": "Log concern",
      "declareCritical": "Declare critical incident",
      "openCase": "Open pastoral case"
    },
    "cards": {
      "behaviour": {
        "title": "Behaviour",
        "description": "Incidents, sanctions, exclusions, recognition, analytics, and AI insights.",
        "tooltip": "Manage student behaviour end-to-end"
      },
      "pastoral": {
        "title": "Pastoral Care",
        "description": "Concerns, cases, interventions, referrals, SST meetings, and check-ins.",
        "tooltip": "Coordinated pastoral support"
      },
      "safeguarding": {
        "title": "Safeguarding",
        "description": "Concern reporting, SLA tracking, break-glass access, sealing.",
        "tooltip": "Designated safeguarding workspace"
      },
      "earlyWarnings": {
        "title": "Early Warnings",
        "description": "Risk indicators across attendance, grades, behaviour, wellbeing, engagement.",
        "tooltip": "At-risk student identification"
      },
      "staffWellbeing": {
        "title": "Staff Wellbeing",
        "description": "Workload analytics, surveys, board reports, EAP resources.",
        "tooltip": "Take care of the people who teach"
      },
      "settings": {
        "title": "Settings & Policies",
        "description": "Categories, policies, awards, houses, document templates, EAP config.",
        "tooltip": "Configure the wellbeing module"
      }
    },
    "pendingAttention": {
      "title": "Needs your attention",
      "viewMore": "View more",
      "noItems": "All caught up."
    },
    "recentActivity": { "title": "Recent activity", "viewAll": "View all" },
    "resourceRibbon": {
      "supportDocs": "Support docs",
      "eap": "Employee Assistance",
      "training": "Staff training"
    }
  }
}
```

Arabic mirrors structure key-for-key. Commit only `en.json` and `ar.json` in this commit.

## Tests

- `wellbeing/page.spec.tsx`:
  - Renders all 6 hub cards with correct hrefs
  - Filters cards by role (parent role sees subset)
  - Filters cards by module flag (behaviour disabled → no behaviour card)
  - Loading state shows skeletons
  - Error state shows the error message + retry
- Playwright check: navigate to `/en/wellbeing`, snapshot, confirm KPIs visible, hover a tile, click through to behaviour, navigate back, confirm hub re-renders.

## Watch out for

- **Component extraction race** — sibling impls 14, 15, 16, 17 all want `KpiTile`, `QuickAction`, `HubTile` from your new locations. Get commit 1 (extractions) in BEFORE you start commit 2 (the page). Tell siblings via your completion record where the components live.
- **Nav-config edit conflict** — sibling impl 17 and 18 may also touch nav-config (impl 17 to add a safeguarding entry, impl 18 to add the AI flags admin entry). Suggested coordination: Communicate via completion record. Use deep-merge mental model when editing — read fresh, append your additions, save.
- **Page already exists?** Verify `apps/web/src/app/[locale]/(school)/wellbeing/page.tsx` is genuinely missing (the audit said it was). If it exists, STOP and resolve with the user before overwriting.
- **Use `frontend-design` skill freely** — your design choices land on production. Be bold. Iterate.

## Deployment notes

- Restart: web only.
- Smoke (this is the showpiece — verify thoroughly):
  - `/en/wellbeing` renders the new super-hub end-to-end
  - All 6 hub tiles visible (as principal — fewer if you switch to teacher / parent test accounts)
  - KPI strip shows real numbers from impl 03's endpoint
  - Click each tile, navigates correctly
  - Hover any tile, lift + glow effect
  - Mobile (375px viewport): single-column tiles, two-column KPIs, navigation usable
  - `/ar/wellbeing` renders fully right-to-left with Arabic strings
- Take a Playwright snapshot of the new hub for visual verification.
