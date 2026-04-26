# Implementation 12 — Translation Backfill (English + Arabic)

> **Wave:** 4 (**parallel-risky** — apply rules H1–H10, especially H8 + H9)
> **Classification:** frontend (i18n)
> **Depends on:** 02
> **Deploys:** Web restart only

---

## Goal

The `behaviour.*` and `behaviourSettings.*` translation namespaces are substantially missing from `messages/en.json`, with NO Arabic equivalents. The visible result today: every behaviour page renders raw keys (`behaviour.dashboard.stats.totalIncidents`, `behaviour.tasks.statsPending0`, `behaviour.recognition.tabs.wallShort`, etc.) and the console fills with `MISSING_MESSAGE` errors on every navigation. This impl exhaustively backfills both locales, organised by page area, in a single coordinated edit.

After this impl ships, every existing behaviour and behaviour-settings page renders fully localised in both `en` and `ar`. Subsequent waves (5, 6) add new keys for new pages — those land in the same files in their own commits.

## Shared files this impl touches

- `apps/web/messages/en.json` — heavy edit. Apply Rules H8 (scratch first, add in final commit window) and H9 (deep-merge, never replace).
- `apps/web/messages/ar.json` — same edit, in Arabic.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **HIGH.** Both locale files are touched by impls 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24 — every Wave 5 and Wave 6 impl, plus polish. This impl runs in Wave 4, so siblings 10 and 11 are NOT touching translations — the only concurrent risk is sibling-of-this-impl, which is none. **But:** if any Wave 5 impl starts before this impl's commit lands, you'll race them. Per the wave model, Waves 5 and 6 wait for Wave 4 to complete entirely, so this is theoretically safe. Defensive practice: keep the translations edit window short (final commit only).

## What to build

### 1. Inventory the missing keys

```bash
grep -rno "useTranslations\|getTranslations" apps/web/src/app/\[locale\]/\(school\)/behaviour/ apps/web/src/app/\[locale\]/\(school\)/settings/behaviour-*/ | head
```

For each `useTranslations('namespace')` and each `t('key.path')` call site in the behaviour and behaviour-settings pages, identify whether the key exists in `messages/en.json`. Build a complete list of missing keys.

The audit identified these high-traffic missing key prefixes (likely covering 80% of the issue):

- `behaviour.dashboard.*` — KPI labels, quick action labels, recent activity copy
- `behaviour.components.quickLog.*` — Quick log FAB title, sheet labels
- `behaviour.recognition.*` — wall labels, tab shortcuts, leaderboard, houses, pending approvals, filters, empty states
- `behaviour.tasks.*` — stats labels, my tasks vs all tasks, no-results copy
- `behaviour.amendments.*` — back button, all-notices-sent, queue labels
- `behaviour.alerts.*` — no-results, tab labels
- `behaviour.aiQuery.suggestions.*` — suggested query buttons
- `behaviour.analytics.filters.*` — date range filter labels
- `behaviour.students.*` — search placeholder
- `behaviour.newIncident.*` — form labels, placeholders, descriptions
- `behaviour.incidents.*` — list filters, status tabs
- `behaviourSettings.policies.*` — testMode, export, import, addRule
- `behaviourSettings.general.*` — section descriptions, field labels, all `labels.*` and `descriptions.*`

### 2. Compose the additions

Build the additions in a scratch file first (per Rule H8), e.g. `wellbeing_new/.scratch/translations-en.json` and `.scratch/translations-ar.json`. Each is a JSON object structured to deep-merge into the existing locale file:

