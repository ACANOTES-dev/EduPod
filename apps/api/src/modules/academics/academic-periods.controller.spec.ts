import { Test, TestingModule } from '@nestjs/testing';

import { AcademicPeriodsController } from './academic-periods.controller';
import { AcademicPeriodsService } from './academic-periods.service';
import type { CreateAcademicPeriodDto } from './dto/create-academic-period.dto';
import type {
  UpdateAcademicPeriodDto,
  UpdateAcademicPeriodStatusDto,
} from './dto/update-academic-period.dto';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const YEAR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PERIOD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const tenantContext = { tenant_id: TENANT_ID };

function buildMockService() {
  return {
    findAll: jest.fn(),
    create: jest.fn(),
    findAllForYear: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
  };
}

describe('AcademicPeriodsController', () => {
  let controller: AcademicPeriodsController;
  let service: ReturnType<typeof buildMockService>;

  beforeEach(async () => {
    service = buildMockService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AcademicPeriodsController],
      providers: [{ provide: AcademicPeriodsService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AcademicPeriodsController>(AcademicPeriodsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('should call service.findAll with tenant_id and pageSize', async () => {
      const query = { page: 1, pageSize: 50, order: 'asc' as const };
      const expected = {
        data: [{ id: PERIOD_ID, name: 'Term 1', academic_year_id: YEAR_ID }],
        meta: { total: 1, page: 1, pageSize: 50 },
      };

      service.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(tenantContext, query);

      expect(result).toEqual(expected);
      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, query.pageSize);
    });

    it('should call service.findAll with default pageSize when not overridden', async () => {
      const query = { page: 1, pageSize: 20, order: 'asc' as const };
      const expected = { data: [], meta: { total: 0, page: 1, pageSize: 20 } };

      service.findAll.mockResolvedValue(expected);

      await controller.findAll(tenantContext, query);

      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, 20);
    });
  });

  describe('create', () => {
    it('should call service.create with tenant_id, yearId, and dto', async () => {
      const dto: CreateAcademicPeriodDto = {
        name: 'Term 1',
        period_type: 'term',
        start_date: '2025-09-01',
        end_date: '2025-12-19',
        status: 'planned',
      };
      const expected = {
        id: PERIOD_ID,
        tenant_id: TENANT_ID,
        academic_year_id: YEAR_ID,
        ...dto,
      };

      service.create.mockResolvedValue(expected);

      const result = await controller.create(tenantContext, YEAR_ID, dto);

      expect(result).toEqual(expected);
      expect(service.create).toHaveBeenCalledWith(TENANT_ID, YEAR_ID, dto);
    });
  });

  describe('findAllForYear', () => {
    it('should call service.findAllForYear with tenant_id and yearId', async () => {
      const expected = [
        { id: PERIOD_ID, name: 'Term 1', academic_year_id: YEAR_ID },
        { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', name: 'Term 2', academic_year_id: YEAR_ID },
      ];

      service.findAllForYear.mockResolvedValue(expected);

      const result = await controller.findAllForYear(tenantContext, YEAR_ID);

      expect(result).toEqual(expected);
      expect(service.findAllForYear).toHaveBeenCalledWith(TENANT_ID, YEAR_ID);
    });
  });

  describe('update', () => {
    it('should call service.update with tenant_id, id, and dto', async () => {
      const dto: UpdateAcademicPeriodDto = { name: 'Autumn Term' };
      const expected = { id: PERIOD_ID, name: 'Autumn Term', tenant_id: TENANT_ID };

      service.update.mockResolvedValue(expected);

      const result = await controller.update(tenantContext, PERIOD_ID, dto);

      expect(result).toEqual(expected);
      expect(service.update).toHaveBeenCalledWith(TENANT_ID, PERIOD_ID, dto);
    });
  });

  describe('updateStatus', () => {
    it('should call service.updateStatus with tenant_id, id, and status', async () => {
      const dto: UpdateAcademicPeriodStatusDto = { status: 'active' };
      const expected = { id: PERIOD_ID, status: 'active', tenant_id: TENANT_ID };

      service.updateStatus.mockResolvedValue(expected);

      const result = await controller.updateStatus(tenantContext, PERIOD_ID, dto);

      expect(result).toEqual(expected);
      expect(service.updateStatus).toHaveBeenCalledWith(TENANT_ID, PERIOD_ID, 'active');
    });
  });
});
