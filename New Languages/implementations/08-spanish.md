# Implementation 08 — Spanish (`es`) Tier 1 Catalogue

> **Phase:** 4 — Tier 1 Languages (was P4-ES)
> **Wave:** 8 (serial)
> **Depends on:** 07 complete & deployed
> **Deploys:** API restart + worker restart + web restart
> **Model:** Opus 4.7 / High effort

---

## Goal

Ship Spanish (`es`) as the second Tier 1 locale. Same shape as 07-french.md — see that file for the per-batch translation protocol, the leak-detector pattern, the Playwright project setup, and the IMPLEMENTATION_LOG entry template.

After this ships:

- `apps/web/messages/es.json` exists with 100% parity against `en.json`.
- `apps/api/src/modules/notifications/messages/notifications.es.json` exists.
- `apps/api/src/modules/pdf-rendering/templates/messages/{type}.es.json` exists for all 13 PDF types.
- `apps/web/i18n/registry.ts` flips `es` to `active: true`.
- Playwright `es-ltr` + `es-mobile` projects added with committed baselines.
- NHQS gets `'es'` appended to `supported_locales` post-deploy.
- `New Languages/glossary.md` extended with Spanish entries.

## Critical safety constraints

Same as 07-french.md §Critical safety constraints. Additionally:

- **Use neutral Spanish (no regional bias).** Avoid markedly Latin American (`computadora`, `auto`) or markedly Iberian (`ordenador`, `coche`) lexicon where a neutral choice exists. Default to Iberian register where neutral isn't available — Spain-based parents are expected to be the larger user base in EU schools.
- **Voseo/tuteo:** use **tuteo** (the `tú` form) consistently. Voseo (`vos`) marks the text as Argentinian.
- **Watch UI overflow:** Spanish averages ~115% of English length. The leak detector won't flag overflow — visual baselines will.

---

## Files to create / modify

Mirror the file list from 07-french.md, substituting `es` for `fr` everywhere:

- `apps/web/messages/es.json`
- `apps/api/src/modules/notifications/messages/notifications.es.json`
- `apps/api/src/modules/pdf-rendering/templates/messages/{type}.es.json` × 13
- `apps/web/i18n/registry.ts` (flip `es` to active)
- `apps/web/e2e/playwright.config.ts` (add `es-ltr`, `es-mobile` projects)
- `apps/web/e2e/__snapshots__/.../es-ltr/` (committed baselines)
- `New Languages/glossary.md` (append Spanish column to existing rows + new ES-only rows)
- `New Languages/IMPLEMENTATION_LOG.md`

---

## Detailed task breakdown

### Task 1 — Extend the glossary with Spanish translations

- [ ] **Step 1.1 — Open `New Languages/glossary.md`** (created in 07). Add a Spanish column (or new rows if the table layout doesn't support a per-locale column — pick the format that's cleaner; if multi-column, prefer it).

```markdown
| English term              | French                         | Spanish                                 | Notes                              |
| ------------------------- | ------------------------------ | --------------------------------------- | ---------------------------------- |
| Tutor period              | Heure de tutorat               | Hora de tutoría                         |                                    |
| Behaviour incident        | Incident de conduite           | Incidencia de conducta                  |                                    |
| Scheme of work            | Programme pédagogique          | Programación didáctica                  | Iberian Spanish education term     |
| Year group                | Niveau scolaire                | Curso                                   | Or "nivel"; "curso" is more common |
| Form tutor                | Professeur principal           | Tutor                                   |                                    |
| Detention                 | Retenue                        | Castigo (después de clase)              |                                    |
| Merit                     | Bonus de comportement          | Punto positivo                          |                                    |
| Demerit                   | Avertissement                  | Amonestación                            |                                    |
| Parent–teacher meeting    | Réunion parents-profs          | Reunión de padres y profesores          |                                    |
| Report card               | Bulletin scolaire              | Boletín de notas                        |                                    |
| Attendance register       | Registre de présence           | Registro de asistencia                  |                                    |
| Safeguarding              | Protection de l'enfance        | Protección del menor                    | Or "salvaguardia"                  |
| Special Educational Needs | Besoins éducatifs particuliers | Necesidades educativas especiales (NEE) | Standard ES-ES                     |
| Headteacher               | Directeur·rice                 | Director/a                              |                                    |
```

- [ ] **Step 1.2 — Commit:**

```bash
git add New\ Languages/glossary.md
git commit -m "docs(i18n): extend glossary with Spanish entries"
```

### Task 2 — Generate the Spanish catalogue

Follow the same per-batch protocol as 07-french.md Task 2. Translation prompt:

```
Translate from English to neutral Spanish for an LMS.
Default register: tuteo (use "tú", not "vos").
Default lexicon: Iberian when neutral isn't available, but prefer pan-Hispanic
common words ("computadora" vs "ordenador" → "ordenador" is fine; for verbs
prefer Iberian "coger" only where it isn't problematic; otherwise "tomar").
Glossary: <paste>
Existing AR for tone calibration: <paste subset>
Hard rules: same as 07.
```

