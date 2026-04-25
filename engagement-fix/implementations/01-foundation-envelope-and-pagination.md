# Implementation 01 — Foundation: envelope unwrap + pagination + my-schedule

> **Wave:** 1 (serial — runs alone)
> **Classification:** foundation
> **Depends on:** nothing
> **Deploys:** API restart + Web restart

---

## Goal

Land the three systemic fixes that unblock 75% of the engagement bug burden in a single coherent commit:

1. **Auto-unwrap `{ data: T }` envelopes in `apiClient<T>()`.** Eliminates the root cause of the event-detail crash, the analytics crash, the missing event-title heading on 6 sub-pages, the silent navigation-to-`/undefined` after form-template save, and the staff-tab raw-UUID display.
2. **Cap `pageSize=500 → 100`** in the three pages (`conferences/setup`, `conferences/schedule`, `events/[id]/trip-pack`) that violate the API's hard cap and cause `Promise.all` rejection → permanent skeleton lock.
3. **Fix the conference `my-schedule` 400** by gracefully handling callers without a `staff_profile` record. Returns an empty schedule instead of throwing.

After this impl ships, the following pages should go from broken to working:

- `/engagement/events/[id]` (was crash) → renders with status badge + dashboard cards.
- `/engagement/analytics` (was crash) → renders with KPI cards.
- `/engagement/events/[id]/{participants,attendance,risk-assessment,incidents}` (were missing event-title) → header populated.
- `/engagement/events/[id]/trip-pack` (was skeleton lock) → loads.
- `/engagement/conferences/[id]/{setup,schedule}` (were skeleton lock) → load.
- `/engagement/conferences/[id]/my-schedule` (was 400) → loads with empty state if caller has no staff profile, populated state otherwise.

## Shared files this impl touches

- `apps/web/src/lib/api-client.ts` — adds `autoUnwrap` helper applied inside `parseResponse`. Edit in the final commit window if combining with sub-step 5; otherwise commit alone first.
- `apps/web/src/lib/api-client.spec.ts` — add tests proving the autoUnwrap behaviour.
- `apps/web/src/app/[locale]/(school)/engagement/events/[id]/trip-pack/page.tsx` — pageSize cap.
- `apps/web/src/app/[locale]/(school)/engagement/conferences/[id]/setup/page.tsx` — pageSize cap.
- `apps/web/src/app/[locale]/(school)/engagement/conferences/[id]/schedule/page.tsx` — pageSize cap.
- `apps/api/src/modules/engagement/conferences.controller.ts` — `my-schedule` route handler (keep route signature unchanged).
- `apps/api/src/modules/engagement/conferences.service.ts` — `getMySchedule` returns empty when no staff profile.
- `apps/api/src/modules/engagement/conferences.service.spec.ts` — new test for the no-profile path.
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Always in a separate commit.

## What to build

### Sub-step 1: `autoUnwrap` in `apiClient`

Edit `apps/web/src/lib/api-client.ts`. The current `parseResponse` is:

```ts
async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  if (response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
```

Replace with:

```ts
async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  if (response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  const body = (await response.json()) as unknown;
  return autoUnwrap<T>(body);
}

/**
 * Strip the API's `{ data: T }` response envelope when the body is a plain
 * single-key object whose only key is literally `data`. Pass-through for:
 *   - paginated responses ({ data, meta })
 *   - error envelopes ({ error: { code, message } })
 *   - raw arrays
 *   - already-unwrapped scalars or objects without a `data` key
 *
 * The pass-through behaviour is critical because the existing `unwrap()` helper
 * (exported below) is idempotent on already-unwrapped values, so any callsite
 * that defensively chained `unwrap(await apiClient(...))` continues to behave
 * correctly after this change.
 */
function autoUnwrap<T>(body: unknown): T {
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const keys = Object.keys(body as object);
    if (keys.length === 1 && keys[0] === 'data') {
      const inner = (body as { data: unknown }).data;
      // null/undefined `data` envelopes are returned as-is (some endpoints
      // legitimately return { data: null } to signal "found no record").
      if (inner !== undefined) {
        return inner as T;
      }
    }
  }
  return body as T;
}
```

The `unwrap()` helper at the top of the file stays exactly as it is — it's still used by some explicit call-sites (e.g. household-numbers Impl 05's wizard preview) and remains a no-op on values without a `.data` key.

