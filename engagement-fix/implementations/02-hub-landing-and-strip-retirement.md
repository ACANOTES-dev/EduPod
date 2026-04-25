# Implementation 02 — Hub landing + retire in-page strip

> **Wave:** 2 (parallel-risky with Impl 03 — both touch translations)
> **Classification:** frontend
> **Depends on:** 01
> **Deploys:** Web restart only

---

## Goal

Replace the current `/engagement` redirect with a real hub landing page that renders four tiles (Events, Form Templates, Analytics, Consent Archive), and delete the hand-rolled in-page `<nav>` strip from `engagement/layout.tsx` so sub-pages render under the morph shell with no inline navigation. Match the visual + interaction pattern of the existing `/operations` hub at `apps/web/src/app/[locale]/(school)/operations/page.tsx`.

After this impl ships:

- Clicking the Engagement tile in the Operations hub lands on a tile dashboard (not the events list).
- The 4-tab strip (Form Templates, Events, Analytics, Consent Archive) at the top of every engagement sub-page is gone.
- `nav-config.ts` declares `engagement: []` in `hubSubStripConfigs`, signalling intent ("no sub-strip — hub landing IS the navigation surface") and matching how `finance: []`, `people: []`, `wellbeing: []` already behave.
- Mobile (375px) shows tiles in a single column; tablet shows 2 columns; desktop shows 2 columns (matching Operations).

## Shared files this impl touches

- `apps/web/src/app/[locale]/(school)/engagement/page.tsx` — REWRITTEN from redirect to tile dashboard.
- `apps/web/src/app/[locale]/(school)/engagement/layout.tsx` — REWRITTEN to remove the `<nav>` strip; becomes a thin pass-through.
- `apps/web/src/lib/nav-config.ts` — adds `engagement: []` to `hubSubStripConfigs`. **SHARED FILE — Wave 2 sibling (Impl 03) does NOT touch this. Safe.**
- `messages/en.json` — adds the `engagementHub.*` translation namespace (4 tile titles + 4 descriptions + page header). **SHARED FILE with Impl 03 — apply Rule H8/H9.**
- `messages/ar.json` — adds the same keys with Arabic translations. **SHARED FILE with Impl 03 — apply Rule H8/H9.**
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Always in a separate commit.

## What to build

### Sub-step 1: Hub landing page

Create or rewrite `apps/web/src/app/[locale]/(school)/engagement/page.tsx`. Mirror the `/operations` pattern as closely as possible — same imports, same card-config shape, same render structure. Drop any features that don't apply (e.g. the admissions live counter — engagement doesn't need a counter on tiles for this iteration).

```tsx
'use client';

import { ArrowRight, BarChart3, CalendarHeart, ClipboardList, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import type { RoleKey } from '@/lib/route-roles';
import { STAFF_ROLES } from '@/lib/route-roles';

interface EngagementCardConfig {
  key: 'events' | 'form_templates' | 'analytics' | 'consent_archive';
  href: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  glow: string;
  roles: RoleKey[];
  // Permission gate — if the user lacks this, the tile is hidden.
  // Permissions are dot-separated and align with engagement.* checks
  // already enforced server-side.
  permission: string;
}

// Order matters — drives the visual layout.
// Row 1: Events · Form Templates
// Row 2: Analytics · Consent Archive
const CARDS: EngagementCardConfig[] = [
  {
    key: 'events',
    href: '/engagement/events',
    icon: CalendarHeart,
    accent: 'from-rose-400 via-rose-500 to-rose-600',
    iconBg: 'bg-rose-100 text-rose-700',
    glow: 'from-rose-50/80',
    roles: STAFF_ROLES,
    permission: 'engagement.events.view',
  },
  {
    key: 'form_templates',
    href: '/engagement/form-templates',
    icon: ClipboardList,
    accent: 'from-sky-400 via-sky-500 to-sky-600',
    iconBg: 'bg-sky-100 text-sky-700',
    glow: 'from-sky-50/80',
    roles: STAFF_ROLES,
    permission: 'engagement.form_templates.view',
  },
  {
    key: 'analytics',
    href: '/engagement/analytics',
    icon: BarChart3,
    accent: 'from-emerald-400 via-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-100 text-emerald-700',
    glow: 'from-emerald-50/80',
    roles: STAFF_ROLES,
    permission: 'engagement.events.view_dashboard',
  },
  {
    key: 'consent_archive',
    href: '/engagement/consent-archive',
    icon: ShieldCheck,
    accent: 'from-violet-400 via-violet-500 to-violet-600',
    iconBg: 'bg-violet-100 text-violet-700',
    glow: 'from-violet-50/80',
    roles: STAFF_ROLES,
    permission: 'engagement.consent_archive.view',
  },
];

export default function EngagementHubPage() {
  const t = useTranslations('engagementHub');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole, hasPermission } = useRoleCheck();

  const visibleCards = React.useMemo(
    () => CARDS.filter((card) => hasAnyRole(...card.roles) && hasPermission(card.permission)),
    [hasAnyRole, hasPermission],
  );

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10">
      <PageHeader title={t('title')} description={t('description')} />

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2" aria-label={t('cardsAria')}>
        {visibleCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => router.push(`/${locale}${card.href}`)}
              className="group relative flex min-w-0 flex-col gap-6 overflow-hidden rounded-3xl border border-border bg-surface p-7 text-start shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:p-8"
            >
              <div
                className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${card.accent}`}
              />
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.glow} to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
              />

              <div className="relative flex items-start justify-between gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm ring-1 ring-inset ring-black/5 ${card.iconBg}`}
                >
                  <Icon className="h-7 w-7" />
                </div>
                <ArrowRight className="h-5 w-5 text-text-tertiary transition-colors duration-300 group-hover:text-primary-600 rtl:rotate-180" />
              </div>

              <div className="relative min-w-0 space-y-2">
                <h3 className="text-xl font-semibold tracking-tight text-text-primary">
                  {t(`cards.${card.key}.title`)}
                </h3>
                <p className="text-sm leading-relaxed text-text-tertiary">
                  {t(`cards.${card.key}.description`)}
                </p>
              </div>
            </button>
          );
        })}
      </section>
    </div>
  );
}
```

**Important:** the existing `/engagement/page.tsx` is currently a server-component redirect (no `'use client'`). Replace it entirely with this client component. The redirect goes away.

If `useRoleCheck` does not export a `hasPermission` method, fall back to `hasAnyRole` only and add a follow-up note in the completion record. Verify by reading `apps/web/src/hooks/use-role-check.ts` first.

### Sub-step 2: Strip the inline `<nav>` from the layout

Open `apps/web/src/app/[locale]/(school)/engagement/layout.tsx`. The current file is a `'use client'` component that renders a sticky `<nav>` with 4 links + the page children below. Replace the whole file with the simplest possible pass-through:

```tsx
import * as React from 'react';

