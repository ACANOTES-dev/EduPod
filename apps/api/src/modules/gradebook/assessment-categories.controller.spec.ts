/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import { AssessmentCategoriesController } from './assessment-categories.controller';
import { AssessmentCategoriesService } from './assessment-categories.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CATEGORY_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const tenantContext = { tenant_id: TENANT_ID };

const mockAssessmentCategoriesService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('AssessmentCategoriesController', () => {
  let controller: AssessmentCategoriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssessmentCategoriesController],
      providers: [
        {
          provide: AssessmentCategoriesService,
          useValue: mockAssessmentCategoriesService,
        },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AssessmentCategoriesController>(AssessmentCategoriesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return all assessment categories for the tenant', async () => {
    const expected = [{ id: CATEGORY_ID, name: 'Homework', weight: 20 }];
    mockAssessmentCategoriesService.findAll.mockResolvedValue(expected);

    const result = await controller.findAll(tenantContext);

    expect(result).toEqual(expected);
    expect(mockAssessmentCategoriesService.findAll).toHaveBeenCalledWith(TENANT_ID);
  });

  it('should return a single assessment category by id', async () => {
    const category = { id: CATEGORY_ID, name: 'Homework', weight: 20, tenant_id: TENANT_ID };
    mockAssessmentCategoriesService.findOne.mockResolvedValue(category);

    const result = await controller.findOne(tenantContext, CATEGORY_ID);

    expect(result).toEqual(category);
    expect(mockAssessmentCategoriesService.findOne).toHaveBeenCalledWith(TENANT_ID, CATEGORY_ID);
  });

  it('should create an assessment category and return the new record', async () => {
    const dto = { name: 'Quizzes', default_weight: 15 };
    const created = { id: CATEGORY_ID, ...dto, tenant_id: TENANT_ID };
    mockAssessmentCategoriesService.create.mockResolvedValue(created);

    const result = await controller.create(tenantContext, dto);

    expect(result).toEqual(created);
    expect(mockAssessmentCategoriesService.create).toHaveBeenCalledWith(TENANT_ID, dto);
  });

  it('should update an assessment category and return the updated record', async () => {
    const dto = { name: 'Updated Category' };
    const updated = { id: CATEGORY_ID, name: 'Updated Category', tenant_id: TENANT_ID };
    mockAssessmentCategoriesService.update.mockResolvedValue(updated);

    const result = await controller.update(tenantContext, CATEGORY_ID, dto);

    expect(result).toEqual(updated);
    expect(mockAssessmentCategoriesService.update).toHaveBeenCalledWith(TENANT_ID, CATEGORY_ID, dto);
  });

  it('should delete an assessment category and delegate to the service', async () => {
    mockAssessmentCategoriesService.delete.mockResolvedValue({ id: CATEGORY_ID });

    await controller.delete(tenantContext, CATEGORY_ID);

    expect(mockAssessmentCategoriesService.delete).toHaveBeenCalledWith(TENANT_ID, CATEGORY_ID);
  });
});
