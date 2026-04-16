import { Test } from '@nestjs/testing';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { S3Service } from '../s3/s3.service';
import { SearchIndexService } from '../search/search-index.service';

import { AnonymisationService } from './anonymisation.service';

// Mock createRlsClient
const mockTx: Record<string, unknown> = {};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(() => ({
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  })),
}));

describe('AnonymisationService', () => {
  let service: AnonymisationService;

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const PARENT_ID = '22222222-2222-2222-2222-222222222222';
  const STUDENT_ID = '33333333-3333-3333-3333-333333333333';
  const HOUSEHOLD_ID = '44444444-4444-4444-4444-444444444444';
  const STAFF_PROFILE_ID = '55555555-5555-5555-5555-555555555555';
  const USER_ID = '66666666-6666-6666-6666-666666666666';
  const MEMBERSHIP_ID = '77777777-7777-7777-7777-777777777777';

  const mockPrisma = {
    complianceRequest: {
      updateMany: jest.fn(),
    },
  };

  const mockParent = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  };

  const mockStudent = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  };

  const mockHousehold = {
    findFirst: jest.fn(),
    update: jest.fn(),
  };

  const mockStaffProfile = {
    findFirst: jest.fn(),
    update: jest.fn(),
  };

  const mockPayrollEntry = {
    updateMany: jest.fn(),
  };

  const mockPayslip = {
    findMany: jest.fn(),
    update: jest.fn(),
  };

  const mockReportCard = {
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };

  const mockAttendanceRecord = {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  };

  const mockGrade = {
    updateMany: jest.fn(),
  };

  const mockPeriodGradeSnapshot = {
    updateMany: jest.fn(),
  };

  const mockApplication = {
    findMany: jest.fn(),
    update: jest.fn(),
  };

  const mockApplicationNote = {
    findMany: jest.fn(),
    update: jest.fn(),
  };

  const mockNotification = {
    updateMany: jest.fn(),
  };

  const mockParentInquiry = {
    findMany: jest.fn(),
    update: jest.fn(),
  };

  const mockParentInquiryMessage = {
    findMany: jest.fn(),
    update: jest.fn(),
  };

  const mockHouseholdParent = {
    findMany: jest.fn(),
  };

  const mockTenantMembership = {
    findMany: jest.fn(),
  };

  const mockBehaviourIncidentParticipant = {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  };

  const mockBehaviourIncident = {
    updateMany: jest.fn(),
  };

  const mockGdprAnonymisationToken = {
    deleteMany: jest.fn(),
  };

  const mockComplianceRequestTx = {
    findMany: jest.fn(),
  };

  const mockSearchIndexService = {
    removeEntity: jest.fn(),
  };

  const mockS3Service = {
    delete: jest.fn(),
  };

  const mockPipeline = {
    del: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  const mockRedisClient = {
    pipeline: jest.fn(),
    scan: jest.fn(),
    smembers: jest.fn(),
    del: jest.fn(),
  };

  const mockRedisService = {
    getClient: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockParent.findMany.mockResolvedValue([]);
    mockStudent.findMany.mockResolvedValue([]);
    mockHouseholdParent.findMany.mockResolvedValue([]);
    mockTenantMembership.findMany.mockResolvedValue([]);
    mockAttendanceRecord.findMany.mockResolvedValue([]);
    mockAttendanceRecord.updateMany.mockResolvedValue({ count: 0 });
    mockGrade.updateMany.mockResolvedValue({ count: 0 });
    mockPeriodGradeSnapshot.updateMany.mockResolvedValue({ count: 0 });
    mockApplication.findMany.mockResolvedValue([]);
    mockApplication.update.mockResolvedValue({});
    mockApplicationNote.findMany.mockResolvedValue([]);
    mockApplicationNote.update.mockResolvedValue({});
    mockNotification.updateMany.mockResolvedValue({ count: 0 });
    mockParentInquiry.findMany.mockResolvedValue([]);
    mockParentInquiry.update.mockResolvedValue({});
    mockParentInquiryMessage.findMany.mockResolvedValue([]);
    mockParentInquiryMessage.update.mockResolvedValue({});
    mockReportCard.findMany.mockResolvedValue([]);
    mockReportCard.update.mockResolvedValue({});
    mockReportCard.updateMany.mockResolvedValue({ count: 0 });
    mockPayslip.findMany.mockResolvedValue([]);
    mockPayslip.update.mockResolvedValue({});
    mockPayrollEntry.updateMany.mockResolvedValue({ count: 0 });
    mockBehaviourIncidentParticipant.findMany.mockResolvedValue([]);
    mockBehaviourIncidentParticipant.updateMany.mockResolvedValue({ count: 0 });
    mockBehaviourIncident.updateMany.mockResolvedValue({ count: 0 });
    mockGdprAnonymisationToken.deleteMany.mockResolvedValue({ count: 0 });
    mockComplianceRequestTx.findMany.mockResolvedValue([]);
    mockPrisma.complianceRequest.updateMany.mockResolvedValue({ count: 0 });
    mockSearchIndexService.removeEntity.mockResolvedValue(undefined);
    mockS3Service.delete.mockResolvedValue(undefined);
    mockPipeline.exec.mockResolvedValue([]);
    mockRedisClient.pipeline.mockReturnValue(mockPipeline);
    mockRedisClient.scan.mockResolvedValue(['0', []]);
    mockRedisClient.smembers.mockResolvedValue([]);
    mockRedisClient.del.mockResolvedValue(0);
    mockRedisService.getClient.mockReturnValue(mockRedisClient);

    mockTx['parent'] = mockParent;
    mockTx['student'] = mockStudent;
    mockTx['household'] = mockHousehold;
    mockTx['staffProfile'] = mockStaffProfile;
    mockTx['payrollEntry'] = mockPayrollEntry;
    mockTx['payslip'] = mockPayslip;
    mockTx['reportCard'] = mockReportCard;
    mockTx['attendanceRecord'] = mockAttendanceRecord;
    mockTx['grade'] = mockGrade;
    mockTx['periodGradeSnapshot'] = mockPeriodGradeSnapshot;
    mockTx['application'] = mockApplication;
    mockTx['applicationNote'] = mockApplicationNote;
    mockTx['notification'] = mockNotification;
    mockTx['parentInquiry'] = mockParentInquiry;
    mockTx['parentInquiryMessage'] = mockParentInquiryMessage;
    mockTx['householdParent'] = mockHouseholdParent;
    mockTx['tenantMembership'] = mockTenantMembership;
    mockTx['behaviourIncidentParticipant'] = mockBehaviourIncidentParticipant;
    mockTx['behaviourIncident'] = mockBehaviourIncident;
    mockTx['gdprAnonymisationToken'] = mockGdprAnonymisationToken;
    mockTx['complianceRequest'] = mockComplianceRequestTx;

    const module = await Test.createTestingModule({
      providers: [
        AnonymisationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SearchIndexService, useValue: mockSearchIndexService },
        { provide: S3Service, useValue: mockS3Service },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<AnonymisationService>(AnonymisationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('AnonymisationService — anonymiseSubject', () => {
    it('runs secondary cleanup after user anonymisation', async () => {
      mockParent.findMany.mockResolvedValue([]);
      mockStaffProfile.findFirst
        .mockResolvedValueOnce({ id: STAFF_PROFILE_ID })
        .mockResolvedValueOnce({ id: STAFF_PROFILE_ID, job_title: 'Teacher' });
      mockTenantMembership.findMany.mockResolvedValue([{ id: MEMBERSHIP_ID }]);
      mockComplianceRequestTx.findMany.mockResolvedValue([
        {
          id: 'request-1',
          export_file_key: `${TENANT_ID}/compliance-exports/request-1.json`,
        },
      ]);
      mockRedisClient.smembers.mockResolvedValue(['session-1']);

      const result = await service.anonymiseSubject(TENANT_ID, 'user', USER_ID);

      expect(createRlsClient).toHaveBeenCalledWith(mockPrisma, { tenant_id: TENANT_ID });
      expect(result).toEqual({ anonymised_entities: ['staff_profile'] });
      expect(mockSearchIndexService.removeEntity).toHaveBeenCalledWith('staff', STAFF_PROFILE_ID);
      expect(mockS3Service.delete).toHaveBeenCalledWith(
        `${TENANT_ID}/compliance-exports/request-1.json`,
      );
      expect(mockPrisma.complianceRequest.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['request-1'] } },
        data: { export_file_key: null },
      });
      expect(mockPipeline.del).toHaveBeenCalledWith(
        `preview:staff:${TENANT_ID}:${STAFF_PROFILE_ID}`,
      );
      expect(mockPipeline.del).toHaveBeenCalledWith(
        `tenant:${TENANT_ID}:user:${USER_ID}:unread_notifications`,
      );
      expect(mockPipeline.del).toHaveBeenCalledWith(`permissions:${MEMBERSHIP_ID}`);
      expect(mockRedisClient.del).toHaveBeenCalledWith('session:session-1');
      expect(mockRedisClient.del).toHaveBeenCalledWith(`user_sessions:${USER_ID}`);
    });
  });

  describe('AnonymisationService — anonymiseParent', () => {
    it('anonymises parent fields and related inquiry/application records', async () => {
      mockParent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        first_name: 'John',
        user_id: USER_ID,
      });
      mockParent.update.mockResolvedValue({});
      mockParentInquiry.findMany.mockResolvedValue([{ id: 'inq-1' }]);
      mockParentInquiryMessage.findMany.mockResolvedValue([{ id: 'msg-1' }]);
      mockApplication.findMany
        .mockResolvedValueOnce([{ id: 'app-1' }])
        .mockResolvedValueOnce([{ id: 'app-1', date_of_birth: new Date('2018-05-20') }]);
      mockApplicationNote.findMany.mockResolvedValue([{ id: 'note-1' }]);

      await service.anonymiseParent(TENANT_ID, PARENT_ID, mockTx as never);

      const tag = `ANONYMISED-${PARENT_ID}`;
      expect(mockParent.update).toHaveBeenCalledWith({
        where: { id: PARENT_ID },
        data: {
          first_name: tag,
          last_name: tag,
          email: `${tag}@anonymised.local`,
          phone: tag,
          whatsapp_phone: tag,
        },
      });
      expect(mockParentInquiry.update).toHaveBeenCalledWith({
        where: { id: 'inq-1' },
        data: { subject: 'ANONYMISED-inq-1' },
      });
      expect(mockParentInquiryMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { message: 'ANONYMISED-msg-1' },
      });
      expect(mockNotification.updateMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          source_entity_type: 'parent_inquiry',
          source_entity_id: { in: ['inq-1'] },
        },
        data: {
          payload_json: {
            anonymised: true,
            anonymisation_tag: tag,
          },
          failure_reason: null,
        },
      });
      expect(mockApplication.update).toHaveBeenCalledWith({
        where: { id: 'app-1' },
        data: {
          submitted_by: { disconnect: true },
          payload_json: {
            anonymised: true,
            anonymisation_scope: 'parent',
            anonymisation_tag: 'ANONYMISED-app-1',
          },
          rejection_reason: null,
        },
      });
      expect(mockApplicationNote.update).toHaveBeenCalledWith({
        where: { id: 'note-1' },
        data: { note: 'ANONYMISED-note-1' },
      });
    });
  });

  describe('AnonymisationService — anonymiseStudent', () => {
    it('strips quasi-identifiers and cascades to related records', async () => {
      const originalDob = new Date('2012-05-23T00:00:00.000Z');

      mockStudent.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
        date_of_birth: originalDob,
        student_parents: [{ parent_id: PARENT_ID }],
      });
      mockStudent.update.mockResolvedValue({});
      mockAttendanceRecord.findMany.mockResolvedValue([{ id: 'att-1' }]);
      mockReportCard.findMany.mockResolvedValue([
        {
          id: 'rc-1',
          snapshot_payload_json: {
            student: {
              full_name: 'Alice Smith',
              student_number: 'STU-001',
            },
            teacher_comment: 'Alice has improved',
            principal_comment: 'Well done Alice',
          },
        },
      ]);
      mockApplication.findMany
        .mockResolvedValueOnce([{ id: 'app-2' }])
        .mockResolvedValueOnce([{ id: 'app-2', date_of_birth: originalDob }]);
      mockParentInquiry.findMany.mockResolvedValue([{ id: 'inq-2' }]);
      mockParentInquiryMessage.findMany.mockResolvedValue([{ id: 'msg-2' }]);

      await service.anonymiseStudent(TENANT_ID, STUDENT_ID, mockTx as never);

      const tag = `ANONYMISED-${STUDENT_ID}`;
      expect(mockStudent.update).toHaveBeenCalledWith({
        where: { id: STUDENT_ID },
        data: {
          first_name: tag,
          middle_name: tag,
          last_name: tag,
          full_name: tag,
          first_name_ar: tag,
          last_name_ar: tag,
          full_name_ar: tag,
          student_number: tag,
          date_of_birth: new Date(Date.UTC(2012, 0, 1)),
          national_id: null,
          gender: null,
          nationality: null,
          city_of_birth: null,
          medical_notes: null,
          allergy_details: null,
          has_allergy: false,
        },
      });
      expect(mockAttendanceRecord.updateMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
        data: { reason: null, amendment_reason: null },
      });
      expect(mockGrade.updateMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
        data: { comment: null },
      });
      expect(mockPeriodGradeSnapshot.updateMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
        data: { override_reason: null },
      });
      expect(mockNotification.updateMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          source_entity_type: 'attendance_record',
          source_entity_id: { in: ['att-1'] },
        },
        data: {
          payload_json: {
            anonymised: true,
            anonymisation_tag: tag,
          },
          failure_reason: null,
        },
      });
      expect(mockReportCard.updateMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
        data: { teacher_comment: null, principal_comment: null },
      });
      expect(mockReportCard.update).toHaveBeenCalledWith({
        where: { id: 'rc-1' },
        data: {
          snapshot_payload_json: {
            student: {
              full_name: tag,
              student_number: tag,
              first_name: tag,
              last_name: tag,
            },
            teacher_comment: null,
            principal_comment: null,
          },
        },
      });
      expect(mockParentInquiry.update).toHaveBeenCalledWith({
        where: { id: 'inq-2' },
        data: {
          subject: 'ANONYMISED-inq-2',
          student: { disconnect: true },
        },
      });
      expect(mockNotification.updateMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          source_entity_type: 'parent_inquiry',
          source_entity_id: { in: ['inq-2'] },
        },
        data: {
          payload_json: {
            anonymised: true,
            anonymisation_tag: tag,
          },
          failure_reason: null,
        },
      });
      expect(mockApplication.update).toHaveBeenCalledWith({
        where: { id: 'app-2' },
        data: {
          submitted_by: { disconnect: true },
          payload_json: {
            anonymised: true,
            anonymisation_scope: 'student',
            anonymisation_tag: 'ANONYMISED-app-2',
          },
          rejection_reason: null,
          student_first_name: 'ANONYMISED-app-2',
          student_last_name: 'ANONYMISED-app-2',
          date_of_birth: new Date(Date.UTC(2012, 0, 1)),
        },
      });
    });

    it('is idempotent when the student is already anonymised', async () => {
      mockStudent.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: `ANONYMISED-${STUDENT_ID}`,
        last_name: `ANONYMISED-${STUDENT_ID}`,
        date_of_birth: new Date('2012-01-01T00:00:00.000Z'),
        student_parents: [],
      });

      await service.anonymiseStudent(TENANT_ID, STUDENT_ID, mockTx as never);

      expect(mockStudent.update).not.toHaveBeenCalled();
      expect(mockAttendanceRecord.updateMany).not.toHaveBeenCalled();
      expect(mockReportCard.findMany).not.toHaveBeenCalled();
      expect(mockGdprAnonymisationToken.deleteMany).not.toHaveBeenCalled();
    });

    it('keeps writes scoped to the requested tenant and student only', async () => {
      mockStudent.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
        date_of_birth: new Date('2012-05-23T00:00:00.000Z'),
        student_parents: [],
      });
      mockStudent.update.mockResolvedValue({});

      await service.anonymiseStudent(TENANT_ID, STUDENT_ID, mockTx as never);

      expect(mockStudent.findFirst).toHaveBeenCalledWith({
        where: { id: STUDENT_ID, tenant_id: TENANT_ID },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          date_of_birth: true,
          student_parents: {
            select: { parent_id: true },
          },
        },
      });
      expect(mockAttendanceRecord.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
        },
        select: { id: true },
      });
      expect(mockReportCard.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
        select: {
          id: true,
          snapshot_payload_json: true,
        },
      });
    });

    it('should anonymise behaviour incident records when anonymising a student', async () => {
      const INCIDENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const PARTICIPANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

      mockStudent.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
        date_of_birth: new Date('2012-05-23T00:00:00.000Z'),
        student_parents: [],
      });
      mockStudent.update.mockResolvedValue({});
      mockBehaviourIncidentParticipant.findMany.mockResolvedValue([
        { id: PARTICIPANT_ID, incident_id: INCIDENT_ID },
      ]);
      mockBehaviourIncidentParticipant.updateMany.mockResolvedValue({ count: 1 });
      mockBehaviourIncident.updateMany.mockResolvedValue({ count: 1 });

      await service.anonymiseStudent(TENANT_ID, STUDENT_ID, mockTx as never);

      const tag = `ANONYMISED-${STUDENT_ID}`;
      expect(mockBehaviourIncidentParticipant.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
        select: { id: true, incident_id: true },
      });
      expect(mockBehaviourIncidentParticipant.updateMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          id: { in: [PARTICIPANT_ID] },
        },
        data: {
          notes: null,
          external_name: null,
          student_snapshot: expect.anything(),
        },
      });
      expect(mockBehaviourIncident.updateMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          id: { in: [INCIDENT_ID] },
        },
        data: {
          description: tag,
          parent_description: null,
          parent_description_ar: null,
          context_notes: null,
          context_snapshot: {},
        },
      });
    });

    it('should not allow cross-tenant data access during anonymisation', async () => {
      const TENANT_A_ID = TENANT_ID;
      const TENANT_B_ID = '99999999-9999-9999-9999-999999999999';

      mockStudent.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
        date_of_birth: new Date('2012-05-23T00:00:00.000Z'),
        student_parents: [{ parent_id: PARENT_ID }],
      });
      mockStudent.update.mockResolvedValue({});

      await service.anonymiseStudent(TENANT_A_ID, STUDENT_ID, mockTx as never);

      // Verify createRlsClient was called with correct tenant
      expect(createRlsClient).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ tenant_id: TENANT_B_ID }),
      );

      // Verify every tenant-scoped query uses TENANT_A_ID
      const allCalls = [
        ...mockStudent.findFirst.mock.calls,
        ...mockAttendanceRecord.findMany.mock.calls,
        ...mockAttendanceRecord.updateMany.mock.calls,
        ...mockGrade.updateMany.mock.calls,
        ...mockPeriodGradeSnapshot.updateMany.mock.calls,
        ...mockReportCard.findMany.mock.calls,
        ...mockReportCard.updateMany.mock.calls,
        ...mockParentInquiry.findMany.mock.calls,
        ...mockNotification.updateMany.mock.calls,
        ...mockBehaviourIncidentParticipant.findMany.mock.calls,
      ];

      for (const callArgs of allCalls) {
        const whereArg = callArgs[0]?.where;
        if (whereArg && 'tenant_id' in whereArg) {
          expect(whereArg.tenant_id).toBe(TENANT_A_ID);
        }
      }

      // Verify no queries were made with TENANT_B_ID
      for (const callArgs of allCalls) {
        const whereArg = callArgs[0]?.where;
        if (whereArg && 'tenant_id' in whereArg) {
          expect(whereArg.tenant_id).not.toBe(TENANT_B_ID);
        }
      }
    });
  });

  describe('AnonymisationService — anonymiseHousehold', () => {
    it('clears household address fields', async () => {
      mockHousehold.findFirst.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'Smith Family',
      });
      mockHousehold.update.mockResolvedValue({});

      await service.anonymiseHousehold(TENANT_ID, HOUSEHOLD_ID, mockTx as never);

      expect(mockHousehold.update).toHaveBeenCalledWith({
        where: { id: HOUSEHOLD_ID },
        data: {
          household_name: `ANONYMISED-${HOUSEHOLD_ID}`,
          address_line_1: null,
          address_line_2: null,
          city: null,
          country: null,
          postal_code: null,
        },
      });
    });
  });

  describe('AnonymisationService — anonymiseStaff', () => {
    it('clears bank details, staff number, payroll notes, and payslip snapshots', async () => {
      mockStaffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        job_title: 'Teacher',
      });
      mockStaffProfile.update.mockResolvedValue({});
      mockPayslip.findMany.mockResolvedValue([
        {
          id: 'ps-1',
          snapshot_payload_json: {
            staff: {
              full_name: 'John Doe',
              staff_number: 'STF-001',
              department: 'Math',
              job_title: 'Teacher',
              bank_account_last4: '1234',
              bank_iban_last4: '5678',
            },
          },
        },
      ]);

      await service.anonymiseStaff(TENANT_ID, STAFF_PROFILE_ID, mockTx as never);

      const tag = `ANONYMISED-${STAFF_PROFILE_ID}`;
      expect(mockStaffProfile.update).toHaveBeenCalledWith({
        where: { id: STAFF_PROFILE_ID },
        data: {
          staff_number: tag,
          job_title: tag,
          department: tag,
          bank_account_number_encrypted: null,
          bank_iban_encrypted: null,
        },
      });
      expect(mockPayrollEntry.updateMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, staff_profile_id: STAFF_PROFILE_ID },
        data: { notes: tag, override_note: tag },
      });
      expect(mockPayslip.update).toHaveBeenCalledWith({
        where: { id: 'ps-1' },
        data: {
          snapshot_payload_json: {
            staff: {
              full_name: tag,
              staff_number: tag,
              department: tag,
              job_title: tag,
              bank_account_last4: null,
              bank_iban_last4: null,
            },
          },
        },
      });
    });
  });
});
