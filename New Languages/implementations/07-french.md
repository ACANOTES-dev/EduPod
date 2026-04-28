# Implementation 07 — French (`fr`) Tier 1 Catalogue

> **Phase:** 4 — Tier 1 Languages (was P4-FR)
> **Wave:** 7 (serial — sequential at codebase level; first Phase 4 implementation per recommended order)
> **Depends on:** 06 complete & deployed
> **Deploys:** API restart + worker restart + web restart
> **Model:** Opus 4.7 / High effort

---

## Goal

Ship French (`fr`) as the **first** Tier 1 locale in this expansion. After this implementation:

- `apps/web/messages/fr.json` exists with 100% structural parity against `en.json` (every key translated; placeholders preserved exactly).
- `apps/api/src/modules/notifications/messages/notifications.fr.json` exists with every system notification key translated.
- `apps/api/src/modules/pdf-rendering/templates/messages/{type}.fr.json` exists for all 13 PDF types.
- `apps/web/i18n/registry.ts` flips `fr` to `active: true` in the same commit as the message file.
- `apps/web/i18n/config.ts` automatically picks up the new active locale (it derives from the registry).
- NHQS gets `'fr'` appended to `supported_locales` post-deploy via SQL.
- Playwright baselines (`en-ltr`, `ar-rtl`, `fr-ltr`) regenerate; full visual + smoke + leak detector passes for `fr`; en + ar regression clean.
- `New Languages/glossary.md` updated with French school-management terms encountered.

## Critical safety constraints

- **The hard-error gate is live.** Any English key without a French translation 500s every page that references it on the `[fr]` URL segment. Translation parity test MUST be 100% green before push.
- **Preserve `{placeholder}` syntax exactly.** Including casing (`{firstName}` not `{firstname}`) and including ICU formatters (`{count, plural, one {# student} other {# students}}`).
- **Preserve markdown emphasis.** `**bold**`, `*italic*`, `__underline__`. The translation renders as-is in the UI.
- **Preserve newlines.** `\n` inside JSON values stays `\n`.
- **No untranslated stubs.** Don't leave any string as the English source. Don't use `[FR] …` placeholders. The parity test catches the former; the latter is caught by the placeholder regex.
- **NHQS is the pilot.** Do NOT enable `fr` for any other tenant in this implementation. Other tenants flip later in Phase 6 (rolling, after human QA).

---

## Files to create / modify

### Translations

- **Create:** `apps/web/messages/fr.json` — full catalogue (~17,500 keys × 118 namespaces).
- **Create:** `apps/api/src/modules/notifications/messages/notifications.fr.json`
- **Create:** `apps/api/src/modules/pdf-rendering/templates/messages/{type}.fr.json` × 13.

### Registry flip

- **Modify:** `apps/web/i18n/registry.ts` — flip `fr` entry to `active: true`.

### Playwright project

- **Modify:** `apps/web/e2e/playwright.config.ts` — add `fr-ltr` and `fr-mobile` projects.

### Visual baselines

- **Create/regenerate:** `apps/web/e2e/__snapshots__/...fr-ltr...` per-route snapshots.

### Glossary

- **Create or update:** `New Languages/glossary.md` — French school-management terminology (running ledger).

### Tenant rollout

- **Apply on prod:** `UPDATE tenants SET supported_locales = supported_locales || '{fr}'::text[] WHERE slug = 'nhqs';`

### Docs

- **Modify:** `New Languages/IMPLEMENTATION_LOG.md`

---

## Detailed task breakdown

### Task 1 — Build the glossary (or extend it from prior implementations)

**Files:**

- Create or update: `New Languages/glossary.md`

This implementation is the first to add a Tier 1 catalogue, so the glossary is born here. Subsequent implementations extend it.

- [ ] **Step 1.1 — Seed the glossary** with the school-management terms most likely to need consistent translation across locales. Each entry: English → translation → comment. Initial set:

