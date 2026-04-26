# Implementation 04 — Public Apply Form Rewrite

> **Wave:** 3 (parallel-risky with impl 05)
> **Classification:** frontend
> **Depends on:** 02, 03
> **Deploys:** Web restart only

---

## Goal

Rewrite the public apply form at `app/[locale]/(public)/apply/[tenantSlug]/page.tsx` around the new multi-student API and the mode picker. The page flow becomes:

1. **Mode picker** — "New family" or "Adding a child to an existing family"
2. **If existing family:** household-number + parent-email lookup → match confirmation screen
3. **If new family:** household detail sections (parents → address → emergency)
4. **Students section** (always, at the end of the form) — one student block by default, with a "+ Add another student" button that appends more blocks
5. **Submit** → POST to `/v1/public/admissions/applications` → thank-you page showing N application numbers

The field order changes: parents and household details come BEFORE students, not after. The student section supports one or many students. Existing-family mode skips the parent/address/emergency sections entirely.

## Shared files this impl touches

- `apps/web/messages/en.json` — adds `publicApplyForm.*` keys for the new mode picker, lookup step, section titles, and the "Add another student" / "Remove student" buttons. Edit in the final commit window. Buffer keys in a local scratch file while coding (Rule H8).
- `apps/web/messages/ar.json` — same keys, Arabic translations. Edit in the final commit window.
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Separate commit.

All other files are this impl's exclusive footprint — the `(public)/apply/[tenantSlug]/` folder is wholly owned.

## Copy to use (professional wording — draft these into en.json)

Mode picker heading: **"Are you a new family or adding a child to an existing family?"**

Option A label: **"New family applying for the first time"**
Option A description: **"Choose this if you're applying to the school for the first time. You'll be asked for your family details and each child's information."**

Option B label: **"Adding a child to an existing family"**
Option B description: **"Choose this if you already have one or more children enrolled. We'll look up your family record by household number, then you can add the new child or children to your application."**

Lookup step heading: **"Find your family record"**
Lookup step subtitle: **"Enter the household number shown on your school account and a parent email address we already have on file. Both must match."**
Household number field label: **"Household number"**
Household number placeholder: **"XYZ476"**
Parent email field label: **"Parent email on file"**
Parent email placeholder: **"name@example.com"**
Lookup button: **"Find our family"**
Lookup failure toast: **"We couldn't find a family matching that household number and email. Please double-check both fields and try again."**
Rate-limit failure toast: **"Too many lookup attempts from your network. Please wait an hour and try again."**

Match confirmation banner: **"Welcome back, {householdName}. You currently have {count} child(ren) enrolled. The new child you add below will be linked to this family record."**

