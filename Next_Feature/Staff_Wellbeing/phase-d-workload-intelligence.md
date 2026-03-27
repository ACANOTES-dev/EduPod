# Phase D: Workload Intelligence

**Module:** Staff Wellbeing & Workload Intelligence
**Master Spec:** `Next_Feature/Staff_Wellbeing/staff-wellbeing-spec-v1-master.md`
**Identity:** The operational intelligence layer. Reads existing scheduling data — creates no new tables.
**Dependencies:** Phase A (module skeleton), existing `Schedule` + `SubstitutionRecord` + `SchedulePeriodTemplate` tables
**Blocks:** Phase E (staff frontend), Phase F (admin frontend)
**Parallel with:** Phases B and C (zero code overlap)

---

## Prerequisites

- Phase A complete and verified
- Read master spec Sections 5 (V1 scope — workload components), 6.2 (Existing Tables — Read-Only Usage), 7 (API Endpoints — Personal + Aggregate Workload), 9.1 (Worker Jobs — compute-workload-metrics)
- Read `architecture/module-blast-radius.md` — verify read-only dependencies on Scheduling, Substitution
- Understand the existing `Schedule` model (period assignments per teacher per day) and `SubstitutionRecord` model (cover duties, absences)

---

## Deliverables

### D1. Workload Computation Service

**Service:** `apps/api/src/modules/staff-wellbeing/services/workload.service.ts`

Core computation engine that reads from existing tables (read-only, no writes). All computations are pure functions over scheduling data.

**Data sources (all read-only):**

| Metric | Source Table(s) |
|--------|----------------|
| Teaching periods per week | `Schedule` (count of assigned periods for current timetable) |
| Cover duties this term | `SubstitutionRecord` (count where teacher was the cover teacher) |
| Consecutive teaching periods | `Schedule` + `SchedulePeriodTemplate` (sequence analysis of assigned periods per day) |
| Free period distribution | `Schedule` + `SchedulePeriodTemplate` (gaps between teaching periods per day) |
| Split timetable detection | `Schedule` (days where teacher has morning + afternoon blocks with large gap) |
| Room changes per day | `Schedule` (count distinct rooms per teacher per day, minus 1) |
| Absence days (proxy) | `SubstitutionRecord` (days where teacher was absent and covered) |

### D2. Personal Workload Dashboard Endpoints

All personal endpoints are **self-only** — a teacher can only see their own data. No permission key required beyond authentication. The endpoint reads the authenticated user's `staff_profile_id` and returns data only for that person.

#### Personal Workload Summary
- `GET /api/v1/staff-wellbeing/my-workload/summary`
- Returns:
  - Teaching periods per week (current timetable)
  - Cover duties this term (count + school average for comparison)
  - Timetable quality score (composite — see D4)
  - Trend: current vs previous term (if data exists)
  - Status indicator based on tenant thresholds: `normal | elevated | high` (against `workload_high_threshold_periods` and `workload_high_threshold_covers` from tenant settings)
- **Privacy:** This data is visible ONLY to the teacher themselves. No principal, no admin, no platform admin can access this endpoint for another user. No impersonation.

#### Personal Cover History
- `GET /api/v1/staff-wellbeing/my-workload/cover-history`
- Returns:
  - List of cover duties (date, period, subject, original teacher absent — anonymised as "Colleague")
  - Running total for current term
  - School average for comparison (aggregate, not named)
  - Trend over previous terms (if data exists)
- Paginated, sorted by date descending

#### Personal Timetable Quality
- `GET /api/v1/staff-wellbeing/my-workload/timetable-quality`
- Returns:
  - Free period distribution (histogram: how free periods are spread across the week)
  - Consecutive teaching periods (max and average per day)
  - Split days count (days with morning + afternoon blocks and large gap)
  - Room changes per day (average and max)
  - Comparison to school averages for each metric

### D3. Aggregate Workload Dashboard Endpoints

All aggregate endpoints require `wellbeing.view_aggregate` permission (principal/deputy).

#### School-Wide Workload Summary
- `GET /api/v1/staff-wellbeing/aggregate/workload-summary`
- Returns:
  - Average teaching periods per week across all staff
  - Range (min, max, percentiles: P25, P50, P75)
  - Over-allocated count: number of staff exceeding `workload_high_threshold_periods` (**count only, no names**)
  - Average cover duties per staff member this term
  - Over-allocated cover count: number exceeding `workload_high_threshold_covers` (**count only, no names**)
  - Trend vs previous term

