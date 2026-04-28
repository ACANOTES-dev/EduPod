# Implementation 12 — Romanian (`ro`) Tier 2 Catalogue

> **Phase:** 5 — Tier 2 Languages (was P5-RO)
> **Wave:** 12 (serial)
> **Depends on:** 11 complete & deployed
> **Deploys:** API restart + worker restart + web restart
> **Model:** Opus 4.7 / High effort (Romance grammar with Slavic influence — mid-difficulty)

---

## Goal

Ship Romanian (`ro`) as the second Tier 2 locale. Same shape as 11-italian.md — see that file for Tier 2 protocol details (allowlist subset translation, route guard already shipped, parent-relevant PDF catalogue subset).

After this ships:

- `apps/web/messages/ro.json` exists with 100% parity against the Tier 2 namespace allowlist.
- Notification + 4 parent-relevant PDF catalogues exist in Romanian.
- Registry: `ro.active = true`, `tier: 2`.
- Playwright `ro-ltr` + `ro-mobile` projects + baselines (parent + student only).
- NHQS gets `'ro'` appended to `supported_locales`.
- Glossary extended with Romanian entries.

## Critical safety constraints

Same as 11 plus:

- **Romanian uses diacritics** (`ă`, `â`, `î`, `ș`, `ț`). Sub-agents occasionally drop them or use the wrong variant (`ş` cedilla vs `ș` comma-below). Standardise on **comma-below forms** (`ș`, `ț`) — they're the official Unicode-defined Romanian forms.
- **Watch for hyper-formal Slavic-influenced grammar.** Romanian school terminology is often heavily Latinate but the grammar is more inflected than Italian/French — sub-agents can over-Latinise or under-inflect. Spot-check.
- **Use formal register** (`dumneavoastră` for "you", verb in plural form) when addressing parents.

---

## Files to create / modify

Mirror 11-italian.md, substituting `ro` for `it`. The Tier 2 route guard is already in place from 11 — no new infrastructure needed. Just translation + registry flip + Playwright project.

---

## Detailed task breakdown

### Task 1 — Extend the glossary with Romanian

- [ ] **Step 1.1 — Add Romanian column** (Tier 2 parent-facing terms only):

```markdown
| English term           | Italian                      | Romanian            | Notes                       |
| ---------------------- | ---------------------------- | ------------------- | --------------------------- |
| Parent–teacher meeting | Riunione genitori-insegnanti | Ședință cu părinții | Use "ș" + "ț" (comma-below) |
| Report card            | Pagella                      | Carnet de note      |                             |
| Attendance             | Frequenza                    | Prezență            |                             |
| Tuition fees           | Rette scolastiche            | Taxe școlare        |                             |
| Receipt                | Ricevuta                     | Chitanță            |                             |
| Invoice                | Fattura                      | Factură             |                             |
| Statement              | Estratto conto               | Extras de cont      |                             |
| Behaviour              | Condotta                     | Conduită            |                             |
| Year group / class     | Classe                       | Clasă               |                             |
| Headteacher            | Dirigente scolastico         | Director            |                             |
| Login                  | Accedi                       | Autentificare       |                             |
| Logout                 | Esci                         | Deconectare         |                             |
```

- [ ] **Step 1.2 — Commit.**

### Task 2 — Generate the Romanian Tier 2 catalogue

Sub-agent prompt customisations:

```
Translate from English to Standard Romanian for parent + student LMS surface.
Use formal address (dumneavoastră / verb in plural).
Use comma-below diacritics: ș, ț, Ș, Ț (NOT cedilla ş, ţ).
Hard rules 1-10 same as 07.
11. Translate ONLY namespaces in: <paste TIER_2_NAMESPACES>.
12. Inflect nouns and adjectives correctly (Romanian is heavily inflected).
13. Preserve placeholders exactly.
```

