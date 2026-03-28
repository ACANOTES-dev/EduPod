# SEN Sub-Plan 05 — Professional Involvement + Accommodations

## Overview

External professional tracking (educational psychologists, speech therapists, SENO, NEPS, etc.) with optional Pastoral module referral linking, and exam/classroom accommodation records.

**Depends on**: Sub-plan 02 (SEN profiles must exist).

---

## Proposed Changes

### Backend Files

#### [NEW] Additional files in `apps/api/src/modules/sen/`

```
├── dto/
│   ├── create-professional-involvement.dto.ts
│   ├── update-professional-involvement.dto.ts
│   ├── create-accommodation.dto.ts
│   └── update-accommodation.dto.ts
├── sen-professional.controller.ts
├── sen-professional.controller.spec.ts
├── sen-professional.service.ts
├── sen-professional.service.spec.ts
├── sen-accommodation.controller.ts
├── sen-accommodation.controller.spec.ts
├── sen-accommodation.service.ts
└── sen-accommodation.service.spec.ts
```

---

### Professional Involvement Service

#### [NEW] `sen-professional.service.ts`

| Method | Description |
|--------|-------------|
| `create(tenantId, profileId, dto)` | Add professional involvement record. If `pastoral_referral_id` is provided, validates that the referral exists and belongs to the same tenant. |
| `findAllByProfile(tenantId, profileId)` | List professional involvement for a student. Ordered by `referral_date` descending. |
| `update(tenantId, id, dto)` | Update professional record (dates, recommendations, status). |
| `delete(tenantId, id)` | Hard delete a professional record. |

**Pastoral integration**: The `pastoral_referral_id` is an optional FK to `pastoral_referrals`. This is a lightweight link — no module import required. The SEN service reads the FK via Prisma directly (same cross-module Prisma-direct pattern used by Behaviour, Reports, etc.). When present, the professional involvement record is linked to the referral that initiated it (e.g., a NEPS referral from the Pastoral SST process).

**Sensitive data gate**: Professional involvement records are only returned to users with `sen.view_sensitive` permission. Users with only `sen.view` see a count of professional involvements but not the details.

---

### Professional Involvement Controller

#### [NEW] `sen-professional.controller.ts`

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/sen/profiles/:profileId/professionals` | Add professional involvement record | `sen.manage` |
| GET | `v1/sen/profiles/:profileId/professionals` | List professional involvement for a student | `sen.view_sensitive` |
| PATCH | `v1/sen/professionals/:id` | Update professional record | `sen.manage` |
| DELETE | `v1/sen/professionals/:id` | Remove professional record | `sen.manage` |

---

### Accommodation Service

#### [NEW] `sen-accommodation.service.ts`

| Method | Description |
|--------|-------------|
| `create(tenantId, profileId, dto)` | Create accommodation record. |
| `findAllByProfile(tenantId, profileId)` | List accommodations for a student. Filters: `accommodation_type`, `is_active`. |
| `update(tenantId, id, dto)` | Update accommodation. |
| `delete(tenantId, id)` | Hard delete an accommodation record. |
| `getExamReport(tenantId, query)` | Exam accommodations report — aggregates all active exam accommodations by year group/class for RACE/SEC submissions. |

**JSONB `details` field**: The structure varies by `accommodation_type`:

```typescript
// Exam accommodations
z.object({
  exam_type: z.string().optional(),          // e.g. 'JC', 'LC', 'class_test'
  reader: z.boolean().default(false),
  scribe: z.boolean().default(false),
  extra_time_percent: z.number().min(0).max(100).default(0),
  separate_room: z.boolean().default(false),
  assistive_tech_details: z.string().optional(),
})

// Classroom accommodations
z.object({
  seating_preference: z.string().optional(),
  visual_aids: z.boolean().default(false),
  modified_work: z.boolean().default(false),
  additional_notes: z.string().optional(),
})

// Assistive technology
z.object({
  device_type: z.string().optional(),
  software: z.string().optional(),
  training_required: z.boolean().default(false),
  provided_by: z.string().optional(),
})
```

The Zod schema uses a discriminated union on `accommodation_type` to validate the correct `details` shape.

---

### Accommodation Controller

#### [NEW] `sen-accommodation.controller.ts`

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/sen/profiles/:profileId/accommodations` | Create accommodation record | `sen.manage` |
| GET | `v1/sen/profiles/:profileId/accommodations` | List accommodations for a student | `sen.view` |
| PATCH | `v1/sen/accommodations/:id` | Update accommodation | `sen.manage` |
| DELETE | `v1/sen/accommodations/:id` | Remove accommodation | `sen.manage` |
| GET | `v1/sen/accommodations/exam-report` | Exam accommodations report (for RACE/SEC) | `sen.admin` |

Note: `exam-report` is a static route and must be declared before any `:id` dynamic routes.

---

### Module Update

#### [MODIFY] `sen.module.ts`

Add `SenProfessionalService`, `SenAccommodationService`, `SenProfessionalController`, `SenAccommodationController`.

---

## Tests

#### `sen-professional.service.spec.ts`

- Create — success, profile not found, pastoral referral linking (valid + invalid referral ID)
- List — returns ordered by referral_date, sensitive data gate (user without `sen.view_sensitive`)
- Update — success, status transition
- Delete — success, not found

#### `sen-accommodation.service.spec.ts`

- Create — success for each accommodation type, JSONB details validation
- List — type filter, active filter
- Update — success
- Delete — success, not found
- Exam report — correct aggregation by year group, only active exam accommodations

---

## Verification

```bash
npx jest --config apps/api/jest.config.ts --testPathPattern="modules/sen" --verbose
npx turbo test
npx turbo type-check && npx turbo lint
```