#### Cover Fairness Analysis
- `GET /api/v1/staff-wellbeing/aggregate/cover-fairness`
- Returns:
  - Distribution curve: histogram of cover duties per staff member (x = cover count, y = number of staff at that count)
  - Gini coefficient (0 = perfectly equal, 1 = all covers on one person)
  - Range: min, max, median
  - Fairness assessment: computed from Gini + range
    - Gini < 0.15: "Well distributed"
    - Gini 0.15-0.30: "Moderate concentration"
    - Gini > 0.30: "Significant concentration — review recommended"
  - **Never identifies who has the most covers** — distribution only

**Gini coefficient computation:**
```
Sort cover counts ascending: [c1, c2, ..., cn]
Gini = (2 * sum(i * ci for i in 1..n)) / (n * sum(ci)) - (n + 1) / n
```
Standard formula. Well-tested against known distributions.

#### Aggregate Timetable Quality
- `GET /api/v1/staff-wellbeing/aggregate/timetable-quality`
- Returns:
  - Average consecutive teaching periods (school-wide)
  - Average free period clumping score
  - Split timetable percentage (% of staff with split days)
  - Average room changes per day
  - Each metric includes: mean, median, range
  - Trend vs previous term

#### Absence Trends (Aggregate)
- `GET /api/v1/staff-wellbeing/aggregate/absence-trends`
- Returns:
  - School-wide absence rate per month (from `SubstitutionRecord` as proxy — enriched with leave data in V2)
  - Day-of-week pattern (which days have highest absence rates — aggregate)
  - Term comparison (current vs previous)
  - Seasonal pattern (if 12+ months of data)
- **All aggregate** — no individual absence data in this module. Individual absence lives in leave management/HR.

#### Substitution Pressure Index
- `GET /api/v1/staff-wellbeing/aggregate/substitution-pressure`
- Returns composite score:
  - Components: absence rate, cover difficulty (ratio of absences requiring internal cover vs external sub), unfilled substitution rate
  - Composite score: weighted average (configurable weights, sensible defaults)
  - Trend over time (monthly data points)
  - Pressure assessment: "Low" | "Moderate" | "High" | "Critical" based on configurable thresholds
- This is the "executive summary" metric that principals care about most

#### Correlation View
- `GET /api/v1/staff-wellbeing/aggregate/correlation`
- **Master spec Section 3.4 rules apply strictly:**
  - Minimum 12 data points required (12 months of data)
  - If < 12 data points: return data accumulation state
    ```json
    {
      "status": "accumulating",
      "dataPoints": 4,
      "requiredDataPoints": 12,
      "projectedAvailableDate": "2027-01-01",
      "message": "Building your school's picture: 4 of 12 months collected. Trend analysis available from January 2027."
    }
    ```
  - If >= 12 data points: return correlation data
    ```json
    {
      "status": "available",
      "dataPoints": 14,
      "series": [
        { "month": "2026-03", "coverPressure": 0.72, "absenceRate": 0.08 },
        ...
      ],
      "trendDescription": "Months with higher cover duty loads were followed by higher staff absence the following month.",
      "disclaimer": "This shows patterns that occurred together. It does not prove that one caused the other. Use this as a starting point for investigation, not a conclusion."
    }
    ```
  - Language: always "these trends moved together" — NEVER "X caused Y"
  - Disclaimer: permanent, non-dismissable (enforced in frontend, but API includes it in response)
  - No confidence scores, no p-values, no R-squared

### D4. Timetable Quality Score (Composite)

Used in personal dashboard (D2) and aggregate dashboard (D3). Composite score from:

| Component | Weight | Scoring |
|-----------|--------|---------|
| Free period distribution | 30% | Even spread = high score, all clumped = low |
| Consecutive periods | 30% | Fewer consecutive = higher score. Max 5+ consecutive = 0 |
| Split timetable | 20% | No splits = high score |
| Room changes | 20% | Fewer changes = higher score |

Score: 0-100 scale. Thresholds for display:
- 80-100: "Good"
- 60-79: "Moderate"
- Below 60: "Needs attention"

These thresholds are informational only — not used for individual assessment or alerting.

### D5. Daily Aggregate Caching Cron

**Job:** `wellbeing:compute-workload-metrics`
**Trigger:** Daily cron 04:00 UTC
**Payload:** none (processes all tenants with `staff_wellbeing` enabled)

**Behaviour:**
- For each tenant: compute all aggregate metrics (D3 — workload summary, cover fairness, timetable quality, absence trends, substitution pressure)
- Store in Redis with key pattern: `wellbeing:aggregate:{tenantId}:{metricType}`
- TTL: 24 hours (refreshed daily)
- Aggregate endpoints read from cache; if cache miss, compute on-demand and cache

