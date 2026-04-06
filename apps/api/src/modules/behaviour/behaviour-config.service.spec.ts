import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourConfigService } from './behaviour-config.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CATEGORY_ID = 'cat-1';
const TEMPLATE_ID = 'tmpl-1';

describe('BehaviourConfigService', () => {
  let service: BehaviourConfigService;
  let mockPrisma: {
    behaviourCategory: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    behaviourDescriptionTemplate: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      behaviourCategory: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      behaviourDescriptionTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [BehaviourConfigService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<BehaviourConfigService>(BehaviourConfigService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listCategories ────────────────────────────────────────────────────

  describe('listCategories', () => {
    it('should return categories ordered by display_order', async () => {
      const categories = [
        { id: 'cat-1', name: 'Praise', display_order: 1 },
        { id: 'cat-2', name: 'Disruption', display_order: 2 },
      ];
      mockPrisma.behaviourCategory.findMany.mockResolvedValue(categories);

      const result = await service.listCategories(TENANT_ID);

      expect(result.data).toEqual(categories);
      expect(mockPrisma.behaviourCategory.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        orderBy: { display_order: 'asc' },
      });
    });
  });

  // ─── createCategory ───────────────────────────────────────────────────

  describe('createCategory', () => {
    const dto = {
      name: 'Praise',
      name_ar: 'ثناء',
      polarity: 'positive' as const,
      severity: 1,
      point_value: 5,
      color: '#22C55E',
      icon: 'star',
      requires_follow_up: false,
      requires_parent_notification: false,
      parent_visible: true,
      benchmark_category: 'praise' as const,
      display_order: 1,
    };

    it('should create a category with all fields', async () => {
      const created = { id: CATEGORY_ID, tenant_id: TENANT_ID, ...dto };
      mockPrisma.behaviourCategory.findFirst.mockResolvedValue(null);
      mockPrisma.behaviourCategory.create.mockResolvedValue(created);

      const result = await service.createCategory(TENANT_ID, dto);

      expect(result).toEqual(created);
      expect(mockPrisma.behaviourCategory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          name: 'Praise',
          name_ar: 'ثناء',
          polarity: 'positive',
          severity: 1,
          point_value: 5,
          color: '#22C55E',
          icon: 'star',
          benchmark_category: 'praise',
        }),
      });
    });

    it('should throw CATEGORY_NAME_EXISTS for duplicate name', async () => {
      mockPrisma.behaviourCategory.findFirst.mockResolvedValue({
        id: 'existing-cat',
        name: 'Praise',
      });

      await expect(service.createCategory(TENANT_ID, dto)).rejects.toThrow(ConflictException);

      expect(mockPrisma.behaviourCategory.create).not.toHaveBeenCalled();
    });

    it('should handle nullable optional fields', async () => {
      const minimalDto = {
        ...dto,
        name_ar: undefined,
        color: undefined,
        icon: undefined,
      };
      mockPrisma.behaviourCategory.findFirst.mockResolvedValue(null);
      mockPrisma.behaviourCategory.create.mockResolvedValue({ id: CATEGORY_ID });

      await service.createCategory(TENANT_ID, minimalDto);

      expect(mockPrisma.behaviourCategory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name_ar: null,
          color: null,
          icon: null,
        }),
      });
    });
  });

  // ─── updateCategory ──────────────────────────────────────────────────

  describe('updateCategory', () => {
    it('should update category fields', async () => {
      const existing = { id: CATEGORY_ID, name: 'Old Name', tenant_id: TENANT_ID };
      mockPrisma.behaviourCategory.findFirst
        .mockResolvedValueOnce(existing) // find category
        .mockResolvedValueOnce(null); // no duplicate name
      mockPrisma.behaviourCategory.update.mockResolvedValue({
        ...existing,
        name: 'New Name',
      });

      const result = await service.updateCategory(TENANT_ID, CATEGORY_ID, {
        name: 'New Name',
      });

      expect(result.name).toBe('New Name');
      expect(mockPrisma.behaviourCategory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CATEGORY_ID },
          data: expect.objectContaining({ name: 'New Name' }),
        }),
      );
    });

    it('should throw NotFoundException when category does not exist', async () => {
      mockPrisma.behaviourCategory.findFirst.mockResolvedValue(null);

      await expect(
        service.updateCategory(TENANT_ID, 'nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw CATEGORY_NAME_EXISTS when renaming to an existing name', async () => {
      mockPrisma.behaviourCategory.findFirst
        .mockResolvedValueOnce({ id: CATEGORY_ID, name: 'Old Name', tenant_id: TENANT_ID })
        .mockResolvedValueOnce({ id: 'other-cat', name: 'Taken Name' });

      await expect(
        service.updateCategory(TENANT_ID, CATEGORY_ID, { name: 'Taken Name' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should skip name uniqueness check when name is unchanged', async () => {
      const existing = { id: CATEGORY_ID, name: 'Same Name', tenant_id: TENANT_ID };
      mockPrisma.behaviourCategory.findFirst.mockResolvedValueOnce(existing);
      mockPrisma.behaviourCategory.update.mockResolvedValue({
        ...existing,
        severity: 3,
      });

      await service.updateCategory(TENANT_ID, CATEGORY_ID, {
        name: 'Same Name',
        severity: 3,
      });

      // findFirst is called once for the category itself; no second call for dupe check
      expect(mockPrisma.behaviourCategory.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should handle partial updates with only some fields', async () => {
      const existing = { id: CATEGORY_ID, name: 'Category', tenant_id: TENANT_ID };
      mockPrisma.behaviourCategory.findFirst.mockResolvedValueOnce(existing);
      mockPrisma.behaviourCategory.update.mockResolvedValue({
        ...existing,
        point_value: 10,
      });

      await service.updateCategory(TENANT_ID, CATEGORY_ID, {
        point_value: 10,
      });

      expect(mockPrisma.behaviourCategory.update).toHaveBeenCalledWith({
        where: { id: CATEGORY_ID },
        data: expect.objectContaining({ point_value: 10 }),
      });
    });
  });

  // ─── Templates ───────────────────────────────────────────────────────

  describe('listTemplates', () => {
    it('should return templates filtered by active status', async () => {
      const templates = [{ id: 'tmpl-1', text: 'Well done!', display_order: 1 }];
      mockPrisma.behaviourDescriptionTemplate.findMany.mockResolvedValue(templates);

      const result = await service.listTemplates(TENANT_ID);

      expect(result.data).toEqual(templates);
      expect(mockPrisma.behaviourDescriptionTemplate.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, is_active: true },
        orderBy: { display_order: 'asc' },
      });
    });

    it('should filter by categoryId when provided', async () => {
      mockPrisma.behaviourDescriptionTemplate.findMany.mockResolvedValue([]);

      await service.listTemplates(TENANT_ID, CATEGORY_ID);

      expect(mockPrisma.behaviourDescriptionTemplate.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, is_active: true, category_id: CATEGORY_ID },
        orderBy: { display_order: 'asc' },
      });
    });
  });

  describe('createTemplate', () => {
    it('should create a template with category association', async () => {
      const dto = {
        category_id: CATEGORY_ID,
        locale: 'en' as const,
        text: 'Student showed excellent behaviour',
        display_order: 1,
        is_active: true,
      };
      const created = { id: TEMPLATE_ID, tenant_id: TENANT_ID, ...dto };
      mockPrisma.behaviourDescriptionTemplate.create.mockResolvedValue(created);

      const result = await service.createTemplate(TENANT_ID, dto);

      expect(result).toEqual(created);
      expect(mockPrisma.behaviourDescriptionTemplate.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          category_id: CATEGORY_ID,
          locale: 'en',
          text: 'Student showed excellent behaviour',
          display_order: 1,
          is_active: true,
        },
      });
    });
  });

  describe('updateTemplate', () => {
    it('should partially update template fields', async () => {
      const existing = { id: TEMPLATE_ID, text: 'Old text', tenant_id: TENANT_ID };
      mockPrisma.behaviourDescriptionTemplate.findFirst.mockResolvedValue(existing);
      mockPrisma.behaviourDescriptionTemplate.update.mockResolvedValue({
        ...existing,
        text: 'Updated text',
      });

      const result = await service.updateTemplate(TENANT_ID, TEMPLATE_ID, {
        text: 'Updated text',
      });

      expect(result.text).toBe('Updated text');
      expect(mockPrisma.behaviourDescriptionTemplate.update).toHaveBeenCalledWith({
        where: { id: TEMPLATE_ID },
        data: expect.objectContaining({ text: 'Updated text' }),
      });
    });

    it('should throw NotFoundException when template does not exist', async () => {
      mockPrisma.behaviourDescriptionTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTemplate(TENANT_ID, 'nonexistent', { text: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update is_active flag', async () => {
      const existing = { id: TEMPLATE_ID, is_active: true, tenant_id: TENANT_ID };
      mockPrisma.behaviourDescriptionTemplate.findFirst.mockResolvedValue(existing);
      mockPrisma.behaviourDescriptionTemplate.update.mockResolvedValue({
        ...existing,
        is_active: false,
      });

      await service.updateTemplate(TENANT_ID, TEMPLATE_ID, {
        is_active: false,
      });

      expect(mockPrisma.behaviourDescriptionTemplate.update).toHaveBeenCalledWith({
        where: { id: TEMPLATE_ID },
        data: expect.objectContaining({ is_active: false }),
      });
    });

    it('should update locale field', async () => {
      const existing = { id: TEMPLATE_ID, locale: 'en', tenant_id: TENANT_ID };
      mockPrisma.behaviourDescriptionTemplate.findFirst.mockResolvedValue(existing);
      mockPrisma.behaviourDescriptionTemplate.update.mockResolvedValue({
        ...existing,
        locale: 'ar',
      });

      await service.updateTemplate(TENANT_ID, TEMPLATE_ID, {
        locale: 'ar' as const,
      });

      expect(mockPrisma.behaviourDescriptionTemplate.update).toHaveBeenCalledWith({
        where: { id: TEMPLATE_ID },
        data: expect.objectContaining({ locale: 'ar' }),
      });
    });

    it('should update display_order field', async () => {
      const existing = { id: TEMPLATE_ID, display_order: 1, tenant_id: TENANT_ID };
      mockPrisma.behaviourDescriptionTemplate.findFirst.mockResolvedValue(existing);
      mockPrisma.behaviourDescriptionTemplate.update.mockResolvedValue({
        ...existing,
        display_order: 5,
      });

      await service.updateTemplate(TENANT_ID, TEMPLATE_ID, {
        display_order: 5,
      });

      expect(mockPrisma.behaviourDescriptionTemplate.update).toHaveBeenCalledWith({
        where: { id: TEMPLATE_ID },
        data: expect.objectContaining({ display_order: 5 }),
      });
    });
  });

  // ─── updateCategory — additional branch coverage ──────────────────────

  describe('updateCategory — optional field branches', () => {
    it('should skip name dup check when name is undefined', async () => {
      const existing = { id: CATEGORY_ID, name: 'Old Name', tenant_id: TENANT_ID };
      mockPrisma.behaviourCategory.findFirst.mockResolvedValueOnce(existing);
      mockPrisma.behaviourCategory.update.mockResolvedValue({
        ...existing,
        severity: 5,
      });

      await service.updateCategory(TENANT_ID, CATEGORY_ID, { severity: 5 });

      // Only one findFirst call (for the category itself), no dup check
      expect(mockPrisma.behaviourCategory.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should update all optional fields in a single call', async () => {
      const existing = { id: CATEGORY_ID, name: 'Cat', tenant_id: TENANT_ID };
      mockPrisma.behaviourCategory.findFirst.mockResolvedValueOnce(existing);
      mockPrisma.behaviourCategory.update.mockResolvedValue(existing);

      await service.updateCategory(TENANT_ID, CATEGORY_ID, {
        name_ar: 'عربي',
        polarity: 'positive',
        color: '#FF0000',
        icon: 'star',
        requires_follow_up: true,
        requires_parent_notification: true,
        parent_visible: false,
        benchmark_category: 'praise',
        display_order: 3,
      });

      expect(mockPrisma.behaviourCategory.update).toHaveBeenCalledWith({
        where: { id: CATEGORY_ID },
        data: expect.objectContaining({
          name_ar: 'عربي',
          polarity: 'positive',
          color: '#FF0000',
          icon: 'star',
          requires_follow_up: true,
          requires_parent_notification: true,
          parent_visible: false,
          benchmark_category: 'praise',
          display_order: 3,
        }),
      });
    });
  });
});
