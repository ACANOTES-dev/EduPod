/**
 * Central registry: every subject adapter exported from this barrel is
 * auto-discovered by `ReportsSubjectRegistryService`. Add a new subject
 * by (1) creating the `<key>.ts` file with a `buildAdapter(...)` call
 * and (2) adding it to the default-exported map below.
 *
 * The key on the map is the `ReportSubjectKey` — same as the adapter's
 * `descriptor.key`. Enforcing this as a map rather than an array keeps
 * lookup O(1) and guarantees every subject is discoverable by its key.
 */
import type { ReportSubjectKey } from '@school/shared/reports';

import type { SubjectAdapter } from '../subject-adapter';

import { APPLICATION_ADAPTER } from './application';
import { ATTENDANCE_RECORD_ADAPTER } from './attendance-record';
import { BEHAVIOUR_INCIDENT_ADAPTER } from './behaviour-incident';
import { CLASS_ADAPTER } from './class';
import { GRADE_ADAPTER } from './grade';
import { HOUSEHOLD_ADAPTER } from './household';
import { INVOICE_ADAPTER } from './invoice';
import { PAYROLL_ENTRY_ADAPTER } from './payroll-entry';
import { SAFEGUARDING_CONCERN_ADAPTER } from './safeguarding-concern';
import { STAFF_ADAPTER } from './staff';
import { STUDENT_ADAPTER } from './student';

export const SUBJECT_ADAPTERS: Readonly<Record<ReportSubjectKey, SubjectAdapter>> = {
  student: STUDENT_ADAPTER,
  staff: STAFF_ADAPTER,
  household: HOUSEHOLD_ADAPTER,
  class: CLASS_ADAPTER,
  invoice: INVOICE_ADAPTER,
  application: APPLICATION_ADAPTER,
  behaviour_incident: BEHAVIOUR_INCIDENT_ADAPTER,
  safeguarding_concern: SAFEGUARDING_CONCERN_ADAPTER,
  attendance_record: ATTENDANCE_RECORD_ADAPTER,
  grade: GRADE_ADAPTER,
  payroll_entry: PAYROLL_ENTRY_ADAPTER,
};
