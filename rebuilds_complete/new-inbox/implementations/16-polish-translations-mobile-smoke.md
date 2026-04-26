# Implementation 16 — Polish, Translations, Mobile, Smoke Tests, Docs

> **Wave:** 5 (single — serial)
> **Depends on:** 10, 11, 12, 13, 14, 15
> **Deploys:** Web restart only

---

## Goal

The cleanup pass that turns the inbox from "all features land" to "ready to ship". Translations sweep, mobile responsiveness verification, morph bar wire-up across all surfaces, end-to-end smoke test pass, architecture doc updates, and feature map flag for user review.

## What to do

### 1. Translation sweep

Walk every new file in Wave 4 and verify:

- Every user-visible string uses `useTranslations()` or `getTranslations()` — no hard-coded English in JSX
- Every string has a key in `messages/en.json` AND `messages/ar.json`
- Arabic translations are accurate (not Google Translate output — review against existing Arabic strings in the codebase for tone/style consistency)
- Plurals use the platform's existing plural pattern (likely `useTranslations` + `count` interpolation)
- LTR-locked content (email addresses, URLs, numeric IDs) stays LTR even in Arabic

Run `pnpm i18n:lint` (if it exists) or grep for hard-coded strings:

```bash
grep -rn '"[A-Z][a-z]' apps/web/src/app/[locale]/(school)/inbox/_components/ \
  | grep -v 'className' | grep -v 'Schema'
```

Fix any leaks.

### 2. Mobile responsiveness verification

Open every inbox page at 375px (iPhone SE) and 320px (smallest supported) widths:

- `/inbox` — sidebar collapses correctly, thread list usable
- `/inbox/threads/[id]` — thread view full-screen with back button
- `/inbox/search` — results readable, snippet wraps
- `/inbox/audiences` — list readable, actions accessible
- `/inbox/audiences/new` — form usable, chip builder vertically stacked
- `/inbox/oversight` — table scrolls horizontally with sticky first column
- `/inbox/oversight/threads/[id]` — same as inbox thread view + audit sidebar collapses
- `/settings/communications/messaging-policy` — matrix grid collapses to vertical sections
- `/settings/communications/safeguarding` — list and modals usable
- `/settings/communications/fallback` — form usable
- Compose dialog — full-screen on mobile
- Audience picker — chip builder vertically stacked

Per CLAUDE.md frontend rules:

- All inputs `text-base` (16px) to prevent iOS auto-zoom
- Touch targets ≥ 44×44px
- Tables wrapped in `overflow-x-auto`
- No physical directional CSS classes (lint enforces)

Fix any layout issues found.

### 3. RTL verification

Switch the locale to Arabic and walk every page again:

- Layouts flip end ↔ start correctly (sidebar moves to the right side)
- Icons that should mirror (back arrows, chevrons) flip
- Icons that should NOT mirror (envelope, lock, attachment paperclip) stay
- Logical CSS properties carry RTL automatically
- Numeric inputs use Western numerals (per CLAUDE.md)

### 4. Morph bar wire-up

The unread badge component lives in impl 10 but its placement on the morph bar may be incomplete in some contexts. Verify:

- Badge appears on every school-facing page, not just `/inbox`
- Badge updates when polling tick fires (not just on `/inbox`)
- Badge link click navigates to `/inbox` from any starting page
- Badge is visible to ALL roles that can use the inbox (essentially everyone — students see it too)

The Communications module sub-strip should now have these entries: **Inbox**, **Audiences**, **Announcements** (existing), **Safeguarding**, **Oversight**. Verify all five are present and link correctly. Each is permission-gated:

- Inbox — `inbox.read` (everyone)
- Audiences — `inbox.send` (staff only)
- Announcements — existing permission
- Safeguarding — `safeguarding.keywords.write` (admin tier)
- Oversight — `inbox.oversight.read` (admin tier)

### 5. Cross-tenant smoke pass

Spin up the test tenant and run an end-to-end scenario as a manual smoke test:

1. **Setup** — log in as Principal, verify tenant settings page loads, verify default messaging matrix
2. **Send direct** — Principal → Teacher → confirm receipt + read receipt visible to Principal, not visible to Teacher's reply
3. **Send group** — Principal → 3 teachers → group conversation visible to all 4 participants
4. **Send broadcast (school)** — Principal → All Parents, replies disabled → confirms 1-way landing
5. **Send broadcast with reply** — Principal → All Parents, replies enabled → parent replies → spawns private 1↔1 thread back to Principal
6. **Smart audience** — build "Year 5 parents in arrears > €100" → preview shows count → save as dynamic → use in broadcast → only matching parents receive
7. **Permission gate** — log in as a parent → confirm cannot start a new conversation → confirm can reply on a thread where the sender enabled replies → confirm cannot reply when not enabled
8. **Edit window** — send a message as Teacher → edit within 10 minutes → confirm `(edited)` label
9. **Delete** — soft-delete a message → tombstone visible to participants → original visible in oversight
10. **Safeguarding** — send a message containing a seeded keyword → flag appears in dashboard widget within 60s → click → oversight thread view loads → dismiss the flag → verify audit log entry
11. **Freeze** — Principal freezes a thread → both participants see "disabled" banner → composer disabled → unfreeze → composer re-enabled
12. **Search** — search a known phrase → results page renders highlights → navigation works
13. **Fallback** — set teacher fallback to 1 hour → unread message → wait or trigger manually → external SMS/Email fires
14. **Channel selector** — broadcast with all 4 channels ticked → cost estimate shows correctly → all 4 channels dispatch
15. **Mobile** — repeat key flows on mobile viewport