**Personal metrics (D2):** Computed on-demand per request, cached in Redis with 5-minute TTL. Key pattern: `wellbeing:personal:{tenantId}:{staffProfileId}:{metricType}`

### D6. Board Report Generation

- `GET /api/v1/staff-wellbeing/reports/termly-summary`
- Permission: `wellbeing.view_board_report`
- Returns pre-rendered aggregate summary suitable for Board of Management:
  - Workload distribution summary (averages, ranges — no names)
  - Cover fairness overview (Gini, distribution shape)
  - Timetable quality overview
  - Substitution pressure trend
  - Survey trends (if surveys have been conducted — aggregated scores across cycles)
  - Absence pattern summary
  - Correlation insight (if 12+ months available)
- Format: JSON (for frontend rendering) + PDF download via existing Puppeteer pipeline
- **Board role sees ONLY this endpoint** — no dashboard access, no drill-down, no raw data
- Audit-logged: who generated it and when

---

## Unit Tests

| Test | Assertion |
|------|-----------|
| Teaching period count | Correct count from known Schedule data |
| Cover duty count | Correct count from known SubstitutionRecord data |
| Consecutive period detection | Correctly identifies sequences of 3, 4, 5+ consecutive periods |
| Free period distribution | Even distribution scores higher than clumped |
| Split timetable detection | Correctly identifies morning/afternoon gap pattern |
| Room change count | Correct count of distinct rooms per day minus 1 |
| Gini coefficient (perfect equality) | Returns 0.0 for [5, 5, 5, 5, 5] |
| Gini coefficient (perfect inequality) | Returns close to 1.0 for [0, 0, 0, 0, 25] |
| Gini coefficient (moderate) | Returns ~0.2 for typical school distribution |
| Timetable quality composite | Correct weighted score from known components |
| Substitution pressure index | Correct composite from known inputs |
| Correlation (< 12 months) | Returns accumulating state with correct count and projected date |
| Correlation (>= 12 months) | Returns series data with disclaimer |
| Over-allocated count | Correct count against threshold (count only, no identifiers) |
| Cover fairness assessment | Correct text for Gini ranges (< 0.15, 0.15-0.30, > 0.30) |
| Personal endpoint isolation | Returns only authenticated user's data |
| Aggregate caching | Cached values match freshly computed values |
| Cache miss fallback | On-demand computation when cache is empty |
| Board report | Contains all sections, no individual data |

## Integration Tests

| Test | Assertion |
|------|-----------|
| **Personal data isolation** | Staff A calls /my-workload/summary → verify data is for Staff A only, not Staff B |
| **Aggregate correctness** | Insert known Schedule data for 10 teachers → compute aggregate → verify averages/ranges match hand-calculated values |
| **Over-allocated count accuracy** | Set threshold to 20 periods, insert 5 teachers above and 10 below → verify count = 5 |
| **Cover fairness end-to-end** | Insert known cover distribution → verify Gini, range, and assessment text |
| **Correlation accumulation** | Insert 6 months of data → verify "accumulating" → insert 6 more → verify "available" |
| **Tenant isolation** | Compute aggregates for Tenant A → auth as Tenant B → verify B sees only B's data |
| **Board report generation** | Generate report → verify PDF renders → verify no individual data in PDF |

---

## Verification Checklist

- [ ] Personal workload summary returns correct data for authenticated user only
- [ ] Personal cover history shows "Colleague" (not teacher names) for absent teachers
- [ ] Aggregate workload summary shows ranges, averages, over-allocated counts (no names)
- [ ] Cover fairness Gini coefficient verified against known distributions
- [ ] Timetable quality composite score computed correctly
- [ ] Absence trends aggregate only (no individual data)
- [ ] Substitution pressure index computes and trends correctly
- [ ] Correlation returns accumulation state when < 12 data points
- [ ] Correlation returns data with disclaimer when >= 12 data points
- [ ] Correlation language: "trends moved together" — never causal
- [ ] Daily cron caches aggregate metrics for all tenants
- [ ] Personal metrics cached with 5min TTL
- [ ] Board report contains all sections, no individual data, renders to PDF
- [ ] No personal workload endpoint is accessible by anyone other than the teacher themselves
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] `turbo lint` passes
- [ ] `turbo type-check` passes
- [ ] `architecture/event-job-catalog.md` updated with compute-workload-metrics cron
