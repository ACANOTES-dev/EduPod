import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourRecognitionService } from './behaviour-recognition.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const PUBLICATION_ID = 'pub-1';
const STUDENT_ID = 'student-1';

// ─── RLS mock ───────────────────────────────────────────────────────────
const mockRlsTx = {
  behaviourPublicationApproval: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Factories ──────────────────────────────────────────────────────────

const makePublication = (overrides: Record<string, unknown> = {}) => ({
  id: PUBLICATION_ID,
  tenant_id: TENANT_ID,
  publication_type: 'recognition_wall',
  entity_type: 'award',
  entity_id: 'award-1',
  student_id: STUDENT_ID,
  requires_parent_consent: false,
  parent_consent_status: 'granted',
  admin_approved: false,
  admin_approved_by_id: null,
  published_at: null,
  unpublished_at: null,
  created_at: new Date('2026-03-01T00:00:00Z'),
  updated_at: new Date('2026-03-01T00:00:00Z'),
  ...overrides,
});

const makePublishedItem = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  tenant_id: TENANT_ID,
  publication_type: 'recognition_wall',
  entity_type: 'award',
  entity_id: `award-${id}`,
  student_id: STUDENT_ID,
  published_at: new Date('2026-03-15T10:00:00Z'),
  unpublished_at: null,
  student: {
    id: STUDENT_ID,
    first_name: 'John',
    last_name: 'Doe',
    year_group_id: 'yg-1',
    year_group: { id: 'yg-1', name: 'Year 7' },
  },
  admin_approved_by: null,
  ...overrides,
});

// ─── Test Suite ─────────────────────────────────────────────────────────