**Important:** the algorithm intentionally requires `keys.length === 1`. A response of shape `{ data: T, meta: PaginationMeta }` has 2 keys and falls through unchanged. A response of shape `{ error: {...} }` has 1 key but it's not `data` and falls through. A response that is a plain `T[]` array fails the `Array.isArray` guard and falls through.

Also update the post-401-refresh path inside `apiClient` (currently at line 80, `return parseResponse<T>(retryResponse);`) — it already calls `parseResponse`, so no separate change needed. Verify by reading the file.

### Sub-step 2: `apiClient.spec.ts` test coverage

Create or augment `apps/web/src/lib/api-client.spec.ts` with tests for:

- `{ data: { id: 'x', status: 'open' } }` → returns `{ id: 'x', status: 'open' }`.
- `{ data: [1, 2, 3], meta: { page: 1 } }` → returns the original `{ data, meta }` envelope (paginated pass-through).
- `[1, 2, 3]` → returns `[1, 2, 3]` (raw array pass-through).
- `{ error: { code: 'X', message: 'y' } }` → returns the original error envelope (single-key but not `data`).
- `{ data: null }` → returns `{ data: null }` (do not strip null inner).
- `{ id: 'x' }` → returns `{ id: 'x' }` (no `data` key, pass-through).
- 204 response → returns `undefined`.

Use `jest.fn()` to mock `fetch` and assert against `parseResponse` indirectly via `apiClient`. If the file does not exist yet, create it following the conventions in any `apps/web/src/**/*.spec.ts` neighbour.

### Sub-step 3: PageSize cap in the three offending pages

In each of these files, find the `?pageSize=500` query string and change to `?pageSize=100`:

- `apps/web/src/app/[locale]/(school)/engagement/events/[id]/trip-pack/page.tsx`
- `apps/web/src/app/[locale]/(school)/engagement/conferences/[id]/setup/page.tsx`
- `apps/web/src/app/[locale]/(school)/engagement/conferences/[id]/schedule/page.tsx`

Add a one-line `// TODO(engagement-fix-06): paginate properly if > 100 staff or slots` comment above each call so Impl 06 knows to follow up if any tenant has >100 staff. (Largest stress-test tenant has ~80 staff, so 100 is safe for current usage.)

### Sub-step 4: Conference `my-schedule` 400 fix

In `apps/api/src/modules/engagement/conferences.service.ts`, find `getMySchedule` (or whatever name the route handler delegates to). The existing logic likely does:

```ts
async getMySchedule(tenantId: string, userId: string, eventId: string) {
  const staffProfile = await this.prisma.staffProfile.findFirst({
    where: { tenant_id: tenantId, user_id: userId },
  });
  if (!staffProfile) {
    throw new BadRequestException({ code: 'NO_STAFF_PROFILE', message: '...' });
  }
  // ... build schedule
}
```

Replace the `throw` with a graceful return:

```ts
async getMySchedule(tenantId: string, userId: string, eventId: string) {
  const staffProfile = await this.prisma.staffProfile.findFirst({
    where: { tenant_id: tenantId, user_id: userId },
  });
  if (!staffProfile) {
    // Caller is not a staff member (e.g. school_owner without a staff profile).
    // Return an empty schedule so the frontend renders the empty-state UI
    // instead of an error boundary. This is intentional — the route is
    // permission-gated by `engagement.conferences.view_schedule`, which the
    // caller already passed; not having a staff profile is a user-class
    // distinction, not an authorization failure.
    return { slots: [], bookings: [] };
  }
  // ... existing schedule-build logic
}
```

If the actual code structure differs from the sketch, adapt the spirit (no exception, return empty) to whatever the real handler looks like. Do not change the route signature or the response shape — the frontend already handles `{ slots: [], bookings: [] }` correctly via the empty state.

Add a test in `conferences.service.spec.ts` that verifies the no-profile path returns the empty shape with a 200-equivalent response.

### Sub-step 5: Local regression sweep

Run:

```bash
pnpm turbo run type-check --filter=@school/web --filter=@school/api
pnpm turbo run lint --filter=@school/web --filter=@school/api
pnpm turbo run test --filter=@school/web --filter=@school/api
```

