import { Test, TestingModule } from '@nestjs/testing';

import { GradingScalesController } from './grading-scales.controller';
import { GradingScalesService } from './grading-scales.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SCALE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const tenantContext = { tenant_id: TENANT_ID };

const mockGradingScalesService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('GradingScalesController', () => {
  let controller: GradingScalesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GradingScalesController],
      providers: [
        { provide: GradingScalesService, useValue: mockGradingScalesService },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GradingScalesController>(GradingScalesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated grading scales for the tenant', async () => {
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockGradingScalesService.findAll.mockResolvedValue(expected);

    const result = await controller.findAll(tenantContext, { page: 1, pageSize: 20 });

    expect(result).toEqual(expected);
    expect(mockGradingScalesService.findAll).toHaveBeenCalledWith(TENANT_ID, { page: 1, pageSize: 20 });
  });

  it('should return a single grading scale by id', async () => {
    const scale = { id: SCALE_ID, name: 'A-F Scale', tenant_id: TENANT_ID };
    mockGradingScalesService.findOne.mockResolvedValue(scale);

    const result = await controller.findOne(tenantContext, SCALE_ID);

    expect(result).toEqual(scale);
    expect(mockGradingScalesService.findOne).toHaveBeenCalledWith(TENANT_ID, SCALE_ID);
  });

  it('should create a grading scale and return the new record', async () => {
    const dto = {
      name: 'A-F Scale',
      config_json: { type: 'numeric' as const, ranges: [{ label: 'A', min: 90, max: 100, gpa_value: 4.0 }] },
    };
    const created = { id: SCALE_ID, ...dto, tenant_id: TENANT_ID };
    mockGradingScalesService.create.mockResolvedValue(created);

    const result = await controller.create(tenantContext, dto);

    expect(result).toEqual(created);
    expect(mockGradingScalesService.create).toHaveBeenCalledWith(TENANT_ID, dto);
  });

  it('should update a grading scale and return the updated record', async () => {
    const dto = { name: 'Updated Scale' };
    const updated = { id: SCALE_ID, name: 'Updated Scale', tenant_id: TENANT_ID };
    mockGradingScalesService.update.mockResolvedValue(updated);

    const result = await controller.update(tenantContext, SCALE_ID, dto);

    expect(result).toEqual(updated);
    expect(mockGradingScalesService.update).toHaveBeenCalledWith(TENANT_ID, SCALE_ID, dto);
  });

  it('should delete a grading scale and delegate to the service', async () => {
    mockGradingScalesService.delete.mockResolvedValue({ id: SCALE_ID });

    await controller.delete(tenantContext, SCALE_ID);

    expect(mockGradingScalesService.delete).toHaveBeenCalledWith(TENANT_ID, SCALE_ID);
  });
});
