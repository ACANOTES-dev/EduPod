# Implementation 10 — Inbox Shell + Thread List + Thread View

> **Wave:** 4 (parallel with 11, 12, 13, 14, 15)
> **Depends on:** 01, 02, 03, 04, 06
> **Deploys:** Web restart only

---

## Goal

Build the **core inbox UI**: the `/inbox` route with a sidebar of threads, the open-thread pane, the unread badge in the morph bar, and the polling layer. This implementation is the **shell** that the compose dialog (impl 11) and the search results (impl 11) plug into.

## What to build

### 1. The inbox layout

`apps/web/src/app/[locale]/(school)/inbox/layout.tsx`

A two-pane layout:

- **Sidebar (left)** — thread list, search bar, filter chips, "Compose" button. ~360px wide on desktop.
- **Main pane (right)** — open thread (`thread-view.tsx`) or empty state ("Select a thread").

On mobile (≤ 768px): collapsible — sidebar takes the whole screen by default; tapping a thread navigates to a full-screen thread view.

The layout file uses a flex layout, no fixed widths beyond the sidebar's `md:w-90`. Mobile hides the sidebar when a thread is open and shows a back button.

### 2. The default page

`apps/web/src/app/[locale]/(school)/inbox/page.tsx`

The default route at `/inbox` shows the empty state in the main pane: an envelope icon, "Select a thread to open it" copy, and on mobile, the thread list itself.

### 3. The thread deep-link

`apps/web/src/app/[locale]/(school)/inbox/threads/[id]/page.tsx`

Renders the thread view in the main pane. On mobile, shows just the thread (sidebar collapsed).

### 4. The polling hook

`apps/web/src/app/[locale]/(school)/inbox/_components/use-inbox-polling.ts`

```tsx
export function useInboxPolling() {
  const [state, setState] = React.useState<InboxState | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await apiClient<InboxState>('/v1/inbox/state', { method: 'GET' });
        if (!cancelled) setState(res);
      } catch (err) {
        console.error('[useInboxPolling]', err);
      }
    };
    tick(); // initial
    const interval = setInterval(tick, 30_000); // every 30s
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return state;
}
```

This hook is the **single source of truth** for the unread badge in the morph bar. The badge component subscribes to it via React context.

### 5. The inbox sidebar

`apps/web/src/app/[locale]/(school)/inbox/_components/inbox-sidebar.tsx`

Components:

- **Header** — "Inbox" title + "Compose" button (`<Button>` from `@school/ui`)
- **Search bar** — `<Input>` with magnifying-glass icon. On Enter, navigate to `/inbox/search?q=...`
- **Filter chips** — `All`, `Unread`, `Direct`, `Group`, `Broadcasts`, `Archived`. Multiselect. State stored in URL search params (`?type=direct&unread=true`).
- **Thread list** — paginated, infinite scroll. Each row is a `<ThreadListItem>`.

Uses `useInboxThreads()` hook (custom) that calls `GET /v1/inbox/conversations` with current filters.

### 6. The thread list item

`apps/web/src/app/[locale]/(school)/inbox/_components/thread-list-item.tsx`

One row in the sidebar. Shows:

