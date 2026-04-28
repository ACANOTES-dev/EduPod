# Implementation 09 — German (`de`) Tier 1 Catalogue

> **Phase:** 4 — Tier 1 Languages (was P4-DE)
> **Wave:** 9 (serial)
> **Depends on:** 08 complete & deployed
> **Deploys:** API restart + worker restart + web restart
> **Model:** Opus 4.7 / **Max effort** (compound nouns + UI overflow risk)

---

## Goal

Ship German (`de`) as the third Tier 1 locale. Same shape as 07-french.md and 08-spanish.md — see those files for the per-batch translation protocol, leak detector, Playwright projects, and log template.

After this ships:

- `apps/web/messages/de.json` exists with 100% parity against `en.json`.
- Notification + PDF German catalogues land.
- Registry flip: `de.active = true`.
- Playwright `de-ltr` + `de-mobile` projects + baselines committed.
- NHQS gets `'de'` appended to `supported_locales`.
- Glossary extended with German entries.

## Critical safety constraints

Same as 07 + 08. **Plus:**

- **Compound noun overflow is the #1 risk.** German agglutinates: "Klassenarbeit" (test), "Erziehungsberechtigte" (legal guardian), "Schulleiter:innenzimmer" (head teacher's office). These routinely overflow buttons, table headers, and inline labels.
- **Mitigation strategy:**
  1. Visual baselines at multiple viewport widths (375, 768, 1024, 1440). The test suite already runs mobile + desktop; ensure DE projects exercise both.
  2. When a compound noun overflows, prefer the shorter alternative IF semantic loss is minor. E.g., "Erziehungsberechtigte" → "Eltern" if the context allows.
  3. Where an overflow can't be shortened acceptably, file the offending CSS truss as a follow-up bug-log entry — do NOT widen buttons just for German (that would distort other locales).
- **Use formal "Sie", not informal "Du".** Schools default to formal address with parents.
- **Capitalise nouns.** German nouns are always capitalised. Sub-agents sometimes lowercase by following English conventions — review for "der lehrer" (wrong) vs "der Lehrer" (correct).

---

## Files to create / modify

Mirror the file list from 07-french.md, substituting `de` for `fr`.

---

## Detailed task breakdown

### Task 1 — Extend the glossary with German

- [ ] **Step 1.1 — Add German column to `New Languages/glossary.md`:**

```markdown
| English term              | French                         | Spanish                | German                                 | Notes                   |
| ------------------------- | ------------------------------ | ---------------------- | -------------------------------------- | ----------------------- |
| Tutor period              | Heure de tutorat               | Hora de tutoría        | Tutorzeit                              |                         |
| Behaviour incident        | Incident de conduite           | Incidencia de conducta | Verhaltensvorfall                      |                         |
| Scheme of work            | Programme pédagogique          | Programación didáctica | Lehrplan                               |                         |
| Year group                | Niveau scolaire                | Curso                  | Klassenstufe                           |                         |
| Form tutor                | Professeur principal           | Tutor                  | Klassenlehrer:in                       | Use gender-neutral form |
| Detention                 | Retenue                        | Castigo                | Nachsitzen                             |                         |
| Merit                     | Bonus de comportement          | Punto positivo         | Pluspunkt                              |                         |
| Demerit                   | Avertissement                  | Amonestación           | Verwarnung                             |                         |
| Parent–teacher meeting    | Réunion parents-profs          | Reunión de padres      | Elternsprechtag                        | Standard DE term        |
| Report card               | Bulletin scolaire              | Boletín de notas       | Zeugnis                                |                         |
| Attendance register       | Registre de présence           | Registro de asistencia | Anwesenheitsliste                      |                         |
| Safeguarding              | Protection de l'enfance        | Protección del menor   | Kinderschutz                           |                         |
| Special Educational Needs | Besoins éducatifs particuliers | NEE                    | Sonderpädagogischer Förderbedarf (SPF) | "SPF" abbrev common     |
| Headteacher               | Directeur·rice                 | Director/a             | Schulleiter:in                         | Gender-neutral          |
| Legal guardian            | Tuteur légal                   | Tutor legal            | Erziehungsberechtigte:r                | Long but unavoidable    |
```

