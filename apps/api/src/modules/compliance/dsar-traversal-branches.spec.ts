import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AdmissionsReadFacade } from '../admissions/admissions-read.facade';
import { AttendanceReadFacade } from '../attendance/attendance-read.facade';
import { AuditLogReadFacade } from '../audit-log/audit-log-read.facade';
import { AuthReadFacade } from '../auth/auth-read.facade';
import { BehaviourReadFacade } from '../behaviour/behaviour-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { CommunicationsReadFacade } from '../communications/communications-read.facade';
import { FinanceReadFacade } from '../finance/finance-read.facade';
import { GdprReadFacade } from '../gdpr/gdpr-read.facade';
import { GradebookReadFacade } from '../gradebook/gradebook-read.facade';
import { HouseholdReadFacade } from '../households/household-read.facade';
import { ParentInquiriesReadFacade } from '../parent-inquiries/parent-inquiries-read.facade';
import { ParentReadFacade } from '../parents/parent-read.facade';
import { PayrollReadFacade } from '../payroll/payroll-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RbacReadFacade } from '../rbac/rbac-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../students/student-read.facade';

import { DsarTraversalService } from './dsar-traversal.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PARENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STAFF_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const APP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const HOUSEHOLD_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const USER_ID = '11111111-1111-1111-1111-111111111111';

describe('DsarTraversalService — branches', () => {
  let service: DsarTraversalService;

  beforeEach(async () => {
    // Build mock facades that return arrays for list-like methods
    const arrayMock = jest.fn().mockResolvedValue([]);
    const nullMock = jest.fn().mockResolvedValue(null);
    const zeroMock = jest.fn().mockResolvedValue(0);

    const makeFacadeMock = (): Record<string, jest.Mock> =>
      new Proxy({} as Record<string, jest.Mock>, {
        get(_target, prop: string) {
          if (prop === 'then') return undefined;
          const lp = prop.toLowerCase();
          if (lp.includes('count')) return zeroMock;
          if (
            lp.includes('find') ||
            lp.includes('list') ||
            lp.includes('get') ||
            lp.includes('search')
          )
            return lp.includes('byid') || lp.includes('findone') ? nullMock : arrayMock;
          return arrayMock;
        },
      });

    const module = await Test.createTestingModule({
      providers: [
        DsarTraversalService,
        { provide: PrismaService, useValue: {} },
        { provide: FinanceReadFacade, useValue: makeFacadeMock() },
        { provide: GradebookReadFacade, useValue: makeFacadeMock() },
        { provide: BehaviourReadFacade, useValue: makeFacadeMock() },
        { provide: StudentReadFacade, useValue: makeFacadeMock() },
        { provide: ParentReadFacade, useValue: makeFacadeMock() },
        { provide: HouseholdReadFacade, useValue: makeFacadeMock() },
        { provide: StaffProfileReadFacade, useValue: makeFacadeMock() },
        { provide: AdmissionsReadFacade, useValue: makeFacadeMock() },
        { provide: AuthReadFacade, useValue: makeFacadeMock() },
        { provide: RbacReadFacade, useValue: makeFacadeMock() },
        { provide: AttendanceReadFacade, useValue: makeFacadeMock() },
        { provide: ClassesReadFacade, useValue: makeFacadeMock() },
        { provide: GdprReadFacade, useValue: makeFacadeMock() },
        { provide: AuditLogReadFacade, useValue: makeFacadeMock() },
        { provide: CommunicationsReadFacade, useValue: makeFacadeMock() },
        { provide: ParentInquiriesReadFacade, useValue: makeFacadeMock() },
        { provide: PayrollReadFacade, useValue: makeFacadeMock() },
      ],
    }).compile();

    service = module.get(DsarTraversalService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── collectAllData — subject type switch ───────────────────────────────
  describe('DsarTraversalService — collectAllData', () => {
    it('should collect student data', async () => {
      const result = await service.collectAllData(TENANT_ID, 'student', STUDENT_ID);
      expect(result.subject_type).toBe('student');
      expect(result.subject_id).toBe(STUDENT_ID);
      expect(result.categories).toBeDefined();
    });

    it('should collect parent data', async () => {
      const result = await service.collectAllData(TENANT_ID, 'parent', PARENT_ID);
      expect(result.subject_type).toBe('parent');
      expect(result.categories).toBeDefined();
    });

    it('should collect staff data', async () => {
      const result = await service.collectAllData(TENANT_ID, 'staff', STAFF_ID);
      expect(result.subject_type).toBe('staff');
      expect(result.categories).toBeDefined();
    });

    it('should collect applicant data', async () => {
      const result = await service.collectAllData(TENANT_ID, 'applicant', APP_ID);
      expect(result.subject_type).toBe('applicant');
      expect(result.categories).toBeDefined();
    });

    it('should collect household data', async () => {
      const result = await service.collectAllData(TENANT_ID, 'household', HOUSEHOLD_ID);
      expect(result.subject_type).toBe('household');
      expect(result.categories).toBeDefined();
    });

    it('should collect user data', async () => {
      const result = await service.collectAllData(TENANT_ID, 'user', USER_ID);
      expect(result.subject_type).toBe('user');
      expect(result.categories).toBeDefined();
    });

    it('should throw BadRequestException for unsupported subject type', async () => {
      await expect(service.collectAllData(TENANT_ID, 'alien', 'x')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should include collected_at timestamp', async () => {
      const result = await service.collectAllData(TENANT_ID, 'user', USER_ID);
      expect(result.collected_at).toBeDefined();
      expect(new Date(result.collected_at).getTime()).not.toBeNaN();
    });
  });
});