- Avatar(s) — for direct, the other participant's avatar; for group, a stack of avatars; for broadcast, a megaphone icon.
- Subject (or "Direct message" for unsubject'd direct) in `Figtree` font, semibold if unread.
- Sender name + last message preview, single line truncated with `text-ellipsis`.
- Timestamp on the right (today: "14:32"; this week: "Mon"; older: "12 Mar").
- Unread count badge if `unread_count > 0`.
- Frozen indicator (lock icon) if the thread is frozen.

Click → navigate to `/inbox/threads/[id]`.

Use `flex-1 min-w-0` on the inner content container so long subjects truncate properly. Touch target ≥ 56px tall on mobile.

### 7. The thread view

`apps/web/src/app/[locale]/(school)/inbox/_components/thread-view.tsx`

The main pane component. Loads the thread via `GET /v1/inbox/conversations/:id` on mount and on poll tick.

Layout:

- **Header bar** — back button (mobile only), thread subject, participant avatars, kebab menu (mute / archive / leave / freeze for admin tier).
- **Frozen banner** (when applicable) — yellow banner with the lock icon and the freeze reason.
- **Message list** — chronological, top to bottom, scrollable. Latest at the bottom. Auto-scroll to bottom on initial load and on new message arrival (only if user was already at the bottom — don't yank them away from earlier scrollback).
- **Composer footer** — multi-line `<Textarea>`, attach button, send button. Disabled when frozen or when policy denies replies (impl 02 returns reason via the thread state). Disabled state shows tooltip with the reason.

Polling:

- Every 30s, refetch the thread.
- Diff against current state. New messages appear at the bottom with a subtle slide-in.
- When the open thread receives new messages, auto-mark-read via `POST /v1/inbox/conversations/:id/read`.

### 8. The thread message

`apps/web/src/app/[locale]/(school)/inbox/_components/thread-message.tsx`

A single message bubble. Variants:

- **Own message** (right-aligned, primary background)
- **Other message** (left-aligned, muted background)
- **System message** (full-width, muted, italic, e.g. "🔒 This conversation has been disabled")
- **Deleted message** (full-width, muted, italic, "[message deleted]")

Each bubble shows:

- Sender avatar + name (for group/broadcast — direct hides this)
- Body (preserves line breaks, links auto-detected and made clickable, no HTML)
- Attachments — image previews or file rows with download
- Timestamp on hover
- "(edited)" indicator if `edited_at`
- For SCHOOL STAFF SENDERS only on their own messages: "Read by N / M" with a click-to-expand drilldown listing names of who has and hasn't read
- Edit/delete kebab on hover (own message, within 10 minutes, school staff sender only)

The read receipt drilldown is a small popover that lists recipients with read/unread state. Only renders when the API response includes the read state object — for parents and students, the API never includes it, so the component just doesn't render the section.

### 9. The morph bar unread badge

`apps/web/src/components/morph-bar/inbox-badge.tsx` (or wherever the morph bar lives — find it via the existing shell components)

A small envelope icon with a numeric badge in the top-right corner of the morph bar. Number comes from `useInboxPolling().unread_total`. Click → navigate to `/inbox`.

If `unread_total === 0`, hide the numeric badge (just show the envelope).
If `unread_total > 99`, show "99+".

The badge component subscribes to the polling context provider that wraps the school shell.

### 10. The polling context provider

`apps/web/src/app/[locale]/(school)/_providers/inbox-polling-provider.tsx`

A React context provider that:

- Mounts at the school shell layout level
- Holds a single `useInboxPolling` instance
- Provides the state to all children (morph bar badge, inbox shell, etc.)

This avoids polling 5x just because 5 components want unread state.

### 11. Translation keys

Add to `apps/web/messages/en.json` and `apps/web/messages/ar.json` under `inbox.*`:

- `inbox.title`
- `inbox.compose`
- `inbox.search.placeholder`
- `inbox.filter.all`
- `inbox.filter.unread`
- `inbox.filter.direct`
- `inbox.filter.group`
- `inbox.filter.broadcasts`
- `inbox.filter.archived`
- `inbox.empty_state.title`
- `inbox.empty_state.body`
- `inbox.thread.frozen.banner`
- `inbox.thread.frozen.title`
- `inbox.thread.read_by`
- `inbox.thread.composer.placeholder`
- `inbox.thread.composer.disabled.frozen`
- `inbox.thread.composer.disabled.no_reply`
- `inbox.thread.composer.disabled.policy`
- `inbox.message.deleted`
- `inbox.message.edited`
- `inbox.unread.badge_aria` (for screen readers — "{count} unread messages")

Provide both English and Arabic strings. Keep them tight.

## Tests

E2E (Playwright):

- `/inbox` loads as a participant → sidebar shows existing threads
- Clicking a thread shows it in the main pane (or full-screen on mobile)
- Polling tick fetches new state every 30 seconds (mock the API call and assert call count)
- Sending a reply (via the composer) optimistically appends to the thread
- Frozen thread shows the banner and disables the composer
- Read receipts visible only when the API returns them (parent vs principal split)
- The morph bar badge updates when unread count changes
- Mobile: thread list takes full screen by default; opening a thread hides the list

Component:

- `thread-list-item` renders unread state correctly
- `thread-message` branches by variant
- `use-inbox-polling` cleans up on unmount

## Watch out for

- **Mobile responsiveness** is non-negotiable per CLAUDE.md frontend rules. Test at 375px width. The `flex-1 min-w-0` pattern on the main pane is critical.
- **Logical CSS properties only.** No `ml-`, `pl-`, `border-l-`, etc. Use `ms-`, `ps-`, `border-s-`. The lint rule will catch violations.
- **RTL.** When `locale === 'ar'`, the layout flips: sidebar on the right, content on the left. The flex layout with `flex-row` and logical properties handles this automatically — but verify with a screenshot.
- **Auto-scroll behaviour.** The "scroll to bottom on new message" rule must check whether the user was already at the bottom. If they scrolled up to read history, a new message must NOT yank them down. Use a sentinel ref + IntersectionObserver.
- **Polling cleanup.** Every `useEffect` that sets an interval MUST clean up. A leaked interval polling every 30 seconds across navigation events will tank the API.
- **Don't subscribe to polling from inside individual list items.** One context provider, many readers.
- **Auto-mark-read fires once per thread open**, not on every poll tick. Track whether the read API has been called for this open thread in a ref.
- **The morph bar badge** must inherit from the existing morph-bar component pattern. Find the existing shell components first — the redesign morph-bar lives under `apps/web/src/components/shell/` (verify the actual path) and has a slot system for action buttons. Use the slot, don't fork the morph bar.

## Deployment notes

- Web restart only.
- Smoke test:
  - Log in as Principal → click the morph bar envelope → arrive at `/inbox`.
  - Send a direct message via API curl (or the existing announcement page) → see the unread badge increment within 30 seconds.
  - Open the thread → unread badge decrements and the thread is marked read.
  - Resize browser to 375px → confirm the layout collapses to mobile.
  - Switch to Arabic locale → confirm the layout RTL-flips correctly.