```json
{
  "behaviour": {
    "dashboard": {
      "stats": {
        "totalIncidents": "Total Incidents",
        "positiveNegative": "Positive : Negative",
        "openTasks": "Open Tasks",
        "overdue": "Overdue Actions"
      },
      "quickActions": {
        "allIncidents": "All Incidents",
        "students": "By Student",
        "tasks": "Tasks",
        "escalated": "Escalated"
      }
    },
    "components": {
      "quickLog": {
        "title": "Quick Log Incident"
      }
    },
    "recognition": {
      "tabs": {
        "wallShort": "Wall",
        "leaderboardShort": "Board",
        "housesShort": "Houses",
        "pendingShort": "Pending"
      },
      "filters": {
        "currentYear": "This year"
      },
      "noRecognition": "No recognition yet. Log a positive incident to celebrate students."
    }
    /* ... all other keys */
  },
  "behaviourSettings": {
    "policies": {
      "testMode": "Test mode",
      "export": "Export",
      "import": "Import",
      "addRule": "Add rule"
    }
    /* ... */
  }
}
```

Arabic mirrors the English structure key-for-key. Translate every string. Use the existing `messages/ar.json` style as reference for tone, register, and typographic conventions.

### 3. Apply the merge

In the **final commit window** of this impl (per Rules H5 and H8):

1. Re-read `messages/en.json` immediately (a Wave 5 impl might have started early — Rule H9). Verify no Wave 5 sibling has added overlapping keys.
2. Deep-merge the scratch additions into the existing structure. Use the JSON-merge utility in the repo if one exists, otherwise write a small Node script:

```bash
node -e "
const fs = require('fs');
const base = JSON.parse(fs.readFileSync('apps/web/messages/en.json'));
const additions = JSON.parse(fs.readFileSync('wellbeing_new/.scratch/translations-en.json'));
function merge(a, b) {
  for (const k of Object.keys(b)) {
    if (typeof b[k] === 'object' && b[k] !== null && typeof a[k] === 'object' && a[k] !== null) {
      merge(a[k], b[k]);
    } else if (a[k] === undefined) {
      a[k] = b[k];
    } else {
      console.warn('Conflict at key', k, '— keeping existing value');
    }
  }
}
merge(base, additions);
fs.writeFileSync('apps/web/messages/en.json', JSON.stringify(base, null, 2) + '\n');
"
```

Repeat for Arabic.

3. Stage exactly the two files: `git add apps/web/messages/en.json apps/web/messages/ar.json`. Verify `git status` shows nothing else (Rule H4).
4. Commit.

### 4. Verify with a build

`pnpm turbo run build --filter=@school/web` — should succeed without `MISSING_MESSAGE` warnings during the build phase.

### 5. Live verification

After deploy, visit `/en/behaviour`, `/en/behaviour/incidents`, `/en/behaviour/recognition`, `/en/behaviour/tasks`, `/en/behaviour/amendments`, `/en/behaviour/alerts`, `/en/settings/behaviour-policies`, `/en/settings/behaviour-general` — every label should render in English (no raw keys). Repeat with `/ar/...` URLs.

## Tests

- A small Jest test that loads `messages/en.json` and `messages/ar.json` and asserts every key in `en` has a counterpart in `ar` (and vice versa). This is a regression guard for future contributions.
- For each page covered, a snapshot test that renders the page header and confirms the title is the localised string, not the raw key.

## Watch out for

- **Don't overwrite keys other modules contributed.** Use the deep-merge approach. If you see a conflict warning, INVESTIGATE — another module may use the same prefix.
- **Arabic typography conventions** — verify with the existing translations style. Numbers stay in Western digits per CLAUDE.md.
- **`behaviour.recognition.filters.currentYearbehaviour.recognition.noRecognition` collision** — the audit noted this concatenated string. It's a code bug in the page, not a translation issue. Note in completion record; impl 14 (behaviour sub-hub) will fix when it touches the recognition layout.
- **DO NOT add translation keys for pages that don't exist yet** (the new super-hub, sub-hubs, and admin AI flag page belong to Waves 5/6). Stick to backfilling existing pages.

## Deployment notes

- Restart: web only.
- Smoke: open browser DevTools console on `/en/behaviour` — should be **zero** `MISSING_MESSAGE` errors. Switch to `/ar/behaviour` — page renders right-to-left with Arabic strings; still zero `MISSING_MESSAGE`.
