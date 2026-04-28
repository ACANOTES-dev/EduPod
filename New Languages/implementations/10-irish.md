# Implementation 10 — Irish (`ga`) Tier 1 Catalogue

> **Phase:** 4 — Tier 1 Languages (was P4-GA)
> **Wave:** 10 (serial — last Tier 1 implementation; benefits from the glossary built up by 07/08/09)
> **Depends on:** 09 complete & deployed
> **Deploys:** API restart + worker restart + web restart
> **Model:** Opus 4.7 / **Max effort** (Irish is the highest-risk Tier 1 — smaller AI training corpus, irregular grammar, school-domain terms often borrowed)

---

## Goal

Ship Irish (Gaeilge, `ga`) as the final Tier 1 locale. Same structural shape as 07/08/09 — see those for protocol details.

After this ships:

- `apps/web/messages/ga.json` exists with 100% parity against `en.json`.
- Notification + PDF Irish catalogues land.
- Registry: `ga.active = true`.
- Playwright `ga-ltr` + `ga-mobile` projects + baselines.
- NHQS gets `'ga'` appended to `supported_locales`.
- Glossary extended with Irish entries (this implementation contributes the most glossary growth).
- A separate `New Languages/_evidence/ga-review-queue.md` ledger of strings flagged for native-speaker review post-launch.

## Critical safety constraints

Same as 07–09 plus:

- **Smaller training corpus.** Sub-agent quality on Irish is materially weaker than on FR/ES/DE. Expect 10–20% of strings to need post-launch human review. Track them aggressively.
- **Irregular grammar.** Initial mutations (séimhiú, urú), lenition, verb conjugation tables, vocative case — sub-agents miss these. Spot-check the AR-strength edits in PR-style review.
- **Borrowed school terminology is acceptable.** Irish education vocabulary often borrows from English — "rang" (class) is Irish; "scoláireacht" (scholarship) is Irish; but for terms with no native equivalent in modern usage, an English loanword in italics is acceptable rather than a forced calque. Use the established Department of Education and Skills (DES) Gaeilge terminology where it exists — see `https://www.gov.ie/en/policy-information/26ba2-foras-na-gaeilge/` and the official Gaeilge gov.ie equivalent for canonical school-system terms.
- **Bilingual addresses on the island of Ireland.** When formatting school addresses, both English and Irish forms may co-exist on official documents. Don't try to Gaelicise placenames — the tenant's stored value is canonical.

---

## Files to create / modify

Mirror 07-french.md, substituting `ga` for `fr`. Plus:

- **Create:** `New Languages/_evidence/ga-review-queue.md` — running ledger of strings flagged for post-launch native-speaker QA.

---

## Detailed task breakdown

### Task 1 — Extend the glossary with Irish

- [ ] **Step 1.1 — Add Irish column:**

