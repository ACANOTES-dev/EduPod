import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ReportsDataAccessService } from './reports-data-access.service';
import { ReportsService } from './reports.service';

const TENANT_ID = 'tenant-uuid-1';
const ACADEMIC_YEAR_ID = 'ay-uuid-1';
const STUDENT_ID = 'student-uuid-1';
const HOUSEHOLD_ID = 'household-uuid-1';

function uuid(n: number): string {
  return `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
}

describe('ReportsService', () => {
  let service: ReportsService;
  let mockDataAccess: {
    findFirstAuditLog: jest.Mock;
    findAuditLogs: jest.Mock;
    countAuditLogs: jest.Mock;
    findYearGroups: jest.Mock;
    findStudentById: jest.Mock;
    findStudents: jest.Mock;
    findInvoices: jest.Mock;
    countInvoices: jest.Mock;
    findNotifications: jest.Mock;
    findAttendanceRecords: jest.Mock;
    findGrades: jest.Mock;
    findReportCards: jest.Mock;
    findClassEnrolments: jest.Mock;
    findHouseholdById: jest.Mock;
    findPayments: jest.Mock;
  };

  beforeEach(async () => {
    mockDataAccess = {
      findFirstAuditLog: jest.fn(),
      findAuditLogs: jest.fn(),
      countAuditLogs: jest.fn(),
      findYearGroups: jest.fn(),
      findStudentById: jest.fn(),
      findStudents: jest.fn(),
      findInvoices: jest.fn(),
      countInvoices: jest.fn(),
      findNotifications: jest.fn(),
      findAttendanceRecords: jest.fn(),
      findGrades: jest.fn(),
      findReportCards: jest.fn(),
      findClassEnrolments: jest.fn(),
      findHouseholdById: jest.fn(),
      findPayments: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: ReportsDataAccessService, useValue: mockDataAccess }],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  // ─── promotionRollover() ───────────────────────────────────────────

  describe('promotionRollover()', () => {
    it('should return promotion data from audit log when available', async () => {
      mockDataAccess.findFirstAuditLog.mockResolvedValue({
        id: uuid(1),
        metadata_json: {
          promoted: 50,
          held_back: 5,
          graduated: 10,
          withdrawn: 2,
        },
      });
      mockDataAccess.findYearGroups.mockResolvedValue([
        { id: uuid(10), name: 'Year 1' },
        { id: uuid(11), name: 'Year 2' },
      ]);

      const result = await service.promotionRollover(TENANT_ID, ACADEMIC_YEAR_ID);

      expect(result.promoted).toBe(50);
      expect(result.held_back).toBe(5);
      expect(result.graduated).toBe(10);
      expect(result.withdrawn).toBe(2);
      expect(result.details).toHaveLength(2);
    });

    it('should compute promotion data from student records as fallback', async () => {
      mockDataAccess.findFirstAuditLog.mockResolvedValue(null);
      mockDataAccess.findStudents.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockDataAccess.findYearGroups.mockResolvedValue([
        { id: uuid(10), name: 'Year 1', display_order: 1, next_year_group: { id: uuid(11) } },
        { id: uuid(11), name: 'Year 2', display_order: 2, next_year_group: null },
      ]);
      // One student promoted (year_group changed), one held back (same)
      mockDataAccess.findStudents.mockResolvedValue([
        {
          id: uuid(1),
          status: 'active',
          year_group_id: uuid(11), // moved from Year 1 to Year 2
          class_enrolments: [{ class_entity: { year_group_id: uuid(10) } }],
        },
        {
          id: uuid(2),
          status: 'active',
          year_group_id: uuid(10), // still in Year 1
          class_enrolments: [{ class_entity: { year_group_id: uuid(10) } }],
        },
      ]);

      const result = await service.promotionRollover(TENANT_ID, ACADEMIC_YEAR_ID);

      expect(result.promoted).toBe(1);
      expect(result.held_back).toBe(1);
    });

    it('should throw ACADEMIC_YEAR_NOT_FOUND for invalid academic year', async () => {
      mockDataAccess.findFirstAuditLog.mockResolvedValue(null);
      mockDataAccess.findYearGroups.mockResolvedValue([]);
      mockDataAccess.findStudents.mockResolvedValue([]);

      await expect(service.promotionRollover(TENANT_ID, 'non-existent-id')).rejects.toThrow(
        NotFoundException,
      );

      await expect(service.promotionRollover(TENANT_ID, 'non-existent-id')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ACADEMIC_YEAR_NOT_FOUND' }),
      });
    });

    it('should count student as promoted when year_group changed', async () => {
      mockDataAccess.findFirstAuditLog.mockResolvedValue(null);
      mockDataAccess.findStudents.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockDataAccess.findYearGroups.mockResolvedValue([
        { id: uuid(10), name: 'Year 1', display_order: 1, next_year_group: { id: uuid(11) } },
        { id: uuid(11), name: 'Year 2', display_order: 2, next_year_group: null },
      ]);
      mockDataAccess.findStudents.mockResolvedValue([
        {
          id: uuid(1),
          status: 'active',
          year_group_id: uuid(11), // now in Year 2
          class_enrolments: [{ class_entity: { year_group_id: uuid(10) } }], // was in Year 1
        },
      ]);

      const result = await service.promotionRollover(TENANT_ID, ACADEMIC_YEAR_ID);

      expect(result.promoted).toBe(1);
      expect(result.held_back).toBe(0);
    });

    it('should count student as held_back when year_group unchanged', async () => {
      mockDataAccess.findFirstAuditLog.mockResolvedValue(null);
      mockDataAccess.findStudents.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockDataAccess.findYearGroups.mockResolvedValue([
        { id: uuid(10), name: 'Year 1', display_order: 1, next_year_group: { id: uuid(11) } },
      ]);
      mockDataAccess.findStudents.mockResolvedValue([
        {
          id: uuid(1),
          status: 'active',
          year_group_id: uuid(10), // still in Year 1
          class_enrolments: [{ class_entity: { year_group_id: uuid(10) } }],
        },
      ]);

      const result = await service.promotionRollover(TENANT_ID, ACADEMIC_YEAR_ID);

      expect(result.held_back).toBe(1);
      expect(result.promoted).toBe(0);
    });

    it('should count graduated students', async () => {
      mockDataAccess.findFirstAuditLog.mockResolvedValue(null);
      mockDataAccess.findStudents.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockDataAccess.findYearGroups.mockResolvedValue([
        { id: uuid(10), name: 'Year 6', display_order: 1, next_year_group: null },
      ]);
      mockDataAccess.findStudents.mockResolvedValue([
        {
          id: uuid(1),
          status: 'graduated',
          year_group_id: uuid(10),
          class_enrolments: [{ class_entity: { year_group_id: uuid(10) } }],
        },
      ]);

      const result = await service.promotionRollover(TENANT_ID, ACADEMIC_YEAR_ID);

      expect(result.graduated).toBe(1);
      expect(result.promoted).toBe(0);
      expect(result.held_back).toBe(0);
    });

    it('should count withdrawn students', async () => {
      mockDataAccess.findFirstAuditLog.mockResolvedValue(null);
      mockDataAccess.findStudents.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockDataAccess.findYearGroups.mockResolvedValue([
        { id: uuid(10), name: 'Year 1', display_order: 1, next_year_group: null },
      ]);
      mockDataAccess.findStudents.mockResolvedValue([
        {
          id: uuid(1),
          status: 'withdrawn',
          year_group_id: uuid(10),
          class_enrolments: [{ class_entity: { year_group_id: uuid(10) } }],
        },
      ]);

      const result = await service.promotionRollover(TENANT_ID, ACADEMIC_YEAR_ID);

      expect(result.withdrawn).toBe(1);
      expect(result.promoted).toBe(0);
      expect(result.held_back).toBe(0);
    });

    it('should build per-year-group detail breakdown', async () => {
      mockDataAccess.findFirstAuditLog.mockResolvedValue(null);
      mockDataAccess.findStudents.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockDataAccess.findYearGroups.mockResolvedValue([
        { id: uuid(10), name: 'Year 1', display_order: 1, next_year_group: { id: uuid(11) } },
        { id: uuid(11), name: 'Year 2', display_order: 2, next_year_group: null },
      ]);
      mockDataAccess.findStudents.mockResolvedValue([
        {
          id: uuid(1),
          status: 'active',
          year_group_id: uuid(11), // promoted from Year 1 -> Year 2
          class_enrolments: [{ class_entity: { year_group_id: uuid(10) } }],
        },
        {
          id: uuid(2),
          status: 'active',
          year_group_id: uuid(10), // held back in Year 1
          class_enrolments: [{ class_entity: { year_group_id: uuid(10) } }],
        },
        {
          id: uuid(3),
          status: 'graduated',
          year_group_id: uuid(11),
          class_enrolments: [{ class_entity: { year_group_id: uuid(11) } }],
        },
      ]);

      const result = await service.promotionRollover(TENANT_ID, ACADEMIC_YEAR_ID);

      // Only year groups with non-zero counts appear in details
      const year1Detail = result.details.find((d) => d.year_group_id === uuid(10));
      const year2Detail = result.details.find((d) => d.year_group_id === uuid(11));

      expect(year1Detail).toBeDefined();
      expect(year1Detail!.promoted).toBe(1);
      expect(year1Detail!.held_back).toBe(1);

      expect(year2Detail).toBeDefined();
      expect(year2Detail!.graduated).toBe(1);
    });
  });

  // ─── feeGenerationRuns() ──────────────────────────────────────────

  describe('feeGenerationRuns()', () => {
    it('should return paginated fee generation run summaries from audit logs', async () => {
      const now = new Date();
      mockDataAccess.findAuditLogs.mockResolvedValue([
        {
          id: uuid(1),
          created_at: now,
          metadata_json: { invoices_created: 50, total_amount: 25000, households_affected: 30 },
        },
        {
          id: uuid(2),
          created_at: now,
          metadata_json: { invoices_created: 20, total_amount: 10000, households_affected: 15 },
        },
      ]);
      mockDataAccess.countAuditLogs.mockResolvedValue(2);

      const result = await service.feeGenerationRuns(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(result.data[0]!.invoices_created).toBe(50);
    });

    it('should filter by academic_year_id via metadata_json path', async () => {
      mockDataAccess.findAuditLogs.mockResolvedValue([]);
      mockDataAccess.countAuditLogs.mockResolvedValue(0);

      await service.feeGenerationRuns(TENANT_ID, { academic_year_id: ACADEMIC_YEAR_ID });

      expect(mockDataAccess.findAuditLogs).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          where: expect.objectContaining({
            metadata_json: {
              path: ['academic_year_id'],
              equals: ACADEMIC_YEAR_ID,
            },
          }),
        }),
      );
    });

    it('should extract invoices_created, total_amount, households_affected from metadata', async () => {
      const now = new Date();
      mockDataAccess.findAuditLogs.mockResolvedValue([
        {
          id: uuid(1),
          created_at: now,
          metadata_json: { invoices_created: 100, total_amount: 50000, households_affected: 60 },
        },
      ]);
      mockDataAccess.countAuditLogs.mockResolvedValue(1);

      const result = await service.feeGenerationRuns(TENANT_ID, {});
      const entry = result.data[0]!;

      expect(entry.invoices_created).toBe(100);
      expect(entry.total_amount).toBe(50000);
      expect(entry.households_affected).toBe(60);
    });

    it('should default numeric fields to 0 when missing from metadata', async () => {
      const now = new Date();
      mockDataAccess.findAuditLogs.mockResolvedValue([
        {
          id: uuid(1),
          created_at: now,
          metadata_json: {},
        },
      ]);
      mockDataAccess.countAuditLogs.mockResolvedValue(1);

      const result = await service.feeGenerationRuns(TENANT_ID, {});
      const entry = result.data[0]!;

      expect(entry.invoices_created).toBe(0);
      expect(entry.total_amount).toBe(0);
      expect(entry.households_affected).toBe(0);
    });
  });

  // ─── writeOffs() ──────────────────────────────────────────────────

  describe('writeOffs()', () => {
    it('should return write-off entries from invoices with status written_off', async () => {
      mockDataAccess.findInvoices
        .mockResolvedValueOnce([
          {
            id: uuid(1),
            invoice_number: 'INV-001',
            write_off_amount: 500,
            write_off_reason: 'Uncollectable',
            updated_at: new Date('2025-06-01'),
            household: { household_name: 'Smith Family' },
          },
        ])
        .mockResolvedValueOnce([]); // discount query
      mockDataAccess.countInvoices.mockResolvedValue(1);

      const result = await service.writeOffs(TENANT_ID, {});

      expect(result.data.entries).toHaveLength(1);
      expect(result.data.entries[0]!.invoice_number).toBe('INV-001');
      expect(result.data.entries[0]!.household_name).toBe('Smith Family');

      // Verify the where clause targets written_off status
      expect(mockDataAccess.findInvoices).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          where: expect.objectContaining({ status: 'written_off' }),
        }),
      );
    });

    it('should apply date range filter on updated_at', async () => {
      mockDataAccess.findInvoices.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockDataAccess.countInvoices.mockResolvedValue(0);

      await service.writeOffs(TENANT_ID, {
        start_date: '2025-01-01',
        end_date: '2025-12-31',
      });

      expect(mockDataAccess.findInvoices).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          where: expect.objectContaining({
            updated_at: {
              gte: new Date('2025-01-01'),
              lte: new Date('2025-12-31'),
            },
          }),
        }),
      );
    });

    it('should compute total_written_off from all entries (100+200+300 = 600)', async () => {
      mockDataAccess.findInvoices
        .mockResolvedValueOnce([
          {
            id: uuid(1),
            invoice_number: 'INV-001',
            write_off_amount: 100,
            write_off_reason: null,
            updated_at: new Date(),
            household: { household_name: 'A' },
          },
          {
            id: uuid(2),
            invoice_number: 'INV-002',
            write_off_amount: 200,
            write_off_reason: null,
            updated_at: new Date(),
            household: { household_name: 'B' },
          },
          {
            id: uuid(3),
            invoice_number: 'INV-003',
            write_off_amount: 300,
            write_off_reason: null,
            updated_at: new Date(),
            household: { household_name: 'C' },
          },
        ])
        .mockResolvedValueOnce([]);
      mockDataAccess.countInvoices.mockResolvedValue(3);

      const result = await service.writeOffs(TENANT_ID, {});

      expect(result.data.totals.total_written_off).toBe(600);
    });

    it('should compute total_discounts from discount invoices', async () => {
      mockDataAccess.findInvoices
        .mockResolvedValueOnce([]) // write-off query
        .mockResolvedValueOnce([{ discount_amount: 150 }, { discount_amount: 250 }]); // discount query
      mockDataAccess.countInvoices.mockResolvedValue(0);

      const result = await service.writeOffs(TENANT_ID, {});

      expect(result.data.totals.total_discounts).toBe(400);
    });

    it('should handle empty results with entries=[] and totals both 0', async () => {
      mockDataAccess.findInvoices.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockDataAccess.countInvoices.mockResolvedValue(0);

      const result = await service.writeOffs(TENANT_ID, {});

      expect(result.data.entries).toEqual([]);
      expect(result.data.totals.total_written_off).toBe(0);
      expect(result.data.totals.total_discounts).toBe(0);
    });
  });

  // ─── notificationDelivery() ───────────────────────────────────────

  describe('notificationDelivery()', () => {
    it('should aggregate notification stats by channel', async () => {
      mockDataAccess.findNotifications.mockResolvedValue([
        {
          id: uuid(1),
          channel: 'email',
          status: 'delivered',
          template_key: 't1',
          failure_reason: null,
        },
        {
          id: uuid(2),
          channel: 'email',
          status: 'failed',
          template_key: 't1',
          failure_reason: 'bounce',
        },
        {
          id: uuid(3),
          channel: 'whatsapp',
          status: 'delivered',
          template_key: 't1',
          failure_reason: null,
        },
      ]);

      const result = await service.notificationDelivery(TENANT_ID, {});

      const emailChannel = result.by_channel.find((c) => c.channel === 'email');
      expect(emailChannel).toBeDefined();
      expect(emailChannel!.sent).toBe(2);
      expect(emailChannel!.delivered).toBe(1);
      expect(emailChannel!.failed).toBe(1);

      const whatsappChannel = result.by_channel.find((c) => c.channel === 'whatsapp');
      expect(whatsappChannel).toBeDefined();
      expect(whatsappChannel!.sent).toBe(1);
      expect(whatsappChannel!.delivered).toBe(1);
    });

    it('should aggregate by template', async () => {
      mockDataAccess.findNotifications.mockResolvedValue([
        {
          id: uuid(1),
          channel: 'email',
          status: 'delivered',
          template_key: 'welcome',
          failure_reason: null,
        },
        {
          id: uuid(2),
          channel: 'email',
          status: 'delivered',
          template_key: 'welcome',
          failure_reason: null,
        },
        {
          id: uuid(3),
          channel: 'email',
          status: 'delivered',
          template_key: 'invoice',
          failure_reason: null,
        },
      ]);

      const result = await service.notificationDelivery(TENANT_ID, {});

      const welcomeTemplate = result.by_template.find((t) => t.template_key === 'welcome');
      expect(welcomeTemplate).toBeDefined();
      expect(welcomeTemplate!.sent).toBe(2);
      expect(welcomeTemplate!.delivered).toBe(2);

      const invoiceTemplate = result.by_template.find((t) => t.template_key === 'invoice');
      expect(invoiceTemplate).toBeDefined();
      expect(invoiceTemplate!.sent).toBe(1);
    });

    it('should compute delivery_rate as percentage (80/100 = 80.00)', async () => {
      // Create 100 notifications: 80 delivered, 20 failed
      const notifications = [];
      for (let i = 0; i < 80; i++) {
        notifications.push({
          id: uuid(i),
          channel: 'email',
          status: 'delivered',
          template_key: 't1',
          failure_reason: null,
        });
      }
      for (let i = 80; i < 100; i++) {
        notifications.push({
          id: uuid(i),
          channel: 'email',
          status: 'failed',
          template_key: 't1',
          failure_reason: 'bounce',
        });
      }
      mockDataAccess.findNotifications.mockResolvedValue(notifications);

      const result = await service.notificationDelivery(TENANT_ID, {});

      const emailChannel = result.by_channel.find((c) => c.channel === 'email');
      expect(emailChannel!.delivery_rate).toBe(80.0);
    });

    it('should handle delivery_rate of 0 when nothing sent', async () => {
      // All queued — none sent
      mockDataAccess.findNotifications.mockResolvedValue([
        {
          id: uuid(1),
          channel: 'email',
          status: 'queued',
          template_key: 't1',
          failure_reason: null,
        },
      ]);

      const result = await service.notificationDelivery(TENANT_ID, {});

      // Queued notifications are not counted as "sent", so the channel entry
      // will not exist in by_channel (it's only populated for non-queued statuses)
      // The total_sent should be 0
      expect(result.total_sent).toBe(0);
    });

    it('should filter by channel', async () => {
      mockDataAccess.findNotifications.mockResolvedValue([]);

      await service.notificationDelivery(TENANT_ID, { channel: 'email' });

      expect(mockDataAccess.findNotifications).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ channel: 'email' }),
        expect.any(Object),
      );
    });

    it('should filter by template_key', async () => {
      mockDataAccess.findNotifications.mockResolvedValue([]);

      await service.notificationDelivery(TENANT_ID, { template_key: 'welcome' });

      expect(mockDataAccess.findNotifications).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ template_key: 'welcome' }),
        expect.any(Object),
      );
    });

    it('should apply date range filter', async () => {
      mockDataAccess.findNotifications.mockResolvedValue([]);

      await service.notificationDelivery(TENANT_ID, {
        start_date: '2025-01-01',
        end_date: '2025-06-30',
      });

      expect(mockDataAccess.findNotifications).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          created_at: {
            gte: new Date('2025-01-01'),
            lte: new Date('2025-06-30'),
          },
        }),
        expect.any(Object),
      );
    });

    it('should count queued notifications as not-sent', async () => {
      mockDataAccess.findNotifications.mockResolvedValue([
        {
          id: uuid(1),
          channel: 'email',
          status: 'queued',
          template_key: 't1',
          failure_reason: null,
        },
        {
          id: uuid(2),
          channel: 'email',
          status: 'delivered',
          template_key: 't1',
          failure_reason: null,
        },
      ]);

      const result = await service.notificationDelivery(TENANT_ID, {});

      expect(result.total_sent).toBe(1); // only the delivered one is "sent"
    });

    it('should count delivered and read as delivered', async () => {
      mockDataAccess.findNotifications.mockResolvedValue([
        {
          id: uuid(1),
          channel: 'email',
          status: 'delivered',
          template_key: 't1',
          failure_reason: null,
        },
        { id: uuid(2), channel: 'email', status: 'read', template_key: 't1', failure_reason: null },
      ]);

      const result = await service.notificationDelivery(TENANT_ID, {});

      expect(result.total_delivered).toBe(2);
    });

    it('should aggregate failure_reasons sorted by count descending', async () => {
      mockDataAccess.findNotifications.mockResolvedValue([
        {
          id: uuid(1),
          channel: 'email',
          status: 'failed',
          template_key: 't1',
          failure_reason: 'bounce',
        },
        {
          id: uuid(2),
          channel: 'email',
          status: 'failed',
          template_key: 't1',
          failure_reason: 'bounce',
        },
        {
          id: uuid(3),
          channel: 'email',
          status: 'failed',
          template_key: 't1',
          failure_reason: 'bounce',
        },
        {
          id: uuid(4),
          channel: 'email',
          status: 'failed',
          template_key: 't1',
          failure_reason: 'timeout',
        },
        {
          id: uuid(5),
          channel: 'email',
          status: 'failed',
          template_key: 't1',
          failure_reason: 'invalid_address',
        },
        {
          id: uuid(6),
          channel: 'email',
          status: 'failed',
          template_key: 't1',
          failure_reason: 'invalid_address',
        },
      ]);

      const result = await service.notificationDelivery(TENANT_ID, {});

      expect(result.failure_reasons[0]).toEqual({ reason: 'bounce', count: 3 });
      expect(result.failure_reasons[1]).toEqual({ reason: 'invalid_address', count: 2 });
      expect(result.failure_reasons[2]).toEqual({ reason: 'timeout', count: 1 });
    });
  });

  // ─── studentExportPack() ──────────────────────────────────────────

  describe('studentExportPack()', () => {
    const mockStudent = {
      id: STUDENT_ID,
      student_number: 'STU-001',
      first_name: 'Ali',
      last_name: 'Ahmed',
      first_name_ar: null,
      last_name_ar: null,
      date_of_birth: new Date('2015-03-01'),
      gender: 'male',
      status: 'active',
      entry_date: new Date('2022-09-01'),
      exit_date: null,
      year_group_id: uuid(10),
      medical_notes: null,
      has_allergy: false,
      allergy_details: null,
      year_group: { id: uuid(10), name: 'Year 3' },
      household: { id: HOUSEHOLD_ID, household_name: 'Ahmed Family' },
    };

    it('should return complete student export pack', async () => {
      mockDataAccess.findStudentById.mockResolvedValue(mockStudent);
      mockDataAccess.findAttendanceRecords.mockResolvedValue([]);
      mockDataAccess.findGrades.mockResolvedValue([]);
      mockDataAccess.findReportCards.mockResolvedValue([]);
      mockDataAccess.findClassEnrolments.mockResolvedValue([]);

      const result = await service.studentExportPack(TENANT_ID, STUDENT_ID);

      expect(result.subject_type).toBe('student');
      expect(result.subject_id).toBe(STUDENT_ID);
      expect(result.exported_at).toBeDefined();
      expect(result.sections).toHaveLength(5);
    });

    it('should include profile, attendance, grades, report_cards, class_enrolments sections', async () => {
      mockDataAccess.findStudentById.mockResolvedValue(mockStudent);
      mockDataAccess.findAttendanceRecords.mockResolvedValue([]);
      mockDataAccess.findGrades.mockResolvedValue([]);
      mockDataAccess.findReportCards.mockResolvedValue([]);
      mockDataAccess.findClassEnrolments.mockResolvedValue([]);

      const result = await service.studentExportPack(TENANT_ID, STUDENT_ID);
      const sectionNames = result.sections.map((s) => s.section);

      expect(sectionNames).toEqual([
        'profile',
        'attendance_records',
        'grades',
        'report_cards',
        'class_enrolments',
      ]);
    });

    it('should throw STUDENT_NOT_FOUND for invalid student', async () => {
      mockDataAccess.findStudentById.mockResolvedValue(null);

      await expect(service.studentExportPack(TENANT_ID, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );

      await expect(service.studentExportPack(TENANT_ID, 'non-existent')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STUDENT_NOT_FOUND' }),
      });
    });

    it('should limit attendance records to 200', async () => {
      mockDataAccess.findStudentById.mockResolvedValue(mockStudent);
      mockDataAccess.findAttendanceRecords.mockResolvedValue([]);
      mockDataAccess.findGrades.mockResolvedValue([]);
      mockDataAccess.findReportCards.mockResolvedValue([]);
      mockDataAccess.findClassEnrolments.mockResolvedValue([]);

      await service.studentExportPack(TENANT_ID, STUDENT_ID);

      expect(mockDataAccess.findAttendanceRecords).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ take: 200 }),
      );
    });

    it('should format numeric grade scores as numbers', async () => {
      mockDataAccess.findStudentById.mockResolvedValue(mockStudent);
      mockDataAccess.findAttendanceRecords.mockResolvedValue([]);
      mockDataAccess.findGrades.mockResolvedValue([
        {
          id: uuid(1),
          raw_score: { toNumber: () => 95, toString: () => '95' } as unknown, // Prisma Decimal mock
          is_missing: false,
          comment: null,
          entered_at: new Date('2025-05-10'),
          assessment: {
            id: uuid(2),
            title: 'Math Final',
            status: 'published',
            max_score: { toNumber: () => 100 },
          },
        },
      ]);
      mockDataAccess.findReportCards.mockResolvedValue([]);
      mockDataAccess.findClassEnrolments.mockResolvedValue([]);

      const result = await service.studentExportPack(TENANT_ID, STUDENT_ID);
      const gradesSection = result.sections.find((s) => s.section === 'grades')!;

      // Number() on a Decimal-like object should produce a number
      expect(typeof (gradesSection.data[0] as Record<string, unknown>).raw_score).toBe('number');
      expect((gradesSection.data[0] as Record<string, unknown>).raw_score).toBe(95);
    });
  });

  // ─── householdExportPack() ────────────────────────────────────────

  describe('householdExportPack()', () => {
    const mockHousehold = {
      id: HOUSEHOLD_ID,
      household_name: 'Smith Family',
      address_line_1: '123 Main St',
      address_line_2: null,
      city: 'Dubai',
      country: 'AE',
      postal_code: '12345',
      status: 'active',
      billing_parent: { id: uuid(100), first_name: 'John', last_name: 'Smith' },
      students: [
        {
          id: uuid(1),
          first_name: 'Tom',
          last_name: 'Smith',
          status: 'active',
          year_group: { name: 'Year 3' },
        },
      ],
      household_parents: [
        {
          role_label: 'Father',
          parent: { id: uuid(100), first_name: 'John', last_name: 'Smith' },
        },
        {
          role_label: 'Mother',
          parent: { id: uuid(101), first_name: 'Jane', last_name: 'Smith' },
        },
      ],
    };

    it('should return complete household export pack', async () => {
      mockDataAccess.findHouseholdById.mockResolvedValue(mockHousehold);
      mockDataAccess.findInvoices.mockResolvedValue([]);
      mockDataAccess.findPayments.mockResolvedValue([]);

      const result = await service.householdExportPack(TENANT_ID, HOUSEHOLD_ID);

      expect(result.subject_type).toBe('household');
      expect(result.subject_id).toBe(HOUSEHOLD_ID);
      expect(result.exported_at).toBeDefined();
      expect(result.sections).toHaveLength(3);
    });

    it('should include profile, invoices, payments sections', async () => {
      mockDataAccess.findHouseholdById.mockResolvedValue(mockHousehold);
      mockDataAccess.findInvoices.mockResolvedValue([]);
      mockDataAccess.findPayments.mockResolvedValue([]);

      const result = await service.householdExportPack(TENANT_ID, HOUSEHOLD_ID);
      const sectionNames = result.sections.map((s) => s.section);

      expect(sectionNames).toEqual(['profile', 'invoices', 'payments']);
    });

    it('should throw HOUSEHOLD_NOT_FOUND for invalid household', async () => {
      mockDataAccess.findHouseholdById.mockResolvedValue(null);

      await expect(service.householdExportPack(TENANT_ID, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );

      await expect(service.householdExportPack(TENANT_ID, 'non-existent')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'HOUSEHOLD_NOT_FOUND' }),
      });
    });

    it('should limit invoices to 100', async () => {
      mockDataAccess.findHouseholdById.mockResolvedValue(mockHousehold);
      mockDataAccess.findInvoices.mockResolvedValue([]);
      mockDataAccess.findPayments.mockResolvedValue([]);

      await service.householdExportPack(TENANT_ID, HOUSEHOLD_ID);

      expect(mockDataAccess.findInvoices).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ take: 100 }),
      );
    });

    it('should limit payments to 100', async () => {
      mockDataAccess.findHouseholdById.mockResolvedValue(mockHousehold);
      mockDataAccess.findInvoices.mockResolvedValue([]);
      mockDataAccess.findPayments.mockResolvedValue([]);

      await service.householdExportPack(TENANT_ID, HOUSEHOLD_ID);

      expect(mockDataAccess.findPayments).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ take: 100 }),
      );
    });

    it('should include parents and students in profile section', async () => {
      mockDataAccess.findHouseholdById.mockResolvedValue(mockHousehold);
      mockDataAccess.findInvoices.mockResolvedValue([]);
      mockDataAccess.findPayments.mockResolvedValue([]);

      const result = await service.householdExportPack(TENANT_ID, HOUSEHOLD_ID);
      const profileSection = result.sections.find((s) => s.section === 'profile')!;
      const profile = profileSection.data[0] as Record<string, unknown>;

      expect(profile.parents).toEqual([
        { id: uuid(100), name: 'John Smith', role_label: 'Father' },
        { id: uuid(101), name: 'Jane Smith', role_label: 'Mother' },
      ]);
      expect(profile.students).toEqual([
        { id: uuid(1), name: 'Tom Smith', status: 'active', year_group: 'Year 3' },
      ]);
    });

    it('should handle household with billing_parent null', async () => {
      const householdNoBilling = {
        ...mockHousehold,
        billing_parent: null,
      };
      mockDataAccess.findHouseholdById.mockResolvedValue(householdNoBilling);
      mockDataAccess.findInvoices.mockResolvedValue([]);
      mockDataAccess.findPayments.mockResolvedValue([]);

      const result = await service.householdExportPack(TENANT_ID, HOUSEHOLD_ID);
      const profileSection = result.sections.find((s) => s.section === 'profile')!;
      const profile = profileSection.data[0] as Record<string, unknown>;

      expect(profile.billing_parent).toBeNull();
    });

    it('should handle student with no year_group (null)', async () => {
      const householdNoYG = {
        ...mockHousehold,
        students: [
          {
            id: uuid(1),
            first_name: 'Tom',
            last_name: 'Smith',
            status: 'active',
            year_group: null,
          },
        ],
      };
      mockDataAccess.findHouseholdById.mockResolvedValue(householdNoYG);
      mockDataAccess.findInvoices.mockResolvedValue([]);
      mockDataAccess.findPayments.mockResolvedValue([]);

      const result = await service.householdExportPack(TENANT_ID, HOUSEHOLD_ID);
      const profileSection = result.sections.find((s) => s.section === 'profile')!;
      const profile = profileSection.data[0] as Record<string, unknown>;
      const students = profile.students as Array<Record<string, unknown>>;

      expect(students[0]!.year_group).toBeNull();
    });

    it('should handle invoice with issue_date null and write_off_amount null', async () => {
      mockDataAccess.findHouseholdById.mockResolvedValue(mockHousehold);
      mockDataAccess.findInvoices.mockResolvedValue([
        {
          id: uuid(1),
          invoice_number: 'INV-001',
          status: 'issued',
          issue_date: null,
          due_date: new Date('2025-07-01'),
          total_amount: 5000,
          balance_amount: 5000,
          discount_amount: 0,
          write_off_amount: null,
          write_off_reason: null,
          currency_code: 'AED',
        },
      ]);
      mockDataAccess.findPayments.mockResolvedValue([]);

      const result = await service.householdExportPack(TENANT_ID, HOUSEHOLD_ID);
      const invoicesSection = result.sections.find((s) => s.section === 'invoices')!;
      const inv = invoicesSection.data[0] as Record<string, unknown>;

      expect(inv.issue_date).toBeNull();
      expect(inv.write_off_amount).toBeNull();
    });

    it('should format payment data in payments section', async () => {
      mockDataAccess.findHouseholdById.mockResolvedValue(mockHousehold);
      mockDataAccess.findInvoices.mockResolvedValue([]);
      mockDataAccess.findPayments.mockResolvedValue([
        {
          id: uuid(1),
          payment_reference: 'PAY-001',
          payment_method: 'bank_transfer',
          amount: 2500,
          currency_code: 'AED',
          status: 'confirmed',
          received_at: new Date('2025-06-15'),
        },
      ]);

      const result = await service.householdExportPack(TENANT_ID, HOUSEHOLD_ID);
      const paymentsSection = result.sections.find((s) => s.section === 'payments')!;
      const payment = paymentsSection.data[0] as Record<string, unknown>;

      expect(payment.payment_reference).toBe('PAY-001');
      expect(payment.amount).toBe(2500);
      expect(payment.received_at).toBe('2025-06-15T00:00:00.000Z');
    });
  });

  // ─── promotionRollover() edge cases ──────────────────────────────────

  describe('promotionRollover() — edge cases', () => {
    it('edge: should default audit log metadata counts to 0 when undefined', async () => {
      mockDataAccess.findFirstAuditLog.mockResolvedValue({
        id: uuid(1),
        metadata_json: {},
      });
      mockDataAccess.findYearGroups.mockResolvedValue([{ id: uuid(10), name: 'Year 1' }]);

      const result = await service.promotionRollover(TENANT_ID, ACADEMIC_YEAR_ID);

      expect(result.promoted).toBe(0);
      expect(result.held_back).toBe(0);
      expect(result.graduated).toBe(0);
      expect(result.withdrawn).toBe(0);
    });

    it('edge: should handle student with empty class_enrolments array (enrolmentYearGroupId null)', async () => {
      mockDataAccess.findFirstAuditLog.mockResolvedValue(null);
      mockDataAccess.findYearGroups.mockResolvedValue([
        { id: uuid(10), name: 'Year 1', next_year_group: null },
      ]);
      mockDataAccess.findStudents.mockResolvedValue([
        {
          id: uuid(1),
          status: 'active',
          year_group_id: uuid(10),
          class_enrolments: [],
        },
      ]);

      const result = await service.promotionRollover(TENANT_ID, ACADEMIC_YEAR_ID);

      // No enrolmentYearGroupId -> originalYg is null -> falls through to held_back
      expect(result.held_back).toBe(1);
      expect(result.promoted).toBe(0);
    });

    it('edge: should handle student with class_enrolment having null year_group_id', async () => {
      mockDataAccess.findFirstAuditLog.mockResolvedValue(null);
      mockDataAccess.findYearGroups.mockResolvedValue([
        { id: uuid(10), name: 'Year 1', next_year_group: null },
      ]);
      mockDataAccess.findStudents.mockResolvedValue([
        {
          id: uuid(1),
          status: 'active',
          year_group_id: uuid(10),
          class_enrolments: [{ class_entity: { year_group_id: null } }],
        },
      ]);

      const result = await service.promotionRollover(TENANT_ID, ACADEMIC_YEAR_ID);

      // enrolmentYearGroupId is null -> originalYg is null -> held_back
      expect(result.held_back).toBe(1);
    });

    it('edge: should filter details to only non-zero year groups', async () => {
      mockDataAccess.findFirstAuditLog.mockResolvedValue(null);
      mockDataAccess.findYearGroups.mockResolvedValue([
        { id: uuid(10), name: 'Year 1', next_year_group: { id: uuid(11) } },
        { id: uuid(11), name: 'Year 2', next_year_group: null },
        { id: uuid(12), name: 'Year 3', next_year_group: null },
      ]);
      mockDataAccess.findStudents.mockResolvedValue([
        {
          id: uuid(1),
          status: 'active',
          year_group_id: uuid(11),
          class_enrolments: [{ class_entity: { year_group_id: uuid(10) } }],
        },
      ]);

      const result = await service.promotionRollover(TENANT_ID, ACADEMIC_YEAR_ID);

      // Year 3 has zero counts across all categories, so it should be filtered out
      expect(result.details.find((d) => d.year_group_id === uuid(12))).toBeUndefined();
      expect(result.details.find((d) => d.year_group_id === uuid(10))).toBeDefined();
    });

    it('edge: graduated student should increment detailEntry.graduated when enrolmentYearGroupId exists', async () => {
      mockDataAccess.findFirstAuditLog.mockResolvedValue(null);
      mockDataAccess.findYearGroups.mockResolvedValue([
        { id: uuid(10), name: 'Year 6', next_year_group: null },
      ]);
      mockDataAccess.findStudents.mockResolvedValue([
        {
          id: uuid(1),
          status: 'graduated',
          year_group_id: uuid(10),
          class_enrolments: [{ class_entity: { year_group_id: uuid(10) } }],
        },
      ]);

      const result = await service.promotionRollover(TENANT_ID, ACADEMIC_YEAR_ID);
      const detail = result.details.find((d) => d.year_group_id === uuid(10));

      expect(detail).toBeDefined();
      expect(detail!.graduated).toBe(1);
    });

    it('edge: graduated student with no enrolment should not increment detailEntry', async () => {
      mockDataAccess.findFirstAuditLog.mockResolvedValue(null);
      mockDataAccess.findYearGroups.mockResolvedValue([
        { id: uuid(10), name: 'Year 6', next_year_group: null },
      ]);
      mockDataAccess.findStudents.mockResolvedValue([
        {
          id: uuid(1),
          status: 'graduated',
          year_group_id: uuid(10),
          class_enrolments: [],
        },
      ]);

      const result = await service.promotionRollover(TENANT_ID, ACADEMIC_YEAR_ID);

      // Graduated increments the top-level counter regardless
      expect(result.graduated).toBe(1);
      // But detail entry is not found since enrolmentYearGroupId is null
      // Year group still appears because graduated > 0 is not incremented via detail
      // Actually detail has graduated=0 since detailEntry is null, so it gets filtered
      // unless there are other students. In this case year group has 0 across the board.
      expect(result.details).toHaveLength(0);
    });
  });

  // ─── notificationDelivery() edge cases ─────────────────────────────

  describe('notificationDelivery() — edge cases', () => {
    it('edge: should use "unknown" as template key when template_key is null', async () => {
      mockDataAccess.findNotifications.mockResolvedValue([
        {
          id: uuid(1),
          channel: 'email',
          status: 'delivered',
          template_key: null,
          failure_reason: null,
        },
      ]);

      const result = await service.notificationDelivery(TENANT_ID, {});

      const unknownTemplate = result.by_template.find((t) => t.template_key === 'unknown');
      expect(unknownTemplate).toBeDefined();
      expect(unknownTemplate!.sent).toBe(1);
    });

    it('edge: should not add failure_reason when failed notification has null failure_reason', async () => {
      mockDataAccess.findNotifications.mockResolvedValue([
        {
          id: uuid(1),
          channel: 'email',
          status: 'failed',
          template_key: 't1',
          failure_reason: null,
        },
      ]);

      const result = await service.notificationDelivery(TENANT_ID, {});

      expect(result.total_failed).toBe(1);
      expect(result.failure_reasons).toHaveLength(0);
    });

    it('edge: should handle only start_date without end_date', async () => {
      mockDataAccess.findNotifications.mockResolvedValue([]);

      await service.notificationDelivery(TENANT_ID, { start_date: '2025-01-01' });

      expect(mockDataAccess.findNotifications).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          created_at: { gte: new Date('2025-01-01') },
        }),
        expect.any(Object),
      );
    });

    it('edge: should handle only end_date without start_date', async () => {
      mockDataAccess.findNotifications.mockResolvedValue([]);

      await service.notificationDelivery(TENANT_ID, { end_date: '2025-12-31' });

      expect(mockDataAccess.findNotifications).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          created_at: { lte: new Date('2025-12-31') },
        }),
        expect.any(Object),
      );
    });

    it('edge: should handle empty notifications list', async () => {
      mockDataAccess.findNotifications.mockResolvedValue([]);

      const result = await service.notificationDelivery(TENANT_ID, {});

      expect(result.total_sent).toBe(0);
      expect(result.total_delivered).toBe(0);
      expect(result.total_failed).toBe(0);
      expect(result.by_channel).toHaveLength(0);
      expect(result.by_template).toHaveLength(0);
      expect(result.failure_reasons).toHaveLength(0);
    });
  });

  // ─── writeOffs() edge cases ──────────────────────────────────────────

  describe('writeOffs() — edge cases', () => {
    it('edge: should default write_off_amount to 0 when null', async () => {
      mockDataAccess.findInvoices
        .mockResolvedValueOnce([
          {
            id: uuid(1),
            invoice_number: 'INV-001',
            write_off_amount: null,
            write_off_reason: null,
            updated_at: new Date('2025-06-01'),
            household: { household_name: 'Smith Family' },
          },
        ])
        .mockResolvedValueOnce([]);
      mockDataAccess.countInvoices.mockResolvedValue(1);

      const result = await service.writeOffs(TENANT_ID, {});

      expect(result.data.entries[0]!.amount).toBe(0);
    });

    it('edge: should handle only start_date without end_date in writeOffs', async () => {
      mockDataAccess.findInvoices.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockDataAccess.countInvoices.mockResolvedValue(0);

      await service.writeOffs(TENANT_ID, { start_date: '2025-01-01' });

      expect(mockDataAccess.findInvoices).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          where: expect.objectContaining({
            updated_at: { gte: new Date('2025-01-01') },
          }),
        }),
      );
    });

    it('edge: should handle only end_date without start_date in writeOffs', async () => {
      mockDataAccess.findInvoices.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockDataAccess.countInvoices.mockResolvedValue(0);

      await service.writeOffs(TENANT_ID, { end_date: '2025-12-31' });

      expect(mockDataAccess.findInvoices).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          where: expect.objectContaining({
            updated_at: { lte: new Date('2025-12-31') },
          }),
        }),
      );
    });

    it('edge: should use default page=1 and pageSize=20 when not provided', async () => {
      mockDataAccess.findInvoices.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockDataAccess.countInvoices.mockResolvedValue(0);

      const result = await service.writeOffs(TENANT_ID, {});

      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(20);
    });

    it('edge: should apply discount date filter when date range given', async () => {
      mockDataAccess.findInvoices
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ discount_amount: 100 }]);
      mockDataAccess.countInvoices.mockResolvedValue(0);

      await service.writeOffs(TENANT_ID, {
        start_date: '2025-01-01',
        end_date: '2025-12-31',
      });

      // Second call to findInvoices (discounts) should also have the date filter
      const secondCall = mockDataAccess.findInvoices.mock.calls[1]![1] as Record<string, unknown>;
      const where = secondCall.where as Record<string, unknown>;
      expect(where.updated_at).toEqual({
        gte: new Date('2025-01-01'),
        lte: new Date('2025-12-31'),
      });
    });
  });

  // ─── feeGenerationRuns() edge cases ──────────────────────────────────

  describe('feeGenerationRuns() — edge cases', () => {
    it('edge: should use default page=1 and pageSize=20 when not provided', async () => {
      mockDataAccess.findAuditLogs.mockResolvedValue([]);
      mockDataAccess.countAuditLogs.mockResolvedValue(0);

      const result = await service.feeGenerationRuns(TENANT_ID, {});

      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(20);
    });

    it('edge: should not include metadata_json filter when academic_year_id is absent', async () => {
      mockDataAccess.findAuditLogs.mockResolvedValue([]);
      mockDataAccess.countAuditLogs.mockResolvedValue(0);

      await service.feeGenerationRuns(TENANT_ID, {});

      const callArgs = mockDataAccess.findAuditLogs.mock.calls[0]![1] as Record<string, unknown>;
      const where = callArgs.where as Record<string, unknown>;
      expect(where.metadata_json).toBeUndefined();
    });
  });

  // ─── studentExportPack() edge cases ──────────────────────────────────

  describe('studentExportPack() — edge cases', () => {
    const mockStudentBasic = {
      id: STUDENT_ID,
      student_number: 'STU-001',
      first_name: 'Ali',
      last_name: 'Ahmed',
      first_name_ar: null,
      last_name_ar: null,
      date_of_birth: new Date('2015-03-01'),
      gender: 'male',
      status: 'active',
      entry_date: new Date('2022-09-01'),
      exit_date: null,
      year_group_id: uuid(10),
      medical_notes: null,
      has_allergy: false,
      allergy_details: null,
      year_group: { id: uuid(10), name: 'Year 3' },
      household: { id: HOUSEHOLD_ID, household_name: 'Ahmed Family' },
    };

    it('edge: should handle grade with null raw_score', async () => {
      mockDataAccess.findStudentById.mockResolvedValue(mockStudentBasic);
      mockDataAccess.findAttendanceRecords.mockResolvedValue([]);
      mockDataAccess.findGrades.mockResolvedValue([
        {
          id: uuid(1),
          raw_score: null,
          is_missing: true,
          comment: null,
          entered_at: null,
          assessment: { id: uuid(2), title: 'Quiz 1', status: 'published', max_score: 50 },
        },
      ]);
      mockDataAccess.findReportCards.mockResolvedValue([]);
      mockDataAccess.findClassEnrolments.mockResolvedValue([]);

      const result = await service.studentExportPack(TENANT_ID, STUDENT_ID);
      const gradesSection = result.sections.find((s) => s.section === 'grades')!;
      const grade = gradesSection.data[0] as Record<string, unknown>;

      expect(grade.raw_score).toBeNull();
      expect(grade.entered_at).toBeNull();
      expect(grade.is_missing).toBe(true);
    });

    it('edge: should handle report card with null published_at', async () => {
      mockDataAccess.findStudentById.mockResolvedValue(mockStudentBasic);
      mockDataAccess.findAttendanceRecords.mockResolvedValue([]);
      mockDataAccess.findGrades.mockResolvedValue([]);
      mockDataAccess.findReportCards.mockResolvedValue([
        {
          id: uuid(1),
          status: 'draft',
          template_locale: 'en',
          teacher_comment: null,
          principal_comment: null,
          published_at: null,
          academic_period: { id: uuid(2), name: 'Term 1' },
        },
      ]);
      mockDataAccess.findClassEnrolments.mockResolvedValue([]);

      const result = await service.studentExportPack(TENANT_ID, STUDENT_ID);
      const rcSection = result.sections.find((s) => s.section === 'report_cards')!;
      const rc = rcSection.data[0] as Record<string, unknown>;

      expect(rc.published_at).toBeNull();
    });

    it('edge: should handle class enrolment with null academic_year', async () => {
      mockDataAccess.findStudentById.mockResolvedValue(mockStudentBasic);
      mockDataAccess.findAttendanceRecords.mockResolvedValue([]);
      mockDataAccess.findGrades.mockResolvedValue([]);
      mockDataAccess.findReportCards.mockResolvedValue([]);
      mockDataAccess.findClassEnrolments.mockResolvedValue([
        {
          id: uuid(1),
          status: 'active',
          start_date: new Date('2025-09-01'),
          end_date: null,
          class_entity: { id: uuid(2), name: 'Class 3A', academic_year: null },
        },
      ]);

      const result = await service.studentExportPack(TENANT_ID, STUDENT_ID);
      const enrolSection = result.sections.find((s) => s.section === 'class_enrolments')!;
      const enrol = enrolSection.data[0] as Record<string, unknown>;

      expect(enrol.academic_year_name).toBeNull();
    });

    it('edge: should format attendance records with session data', async () => {
      mockDataAccess.findStudentById.mockResolvedValue(mockStudentBasic);
      mockDataAccess.findAttendanceRecords.mockResolvedValue([
        {
          id: uuid(1),
          status: 'present',
          reason: null,
          marked_at: new Date('2025-05-10T08:00:00Z'),
          session: {
            id: uuid(2),
            session_date: new Date('2025-05-10'),
            status: 'completed',
          },
        },
      ]);
      mockDataAccess.findGrades.mockResolvedValue([]);
      mockDataAccess.findReportCards.mockResolvedValue([]);
      mockDataAccess.findClassEnrolments.mockResolvedValue([]);

      const result = await service.studentExportPack(TENANT_ID, STUDENT_ID);
      const attendSection = result.sections.find((s) => s.section === 'attendance_records')!;
      const record = attendSection.data[0] as Record<string, unknown>;

      expect(record.status).toBe('present');
      expect(record.marked_at).toBe('2025-05-10T08:00:00.000Z');
    });
  });
});
