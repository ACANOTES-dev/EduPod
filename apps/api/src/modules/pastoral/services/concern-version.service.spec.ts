import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { ConcernVersionService } from './concern-version.service';
import { PastoralEventService } from './pastoral-event.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONCERN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  pastoralConcernVersion: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('ConcernVersionService', () => {
  let service: ConcernVersionService;
  let mockPastoralEventService: { write: jest.Mock };

  beforeEach(async () => {
    mockPastoralEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    // Reset all RLS tx mocks
    for (const value of Object.values(mockRlsTx)) {
      if (typeof value === 'function') {
        (value as jest.Mock).mockReset();
      } else {
        for (const method of Object.values(value as Record<string, jest.Mock>)) {
          method.mockReset();
        }
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConcernVersionService,
        { provide: PrismaService, useValue: {} },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
      ],
    }).compile();

    service = module.get<ConcernVersionService>(ConcernVersionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createInitialVersion ───────────────────────────────────────────────

  describe('createInitialVersion', () => {
    it('creates v1 with no amendment_reason', async () => {
      const mockTx = {
        pastoralConcernVersion: {
          create: jest.fn().mockResolvedValue({
            id: 'version-1',
            tenant_id: TENANT_ID,
            concern_id: CONCERN_ID,
            version_number: 1,
            narrative: 'Initial narrative text',
            amended_by_user_id: USER_ID,
            amendment_reason: null,
            created_at: new Date(),
          }),
        },
      };

      const result = await service.createInitialVersion(
        mockTx as never,
        TENANT_ID,
        CONCERN_ID,
        USER_ID,
        'Initial narrative text',
      );

      expect(result.version_number).toBe(1);
      expect(result.amendment_reason).toBeNull();
      expect(result.narrative).toBe('Initial narrative text');
      expect(mockTx.pastoralConcernVersion.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
          version_number: 1,
          narrative: 'Initial narrative text',
          amended_by_user_id: USER_ID,
          amendment_reason: null,
        },
      });
    });
  });

  // ─── amendNarrative ─────────────────────────────────────────────────────

  describe('amendNarrative', () => {
    function setupConcernLock(tier = 1) {
      mockRlsTx.$queryRaw.mockResolvedValue([{ id: CONCERN_ID, student_id: STUDENT_ID, tier }]);
    }

    function setupLatestVersion(versionNumber: number, narrative: string) {
      mockRlsTx.pastoralConcernVersion.findFirst.mockResolvedValue({
        id: `version-${versionNumber}`,
        tenant_id: TENANT_ID,
        concern_id: CONCERN_ID,
        version_number: versionNumber,
        narrative,
        amended_by_user_id: USER_ID,
        amendment_reason: versionNumber === 1 ? null : 'Previous amendment',
        created_at: new Date(),
      });
    }

    function setupCreateVersion(versionNumber: number, narrative: string, reason: string) {
      mockRlsTx.pastoralConcernVersion.create.mockResolvedValue({
        id: `version-${versionNumber}`,
        tenant_id: TENANT_ID,
        concern_id: CONCERN_ID,
        version_number: versionNumber,
        narrative,
        amended_by_user_id: USER_ID,
        amendment_reason: reason,
        created_at: new Date(),
      });
    }

    it('creates amendment with mandatory reason', async () => {
      setupConcernLock();
      setupLatestVersion(1, 'Original narrative');
      setupCreateVersion(2, 'Updated narrative', 'Correcting a typo');

      const result = await service.amendNarrative(
        TENANT_ID,
        USER_ID,
        CONCERN_ID,
        { new_narrative: 'Updated narrative', amendment_reason: 'Correcting a typo' },
        '127.0.0.1',
      );

      expect(result.data.version_number).toBe(2);
      expect(result.data.amendment_reason).toBe('Correcting a typo');
      expect(result.data.narrative).toBe('Updated narrative');

      expect(mockRlsTx.pastoralConcernVersion.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
          version_number: 2,
          narrative: 'Updated narrative',
          amended_by_user_id: USER_ID,
          amendment_reason: 'Correcting a typo',
        },
      });
    });

    it('increments version number monotonically', async () => {
      // First amendment: v1 -> v2
      setupConcernLock();
      setupLatestVersion(1, 'Original narrative');
      setupCreateVersion(2, 'Second narrative', 'First correction');

      const result1 = await service.amendNarrative(
        TENANT_ID,
        USER_ID,
        CONCERN_ID,
        { new_narrative: 'Second narrative', amendment_reason: 'First correction' },
        null,
      );
      expect(result1.data.version_number).toBe(2);

      // Second amendment: v2 -> v3
      setupConcernLock();
      setupLatestVersion(2, 'Second narrative');
      setupCreateVersion(3, 'Third narrative', 'Second correction');

      const result2 = await service.amendNarrative(
        TENANT_ID,
        USER_ID,
        CONCERN_ID,
        { new_narrative: 'Third narrative', amendment_reason: 'Second correction' },
        null,
      );
      expect(result2.data.version_number).toBe(3);

      // Verify the create calls had correct version numbers
      const createCalls = mockRlsTx.pastoralConcernVersion.create.mock.calls;
      expect(createCalls[0][0].data.version_number).toBe(2);
      expect(createCalls[1][0].data.version_number).toBe(3);
    });

    it('writes concern_narrative_amended event', async () => {
      setupConcernLock(2);
      setupLatestVersion(1, 'Original text');
      setupCreateVersion(2, 'Amended text', 'Adding detail');

      await service.amendNarrative(
        TENANT_ID,
        USER_ID,
        CONCERN_ID,
        { new_narrative: 'Amended text', amendment_reason: 'Adding detail' },
        '10.0.0.1',
      );

      expect(mockPastoralEventService.write).toHaveBeenCalledWith({
        tenant_id: TENANT_ID,
        event_type: 'concern_narrative_amended',
        entity_type: 'concern',
        entity_id: CONCERN_ID,
        student_id: STUDENT_ID,
        actor_user_id: USER_ID,
        tier: 2,
        payload: {
          concern_id: CONCERN_ID,
          version_number: 2,
          previous_narrative: 'Original text',
          new_narrative: 'Amended text',
          reason: 'Adding detail',
        },
        ip_address: '10.0.0.1',
      });
    });

    it('throws NotFoundException when concern is not found', async () => {
      mockRlsTx.$queryRaw.mockResolvedValue([]);

      await expect(
        service.amendNarrative(
          TENANT_ID,
          USER_ID,
          CONCERN_ID,
          { new_narrative: 'Updated narrative', amendment_reason: 'Reason' },
          null,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockRlsTx.pastoralConcernVersion.findFirst).not.toHaveBeenCalled();
      expect(mockRlsTx.pastoralConcernVersion.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when $queryRaw returns null', async () => {
      mockRlsTx.$queryRaw.mockResolvedValue(null);

      await expect(
        service.amendNarrative(
          TENANT_ID,
          USER_ID,
          CONCERN_ID,
          { new_narrative: 'Updated narrative', amendment_reason: 'Reason' },
          null,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when no versions exist for concern', async () => {
      mockRlsTx.$queryRaw.mockResolvedValue([{ id: CONCERN_ID, student_id: STUDENT_ID, tier: 1 }]);
      mockRlsTx.pastoralConcernVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.amendNarrative(
          TENANT_ID,
          USER_ID,
          CONCERN_ID,
          { new_narrative: 'Updated narrative', amendment_reason: 'Reason' },
          null,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockRlsTx.pastoralConcernVersion.create).not.toHaveBeenCalled();
    });

    it('prevents concurrent amendments (SELECT FOR UPDATE present)', async () => {
      setupConcernLock();
      setupLatestVersion(1, 'Original narrative');
      setupCreateVersion(2, 'Updated narrative', 'Amendment reason');

      await service.amendNarrative(
        TENANT_ID,
        USER_ID,
        CONCERN_ID,
        { new_narrative: 'Updated narrative', amendment_reason: 'Amendment reason' },
        null,
      );

      // Verify the SELECT FOR UPDATE query was executed on the concern row
      expect(mockRlsTx.$queryRaw).toHaveBeenCalledTimes(1);

      // Verify the tagged template literal contains FOR UPDATE
      const queryCall = mockRlsTx.$queryRaw.mock.calls[0];
      // Tagged template literals pass a TemplateStringsArray as first arg
      const templateStrings = queryCall[0] as { raw: readonly string[] };
      const rawSql = templateStrings.raw.join('');
      expect(rawSql).toContain('FOR UPDATE');
      expect(rawSql).toContain('pastoral_concerns');
    });
  });

  // ─── listVersions ──────────────────────────────────────────────────────

  describe('listVersions', () => {
    it('lists versions in chronological order', async () => {
      const versions = [
        {
          id: 'v1',
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
          version_number: 1,
          narrative: 'First',
          amended_by_user_id: USER_ID,
          amendment_reason: null,
          created_at: new Date('2026-01-01T10:00:00Z'),
        },
        {
          id: 'v2',
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
          version_number: 2,
          narrative: 'Second',
          amended_by_user_id: USER_ID,
          amendment_reason: 'Typo fix',
          created_at: new Date('2026-01-01T11:00:00Z'),
        },
        {
          id: 'v3',
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
          version_number: 3,
          narrative: 'Third',
          amended_by_user_id: USER_ID,
          amendment_reason: 'Added detail',
          created_at: new Date('2026-01-01T12:00:00Z'),
        },
      ];

      mockRlsTx.pastoralConcernVersion.findMany.mockResolvedValue(versions);

      const result = await service.listVersions(TENANT_ID, CONCERN_ID);

      expect(result.data).toHaveLength(3);
      expect(result.data[0]!.version_number).toBe(1);
      expect(result.data[1]!.version_number).toBe(2);
      expect(result.data[2]!.version_number).toBe(3);

      expect(mockRlsTx.pastoralConcernVersion.findMany).toHaveBeenCalledWith({
        where: { concern_id: CONCERN_ID, tenant_id: TENANT_ID },
        orderBy: { version_number: 'asc' },
      });
    });
  });
});
