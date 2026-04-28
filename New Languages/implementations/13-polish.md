# Implementation 13 — Polish (`pl`) Tier 2 Catalogue

> **Phase:** 5 — Tier 2 Languages (was P5-PL)
> **Wave:** 13 (serial — final implementation in this expansion before Phase 6 rollout ops)
> **Depends on:** 12 complete & deployed
> **Deploys:** API restart + worker restart + web restart
> **Model:** Opus 4.7 / **Max effort** (highest QA risk in Tier 2: 7 cases, 3 genders, complex aspect/tense)

---

## Goal

Ship Polish (`pl`) as the third and final Tier 2 locale. Same shape as 11/12 — the route guard is already shipped, just translation + registry flip + Playwright project + NHQS rollout.

After this ships:

- `apps/web/messages/pl.json` exists with 100% parity against the Tier 2 allowlist.
- Notification + 4 parent-relevant PDF catalogues exist in Polish.
- Registry: `pl.active = true`, `tier: 2`.
- Playwright `pl-ltr` + `pl-mobile` projects + baselines.
- NHQS gets `'pl'` appended to `supported_locales`.
- Glossary extended.
- `New Languages/_evidence/pl-review-queue.md` lists strings flagged for post-launch native-speaker review (Polish has the highest expected QA volume in Tier 2).

## Critical safety constraints

Same as 11/12 plus:

- **Polish has 7 grammatical cases** (nominative, genitive, dative, accusative, instrumental, locative, vocative). Sub-agents miss these regularly. The structural parity test cannot detect grammatical errors — it only checks key presence. Plan for a post-launch QA pass.
- **Three grammatical genders** (masculine animate / masculine inanimate / feminine / neuter — counted as 4 in some grammars; treat the masculine animate vs inanimate distinction as relevant for accusative case). Verb agreement and adjective agreement track gender.
- **Verb aspect (perfective vs imperfective)** is a core Polish grammar dimension. Sub-agents pick aspects based on context they may not have. Spot-check action verbs in notifications.
- **Use formal address** (`Pan` / `Pani` + 3rd-person verb). Schools never use `ty` (informal).
- **Diacritics:** `ą`, `ć`, `ę`, `ł`, `ń`, `ó`, `ś`, `ź`, `ż`. Sub-agents reliably handle these; just verify a spot-check.

---

## Files to create / modify

Mirror 11-italian.md and 12-romanian.md. Plus:

- **Create:** `New Languages/_evidence/pl-review-queue.md` — running ledger of strings flagged for native-speaker review.

---

## Detailed task breakdown

### Task 1 — Extend the glossary with Polish

```markdown
| English term           | Italian                      | Romanian            | Polish               | Notes                                |
| ---------------------- | ---------------------------- | ------------------- | -------------------- | ------------------------------------ |
| Parent–teacher meeting | Riunione genitori-insegnanti | Ședință cu părinții | Zebranie z rodzicami | Or "wywiadówka" (informal)           |
| Report card            | Pagella                      | Carnet de note      | Świadectwo szkolne   |                                      |
| Attendance             | Frequenza                    | Prezență            | Frekwencja           |                                      |
| Tuition fees           | Rette scolastiche            | Taxe școlare        | Opłaty szkolne       |                                      |
| Receipt                | Ricevuta                     | Chitanță            | Pokwitowanie         |                                      |
| Invoice                | Fattura                      | Factură             | Faktura              |                                      |
| Statement              | Estratto conto               | Extras de cont      | Wyciąg z konta       |                                      |
| Behaviour              | Condotta                     | Conduită            | Zachowanie           |                                      |
| Year group / class     | Classe                       | Clasă               | Klasa                |                                      |
| Headteacher            | Dirigente scolastico         | Director            | Dyrektor szkoły      |                                      |
| Login                  | Accedi                       | Autentificare       | Logowanie            |                                      |
| Logout                 | Esci                         | Deconectare         | Wyloguj              |                                      |
| Welcome (greeting)     | Benvenuto/a                  | Bun venit           | Witamy               | Use "witamy" (formal plural we-form) |
```

### Task 2 — Generate the Polish Tier 2 catalogue (highest care in Tier 2)

Sub-agent prompt customisations:

