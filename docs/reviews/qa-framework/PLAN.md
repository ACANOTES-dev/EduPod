# RuPaul — End-to-End QA Testing Framework

## What This Is

Automated end-to-end browser testing for every module in the app. The system uses Playwright to walk through the application exactly as a human user would — visiting pages, filling forms, clicking buttons, verifying outcomes.

The key design decision: **form data is generated from Zod schemas**, not hardcoded. When a schema changes (field added, field removed, validation tightened), the test data updates automatically. You record the flow skeleton once with Playwright codegen; the volatile parts (form fills) are driven by the schemas you already maintain in `@school/shared`.

---

## Current State

| What                     | Status                                                     |
| ------------------------ | ---------------------------------------------------------- |
| Playwright installed     | Yes (`@playwright/test@^1.49.1` in `apps/web`)             |
| Visual snapshot tests    | Yes (20+ in `apps/web/e2e/visual/`)                        |
| Functional browser tests | **No** — no login, no form fills, no user journeys         |
| API integration tests    | Yes (50+ in `apps/api/test/`)                              |
| Auth test helpers        | Yes (API only — `login()`, `getAuthToken()`, `authPost()`) |
| Tenant fixture builder   | Yes (API only — `tenant-fixture.builder.ts`)               |
| `data-testid` attributes | **None** — zero across all 41 UI components                |
| Zod schemas              | 50 files, hundreds of schemas                              |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Test Runner (Playwright)            │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐   ┌───────────────────────────┐   │
│  │ Flow Skeleton │   │  Zod-Driven Test Data     │   │
│  │ (navigation,  │   │  (auto-generated from     │   │
│  │  clicks,      │ + │   @school/shared schemas, │   │
│  │  assertions)  │   │   updates when schema     │   │
│  │              │   │   changes)                │   │
│  └──────────────┘   └───────────────────────────┘   │
│         │                       │                   │
│         ▼                       ▼                   │
│  ┌──────────────────────────────────────────────┐   │
│  │         Form Fill Helpers                     │   │
│  │  fillForm(page, 'student-form', data)        │   │
│  │  → finds data-testid="student-form.{field}"  │   │
│  │  → fills each field by type (text/select/     │   │
│  │    checkbox/date/file)                        │   │
│  └──────────────────────────────────────────────┘   │
│                       │                             │
│                       ▼                             │
│  ┌──────────────────────────────────────────────┐   │
│  │         Assertions                            │   │
│  │  → API returned expected status               │   │
│  │  → navigated to expected page                 │   │
│  │  → success toast / confirmation shown         │   │
│  │  → created entity visible in list             │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 0 — Foundation (Day 1)

#### 0A: Add `data-testid` to `@school/ui` components

Every interactive component in `packages/ui/` needs a `data-testid` prop that flows through to the rendered DOM element. Components accept an optional `data-testid` and pass it through.

**Convention:** `module.element` naming — e.g., `student-form.first_name`, `login.submit`, `wizard.next`

**Components to instrument (all 41):**

Primitives (24):

- `Button` — `data-testid` on the `<button>`
- `Input` — `data-testid` on the `<input>`
- `Textarea` — `data-testid` on the `<textarea>`
- `Checkbox` — `data-testid` on the checkbox root
- `RadioGroup` / `RadioGroupItem` — `data-testid` on root and each item
- `Switch` — `data-testid` on the switch root
- `Select` / `SelectTrigger` / `SelectItem` — `data-testid` on trigger and each item
- `Dialog` / `DialogContent` — `data-testid` on dialog content
- `Sheet` / `SheetContent` — `data-testid` on sheet content
- `DropdownMenu` / `DropdownMenuItem` — `data-testid` on menu and items
- `Popover` / `PopoverContent` — `data-testid` on popover
- `Label` — `data-testid` on label
- `Separator`, `Avatar`, `Badge`, `Skeleton`, `ScrollArea`, `Command` — `data-testid` pass-through

Composites (11):