```markdown
| English term              | French                         | Spanish                | German            | Irish                                   | Notes                                       |
| ------------------------- | ------------------------------ | ---------------------- | ----------------- | --------------------------------------- | ------------------------------------------- |
| Tutor period              | Heure de tutorat               | Hora de tutoría        | Tutorzeit         | Tréimhse rang-mhúinteora                |                                             |
| Behaviour incident        | Incident de conduite           | Incidencia de conducta | Verhaltensvorfall | Eachtra iompair                         |                                             |
| Scheme of work            | Programme pédagogique          | Programación didáctica | Lehrplan          | Plean oibre                             |                                             |
| Year group                | Niveau scolaire                | Curso                  | Klassenstufe      | Bliainghrúpa                            |                                             |
| Form tutor                | Professeur principal           | Tutor                  | Klassenlehrer:in  | Rang-mhúinteoir                         |                                             |
| Detention                 | Retenue                        | Castigo                | Nachsitzen        | Coinneáil siar                          |                                             |
| Merit                     | Bonus de comportement          | Punto positivo         | Pluspunkt         | Pointe creidiúna                        |                                             |
| Demerit                   | Avertissement                  | Amonestación           | Verwarnung        | Pointe lochta                           |                                             |
| Parent–teacher meeting    | Réunion parents-profs          | Reunión de padres      | Elternsprechtag   | Cruinniú tuismitheoirí–múinteoirí       |                                             |
| Report card               | Bulletin scolaire              | Boletín de notas       | Zeugnis           | Tuairisc scoile                         |                                             |
| Attendance register       | Registre de présence           | Registro de asistencia | Anwesenheitsliste | Clár tinrimh                            |                                             |
| Safeguarding              | Protection de l'enfance        | Protección del menor   | Kinderschutz      | Cosaint leanaí                          |                                             |
| Special Educational Needs | Besoins éducatifs particuliers | NEE                    | SPF               | Riachtanais Speisialta Oideachais (RSO) | Standard NCSE term                          |
| Headteacher               | Directeur·rice                 | Director/a             | Schulleiter:in    | Príomhoide                              |                                             |
| Year (academic)           | Année scolaire                 | Curso académico        | Schuljahr         | Bliain acadúil                          |                                             |
| Boarding                  | Internat                       | Internado              | Internat          | Bordáil                                 |                                             |
| State exam                | Examen d'état                  | Examen estatal         | Staatsprüfung     | Scrúdú stáit                            | Refers to Junior/Leaving Cert in IE context |
| Junior Cycle              | —                              | —                      | —                 | An tSraith Shóisearach                  | Native IE term — keep                       |
| Leaving Certificate       | —                              | —                      | —                 | Ardteistiméireacht                      | Native IE term — keep                       |
```

- [ ] **Step 1.2 — Commit.**

### Task 2 — Generate the Irish catalogue (highest-care implementation)

Per-batch protocol from 07. Translation prompt additions:

```
Translate from English to Standard Irish (An Caighdeán Oifigiúil).

Hard rules:
1-10: same as 07.
11. Apply correct initial mutations (séimhiú, urú) where grammar requires.
12. Use the vocative case (a + lenition) only in greetings/forms of address.
13. Inflect nouns according to gender + case: nominative, genitive, dative,
    vocative.
14. Conjugate verbs correctly across past, present, future, conditional,
    habitual past tenses where used.
15. Use established Gaeilge school-system vocabulary (DES / NCCA standard)
    where it exists. See glossary entries — match exactly.
16. Where no established Gaeilge term exists for a modern UI concept, prefer
    a calque over an English loanword. E.g., "dashboard" → "deais" (calque
    from "deic"). Flag uncertain choices for post-launch review.
17. Where the source uses a stylistic device unavailable in Irish (e.g.,
    English-specific puns), prefer a clear translation over a forced
    rendering.
18. Mark uncertain renderings inline with a comment: `// REVIEW: <reason>`
    in the JSON value (post-process to strip + log to ga-review-queue.md
    before the parity test runs).
