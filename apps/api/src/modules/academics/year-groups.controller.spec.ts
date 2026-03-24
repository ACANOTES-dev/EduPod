/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { CreateYearGroupDto } from './dto/create-year-group.dto';
import type { UpdateYearGroupDto } from './dto/update-year-group.dto';
import { YearGroupsController } from './year-groups.controller';
import { YearGroupsService } from './year-groups.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const YEAR_GROUP_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const NEXT_YEAR_GROUP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const tenantContext = { tenant_id: TENANT_ID };

function buildMockService() {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
}

describe('YearGroupsController', () => {
  let controller: YearGroupsController;
  let service: ReturnType<typeof buildMockService>;

  beforeEach(async () => {
    service = buildMockService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [YearGroupsController],
      providers: [{ provide: YearGroupsService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<YearGroupsController>(YearGroupsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should call service.create with tenant_id and dto', async () => {
      const dto: CreateYearGroupDto = {
        name: 'Year 1',
        display_order: 1,
        next_year_group_id: NEXT_YEAR_GROUP_ID,
      };
      const expected = { id: YEAR_GROUP_ID, tenant_id: TENANT_ID, ...dto };

      service.create.mockResolvedValue(expected);

      const result = await controller.create(tenantContext, dto);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith(TENANT_ID, dto);
    });

    it('should call service.create when next_year_group_id is null (final year group)', async () => {
      const dto: CreateYearGroupDto = {
        name: 'Year 6',
        display_order: 6,
        next_year_group_id: null,
      };
      const expected = { id: YEAR_GROUP_ID, tenant_id: TENANT_ID, ...dto };

      service.create.mockResolvedValue(expected);

      const result = await controller.create(tenantContext, dto);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith(TENANT_ID, dto);
    });
  });

  describe('findAll', () => {
    it('should call service.findAll with tenant_id', async () => {
      const expected = [
        { id: YEAR_GROUP_ID, name: 'Year 1', display_order: 1, tenant_id: TENANT_ID },
        { id: NEXT_YEAR_GROUP_ID, name: 'Year 2', display_order: 2, tenant_id: TENANT_ID },
      ];

      service.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(tenantContext);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID);
    });

    it('should return empty array when no year groups exist', async () => {
      service.findAll.mockResolvedValue([]);

      const result = await controller.findAll(tenantContext);

      expect(result).toEqual([]);
      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID);
    });
  });

  describe('update', () => {
    it('should call service.update with tenant_id, id, and dto', async () => {
      const dto: UpdateYearGroupDto = { name: 'Year 1 — Junior', display_order: 0 };
      const expected = {
        id: YEAR_GROUP_ID,
        tenant_id: TENANT_ID,
        name: 'Year 1 — Junior',
        display_order: 0,
      };

      service.update.mockResolvedValue(expected);

      const result = await controller.update(tenantContext, YEAR_GROUP_ID, dto);

      expect(result).toEqual(expected);
      expect(service.update).toHaveBeenCalledWith(TENANT_ID, YEAR_GROUP_ID, dto);
    });
  });

  describe('remove', () => {
    it('should call service.remove with tenant_id and id', async () => {
      const expected = { id: YEAR_GROUP_ID };

      service.remove.mockResolvedValue(expected);

      const result = await controller.remove(tenantContext, YEAR_GROUP_ID);

      expect(result).toEqual(expected);
      expect(service.remove).toHaveBeenCalledWith(TENANT_ID, YEAR_GROUP_ID);
    });

    it('should forward undefined return from service.remove (204 No Content)', async () => {
      service.remove.mockResolvedValue(undefined);

      const result = await controller.remove(tenantContext, YEAR_GROUP_ID);

      expect(result).toBeUndefined();
      expect(service.remove).toHaveBeenCalledWith(TENANT_ID, YEAR_GROUP_ID);
    });
  });
});