- `Modal` — `data-testid` on modal root, confirm button, cancel button
- `Drawer` — `data-testid` on drawer root
- `EmptyState` — `data-testid` on action button
- `StatusBadge` — `data-testid` on badge
- `StatCard` — `data-testid` on card
- `TableWrapper` — `data-testid` on table container
- `CommandPalette` — `data-testid` on palette
- `TipTapEditor` — `data-testid` on editor

App Shell (6):

- `Sidebar` / `SidebarItem` — `data-testid` on nav items
- `TopBar` — `data-testid` on bar
- `AppShell` — `data-testid` on shell

**Implementation note:** These components already spread `...props` onto the underlying DOM element. Since `data-testid` is a valid HTML attribute, it passes through automatically in most cases. The work is mainly:

1. Verifying each component actually spreads props to the right DOM node
2. For composite components (Modal, Drawer), ensuring testids reach the actionable elements
3. Documenting the convention

#### 0B: Playwright functional test config

Create a new Playwright config for functional tests, separate from visual snapshot tests.

**File:** `apps/web/e2e/playwright.functional.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './functional',
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'pnpm --filter @school/web dev',
        port: 3000,
        reuseExistingServer: true,
      },
});
```

#### 0C: Auth setup for functional tests

Create a global setup that logs in once and saves the auth state for reuse across all tests.

**File:** `apps/web/e2e/functional/setup/auth.setup.ts`

Approach:

- Log in as each required role (platform admin, school owner, teacher, parent) via the login page
- Save browser storage state to `apps/web/e2e/.auth/{role}.json`
- Tests declare which role they need via Playwright fixtures

**Roles to pre-authenticate:**

- `platform-admin` — for platform admin tests
- `school-owner` — for most admin/config tests
- `teacher` — for gradebook, attendance, timetable tests
- `parent` — for parent portal, inquiries, conferences tests

Uses the existing seed data credentials:

- `PLATFORM_ADMIN_EMAIL` / `DEV_PASSWORD`
- `AL_NOOR_OWNER_EMAIL` / `DEV_PASSWORD`
- etc.

---

### Phase 1 — Core Infrastructure (Day 1-2)

#### 1A: Zod-to-test-data generator

**File:** `apps/web/e2e/functional/helpers/generate-test-data.ts`

A utility that takes any Zod schema and produces valid test data automatically.

```typescript
import { z } from 'zod';

export function generateTestData<T extends z.ZodTypeAny>(schema: T): z.infer<T> {
  // Walks the Zod schema tree and produces valid values:
  // - z.string()        → 'test-string-{random}'
  // - z.string().email() → 'test-{random}@example.com'
  // - z.string().uuid()  → crypto.randomUUID()
  // - z.number()         → 42
  // - z.boolean()        → true
  // - z.enum([...])      → first enum value
  // - z.date()           → new Date()
  // - z.object({...})    → recurse into each field
  // - z.array(...)       → [one generated item]
  // - z.optional(...)    → generate the inner type (fill optionals for coverage)
  // - z.nullable(...)    → generate the inner type (non-null for happy path)
  // - z.union([...])     → generate from first variant
  // - z.discriminatedUnion(...) → generate from first variant
  // - z.literal(x)       → x
  // - z.nativeEnum(E)    → first enum value
  // - z.coerce.*         → appropriate coerced value
}
```

**With overrides:**

```typescript
const data = generateTestData(createStudentSchema, {
  first_name: 'Specific Name', // override specific fields
  // everything else auto-generated
});
```

This is the critical piece. When `createStudentSchema` gains a new required field `nationality`, the generator automatically produces a value for it. No test breaks.

#### 1B: Form fill helpers

**File:** `apps/web/e2e/functional/helpers/form-helpers.ts`

