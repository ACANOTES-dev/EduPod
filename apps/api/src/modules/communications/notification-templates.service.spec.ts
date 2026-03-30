import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

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
      providers: [NotificationTemplatesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<NotificationTemplatesService>(NotificationTemplatesService);
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

  // ─── list() ────────────────────────────────────────────────────────────────

  describe('NotificationTemplatesService — list', () => {
    it('should return templates for tenant and platform level', async () => {
      const templates = [makeTenantTemplate(), makePlatformTemplate()];
      prisma.notificationTemplate.findMany.mockResolvedValue(templates);

      const result = await service.list('tenant-1', {});

      expect(result).toHaveLength(2);
      expect(prisma.notificationTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ tenant_id: 'tenant-1' }, { tenant_id: null }],
          }),
        }),
      );
    });

    it('should filter by template_key when provided', async () => {
      prisma.notificationTemplate.findMany.mockResolvedValue([]);

      await service.list('tenant-1', { template_key: 'welcome' });

      expect(prisma.notificationTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            template_key: 'welcome',
          }),
        }),
      );
    });

    it('should filter by channel when provided', async () => {
      prisma.notificationTemplate.findMany.mockResolvedValue([]);

      await service.list('tenant-1', { channel: 'email' });

      expect(prisma.notificationTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            channel: 'email',
          }),
        }),
      );
    });

    it('should filter by locale when provided', async () => {
      prisma.notificationTemplate.findMany.mockResolvedValue([]);

      await service.list('tenant-1', { locale: 'ar' });

      expect(prisma.notificationTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            locale: 'ar',
          }),
        }),
      );
    });

    it('should order by template_key then locale', async () => {
      prisma.notificationTemplate.findMany.mockResolvedValue([]);

      await service.list('tenant-1', {});

      expect(prisma.notificationTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ template_key: 'asc' }, { locale: 'asc' }],
        }),
      );
    });
  });

  // ─── getById() ────────────────────────────────────────────────────────────

  describe('NotificationTemplatesService — getById', () => {
    it('should return template by id for tenant or platform level', async () => {
      const template = makeTenantTemplate();
      prisma.notificationTemplate.findFirst.mockResolvedValue(template);

      const result = await service.getById('tenant-1', 'tpl-tenant-1');

      expect(result).toEqual(template);
      expect(prisma.notificationTemplate.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'tpl-tenant-1',
          OR: [{ tenant_id: 'tenant-1' }, { tenant_id: null }],
        },
      });
    });

    it('should throw TEMPLATE_NOT_FOUND when template does not exist', async () => {
      prisma.notificationTemplate.findFirst.mockResolvedValue(null);

      await expect(service.getById('tenant-1', 'nonexistent')).rejects.toThrow(NotFoundException);

      await expect(service.getById('tenant-1', 'nonexistent')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'TEMPLATE_NOT_FOUND' }),
      });
    });

    it('should allow viewing platform-level templates from any tenant', async () => {
      const platformTemplate = makePlatformTemplate();
      prisma.notificationTemplate.findFirst.mockResolvedValue(platformTemplate);

      const result = await service.getById('tenant-1', 'tpl-platform-1');

      expect(result).toEqual(platformTemplate);
    });
  });

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('NotificationTemplatesService — create', () => {
    it('should create a tenant-level template', async () => {
      const dto = {
        channel: 'email',
        template_key: 'new_template',
        locale: 'en',
        body_template: '<p>Hello {{name}}</p>',
        subject_template: 'Welcome {{name}}',
      };
      const created = makeTenantTemplate({
        template_key: 'new_template',
        body_template: dto.body_template,
      });
      prisma.notificationTemplate.create.mockResolvedValue(created);

      const result = await service.create('tenant-1', dto);

      expect(result).toEqual(created);
      expect(prisma.notificationTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: 'tenant-1',
          channel: 'email',
          template_key: 'new_template',
          locale: 'en',
          body_template: '<p>Hello {{name}}</p>',
          subject_template: 'Welcome {{name}}',
          is_system: false,
        }),
      });
    });

    it('should set subject_template to null when not provided', async () => {
      const dto = {
        channel: 'sms',
        template_key: 'alert',
        locale: 'en',
        body_template: 'Alert: {{message}}',
      };
      prisma.notificationTemplate.create.mockResolvedValue(
        makeTenantTemplate({ template_key: 'alert', channel: 'sms' }),
      );

      await service.create('tenant-1', dto);

      expect(prisma.notificationTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subject_template: null,
        }),
      });
    });

    it('should throw TEMPLATE_ALREADY_EXISTS on unique constraint violation', async () => {
      const dto = {
        channel: 'email',
        template_key: 'welcome',
        locale: 'en',
        body_template: 'Hello',
      };
      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      prisma.notificationTemplate.create.mockRejectedValue(prismaError);

      await expect(service.create('tenant-1', dto)).rejects.toThrow(ConflictException);

      await expect(service.create('tenant-1', dto)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'TEMPLATE_ALREADY_EXISTS',
        }),
      });
    });

    it('should rethrow non-P2002 Prisma errors', async () => {
      const dto = {
        channel: 'email',
        template_key: 'test',
        locale: 'en',
        body_template: 'Hello',
      };
      const genericError = new Error('Database connection failed');
      prisma.notificationTemplate.create.mockRejectedValue(genericError);

      await expect(service.create('tenant-1', dto)).rejects.toThrow('Database connection failed');
    });
  });

  // ─── update() — extended ──────────────────────────────────────────────────

  describe('NotificationTemplatesService — update — cross-tenant protection', () => {
    it('should throw TEMPLATE_NOT_EDITABLE when template belongs to another tenant', async () => {
      const otherTenantTemplate = makeTenantTemplate({
        tenant_id: 'other-tenant',
        is_system: false,
      });
      prisma.notificationTemplate.findFirst.mockResolvedValue(otherTenantTemplate);

      await expect(
        service.update('tenant-1', 'tpl-tenant-1', {
          body_template: 'hacked',
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.update('tenant-1', 'tpl-tenant-1', {
          body_template: 'hacked',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'TEMPLATE_NOT_EDITABLE' }),
      });
    });

    it('should update subject_template when provided', async () => {
      const tenantTpl = makeTenantTemplate();
      prisma.notificationTemplate.findFirst.mockResolvedValue(tenantTpl);
      prisma.notificationTemplate.update.mockResolvedValue({
        ...tenantTpl,
        subject_template: 'New Subject',
      });

      const result = await service.update('tenant-1', 'tpl-tenant-1', {
        subject_template: 'New Subject',
      });

      expect(prisma.notificationTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl-tenant-1' },
        data: { subject_template: 'New Subject' },
      });
      expect(result.subject_template).toBe('New Subject');
    });

    it('should handle updating both subject and body simultaneously', async () => {
      const tenantTpl = makeTenantTemplate();
      prisma.notificationTemplate.findFirst.mockResolvedValue(tenantTpl);
      prisma.notificationTemplate.update.mockResolvedValue({
        ...tenantTpl,
        subject_template: 'New Subject',
        body_template: '<p>New Body</p>',
      });

      await service.update('tenant-1', 'tpl-tenant-1', {
        subject_template: 'New Subject',
        body_template: '<p>New Body</p>',
      });

      expect(prisma.notificationTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl-tenant-1' },
        data: {
          subject_template: 'New Subject',
          body_template: '<p>New Body</p>',
        },
      });
    });
  });

  // ─── resolveTemplate() ────────────────────────────────────────────────────

  describe('resolveTemplate()', () => {
    it('should return tenant-level template when it exists', async () => {
      const tenantTpl = makeTenantTemplate();
      prisma.notificationTemplate.findFirst.mockResolvedValueOnce(tenantTpl);

      const result = await service.resolveTemplate('tenant-1', 'welcome', 'email', 'en');

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

      const result = await service.resolveTemplate('tenant-1', 'welcome', 'email', 'en');

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
      prisma.notificationTemplate.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const result = await service.resolveTemplate('tenant-1', 'welcome', 'email', 'en');

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

      const result = await service.resolveTemplate('tenant-1', 'welcome', 'whatsapp', 'en');

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
