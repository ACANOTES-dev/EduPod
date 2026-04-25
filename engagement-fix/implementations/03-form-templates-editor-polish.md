# Implementation 03 — Form templates editor polish

> **Wave:** 2 (parallel-risky with Impl 02 — both touch translations)
> **Classification:** frontend
> **Depends on:** 01
> **Deploys:** Web restart only

---

## Goal

Make the form-template editor fail loudly instead of silently. Today, clicking "Save as draft" with an invalid form does nothing — no toast, no field errors, no console message. Users assume the system is broken (the audit confirmed this). Also fix the `CompletionDashboard` mis-mapping on the published-template detail page where two of three cards display incorrect percentages for standalone (non-event-linked) form templates, and tighten the auto-generated `field_key` so it reads sensibly.

After this impl ships:

- Submitting an invalid form-template draft surfaces field-level errors AND a toast "Please fix the highlighted fields".
- Saving a valid draft navigates to `/engagement/form-templates/{newId}` (this works automatically once Impl 01 is deployed, but verify).
- The published-template detail page shows ONE accurate consent-completion card for standalone templates, and THREE accurate cards (consent / payment / registration) for event-linked templates.
- New fields auto-generate keys as `field_1`, `field_2`, `field_3` instead of `engagement_field_1_38cn5x`.

## Shared files this impl touches

- `apps/web/src/app/[locale]/(school)/engagement/_components/form-template-editor.tsx` — owns this file, no Wave 2 sibling conflict.
- `apps/web/src/app/[locale]/(school)/engagement/_components/completion-dashboard.tsx` — owns this file, no Wave 2 sibling conflict. Adds a variant prop.
- `apps/web/src/app/[locale]/(school)/engagement/form-templates/[id]/page.tsx` — owns this file, no Wave 2 sibling conflict. Switches to the new `CompletionDashboard` variant.
- `apps/web/src/app/[locale]/(school)/engagement/_components/engagement-types.ts` — possible new helper for field-key generation.
- `messages/en.json` — adds `engagement.builder.validationError`, `engagement.completionDashboard.standaloneTitle`, etc. **SHARED FILE with Impl 02 — apply Rule H8/H9.**
- `messages/ar.json` — same keys. **SHARED FILE with Impl 02 — apply Rule H8/H9.**
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Always in a separate commit.

## What to build

### Sub-step 1: Field-level validation errors in the editor

Open `apps/web/src/app/[locale]/(school)/engagement/_components/form-template-editor.tsx`. The `react-hook-form` instance already exposes `form.formState.errors` — we just need to render them.

