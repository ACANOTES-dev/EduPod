import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import { ConcernAccessService } from './concern-access.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── Default Categories ────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  { key: 'academic', label: 'Academic', active: true },
  { key: 'child_protection', label: 'Child Protection', auto_tier: 3, active: true },
  { key: 'self_harm', label: 'Self-harm / Suicidal ideation', auto_tier: 3, active: true },
  { key: 'bullying', label: 'Bullying', active: true },
  { key: 'inactive_cat', label: 'Inactive Category', active: false },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

const makeTenantSettingsRecord = (categories = DEFAULT_CATEGORIES) => ({
  id: 'settings-1',
  tenant_id: TENANT_ID,
  settings: {
    pastoral: {
      concern_categories: categories,
    },
  },
  created_at: new Date(),
  updated_at: new Date(),
});

// ─── Mock Prisma ───────────────────────────────────────────────────────────

const buildMockPrisma = () => ({
  tenantSetting: {
    findUnique: jest.fn(),
  },
  cpAccessGrant: {
    findFirst: jest.fn(),
  },
  membershipRole: {
    findFirst: jest.fn(),
  },
});

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('ConcernAccessService', () => {
  let service: ConcernAccessService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    service = new ConcernAccessService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── validateCategory ──────────────────────────────────────────────────────

  describe('ConcernAccessService — validateCategory', () => {
    it('should return auto_tier for a valid active category', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(makeTenantSettingsRecord());

      const result = await service.validateCategory(TENANT_ID, 'child_protection');

      expect(result).toEqual({ auto_tier: 3 });
    });

    it('should return undefined auto_tier for category without auto_tier', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(makeTenantSettingsRecord());

      const result = await service.validateCategory(TENANT_ID, 'academic');

      expect(result).toEqual({ auto_tier: undefined });
    });

    it('should throw BadRequestException for an inactive category', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(makeTenantSettingsRecord());

      await expect(service.validateCategory(TENANT_ID, 'inactive_cat')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for an unknown category', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(makeTenantSettingsRecord());

      await expect(service.validateCategory(TENANT_ID, 'nonexistent')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── loadPastoralSettings ──────────────────────────────────────────────────

  describe('ConcernAccessService — loadPastoralSettings', () => {
    it('should parse settings from DB', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(makeTenantSettingsRecord());

      const result = await service.loadPastoralSettings(TENANT_ID);

      expect(result.concern_categories).toHaveLength(DEFAULT_CATEGORIES.length);
      expect(result.concern_categories[0]).toEqual(
        expect.objectContaining({ key: 'academic', label: 'Academic', active: true }),
      );
    });

    it('should return defaults when no settings exist', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);

      const result = await service.loadPastoralSettings(TENANT_ID);

      // Zod schema provides defaults when parsing empty object
      expect(result.concern_categories).toBeDefined();
      expect(Array.isArray(result.concern_categories)).toBe(true);
    });
  });

  // ─── checkCpAccess ─────────────────────────────────────────────────────────

  describe('ConcernAccessService — checkCpAccess', () => {
    it('should return true when a non-revoked grant exists', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue({ id: 'grant-1' });

      const result = await service.checkCpAccess(TENANT_ID, USER_ID);

      expect(result).toBe(true);
      expect(mockPrisma.cpAccessGrant.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          revoked_at: null,
        },
        select: { id: true },
      });
    });

    it('should return false when no grant exists', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);

      const result = await service.checkCpAccess(TENANT_ID, USER_ID);

      expect(result).toBe(false);
    });
  });

  // ─── checkIsYearHead ───────────────────────────────────────────────────────

  describe('ConcernAccessService — checkIsYearHead', () => {
    it('should return true when year_head role exists', async () => {
      mockPrisma.membershipRole.findFirst.mockResolvedValue({ membership_id: MEMBERSHIP_ID });

      const result = await service.checkIsYearHead(TENANT_ID, MEMBERSHIP_ID);

      expect(result).toBe(true);
      expect(mockPrisma.membershipRole.findFirst).toHaveBeenCalledWith({
        where: {
          membership_id: MEMBERSHIP_ID,
          tenant_id: TENANT_ID,
          role: { role_key: 'year_head' },
        },
        select: { membership_id: true },
      });
    });

    it('should return false when no year_head role exists', async () => {
      mockPrisma.membershipRole.findFirst.mockResolvedValue(null);

      const result = await service.checkIsYearHead(TENANT_ID, MEMBERSHIP_ID);

      expect(result).toBe(false);
    });
  });

  // ─── resolveCallerTierAccess ───────────────────────────────────────────────

  describe('ConcernAccessService — resolveCallerTierAccess', () => {
    it('should return 3 when hasCpAccess is true', () => {
      const result = service.resolveCallerTierAccess(['pastoral.view_tier1'], true);

      expect(result).toBe(3);
    });

    it('should return 2 when user has pastoral.view_tier2 permission', () => {
      const result = service.resolveCallerTierAccess(
        ['pastoral.view_tier1', 'pastoral.view_tier2'],
        false,
      );

      expect(result).toBe(2);
    });

    it('should return 1 when user has only pastoral.view_tier1 permission', () => {
      const result = service.resolveCallerTierAccess(['pastoral.view_tier1'], false);

      expect(result).toBe(1);
    });

    it('should return 0 when user has no relevant permissions', () => {
      const result = service.resolveCallerTierAccess(['some.other.perm'], false);

      expect(result).toBe(0);
    });
  });
});