```markdown
| English term                    | French                         | Notes                                              |
| ------------------------------- | ------------------------------ | -------------------------------------------------- |
| Tutor period                    | Heure de tutorat               | Not "période" — "heure" matches the school context |
| Behaviour incident              | Incident de conduite           | Not "comportement"                                 |
| Scheme of work                  | Programme pédagogique          | UK term — translate to French equivalent           |
| Year group                      | Niveau scolaire                |                                                    |
| Form tutor                      | Professeur principal           | Standard FR education term                         |
| Detention                       | Retenue                        | Not "détention" (= imprisonment)                   |
| Merit                           | Bonus de comportement          | Or "point positif" — pick one and stay consistent  |
| Demerit                         | Avertissement                  |                                                    |
| Parent–teacher meeting          | Réunion parents-profs          |                                                    |
| Report card                     | Bulletin scolaire              | Not "carte de rapport"                             |
| Attendance register             | Registre de présence           |                                                    |
| Safeguarding                    | Protection de l'enfance        | Sensitive area — match official French terminology |
| Special Educational Needs (SEN) | Besoins éducatifs particuliers | Or "BEP" abbreviation                              |
| Headteacher                     | Directeur·rice                 | Use inclusive form                                 |
```

- [ ] **Step 1.2 — Commit the glossary scaffold:**

```bash
git add New\ Languages/glossary.md
git commit -m "docs(i18n): seed school-management glossary with French entries"
```

### Task 2 — Generate the French message catalogue

This is the heaviest step. Use parallel sub-agents (Sonnet 4.6 or Opus 4.7) to translate batches of namespaces. Reference STRATEGY.md §4.5.

- [ ] **Step 2.1 — Inventory namespaces** in `en.json`:

```bash
jq -r 'keys[]' apps/web/messages/en.json
```

Bucket into batches of ~10 namespaces (118 / 10 = ~12 batches). Group by domain: parent-flow, finance, regulatory, settings, etc. so each batch shares vocabulary.

- [ ] **Step 2.2 — For each batch**, dispatch a subagent with this prompt template:

```
You are translating school-management strings from English to French for an
LMS used by schools in Ireland and the UAE.

Source-of-truth glossary (use these renderings exactly when the English term appears):
<paste glossary>

Existing Arabic translations for this same namespace (for tone calibration —
do NOT translate from Arabic; translate from English):
<paste subset of ar.json for the namespace>

Translate the following en.json subset into French. Hard rules:

1. Preserve `{placeholder}` syntax exactly — character-for-character.
2. Preserve ICU plural/select syntax exactly.
3. Preserve markdown emphasis (**bold**, *italic*, __underline__).
4. Preserve `\n` newlines.
5. Translate idiomatically; do not transliterate.
6. Match register: formal but warm — these strings are user-facing.
7. Use European French (France/Belgium standard), not Quebec.
8. Keep text length within ~110% of English where possible — overflow on
   buttons/labels is a known UI risk.
9. Do NOT translate proper nouns, brand names, or invariant code identifiers.
10. Output ONLY valid JSON matching the input shape — no commentary.

Source:
<paste subset of en.json for the namespace>
```

> Run multiple sub-agents in parallel via `Agent` tool (per `superpowers:dispatching-parallel-agents`). Aim for 4–6 concurrent agents to keep walltime sane.

- [ ] **Step 2.3 — Merge sub-agent outputs** into a single `fr.json`. Validate every batch by running the parity test on a partial file before merging the next.

```bash
node -e "JSON.parse(require('fs').readFileSync('apps/web/messages/fr.json'))"
pnpm --filter @school/web test -- translation-parity
```

> Iterate until 100% pass. Address any reported missing keys by re-running the relevant batch.

- [ ] **Step 2.4 — Commit:**

```bash
git add apps/web/messages/fr.json
git commit -m "feat(i18n): add full French catalogue (fr.json) — Tier 1"
```

### Task 3 — Notification + PDF catalogues

**Files:**

- Create: `apps/api/src/modules/notifications/messages/notifications.fr.json`
- Create: `apps/api/src/modules/pdf-rendering/templates/messages/{type}.fr.json` × 13

- [ ] **Step 3.1 — Translate `notifications.en.json` → `notifications.fr.json`** following the same prompt + glossary pattern. Validate JSON parses.

- [ ] **Step 3.2 — For each PDF type's `messages/{type}.en.json`**, generate the French equivalent. Keep filenames consistent.

- [ ] **Step 3.3 — Run the unit tests** for both notifications and PDF templates with `locale='fr'` paths exercised:

```bash
pnpm --filter @school/api test -- template-renderer
pnpm --filter @school/api test -- pdf-pixel-regression  # still asserts en+ar baselines; fr is a smoke
```

- [ ] **Step 3.4 — Commit:**

```bash
git add apps/api/src/modules/notifications/messages/notifications.fr.json \
        apps/api/src/modules/pdf-rendering/templates/messages/
git commit -m "feat(i18n): French notification + PDF catalogues"
```

