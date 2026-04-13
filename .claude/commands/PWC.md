Task: Live **P**laywright **W**alkthrough + **C**onsolidated bug log for the
{MODULE_NAME} module.

You are starting a new session. Load your superpowers and the memory index
per normal session-start. No prior conversation context is available;
everything you need is in this prompt and in the repo at
`/Users/ram/Desktop/SDB`.

═══════════════════════════════════════════════════════════════════════════
ARGUMENTS
═══════════════════════════════════════════════════════════════════════════

The caller passes the module folder path (or slug). Infer these three
variables from `$ARGUMENTS`:

- `{MODULE_NAME}` — human-friendly name (e.g. Finance, Admissions,
  Communications, Assessment)
- `{MODULE_FOLDER}` — path under `E2E/` (e.g. `E2E/7_finance`,
  `E2E/5_operations/admissions`, `E2E/3_learning/assessment`)
- `{MODULE_SLUG}` — slug used in spec filenames (e.g. `finance`,
  `admissions`, `assessment`). Uppercase form `{MODULE_SLUG_UPPER}` is used
  as the bug-id prefix.

If the arguments are ambiguous, ask once — otherwise proceed.

═══════════════════════════════════════════════════════════════════════════
PRECONDITIONS — VERIFY BEFORE DOING ANY WORK
═══════════════════════════════════════════════════════════════════════════

1. **Playwright MCP must be available.** Verify the
   `mcp__plugin_playwright_playwright__browser_*` tools are listed as
   available in this session. If they are NOT (e.g. the MCP server is
   disconnected), STOP immediately and report the blocker. Do not attempt
   the walkthrough via curl / Bash — that produces worthless output (no
   DOM, no console, no real network panel). Offer the user three options:
   reconnect Playwright and re-issue; bug-log-only delivery from code
   review alone; or partial delivery with a "blocked" walkthrough stub.

2. **Module folder must exist and contain a completed `/e2e-full` spec
   pack.** List `{MODULE_FOLDER}/` and confirm `RELEASE-READINESS.md`
   exists plus at least one `*/assessment-e2e-spec.md`-style role spec.
   If the pack is incomplete, stop and tell the user which leg is
   missing before walking through.

3. **Production credentials must be retrievable from memory.** Check
   `memory/` for the test tenant URL and test account credentials for
   admin / teacher / parent / student. Honour any memory entries marking
   specific URLs as forbidden (e.g. "never use nurul-huda.edupod.app").
   If credentials are missing, stop and ask.

═══════════════════════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════════════════════

`{MODULE_FOLDER}/` contains a completed `/e2e-full` spec pack — some
combination of admin / teacher / parent / student / integration / worker
/ perf / security specs, plus a `RELEASE-READINESS.md` composite index.
Those specs are your source of truth for expected behaviour. You do NOT
rewrite them. Your job is two-fold:

1. Execute a live Playwright walkthrough of every UI spec in the pack,
   against production.
2. Consolidate every bug (live-verified plus spec-level code-review
   findings) into a single actionable bug log.

Before you start, list every file under `{MODULE_FOLDER}/` so you know
which perspectives (admin/teacher/parent/student) and sibling legs
exist. Read `RELEASE-READINESS.md` first — it's the shortest path to
understanding the pack.

═══════════════════════════════════════════════════════════════════════════
DELIVERABLES (two output files)
═══════════════════════════════════════════════════════════════════════════

1. `{MODULE_FOLDER}/PLAYWRIGHT-WALKTHROUGH-RESULTS.md` — walkthrough log
   with Pass/Fail/Partial/Blocked verdicts against every major section
   of every role spec, plus console and network observations, severity
   tally, and a "recommended immediate actions" list. Structure it as
   a log appended as you go, not a dry table.

2. `{MODULE_FOLDER}/BUG-LOG.md` — one consolidated log combining
   live-verified findings from (1) plus spec-level findings already
   documented in `RELEASE-READINESS.md` and each spec's Observations
   section. Each bug must be self-contained enough that a fresh session
   can pick it up cold:
   - Unique ID (module-slug prefix — e.g. `{MODULE_SLUG_UPPER}-NNN`),
     severity (P0/P1/P2/P3), status (Open at start), provenance tag
     (`[L]` live-verified / `[C]` code-review)
   - Summary, reproduction steps, expected behaviour, affected files
     with paths, fix direction, Playwright verification steps,
     release-gate note
   - Top-of-file: workflow instructions for agents picking up a bug
     (status transitions Open → In Progress → Fixed → Verified /
     Blocked / Won't Fix, commit-message format, verification
     requirement)
   - Bottom-of-file: machine-readable summary table

