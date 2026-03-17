# Phase 3 Testing Instructions — Admissions

---

## Section 1 — Unit Tests

### 1.1 SequenceService (`apps/api/src/modules/tenants/sequence.service.spec.ts`)

| Test | Description | Input | Expected |
|------|-------------|-------|----------|
| should generate application number | Call `nextNumber(tenantId, 'application')` | Tenant with sequence at 0 | `APP-2026XX-000001` (with current year+month) |
| should increment sequentially | Call twice | Two calls | `000001`, then `000002` |
| should throw for missing sequence type | Call with nonexistent type | `nextNumber(tenantId, 'nonexistent')` | Throws error "Sequence type not found" |
| should format correctly at high numbers | Pre-set current_value to 999999 | Call once | `APP-2026XX-1000000` |

### 1.2 AdmissionsRateLimitService (`apps/api/src/modules/admissions/admissions-rate-limit.service.spec.ts`)

| Test | Description |
|------|-------------|
| should allow first 3 requests | 3 calls return `{ allowed: true }` |
| should block 4th request | 4th call returns `{ allowed: false, remaining: 0 }` |
| should track per tenant+IP | Different tenant same IP = separate counters |
| should track per IP per tenant | Different IP same tenant = separate counters |

### 1.3 AdmissionFormsService (`apps/api/src/modules/admissions/admission-forms.service.spec.ts`)

**Create:**
| Test | Description |
|------|-------------|
| should create form with fields in draft status | Valid input → form + fields created, status = 'draft' |
| should reject duplicate field_keys | Two fields with same field_key → `INVALID_FIELD_KEY` error |
| should reject invalid conditional_visibility ref | depends_on_field_key references non-existent key → `INVALID_CONDITIONAL_REF` |
| should reject select fields without options | single_select with no options_json → `MISSING_OPTIONS` |
| should warn if no date_of_birth field is required | No DOB field or DOB not required → response includes warning |
| should reject duplicate form name for root forms | Same tenant + same name + both root → `DUPLICATE_FORM_NAME` |

**Update:**
| Test | Description |
|------|-------------|
| should update draft form in-place | Edit draft → same ID, updated fields |
| should create new version when editing published form | Edit published → old archived, new draft created with `base_form_id` |
| should reject editing archived form | Edit archived → `FORM_ARCHIVED` error |
| edge: concurrent edit should fail | Two edits with same `expected_updated_at` → second gets `CONCURRENT_MODIFICATION` |

**Publish:**
| Test | Description |
|------|-------------|
| should publish draft form | Draft → published |
| should archive other published in lineage | If v1 published, publishing v2 → v1 archived |
| should reject publishing non-draft | Published form → `FORM_NOT_DRAFT` error |
| should reject publishing empty form | No fields → `FORM_EMPTY` |

**Versioning:**
| Test | Description |
|------|-------------|
| should return all versions of a form lineage | Create v1, edit to v2 → getVersions returns both |
| version_number should increment correctly | v1=1, edit published → v2=2, edit again → v3=3 |

### 1.4 ApplicationsService (`apps/api/src/modules/admissions/applications.service.spec.ts`)

**createPublic:**
| Test | Description |
|------|-------------|
| should create draft application with generated number | Valid form + payload → application created with `APP-YYYY-000001` |
| should silently reject honeypot submissions | `website_url` filled → returns fake response, no record created |
| should reject if rate limit exceeded | 4th submission from same IP → `RATE_LIMIT_EXCEEDED` |
| should reject for non-published form | Draft/archived form → `FORM_NOT_FOUND` |
| should validate required fields in payload | Required field missing → `VALIDATION_ERROR` |

**submit:**
| Test | Description |
|------|-------------|
| should set status to submitted and link parent | Draft → submitted, `submitted_by_parent_id` set |
| should detect duplicates by name+DOB | Matching application exists → internal note created |
| should reject if not in draft status | Submitted application → `INVALID_STATUS_TRANSITION` |
| should work without parent record | User has no parent → `submitted_by_parent_id` = null |