- [ ] **Step 1.2 — Commit.**

### Task 2 — Generate the German catalogue

Per-batch protocol from 07. Translation prompt additions:

```
Translate from English to standard German (Hochdeutsch). Hard rules:

1-10: same as 07/08.
11. Use formal "Sie" address — schools talk to parents formally.
12. Capitalise every noun (German rule).
13. Use gender-neutral forms with colon (Schüler:innen) where the source
    is gender-neutral. If the English uses masculine generic, prefer the
    inclusive form anyway — modern German educational writing leans that way.
14. Watch compound noun length. If a compound exceeds 25 chars, propose a
    shorter alternative inline as `<longer>|<shorter>` and let the merger
    pick. Default: pick the shorter unless semantic loss is real.
15. Match Austrian/Swiss vocabulary only when the audience is explicitly
    those markets — default is Federal German register.
```

- [ ] **Step 2.1–2.4 — Same workflow as 07/08.**

### Task 3 — Notification + PDF catalogues

Mirror 07/08. Pay particular attention to long button labels in PDF templates — the receipt and report card both have header strings that German tends to overflow.

### Task 4 — Registry flip

`de.active = true`.

### Task 5 — Playwright projects + baselines

- [ ] **Step 5.1 — Add `de-ltr` and `de-mobile` projects.**
- [ ] **Step 5.2 — Generate baselines at BOTH 375px and 1440px viewports.** Inspect carefully for compound-noun overflow.
- [ ] **Step 5.3 — Where overflow is severe**, update the relevant key in `de.json` to use a shorter compound, regenerate the snapshot. If the shorter form loses semantic, leave the overflow + add a bug-log entry under `New Languages/_evidence/de-overflow-issues.md` for the next QA pass.

### Task 6 — Leak detector for DE

Extend the leak spec.

### Task 7 — Local sweep, push, deploy, NHQS rollout

- [ ] **Step 7.1–7.5 — Same shape as 07/08.**
- [ ] **Step 7.6 — Append completion entry** including the overflow ledger if any (number of strings flagged + paths).

---

## Acceptance criteria

- [ ] `de.json` parity 100%
- [ ] Notification + PDF DE catalogues exist
- [ ] Registry: `de.active = true`
- [ ] Playwright de-ltr + de-mobile projects + baselines
- [ ] No untranslated English on `[de]` pages
- [ ] Compound-noun overflows: either fixed via shorter compound or logged as follow-up bugs (≤10 acceptable; >10 requires investigation)
- [ ] No `MISSING_MESSAGE` in Sentry
- [ ] CI green; production deploy successful
- [ ] NHQS `supported_locales` includes `de`
- [ ] en+ar+fr+es regression clean
- [ ] Glossary updated
- [ ] `IMPLEMENTATION_LOG.md` updated with overflow ledger

---

## Verification commands

```bash
turbo lint && turbo type-check && turbo test
pnpm --filter @school/web exec playwright test --project=de-ltr --project=de-mobile
pnpm --filter @school/web exec playwright test --grep "@locale-leak de"
```

---

## Rollback

Same as 07. `array_remove(supported_locales, 'de')`.

---

## Notes for the executor

- German Sub-agent QA: the most common error class is incorrect noun capitalisation. Run a regex sweep before committing:
  ```bash
  jq -r 'paths(scalars) as $p | [($p|join(".")), getpath($p)] | @tsv' apps/web/messages/de.json \
    | awk -F'\t' '{ if (match($2, /\b(der|die|das) [a-zäöüß]/)) print $1 ": " $2 }' \
    | head -30
  ```
  Any matches: a noun starts with lowercase. Fix.
- Long compounds in table headers can break responsive table widths. The visual baselines at 375px viewport will catch the worst offenders — fix in the JSON, not the CSS.
- Address parents formally. If a sub-agent returned "Du" forms anywhere, regex-fix them to "Sie" / "Ihre" / "Ihr".
- Phase 6 rollout: NHQS only initially. Other tenants flip after human German-speaker QA.