If any step fails, file as a follow-up in the implementation log and fix in this implementation before signing off.

### 6. Architecture doc updates

Per `.claude/rules/architecture-policing.md`, update:

- **`docs/architecture/feature-map.md`** — add the new Inbox module section, list all new endpoints, new pages, new worker jobs, new permissions. **STOP and ask the user before updating per `.claude/rules/feature-map-maintenance.md` — confirm with the user whether the rebuild is final.**
- **`docs/architecture/module-blast-radius.md`** — add the new `inbox` module with its consumers (`communications` via the bridge, `finance` via the audience provider, `events` and `trips` via stub providers, `safeguarding` via BullMQ) and exports
- **`docs/architecture/event-job-catalog.md`** — add the new BullMQ jobs: `inbox:dispatch-channels`, `inbox:fallback-check`, `inbox:fallback-scan-tenant`, `safeguarding:scan-message`, `safeguarding:notify-reviewers`, plus the cron schedule for `inbox-fallback-check`
- **`docs/architecture/state-machines.md`** — add the conversation lifecycle (active → frozen → unfrozen → archived) and the message flag review state (pending → dismissed/escalated/frozen)
- **`docs/architecture/danger-zones.md`** — add an entry for "Permission matrix changes propagate via 5-min cache" and "Broadcast reply spawns a new direct conversation, not a reply on the broadcast"

### 7. New feature doc

`docs/features/inbox.md` — a new file describing the inbox module from a feature/UX perspective. Should include:

- The conversation model
- The permission matrix and how to configure it
- Smart audiences and how to compose them
- Read receipts (and the one-way visibility rule)
- Edit / delete behaviour
- Admin oversight and safeguarding
- Notification fallback
- Channels overview

This is the user-facing reference document for tenants, not internal architecture. Aim for ~1500 words, screenshot placeholders, and a "Common questions" section at the bottom.

### 8. Pre-launch checklist updates

Per `.claude/rules/pre-launch-tracking.md`, add any items to `docs/operations/PRE-LAUNCH-CHECKLIST.md` that emerged during the rebuild:

- "Verify SMS/Email/WhatsApp providers are correctly configured for at least 2 tenants before announcing the inbox" (the user noted these are not properly configured in earlier conversation)
- "Run a full RLS leakage test sweep across the new inbox tables"
- "Confirm safeguarding starter keyword list with each tenant before go-live"

### 9. Smoke test script

Drop a small smoke test runner at `apps/web/e2e/inbox/inbox-smoke.spec.ts` that automates the steps from §5. This is for post-deploy verification — not a comprehensive E2E suite, just enough to confirm a deployment didn't regress the basics.

### 10. Final lint + type-check + test

- `pnpm turbo run lint --filter=@school/web --filter=@school/api --filter=@school/worker --filter=@school/shared`
- `pnpm turbo run type-check --filter=@school/web --filter=@school/api --filter=@school/worker --filter=@school/shared`
- `pnpm turbo run test --filter=@school/web --filter=@school/api --filter=@school/worker --filter=@school/shared`
- All must be green before deploying.

## Watch out for

- **Don't introduce new features in this implementation.** It's polish only. If you find a missing feature, file it as a v1.1 follow-up in the log, do NOT implement it here.
- **Translation review needs human eyes for Arabic.** Don't dump Google Translate output. If the platform has an existing translation owner, mention them in the follow-ups for this implementation so they can sweep the new keys.
- **Mobile testing must be at real breakpoints**, not in DevTools "responsive mode" with unrealistic widths. Use 375px, 414px, 768px, 1024px as the test matrix.
- **The feature map update is gated on user confirmation.** Per `.claude/rules/feature-map-maintenance.md`, ask the user "is the inbox final or are you still iterating?" before touching it. If they say final → update. If still iterating → leave it untouched and add the suggestion to the implementation log follow-ups.

## Deployment notes

- Web restart only.
- Smoke test the §5 scenarios on production.
- After this implementation completes, the rebuild is **done**. Notify the user that v1 of the new inbox is live, summarise the key features, and recommend pushing the entire stack of accumulated commits to GitHub at the user's discretion.
