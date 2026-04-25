# Implementation 06 — Regression sweep + i18n parity + mobile + docs

> **Wave:** 4 (serial — runs alone after every other impl is `completed`)
> **Classification:** polish
> **Depends on:** 02, 03, 04, 05
> **Deploys:** Web restart only (if any translation additions); otherwise no deploy at all

---

## Goal

The final ship-gate for the engagement-fix rebuild. Verify every page works on production, every translation key has an English and an Arabic counterpart, every page renders correctly at 375px mobile width, and every architecture document reflects the post-rebuild reality.

This impl is mostly verification, not new code. Code changes here are limited to filling in translation gaps and tightening anything Playwright catches that the earlier impls missed.

After this impl ships:

- Every engagement route renders cleanly with zero console errors and zero error-boundary trips.
- Every translation key in the `engagement` and `engagementHub` namespaces has both EN and AR.
- Every page is usable at 375px mobile width.
- `docs/architecture/feature-map.md`, `module-blast-radius.md`, and `danger-zones.md` reflect the engagement-fix changes.

## Shared files this impl touches

- `messages/en.json` — gap-fill any missing keys discovered in the parity sweep.
- `messages/ar.json` — gap-fill any missing Arabic translations.
- `docs/architecture/feature-map.md` — verify and update the Engagement section.
- `docs/architecture/module-blast-radius.md` — verify (likely no change).
- `docs/architecture/danger-zones.md` — add an entry about the historic envelope-unwrap bug now resolved.
- `IMPLEMENTATION_LOG.md` — final completion record. Always in a separate commit.

## What to build

### Sub-step 1: Translation parity sweep

The audit captured this console error:

```
MISSING_MESSAGE: engagement.statuses.undefined (en)
```

That was caused by the envelope bug (status came through as `undefined`). Impl 01 fixes the cause. Verify the `engagement.statuses.*` namespace in both `messages/en.json` and `messages/ar.json` covers every event status enum value:

```
draft, published, open, closed, in_progress, completed, cancelled, archived
```

Each status must have a key under `engagement.statuses.<status>` in both EN and AR. If any are missing, add them.

Then do a broader parity sweep: extract every translation key referenced via `t(...)` in `apps/web/src/app/[locale]/(school)/engagement/**/*.tsx` and `apps/web/src/app/[locale]/(school)/engagement/_components/**/*.tsx`, and verify each exists in BOTH `en.json` and `ar.json`. Tools:

```bash
# All t() calls in engagement
grep -rEho "t\(['\"][^'\"]+['\"]" apps/web/src/app/\[locale\]/\(school\)/engagement \
  | sed -E "s/t\(['\"]([^'\"]+)['\"].*/\1/" \
  | sort -u
```

For each unique key, verify it exists in both locale files. Hand-add any gaps with sensible defaults. Use Rule H9 — re-read both files immediately before writing.

### Sub-step 2: Full Playwright revisit on production

Re-run the audit walkthrough on production. Goal: zero console errors, zero error-boundary trips, every page renders the expected content.