export default function EngagementLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

This is now a server component (no `'use client'`). It does nothing except render its children. The morph shell (one level up in the tree) handles all chrome.

If there are any imports in the file that are now unused (icons, translation hooks, etc.), they get removed naturally with the rewrite.

### Sub-step 3: Register engagement in `nav-config.ts`

Open `apps/web/src/lib/nav-config.ts`. Find `hubSubStripConfigs` (the object that maps hub keys to sub-strip arrays). Currently it has entries like:

```ts
export const hubSubStripConfigs: Record<string, SubStripConfig[]> = {
  finance: [],
  people: [],
  wellbeing: [],
  // ... but no engagement and no operations
};
```

Add explicit empty-array entries for `engagement` and `operations`:

```ts
export const hubSubStripConfigs: Record<string, SubStripConfig[]> = {
  // ... existing ...
  engagement: [],
  operations: [],
};
```

This signals to the morph-shell sub-strip renderer: "these hubs have no sub-strip; the hub landing IS the navigation surface". Other tile-dashboard hubs already use this pattern.

If the actual structure of `hubSubStripConfigs` is different (e.g. nested config objects, not a plain `Record<string, []>`), adapt the spirit — the goal is to declare engagement intent matching the existing tile-dashboard hubs.

### Sub-step 4: Translation keys

Add the following keys to `messages/en.json` and `messages/ar.json` under a new `engagementHub` namespace.

**`messages/en.json` (additive):**

```json
{
  "engagementHub": {
    "title": "Engagement",
    "description": "Plan events, build forms, track participation, and review consent history.",
    "cardsAria": "Engagement modules",
    "cards": {
      "events": {
        "title": "Events",
        "description": "Plan trips, conferences, and activities. Track participation, consent, and payments."
      },
      "form_templates": {
        "title": "Form Templates",
        "description": "Build bilingual consent forms, surveys, and risk assessments to send to families."
      },
      "analytics": {
        "title": "Analytics",
        "description": "Completion rates, response time trends, and outstanding actions in one place."
      },
      "consent_archive": {
        "title": "Consent Archive",
        "description": "Search, filter, and audit consent history by student, form, or status."
      }
    }
  }
}
```

**`messages/ar.json` (additive — Arabic translations):**

```json
{
  "engagementHub": {
    "title": "المشاركة",
    "description": "خطّط للفعاليات، صمّم النماذج، تتبّع المشاركة، وراجع سجلّ الموافقات.",
    "cardsAria": "وحدات المشاركة",
    "cards": {
      "events": {
        "title": "الفعاليات",
        "description": "خطّط للرحلات والاجتماعات والأنشطة. تتبّع المشاركة والموافقات والمدفوعات."
      },
      "form_templates": {
        "title": "نماذج النماذج",
        "description": "صمّم نماذج موافقة واستطلاعات وتقييمات مخاطر ثنائية اللغة لإرسالها إلى الأسر."
      },
      "analytics": {
        "title": "التحليلات",
        "description": "نسب الإكمال واتجاهات أوقات الاستجابة والإجراءات المعلّقة في مكان واحد."
      },
      "consent_archive": {
        "title": "أرشيف الموافقات",
        "description": "ابحث، صفّ، وراجع سجلّ الموافقات حسب الطالب أو النموذج أو الحالة."
      }
    }
  }
}
```