For every `<Input>` / `<Select>` / `<Textarea>` in the editor, find the corresponding `formState.errors.<path>?.message` and render it via `<FormMessage>` from `@school/ui` (or a plain `<p className="text-sm text-destructive">` if `FormMessage` isn't already imported).

Example for the `name` field:

```tsx
<div className="space-y-2 md:col-span-2">
  <Label htmlFor="template-name">{t('builder.name')}</Label>
  <Input id="template-name" {...form.register('name')} />
  {form.formState.errors.name ? (
    <p className="text-sm text-destructive" role="alert">
      {form.formState.errors.name.message ?? t('builder.fieldRequired')}
    </p>
  ) : null}
</div>
```

Repeat for `description`, `form_type`, `consent_type`, `academic_year_id`, `requires_signature`, and inside each field card under `fields_json[i].label.en`, `.label.ar`, `.field_key`, `.field_type`, `.help_text.en`, `.help_text.ar`, `.options_json`, etc.

Use `form.formState.errors.fields_json?.[index]?.<sub_path>?.message` for nested array-field errors. `react-hook-form` exposes them in the same shape as the form data.

### Sub-step 2: Validation-failed toast

The current `onSubmit` handler in `form-template-editor.tsx`:

```ts
const onSubmit = form.handleSubmit(async (values) => {
  // ... happy path
});
```

`form.handleSubmit(success, error?)` accepts a second callback for the validation-failure case. Wire it up:

```ts
const onSubmit = form.handleSubmit(
  async (values) => {
    // ... existing happy path
  },
  () => {
    // Validation failed — react-hook-form has already populated formState.errors
    // for the field-level renderers. Surface a top-level toast so the user
    // knows their click was acknowledged.
    toast.error(t('builder.validationError'));
  },
);
```

Also add the same toast on Zod-failure inside the success path (in case Zod validation runs again at submission time and fails — defensive).

### Sub-step 3: Tighten the field-key auto-generator

Find `createEmptyField` in `apps/web/src/app/[locale]/(school)/engagement/_components/engagement-types.ts`. It currently emits something like `engagement_field_1_38cn5x` (timestamp-suffixed for collision safety).

Replace with a simpler `field_<N>` generator where N is the next index. Pass `existingKeys: string[]` to avoid collision when adding a field after deleting another:

```ts
export function createEmptyField(index: number, existingKeys: string[] = []): EngagementFormField {
  // Default to field_<index+1>, but if that key is already taken (because a
  // field was deleted from the middle), pick the next available number.
  let candidateIndex = index + 1;
  let candidate = `field_${candidateIndex}`;
  while (existingKeys.includes(candidate)) {
    candidateIndex += 1;
    candidate = `field_${candidateIndex}`;
  }

  return {
    field_key: candidate,
    field_type: 'short_text',
    label: { en: '', ar: '' },
    help_text: { en: '', ar: '' },
    required: false,
    options_json: [],
    conditional_visibility_json: null,
    display_order: index,
  };
}
```

Update the caller in `form-template-editor.tsx` (`handleAddField`) to pass the current keys:

```ts
const handleAddField = React.useCallback(() => {
  const existingKeys = (form.getValues('fields_json') ?? []).map((f) => f.field_key);
  fieldArray.append(createEmptyField(fieldArray.fields.length, existingKeys));
}, [fieldArray, form]);
```

The user can still manually rename the key. The auto-generation just produces something readable as a default.

### Sub-step 4: `CompletionDashboard` variant for standalone templates

Open `apps/web/src/app/[locale]/(school)/engagement/_components/completion-dashboard.tsx`. The current props are:

```ts
interface CompletionDashboardProps {
  consentGranted: number;
  consentTotal: number;
  paymentPaid: number;
  paymentTotal: number;
  registered: number;
  invited: number;
  capacity?: number | null;
  capacityUsed?: number | null;
}
```

Add a `variant` prop:

```ts
interface CompletionDashboardProps {
  variant?: 'event' | 'standalone_form';
  // For 'event' variant — all 6 fields required (current behaviour):
  consentGranted?: number;
  consentTotal?: number;
  paymentPaid?: number;
  paymentTotal?: number;
  registered?: number;
  invited?: number;
  capacity?: number | null;
  capacityUsed?: number | null;
  // For 'standalone_form' variant — only these:
  submissionsReceived?: number;
  submissionsExpected?: number;
}
```

Render branch on `variant`:

- `variant === 'event'` (default — preserves current behaviour) → render the existing 3-card layout (consent / payment / registration).
- `variant === 'standalone_form'` → render a single full-width card titled "Submission Completion" with `submissionsReceived` of `submissionsExpected` and a percentage bar.

Use `t('completionDashboard.standaloneTitle')` and friends for labels.

### Sub-step 5: Wire the variant on the form-template detail page

Open `apps/web/src/app/[locale]/(school)/engagement/form-templates/[id]/page.tsx`. Find the call to `CompletionDashboard` (currently around line 188–196).

Determine whether the template is event-linked: if the form template is the consent or risk-assessment template for any `EngagementEvent`, it's event-linked. The simplest detection: check the `stats` response shape — if it includes the event-linked fields (`payment_total` etc.), use the `event` variant; otherwise use `standalone_form`.

Actually simpler: the backend `getStats` endpoint for a form template returns submission counts (`total`, `submitted`, `pending`, `expired`, `revoked`). It does NOT return payment or registration counts (those live on the event dashboard endpoint, not the form-template stats endpoint). So the form-template detail page should ALWAYS render the `standalone_form` variant — the existing 3-card render with `paymentPaid={stats.total - stats.pending}` is fundamentally the wrong endpoint feeding the wrong dashboard.

Replace with:

```tsx
<CompletionDashboard
  variant="standalone_form"
  submissionsReceived={stats.submitted}
  submissionsExpected={stats.total}
/>
```

Drop the broken consent / payment / registration props entirely.

If you want to surface event-linked stats on the form-template detail page (e.g. "this template is the consent form for the School Trip event"), that's a future enhancement — out of scope for this impl.

### Sub-step 6: Translation keys

Add the following to `messages/en.json` (additive — merge into existing structure):

```json
{
  "engagement": {
    "builder": {
      "validationError": "Please fix the highlighted fields and try again.",
      "fieldRequired": "This field is required."
    },
    "completionDashboard": {
      "standaloneTitle": "Submission completion",
      "standaloneDescription": "{received} of {expected} submissions received."
    }
  }
}
```

And to `messages/ar.json`:

```json
{
  "engagement": {
    "builder": {
      "validationError": "الرجاء تصحيح الحقول المُظللة والمحاولة من جديد.",
      "fieldRequired": "هذا الحقل مطلوب."
    },
    "completionDashboard": {
      "standaloneTitle": "اكتمال التقديم",
      "standaloneDescription": "تم استلام {received} من {expected} تقديم."
    }
  }
}
```

Apply Rule H9 — re-read the file content immediately before writing in case Impl 02 has touched it. Merge into the existing structure. Do not overwrite.

### Sub-step 7: Local regression sweep

Run:

```bash
pnpm turbo run type-check --filter=@school/web
pnpm turbo run lint --filter=@school/web
pnpm turbo run test --filter=@school/web
```

Pay attention to `engagement/_components/*.spec.ts` if any exist — the `CompletionDashboard` variant change is API-shaped and may break existing snapshot tests. Update snapshots if needed.

## Tests

- No new automated tests strictly required — manual smoke test on production replaces unit tests for this impl.
- Optional: a unit test for `createEmptyField` covering the existing-key-collision path.
- Regression: `pnpm turbo run test --filter=@school/web` must pass with zero new failures.

## Watch out for

- **Don't break the happy path.** Every existing field today still has an auto-generated key like `engagement_field_1_38cn5x` — those keys are stored on existing form templates in the database. Do NOT change keys on existing templates; the new generator only fires when adding a NEW field via `handleAddField`. Existing templates loaded for edit retain whatever keys they had.
- **`form.handleSubmit` second callback.** Make sure you actually wire it up. Today's editor passes only the success callback, which is why validation failures silently no-op.
- **The `CompletionDashboard` is also used on the event detail page** (`events/[id]/page.tsx:173–182`) — that call passes the 6 event-shaped props. After adding the `variant` prop with default `'event'`, the existing event-detail call continues to work unchanged. Verify by reading `events/[id]/page.tsx` after your change.
- **Toasts must use the translated string.** `toast.error(t('builder.validationError'))` not `toast.error('Please fix...')`. The codebase has zero hard-coded English in toasts.
- **Sibling Impl 02 also touches `messages/en.json` and `messages/ar.json`.** Apply Rule H8 — buffer your translation additions in your editor, write them in the final commit window, and re-read the file content before writing. Do NOT overwrite the file with a stale version.
- **Prerequisite (Impl 01 envelope unwrap) must be deployed first.** If Impl 01 is not yet `completed`, STOP per Rule 2. Without the unwrap fix, the form-template create flow still navigates to `/form-templates/undefined` after a successful save (because `savedTemplate.id` is in the `.data` envelope) — your validation work won't be testable until Impl 01 ships.

## Deployment notes

Web restart only. No migration. No backend. No worker. No shared package.

1. Commit locally (split into 4 commits if convenient: validation errors / field-key generator / CompletionDashboard variant / translations).
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
6. **Smoke test (mandatory):**
   - `https://nhqs.edupod.app/en/engagement/form-templates/new` → enter only a name (no consent type), click "Save as draft" → field-level errors appear under each missing field, toast says "Please fix the highlighted fields".
   - Fill the form properly, click "Save as draft" → navigates to `/engagement/form-templates/{newId}` (proves Impl 01 envelope fix is live).
   - Click "Add field" three times → keys are `field_1`, `field_2`, `field_3` (or `field_2`, `field_3` etc. if the original field had a custom key).
   - On the published-template detail page, the CompletionDashboard shows ONE card "Submission completion" with the correct numbers, not three mis-mapped cards.
   - Switch to Arabic — error messages and the new toast read in Arabic, RTL layout intact.
7. **Pre-deploy serialisation check (Rule 6b):** if Impl 02 is currently in `deploying` state for the `web` target (which it shares), wait for it to flip to `completed` first.
8. Log flips to `completed` in a separate commit after verification.