**Staff session (login as `owner@nhqs.test` / `Password123!` at https://nhqs.edupod.app):**

| Route                                      | Expected                                   | What to verify                                                                             |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `/operations`                              | Tile dashboard                             | 7 module tiles, Engagement tile present                                                    |
| `/engagement`                              | NEW tile dashboard                         | 4 tiles (Events, Form Templates, Analytics, Consent Archive). NO 4-tab strip below header. |
| `/engagement/events`                       | List with the existing School Trip event   | Inline `<nav>` strip is GONE                                                               |
| `/engagement/events/new`                   | 6-step wizard                              | Renders, no console errors                                                                 |
| `/engagement/events/[id]`                  | Detail with status badge + dashboard cards | NO error boundary, status reads "Draft", cards show 0/0                                    |
| `/engagement/events/[id]/participants`     | Participants table                         | Page header has the event title                                                            |
| `/engagement/events/[id]/attendance`       | Headcount bar + participant cards          | Page header has the event title                                                            |
| `/engagement/events/[id]/risk-assessment`  | Approve/reject UI or empty state           | Page header has the event title                                                            |
| `/engagement/events/[id]/incidents`        | New incident form + list                   | Page header has the event title                                                            |
| `/engagement/events/[id]/trip-pack`        | Preview + download button                  | Loads (was skeleton lock)                                                                  |
| `/engagement/form-templates`               | List                                       | Empty state if none                                                                        |
| `/engagement/form-templates/new`           | Editor                                     | Save with empty form → field errors visible + toast appears                                |
| `/engagement/form-templates/[id]`          | Detail with `CompletionDashboard`          | Single "Submission completion" card, NOT three mis-mapped cards                            |
| `/engagement/analytics`                    | KPI cards + charts                         | NO error boundary                                                                          |
| `/engagement/consent-archive`              | List                                       | Empty state if none                                                                        |
| `/engagement/conferences/[id]/setup`       | Form                                       | Loads (was skeleton lock)                                                                  |
| `/engagement/conferences/[id]/schedule`    | Schedule grid                              | Loads (was skeleton lock)                                                                  |
| `/engagement/conferences/[id]/my-schedule` | Empty state                                | Renders (was 400)                                                                          |

**Parent session (login as `parent@nhqs.test` / `Password123!`):**

| Route                                              | Expected                                                        |
| -------------------------------------------------- | --------------------------------------------------------------- |
| `/dashboard/parent`                                | NO "Missing required permission: parent.view_engagement" toasts |
| `/engagement/parent/events`                        | Events list (or empty state), NO 403                            |
| `/engagement/parent/events/[id]` (if event exists) | Detail with register/withdraw/pay actions                       |

For every page, capture:

- Console errors (Playwright `browser_console_messages` with `level=error`).
- Network errors (status >= 400 in `browser_network_requests`).
- Visual rendering (screenshot).

If any console error or 4xx/5xx response is observed, file a follow-up bug fix in the next sub-step.

### Sub-step 3: Bug fixes for whatever Playwright catches

Anything that broke between Impl 01–05 and the production smoke test gets fixed here. Common patterns:

- A page reads `response.someField` where `someField` is array-typed — needs `?? []`.
- A page assumes `event.staff` is non-empty — needs guard.
- A translation key was added in EN but not AR (or vice-versa).
- A `print:` Tailwind utility doesn't behave as expected on a specific browser — adjust.
- A mobile breakpoint causes overflow on a specific page — fix with `min-w-0` or `overflow-x-auto`.

Each fix is its own small commit. Stage by explicit pathspec.

### Sub-step 4: Mobile responsiveness check

Use Playwright at viewport 375x812 (iPhone SE). Visit every staff-facing engagement page from the table above. For each, verify:

- No horizontal scroll on the page body.
- Every interactive element is at least 44x44px.
- Tables have `overflow-x-auto` on a wrapper.
- Forms are single-column at <md breakpoint.
- Tile dashboard (Impl 02) shows 1 column.

If any page overflows or has unreachable controls, fix per the `.claude/rules/frontend.md` mobile rules.

### Sub-step 5: Architecture docs

**`docs/architecture/feature-map.md`** — find the Engagement section. Verify the route list still matches reality after Impl 02's changes (the route list itself didn't change; the strip was removed but the routes are the same). Update the "Last verified" date at the top of the document. If the file structure dictates a count of pages/endpoints in a quick-reference table, verify it's correct.

**`docs/architecture/module-blast-radius.md`** — find the EngagementModule entry. Verify its imports/exports/consumers list still matches reality. The exported services (`ConferencesService`, `ConsentRecordsService`, `EventsService`) and consumers (`EarlyWarningModule`) are unchanged. Likely no change needed; verify and note in the completion record.

**`docs/architecture/danger-zones.md`** — add a new entry:

```markdown
### `apiClient` envelope auto-unwrap (engagement-fix Impl 01)

The frontend `apiClient<T>()` at `apps/web/src/lib/api-client.ts` auto-unwraps
single-key `{ data: T }` response envelopes. This was added during the
engagement-fix rebuild to resolve a class of bugs where pages read
`response.someField` directly off a wrapped `{ data: { someField } }` envelope.

The behaviour is conservative: it only strips the wrap when the response body
is a plain object with EXACTLY one key called `data` and a non-array value.
Paginated responses (`{data, meta}`), error envelopes (`{error: {...}}`),
raw arrays, and already-unwrapped objects all flow through unchanged.

**Implication for new code:** when calling `apiClient<T>(...)`, declare `T` as
the inner shape (e.g. `apiClient<EventRecord>(...)`), not the wrapped envelope
(`apiClient<{data: EventRecord}>(...)`). Reading `response.someField` will
work directly on the unwrapped value.

**The legacy `unwrap()` helper at the same path remains available** for explicit
opt-in unwrapping. It is idempotent on already-unwrapped values, so existing
defensive `unwrap(await apiClient(...))` callsites continue to work after
this change.
```

### Sub-step 6: Pre-launch checklist hook

Open `docs/operations/PRE-LAUNCH-CHECKLIST.md` (per `.claude/rules/pre-launch-tracking.md`). Confirm there are no engagement-related deferred items lingering in Part 5 — if any, mark them as resolved by referencing the completed engagement-fix impls.

Particularly: the "form template auto-key UX" or "envelope unwrap helper rollout" items if they were ever deferred.

### Sub-step 7: Local regression sweep

Run the full test matrix one final time:

```bash
pnpm turbo run type-check
pnpm turbo run lint
pnpm turbo run test
```

If anything fails, fix or roll back. The whole engagement-fix rebuild must leave CI green.

### Sub-step 8: Commit and deploy any fixes

If any sub-step above produced code changes (translation gaps, bug fixes from the Playwright sweep, mobile-responsive fixes), commit and deploy. If everything was already correct from Impls 01–05 and only the docs needed updating, commit the docs and skip the deploy.

## Tests

- No new automated tests required.
- All existing tests across all packages must pass.

## Watch out for

- **Don't introduce new bugs in this impl.** This is a polish + verification pass, not a refactor.
- **The Playwright sweep is the gate.** If a page is broken on production after Impls 01–05, this impl exists to catch it. Be thorough.
- **The `engagement.statuses.*` keys must include every enum value.** Missing one means the next time a backend status changes (e.g. `archived`), the UI shows a missing-message error. Be exhaustive.
- **Don't add new permissions, models, endpoints.** Anything beyond the audit findings is out of scope. If you discover a new gap, file a follow-up note rather than fixing it here.
- **The `docs/architecture/feature-map.md` update is gentle.** Per `.claude/rules/feature-map-maintenance.md`, only update the Engagement section if the actual feature map changed. If routes are identical, just bump the "Last verified" date and confirm the section is accurate.
- **Mobile testing — use the device emulation in Playwright.** Don't just shrink the desktop viewport; that doesn't trigger touch-event paths or iOS Safari quirks.

## Deployment notes

If sub-steps 1, 3, or 4 produced code changes, deploy via the standard web-only flow:

1. Commit locally (split per concern: i18n gaps / Playwright fixes / mobile fixes / docs).
2. Rsync the affected files (or full repo with the standard excludes from CLAUDE.md):
   ```bash
   rsync -avz --delete \
     --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='dist' \
     --exclude='.env' --exclude='.env.local' --exclude='.turbo' --exclude='*.tsbuildinfo' \
     /Users/ram/Desktop/SDB/ root@46.62.244.139:/opt/edupod/app/
   ```
3. `ssh root@46.62.244.139 'chown -R edupod:edupod /opt/edupod/app/'`
4. `ssh root@46.62.244.139 'sudo -u edupod bash -lc "cd /opt/edupod/app && rm -rf apps/web/.next && pnpm turbo run build --filter=@school/web --force"'`
5. `ssh root@46.62.244.139 'sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 restart web --update-env'`
6. **Final smoke test:** the full staff + parent walkthrough from sub-step 2 must show ZERO errors.
7. Log flips to `completed` in a separate commit after verification. The completion record for Impl 06 also serves as the final ship summary for the entire engagement-fix rebuild — write it as such, summarising what shipped across all 6 impls and what (if anything) remains as future work.

If sub-steps 1, 3, 4 produced no code changes, only the docs were touched:

1. Commit the docs locally.
2. Rsync only the `docs/` directory and the `IMPLEMENTATION_LOG.md`.
3. No build, no PM2 restart.
4. Log flips to `completed` in a separate commit.
