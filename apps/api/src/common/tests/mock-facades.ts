/**
 * Shared mock providers for all ReadFacade classes.
 *
 * Usage in test files:
 *   import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
 *   ...
 *   Test.createTestingModule({ providers: [...MOCK_FACADE_PROVIDERS, ...otherProviders] })
 *
 * Each facade is provided as a Proxy-based auto-mock: any method call returns a
 * jest.fn() that resolves to a sensible default ([] for find/list, 0 for count,
 * null otherwise). For tests that need specific return values, override the
 * individual provider after spreading:
 *   providers: [
 *     ...MOCK_FACADE_PROVIDERS,
 *     { provide: StudentReadFacade, useValue: { findOne: jest.fn().mockResolvedValue(mockStudent) } },
 *   ]
 */

import { type Provider } from '@nestjs/common';

import { AcademicReadFacade } from '../../modules/academics/academic-read.facade';
import { AdmissionsReadFacade } from '../../modules/admissions/admissions-read.facade';
import { ApprovalsReadFacade } from '../../modules/approvals/approvals-read.facade';
import { AttendanceReadFacade } from '../../modules/attendance/attendance-read.facade';
import { AuditLogReadFacade } from '../../modules/audit-log/audit-log-read.facade';
import { AuthReadFacade } from '../../modules/auth/auth-read.facade';
import { BehaviourReadFacade } from '../../modules/behaviour/behaviour-read.facade';
import { ChildProtectionReadFacade } from '../../modules/child-protection/child-protection-read.facade';
import { ClassesReadFacade } from '../../modules/classes/classes-read.facade';
import { CommunicationsReadFacade } from '../../modules/communications/communications-read.facade';
import { ConfigurationReadFacade } from '../../modules/configuration/configuration-read.facade';
import { FinanceReadFacade } from '../../modules/finance/finance-read.facade';
import { GdprReadFacade } from '../../modules/gdpr/gdpr-read.facade';
import { GradebookReadFacade } from '../../modules/gradebook/gradebook-read.facade';
import { HouseholdReadFacade } from '../../modules/households/household-read.facade';
import { ParentInquiriesReadFacade } from '../../modules/parent-inquiries/parent-inquiries-read.facade';
import { ParentReadFacade } from '../../modules/parents/parent-read.facade';
import { PastoralReadFacade } from '../../modules/pastoral/pastoral-read.facade';
import { PayrollReadFacade } from '../../modules/payroll/payroll-read.facade';
import { RbacReadFacade } from '../../modules/rbac/rbac-read.facade';
import { RoomsReadFacade } from '../../modules/rooms/rooms-read.facade';
import { SchedulesReadFacade } from '../../modules/schedules/schedules-read.facade';
import { SchedulingReadFacade } from '../../modules/scheduling/scheduling-read.facade';
import { SchedulingRunsReadFacade } from '../../modules/scheduling-runs/scheduling-runs-read.facade';
import { SchoolClosuresReadFacade } from '../../modules/school-closures/school-closures-read.facade';
import { StaffAvailabilityReadFacade } from '../../modules/staff-availability/staff-availability-read.facade';
import { StaffPreferencesReadFacade } from '../../modules/staff-preferences/staff-preferences-read.facade';
import { StaffProfileReadFacade } from '../../modules/staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../../modules/students/student-read.facade';
import { TenantReadFacade } from '../../modules/tenants/tenant-read.facade';
import { WebsiteReadFacade } from '../../modules/website/website-read.facade';

// ─── Auto-mock factory ────────────────────────────────────────────────────────

const fnCache = new Map<string, jest.Mock>();

function createAutoMockFacade(): Record<string, jest.Mock> {
  return new Proxy({} as Record<string, jest.Mock>, {
    get(_target, prop: string) {
      if (prop === 'then') return undefined; // Prevent Promise resolution
      if (!fnCache.has(prop)) {
        const lp = prop.toLowerCase();
        let defaultReturn: unknown = null;
        if (
          lp.includes('findmany') ||
          lp.includes('list') ||
          lp.includes('getall') ||
          lp.includes('findall') ||
          lp.includes('search')
        )
          defaultReturn = [];
        else if (lp.includes('count')) defaultReturn = 0;
        else if (
          lp.includes('findmap') ||
          lp.includes('map') ||
          lp.includes('byclasses') ||
          lp.includes('byids')
        )
          defaultReturn = new Map();
        // System-user auto-creation flows call findPrimaryDomain and
        // feed it into buildLoginEmail; default to a valid domain so
        // tests don't need to override this everywhere.
        else if (lp === 'findprimarydomain') defaultReturn = 'test.edupod.app';
        fnCache.set(prop, jest.fn().mockResolvedValue(defaultReturn));
      }
      return fnCache.get(prop);
    },
  });
}

// ─── Mock provider array ──────────────────────────────────────────────────────

const FACADE_CLASSES = [
  AcademicReadFacade,
  AdmissionsReadFacade,
  ApprovalsReadFacade,
  AttendanceReadFacade,
  AuditLogReadFacade,
  AuthReadFacade,
  BehaviourReadFacade,
  ChildProtectionReadFacade,
  ClassesReadFacade,
  CommunicationsReadFacade,
  ConfigurationReadFacade,
  FinanceReadFacade,
  GdprReadFacade,
  GradebookReadFacade,
  HouseholdReadFacade,
  ParentInquiriesReadFacade,
  ParentReadFacade,
  PastoralReadFacade,
  PayrollReadFacade,
  RbacReadFacade,
  RoomsReadFacade,
  SchedulesReadFacade,
  SchedulingRunsReadFacade,
  SchedulingReadFacade,
  SchoolClosuresReadFacade,
  StaffAvailabilityReadFacade,
  StaffPreferencesReadFacade,
  StaffProfileReadFacade,
  StudentReadFacade,
  TenantReadFacade,
  WebsiteReadFacade,
] as const;

export const MOCK_FACADE_PROVIDERS: Provider[] = FACADE_CLASSES.map((cls) => ({
  provide: cls,
  useFactory: () => createAutoMockFacade(),
}));

// ─── Individual re-exports for targeted mocking ───────────────────────────────

export {
  AcademicReadFacade,
  AdmissionsReadFacade,
  ApprovalsReadFacade,
  AttendanceReadFacade,
  AuditLogReadFacade,
  AuthReadFacade,
  BehaviourReadFacade,
  ChildProtectionReadFacade,
  ClassesReadFacade,
  CommunicationsReadFacade,
  ConfigurationReadFacade,
  FinanceReadFacade,
  GdprReadFacade,
  GradebookReadFacade,
  HouseholdReadFacade,
  ParentInquiriesReadFacade,
  ParentReadFacade,
  PastoralReadFacade,
  PayrollReadFacade,
  RbacReadFacade,
  RoomsReadFacade,
  SchedulesReadFacade,
  SchedulingRunsReadFacade,
  SchedulingReadFacade,
  SchoolClosuresReadFacade,
  StaffAvailabilityReadFacade,
  StaffPreferencesReadFacade,
  StaffProfileReadFacade,
  StudentReadFacade,
  TenantReadFacade,
  WebsiteReadFacade,
};