**review — Status Transitions:**
| Test | Description |
|------|-------------|
| submitted → under_review | Valid transition |
| submitted → rejected | Valid (direct rejection) |
| under_review → pending_acceptance_approval (with approval) | requireApprovalForAcceptance=true + workflow exists → creates approval request |
| under_review → accepted (no approval needed) | requireApprovalForAcceptance=false → accepted directly |
| under_review → rejected | Valid |
| edge: draft → under_review | Invalid → `INVALID_STATUS_TRANSITION` |
| edge: accepted → rejected | Invalid → `INVALID_STATUS_TRANSITION` |
| edge: concurrent modification | Stale `expected_updated_at` → `CONCURRENT_MODIFICATION` |

**withdraw:**
| Test | Description |
|------|-------------|
| should withdraw submitted application | submitted → withdrawn |
| should reject withdrawing accepted application | accepted → `INVALID_STATUS_TRANSITION` |
| parent should only withdraw own application | Parent A tries to withdraw Parent B's → `NOT_OWNER` |

**convert:**
| Test | Description |
|------|-------------|
| should create student, parent, household in one transaction | Accepted app → student (active, entry_date=today), household (needs_completion=true), parent, junctions |
| should link existing parent by ID | `parent1_link_existing_id` provided → uses existing parent |
| should create new parent when no link provided | No `parent1_link_existing_id` → new parent created |
| should handle parent2 (optional) | parent2 fields provided → second parent + junction created |
| should reject if not accepted | Under review → `NOT_ACCEPTED` |
| should reject if year_group not found | Invalid year_group_id → `YEAR_GROUP_NOT_FOUND` |
| edge: concurrent conversion | Stale `expected_updated_at` → `CONCURRENT_MODIFICATION` |
| should create conversion note | After conversion → internal note with student/household IDs |

**analytics:**
| Test | Description |
|------|-------------|
| should return correct funnel counts | Mix of statuses → correct counts per status |
| should calculate conversion rate | 3 accepted / 10 total → 30% |
| should return null avg_days when no decisions | No reviewed applications → `avg_days_to_decision = null` |

**findByParent:**
| Test | Description |
|------|-------------|
| should return only parent's own applications | Parent has 2 apps, another parent has 1 → returns 2 |
| should return empty array if no parent record | User with no parent → `[]` |

### 1.5 ApplicationNotesService

| Test | Description |
|------|-------------|
| should create note linked to application | Valid input → note created |
| should filter internal notes for parent view | `includeInternal=false` → only non-internal notes |
| should include all notes for staff view | `includeInternal=true` → all notes |

---

## Section 2 — Integration Tests

### 2.1 Form Definition Endpoints (`apps/api/test/admission-forms.e2e-spec.ts`)

| Test | Method | Path | Auth | Expected |
|------|--------|------|------|----------|
| Create form — happy path | POST | `/api/v1/admission-forms` | Admin | 201, form with fields |
| Create form — no auth | POST | `/api/v1/admission-forms` | None | 401 |
| Create form — no permission | POST | `/api/v1/admission-forms` | Parent | 403 |
| List forms | GET | `/api/v1/admission-forms` | Staff (admissions.view) | 200, paginated list |
| Get form detail | GET | `/api/v1/admission-forms/:id` | Staff | 200, form with fields |
| Update draft form | PUT | `/api/v1/admission-forms/:id` | Admin | 200, updated form |
| Update published form (creates version) | PUT | `/api/v1/admission-forms/:id` | Admin | 200, new version |
| Publish form | POST | `/api/v1/admission-forms/:id/publish` | Admin | 200, status=published |
| Archive form | POST | `/api/v1/admission-forms/:id/archive` | Admin | 200, status=archived |
| Get versions | GET | `/api/v1/admission-forms/:id/versions` | Staff | 200, version list |
| Not found | GET | `/api/v1/admission-forms/:nonexistent` | Staff | 404 |

### 2.2 Application Endpoints (`apps/api/test/applications.e2e-spec.ts`)

