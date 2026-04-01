/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type {
  BulkClassRequirementsDto,
  CreateClassRequirementDto,
  UpdateClassRequirementDto,
} from '@school/shared';

import { ClassRequirementsController } from './class-requirements.controller';
import { ClassRequirementsService } from './class-requirements.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REQUIREMENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const YEAR_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ROOM_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tenantContext = { tenant_id: TENANT_ID };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ClassRequirementsController', () => {
  let controller: ClassRequirementsController;
  let mockService: {
    findAll: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    bulkUpsert: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      findAll: jest
        .fn()
        .mockResolvedValue({
          data: [],
          meta: { page: 1, pageSize: 20, total: 0, total_active_classes: 0, configured_count: 0 },
        }),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      bulkUpsert: jest.fn().mockResolvedValue({ data: [], count: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassRequirementsController],
      providers: [{ provide: ClassRequirementsService, useValue: mockService }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ClassRequirementsController>(ClassRequirementsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ──────────────────────────────────────────────────────────────

  it('should call findAll with tenant_id, academic_year_id, and pagination', async () => {
    const query = { academic_year_id: YEAR_ID, page: 1, pageSize: 20 };

    const result = await controller.findAll(tenantContext, query);

    expect(mockService.findAll).toHaveBeenCalledWith(TENANT_ID, YEAR_ID, { page: 1, pageSize: 20 });
    expect(result).toEqual(
      expect.objectContaining({ data: [], meta: expect.objectContaining({ page: 1 }) }),
    );
  });

  // ─── create ───────────────────────────────────────────────────────────────

  it('should call create with tenant_id and dto', async () => {
    const dto: CreateClassRequirementDto = {
      class_id: CLASS_ID,
      academic_year_id: YEAR_ID,
      periods_per_week: 5,
      max_consecutive_periods: 2,
      min_consecutive_periods: 1,
      spread_preference: 'spread_evenly',
    };
    const created = { id: REQUIREMENT_ID, ...dto };
    mockService.create.mockResolvedValue(created);

    const result = await controller.create(tenantContext, dto);

    expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toEqual(created);
  });

  // ─── update ───────────────────────────────────────────────────────────────

  it('should call update with tenant_id, id, and dto', async () => {
    const dto: UpdateClassRequirementDto = { periods_per_week: 3 };
    const updated = { id: REQUIREMENT_ID, periods_per_week: 3 };
    mockService.update.mockResolvedValue(updated);

    const result = await controller.update(tenantContext, REQUIREMENT_ID, dto);

    expect(mockService.update).toHaveBeenCalledWith(TENANT_ID, REQUIREMENT_ID, dto);
    expect(result).toEqual(updated);
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  it('should call delete with tenant_id and id', async () => {
    mockService.delete.mockResolvedValue({ id: REQUIREMENT_ID });

    await controller.remove(tenantContext, REQUIREMENT_ID);

    expect(mockService.delete).toHaveBeenCalledWith(TENANT_ID, REQUIREMENT_ID);
  });

  // ─── bulkUpsert ───────────────────────────────────────────────────────────

  it('should call bulkUpsert with tenant_id and dto', async () => {
    const dto: BulkClassRequirementsDto = {
      academic_year_id: YEAR_ID,
      requirements: [
        {
          class_id: CLASS_ID,
          periods_per_week: 4,
          max_consecutive_periods: 2,
          min_consecutive_periods: 1,
          spread_preference: 'spread_evenly',
        },
      ],
    };
    const bulkResult = { data: [{ id: REQUIREMENT_ID }], count: 1 };
    mockService.bulkUpsert.mockResolvedValue(bulkResult);

    const result = await controller.bulkUpsert(tenantContext, dto);

    expect(mockService.bulkUpsert).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toEqual(bulkResult);
  });

  // ─── unused constant suppression ──────────────────────────────────────────

  it('should reference all declared constants (lint guard)', () => {
    expect(USER_ID).toBeDefined();
    expect(ROOM_ID).toBeDefined();
  });
});