Apply Rule H9 (deep-merge) — **re-read the file content immediately before writing** in case Impl 03 has touched it. Merge your `engagementHub` namespace alongside whatever else is in the file. Do not overwrite the file with a 30-minute-stale version.

### Sub-step 5: Optional — Mobile spot-check

The existing `<section className="grid grid-cols-1 gap-5 md:grid-cols-2">` already gives mobile-single-column + tablet-2-column responsive behaviour. No additional mobile work needed in this impl. Impl 06 (regression sweep) does the formal Playwright 375px check.

### Sub-step 6: Local regression sweep

Run:

```bash
pnpm turbo run type-check --filter=@school/web
pnpm turbo run lint --filter=@school/web
pnpm turbo run test --filter=@school/web
```

The hub landing page is new code — no existing tests cover it. The layout rewrite removes code; if any existing test asserts the strip's presence, update or delete it.

## Tests

- No new automated tests required for this impl (the page is a pure client component with no business logic). Manual smoke test on production replaces unit tests.
- Regression: `pnpm turbo run test --filter=@school/web` must pass with zero new failures.

## Watch out for

- **Permission gate must hide tiles, not show them disabled.** A user without `engagement.consent_archive.view` should not see the Consent Archive tile at all. Compare to how the Operations hub handles `front_office` for the Admissions tile.
- **`useRoleCheck` may not expose `hasPermission`.** Read the hook before using it. If only `hasAnyRole` exists, fall back to role-only filtering and note in the completion record.
- **Mobile padding.** The `p-7 sm:p-8` matches Operations. On 375px screens, this gives ~28px of inner padding which is correct for mobile.
- **RTL (Arabic).** The `text-start`, `rtl:rotate-180` on the arrow icon, and logical `ms-`/`me-` patterns must be preserved (the snippet above uses them correctly). Do NOT reintroduce `text-left` or `ml-`/`mr-` anywhere.
- **The layout strip removal must not affect any sub-page.** Sub-pages currently render _under_ the strip. After removal, they render directly under the morph-shell content area. If any sub-page has implicit `top-padding` that assumed the strip was there, the page will look slightly closer to the top of the viewport — that's correct behaviour, no fix needed.
- **Sibling Impl 03 also touches `messages/en.json` and `messages/ar.json`.** Apply Rule H8 — buffer your translation additions in your editor, write them in the final commit window, and re-read the file content before writing. Do NOT overwrite the file with a stale version.
- **The `nav-config.ts` change is small but global.** After the change, navigate to `/operations` and verify the morph shell renders the same as before. If anything looks different, the structure of `hubSubStripConfigs` may not be a plain `Record` — re-read and adapt.

## Deployment notes

Web restart only. No migration. No backend. No worker.

1. Commit locally (split into 3 commits if convenient: page+layout / nav-config / translations).
2. Rsync the `apps/web/src/` and `messages/` paths (or full repo with the standard excludes from CLAUDE.md):
   ```bash
   rsync -avz --delete \
     --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='dist' \
     --exclude='.env' --exclude='.env.local' --exclude='.turbo' --exclude='*.tsbuildinfo' \
     /Users/ram/Desktop/SDB/ root@46.62.244.139:/opt/edupod/app/
   ```
3. `ssh root@46.62.244.139 'chown -R edupod:edupod /opt/edupod/app/'`
4. `ssh root@46.62.244.139 'sudo -u edupod bash -lc "cd /opt/edupod/app && rm -rf apps/web/.next && pnpm turbo run build --filter=@school/web --force"'`
5. `ssh root@46.62.244.139 'sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 restart web --update-env'`
6. **Smoke test (mandatory):**
   - `https://nhqs.edupod.app/en/engagement` → renders the new tile dashboard with 4 tiles. Page header reads "Engagement" with the description.
   - Click each of the 4 tiles → routes to the correct sub-page.
   - Open each sub-page directly (`/engagement/events`, `/engagement/analytics`, etc.) — the inline 4-tab strip is GONE.
   - Switch to Arabic (`/ar/engagement`) → tiles render with Arabic titles, RTL layout, arrow icons mirrored.
   - Mobile (375px viewport in browser devtools) → tiles stack to single column, padding still readable.
7. **Pre-deploy serialisation check (Rule 6b):** if Impl 03 is currently in `deploying` state for the `web` target (which it shares), wait for it to flip to `completed` first.
8. Log flips to `completed` in a separate commit after verification.
