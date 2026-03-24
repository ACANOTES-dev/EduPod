import { Test, TestingModule } from '@nestjs/testing';

import type { CreateSubjectDto } from './dto/create-subject.dto';
import type { UpdateSubjectDto } from './dto/update-subject.dto';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SUBJECT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const tenantContext = { tenant_id: TENANT_ID };

function buildMockService() {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
}

describe('SubjectsController', () => {
  let controller: SubjectsController;
  let service: ReturnType<typeof buildMockService>;

  beforeEach(async () => {
    service = buildMockService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubjectsController],
      providers: [{ provide: SubjectsService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SubjectsController>(SubjectsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should call service.create with tenant_id and dto', async () => {
      const dto: CreateSubjectDto = {
        name: 'Mathematics',
        code: 'MATH-01',
        subject_type: 'academic',
        active: true,
      };
      const expected = { id: SUBJECT_ID, tenant_id: TENANT_ID, ...dto };

      service.create.mockResolvedValue(expected);

      const result = await controller.create(tenantContext, dto);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith(TENANT_ID, dto);
    });

    it('should pass dto with optional code omitted', async () => {
      const dto: CreateSubjectDto = {
        name: 'Playground Supervision',
        subject_type: 'supervision',
        active: true,
      };
      const expected = { id: SUBJECT_ID, tenant_id: TENANT_ID, code: null, ...dto };

      service.create.mockResolvedValue(expected);

      const result = await controller.create(tenantContext, dto);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith(TENANT_ID, dto);
    });
  });

  describe('findAll', () => {
    it('should call service.findAll with tenant_id and filters', async () => {
      const query = { subject_type: 'academic' as const, active: true, page: 1, pageSize: 100 };
      const expected = {
        data: [{ id: SUBJECT_ID, name: 'Mathematics', subject_type: 'academic', active: true }],
        meta: { page: 1, pageSize: 100, total: 1 },
      };

      service.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(tenantContext, query);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, {
        subject_type: 'academic',
        active: true,
        page: 1,
        pageSize: 100,
      });
    });

    it('should call service.findAll with undefined optional filters when not provided', async () => {
      const query = { page: 1, pageSize: 100 };
      const expected = { data: [], meta: { page: 1, pageSize: 100, total: 0 } };

      service.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(tenantContext, query);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, {
        subject_type: undefined,
        active: undefined,
        page: 1,
        pageSize: 100,
      });
    });
  });

  describe('update', () => {
    it('should call service.update with tenant_id, id, and dto', async () => {
      const dto: UpdateSubjectDto = { name: 'Advanced Mathematics', active: false };
      const expected = {
        id: SUBJECT_ID,
        tenant_id: TENANT_ID,
        name: 'Advanced Mathematics',
        active: false,
      };

      service.update.mockResolvedValue(expected);

      const result = await controller.update(tenantContext, SUBJECT_ID, dto);

      expect(result).toEqual(expected);
      expect(service.update).toHaveBeenCalledWith(TENANT_ID, SUBJECT_ID, dto);
    });
  });

  describe('remove', () => {
    it('should call service.remove with tenant_id and id', async () => {
      const expected = { id: SUBJECT_ID };

      service.remove.mockResolvedValue(expected);

      const result = await controller.remove(tenantContext, SUBJECT_ID);

      expect(result).toEqual(expected);
      expect(service.remove).toHaveBeenCalledWith(TENANT_ID, SUBJECT_ID);
    });

    it('should forward undefined return from service.remove (204 No Content)', async () => {
      service.remove.mockResolvedValue(undefined);

      const result = await controller.remove(tenantContext, SUBJECT_ID);

      expect(result).toBeUndefined();
      expect(service.remove).toHaveBeenCalledWith(TENANT_ID, SUBJECT_ID);
    });
  });
});