```
Translate from English to Standard Polish for parent + student LMS surface.

Hard rules 1-10 same as 07.

Polish-specific:
11. Use formal address: "Pan" (sir) / "Pani" (madam) + 3rd-person verb form.
    NEVER use "ty" / "wy" (informal).
12. Apply correct case inflection for nouns + adjectives + pronouns:
    nominative, genitive, dative, accusative, instrumental, locative, vocative.
13. Match grammatical gender: masculine animate, masculine inanimate,
    feminine, neuter. Adjectives + verbs agree.
14. Verb aspect: choose perfective (e.g., "wysłać") for one-time completed
    actions; imperfective ("wysyłać") for ongoing/habitual. When unsure,
    flag for review (see rule 17).
15. Use Polish diacritics: ą, ć, ę, ł, ń, ó, ś, ź, ż. Never use ASCII
    substitutes (a, c, e, l, n, o, s, z).
16. Translate idiomatically. Polish school terminology has well-established
    forms — match the glossary exactly.
17. If uncertain about a translation (case selection, aspect, gender),
    suffix the value with `// REVIEW: <reason>` so the post-process step
    captures it to pl-review-queue.md.
18. Translate ONLY namespaces in: <paste TIER_2_NAMESPACES>.
```

- [ ] **Step 2.1–2.4 — Same workflow as 11/12 plus the `pl-review-queue.md` extraction step (mirror the pattern from 10-irish.md).**

### Task 3 — Notification + parent-relevant PDF catalogues

Mirror 11. Pay particular attention to PDF report card terminology — the Polish equivalent has specific official forms.

### Task 4 — Registry flip + Playwright

- [ ] **Step 4.1 — `pl.active = true`.**
- [ ] **Step 4.2 — `pl-ltr` + `pl-mobile` projects.**
- [ ] **Step 4.3 — Generate baselines** (parent + student only).

### Task 5 — Leak detector for PL

Extend.

### Task 6 — Push, deploy, NHQS rollout

Same as 11/12. Enable `pl` for NHQS via SQL.

### Task 7 — Production verification + log

Same as 11/12. Append completion entry, prominently linking `pl-review-queue.md`.

---

## Acceptance criteria

- [ ] `pl.json` parity 100% against Tier 2 allowlist
- [ ] No out-of-scope keys in `pl.json`
- [ ] Notification + parent PDF Polish catalogues exist
- [ ] Registry: `pl.active = true`, `tier: 2`
- [ ] Playwright pl-ltr + pl-mobile + baselines
- [ ] No untranslated English on `[pl]` parent + student pages
- [ ] No `MISSING_MESSAGE` in Sentry
- [ ] `pl-review-queue.md` exists with flagged strings
- [ ] CI green; production deploy successful
- [ ] NHQS `supported_locales` includes `pl`
- [ ] All earlier locales regression clean (en+ar+fr+es+de+ga+it+ro)
- [ ] Glossary fully extended
- [ ] `IMPLEMENTATION_LOG.md` updated with link to review queue

---

## Verification commands

```bash
turbo lint && turbo type-check && turbo test
pnpm --filter @school/web exec playwright test --project=pl-ltr --project=pl-mobile
pnpm --filter @school/web exec playwright test --grep "@locale-leak pl"

# Spot-check ASCII substitution (sanity sweep — should return 0 hits)
grep -P "[a-z]rzeszywanie|laczenie|lozko" apps/web/messages/pl.json && echo "FAIL: missing diacritics" || echo "OK"

APP_URL=https://nhqs.edupod.app pnpm --filter @school/web exec playwright test --project=pl-ltr --grep "@smoke"
```

---

## Rollback

Same as 11/12. `array_remove(supported_locales, 'pl')`.

---

## Notes for the executor

- Polish is the last and hardest implementation in this expansion. Budget extra time for review-queue extraction.
- The 7-case + 3-gender + aspect combinatorial means even Opus 4.7 max effort produces grammatically suspect strings sometimes. The structural parity test catches none of this. The visual baselines catch no grammatical errors. The leak detector catches none of this. **Native-speaker review post-launch is the only real quality gate.**
- Common error patterns to spot-check yourself:
  - Wrong case after preposition (e.g., "do" requires genitive — `do szkoły` not `do szkoła`).
  - Wrong gender agreement (`ta szkoła` not `ten szkoła`).
  - Wrong aspect (perfective where imperfective is needed: "wysłał" vs "wysyłał").
  - Uninflected English loanwords ("Login!" instead of "Zaloguj się").
- The `pl-review-queue.md` ledger is the real deliverable for QA. Don't optimise for zero entries — optimise for honesty about what needs review.
- Phase 6 rollout for `pl` should NOT happen for any tenant other than NHQS until at least one native-speaker pass on the review queue is complete.
- Flag `feature-map.md` to user (per `feature-map-maintenance.md`). Do NOT auto-update.
- Consider adding a follow-up entry to `docs/operations/PRE-LAUNCH-CHECKLIST.md` Part 5: "Polish (and Irish) translations have flagged QA queues — schedule native-speaker reviews."
