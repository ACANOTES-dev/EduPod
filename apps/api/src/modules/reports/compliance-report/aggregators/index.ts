import type { AggregatorRegistry } from '../aggregator.types';

import { attendanceRateAnnualAggregator } from './attendance-rate-annual.aggregator';
import { chronicAbsenteeismCountAggregator } from './chronic-absenteeism-count.aggregator';
import { criticalIncidentsThisYearAggregator } from './critical-incidents-this-year.aggregator';
import { exclusionsThisYearAggregator } from './exclusions-this-year.aggregator';
import { feesCollectedYtdAggregator } from './fees-collected-ytd.aggregator';
import { instructionHoursHeldAggregator } from './instruction-hours-held.aggregator';
import { outstandingBalanceTotalAggregator } from './outstanding-balance-total.aggregator';
import { pupilTeacherRatioAggregator } from './pupil-teacher-ratio.aggregator';
import { qualifiedTeachersPercentAggregator } from './qualified-teachers-percent.aggregator';
import { safeguardingConcernsRaisedAggregator } from './safeguarding-concerns-raised.aggregator';
import { schoolDaysHeldAggregator } from './school-days-held.aggregator';
import { senRegisterCountAggregator } from './sen-register-count.aggregator';
import { staffAbsenceRateAnnualAggregator } from './staff-absence-rate-annual.aggregator';
import { staffHeadcountAggregator } from './staff-headcount.aggregator';
import { studentHeadcountAggregator } from './student-headcount.aggregator';
import { teacherAbsenceDaysUncoveredAggregator } from './teacher-absence-days-uncovered.aggregator';
import { teacherHeadcountAggregator } from './teacher-headcount.aggregator';
import { vettingCurrentPercentAggregator } from './vetting-current-percent.aggregator';
import { writeOffsYtdAggregator } from './write-offs-ytd.aggregator';

/**
 * Central registry of every field key → aggregator binding. Typed as
 * `AggregatorRegistry` so a new field key without an aggregator will
 * fail `turbo type-check` rather than at runtime.
 */
export const COMPLIANCE_AGGREGATORS: AggregatorRegistry = {
  student_headcount: studentHeadcountAggregator,
  attendance_rate_annual: attendanceRateAnnualAggregator,
  chronic_absenteeism_count: chronicAbsenteeismCountAggregator,
  exclusions_this_year: exclusionsThisYearAggregator,
  sen_register_count: senRegisterCountAggregator,
  safeguarding_concerns_raised_this_year: safeguardingConcernsRaisedAggregator,
  critical_incidents_this_year: criticalIncidentsThisYearAggregator,
  staff_headcount: staffHeadcountAggregator,
  teacher_headcount: teacherHeadcountAggregator,
  pupil_teacher_ratio: pupilTeacherRatioAggregator,
  qualified_teachers_percent: qualifiedTeachersPercentAggregator,
  vetting_current_percent: vettingCurrentPercentAggregator,
  staff_absence_rate_annual: staffAbsenceRateAnnualAggregator,
  fees_collected_ytd: feesCollectedYtdAggregator,
  outstanding_balance_total: outstandingBalanceTotalAggregator,
  write_offs_ytd: writeOffsYtdAggregator,
  school_days_held: schoolDaysHeldAggregator,
  instruction_hours_held: instructionHoursHeldAggregator,
  teacher_absence_days_uncovered: teacherAbsenceDaysUncoveredAggregator,
};

export {
  attendanceRateAnnualAggregator,
  chronicAbsenteeismCountAggregator,
  criticalIncidentsThisYearAggregator,
  exclusionsThisYearAggregator,
  feesCollectedYtdAggregator,
  instructionHoursHeldAggregator,
  outstandingBalanceTotalAggregator,
  pupilTeacherRatioAggregator,
  qualifiedTeachersPercentAggregator,
  safeguardingConcernsRaisedAggregator,
  schoolDaysHeldAggregator,
  senRegisterCountAggregator,
  staffAbsenceRateAnnualAggregator,
  staffHeadcountAggregator,
  studentHeadcountAggregator,
  teacherAbsenceDaysUncoveredAggregator,
  teacherHeadcountAggregator,
  vettingCurrentPercentAggregator,
  writeOffsYtdAggregator,
};