```typescript
import type { Page } from '@playwright/test';

export async function fillForm(
  page: Page,
  formTestId: string,
  data: Record<string, unknown>,
  fieldTypes?: Record<
    string,
    'text' | 'select' | 'checkbox' | 'date' | 'file' | 'radio' | 'rich-text'
  >,
) {
  for (const [field, value] of Object.entries(data)) {
    const testId = `${formTestId}.${field}`;
    const type = fieldTypes?.[field] || 'text';

    switch (type) {
      case 'text':
        await page.getByTestId(testId).fill(String(value));
        break;
      case 'select':
        await page.getByTestId(testId).click();
        await page.getByRole('option', { name: String(value) }).click();
        break;
      case 'checkbox':
        if (value) await page.getByTestId(testId).check();
        break;
      case 'date':
        await page.getByTestId(testId).fill(String(value));
        break;
      case 'file':
        await page.getByTestId(testId).setInputFiles(String(value));
        break;
      case 'radio':
        await page.getByTestId(`${testId}.${value}`).click();
        break;
      case 'rich-text':
        await page.getByTestId(testId).locator('[contenteditable]').fill(String(value));
        break;
    }
  }
}
```

#### 1C: Schema-to-field-type mapping

**File:** `apps/web/e2e/functional/helpers/field-type-map.ts`

Maps form names to their field types so `fillForm` knows how to interact with each field:

```typescript
export const FIELD_TYPES: Record<string, Record<string, FieldType>> = {
  'student-form': {
    first_name: 'text',
    last_name: 'text',
    date_of_birth: 'date',
    gender: 'select',
    nationality: 'select',
    has_allergy: 'checkbox',
    photo: 'file',
  },
  'parent-form': {
    first_name: 'text',
    last_name: 'text',
    email: 'text',
    phone: 'text',
    relationship: 'select',
    is_billing_parent: 'checkbox',
  },
  // ... per form
};
```

This is the only manual mapping — it tells the system _how_ each field is rendered. The _values_ come from Zod.

#### 1D: Common assertion helpers

**File:** `apps/web/e2e/functional/helpers/assertions.ts`

```typescript
export async function expectSuccessToast(page: Page, message?: string) { ... }
export async function expectNavigatedTo(page: Page, path: string) { ... }
export async function expectTableRowCount(page: Page, testId: string, count: number) { ... }
export async function expectNoValidationErrors(page: Page) { ... }
export async function expectApiSuccess(page: Page, method: string, urlPattern: string) { ... }
export async function expectEntityInList(page: Page, listTestId: string, entityName: string) { ... }
export async function expectPdfDownloaded(page: Page) { ... }
```

---

### Phase 2 — Critical Flow Tests (Day 2-3)

Record flow skeletons with `npx playwright codegen` and wire in the helpers from Phase 1. Start with the flows that matter most for launch.

#### Priority 1 — Auth & Access

| Test                           | What it validates                                                        |
| ------------------------------ | ------------------------------------------------------------------------ |
| Login with valid credentials   | Form submit → API 200 → redirect to dashboard                            |
| Login with invalid credentials | Form submit → API 401 → error message shown                              |
| MFA verification               | Login → MFA prompt → code entry → dashboard                              |
| Password reset request         | Email entry → API 200 → confirmation message                             |
| Tenant switching               | Select school → API 200 → dashboard changes                              |
| Role-based redirect            | Login as parent → parent dashboard. Login as teacher → teacher dashboard |

#### Priority 2 — Student Lifecycle

| Test                      | What it validates                                               |
| ------------------------- | --------------------------------------------------------------- |
| Create student            | Fill form (Zod-driven) → submit → API 201 → student detail page |
| Edit student              | Change fields → submit → API 200 → updated values visible       |
| View student list         | Navigate → table renders → pagination works                     |
| Student status transition | Active → withdrawn → confirmation dialog → status badge updates |
| Student allergy report    | Navigate → filter → report renders → PDF export                 |

#### Priority 3 — Admissions Pipeline

| Test                           | What it validates                                        |
| ------------------------------ | -------------------------------------------------------- |
| Public application submission  | Fill dynamic form → submit → confirmation page           |
| Review application             | Open application → review form → accept → status updates |
| Convert application to student | Accept → convert → household + parents + student created |
| Application notes              | Add note → note appears in timeline                      |

