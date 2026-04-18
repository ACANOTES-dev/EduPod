-- Exempt `end_of_year` periods from the date-range overlap exclusion.
--
-- The original `excl_academic_periods_overlap` constraint forbids any two
-- periods within a tenant+academic_year from sharing a date range. That's
-- correct for term/semester/quarter/custom periods, which by definition
-- partition the year.
--
-- An `end_of_year` period is different: it is an umbrella period covering
-- the whole academic year and must coexist with every other period. It is
-- how the tenant expresses "final grade at year end" without having to
-- retrofit the existing period-based grade-weighting machinery. Whether
-- the EOY period is the sole determinant of the final grade, or a weighted
-- component alongside S1/S2, is a gradebook configuration concern — the
-- schema just needs to let both coexist.
--
-- We therefore drop the old constraint and recreate it scoped to the four
-- partitioning types only. Two end_of_year periods still can't overlap
-- each other (the dedup happens via the existing UNIQUE(tenant_id,
-- academic_year_id, name) index, and tenants naturally only want one).

ALTER TABLE academic_periods DROP CONSTRAINT IF EXISTS excl_academic_periods_overlap;

ALTER TABLE academic_periods ADD CONSTRAINT excl_academic_periods_overlap EXCLUDE USING gist (
  tenant_id WITH =,
  academic_year_id WITH =,
  daterange(start_date, end_date, '[]') WITH &&
) WHERE (period_type <> 'end_of_year');