### Task 4 — Flip `fr` to active in the registry

**Files:**

- Modify: `apps/web/i18n/registry.ts`

- [ ] **Step 4.1 — Change the `fr` entry's `active: false` to `active: true`.**
- [ ] **Step 4.2 — Run the parity test once more** — it now includes `fr` in the active locale loop.
- [ ] **Step 4.3 — Run `pnpm i18n:check`** — confirms 0 missing/orphan keys for `fr`.
- [ ] **Step 4.4 — Commit:**

```bash
git add apps/web/i18n/registry.ts
git commit -m "feat(i18n): activate fr locale in registry"
```

### Task 5 — Playwright projects + visual baselines

**Files:**

- Modify: `apps/web/e2e/playwright.config.ts`
- Create: per-route snapshots under `apps/web/e2e/__snapshots__/.../fr-ltr/`

- [ ] **Step 5.1 — Add `fr-ltr` and `fr-mobile` projects** to `playwright.config.ts`. Mirror the `en-ltr` shape, just with the locale set to `fr` in the URL prefix.

- [ ] **Step 5.2 — Generate snapshots locally**:

```bash
pnpm --filter @school/web exec playwright test --update-snapshots --project=fr-ltr --project=fr-mobile
```

Inspect the captured PNGs visually — no broken layouts, no overflow on buttons, no untranslated English strings.

- [ ] **Step 5.3 — Commit:**

```bash
git add apps/web/e2e/playwright.config.ts apps/web/e2e/__snapshots__/
git commit -m "test(e2e): add fr-ltr and fr-mobile Playwright projects with baselines"
```

### Task 6 — Hardcoded English leak detector

**Files:**

- Create or modify: `apps/web/e2e/locale-leak.spec.ts`

- [ ] **Step 6.1 — If a leak detector spec already exists** (added in a previous implementation or pre-existing), add `fr` to its locale matrix. Otherwise, create one:

```ts
// apps/web/e2e/locale-leak.spec.ts
import { test, expect } from '@playwright/test';

const COMMON_ENGLISH = [
  'Save',
  'Cancel',
  'Edit',
  'Delete',
  'Settings',
  'Profile',
  'Logout',
  'Welcome',
  'Submit',
  'Continue',
  'Back',
];

const ALLOWED_PROPER_NOUNS = ['EduPod', 'NHQS', 'Stripe'];

test.describe('@locale-leak fr', () => {
  test('parent dashboard contains no untranslated common English words', async ({ page }) => {
    await page.goto('/fr/parent/dashboard');
    const text = await page.textContent('body');
    if (!text) throw new Error('empty body');
    const cleaned = ALLOWED_PROPER_NOUNS.reduce((s, n) => s.replaceAll(n, ''), text);
    for (const word of COMMON_ENGLISH) {
      // Word-boundary match, case-insensitive
      const re = new RegExp(`\\b${word}\\b`, 'i');
      expect(re.test(cleaned), `Found leaked English word "${word}" on /fr/parent/dashboard`).toBe(
        false,
      );
    }
  });
  // Repeat for student dashboard, finance, settings, etc. (Tier 1 covers all)
});
```

- [ ] **Step 6.2 — Run:**

```bash
pnpm --filter @school/web exec playwright test --grep "@locale-leak fr"
```

Fix any leaks by updating `fr.json`. Re-run until clean.

- [ ] **Step 6.3 — Commit.**

### Task 7 — Local sweep, push, deploy, NHQS rollout

- [ ] **Step 7.1 — Local battery:**

```bash
turbo lint
turbo type-check
turbo test
pnpm --filter @school/web exec playwright test --project=fr-ltr --project=fr-mobile
```

- [ ] **Step 7.2 — Pre-push branch state check.**
- [ ] **Step 7.3 — `git push origin main && gh run watch`.**
- [ ] **Step 7.4 — Post-deploy: enable `fr` for NHQS:**

```bash
ssh root@46.62.244.139
sudo -u edupod psql edupod_prod -c "
  UPDATE tenants
  SET supported_locales = supported_locales || '{fr}'::text[]
  WHERE slug = 'nhqs'
    AND NOT 'fr' = ANY(supported_locales);
"
# Verify:
sudo -u edupod psql edupod_prod -c "SELECT slug, supported_locales FROM tenants WHERE slug='nhqs';"
# Expected: {en,ar,fr}
```