#### Priority 4 — Households & Parents

| Test                     | What it validates                                       |
| ------------------------ | ------------------------------------------------------- |
| Create household         | Fill form → submit → household detail page              |
| Merge households         | Select source + target → confirm → source archived      |
| Add student to household | Select student → confirm → student appears in household |
| Emergency contacts       | Add/edit contacts → save → contacts visible             |

#### Priority 5 — Classes & Academics

| Test              | What it validates                                     |
| ----------------- | ----------------------------------------------------- |
| Create class      | Fill form → submit → class detail page                |
| Enrol student     | Select student → enrol → student appears in class     |
| Promotion wizard  | Preview → select actions → commit → students promoted |
| Subject CRUD      | Create → edit → list → verify                         |
| Year group config | Create/edit year groups → verify ordering             |

#### Priority 6 — Finance

| Test                 | What it validates                                                 |
| -------------------- | ----------------------------------------------------------------- |
| Create fee structure | Fill form → submit → fee structure visible                        |
| Fee generation       | Preview → confirm → invoices created                              |
| Record payment       | Select invoice → enter amount → allocate → invoice status updates |
| Invoice lifecycle    | Draft → issue → partial payment → paid                            |
| Statement PDF        | Navigate → select household → download → PDF received             |

---

### Phase 3 — Full Module Coverage (Day 3-5)

Expand to remaining modules. Each module follows the same pattern:

1. Codegen the flow skeleton
2. Wire in Zod-driven form fills
3. Add business outcome assertions

#### Module Test Map

| Module          | Flows to test                                                     | Estimated specs |
| --------------- | ----------------------------------------------------------------- | --------------- |
| Attendance      | Session create, mark students, upload CSV, quick-mark, amendments | 5               |
| Gradebook       | Assessment create, grade entry, period computation, import wizard | 5               |
| Report Cards    | Generate, review, approve, publish, PDF verify                    | 4               |
| Scheduling      | Period grid, curriculum req, auto-scheduler, substitutions        | 5               |
| Payroll         | Compensation, run create, attendance, finalise, payslip PDF       | 5               |
| Communications  | Announcement create, schedule, delivery status                    | 3               |
| RBAC            | Role create, permission assign, invitation send/accept            | 3               |
| Configuration   | Settings update, branding, Stripe config, module toggles          | 3               |
| Reports         | KPI dashboard, domain analytics, custom report builder            | 3               |
| Website CMS     | Page create, publish, contact form                                | 2               |
| Imports         | Upload CSV, validate, preview, confirm                            | 2               |
| Parent Portal   | Dashboard, inquiries, conference booking                          | 3               |
| Compliance/GDPR | Data subject request, consent management                          | 2               |
| Platform Admin  | Tenant create, module enable, impersonation                       | 3               |
| Behaviour       | Incident log, sanctions, interventions, exclusions, appeals       | 6               |
| Engagement      | Events, form templates, conferences, parent forms                 | 5               |
| Search          | Global search, result navigation                                  | 1               |

**Total: ~60 spec files across all modules**

---

### Phase 4 — CI Integration (Day 5)

Add functional e2e tests to CI pipeline.

**In `.github/workflows/ci.yml`:**

```yaml
e2e-functional:
  needs: [ci]
  runs-on: ubuntu-latest
  services:
    postgres: ...
    redis: ...
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v2
    - uses: actions/setup-node@v4
    - run: pnpm install --frozen-lockfile
    - run: npx playwright install chromium
    - run: pnpm --filter @school/prisma db:migrate
    - run: pnpm --filter @school/prisma db:seed
    - run: pnpm --filter @school/api build
    - run: pnpm --filter @school/web build
    - name: Run functional e2e tests
      run: pnpm --filter @school/web test:e2e:functional
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: apps/web/e2e/playwright-report/
```

---

## Folder Structure

