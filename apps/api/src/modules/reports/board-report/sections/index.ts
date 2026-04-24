/**
 * Barrel re-export for the Board Report aggregators (impl 06). Replaces
 * the empty-class placeholder that impl 05 shipped to unblock CI.
 * Importers pull everything from this file so individual aggregator
 * files stay internal to the folder and can be re-organised without
 * cascading import changes.
 */
export * from './section-aggregator.types';
export { ExecutiveSummarySectionAggregator } from './executive-summary.aggregator';
export { EnrolmentSectionAggregator } from './enrolment.aggregator';
export { AttendanceSectionAggregator } from './attendance.aggregator';
export { AcademicSectionAggregator } from './academic.aggregator';
export { BehaviourSectionAggregator } from './behaviour.aggregator';
export { SafeguardingSectionAggregator } from './safeguarding.aggregator';
export { FinanceSectionAggregator } from './finance.aggregator';
export { StaffingSectionAggregator } from './staffing.aggregator';
