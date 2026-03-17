import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationTemplatesService } from './notification-templates.service';

describe('NotificationTemplatesService', () => {
  let service: NotificationTemplatesService;
  let prisma: {
    notificationTemplate: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      notificationTemplate: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationTemplatesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<NotificationTemplatesService>(
      NotificationTemplatesService,
    );
  });

  const makeTenantTemplate = (overrides: Record<string, unknown> = {}) => ({
    id: 'tpl-tenant-1',
    tenant_id: 'tenant-1',
    template_key: 'welcome',
    channel: 'email',
    locale: 'en',
    subject_template: 'Welcome {{name}}',
    body_template: '<p>Hello {{name}}</p>',
    is_system: false,
    ...overrides,
  });

  const makePlatformTemplate = (overrides: Record<string, unknown> = {}) => ({
    id: 'tpl-platform-1',
    tenant_id: null,
    template_key: 'welcome',
    channel: 'email',
    locale: 'en',
    subject_template: 'Welcome {{name}}',
    body_template: '<p>Default Hello {{name}}</p>',
    is_system: true,
    ...overrides,
  });

  describe('resolveTemplate()', () => {
    it('should return tenant-level template when it exists', async () => {
      const tenantTpl = makeTenantTemplate();
      prisma.notificationTemplate.findFirst.mockResolvedValueOnce(tenantTpl);

      const result = await service.resolveTemplate(
        'tenant-1',
        'welcome',
        'email',
        'en',
      );

      expect(result).toEqual(tenantTpl);
      // Should only call findFirst once (tenant level found)
      expect(prisma.notificationTemplate.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.notificationTemplate.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-1',
          template_key: 'welcome',
          channel: 'email',
          locale: 'en',
        },
      });
    });

    it('should fall back to platform-level template when no tenant override', async () => {
      const platformTpl = makePlatformTemplate();
      prisma.notificationTemplate.findFirst
        .mockResolvedValueOnce(null) // tenant lookup
        .mockResolvedValueOnce(platformTpl); // platform lookup

      const result = await service.resolveTemplate(
        'tenant-1',
        'welcome',
        'email',
        'en',
      );

      expect(result).toEqual(platformTpl);
      expect(prisma.notificationTemplate.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.notificationTemplate.findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          tenant_id: null,
          template_key: 'welcome',
          channel: 'email',
          locale: 'en',
        },
      });
    });

    it('should return null when no template found at any level', async () => {
      prisma.notificationTemplate.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.resolveTemplate(
        'tenant-1',
        'welcome',
        'email',
        'en',
      );

      expect(result).toBeNull();
      expect(prisma.notificationTemplate.findFirst).toHaveBeenCalledTimes(2);
    });

    it('edge: tenant template for wrong channel returns platform fallback for correct channel', async () => {
      // Tenant has email template only; requesting whatsapp
      // First call (tenant whatsapp) returns null
      // Second call (platform whatsapp) returns platform template
      const platformWhatsApp = makePlatformTemplate({
        id: 'tpl-platform-wa',
        channel: 'whatsapp',
      });
      prisma.notificationTemplate.findFirst
        .mockResolvedValueOnce(null) // tenant whatsapp → not found
        .mockResolvedValueOnce(platformWhatsApp); // platform whatsapp → found

      const result = await service.resolveTemplate(
        'tenant-1',
        'welcome',
        'whatsapp',
        'en',
      );

      expect(result).toEqual(platformWhatsApp);
      expect(prisma.notificationTemplate.findFirst).toHaveBeenNthCalledWith(1, {
        where: {
          tenant_id: 'tenant-1',
          template_key: 'welcome',
          channel: 'whatsapp',
          locale: 'en',
        },
      });
      expect(prisma.notificationTemplate.findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          tenant_id: null,
          template_key: 'welcome',
          channel: 'whatsapp',
          locale: 'en',
        },
      });
    });
  });

  describe('update()', () => {
    it('should update tenant-level template body', async () => {
      const tenantTpl = makeTenantTemplate();
      // getById uses findFirst
      prisma.notificationTemplate.findFirst.mockResolvedValue(tenantTpl);
      prisma.notificationTemplate.update.mockResolvedValue({
        ...tenantTpl,
        body_template: '<p>Updated</p>',
      });

      const result = await service.update('tenant-1', 'tpl-tenant-1', {
        body_template: '<p>Updated</p>',
      });

      expect(prisma.notificationTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl-tenant-1' },
        data: { body_template: '<p>Updated</p>' },
      });
      expect(result.body_template).toBe('<p>Updated</p>');
    });

    it('should throw SYSTEM_TEMPLATE_READONLY when editing system template', async () => {
      const systemTpl = makePlatformTemplate({ is_system: true });
      prisma.notificationTemplate.findFirst.mockResolvedValue(systemTpl);

      await expect(
        service.update('tenant-1', 'tpl-platform-1', {
          body_template: 'hacked',
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.update('tenant-1', 'tpl-platform-1', {
          body_template: 'hacked',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'SYSTEM_TEMPLATE_READONLY',
        }),
      });

      expect(prisma.notificationTemplate.update).not.toHaveBeenCalled();
    });
  });
});