- [ ] **Step 2.1 — Build Tier 2 subset** (same script as 11 Task 3.1).
- [ ] **Step 2.2 — Dispatch sub-agents** (Opus 4.7 high effort).
- [ ] **Step 2.3 — Post-process**: regex sweep for cedilla diacritics and replace with comma-below:

```bash
# Replace cedilla variants in ro.json
sed -i.bak 's/ş/ș/g; s/ţ/ț/g; s/Ş/Ș/g; s/Ţ/Ț/g' apps/web/messages/ro.json
```

- [ ] **Step 2.4 — Run parity:** `pnpm --filter @school/web test -- translation-parity`. Expect green.
- [ ] **Step 2.5 — Commit.**

### Task 3 — Notification + parent-relevant PDF catalogues

Mirror 11 Task 4.

### Task 4 — Registry flip + Playwright

- [ ] **Step 4.1 — `ro.active = true` in registry.**
- [ ] **Step 4.2 — Add `ro-ltr` + `ro-mobile` projects** (parent + student testMatch).
- [ ] **Step 4.3 — Generate baselines.**

### Task 5 — Leak detector for RO

Extend the leak spec with `ro` describe block.

### Task 6 — Verify Tier 2 redirect for ro

The route guard from 11 is generic (any tier-2 locale). Verify with a quick Playwright check that visiting `/ro/finance/payroll` redirects to the tenant default. Add a test variant if not already covered:

```ts
test('Tier 2 ro user — out-of-scope redirects', async ({ page }) => {
  await page.goto('/ro/finance/payroll');
  await page.waitForURL((url) => !url.toString().includes('/ro/finance'));
});
```

### Task 7 — Push, deploy, NHQS rollout

Same as 11. Enable `ro` for NHQS via SQL.

### Task 8 — Production verification + log

Same as 11.

---

## Acceptance criteria

- [ ] `ro.json` parity 100% against Tier 2 allowlist
- [ ] `ro.json` contains NO out-of-scope keys
- [ ] Notification + parent PDF catalogues exist in Romanian
- [ ] Registry: `ro.active = true`, `tier: 2`
- [ ] Playwright ro-ltr + ro-mobile + baselines
- [ ] No untranslated English on `[ro]` parent + student pages
- [ ] No cedilla diacritics in `ro.json` (only comma-below `ș`/`ț`)
- [ ] No `MISSING_MESSAGE` in Sentry
- [ ] CI green; production deploy successful
- [ ] NHQS `supported_locales` includes `ro`
- [ ] en+ar+fr+es+de+ga+it regression clean
- [ ] Glossary updated
- [ ] `IMPLEMENTATION_LOG.md` updated

---

## Verification commands

```bash
turbo lint && turbo type-check && turbo test
pnpm --filter @school/web exec playwright test --project=ro-ltr --project=ro-mobile
pnpm --filter @school/web exec playwright test --grep "@locale-leak ro"

# Diacritic check
grep -P '[ţş]' apps/web/messages/ro.json && echo "FAIL: cedilla diacritics found" || echo "OK"

# Post-deploy
APP_URL=https://nhqs.edupod.app pnpm --filter @school/web exec playwright test --project=ro-ltr --grep "@smoke"
```

---

## Rollback

Same as 11. `array_remove(supported_locales, 'ro')`.

---

## Notes for the executor

- Romanian is harder than Italian for AI translation but easier than Polish. Opus 4.7 high effort balances cost and quality.
- The cedilla-vs-comma-below diacritic confusion is real — sub-agents trained on older Romanian text often emit cedilla forms. The regex post-process catches them, but verify by spot-checking after the swap.
- Romanian school terminology is well-established (much of it from communist-era standardisation). Use the conventional terms, not innovative renderings.
- Inflection: nouns + adjectives have nominative/accusative/genitive/dative + definite/indefinite forms. Sub-agents sometimes use the wrong form (e.g., bare nominative where the dative is required after a preposition). Visual baselines won't catch this — a native speaker reviewer will. Add anything suspicious to a `New Languages/_evidence/ro-review-queue.md` for post-launch QA.