| Test | Method | Path | Auth | Expected |
|------|--------|------|------|----------|
| List applications | GET | `/api/v1/applications` | Admin | 200, paginated |
| List with status filter | GET | `/api/v1/applications?status=submitted` | Admin | 200, filtered |
| Get detail | GET | `/api/v1/applications/:id` | Admin | 200, full detail |
| Get preview | GET | `/api/v1/applications/:id/preview` | Admin | 200, preview data |
| Review: start review | POST | `/api/v1/applications/:id/review` | Admin | 200, under_review |
| Review: accept (no approval) | POST | `/api/v1/applications/:id/review` | Admin | 200, accepted |
| Review: reject | POST | `/api/v1/applications/:id/review` | Admin | 200, rejected |
| Withdraw | POST | `/api/v1/applications/:id/withdraw` | Admin | 200, withdrawn |
| Conversion preview | GET | `/api/v1/applications/:id/conversion-preview` | Admin | 200, pre-populated data |
| Convert | POST | `/api/v1/applications/:id/convert` | Admin | 201, student+household IDs |
| Analytics | GET | `/api/v1/applications/analytics` | Admin | 200, funnel data |
| Notes — list | GET | `/api/v1/applications/:id/notes` | Admin | 200, notes list |
| Notes — create | POST | `/api/v1/applications/:id/notes` | Admin | 201, new note |
| No auth | GET | `/api/v1/applications` | None | 401 |
| No permission | GET | `/api/v1/applications` | Parent | 403 |

### 2.3 Public Endpoints (`apps/api/test/public-admissions.e2e-spec.ts`)

| Test | Method | Path | Expected |
|------|--------|------|----------|
| Get published form | GET | `/api/v1/public/admissions/form` | 200, form with parent-visible fields |
| Get form — no published form | GET | `/api/v1/public/admissions/form` | 404 |
| Create draft application | POST | `/api/v1/public/admissions/applications` | 201, id + number |
| Create — rate limit exceeded | POST (4th) | `/api/v1/public/admissions/applications` | 400, RATE_LIMIT_EXCEEDED |
| Create — honeypot filled | POST | `/api/v1/public/admissions/applications` | 201 (silent reject) |
| Create — invalid form | POST | `/api/v1/public/admissions/applications` | 404 |
| Create — missing required fields | POST | `/api/v1/public/admissions/applications` | 400 |

### 2.4 Parent Endpoints (`apps/api/test/parent-applications.e2e-spec.ts`)

| Test | Method | Path | Auth | Expected |
|------|--------|------|------|----------|
| List own applications | GET | `/api/v1/parent/applications` | Parent | 200, own apps only |
| View own application | GET | `/api/v1/parent/applications/:id` | Parent | 200, no internal notes |
| Submit draft | POST | `/api/v1/parent/applications/:id/submit` | Parent | 200, submitted |
| Withdraw own | POST | `/api/v1/parent/applications/:id/withdraw` | Parent | 200, withdrawn |
| No auth | GET | `/api/v1/parent/applications` | None | 401 |

---

## Section 3 — RLS Leakage Tests

For **every** tenant-scoped table and endpoint, test cross-tenant isolation:

### 3.1 Table-Level RLS (`apps/api/test/admissions-rls.e2e-spec.ts`)

| Table | Test |
|-------|------|
| `admission_form_definitions` | Create form as Tenant A → query as Tenant B → empty result |
| `admission_form_fields` | Create form+fields as Tenant A → query fields as Tenant B → empty |
| `applications` | Submit app as Tenant A → list as Tenant B → not visible |
| `application_notes` | Add note to Tenant A app → query notes as Tenant B → empty |

### 3.2 Endpoint-Level RLS

| Endpoint | Test |
|----------|------|
| `GET /api/v1/admission-forms` | Auth as Tenant A admin → list → only Tenant A forms |
| `GET /api/v1/admission-forms/:id` | Tenant B form ID via Tenant A auth → 404 |
| `GET /api/v1/applications` | Auth as Tenant A → list → only Tenant A applications |
| `GET /api/v1/applications/:id` | Tenant B app ID via Tenant A auth → 404 |
| `POST /api/v1/applications/:id/review` | Review Tenant B app from Tenant A → 404 |
| `POST /api/v1/applications/:id/convert` | Convert Tenant B app from Tenant A → 404 |
| `GET /api/v1/public/admissions/form` | Request via Tenant A domain → only Tenant A form |
| `POST /api/v1/public/admissions/applications` | Submit via Tenant A domain → app has Tenant A tenant_id |

