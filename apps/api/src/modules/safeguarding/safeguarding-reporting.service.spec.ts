import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  BehaviourReadFacade,
  ConfigurationReadFacade,
  MOCK_FACADE_PROVIDERS,
} from '../../common/tests/mock-facades';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

import { SafeguardingReportingService } from './safeguarding-reporting.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONCERN_ID = 'concern-1';
const STUDENT_ID = 'student-1';

const mockRlsTx = {
  safeguardingConcern: {
    findFirst: jest.fn(),
  },
  tenantSetting: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

const makeCaseFileConcern = (overrides: Record<string, unknown> = {}) => ({
  id: CONCERN_ID,
  concern_number: 'CP-202603-001',
  concern_type: 'physical_abuse',
  severity: 'high_sev',
  status: 'reported',
  description: 'Incident report detail',
  immediate_actions_taken: null,
  is_tusla_referral: false,
  tusla_reference_number: null,
  tusla_referred_at: null,
  tusla_outcome: null,
  is_garda_referral: false,
  garda_reference_number: null,
  garda_referred_at: null,
  resolution_notes: null,
  resolved_at: null,
  sealed_at: null,
  sealed_reason: null,
  retention_until: new Date('2050-01-01'),
  created_at: new Date(),
  updated_at: new Date(),
  student: {
    id: STUDENT_ID,
    first_name: 'John',
    last_name: 'Doe',
    date_of_birth: new Date('2010-01-01'),
  },
  reported_by: { id: 'user-1', first_name: 'Staff', last_name: 'Reporter' },
  designated_liaison: null,
  assigned_to: null,
  sealed_by: null,
  seal_approved_by: null,
  actions: [],
  concern_incidents: [],
  ...overrides,
});

describe('SafeguardingReportingService', () => {
  let service: SafeguardingReportingService;
  let mockPrisma: {
    safeguardingConcern: { groupBy: jest.Mock; count: jest.Mock };
    tenantSetting: { findFirst: jest.Mock };
    behaviourTask: { findMany: jest.Mock };
    safeguardingAction: { findMany: jest.Mock };
  };
  let mockPdfRenderingService: { renderFromHtml: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      safeguardingConcern: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      tenantSetting: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      behaviourTask: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      safeguardingAction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockPdfRenderingService = {
      renderFromHtml: jest.fn().mockResolvedValue(Buffer.from('mock-pdf-buffer')),
    };

    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model as Record<string, jest.Mock>)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        SafeguardingReportingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PdfRenderingService, useValue: mockPdfRenderingService },
        {
          provide: BehaviourReadFacade,
          useValue: {
            findOverdueTasksByEntityTypes: mockPrisma.behaviourTask.findMany,
          },
        },
        {
          provide: ConfigurationReadFacade,
          useValue: {
            findSettingsJson: mockPrisma.tenantSetting.findFirst,
          },
        },
      ],
    }).compile();

    service = module.get<SafeguardingReportingService>(SafeguardingReportingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getDashboard ──────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('should aggregate dashboard metrics correctly', async () => {
      mockPrisma.safeguardingConcern.groupBy
        .mockResolvedValueOnce([{ severity: 'critical_sev', _count: 2 }]) // bySeverity
        .mockResolvedValueOnce([{ status: 'reported', _count: 3 }]); // byStatus

      // Mocks for SLAs (slaOverdue, slaDueSoon, slaOnTrack)
      mockPrisma.safeguardingConcern.count
        .mockResolvedValueOnce(1) // overdue
        .mockResolvedValueOnce(0) // due soon
        .mockResolvedValueOnce(2); // on track

      mockPrisma.behaviourTask.findMany.mockResolvedValue([]);
      mockPrisma.safeguardingAction.findMany.mockResolvedValue([]);

      const result = await service.getDashboard(TENANT_ID);

      expect(result.data.open_by_severity.critical).toBe(2);
      expect(result.data.by_status.reported).toBe(3);
      expect(result.data.sla_compliance.overdue).toBe(1);
      expect(result.data.sla_compliance.compliance_rate).toBe(67); // (2 / 3) * 100
    });

    it('should return 100% compliance rate when totalOpen is 0', async () => {
      mockPrisma.safeguardingConcern.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.safeguardingConcern.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.behaviourTask.findMany.mockResolvedValue([]);
      mockPrisma.safeguardingAction.findMany.mockResolvedValue([]);

      const result = await service.getDashboard(TENANT_ID);

      expect(result.data.sla_compliance.compliance_rate).toBe(100);
    });

    it('should map overdue tasks with correct fields', async () => {
      mockPrisma.safeguardingConcern.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.safeguardingConcern.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      mockPrisma.behaviourTask.findMany.mockResolvedValue([
        {
          id: 'task-1',
          title: 'Follow up required',
          priority: 'high',
          due_date: new Date('2026-01-15'),
          entity_type: 'safeguarding_concern',
          entity_id: CONCERN_ID,
        },
        {
          id: 'task-2',
          title: 'Review grant',
          priority: 'medium',
          due_date: null,
          entity_type: 'break_glass_grant',
          entity_id: 'grant-1',
        },
      ]);
      mockPrisma.safeguardingAction.findMany.mockResolvedValue([]);

      const result = await service.getDashboard(TENANT_ID);

      expect(result.data.overdue_tasks).toHaveLength(2);
      expect(result.data.overdue_tasks[0]).toEqual({
        id: 'task-1',
        title: 'Follow up required',
        priority: 'high',
        due_date: '2026-01-15T00:00:00.000Z',
        entity_type: 'safeguarding_concern',
        entity_id: CONCERN_ID,
      });
      expect(result.data.overdue_tasks[1]!.due_date).toBeNull();
    });

    it('should map recent actions with action_by info', async () => {
      mockPrisma.safeguardingConcern.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.safeguardingConcern.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.behaviourTask.findMany.mockResolvedValue([]);

      mockPrisma.safeguardingAction.findMany.mockResolvedValue([
        {
          id: 'action-1',
          action_type: 'note_added',
          description: 'Test note',
          created_at: new Date('2026-01-15'),
          action_by: { id: 'user-1', first_name: 'Staff', last_name: 'Member' },
          concern: { concern_number: 'CP-001' },
        },
      ]);

      const result = await service.getDashboard(TENANT_ID);

      expect(result.data.recent_actions).toHaveLength(1);
      expect(result.data.recent_actions[0]).toEqual(
        expect.objectContaining({
          id: 'action-1',
          concern_number: 'CP-001',
          action_type: 'note_added',
          description: 'Test note',
          action_by: { id: 'user-1', name: 'Staff Member' },
        }),
      );
    });

    it('should handle null action_by and null concern on recent actions', async () => {
      mockPrisma.safeguardingConcern.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.safeguardingConcern.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.behaviourTask.findMany.mockResolvedValue([]);

      mockPrisma.safeguardingAction.findMany.mockResolvedValue([
        {
          id: 'action-2',
          action_type: 'unknown_action_type',
          description: 'Orphan action',
          created_at: new Date(),
          action_by: null,
          concern: null,
        },
      ]);

      const result = await service.getDashboard(TENANT_ID);

      expect(result.data.recent_actions[0]!.action_by).toBeNull();
      expect(result.data.recent_actions[0]!.concern_number).toBeNull();
      // Falls back to the raw action_type
      expect(result.data.recent_actions[0]!.action_type).toBe('unknown_action_type');
    });

    it('edge: should map unknown severity keys using fallback', async () => {
      mockPrisma.safeguardingConcern.groupBy
        .mockResolvedValueOnce([{ severity: 'unknown_sev', _count: 1 }])
        .mockResolvedValueOnce([]);
      mockPrisma.safeguardingConcern.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.behaviourTask.findMany.mockResolvedValue([]);
      mockPrisma.safeguardingAction.findMany.mockResolvedValue([]);

      const result = await service.getDashboard(TENANT_ID);

      // Unknown severity falls back to raw key; still stored in map
      expect(result.data.open_by_severity).toHaveProperty('unknown_sev', 1);
    });

    it('edge: should map sg_monitoring status to monitoring key', async () => {
      mockPrisma.safeguardingConcern.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ status: 'sg_monitoring', _count: 5 }]);
      mockPrisma.safeguardingConcern.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.behaviourTask.findMany.mockResolvedValue([]);
      mockPrisma.safeguardingAction.findMany.mockResolvedValue([]);

      const result = await service.getDashboard(TENANT_ID);

      expect(result.data.by_status.monitoring).toBe(5);
    });
  });

  // ─── generateCaseFile ─────────────────────────────────────────────────

  describe('generateCaseFile', () => {
    it('should generate unredacted PDF successfully', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeCaseFileConcern());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({
        settings: { school_name: 'Test School' },
      });

      const pdfBuffer = await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      expect(pdfBuffer).toBeDefined();
      expect(mockRlsTx.safeguardingConcern.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CONCERN_ID, tenant_id: TENANT_ID } }),
      );
      expect(mockPdfRenderingService.renderFromHtml).toHaveBeenCalled();

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('John Doe');
      expect(htmlArg).not.toContain('Student A');
    });

    it('should generate redacted PDF with hidden names', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeCaseFileConcern());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({
        settings: { school_name: 'Test School' },
      });

      const pdfBuffer = await service.generateCaseFile(TENANT_ID, CONCERN_ID, true);

      expect(pdfBuffer).toBeDefined();
      expect(mockPdfRenderingService.renderFromHtml).toHaveBeenCalled();

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).not.toContain('John Doe');
      expect(htmlArg).toContain('Student A');
      expect(htmlArg).toContain('[Reporter]');
      expect(htmlArg).toContain('REDACTED COPY');
    });

    it('should throw NotFoundException if concern does not exist', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(null);

      await expect(service.generateCaseFile(TENANT_ID, CONCERN_ID, false)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should use fallback school name when settings are null', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeCaseFileConcern());
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('School');
    });

    it('should include Tusla referral section when is_tusla_referral is true', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          is_tusla_referral: true,
          tusla_reference_number: 'TUSLA-001',
          tusla_referred_at: new Date('2026-01-15'),
          tusla_outcome: 'Assessed',
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('Referrals');
      expect(htmlArg).toContain('Tusla');
      expect(htmlArg).toContain('TUSLA-001');
      expect(htmlArg).toContain('Assessed');
    });

    it('should include Garda referral section when is_garda_referral is true', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          is_garda_referral: true,
          garda_reference_number: 'GARDA-042',
          garda_referred_at: new Date('2026-02-01'),
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('GARDA-042');
    });

    it('should handle Tusla referral with null referred_at', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          is_tusla_referral: true,
          tusla_reference_number: null,
          tusla_referred_at: null,
          tusla_outcome: null,
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('N/A');
      expect(htmlArg).toContain('Pending');
    });

    it('should handle Garda referral with null referred_at', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          is_garda_referral: true,
          garda_reference_number: null,
          garda_referred_at: null,
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      // N/A for both reference number and date
      expect(htmlArg).toContain('N/A');
    });

    it('should include both referral types in the same section', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          is_tusla_referral: true,
          tusla_reference_number: 'T-1',
          tusla_referred_at: new Date('2026-01-01'),
          tusla_outcome: 'Open',
          is_garda_referral: true,
          garda_reference_number: 'G-1',
          garda_referred_at: new Date('2026-01-02'),
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('T-1');
      expect(htmlArg).toContain('G-1');
    });

    it('should include action timeline when actions exist', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          actions: [
            {
              id: 'action-1',
              action_type: 'note_added',
              description: 'Contacted parent',
              created_at: new Date('2026-01-15'),
              action_by: { id: 'user-1', first_name: 'Staff', last_name: 'Member' },
            },
          ],
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('Contacted parent');
      expect(htmlArg).toContain('Staff Member');
      expect(htmlArg).toContain('1 entries');
    });

    it('should show "No actions recorded" when actions are empty', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeCaseFileConcern());
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('No actions recorded');
    });

    it('should include linked incidents when they exist', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          concern_incidents: [
            {
              incident: {
                id: 'inc-1',
                occurred_at: new Date('2026-01-10'),
                parent_description: 'Playground altercation',
                location: 'Main Yard',
                polarity: 'negative',
                status: 'open',
                category: { name: 'Physical' },
              },
            },
          ],
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('Playground altercation');
      expect(htmlArg).toContain('Main Yard');
      expect(htmlArg).toContain('Physical');
    });

    it('should show "No linked incidents" when none exist', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeCaseFileConcern());
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('No linked incidents');
    });

    it('should handle incident with null parent_description, location, and category', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          concern_incidents: [
            {
              incident: {
                id: 'inc-2',
                occurred_at: new Date('2026-01-10'),
                parent_description: null,
                location: null,
                polarity: 'negative',
                status: 'open',
                category: null,
              },
            },
          ],
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      // null parent_description becomes '' and null location/category show 'N/A'
      expect(htmlArg).toContain('N/A');
    });

    it('should include resolution section when resolved_at or resolution_notes exist', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          resolved_at: new Date('2026-03-01'),
          resolution_notes: 'Matter resolved with family support',
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('Resolution');
      expect(htmlArg).toContain('Matter resolved with family support');
    });

    it('should handle resolution with null resolved_at but non-null notes', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          resolved_at: null,
          resolution_notes: 'Preliminary notes',
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('Resolution');
      expect(htmlArg).toContain('Preliminary notes');
    });

    it('should include seal section when sealed_at is present', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          sealed_at: new Date('2026-04-01'),
          sealed_reason: 'Case closed permanently',
          sealed_by: { id: 'sealer-1', first_name: 'Seal', last_name: 'User' },
          seal_approved_by: { id: 'approver-1', first_name: 'Approve', last_name: 'User' },
          retention_until: new Date('2050-01-01'),
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('Seal Information');
      expect(htmlArg).toContain('Seal User');
      expect(htmlArg).toContain('Approve User');
      expect(htmlArg).toContain('Case closed permanently');
    });

    it('should handle seal with null retention_until and sealed_reason', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          sealed_at: new Date('2026-04-01'),
          sealed_reason: null,
          sealed_by: null,
          seal_approved_by: null,
          retention_until: null,
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('Seal Information');
      expect(htmlArg).toContain('N/A');
    });

    it('should include immediate_actions_taken section when present', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          immediate_actions_taken: 'Called parents and isolated student',
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('Immediate Actions Taken');
      expect(htmlArg).toContain('Called parents and isolated student');
    });

    it('should redact immediate_actions_taken when redacted=true', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          immediate_actions_taken: 'Called John Doe parents about the issue',
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, true);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('Immediate Actions Taken');
      expect(htmlArg).not.toContain('John Doe');
    });

    it('should redact action descriptions in redacted mode', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          actions: [
            {
              id: 'a-1',
              action_type: 'note_added',
              description: 'Called John Doe parents at home',
              created_at: new Date(),
              action_by: { id: 'u-1', first_name: 'Staff', last_name: 'Reporter' },
            },
          ],
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, true);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      // John Doe should be replaced with Student A
      expect(htmlArg).not.toContain('>Called John Doe');
      expect(htmlArg).toContain('[Staff]');
    });

    it('should redact incident descriptions in redacted mode', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          concern_incidents: [
            {
              incident: {
                id: 'inc-1',
                occurred_at: new Date(),
                parent_description: 'John Doe was involved in altercation',
                location: 'Yard',
                polarity: 'negative',
                status: 'open',
                category: { name: 'Physical' },
              },
            },
          ],
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, true);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).not.toContain('John Doe was involved');
    });

    it('should redact resolution notes in redacted mode', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          resolution_notes: 'John Doe parents met and resolved',
          resolved_at: new Date(),
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, true);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).not.toContain('John Doe parents');
    });

    it('should redact DOB in redacted mode', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeCaseFileConcern());
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, true);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('[REDACTED]');
    });

    it('should handle concern with no student (Unknown)', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({ student: null }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('Unknown');
    });

    it('should handle student with no date_of_birth', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          student: { id: STUDENT_ID, first_name: 'Jane', last_name: 'Doe', date_of_birth: null },
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('N/A');
    });

    it('should include designated liaison and assigned to when present', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          designated_liaison: { id: 'dlp-1', first_name: 'DLP', last_name: 'Person' },
          assigned_to: { id: 'staff-2', first_name: 'Lead', last_name: 'Investigator' },
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('DLP Person');
      expect(htmlArg).toContain('Lead Investigator');
    });

    it('should show STRICTLY CONFIDENTIAL for non-redacted PDF', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeCaseFileConcern());
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('STRICTLY CONFIDENTIAL');
    });

    it('should handle description containing student names in redacted mode', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          description: 'John Doe was seen near the playground. John was upset.',
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, true);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      // Both "John Doe" and "John" should be replaced
      expect(htmlArg).not.toContain('John Doe');
      expect(htmlArg).toContain('Student A');
    });

    it('should handle description containing reporter names in redacted mode', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          description: 'Staff Reporter observed bruising. Reporter followed protocol.',
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, true);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).not.toContain('Staff Reporter observed');
    });

    it('should handle HTML special characters in description', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeCaseFileConcern({
          description: 'Test <script>alert("xss")</script> & "quotes"',
        }),
      );
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).not.toContain('<script>');
      expect(htmlArg).toContain('&lt;script&gt;');
      expect(htmlArg).toContain('&amp;');
      expect(htmlArg).toContain('&quot;quotes&quot;');
    });
  });
});
