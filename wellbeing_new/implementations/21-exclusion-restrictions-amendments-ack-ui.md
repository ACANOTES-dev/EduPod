# Implementation 21 — Exclusion + Guardian Restrictions + Amendments + Parent Ack UI

> **Wave:** 6 (**parallel-risky** — apply rules H1–H10)
> **Classification:** frontend
> **Depends on:** 07, 14
> **Deploys:** Web restart only

---

## Goal

Surface four parent-comms-area behaviour features (impl 07) in the UI: full statutory exclusion case workflow, guardian restrictions add/edit/revoke, amendment notices queue with send-correction action, parent acknowledgement tracking surfaces (timeline view per incident).

## Shared files this impl touches

- `apps/web/messages/en.json` + `ar.json` — add `exclusion.*`, `guardianRestrictions.*`, `amendments.*`, `parentAck.*` namespaces. Apply Rules H8 + H9.
- `apps/web/src/app/[locale]/(school)/behaviour/exclusions/page.tsx` — replace empty shell. Yours.
- `apps/web/src/app/[locale]/(school)/behaviour/exclusions/[id]/page.tsx` — NEW. Yours.
- `apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx` — replace empty shell. Yours.
- `apps/web/src/app/[locale]/(school)/behaviour/amendments/page.tsx` — replace empty shell. Yours.
- `apps/web/src/app/[locale]/(school)/behaviour/incidents/[id]/page.tsx` — embed parent-ack timeline panel. Pathspec edit.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **MEDIUM** (translations + multiple pages).

## What to build

### 1. Exclusion cases list (`/behaviour/exclusions`)

Edit the empty shell. Add:

- Header CTA: "Open exclusion case" → opens dialog
- Filter bar: state, student, date range
- List: each row shows state badge, student, type (fixed-term / permanent), notice date, hearing date, decision date, appeal deadline (with overdue warning if past)
- Click row → detail page

### 2. Exclusion case detail (`/behaviour/exclusions/[id]`)

NEW. Rich layout:

- Header: case number, student, state badge, statutory timeline (horizontal phase-bar showing initiated → notice_issued → hearing_scheduled → hearing_held → decision_made → appeal_window → finalised | overturned, with each phase coloured by status)
- Left column: case meta + linked incident + reason + supporting documents
- Right column: state-aware action panel:
  - Issue notice (only when initiated)
  - Schedule hearing (only when notice_issued)
  - Record hearing (only when hearing_scheduled_exc) — modal with attendees + minutes
  - Record decision (only when hearing_held) — modal with decision (uphold / overturn / reduce) + duration
  - Generate notice (any state ≥ initiated) — calls impl 06 doc gen
  - Generate board pack (any state ≥ hearing_scheduled_exc) — calls impl 06
  - Finalise (only when appeal_window expired) — confirm dialog
  - Overturn (only when appeal_window) — modal with overturn reason
- Bottom: full audit timeline (every state transition + actor + timestamp)

### 3. Guardian restrictions (`/behaviour/guardian-restrictions`)

Edit the empty shell. Add:

- Header CTA: "Add restriction" → dialog (pick student → pick guardian → pick restriction type [no_behaviour_visibility / no_behaviour_notifications / no_portal_access / no_communications] → effective dates → reason)
- List: each row shows student, guardian, restriction type, effective range, status (active / expired / revoked), actions (Revoke if active, View detail)

### 4. Amendments queue (`/behaviour/amendments`)

Edit the empty shell. Add:

- Tabs: Pending re-acknowledgement / All amendments
- List: each row shows incident, original ack date, change summary, days since amendment, actions (View diff, Send correction)
- "View diff" opens a modal showing before/after of the amended fields (highlighted changes)
- "Send correction" calls the impl 07 endpoint, toast success, refresh list

### 5. Parent ack timeline panel

Embed on the incident detail page. Component `_components/parent-ack-timeline.tsx`. For each parent recipient of the incident's notification, shows a vertical timeline:

- Sent (channel, timestamp)
- Delivered (channel, timestamp; "Pending" if not yet)
- Read (in-app: when opened; email: never; whatsapp: when read)
- Acknowledged (parent clicked acknowledge button)

Coloured states. Click row → opens the parent's response if any.

### 6. Translation additions

Four namespaces. Apply Rule H8.

## Tests

- `exclusions/page.spec.tsx`: list + filters
- `exclusions/[id]/page.spec.tsx`: state-aware action visibility, statutory timeline rendering
- `guardian-restrictions/page.spec.tsx`: add + revoke
- `amendments/page.spec.tsx`: send-correction flow
- `parent-ack-timeline.spec.tsx`: per-channel state rendering

## Watch out for

- **Statutory timeline correctness** — the colour coding (on track / approaching deadline / overdue) drives admin attention. Wrong colour = wrong attention. Compute from the impl 07 timeline endpoint, don't recalculate frontend-side.
- **State transition modals** — every transition modal has its own form. Use `react-hook-form` + Zod schemas from `@school/shared/behaviour`. Don't use ad-hoc useState.
- **Guardian restriction type explanation** — each restriction type's UX implication must be clear (e.g. "no_portal_access blocks ALL parent portal use, not just behaviour"). Use info tooltips on each option.
- **Amendment diff** — diff at field level. Don't render raw JSON. Use a compact "Field: Old value → New value" rows pattern.

## Deployment notes

- Restart: web only.
- Smoke: open an exclusion case via API (or use seeded data if any), walk through state transitions in the UI. Add a guardian restriction, verify it shows in list, revoke it. Trigger an amendment by editing a previously-acknowledged incident, observe it in the queue, send correction.