- [ ] **Step 7.5 — Production verification (Playwright on the deployed app):**

```bash
APP_URL=https://nhqs.edupod.app pnpm --filter @school/web exec playwright test --project=fr-ltr --grep "@smoke"
```

Plus manual:

- Log in as NHQS user. Picker now shows English + العربية + Français. Switch to FR.
- Click through home, dashboard, finance, parent portal — verify FR throughout. No `MISSING_MESSAGE` events in Sentry.
- Trigger a notification (e.g., generate a fake invoice) — verify the FR rendering.
- Generate a sample receipt PDF — verify FR rendering.

- [ ] **Step 7.6 — Append completion entry to `IMPLEMENTATION_LOG.md`:**

```markdown
## 07 — French (fr)

- **Status:** 🟢 Complete & Deployed
- **Model:** Opus 4.7 / High effort
- **Began:** YYYY-MM-DD HH:MM UTC
- **Completed:** YYYY-MM-DD HH:MM UTC
- **Duration:** ...

### Commits (on main)

- <SHA> — feat(i18n): add full French catalogue
- <SHA> — feat(i18n): French notification + PDF catalogues
- <SHA> — feat(i18n): activate fr in registry
- <SHA> — test(e2e): fr Playwright projects + baselines

### CI / Deploy

- CI run: <URL>
- Deployed: YYYY-MM-DD HH:MM UTC
- Verified: YYYY-MM-DD HH:MM UTC

### Playwright

- Smoke (fr): ✅
- Leak detector (fr): ✅ 0 matches
- Visual baselines (fr): ✅ committed
- Visual regression (en+ar): ✅ no regression
- Notification dispatch: ✅
- PDF render: ✅

### NHQS rollout

- supported_locales: ['en','ar','fr']
- Other tenants: gated, awaiting human QA

### Notes

- N strings flagged for human review: ...
- Glossary updated with N new terms.
```

- [ ] **Step 7.7 — Commit + push the log entry.**

---

## Acceptance criteria

- [ ] `apps/web/messages/fr.json` matches en.json shape 100%
- [ ] Notification + 13 PDF catalogues exist in French
- [ ] Registry flipped: `fr.active = true`
- [ ] No `MISSING_MESSAGE` in dev/test/prod for fr
- [ ] No untranslated English strings on fr pages (leak detector clean)
- [ ] Playwright fr-ltr + fr-mobile projects added with committed baselines
- [ ] `turbo lint`, `turbo type-check`, `turbo test` green
- [ ] CI green; production deploy successful
- [ ] NHQS `supported_locales` includes `fr`
- [ ] Smoke + leak + visual + dispatch + PDF all green on production
- [ ] en + ar visual regression: no regression
- [ ] Glossary updated
- [ ] `IMPLEMENTATION_LOG.md` updated

---

## Verification commands

```bash
turbo lint && turbo type-check && turbo test
pnpm --filter @school/web exec playwright test --project=fr-ltr --project=fr-mobile
pnpm --filter @school/web exec playwright test --grep "@locale-leak fr"

# Post-deploy (point at prod)
APP_URL=https://nhqs.edupod.app pnpm --filter @school/web exec playwright test \
  --project=fr-ltr --grep "@smoke"
```

---

## Rollback

If post-deploy verification fails:

```bash
# 1. Disable fr for NHQS immediately
ssh root@46.62.244.139
sudo -u edupod psql edupod_prod -c "
  UPDATE tenants
  SET supported_locales = array_remove(supported_locales, 'fr')
  WHERE slug = 'nhqs';
"

# 2. Revert the registry flip + Playwright project commits if there's a code-side issue
git revert <registry-flip-sha>
git push origin main

# 3. Investigate Sentry for MISSING_MESSAGE patterns
```

---

## Notes for the executor

- French school-management terminology has good AI training coverage. Watch for UK-vs-French education-system mismatches (e.g., "year group" → niveau scolaire, not "groupe d'année").
- Compound words / long phrases occasionally overflow buttons. The leak detector won't catch this — the visual regression baselines will. Inspect snapshots at small viewport widths.
- Use European French. Avoid Quebec-isms (e.g., "courriel" only if both regions accept it; default to "email" if neutral phrasing is preferred).
- Add new glossary entries as you go. The next Tier 1 implementation (Spanish) will reuse this scaffolding.
- After deploy, flag `feature-map.md` to the user (per `feature-map-maintenance.md`). Do NOT auto-update.