═══════════════════════════════════════════════════════════════════════════
STEP 1 — PLAYWRIGHT WALKTHROUGH
═══════════════════════════════════════════════════════════════════════════

**Target:** production URL for this tenant (check memory for the current
test tenant's URL and test account credentials — do NOT use any
alternative URLs that memory marks as forbidden). Log in using the
admin/owner account first, then the other role accounts applicable to
this module (teacher, parent, student).

- Playwright MCP only. Use `browser_snapshot` — **never**
  `browser_take_screenshot`.
- Capture `browser_console_messages` and `browser_network_requests` per
  page to catch errors and unexpected 4xx/5xx traffic.

**Coverage target:** every route documented in each role's spec. Click
into at least one row per list view; open at least one modal per
create/edit flow; exercise every PDF / export / preview button. Test
Arabic locale (`/ar/*`) on at least one representative page. Test
mobile viewport (375×667) on at least one page. Exercise URL
query-param handoffs the spec claims exist (e.g. status filters,
bucket filters).

**Safety rules:**

- Production is live. Do NOT execute mutating actions that leave
  durable side effects — create, update, delete, issue, void, cancel,
  write-off, allocate, confirm, approve, reject, execute, revoke,
  submit. For those, verify the modal / form shape and button
  enabled-state, then cancel. Mark the row as `🚫 Blocked (mutating)`
  in the results file.
- Do NOT send real notifications, emails, Stripe charges, or trigger
  bulk operations that fan out.

**Critical probes:** scan each spec's Observations section before you
start. If any observation claims that specific endpoints 404 / 500 /
leak data, reproduce it deterministically via `browser_evaluate`
running `fetch()` with credentials included. Endpoint-mismatch bugs
are some of the highest-value findings — prioritise verifying them
live.

**Autonomous execution:** per CLAUDE.md, you don't need approval for
individual Playwright actions. You DO need approval if you discover
something requiring a code fix — flag it, don't fix it.

**Severity rubric:**

- P0 = production feature unusable or data at risk
- P1 = significant functional bug / broken documented user flow
- P2 = UX / data-quality / defence-in-depth
- P3 = polish / perf / consistency

═══════════════════════════════════════════════════════════════════════════
STEP 2 — BUG LOG
═══════════════════════════════════════════════════════════════════════════

After the walkthrough, synthesise everything into `BUG-LOG.md`.
Sources to merge:

- Your own walkthrough findings (tag `[L]`)
- Every P0/P1/P2/P3 observation in `RELEASE-READINESS.md` and each
  spec's Observations section that your walkthrough did not directly
  reproduce (tag `[C]`)

Format each entry with enough context that a new agent can fix it
without re-reading the full spec pack. Include concrete file paths,
grep targets, and a clear fix direction. Do NOT propose exact code
patches — describe approach only. Add multiple fix options (A / B)
when there's a real trade-off.

Size the log to reality — if the module is clean there may be five
bugs; if it's rough there may be thirty. Don't invent findings to hit
a count; don't skip findings to stay under one.

═══════════════════════════════════════════════════════════════════════════
ANTI-PATTERNS TO AVOID
═══════════════════════════════════════════════════════════════════════════

- Don't silently fix bugs you find. Log them.
- Don't use screenshots. Use snapshots.
- Don't rewrite any existing spec files in the module folder. They're
  the source of truth.
- Don't stop at happy-path clicks. Capture console errors, 4xx/5xx,
  missing columns, wrong colours, untranslated strings, hardcoded
  placeholders, query-param handoffs that don't fire, broken
  navigation.
- Don't skip role variants. If the pack has a teacher spec, log in as
  a teacher and exercise it — don't project teacher behaviour from
  the admin walk.
- Don't skip the code-review findings when building the bug log just
  because you couldn't reproduce them via UI. They stay tagged `[C]`
  with reproduction-via-code-inspection notes.
- Don't proceed without Playwright MCP. If the tools aren't available,
  STOP and surface the blocker. A fake walkthrough via curl is worse
  than no walkthrough.

═══════════════════════════════════════════════════════════════════════════
DEFINITION OF DONE
═══════════════════════════════════════════════════════════════════════════

Both files created under `{MODULE_FOLDER}/`. Every spec in the pack
has at least one section referenced in the walkthrough results. Every
bug has a unique ID, concrete file paths, and actionable fix
direction. Report back with the severity tally, the total file line
counts, and the three highest-priority findings the user should act
on first.
