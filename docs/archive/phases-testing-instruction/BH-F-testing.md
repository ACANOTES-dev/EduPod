# Phase F: Analytics + AI — Testing Instructions

## Unit Tests

### Pulse Calculations (14 tests in `behaviour-pulse.service.spec.ts`)

- `should return composite = null when reporting_confidence < 0.50`
- `should return composite score when reporting_confidence >= 0.50`
- `should return null when any dimension is null`
- `should apply weights 20/25/25/15/15 to composite`
- `should compute weighted average correctly`
- `should return composite = null when reporting_confidence is null`
- `should return composite = null when reporting_confidence is exactly 0.50 - epsilon`
- `should return composite when reporting_confidence is exactly 0.50`
- Graduated decay curve: rate=0 → 1.0, rate=0.5 → 0.8, rate=2.0 → 0.4, rate=5.0 → 0.1, rate>5.0 → 0.0

### anonymiseForAI (13 tests in `anonymise.spec.ts`)

- `should replace student names with sequential tokens Student-A, Student-B`
- `should replace staff names with role titles when available`
- `should remove all UUID values from input`
- `should remove context_notes field`
- `should remove send_notes and send_aware fields`
- `should remove safeguarding-related fields`
- `should return tokenMap mapping tokens to original identities`
- `should not mutate the original input object`
- `should handle nested objects recursively`
- `should handle arrays recursively`
- `deAnonymiseFromAI: should replace tokens with real identities in response text`
- `deAnonymiseFromAI: should handle empty tokenMap`
- `deAnonymiseFromAI: should replace multiple occurrences of the same token`

## Integration Tests (to be written)

### AI Feature Gates

- `should return 403 when ai_nl_query_enabled = false`
- `should return 403 when ai_insights_enabled = false and requesting narrative`
- `should fall back gracefully when AI provider unavailable`
- `should return graceful fallback when both AI providers unavailable`

### Exposure Analytics

- `should return raw counts when exposure data unavailable, with warning flag`
- `should use historical exposure snapshot matching occurred_at date`
- `should include data_quality.exposure_normalised = false flag when no scheduling data`

### RLS Leakage

- `RLS: behaviour_alerts from tenant A not visible to tenant B`
- `RLS: behaviour_alert_recipients from tenant A not visible to tenant B`
- `RLS: mv_student_behaviour_summary scoped to correct tenant`

### ETB Panel

- `ETB panel: should not include opted-out tenant data`
- `ETB panel: should suppress data points below benchmark_min_cohort_size`
- `ETB panel: should not expose student-level data in any response`

### Permission Tests

- `should return 403 for analytics/staff without behaviour.view_staff_analytics`
- `should return 403 for analytics/policy-effectiveness without behaviour.admin`
- `should return 403 for analytics/ai-query without behaviour.ai_query permission`
- `should respect scope: class-scope user cannot query other classes in AI`

## Manual QA Checklist

### Pulse Dashboard

- [ ] Navigate to `/behaviour/analytics` — pulse widget shows 5 dimension gauges
- [ ] Verify composite score appears only when reporting confidence >= 50%
- [ ] Verify pulse hidden when `behaviour_pulse_enabled = false` in settings
- [ ] Toggle date range — analytics update accordingly
- [ ] Toggle exposure normalised — subject rates switch between raw/normalised

### Analytics Charts

- [ ] Trend chart shows positive/negative lines
- [ ] Heatmap shows weekday x period grid with colour coding
- [ ] Category breakdown shows horizontal bars sorted by count
- [ ] Year group comparison shows positive/negative bars side by side
- [ ] Subject table shows rate per 100 teaching periods (or raw with warning)
- [ ] All sections responsive at mobile widths (375px)

### AI Query Page

- [ ] Navigate to `/behaviour/analytics/ai` — query input visible
- [ ] Type a question and submit — AI response appears with labels
- [ ] Verify "AI-generated — verify critical findings" label on all responses
- [ ] Verify "Data as of [timestamp]" label
- [ ] Click a suggested query chip — populates the input
- [ ] Query history panel shows previous queries (collapsible on mobile)
- [ ] Submit empty query — button disabled
- [ ] Verify 500 character limit on input

### Alerts Page

- [ ] Navigate to `/behaviour/alerts` — shows alert list
- [ ] Filter by tabs: All / Unseen / Acknowledged / Snoozed / Resolved
- [ ] Click Acknowledge on an alert — status updates
- [ ] Click Snooze — date picker appears, snooze applies
- [ ] Click Resolve — alert moves to resolved tab
- [ ] Click Dismiss — prompt for optional reason
- [ ] Expand data snapshot — shows JSON evidence
- [ ] Mobile: actions collapse to icon buttons
- [ ] Badge count shows in navigation

### RTL (Arabic)

- [ ] All 3 pages render correctly in RTL mode
- [ ] Charts and heatmap align properly
- [ ] AI query input detects Arabic text direction
- [ ] Alert cards mirror correctly with severity icons on the correct side
