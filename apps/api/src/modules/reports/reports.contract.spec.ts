import { ReportAlertsService } from './report-alerts.service';
import { ReportsDataAccessService } from './reports-data-access.service';
import { ReportsService } from './reports.service';
import { ScheduledReportsService } from './scheduled-reports.service';
import { UnifiedDashboardService } from './unified-dashboard.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract public method names from a class prototype (type-safe, no casts). */
function getPublicMethodNames(proto: object): string[] {
  return Object.getOwnPropertyNames(proto).filter(
    (name) =>
      name !== 'constructor' &&
      typeof Object.getOwnPropertyDescriptor(proto, name)?.value === 'function',
  );
}

// ─── Contract Tests ──────────────────────────────────────────────────────────
//
// These tests verify the public API surface of the ReportsModule's exported
// services. The ReportsModule has deep dependency chains (ConfigurationModule,
// GdprModule, RedisService, etc.) so we use prototype-based assertions for
// speed rather than full DI compilation.
// ─────────────────────────────────────────────────────────────────────────────

describe('ReportsModule — contract', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── ReportsDataAccessService ────────────────────────────────────────────

  describe('ReportsDataAccessService', () => {
    const proto = ReportsDataAccessService.prototype;

    // Student queries
    it('should expose countStudents method', () => {
      expect(typeof proto.countStudents).toBe('function');
    });

    it('should expose countStudentsByStatus method', () => {
      expect(typeof proto.countStudentsByStatus).toBe('function');
    });

    it('should expose findStudents method', () => {
      expect(typeof proto.findStudents).toBe('function');
    });

    it('should expose findStudentById method', () => {
      expect(typeof proto.findStudentById).toBe('function');
    });

    it('should expose groupStudentsBy method', () => {
      expect(typeof proto.groupStudentsBy).toBe('function');
    });

    // Staff queries
    it('should expose countStaff method', () => {
      expect(typeof proto.countStaff).toBe('function');
    });

    it('should expose countStaffByStatus method', () => {
      expect(typeof proto.countStaffByStatus).toBe('function');
    });

    it('should expose findStaffProfiles method', () => {
      expect(typeof proto.findStaffProfiles).toBe('function');
    });

    it('should expose groupStaffBy method', () => {
      expect(typeof proto.groupStaffBy).toBe('function');
    });

    // Class queries
    it('should expose countClasses method', () => {
      expect(typeof proto.countClasses).toBe('function');
    });

    it('should expose findClasses method', () => {
      expect(typeof proto.findClasses).toBe('function');
    });

    // Attendance queries
    it('should expose groupAttendanceRecordsBy method', () => {
      expect(typeof proto.groupAttendanceRecordsBy).toBe('function');
    });

    it('should expose countAttendanceRecords method', () => {
      expect(typeof proto.countAttendanceRecords).toBe('function');
    });

    it('should expose findAttendanceRecords method', () => {
      expect(typeof proto.findAttendanceRecords).toBe('function');
    });

    // Grade queries
    it('should expose findGrades method', () => {
      expect(typeof proto.findGrades).toBe('function');
    });

    it('should expose aggregateGrades method', () => {
      expect(typeof proto.aggregateGrades).toBe('function');
    });

    it('should expose findAssessments method', () => {
      expect(typeof proto.findAssessments).toBe('function');
    });

    // Finance queries
    it('should expose findInvoices method', () => {
      expect(typeof proto.findInvoices).toBe('function');
    });

    it('should expose countInvoices method', () => {
      expect(typeof proto.countInvoices).toBe('function');
    });

    it('should expose aggregateInvoices method', () => {
      expect(typeof proto.aggregateInvoices).toBe('function');
    });

    it('should expose findPayments method', () => {
      expect(typeof proto.findPayments).toBe('function');
    });

    // Admissions queries
    it('should expose countApplications method', () => {
      expect(typeof proto.countApplications).toBe('function');
    });

    it('should expose findApplications method', () => {
      expect(typeof proto.findApplications).toBe('function');
    });

    // Audit log queries
    it('should expose findAuditLogs method', () => {
      expect(typeof proto.findAuditLogs).toBe('function');
    });

    it('should expose countAuditLogs method', () => {
      expect(typeof proto.countAuditLogs).toBe('function');
    });

    // All methods accept tenantId as first param
    it('all data access methods should accept tenantId as first parameter', () => {
      const methods: Array<keyof ReportsDataAccessService> = [
        'countStudents',
        'countStudentsByStatus',
        'findStudents',
        'findStudentById',
        'countStaff',
        'countStaffByStatus',
        'findStaffProfiles',
        'countClasses',
        'findClasses',
        'groupAttendanceRecordsBy',
        'countAttendanceRecords',
        'findAttendanceRecords',
        'findGrades',
        'aggregateGrades',
        'findAssessments',
        'findInvoices',
        'countInvoices',
        'aggregateInvoices',
        'findPayments',
        'countApplications',
        'findApplications',
        'findAuditLogs',
        'countAuditLogs',
      ];

      for (const method of methods) {
        const fn = proto[method];
        expect((fn as (...args: unknown[]) => unknown).length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // ─── ReportsService ──────────────────────────────────────────────────────

  describe('ReportsService', () => {
    const proto = ReportsService.prototype;

    it('should expose promotionRollover method', () => {
      expect(typeof proto.promotionRollover).toBe('function');
    });

    it('promotionRollover should accept (tenantId, academicYearId)', () => {
      expect(proto.promotionRollover.length).toBeGreaterThanOrEqual(2);
    });

    it('should expose feeGenerationRuns method', () => {
      expect(typeof proto.feeGenerationRuns).toBe('function');
    });

    it('should expose writeOffs method', () => {
      expect(typeof proto.writeOffs).toBe('function');
    });

    it('should expose notificationDelivery method', () => {
      expect(typeof proto.notificationDelivery).toBe('function');
    });

    it('should expose studentExportPack method', () => {
      expect(typeof proto.studentExportPack).toBe('function');
    });

    it('studentExportPack should accept (tenantId, studentId)', () => {
      expect(proto.studentExportPack.length).toBeGreaterThanOrEqual(2);
    });

    it('should expose householdExportPack method', () => {
      expect(typeof proto.householdExportPack).toBe('function');
    });

    it('householdExportPack should accept (tenantId, householdId)', () => {
      expect(proto.householdExportPack.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── UnifiedDashboardService ─────────────────────────────────────────────

  describe('UnifiedDashboardService', () => {
    const proto = UnifiedDashboardService.prototype;

    it('should expose getKpiDashboard method', () => {
      expect(typeof proto.getKpiDashboard).toBe('function');
    });

    it('getKpiDashboard should accept (tenantId)', () => {
      expect(proto.getKpiDashboard.length).toBeGreaterThanOrEqual(1);
    });

    it('should expose invalidateCache method', () => {
      expect(typeof proto.invalidateCache).toBe('function');
    });
  });

  // ─── ScheduledReportsService ─────────────────────────────────────────────

  describe('ScheduledReportsService', () => {
    const proto = ScheduledReportsService.prototype;

    it('should expose list method', () => {
      expect(typeof proto.list).toBe('function');
    });

    it('should expose get method', () => {
      expect(typeof proto.get).toBe('function');
    });

    it('should expose create method', () => {
      expect(typeof proto.create).toBe('function');
    });

    it('should expose update method', () => {
      expect(typeof proto.update).toBe('function');
    });

    it('should expose delete method', () => {
      expect(typeof proto.delete).toBe('function');
    });

    it('should expose getDueReports method', () => {
      expect(typeof proto.getDueReports).toBe('function');
    });
  });

  // ─── ReportAlertsService ─────────────────────────────────────────────────

  describe('ReportAlertsService', () => {
    const proto = ReportAlertsService.prototype;

    it('should expose list method', () => {
      expect(typeof proto.list).toBe('function');
    });

    it('should expose get method', () => {
      expect(typeof proto.get).toBe('function');
    });

    it('should expose create method', () => {
      expect(typeof proto.create).toBe('function');
    });

    it('should expose update method', () => {
      expect(typeof proto.update).toBe('function');
    });

    it('should expose delete method', () => {
      expect(typeof proto.delete).toBe('function');
    });
  });

  // ─── Public API surface guard ───────────────────────────────────────────

  describe('public API surface guard', () => {
    it('ReportsDataAccessService should contain all expected facade methods', () => {
      const expectedMethods = [
        'countStudents',
        'countStudentsByStatus',
        'findStudents',
        'findStudentById',
        'groupStudentsBy',
        'countStaff',
        'countStaffByStatus',
        'findStaffProfiles',
        'groupStaffBy',
        'countClasses',
        'findClasses',
        'findClassStaff',
        'countClassStaff',
        'countClassEnrolments',
        'findClassEnrolments',
        'groupAttendanceRecordsBy',
        'countAttendanceRecords',
        'findAttendanceRecords',
        'findAttendanceSessions',
        'countAttendanceSessions',
        'groupStaffAttendanceBy',
        'findGrades',
        'groupGradesBy',
        'aggregateGrades',
        'findAssessments',
        'countAssessments',
        'findPeriodGradeSnapshots',
        'findGpaSnapshots',
        'countStudentAcademicRiskAlerts',
        'findStudentAcademicRiskAlerts',
        'findReportCards',
        'findInvoices',
        'countInvoices',
        'aggregateInvoices',
        'findPayments',
        'findStaffCompensations',
        'countApplications',
        'findApplications',
        'findYearGroups',
        'findAcademicPeriods',
        'findSubjects',
        'findPayrollRuns',
        'findHouseholdById',
        'findNotifications',
        'findAuditLogs',
        'findFirstAuditLog',
        'countAuditLogs',
        'countSchedules',
        'countApprovalRequests',
      ];

      const publicMethods = getPublicMethodNames(ReportsDataAccessService.prototype);

      for (const method of expectedMethods) {
        expect(publicMethods).toContain(method);
      }
    });

    it('ReportsService should contain all expected methods', () => {
      const expectedMethods = [
        'promotionRollover',
        'feeGenerationRuns',
        'writeOffs',
        'notificationDelivery',
        'studentExportPack',
        'householdExportPack',
      ];

      const publicMethods = getPublicMethodNames(ReportsService.prototype);

      for (const method of expectedMethods) {
        expect(publicMethods).toContain(method);
      }
    });
  });
});
