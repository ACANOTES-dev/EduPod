import { Test, TestingModule } from '@nestjs/testing';

import { AcademicYearsController } from './academic-years.controller';
import { AcademicYearsService } from './academic-years.service';
import type { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import type {
  UpdateAcademicYearDto,
  UpdateAcademicYearStatusDto,
} from './dto/update-academic-year.dto';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const YEAR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const tenantContext = { tenant_id: TENANT_ID };

function buildMockService() {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
  };
}

describe('AcademicYearsController', () => {
  let controller: AcademicYearsController;
  let service: ReturnType<typeof buildMockService>;

  beforeEach(async () => {
    service = buildMockService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AcademicYearsController],
      providers: [{ provide: AcademicYearsService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AcademicYearsController>(AcademicYearsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should call service.create with tenant_id and dto', async () => {
      const dto: CreateAcademicYearDto = {
        name: '2025–2026',
        start_date: '2025-09-01',
        end_date: '2026-06-30',
        status: 'planned',
      };
      const expected = { id: YEAR_ID, ...dto, tenant_id: TENANT_ID };

      service.create.mockResolvedValue(expected);

      const result = await controller.create(tenantContext, dto);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith(TENANT_ID, dto);
    });
  });

  describe('findAll', () => {
    it('should call service.findAll with tenant_id and query params', async () => {
      const query = { status: 'active' as const, page: 1, pageSize: 20 };
      const expected = {
        data: [{ id: YEAR_ID, name: '2025–2026' }],
        meta: { page: 1, pageSize: 20, total: 1 },
      };

      service.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(tenantContext, query);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, {
        status: 'active',
        page: 1,
        pageSize: 20,
      });
    });

    it('should call service.findAll without status when not provided', async () => {
      const query = { page: 2, pageSize: 10 };
      const expected = { data: [], meta: { page: 2, pageSize: 10, total: 0 } };

      service.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(tenantContext, query);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, {
        status: undefined,
        page: 2,
        pageSize: 10,
      });
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with tenant_id and id', async () => {
      const expected = {
        id: YEAR_ID,
        name: '2025–2026',
        tenant_id: TENANT_ID,
        periods: [],
      };

      service.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(tenantContext, YEAR_ID);

      expect(result).toEqual(expected);
      expect(service.findOne).toHaveBeenCalledWith(TENANT_ID, YEAR_ID);
    });
  });

  describe('update', () => {
    it('should call service.update with tenant_id, id, and dto', async () => {
      const dto: UpdateAcademicYearDto = { name: '2025–2026 Revised' };
      const expected = { id: YEAR_ID, name: '2025–2026 Revised', tenant_id: TENANT_ID };

      service.update.mockResolvedValue(expected);

      const result = await controller.update(tenantContext, YEAR_ID, dto);

      expect(result).toEqual(expected);
      expect(service.update).toHaveBeenCalledWith(TENANT_ID, YEAR_ID, dto);
    });
  });

  describe('updateStatus', () => {
    it('should call service.updateStatus with tenant_id, id, and status', async () => {
      const dto: UpdateAcademicYearStatusDto = { status: 'active' };
      const expected = { id: YEAR_ID, status: 'active', tenant_id: TENANT_ID };

      service.updateStatus.mockResolvedValue(expected);

      const result = await controller.updateStatus(tenantContext, YEAR_ID, dto);

      expect(result).toEqual(expected);
      expect(service.updateStatus).toHaveBeenCalledWith(TENANT_ID, YEAR_ID, 'active');
    });
  });
});