```

- [ ] **Step 2.1 — Inventory namespaces.**
- [ ] **Step 2.2 — Dispatch sub-agents in batches of ~10 namespaces.** Use Opus 4.7 (not Sonnet) — Irish is the hardest language in this whole expansion.
- [ ] **Step 2.3 — Pre-process for review markers:**

```bash
# Extract any `// REVIEW: ...` comments from agent output before merging:
grep -n 'REVIEW:' /tmp/agent-output-*.json > New\ Languages/_evidence/ga-review-queue.md
# Strip them from the JSON before merging
sed -E 's| // REVIEW: [^"]+||g' /tmp/agent-output-*.json > /tmp/cleaned-*.json
```

> Adjust the regex to your sub-agent's actual marker format. The point is: every flagged string lands in the review queue; the JSON merges clean.

- [ ] **Step 2.4 — Merge into `apps/web/messages/ga.json`.** Validate JSON. Run parity until 100% pass.

- [ ] **Step 2.5 — Spot-check** a sampling of strings yourself (you're Opus 4.7 / max effort — scan for obviously broken Irish like missing initial mutations, English words that should have been translated, or patently non-grammatical conjugations).

- [ ] **Step 2.6 — Commit:**

```bash
git add apps/web/messages/ga.json New\ Languages/_evidence/ga-review-queue.md
git commit -m "feat(i18n): add full Irish catalogue (ga.json) — Tier 1; N strings flagged for QA"
```

### Task 3 — Notification + PDF catalogues

Mirror 07. Notifications are short and benefit from extra grammatical scrutiny — read each one before committing.

### Task 4 — Registry flip

`ga.active = true`.

### Task 5 — Playwright projects + baselines

- [ ] **Step 5.1 — Add `ga-ltr` + `ga-mobile` projects.**
- [ ] **Step 5.2 — Generate baselines.** Irish text is generally similar in length to English (no compound-noun risk like German), so visual issues are likely rare.
- [ ] **Step 5.3 — Inspect snapshots for any visual artefacts** specific to Irish (e.g., Old Irish acute accents over uppercase letters can render oddly with some webfonts — verify the school font family includes precomposed `É`, `Á`, `Í`, `Ó`, `Ú`).

### Task 6 — Leak detector for GA

Extend the leak spec.

### Task 7 — Push, deploy, NHQS rollout

Same as 07. `UPDATE tenants ... 'ga' ...` for NHQS only.

### Task 8 — Verify on production, then publish the review queue

- [ ] **Step 8.1 — Production verification** (same as 07).
- [ ] **Step 8.2 — Append completion entry to `IMPLEMENTATION_LOG.md`**, prominently linking the `ga-review-queue.md` evidence file.
- [ ] **Step 8.3 — File a follow-up todo:** "Native Irish speaker review of `ga-review-queue.md` — N flagged strings. Post-review, ship a cleanup commit per micro-session." Add to `docs/operations/PRE-LAUNCH-CHECKLIST.md` Part 5 if appropriate (per `pre-launch-tracking.md`).

---

## Acceptance criteria

- [ ] `ga.json` parity 100%
- [ ] Notification + PDF GA catalogues exist
- [ ] Registry: `ga.active = true`
- [ ] Playwright ga-ltr + ga-mobile + baselines committed
- [ ] No untranslated English on `[ga]` pages
- [ ] No `MISSING_MESSAGE` in Sentry
- [ ] `ga-review-queue.md` exists with every flagged string + reason
- [ ] CI green; production deploy successful
- [ ] NHQS `supported_locales` includes `ga`
- [ ] en+ar+fr+es+de regression clean
- [ ] Glossary fully extended
- [ ] `IMPLEMENTATION_LOG.md` updated with link to review queue

---

## Verification commands

```bash
turbo lint && turbo type-check && turbo test
pnpm --filter @school/web exec playwright test --project=ga-ltr --project=ga-mobile
pnpm --filter @school/web exec playwright test --grep "@locale-leak ga"
```

---

## Rollback

Same as 07. `array_remove(supported_locales, 'ga')`.

---

## Notes for the executor

- Irish is THE highest-risk Tier 1 language. Budget extra QA time. The 100% parity is a structural test (every key has a value), not a quality test (every value is good Irish). Quality lives in the human review pass.
- Resist the urge to "improve" the official DES Gaeilge terms even if a more colloquial or modern variant exists. Schools rely on the formal register.
- Some Irish strings will need to encode placeholders that don't fit naturally into the sentence structure. If a `{name}` placeholder ends up creating an ungrammatical mutation context, prefer rephrasing the whole sentence over forcing the placeholder.
- After deploy, the NHQS pilot user is unlikely to actually use Irish day-to-day (they're a UAE school) — that's fine; the implementation still verifies, and Phase 6 rollout to an Irish-using tenant is a separate ops task.
- Flag `feature-map.md` to user for update (per `feature-map-maintenance.md`). Do NOT auto-update.