```
apps/web/e2e/
├── functional/
│   ├── setup/
│   │   └── auth.setup.ts              # Pre-authenticate all roles
│   ├── helpers/
│   │   ├── generate-test-data.ts      # Zod schema → valid test data
│   │   ├── form-helpers.ts            # fillForm(), clearForm()
│   │   ├── field-type-map.ts          # Which fields are selects/checkboxes/etc
│   │   ├── assertions.ts             # expectSuccessToast(), expectNavigatedTo()
│   │   └── fixtures.ts               # Playwright fixtures with role-based auth
│   ├── auth/
│   │   ├── login.spec.ts
│   │   ├── mfa.spec.ts
│   │   └── password-reset.spec.ts
│   ├── students/
│   │   ├── create-student.spec.ts
│   │   ├── edit-student.spec.ts
│   │   ├── student-list.spec.ts
│   │   └── student-status.spec.ts
│   ├── admissions/
│   │   ├── public-application.spec.ts
│   │   ├── review-application.spec.ts
│   │   └── convert-application.spec.ts
│   ├── households/
│   │   ├── create-household.spec.ts
│   │   ├── merge-households.spec.ts
│   │   └── manage-contacts.spec.ts
│   ├── academics/
│   │   ├── subjects.spec.ts
│   │   ├── year-groups.spec.ts
│   │   └── promotion-wizard.spec.ts
│   ├── classes/
│   │   ├── create-class.spec.ts
│   │   ├── enrolment.spec.ts
│   │   └── bulk-assignments.spec.ts
│   ├── finance/
│   │   ├── fee-structures.spec.ts
│   │   ├── fee-generation.spec.ts
│   │   ├── payments.spec.ts
│   │   ├── invoices.spec.ts
│   │   └── statements.spec.ts
│   ├── attendance/
│   │   ├── session-management.spec.ts
│   │   ├── mark-attendance.spec.ts
│   │   └── upload.spec.ts
│   ├── gradebook/
│   │   ├── assessments.spec.ts
│   │   ├── grade-entry.spec.ts
│   │   └── import-wizard.spec.ts
│   ├── report-cards/
│   │   ├── generate.spec.ts
│   │   ├── approval-workflow.spec.ts
│   │   └── pdf-verify.spec.ts
│   ├── scheduling/
│   │   ├── period-grid.spec.ts
│   │   ├── auto-scheduler.spec.ts
│   │   └── substitutions.spec.ts
│   ├── payroll/
│   │   ├── compensation.spec.ts
│   │   ├── payroll-run.spec.ts
│   │   └── payslip.spec.ts
│   ├── communications/
│   │   ├── announcements.spec.ts
│   │   └── delivery.spec.ts
│   ├── behaviour/
│   │   ├── incidents.spec.ts
│   │   ├── sanctions.spec.ts
│   │   ├── interventions.spec.ts
│   │   ├── exclusions.spec.ts
│   │   ├── appeals.spec.ts
│   │   └── safeguarding.spec.ts
│   ├── engagement/
│   │   ├── events.spec.ts
│   │   ├── form-templates.spec.ts
│   │   ├── conferences.spec.ts
│   │   ├── trips.spec.ts
│   │   └── parent-forms.spec.ts
│   ├── rbac/
│   │   ├── roles.spec.ts
│   │   └── invitations.spec.ts
│   ├── config/
│   │   ├── settings.spec.ts
│   │   └── branding.spec.ts
│   ├── reports/
│   │   ├── kpi-dashboard.spec.ts
│   │   ├── domain-analytics.spec.ts
│   │   └── custom-reports.spec.ts
│   ├── compliance/
│   │   ├── dsar.spec.ts
│   │   └── consent.spec.ts
│   ├── platform-admin/
│   │   ├── tenant-provisioning.spec.ts
│   │   └── impersonation.spec.ts
│   ├── website/
│   │   ├── pages.spec.ts
│   │   └── contact-form.spec.ts
│   ├── imports/
│   │   └── bulk-import.spec.ts
│   ├── parent-portal/
│   │   ├── dashboard.spec.ts
│   │   ├── inquiries.spec.ts
│   │   └── conferences.spec.ts
│   └── search/
│       └── global-search.spec.ts
├── visual/                            # (existing visual snapshot tests)
├── visual-smoke/                      # (existing smoke tests)
├── .auth/                             # Saved auth states (gitignored)
├── playwright.config.ts               # (existing visual config)
├── playwright.visual-smoke.config.ts  # (existing smoke config)
└── playwright.functional.config.ts    # NEW — functional test config
```

