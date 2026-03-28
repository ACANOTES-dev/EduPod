# SEN Sub-Plan 06 — Compliance Reporting + Transition Planning

## Overview

NCSE compliance reporting (aggregated SEN statistics), operational reports (overdue reviews, resource utilisation, professional involvement status), and student transition documentation using the dedicated `SenTransitionNote` table.

**Depends on**: Sub-plans 02–05 (all SEN data must be populated for meaningful reports).

---

## Proposed Changes

### Backend Files

#### [NEW] Additional files in `apps/api/src/modules/sen/`

```
├── dto/
│   ├── create-transition-note.dto.ts
│   └── sen-report-query.dto.ts
├── sen-reports.controller.ts
├── sen-reports.controller.spec.ts
├── sen-reports.service.ts
├── sen-reports.service.spec.ts
├── sen-transition.controller.ts
├── sen-transition.controller.spec.ts
├── sen-transition.service.ts
└── sen-transition.service.spec.ts
```

---

### Reports Service

#### [NEW] `sen-reports.service.ts`

| Method | Description |
|--------|-------------|
| `getNcseReturn(tenantId, query)` | NCSE return data — aggregated statistics by category, support level, year group, gender. Intended for the annual NCSE return submission. |
| `getOverviewReport(tenantId, query)` | SEN overview — breakdown by primary category, support level, year group. Filterable by academic year. |
| `getResourceUtilisation(tenantId, query)` | Resource allocation vs. utilisation report — hours allocated (SENO + school) vs. assigned vs. used, by year group and student. |
| `getPlanCompliance(tenantId, query)` | Plans due for review (`next_review_date` approaching), overdue plans (past `next_review_date`), goals with no progress in X weeks. |
| `getProfessionalInvolvementReport(tenantId)` | Pending referrals, completed assessments, reports received — aggregated by professional type and status. |

**NCSE return data shape**:
```typescript
{
  academic_year: string;
  total_sen_students: number;
  by_category: Array<{ category: SenCategory; count: number }>;
  by_support_level: Array<{ level: SenSupportLevel; count: number }>;
  by_year_group: Array<{ year_group_id: string; year_group_name: string; count: number }>;
  by_gender: Array<{ gender: string; count: number }>;
  resource_hours: {
    seno_allocated: number;
    school_allocated: number;
    total_assigned: number;
    total_used: number;
  };
  sna_count: number;
  accommodation_count: number;
}
```

**Plan compliance query**:
- `due_within_days` — plans with `next_review_date` within N days (default: 14)
- `overdue` — plans where `next_review_date < today` and `status = 'active'`
- `stale_goals` — goals with `status = 'in_progress'` and no `SenGoalProgress` entry in the last N weeks (configurable, default: 4)

---

### Reports Controller

#### [NEW] `sen-reports.controller.ts`

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| GET | `v1/sen/reports/ncse-return` | NCSE return data | `sen.admin` |
| GET | `v1/sen/reports/overview` | SEN overview by category/level/year group | `sen.view` |
| GET | `v1/sen/reports/resource-utilisation` | Resource allocation vs. utilisation | `sen.admin` |
| GET | `v1/sen/reports/plan-compliance` | Plans due for review, overdue goals | `sen.view` |
| GET | `v1/sen/reports/professional-involvement` | Pending referrals, completed assessments | `sen.admin` |

---

### Transition Service

#### [NEW] `sen-transition.service.ts`

| Method | Description |
|--------|-------------|
| `createNote(tenantId, profileId, dto, userId)` | Add a transition note (class-to-class, year-to-year, school-to-school). |
| `findNotes(tenantId, profileId)` | List transition notes for a student, ordered by `created_at` descending. |
| `generateHandoverPack(tenantId, studentId)` | Generate a comprehensive transition handover pack combining: SEN profile summary, active support plan with goals + progress, current accommodations, professional involvement history, transition notes. Returns structured JSON (not PDF — PDF generation deferred). |

**Handover pack structure**:
```typescript
{
  student: { name, date_of_birth, year_group };
  sen_profile: { primary_category, support_level, is_active, flagged_date, diagnosis? };
  active_plan: {
    plan_number, status, goals: Array<{
      title, target, baseline, current_level, status,
      strategies: Array<{ description, responsible, frequency }>,
      latest_progress: Array<{ note, current_level, recorded_at }>,
    }>,
  } | null;
  accommodations: Array<{ type, description, is_active }>;
  professionals: Array<{ type, name, organisation, status, recommendations }>;
  transition_notes: Array<{ note_type, content, created_at }>;
  resource_hours: { allocated, used } | null;
  sna_assignment: { sna_name, schedule, start_date } | null;
}
```

> Professional data in the handover pack is included since it's intended for the receiving school/class teacher (who has been granted access by the sending school). This is a deliberate information-sharing mechanism.

**Note types** (validated by Zod enum):
- `class_to_class` — within-school class transitions
- `year_to_year` — end-of-year transitions
- `school_to_school` — school transfer documentation
- `general` — catch-all for other transition notes

---

### Transition Controller

#### [NEW] `sen-transition.controller.ts`

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/sen/profiles/:profileId/transition-notes` | Add transition note | `sen.manage` |
| GET | `v1/sen/profiles/:profileId/transition-notes` | List transition notes | `sen.view` |
| GET | `v1/sen/transition/handover-pack/:studentId` | Generate transition handover pack | `sen.manage` |

Note: `handover-pack` is a static route segment under `v1/sen/transition/` and must be declared before any dynamic routes in the same controller.

---

### Module Update

#### [MODIFY] `sen.module.ts`

Add `SenReportsService`, `SenTransitionService`, `SenReportsController`, `SenTransitionController`.

---

## Tests

#### `sen-reports.service.spec.ts`

- NCSE return — correct aggregation, empty data handling
- Overview — category/level/year group breakdown
- Resource utilisation — correct calculation
- Plan compliance — due/overdue/stale goal detection
- Professional involvement — grouped by type and status

#### `sen-transition.service.spec.ts`

- Create note — success, profile not found
- List notes — correct ordering
- Handover pack — assembles all data correctly, handles missing data (no plan, no accommodations, etc.), professional data inclusion

---

## Verification

```bash
npx jest --config apps/api/jest.config.ts --testPathPattern="modules/sen" --verbose
npx turbo test
npx turbo type-check && npx turbo lint
```
