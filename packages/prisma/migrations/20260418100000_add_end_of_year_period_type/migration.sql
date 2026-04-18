-- Add `end_of_year` to the AcademicPeriodType enum.
--
-- This is not a regular period alongside term/semester/quarter. A period
-- marked `end_of_year` is understood to span every period in the academic
-- year — it is the umbrella period used for end-of-year examinations and
-- final grade computation. How it interacts with the tenant's grade
-- weighting is decided by gradebook configuration, not by scheduling.

ALTER TYPE "AcademicPeriodType" ADD VALUE IF NOT EXISTS 'end_of_year';
