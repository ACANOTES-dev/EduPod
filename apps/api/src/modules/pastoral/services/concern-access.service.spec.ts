import { BadRequestException } from '@nestjs/common';

import type { ChildProtectionReadFacade } from '../../child-protection/child-protection-read.facade';
import type { ConfigurationReadFacade } from '../../configuration/configuration-read.facade';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RbacReadFacade } from '../../rbac/rbac-read.facade';

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

// ─── Mock Factories ───────────────────────────────────────────────────────

const buildMockPrisma = () => ({});

const buildMockRbacFacade = () => ({
  findMembershipsByRoleKey: jest.fn().mockResolvedValue([]),
});

const buildMockCpFacade = () => ({
  hasActiveCpAccess: jest.fn().mockResolvedValue(false),
});

const buildMockConfigFacade = () => ({
  findSettings: jest.fn().mockResolvedValue(null),
});

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('ConcernAccessService', () => {
  let service: ConcernAccessService;
  let mockRbacFacade: ReturnType<typeof buildMockRbacFacade>;
  let mockCpFacade: ReturnType<typeof buildMockCpFacade>;
  let mockConfigFacade: ReturnType<typeof buildMockConfigFacade>;

  beforeEach(() => {
    mockRbacFacade = buildMockRbacFacade();
    mockCpFacade = buildMockCpFacade();
    mockConfigFacade = buildMockConfigFacade();
    service = new ConcernAccessService(
      buildMockPrisma() as unknown as PrismaService,
      mockRbacFacade as unknown as RbacReadFacade,
      mockCpFacade as unknown as ChildProtectionReadFacade,
      mockConfigFacade as unknown as ConfigurationReadFacade,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── validateCategory ──────────────────────────────────────────────────────

  describe('ConcernAccessService — validateCategory', () => {
    it('should return auto_tier for a valid active category', async () => {
      mockConfigFacade.findSettings.mockResolvedValue(makeTenantSettingsRecord());

      const result = await service.validateCategory(TENANT_ID, 'child_protection');

      expect(result).toEqual({ auto_tier: 3 });
    });

    it('should return undefined auto_tier for category without auto_tier', async () => {
      mockConfigFacade.findSettings.mockResolvedValue(makeTenantSettingsRecord());

      const result = await service.validateCategory(TENANT_ID, 'academic');

      expect(result).toEqual({ auto_tier: undefined });
    });

    it('should throw BadRequestException for an inactive category', async () => {
      mockConfigFacade.findSettings.mockResolvedValue(makeTenantSettingsRecord());

      await expect(service.validateCategory(TENANT_ID, 'inactive_cat')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for an unknown category', async () => {
      mockConfigFacade.findSettings.mockResolvedValue(makeTenantSettingsRecord());

      await expect(service.validateCategory(TENANT_ID, 'nonexistent')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── loadPastoralSettings ──────────────────────────────────────────────────

  describe('ConcernAccessService — loadPastoralSettings', () => {
    it('should parse settings from DB', async () => {
      mockConfigFacade.findSettings.mockResolvedValue(makeTenantSettingsRecord());

      const result = await service.loadPastoralSettings(TENANT_ID);

      expect(result.concern_categories).toHaveLength(DEFAULT_CATEGORIES.length);
      expect(result.concern_categories[0]).toEqual(
        expect.objectContaining({ key: 'academic', label: 'Academic', active: true }),
      );
    });

    it('should return defaults when no settings exist', async () => {
      mockConfigFacade.findSettings.mockResolvedValue(null);

      const result = await service.loadPastoralSettings(TENANT_ID);

      // Zod schema provides defaults when parsing empty object
      expect(result.concern_categories).toBeDefined();
      expect(Array.isArray(result.concern_categories)).toBe(true);
    });
  });

  // ─── checkCpAccess ─────────────────────────────────────────────────────────

  describe('ConcernAccessService — checkCpAccess', () => {
    it('should return true when a non-revoked grant exists', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(true);

      const result = await service.checkCpAccess(TENANT_ID, USER_ID);

      expect(result).toBe(true);
      expect(mockCpFacade.hasActiveCpAccess).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    });

    it('should return false when no grant exists', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(false);

      const result = await service.checkCpAccess(TENANT_ID, USER_ID);

      expect(result).toBe(false);
    });
  });

  // ─── checkIsYearHead ───────────────────────────────────────────────────────

  describe('ConcernAccessService — checkIsYearHead', () => {
    it('should return true when year_head role exists', async () => {
      mockRbacFacade.findMembershipsByRoleKey.mockResolvedValue([
        {
          membership_id: MEMBERSHIP_ID,
          role_id: 'role-1',
          tenant_id: TENANT_ID,
          membership: { user_id: USER_ID },
        },
      ]);

      const result = await service.checkIsYearHead(TENANT_ID, MEMBERSHIP_ID);

      expect(result).toBe(true);
      expect(mockRbacFacade.findMembershipsByRoleKey).toHaveBeenCalledWith(TENANT_ID, 'year_head');
    });

    it('should return false when no year_head role exists', async () => {
      mockRbacFacade.findMembershipsByRoleKey.mockResolvedValue([]);

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