Pay attention to existing tests in non-engagement modules — the `apiClient` change affects every API consumer in the codebase. If any test in any other module fails, investigate before committing. The expected outcome is: every pre-change passing test still passes; new `api-client.spec.ts` and `conferences.service.spec.ts` tests added by this impl pass.

## Tests

- `api-client.spec.ts` — autoUnwrap behaviour for all 7 input shapes listed in sub-step 2.
- `conferences.service.spec.ts` — `getMySchedule` returns `{ slots: [], bookings: [] }` for a user with no staff profile.
- Regression: `pnpm turbo run test --filter=@school/web` and `--filter=@school/api` must pass with zero new failures.

## Watch out for

- **Other modules' pages depend on the wrapped envelope.** Some non-engagement pages may already be reading `response.data.someField` (i.e. they were aware of the wrap and accessed it explicitly). The autoUnwrap will strip that wrap, breaking `response.data` → `undefined`. Grep for `apiClient<` followed by `.data` access patterns across `apps/web/src/app/[locale]/(school)/**` to spot these BEFORE deploying. Most sites use `apiClient<PaginatedResponse<T>>(...)` and read `response.data` correctly — those continue to work because the envelope `{data, meta}` has two keys and is not auto-unwrapped. Sites that use `apiClient<{data: SomeShape}>(...)` (i.e. pre-wrapped the type) and then read `response.data.someField` ARE the breakage zone.
- **The change is global.** It affects every authenticated frontend page in the app. After deploy, smoke test at minimum: dashboard, students list, finance invoices, scheduling, settings — pick one page from each major hub. If any page that worked before this impl now shows broken data, ROLL BACK the api-client change immediately and switch to a per-file `unwrap()` migration instead.
- **The pageSize cap is a quick fix, not a real solution.** If a tenant has >100 staff, the trip-pack and conference pages will silently truncate. Impl 06 picks this up as a follow-up.
- **`my-schedule` 400 might be caused by something other than missing staff profile.** Verify by hitting the endpoint as `Sarah.daly@nhqs.test` (a teacher with a staff profile) — if Sarah ALSO gets 400, the cause is different and you need to dig deeper. The principal-only behaviour confirms the no-profile hypothesis.
- **Do NOT touch the existing `unwrap()` helper.** Some call-sites (notably household-numbers Impl 05's wizard preview) explicitly call it. Removing or modifying it breaks them. Just leave it alone.

## Deployment notes

Web restart + API restart. No migration. No worker changes. No shared-package rebuild required (api-client lives inside `apps/web`, not a shared package).

1. Commit locally (split into 3 commits if convenient: one per sub-step group).
2. Rsync the affected files (or whole repo with the standard excludes from CLAUDE.md):
   ```bash
   rsync -avz --delete \
     --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='dist' \
     --exclude='.env' --exclude='.env.local' --exclude='.turbo' --exclude='*.tsbuildinfo' \
     /Users/ram/Desktop/SDB/ root@46.62.244.139:/opt/edupod/app/
   ```
3. `ssh root@46.62.244.139 'chown -R edupod:edupod /opt/edupod/app/'`
4. `ssh root@46.62.244.139 'sudo -u edupod bash -lc "cd /opt/edupod/app && rm -rf apps/web/.next && pnpm turbo run build --filter=@school/api --filter=@school/web --force"'`
5. `ssh root@46.62.244.139 'sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 restart api web --update-env'`
6. **Smoke test (mandatory):**
   - `https://nhqs.edupod.app/en/engagement/events/2fc77565-5842-4d78-8742-e1e7ce57c5fb` → renders without error boundary, status badge says "Draft", dashboard cards show 0/0 percentages.
   - `https://nhqs.edupod.app/en/engagement/analytics` → renders KPI cards and charts.
   - `https://nhqs.edupod.app/en/engagement/conferences/2fc77565-5842-4d78-8742-e1e7ce57c5fb/setup` → renders form (no skeleton lock).
   - `https://nhqs.edupod.app/en/engagement/conferences/2fc77565-5842-4d78-8742-e1e7ce57c5fb/my-schedule` → renders empty state for principal user.
   - **Cross-module sanity:** `https://nhqs.edupod.app/en/dashboard`, `https://nhqs.edupod.app/en/students`, `https://nhqs.edupod.app/en/finance/invoices` → all render correctly. If any breaks, roll back.
7. Log flips to `completed` in a separate commit after verification.
