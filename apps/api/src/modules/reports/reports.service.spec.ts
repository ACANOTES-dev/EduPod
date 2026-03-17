import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
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
  let mockPrisma: {
    auditLog: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    yearGroup: {
      findMany: jest.Mock;
    };
    student: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    academicYear: {
      findFirst: jest.Mock;
    };
    invoice: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
    notification: {
      findMany: jest.Mock;
    };
    attendanceRecord: {
      findMany: jest.Mock;
    };
    grade: {
      findMany: jest.Mock;
    };
    reportCard: {
      findMany: jest.Mock;
    };
    classEnrolment: {
      findMany: jest.Mock;
    };
    household: {
      findFirst: jest.Mock;
    };
    payment: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      auditLog: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      yearGroup: {
        findMany: jest.fn(),
      },
      student: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      academicYear: {
        findFirst: jest.fn(),
      },
      invoice: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      notification: {
        findMany: jest.fn(),
      },
      attendanceRecord: {
        findMany: jest.fn(),
      },
      grade: {
        findMany: jest.fn(),
      },
      reportCard: {
        findMany: jest.fn(),
      },
      classEnrolment: {
        findMany: jest.fn(),
      },
      household: {
        findFirst: jest.fn(),
      },
      payment: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  // ─── promotionRollover() ───────────────────────────────────────────

  describe('promotionRollover()', () => {
    it('should return promotion data from audit log when available', async () => {
      mockPrisma.auditLog.findFirst.mockResolvedValue({
        id: uuid(1),
        metadata_json: {
          promoted: 50,
          held_back: 5,
          graduated: 10,
          withdrawn: 2,
        },
      });
      mockPrisma.yearGroup.findMany.mockResolvedValue([
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
      mockPrisma.auditLog.findFirst.mockResolvedValue(null);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.yearGroup.findMany.mockResolvedValue([
        { id: uuid(10), name: 'Year 1', display_order: 1, next_year_group: { id: uuid(11) } },
        { id: uuid(11), name: 'Year 2', display_order: 2, next_year_group: null },
      ]);
      // One student promoted (year_group changed), one held back (same)
      mockPrisma.student.findMany.mockResolvedValue([
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
      mockPrisma.auditLog.findFirst.mockResolvedValue(null);
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      await expect(
        service.promotionRollover(TENANT_ID, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.promotionRollover(TENANT_ID, 'non-existent-id'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ACADEMIC_YEAR_NOT_FOUND' }),
      });
    });

    it('should count student as promoted when year_group changed', async () => {
      mockPrisma.auditLog.findFirst.mockResolvedValue(null);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.yearGroup.findMany.mockResolvedValue([
        { id: uuid(10), name: 'Year 1', display_order: 1, next_year_group: { id: uuid(11) } },
        { id: uuid(11), name: 'Year 2', display_order: 2, next_year_group: null },
      ]);
      mockPrisma.student.findMany.mockResolvedValue([
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
      mockPrisma.auditLog.findFirst.mockResolvedValue(null);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.yearGroup.findMany.mockResolvedValue([
        { id: uuid(10), name: 'Year 1', display_order: 1, next_year_group: { id: uuid(11) } },
      ]);
      mockPrisma.student.findMany.mockResolvedValue([
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
      mockPrisma.auditLog.findFirst.mockResolvedValue(null);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.yearGroup.findMany.mockResolvedValue([
        { id: uuid(10), name: 'Year 6', display_order: 1, next_year_group: null },
      ]);
      mockPrisma.student.findMany.mockResolvedValue([
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
      mockPrisma.auditLog.findFirst.mockResolvedValue(null);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.yearGroup.findMany.mockResolvedValue([
        { id: uuid(10), name: 'Year 1', display_order: 1, next_year_group: null },
      ]);
      mockPrisma.student.findMany.mockResolvedValue([
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
      mockPrisma.auditLog.findFirst.mockResolvedValue(null);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.yearGroup.findMany.mockResolvedValue([
        { id: uuid(10), name: 'Year 1', display_order: 1, next_year_group: { id: uuid(11) } },
        { id: uuid(11), name: 'Year 2', display_order: 2, next_year_group: null },
      ]);
      mockPrisma.student.findMany.mockResolvedValue([
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
      mockPrisma.auditLog.findMany.mockResolvedValue([
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
      mockPrisma.auditLog.count.mockResolvedValue(2);

      const result = await service.feeGenerationRuns(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(result.data[0]!.invoices_created).toBe(50);
    });

    it('should filter by academic_year_id via metadata_json path', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.feeGenerationRuns(TENANT_ID, { academic_year_id: ACADEMIC_YEAR_ID });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
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
      mockPrisma.auditLog.findMany.mockResolvedValue([
        {
          id: uuid(1),
          created_at: now,
          metadata_json: { invoices_created: 100, total_amount: 50000, households_affected: 60 },
        },
      ]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const result = await service.feeGenerationRuns(TENANT_ID, {});
      const entry = result.data[0]!;

      expect(entry.invoices_created).toBe(100);
      expect(entry.total_amount).toBe(50000);
      expect(entry.households_affected).toBe(60);
    });

    it('should default numeric fields to 0 when missing from metadata', async () => {
      const now = new Date();
      mockPrisma.auditLog.findMany.mockResolvedValue([
        {
          id: uuid(1),
          created_at: now,
          metadata_json: {},
        },
      ]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

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
      mockPrisma.invoice.findMany
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
      mockPrisma.invoice.count.mockResolvedValue(1);

      const result = await service.writeOffs(TENANT_ID, {});

      expect(result.data.entries).toHaveLength(1);
      expect(result.data.entries[0]!.invoice_number).toBe('INV-001');
      expect(result.data.entries[0]!.household_name).toBe('Smith Family');

      // Verify the where clause targets written_off status
      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'written_off' }),
        }),
      );
    });

    it('should apply date range filter on updated_at', async () => {
      mockPrisma.invoice.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.invoice.count.mockResolvedValue(0);

      await service.writeOffs(TENANT_ID, {
        start_date: '2025-01-01',
        end_date: '2025-12-31',
      });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
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
      mockPrisma.invoice.findMany
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
      mockPrisma.invoice.count.mockResolvedValue(3);

      const result = await service.writeOffs(TENANT_ID, {});

      expect(result.data.totals.total_written_off).toBe(600);
    });

    it('should compute total_discounts from discount invoices', async () => {
      mockPrisma.invoice.findMany
        .mockResolvedValueOnce([]) // write-off query
        .mockResolvedValueOnce([
          { discount_amount: 150 },
          { discount_amount: 250 },
        ]); // discount query
      mockPrisma.invoice.count.mockResolvedValue(0);

      const result = await service.writeOffs(TENANT_ID, {});

      expect(result.data.totals.total_discounts).toBe(400);
    });

    it('should handle empty results with entries=[] and totals both 0', async () => {
      mockPrisma.invoice.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.invoice.count.mockResolvedValue(0);

      const result = await service.writeOffs(TENANT_ID, {});

      expect(result.data.entries).toEqual([]);
      expect(result.data.totals.total_written_off).toBe(0);
      expect(result.data.totals.total_discounts).toBe(0);
    });
  });

  // ─── notificationDelivery() ───────────────────────────────────────

  describe('notificationDelivery()', () => {
    it('should aggregate notification stats by channel', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        { id: uuid(1), channel: 'email', status: 'delivered', template_key: 't1', failure_reason: null },
        { id: uuid(2), channel: 'email', status: 'failed', template_key: 't1', failure_reason: 'bounce' },
        { id: uuid(3), channel: 'whatsapp', status: 'delivered', template_key: 't1', failure_reason: null },
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
      mockPrisma.notification.findMany.mockResolvedValue([
        { id: uuid(1), channel: 'email', status: 'delivered', template_key: 'welcome', failure_reason: null },
        { id: uuid(2), channel: 'email', status: 'delivered', template_key: 'welcome', failure_reason: null },
        { id: uuid(3), channel: 'email', status: 'delivered', template_key: 'invoice', failure_reason: null },
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
        notifications.push({ id: uuid(i), channel: 'email', status: 'delivered', template_key: 't1', failure_reason: null });
      }
      for (let i = 80; i < 100; i++) {
        notifications.push({ id: uuid(i), channel: 'email', status: 'failed', template_key: 't1', failure_reason: 'bounce' });
      }
      mockPrisma.notification.findMany.mockResolvedValue(notifications);

      const result = await service.notificationDelivery(TENANT_ID, {});

      const emailChannel = result.by_channel.find((c) => c.channel === 'email');
      expect(emailChannel!.delivery_rate).toBe(80.00);
    });

    it('should handle delivery_rate of 0 when nothing sent', async () => {
      // All queued — none sent
      mockPrisma.notification.findMany.mockResolvedValue([
        { id: uuid(1), channel: 'email', status: 'queued', template_key: 't1', failure_reason: null },
      ]);

      const result = await service.notificationDelivery(TENANT_ID, {});

      // Queued notifications are not counted as "sent", so the channel entry
      // will not exist in by_channel (it's only populated for non-queued statuses)
      // The total_sent should be 0
      expect(result.total_sent).toBe(0);
    });

    it('should filter by channel', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await service.notificationDelivery(TENANT_ID, { channel: 'email' });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ channel: 'email' }),
        }),
      );
    });

    it('should filter by template_key', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await service.notificationDelivery(TENANT_ID, { template_key: 'welcome' });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ template_key: 'welcome' }),
        }),
      );
    });

    it('should apply date range filter', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await service.notificationDelivery(TENANT_ID, {
        start_date: '2025-01-01',
        end_date: '2025-06-30',
      });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: {
              gte: new Date('2025-01-01'),
              lte: new Date('2025-06-30'),
            },
          }),
        }),
      );
    });

    it('should count queued notifications as not-sent', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        { id: uuid(1), channel: 'email', status: 'queued', template_key: 't1', failure_reason: null },
        { id: uuid(2), channel: 'email', status: 'delivered', template_key: 't1', failure_reason: null },
      ]);

      const result = await service.notificationDelivery(TENANT_ID, {});

      expect(result.total_sent).toBe(1); // only the delivered one is "sent"
    });

    it('should count delivered and read as delivered', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        { id: uuid(1), channel: 'email', status: 'delivered', template_key: 't1', failure_reason: null },
        { id: uuid(2), channel: 'email', status: 'read', template_key: 't1', failure_reason: null },
      ]);

      const result = await service.notificationDelivery(TENANT_ID, {});

      expect(result.total_delivered).toBe(2);
    });

    it('should aggregate failure_reasons sorted by count descending', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        { id: uuid(1), channel: 'email', status: 'failed', template_key: 't1', failure_reason: 'bounce' },
        { id: uuid(2), channel: 'email', status: 'failed', template_key: 't1', failure_reason: 'bounce' },
        { id: uuid(3), channel: 'email', status: 'failed', template_key: 't1', failure_reason: 'bounce' },
        { id: uuid(4), channel: 'email', status: 'failed', template_key: 't1', failure_reason: 'timeout' },
        { id: uuid(5), channel: 'email', status: 'failed', template_key: 't1', failure_reason: 'invalid_address' },
        { id: uuid(6), channel: 'email', status: 'failed', template_key: 't1', failure_reason: 'invalid_address' },
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
      mockPrisma.student.findFirst.mockResolvedValue(mockStudent);
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
      mockPrisma.grade.findMany.mockResolvedValue([]);
      mockPrisma.reportCard.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

      const result = await service.studentExportPack(TENANT_ID, STUDENT_ID);

      expect(result.subject_type).toBe('student');
      expect(result.subject_id).toBe(STUDENT_ID);
      expect(result.exported_at).toBeDefined();
      expect(result.sections).toHaveLength(5);
    });

    it('should include profile, attendance, grades, report_cards, class_enrolments sections', async () => {
      mockPrisma.student.findFirst.mockResolvedValue(mockStudent);
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
      mockPrisma.grade.findMany.mockResolvedValue([]);
      mockPrisma.reportCard.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

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
      mockPrisma.student.findFirst.mockResolvedValue(null);

      await expect(
        service.studentExportPack(TENANT_ID, 'non-existent'),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.studentExportPack(TENANT_ID, 'non-existent'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STUDENT_NOT_FOUND' }),
      });
    });

    it('should limit attendance records to 200', async () => {
      mockPrisma.student.findFirst.mockResolvedValue(mockStudent);
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
      mockPrisma.grade.findMany.mockResolvedValue([]);
      mockPrisma.reportCard.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

      await service.studentExportPack(TENANT_ID, STUDENT_ID);

      expect(mockPrisma.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });

    it('should format numeric grade scores as numbers', async () => {
      mockPrisma.student.findFirst.mockResolvedValue(mockStudent);
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
      mockPrisma.grade.findMany.mockResolvedValue([
        {
          id: uuid(1),
          raw_score: { toNumber: () => 95, toString: () => '95' } as unknown, // Prisma Decimal mock
          is_missing: false,
          comment: null,
          entered_at: new Date('2025-05-10'),
          assessment: { id: uuid(2), title: 'Math Final', status: 'published', max_score: { toNumber: () => 100 } },
        },
      ]);
      mockPrisma.reportCard.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

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
      mockPrisma.household.findFirst.mockResolvedValue(mockHousehold);
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([]);

      const result = await service.householdExportPack(TENANT_ID, HOUSEHOLD_ID);

      expect(result.subject_type).toBe('household');
      expect(result.subject_id).toBe(HOUSEHOLD_ID);
      expect(result.exported_at).toBeDefined();
      expect(result.sections).toHaveLength(3);
    });

    it('should include profile, invoices, payments sections', async () => {
      mockPrisma.household.findFirst.mockResolvedValue(mockHousehold);
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([]);

      const result = await service.householdExportPack(TENANT_ID, HOUSEHOLD_ID);
      const sectionNames = result.sections.map((s) => s.section);

      expect(sectionNames).toEqual(['profile', 'invoices', 'payments']);
    });

    it('should throw HOUSEHOLD_NOT_FOUND for invalid household', async () => {
      mockPrisma.household.findFirst.mockResolvedValue(null);

      await expect(
        service.householdExportPack(TENANT_ID, 'non-existent'),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.householdExportPack(TENANT_ID, 'non-existent'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'HOUSEHOLD_NOT_FOUND' }),
      });
    });

    it('should limit invoices to 100', async () => {
      mockPrisma.household.findFirst.mockResolvedValue(mockHousehold);
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([]);

      await service.householdExportPack(TENANT_ID, HOUSEHOLD_ID);

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('should limit payments to 100', async () => {
      mockPrisma.household.findFirst.mockResolvedValue(mockHousehold);
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([]);

      await service.householdExportPack(TENANT_ID, HOUSEHOLD_ID);

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('should include parents and students in profile section', async () => {
      mockPrisma.household.findFirst.mockResolvedValue(mockHousehold);
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([]);

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
  });
});