---

## How the Self-Maintaining Loop Works

This is the key value proposition — here is the exact chain:

```
1. You add a required field `nationality` to createStudentSchema in @school/shared

2. generateTestData(createStudentSchema) automatically produces { ..., nationality: 'test-string-xyz' }

3. fillForm(page, 'student-form', data) automatically fills the nationality field
   (IF field-type-map.ts has the entry — this is the one manual step)

4. Test passes if:
   - data-testid="student-form.nationality" exists on the form field
   - field-type-map.ts has the entry for nationality
   - The generated value passes Zod validation

5. Test FAILS LOUDLY if any of those are missing — telling you exactly what to fix
```

**What auto-updates:** Test data values, field coverage, validation compliance

**What needs manual update:** Field type mapping (is it a text input or a dropdown?), `data-testid` on the new UI element, flow skeletons (only if navigation/page structure changes)

---

## Recording a New Flow (Procedure)

When you need to add a test for a new flow:

```bash
# 1. Start the dev server
pnpm --filter @school/web dev

# 2. Open codegen pointed at your app
npx playwright codegen http://localhost:3000/en/login

# 3. Walk through the flow manually — codegen writes the spec

# 4. Save the generated spec to the right module folder

# 5. Replace inline form fills with helper calls:
#    BEFORE (codegen output):
#      await page.getByLabel('First Name').fill('John');
#      await page.getByLabel('Last Name').fill('Doe');
#
#    AFTER (with helpers):
#      const data = generateTestData(createStudentSchema);
#      await fillForm(page, 'student-form', data, FIELD_TYPES['student-form']);

# 6. Add assertions (codegen doesn't generate these):
#      await expectSuccessToast(page);
#      await expectNavigatedTo(page, '/en/students/');

# 7. Run the test
npx playwright test functional/students/create-student.spec.ts
```

---

## Package Scripts

Add to `apps/web/package.json`:

```json
{
  "scripts": {
    "test:e2e:functional": "playwright test --config e2e/playwright.functional.config.ts",
    "test:e2e:functional:ui": "playwright test --config e2e/playwright.functional.config.ts --ui",
    "test:e2e:module": "playwright test --config e2e/playwright.functional.config.ts functional/$MODULE/",
    "test:e2e:codegen": "playwright codegen http://localhost:3000"
  }
}
```

Usage:

```bash
# Run all functional tests
pnpm --filter @school/web test:e2e:functional

# Run tests for one module
MODULE=academics pnpm --filter @school/web test:e2e:module

# Open codegen to record a new flow
pnpm --filter @school/web test:e2e:codegen
```

---

## Dependencies

No new packages needed. Everything uses:

- `@playwright/test` (already installed)
- `zod` (already installed via `@school/shared`)
- Existing seed data and auth credentials

---

## Success Criteria

Phase 0-1 is done when:

- [ ] All 41 `@school/ui` components pass through `data-testid`
- [ ] `generateTestData()` handles all Zod types used in `@school/shared`
- [ ] `fillForm()` handles text, select, checkbox, date, file, radio, rich-text
- [ ] Auth setup saves state for 4 roles
- [ ] One complete test (e.g., create student) runs green

Phase 2 is done when:

- [ ] Auth, Students, Admissions, Households, Classes, Academics, Finance flows all pass
- [ ] Each test validates UI outcome + API outcome

Phase 3 is done when:

- [ ] All modules have at least happy-path coverage
- [ ] ~60 spec files across all modules

Phase 4 is done when:

- [ ] Functional tests run in CI on every push
- [ ] Playwright report uploads on failure
- [ ] No flaky tests (retries handle transient issues only)