- [ ] **Step 2.1 — Inventory namespaces** (`jq -r 'keys[]' apps/web/messages/en.json`).
- [ ] **Step 2.2 — Dispatch sub-agents** in batches of ~10 namespaces.
- [ ] **Step 2.3 — Merge.** Validate JSON. Run parity until 100%.
- [ ] **Step 2.4 — Commit:**

```bash
git add apps/web/messages/es.json
git commit -m "feat(i18n): add full Spanish catalogue (es.json) — Tier 1"
```

### Task 3 — Notification + PDF catalogues

Mirror 07-french.md Task 3. Generate ES versions of the notification + PDF JSON files.

- [ ] **Step 3.1 — `notifications.es.json`** — translate `notifications.en.json`.
- [ ] **Step 3.2 — Per-PDF-type ES JSON** — translate each of 13.
- [ ] **Step 3.3 — Run renderer + PDF tests** (existing tests; ES path exercised by integration of registry).
- [ ] **Step 3.4 — Commit:**

```bash
git add apps/api/src/modules/notifications/messages/notifications.es.json \
        apps/api/src/modules/pdf-rendering/templates/messages/
git commit -m "feat(i18n): Spanish notification + PDF catalogues"
```

### Task 4 — Registry flip + Playwright projects

- [ ] **Step 4.1 — `apps/web/i18n/registry.ts`** — flip `es.active = true`.
- [ ] **Step 4.2 — `apps/web/e2e/playwright.config.ts`** — add `es-ltr` + `es-mobile` projects.
- [ ] **Step 4.3 — Generate snapshots:**

```bash
pnpm --filter @school/web exec playwright test --update-snapshots --project=es-ltr --project=es-mobile
```

- [ ] **Step 4.4 — Inspect snapshots for overflow** — Spanish averages 115% of English length. Look at button labels especially.
- [ ] **Step 4.5 — Commit registry + Playwright config + baselines together.**

### Task 5 — Leak detector for ES

- [ ] **Step 5.1 — Extend `apps/web/e2e/locale-leak.spec.ts`** with an `es` describe block. Use the same English common-word list as 07.
- [ ] **Step 5.2 — Run + fix any leaks. Commit.**

### Task 6 — Local sweep, push, deploy, NHQS rollout

- [ ] **Step 6.1 — Local battery:** lint, type-check, test, Playwright `es-ltr` + `es-mobile`.
- [ ] **Step 6.2 — Pre-push branch state check.**
- [ ] **Step 6.3 — `git push origin main && gh run watch`.**
- [ ] **Step 6.4 — Enable for NHQS:**

```bash
ssh root@46.62.244.139
sudo -u edupod psql edupod_prod -c "
  UPDATE tenants
  SET supported_locales = supported_locales || '{es}'::text[]
  WHERE slug = 'nhqs' AND NOT 'es' = ANY(supported_locales);
"
```

- [ ] **Step 6.5 — Production verification:**
  - `APP_URL=https://nhqs.edupod.app pnpm --filter @school/web exec playwright test --project=es-ltr --grep "@smoke"`
  - Manual: switch picker to ES; click through home/parent/finance; check Sentry quiet.
  - Trigger a notification → ES render correct.
  - Generate a receipt PDF → ES render correct.

- [ ] **Step 6.6 — Append completion entry to `IMPLEMENTATION_LOG.md`** (mirror 07's template).

---

## Acceptance criteria

- [ ] `es.json` parity 100% against `en.json`
- [ ] Notification + PDF ES catalogues exist
- [ ] Registry: `es.active = true`
- [ ] Playwright es-ltr + es-mobile projects + baselines committed
- [ ] No untranslated English strings on `[es]` pages
- [ ] No `MISSING_MESSAGE` events in Sentry
- [ ] CI green; production deploy successful
- [ ] NHQS `supported_locales` includes `es`
- [ ] en + ar + fr regression clean
- [ ] Glossary updated
- [ ] `IMPLEMENTATION_LOG.md` updated

---

## Verification commands

```bash
turbo lint && turbo type-check && turbo test
pnpm --filter @school/web exec playwright test --project=es-ltr --project=es-mobile
pnpm --filter @school/web exec playwright test --grep "@locale-leak es"

APP_URL=https://nhqs.edupod.app pnpm --filter @school/web exec playwright test \
  --project=es-ltr --grep "@smoke"
```

---

## Rollback

Same shape as 07-french.md §Rollback. Use `array_remove(supported_locales, 'es')`.

---

## Notes for the executor

- ES is well-supported by current LLMs. Quality bar is high — this catalogue should translate cleanly without much manual rescue.
- The biggest risk is UI overflow on buttons + labels (115% length on average). Address by adjusting button widths in the design tokens IF and only if the issue is widespread; one-off overflow is fine.
- "School" terms vary across Spanish-speaking countries. The glossary fixes a single rendering for each — if a sub-agent returns a Mexican variant, normalise to the glossary entry.