Students section heading: **"Children applying"**
Students section subtitle (new family): **"Add each child you're applying for. You can add multiple children in one application."**
Students section subtitle (existing family): **"Add the new child or children you'd like to register. Your existing children are unchanged."**
Add student button: **"+ Add another child"**
Remove student button (only visible when there's more than one student block): **"Remove this child"**
Student block heading: **"Child {index}"** (e.g. "Child 1", "Child 2")

Submit button (new family, 1 student): **"Submit application"**
Submit button (new family, 2+ students): **"Submit {count} applications"**
Submit button (existing family, 1 student): **"Submit application"**
Submit button (existing family, 2+ students): **"Submit {count} applications"**

Thank-you page (extended): shows a card per application number with the student name and the status ("Ready to Admit" / "Waiting List" / "Awaiting year setup").

## What to build

### Sub-step 1: State model for the page

```ts
type Mode = 'pick' | 'lookup' | 'new_family' | 'existing_family';

interface StudentDraft {
  id: string; // client-side UUID for list keys
  first_name: string;
  middle_name: string;
  last_name: string;
  date_of_birth: string;
  gender: '' | 'male' | 'female';
  national_id: string;
  target_academic_year_id: string;
  target_year_group_id: string;
  medical_notes: string;
  has_allergies: boolean | null;
}

interface ExistingHousehold {
  household_id: string;
  household_number: string;
  household_name: string;
  active_student_count: number;
}
```

Initial state: `mode = 'pick'`, one empty `StudentDraft` in the list, no `existingHousehold`, empty `householdPayload`.

### Sub-step 2: Render branches

```
if (mode === 'pick') render <ModePicker />
else if (mode === 'lookup') render <HouseholdLookupForm />
else if (mode === 'new_family') render <NewFamilyForm />
else if (mode === 'existing_family') render <ExistingFamilyForm /> (shows matched household banner + students + submit)
```

The outer page wires the state transitions:

- `'pick'` → click "new family" → `'new_family'`
- `'pick'` → click "existing family" → `'lookup'`
- `'lookup'` → successful lookup → store `existingHousehold` → `'existing_family'`
- `'lookup'` → "back to mode picker" → `'pick'`

No routing changes; it's all client state.

### Sub-step 3: `HouseholdLookupForm`

`react-hook-form` + `zodResolver(publicHouseholdLookupSchema)`. On submit:

```ts
try {
  const res = unwrap(
    await apiClient<{ data: PublicHouseholdLookupResult }>('/api/v1/public/households/lookup', {
      method: 'POST',
      skipAuth: true,
      silent: true,
      headers: { 'X-Tenant-Slug': tenantSlug },
      body: JSON.stringify({
        tenant_slug: tenantSlug,
        household_number: values.household_number.toUpperCase(),
        parent_email: values.parent_email.toLowerCase(),
      }),
    }),
  );
  setExistingHousehold(res);
  setMode('existing_family');
} catch (err) {
  const status = (err as { status?: number }).status;
  if (status === 403) toast.error(t('lookupRateLimitError'));
  else toast.error(t('lookupFailedError'));
}
```

The household number input auto-uppercases as the user types. The email input is lowercase on submit. Both are required and validated client-side before the POST.

### Sub-step 4: Students section with add/remove

```tsx
<section className="rounded-xl border ...">
  <h2>{t('studentsSection')}</h2>
  <p>{mode === 'existing_family' ? t('studentsExistingSubtitle') : t('studentsNewSubtitle')}</p>

  {students.map((student, idx) => (
    <div key={student.id} className="mt-6 rounded-lg border border-border bg-surface-secondary p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('studentBlockHeading', { index: idx + 1 })}</h3>
        {students.length > 1 && (
          <Button variant="ghost" size="sm" onClick={() => removeStudent(student.id)}>
            {t('removeStudent')}
          </Button>
        )}
      </div>
      <StudentFields
        value={student}
        onChange={(patch) => updateStudent(student.id, patch)}
        academicYearOptions={...}
        yearGroupOptions={...}
      />
    </div>
  ))}

  <div className="mt-6 flex justify-center">
    <Button variant="outline" onClick={addStudent}>
      {t('addStudent')}
    </Button>
  </div>
</section>
```

`StudentFields` is a dumb controlled component that renders the first-name / middle-name / last-name / DOB / gender / national-id / medical-notes / has-allergies inputs bound to the parent's student draft. The year group + academic year options come from the form definition (same `DynamicFormRenderer` resolver path as today).

`addStudent` appends a new empty draft with a new client-side UUID. `removeStudent` filters by id. The buttons disable while submitting.

### Sub-step 5: Section order — parents first, students last (new family mode)

```
<NewFamilyForm>
  <Parent1Section />
  <Parent2Section />        (optional — still shown, just optional)
  <AddressSection />
  <EmergencyContactSection />
  <StudentsSection />
  <LegalSection />
  <SubmitButton />
</NewFamilyForm>
```

Move the emergency-contact section AFTER the student section? No — the user said "followed by the emergency contact" which implies students come before emergency. Re-read the instruction: _"it should first capture the parents' information and their household address and only then do we go for the student information followed by the emergency contact"_. So the order is:

```
Parent 1 → Parent 2 → Address → Students (with add button) → Emergency contact
```

Locking this in. Emergency contact is last.

### Sub-step 6: Existing family form

```
<ExistingFamilyForm>
  <MatchedHouseholdBanner />    (shows name + existing student count)
  <StudentsSection />           (add/remove, same component)
  <LegalSection />
  <SubmitButton />
</ExistingFamilyForm>
```

No parent, address, or emergency sections — those are inherited from the existing household server-side.

### Sub-step 7: Submit handler

```ts
async function handleSubmit() {
  if (submitting) return;
  setSubmitting(true);
  try {
    const body = {
      form_definition_id: form.id,
      mode,
      website_url: honeypot || undefined,
      students: students.map((s) => ({
        first_name: s.first_name.trim(),
        middle_name: s.middle_name.trim() || undefined,
        last_name: s.last_name.trim(),
        date_of_birth: s.date_of_birth,
        gender: s.gender,
        national_id: s.national_id.trim(),
        target_academic_year_id: s.target_academic_year_id,
        target_year_group_id: s.target_year_group_id,
        medical_notes: s.medical_notes.trim() || undefined,
        has_allergies: s.has_allergies ?? undefined,
      })),
      ...(mode === 'existing_family'
        ? { existing_household_id: existingHousehold!.household_id }
        : { household_payload: { ...householdPayload } }),
    };

    const res = unwrap(
      await apiClient<{ data: CreatedBatchResponse }>('/api/v1/public/admissions/applications', {
        method: 'POST',
        skipAuth: true,
        silent: true,
        headers: { 'X-Tenant-Slug': tenantSlug },
        body: JSON.stringify(body),
      }),
    );

    clearSessionDraft();
    router.push(`/${locale}/apply/${tenantSlug}/submitted?batch=${res.submission_batch_id}`);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 429) toast.error(t('rateLimitError'));
    else
      toast.error((err as { error?: { message?: string } })?.error?.message ?? tc('errorGeneric'));
  } finally {
    setSubmitting(false);
  }
}
```

### Sub-step 8: Draft persistence

`sessionStorage` key per tenantSlug, same pattern as today. Persist `mode`, `students`, `householdPayload`, `existingHousehold`. Restore on page load. Clear on successful submit.

### Sub-step 9: Submitted page update

Extend `app/[locale]/(public)/apply/[tenantSlug]/submitted/page.tsx` to read a `batch` query parameter and fetch the batch summary from a new GET endpoint — or just display the batch id. If the server returns the application list in the create response (it does per impl 03), stash it in sessionStorage before navigating and read from there on the submitted page.

Show a list:

```
Your application has been received.

Household number: XYZ476 (for existing-family submissions)

Child 1: Gamma JuniorApplicant — APP-000004 — Ready to admit
Child 2: Delta JuniorApplicant — APP-000005 — Waiting list

Keep these application numbers. You'll need them if you contact the school.
```

### Sub-step 10: Translations

Write all the new keys into a local scratch buffer (`/tmp/impl04-i18n.json` or inside a `// TODO_I18N:` comment in the page file) while coding. In the FINAL commit window, re-read `en.json` and `ar.json`, merge the keys in, write them out. This is Rule H8/H9 — minimises the window during which impl 05 can race your edits on the same files.

English key names:

```
publicApplyForm.modePickerTitle
publicApplyForm.modePickerOptionNewLabel
publicApplyForm.modePickerOptionNewDescription
publicApplyForm.modePickerOptionExistingLabel
publicApplyForm.modePickerOptionExistingDescription
publicApplyForm.lookupTitle
publicApplyForm.lookupSubtitle
publicApplyForm.lookupHouseholdNumberLabel
publicApplyForm.lookupParentEmailLabel
publicApplyForm.lookupButton
publicApplyForm.lookupFailedError
publicApplyForm.lookupRateLimitError
publicApplyForm.matchedBannerTitle
publicApplyForm.matchedBannerCount
publicApplyForm.studentsSection
publicApplyForm.studentsNewSubtitle
publicApplyForm.studentsExistingSubtitle
publicApplyForm.addStudent
publicApplyForm.removeStudent
publicApplyForm.studentBlockHeading
publicApplyForm.submitButtonSingular
publicApplyForm.submitButtonPlural
publicApplyForm.emergencySection
publicApplyForm.backToModePicker
```

Arabic: a human-quality translation for each, not machine translation placeholders.

## Tests

- Unit tests for the state transitions: mode picker → lookup → existing_family; mode picker → new_family.
- Unit tests for the add/remove student logic: start with 1, add → 2, add → 3, remove middle → back to 2.
- Unit tests for the submit payload builder: new_family mode produces `household_payload` and omits `existing_household_id`; existing_family mode does the opposite.
- Snapshot / render tests for the three main screens.

## Watch out for

- `react-hook-form` with a dynamic array of students: use `useFieldArray` from RHF, not hand-rolled state. It handles the re-mount keys and dirty state correctly.
- The `useFieldArray` keys must NOT be derived from the student index — use a stable uuid per row. Otherwise removing a middle row re-keys everything below and trashes focus.
- Draft persistence in `sessionStorage` should also persist the `StudentDraft.id` values so restore doesn't jumble the order.
- The `household_number` input should auto-uppercase on `onChange` and limit to 6 chars.
- The mode picker MUST be rendered before any API call — do not auto-fetch the form in mode='pick'. The form is only needed once the parent has committed to one of the two branches, and fetching eagerly on an aborted mode picker is wasted work.
- When mode='existing_family', the form definition is still fetched (to get the dynamic year-group/academic-year option lists for the student dropdowns). But the parent-facing sections are hidden.
- Reset `sessionStorage` key whenever mode changes from `existing_family` back to `pick` — don't let stale `existingHousehold` leak into a new_family submission.
- Country field is in the household payload for new_family mode only. Default to the tenant's country if the API exposes it; otherwise leave blank.
- The submit button must disable until ALL required student fields in ALL student blocks are filled. One-student-valid is not enough when the parent has added a second block with empty fields.
- In RTL (Arabic) mode, the "+ Add another child" button should show the `+` icon on the leading side via `ms-2` / `me-2`, not `ml-2` / `mr-2`.

## Deployment notes

1. Commit code by sub-step — aim for 4–5 commits, NOT one huge commit.
2. Final commit is the translations merge. Re-read `en.json` / `ar.json` immediately before writing.
3. Pre-deploy serialisation per Rule 6b: if impl 05 is `deploying` (also web target), wait.
4. Clear `.next`, rebuild with `--force`, restart web.
5. Smoke tests (with Playwright):
   - `/en/apply/nhqs` loads the mode picker
   - "New family" branch loads the reordered sections
   - "Existing family" branch shows the lookup step
   - Lookup with bogus data shows a toast
   - Add student button adds a new block
   - Remove student button removes a block
   - Submit with 2 students creates 2 applications (verify via admin after login)
6. Flip log to `completed` in a separate commit.
