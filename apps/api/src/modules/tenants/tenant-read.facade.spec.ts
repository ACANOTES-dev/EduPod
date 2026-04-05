import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { TenantReadFacade } from './tenant-read.facade';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// ─── Mock factory ────────────────────────────────────────────────────────────

const mockPrisma = {
  tenant: {
    findUnique: jest.fn(),
  },
  tenantBranding: {
    findUnique: jest.fn(),
  },
  tenantModule: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('TenantReadFacade', () => {
  let facade: TenantReadFacade;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<TenantReadFacade>(TenantReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── TenantReadFacade — findById ───────────────────────────────────────────

  describe('TenantReadFacade — findById', () => {
    it('should return tenant core row when found', async () => {
      const tenantRow = {
        id: TENANT_ID,
        name: 'Test School',
        slug: 'test-school',
        status: 'active',
        default_locale: 'en',
        timezone: 'UTC',
        date_format: 'DD-MM-YYYY',
        currency_code: 'USD',
        academic_year_start_month: 9,
      };
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(tenantRow);

      const result = await facade.findById(TENANT_ID);

      expect(result).toEqual(tenantRow);
      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: TENANT_ID },
        select: expect.objectContaining({
          id: true,
          name: true,
          slug: true,
          status: true,
          default_locale: true,
          timezone: true,
          currency_code: true,
        }),
      });
    });

    it('should return null when tenant is not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      const result = await facade.findById(TENANT_ID);

      expect(result).toBeNull();
    });
  });

  // ─── TenantReadFacade — existsOrThrow ─────────────────────────────────────

  describe('TenantReadFacade — existsOrThrow', () => {
    it('should resolve without error when tenant exists', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });

      await expect(facade.existsOrThrow(TENANT_ID)).resolves.toBeUndefined();
    });

    it('should throw NotFoundException when tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      await expect(facade.existsOrThrow(TENANT_ID)).rejects.toThrow(NotFoundException);

      try {
        await facade.existsOrThrow(TENANT_ID);
      } catch (err) {
        expect((err as NotFoundException).getResponse()).toMatchObject({
          code: 'TENANT_NOT_FOUND',
        });
      }
    });
  });

  // ─── TenantReadFacade — findNameById ──────────────────────────────────────

  describe('TenantReadFacade — findNameById', () => {
    it('should return tenant name when found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ name: 'Academy School' });

      const result = await facade.findNameById(TENANT_ID);

      expect(result).toBe('Academy School');
    });

    it('should return null when tenant is not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      const result = await facade.findNameById(TENANT_ID);

      expect(result).toBeNull();
    });
  });

  // ─── TenantReadFacade — findDefaultLocale ─────────────────────────────────

  describe('TenantReadFacade — findDefaultLocale', () => {
    it('should return tenant default locale when found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ default_locale: 'ar' });

      const result = await facade.findDefaultLocale(TENANT_ID);

      expect(result).toBe('ar');
    });

    it('should return "en" when tenant is not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      const result = await facade.findDefaultLocale(TENANT_ID);

      expect(result).toBe('en');
    });
  });

  // ─── TenantReadFacade — findCurrencyCode ──────────────────────────────────

  describe('TenantReadFacade — findCurrencyCode', () => {
    it('should return currency code when found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ currency_code: 'AED' });

      const result = await facade.findCurrencyCode(TENANT_ID);

      expect(result).toBe('AED');
    });

    it('should return null when tenant is not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      const result = await facade.findCurrencyCode(TENANT_ID);

      expect(result).toBeNull();
    });
  });

  // ─── TenantReadFacade — findBranding ──────────────────────────────────────

  describe('TenantReadFacade — findBranding', () => {
    it('should return branding when configured', async () => {
      const branding = {
        id: 'branding-1',
        tenant_id: TENANT_ID,
        primary_color: '#336699',
        secondary_color: null,
        logo_url: 'https://cdn.example.com/logo.png',
        school_name_display: 'Test School',
        school_name_ar: null,
        email_from_name: 'Test School',
        email_from_name_ar: null,
        support_email: 'support@school.com',
        support_phone: null,
        receipt_prefix: 'REC',
        invoice_prefix: 'INV',
        report_card_title: null,
        payslip_prefix: 'PAY',
      };
      mockPrisma.tenantBranding.findUnique.mockResolvedValueOnce(branding);

      const result = await facade.findBranding(TENANT_ID);

      expect(result).toEqual(branding);
      expect(mockPrisma.tenantBranding.findUnique).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        select: expect.objectContaining({
          id: true,
          tenant_id: true,
          primary_color: true,
          logo_url: true,
          school_name_display: true,
          receipt_prefix: true,
          invoice_prefix: true,
          payslip_prefix: true,
        }),
      });
    });

    it('should return null when no branding is configured', async () => {
      mockPrisma.tenantBranding.findUnique.mockResolvedValueOnce(null);

      const result = await facade.findBranding(TENANT_ID);

      expect(result).toBeNull();
    });
  });

  // ─── TenantReadFacade — findModules ───────────────────────────────────────

  describe('TenantReadFacade — findModules', () => {
    it('should return all modules for a tenant', async () => {
      const modules = [
        { id: 'm1', tenant_id: TENANT_ID, module_key: 'finance', is_enabled: true },
        { id: 'm2', tenant_id: TENANT_ID, module_key: 'sen', is_enabled: false },
      ];
      mockPrisma.tenantModule.findMany.mockResolvedValueOnce(modules);

      const result = await facade.findModules(TENANT_ID);

      expect(result).toEqual(modules);
      expect(mockPrisma.tenantModule.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        select: { id: true, tenant_id: true, module_key: true, is_enabled: true },
      });
    });

    it('should return empty array when tenant has no modules', async () => {
      mockPrisma.tenantModule.findMany.mockResolvedValueOnce([]);

      const result = await facade.findModules(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  // ─── TenantReadFacade — isModuleEnabled ───────────────────────────────────

  describe('TenantReadFacade — isModuleEnabled', () => {
    it('should return true when module is enabled', async () => {
      mockPrisma.tenantModule.findFirst.mockResolvedValueOnce({ is_enabled: true });

      const result = await facade.isModuleEnabled(TENANT_ID, 'finance');

      expect(result).toBe(true);
    });

    it('should return false when module is disabled', async () => {
      mockPrisma.tenantModule.findFirst.mockResolvedValueOnce({ is_enabled: false });

      const result = await facade.isModuleEnabled(TENANT_ID, 'sen');

      expect(result).toBe(false);
    });

    it('should return false when module row does not exist', async () => {
      mockPrisma.tenantModule.findFirst.mockResolvedValueOnce(null);

      const result = await facade.isModuleEnabled(TENANT_ID, 'nonexistent');

      expect(result).toBe(false);
    });
  });

  // ─── TenantReadFacade — findSettings ──────────────────────────────────────

  describe('TenantReadFacade — findSettings', () => {
    it('should return settings blob when tenant exists', async () => {
      const settingsBlob = {
        settings: {
          attendance: { allowTeacherAmendment: true },
          finance: { allowPartialPayment: false },
        },
      };
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(settingsBlob);

      const result = await facade.findSettings(TENANT_ID);

      expect(result).toEqual(settingsBlob.settings);
    });

    it('should return null when tenant is not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      const result = await facade.findSettings(TENANT_ID);

      expect(result).toBeNull();
    });

    it('edge: should return null when settings field is null', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ settings: null });

      const result = await facade.findSettings(TENANT_ID);

      expect(result).toBeNull();
    });
  });
});