### 3.3 Cross-Tenant Conversion Safety

| Test | Description |
|------|-------------|
| Convert should not cross-link parents | Tenant A app with `parent1_link_existing_id` pointing to Tenant B parent → `PARENT_NOT_FOUND` |
| Convert should not cross-link year groups | Tenant A app with Tenant B `year_group_id` → `YEAR_GROUP_NOT_FOUND` |

---

## Section 4 — Manual QA Checklist

### 4.1 Form Builder (Admin)

- [ ] Navigate to Admissions → Forms
- [ ] Click "Create Form"
- [ ] Enter form name, add 5+ fields of different types
- [ ] Add a single_select field with 3 options
- [ ] Add conditional visibility: show field X when field Y = specific value
- [ ] Mark some fields as required
- [ ] Leave `date_of_birth` field as not-required → verify warning appears
- [ ] Save as draft
- [ ] Edit the draft → verify fields load correctly
- [ ] Publish the form
- [ ] Edit the published form → verify "new version" warning
- [ ] Save → verify new version created, old version archived
- [ ] View version history
- [ ] Switch to Arabic locale → verify form builder works in RTL

### 4.2 Public Admissions Page

- [ ] Visit `/{locale}/admissions` as unauthenticated user
- [ ] Verify published form displays correctly
- [ ] Fill required fields, test conditional visibility
- [ ] Verify phone/email inputs have LTR direction
- [ ] Submit form → verify auth redirect
- [ ] Log in as parent → verify application submitted
- [ ] Verify application number generated (APP-YYYY-XXXXXX format)
- [ ] Submit 3 more times quickly → verify 4th is rate-limited
- [ ] Fill honeypot field → verify silent rejection (201 but no real record)
- [ ] Test in Arabic locale → verify form renders RTL correctly

### 4.3 Application Review (Admin)

- [ ] Navigate to Admissions → see application list
- [ ] Filter by status (submitted, under_review, etc.)
- [ ] Search by student name or application number
- [ ] Click an application → verify record hub layout
- [ ] View "Application" tab → verify form data renders against correct form version
- [ ] Add internal note → verify it appears
- [ ] Click "Start Review" → verify status changes to under_review
- [ ] Click "Accept" → verify approval flow (if requireApprovalForAcceptance=true)
- [ ] Test direct acceptance (set requireApprovalForAcceptance=false in tenant settings)
- [ ] Click "Reject" on another application → verify status changes
- [ ] Test withdraw flow

### 4.4 Application-to-Student Conversion

- [ ] Accept an application
- [ ] Click "Convert to Student"
- [ ] Verify pre-populated fields (student name, DOB, parent info)
- [ ] If parent email matches existing → verify "Link to existing" option shows
- [ ] Select year group from dropdown
- [ ] Fill any missing required fields
- [ ] Submit conversion
- [ ] Verify student appears in Students list with status=active
- [ ] Verify household created with needs_completion=true
- [ ] Verify parent linked to student and household
- [ ] Verify conversion note added to application

### 4.5 Duplicate Detection

- [ ] Submit two applications with same student_first_name + student_last_name + date_of_birth
- [ ] Verify internal note created flagging potential duplicate
- [ ] Verify both submissions succeed (no blocking)

### 4.6 Analytics

- [ ] Navigate to Admissions → Analytics
- [ ] Verify funnel chart shows correct counts per status
- [ ] Verify summary cards (total, conversion rate, avg days)
- [ ] Test with date range filter

### 4.7 Parent Portal

- [ ] Log in as parent
- [ ] Navigate to "My Applications"
- [ ] Verify only own applications visible
- [ ] Click to view application detail
- [ ] Verify internal notes are NOT visible
- [ ] Verify parent can withdraw own draft/submitted application

### 4.8 Bilingual/RTL

- [ ] Test all pages in Arabic locale
- [ ] Verify all text is translated
- [ ] Verify layout mirrors correctly (RTL)
- [ ] Verify form builder field cards align correctly in RTL
- [ ] Verify data tables align correctly in RTL
- [ ] Verify phone/email/application number inputs maintain LTR