describe('BehaviourRecognitionService', () => {
  let service: BehaviourRecognitionService;
  let mockPrisma: {
    behaviourPublicationApproval: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    behaviourIncident: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let mockHistory: { recordHistory: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      behaviourPublicationApproval: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      behaviourIncident: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    mockHistory = { recordHistory: jest.fn().mockResolvedValue(undefined) };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourRecognitionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BehaviourHistoryService, useValue: mockHistory },
      ],
    }).compile();

    service = module.get<BehaviourRecognitionService>(BehaviourRecognitionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listRecognition (top-level /behaviour/recognition) ────────────────

  describe('listRecognition', () => {
    const makePositiveIncident = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      tenant_id: TENANT_ID,
      polarity: 'positive',
      retention_status: 'active',
      status: 'submitted',
      severity: 3,
      description: 'Great teamwork during the science project.',
      occurred_at: new Date('2026-04-01T10:00:00Z'),
      created_at: new Date('2026-04-01T10:00:05Z'),
      category: { name: 'Teamwork', color: '#4ade80', icon: '🤝' },
      reported_by: { first_name: 'Anna', last_name: 'Reporter' },
      participants: [
        {
          student: { first_name: 'Sam', last_name: 'Student' },
        },
      ],
      ...overrides,
    });

    it('should default to status=published, filtering out draft and withdrawn incidents', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([makePositiveIncident('inc-1')]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(1);

      await service.listRecognition(TENANT_ID, { page: 1, pageSize: 20, status: 'published' });

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            polarity: 'positive',
            retention_status: 'active',
            status: { notIn: ['draft', 'withdrawn'] },
          }),
        }),
      );
    });

    it('should filter to draft when status=pending', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);

      await service.listRecognition(TENANT_ID, { page: 1, pageSize: 20, status: 'pending' });

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'draft' }),
        }),
      );
    });

    it('should omit the status filter when status=all', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);

      await service.listRecognition(TENANT_ID, { page: 1, pageSize: 20, status: 'all' });

      const call = mockPrisma.behaviourIncident.findMany.mock.calls[0]![0] as {
        where: Record<string, unknown>;
      };
      expect(call.where).not.toHaveProperty('status');
      expect(call.where.polarity).toBe('positive');
    });

    it('should project each incident into the RecognitionItem shape the frontend expects', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([makePositiveIncident('inc-1')]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(1);

      const result = await service.listRecognition(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'published',
      });

      expect(result.data).toHaveLength(1);
      const item = result.data[0]!;
      expect(item).toMatchObject({
        id: 'inc-1',
        student: { first_name: 'Sam', last_name: 'Student' },
        award: null,
        category: { name: 'Teamwork', color: '#4ade80' },
        points: 3,
        message: 'Great teamwork during the science project.',
        status: 'submitted',
        published_at: '2026-04-01T10:00:00.000Z',
        awarded_by_user: { first_name: 'Anna', last_name: 'Reporter' },
      });
    });

    it('should return empty data with correct meta when no positive incidents exist', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);

      const result = await service.listRecognition(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'published',
      });

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 0 });
    });

    it('edge: should scope every query by tenant_id (RLS leakage guard)', async () => {
      const OTHER_TENANT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);

      await service.listRecognition(OTHER_TENANT, {
        page: 1,
        pageSize: 20,
        status: 'published',
      });

      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: OTHER_TENANT }),
        }),
      );
      expect(mockPrisma.behaviourIncident.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: OTHER_TENANT }),
        }),
      );
    });
  });

  // ─── getWall ──────────────────────────────────────────────────────────

  describe('getWall', () => {
    it('should return published items (published_at not null, unpublished_at null)', async () => {
      const items = [makePublishedItem('pub-1'), makePublishedItem('pub-2')];
      mockPrisma.behaviourPublicationApproval.findMany.mockResolvedValue(items);
      mockPrisma.behaviourPublicationApproval.count.mockResolvedValue(2);

      const result = await service.getWall(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(mockPrisma.behaviourPublicationApproval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            published_at: { not: null },
            unpublished_at: null,
          }),
        }),
      );
    });

    it('should paginate results', async () => {
      mockPrisma.behaviourPublicationApproval.findMany.mockResolvedValue([
        makePublishedItem('pub-3'),
      ]);
      mockPrisma.behaviourPublicationApproval.count.mockResolvedValue(25);

      const result = await service.getWall(TENANT_ID, { page: 2, pageSize: 10 });

      expect(result.meta).toEqual({ page: 2, pageSize: 10, total: 25 });
      expect(mockPrisma.behaviourPublicationApproval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });

    it('should filter by year_group_id when provided', async () => {
      mockPrisma.behaviourPublicationApproval.findMany.mockResolvedValue([]);
      mockPrisma.behaviourPublicationApproval.count.mockResolvedValue(0);

      await service.getWall(TENANT_ID, {
        page: 1,
        pageSize: 20,
        year_group_id: 'yg-1',
      });

      expect(mockPrisma.behaviourPublicationApproval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student: { year_group_id: 'yg-1' },
          }),
        }),
      );
    });

    it('edge: should return empty data for no published items', async () => {
      mockPrisma.behaviourPublicationApproval.findMany.mockResolvedValue([]);
      mockPrisma.behaviourPublicationApproval.count.mockResolvedValue(0);

      const result = await service.getWall(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  // ─── createPublicationApproval ────────────────────────────────────────

  describe('createPublicationApproval', () => {
    const baseDto = {
      publication_type: 'recognition_wall',
      entity_type: 'award',
      entity_id: 'award-1',
      student_id: STUDENT_ID,
      requires_parent_consent: false,
      admin_approval_required: false,
    };

    it('should set parent_consent_status to not_requested when requires_parent_consent=true', async () => {
      const mockTx = {
        behaviourPublicationApproval: {
          create: jest.fn().mockResolvedValue(
            makePublication({
              requires_parent_consent: true,
              parent_consent_status: 'not_requested',
            }),
          ),
        },
      } as unknown as PrismaService;

      await service.createPublicationApproval(mockTx, TENANT_ID, {
        ...baseDto,
        requires_parent_consent: true,
      });

      expect(
        (mockTx as unknown as { behaviourPublicationApproval: { create: jest.Mock } })
          .behaviourPublicationApproval.create,
      ).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parent_consent_status: 'not_requested',
        }),
      });
    });

    it('should set parent_consent_status to granted when requires_parent_consent=false', async () => {
      const mockTx = {
        behaviourPublicationApproval: {
          create: jest
            .fn()
            .mockResolvedValue(makePublication({ parent_consent_status: 'granted' })),
        },
      } as unknown as PrismaService;

      await service.createPublicationApproval(mockTx, TENANT_ID, baseDto);

      expect(
        (mockTx as unknown as { behaviourPublicationApproval: { create: jest.Mock } })
          .behaviourPublicationApproval.create,
      ).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parent_consent_status: 'granted',
        }),
      });
    });

    it('should auto-publish when both gates pass', async () => {
      const mockTx = {
        behaviourPublicationApproval: {
          create: jest.fn().mockResolvedValue(makePublication({ published_at: new Date() })),
        },
      } as unknown as PrismaService;

      await service.createPublicationApproval(mockTx, TENANT_ID, {
        ...baseDto,
        requires_parent_consent: false,
        admin_approval_required: false,
      });

      expect(
        (mockTx as unknown as { behaviourPublicationApproval: { create: jest.Mock } })
          .behaviourPublicationApproval.create,
      ).toHaveBeenCalledWith({
        data: expect.objectContaining({
          admin_approved: true,
          published_at: expect.any(Date),
        }),
      });
    });

    it('should not publish when admin_approval_required=true', async () => {
      const mockTx = {
        behaviourPublicationApproval: {
          create: jest
            .fn()
            .mockResolvedValue(makePublication({ admin_approved: false, published_at: null })),
        },
      } as unknown as PrismaService;

      await service.createPublicationApproval(mockTx, TENANT_ID, {
        ...baseDto,
        admin_approval_required: true,
      });

      expect(
        (mockTx as unknown as { behaviourPublicationApproval: { create: jest.Mock } })
          .behaviourPublicationApproval.create,
      ).toHaveBeenCalledWith({
        data: expect.objectContaining({
          admin_approved: false,
          published_at: null,
        }),
      });
    });

    it('should not publish when requires_parent_consent=true', async () => {
      const mockTx = {
        behaviourPublicationApproval: {
          create: jest.fn().mockResolvedValue(
            makePublication({
              parent_consent_status: 'not_requested',
              published_at: null,
            }),
          ),
        },
      } as unknown as PrismaService;

      await service.createPublicationApproval(mockTx, TENANT_ID, {
        ...baseDto,
        requires_parent_consent: true,
        admin_approval_required: false,
      });

      expect(
        (mockTx as unknown as { behaviourPublicationApproval: { create: jest.Mock } })
          .behaviourPublicationApproval.create,
      ).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parent_consent_status: 'not_requested',
          published_at: null,
        }),
      });
    });
  });

  // ─── approvePublication ───────────────────────────────────────────────

  describe('approvePublication', () => {
    it('should set admin_approved=true', async () => {
      mockRlsTx.behaviourPublicationApproval.findFirst.mockResolvedValue(
        makePublication({ parent_consent_status: 'not_requested' }),
      );
      mockRlsTx.behaviourPublicationApproval.update.mockResolvedValue(
        makePublication({ admin_approved: true }),
      );

      await service.approvePublication(TENANT_ID, PUBLICATION_ID, USER_ID);

      expect(mockRlsTx.behaviourPublicationApproval.update).toHaveBeenCalledWith({
        where: { id: PUBLICATION_ID },
        data: expect.objectContaining({
          admin_approved: true,
        }),
      });
    });

    it('should publish when consent already granted', async () => {
      mockRlsTx.behaviourPublicationApproval.findFirst.mockResolvedValue(
        makePublication({ parent_consent_status: 'granted' }),
      );
      mockRlsTx.behaviourPublicationApproval.update.mockResolvedValue(
        makePublication({ admin_approved: true, published_at: new Date() }),
      );

      await service.approvePublication(TENANT_ID, PUBLICATION_ID, USER_ID);

      expect(mockRlsTx.behaviourPublicationApproval.update).toHaveBeenCalledWith({
        where: { id: PUBLICATION_ID },
        data: expect.objectContaining({
          admin_approved: true,
          published_at: expect.any(Date),
        }),
      });
    });

    it('should not publish when consent not yet granted', async () => {
      mockRlsTx.behaviourPublicationApproval.findFirst.mockResolvedValue(
        makePublication({ parent_consent_status: 'not_requested' }),
      );
      mockRlsTx.behaviourPublicationApproval.update.mockResolvedValue(
        makePublication({ admin_approved: true, published_at: null }),
      );

      await service.approvePublication(TENANT_ID, PUBLICATION_ID, USER_ID);

      const updateCall = mockRlsTx.behaviourPublicationApproval.update.mock.calls[0][0];
      expect(updateCall.data.admin_approved).toBe(true);
      expect(updateCall.data.published_at).toBeUndefined();
    });

    it('should throw NotFoundException for non-existent publication', async () => {
      mockRlsTx.behaviourPublicationApproval.findFirst.mockResolvedValue(null);

      await expect(service.approvePublication(TENANT_ID, 'non-existent', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should record history on approval', async () => {
      mockRlsTx.behaviourPublicationApproval.findFirst.mockResolvedValue(
        makePublication({ parent_consent_status: 'granted' }),
      );
      mockRlsTx.behaviourPublicationApproval.update.mockResolvedValue(
        makePublication({ admin_approved: true, published_at: new Date() }),
      );

      await service.approvePublication(TENANT_ID, PUBLICATION_ID, USER_ID);

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'publication_approval',
        PUBLICATION_ID,
        USER_ID,
        'admin_approved',
        { admin_approved: false },
        expect.objectContaining({ admin_approved: true }),
      );
    });
  });

  // ─── rejectPublication ────────────────────────────────────────────────

  describe('rejectPublication', () => {
    it('should set unpublished_at timestamp', async () => {
      mockRlsTx.behaviourPublicationApproval.findFirst.mockResolvedValue(
        makePublication({ published_at: new Date() }),
      );
      mockRlsTx.behaviourPublicationApproval.update.mockResolvedValue(
        makePublication({ unpublished_at: new Date() }),
      );

      await service.rejectPublication(TENANT_ID, PUBLICATION_ID, USER_ID);

      expect(mockRlsTx.behaviourPublicationApproval.update).toHaveBeenCalledWith({
        where: { id: PUBLICATION_ID },
        data: { unpublished_at: expect.any(Date) },
      });
    });

    it('should throw NotFoundException for non-existent publication', async () => {
      mockRlsTx.behaviourPublicationApproval.findFirst.mockResolvedValue(null);

      await expect(service.rejectPublication(TENANT_ID, 'non-existent', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should record history on rejection', async () => {
      const unpublishedAt = new Date('2026-03-20T12:00:00Z');
      mockRlsTx.behaviourPublicationApproval.findFirst.mockResolvedValue(
        makePublication({ published_at: new Date() }),
      );
      mockRlsTx.behaviourPublicationApproval.update.mockResolvedValue(
        makePublication({ unpublished_at: unpublishedAt }),
      );

      await service.rejectPublication(TENANT_ID, PUBLICATION_ID, USER_ID);

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'publication_approval',
        PUBLICATION_ID,
        USER_ID,
        'rejected',
        { unpublished_at: null },
        { unpublished_at: unpublishedAt },
      );
    });
  });

  // ─── getPublicationDetail ──────────────────────────────────────────────

  describe('getPublicationDetail', () => {
    it('should return publication detail when found', async () => {
      const publication = makePublication({
        student: { id: STUDENT_ID, first_name: 'John', last_name: 'Doe' },
        admin_approved_by: null,
      });
      mockPrisma.behaviourPublicationApproval.findFirst.mockResolvedValue(publication);

      const result = await service.getPublicationDetail(TENANT_ID, PUBLICATION_ID);

      expect(result).toEqual(publication);
      expect(mockPrisma.behaviourPublicationApproval.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PUBLICATION_ID, tenant_id: TENANT_ID },
          include: expect.objectContaining({
            student: expect.any(Object),
            admin_approved_by: expect.any(Object),
          }),
        }),
      );
    });

    it('should throw NotFoundException when publication not found', async () => {
      mockPrisma.behaviourPublicationApproval.findFirst.mockResolvedValue(null);

      await expect(service.getPublicationDetail(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getPublicFeed ────────────────────────────────────────────────────

  describe('getPublicFeed', () => {
    it('should cap pageSize at 50', async () => {
      mockPrisma.behaviourPublicationApproval.findMany.mockResolvedValue([]);
      mockPrisma.behaviourPublicationApproval.count.mockResolvedValue(0);

      const result = await service.getPublicFeed(TENANT_ID, 1, 100);

      expect(result.meta.pageSize).toBe(50);
      expect(mockPrisma.behaviourPublicationApproval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });

    it('should only return published, non-unpublished items', async () => {
      mockPrisma.behaviourPublicationApproval.findMany.mockResolvedValue([]);
      mockPrisma.behaviourPublicationApproval.count.mockResolvedValue(0);

      await service.getPublicFeed(TENANT_ID, 1, 20);

      expect(mockPrisma.behaviourPublicationApproval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            published_at: { not: null },
            unpublished_at: null,
          }),
        }),
      );
    });

    it('should order by published_at descending', async () => {
      mockPrisma.behaviourPublicationApproval.findMany.mockResolvedValue([]);
      mockPrisma.behaviourPublicationApproval.count.mockResolvedValue(0);

      await service.getPublicFeed(TENANT_ID, 1, 20);

      expect(mockPrisma.behaviourPublicationApproval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { published_at: 'desc' },
        }),
      );
    });
  });
});
