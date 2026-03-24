import { Test, TestingModule } from '@nestjs/testing';

import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import type { AssignClassStaffDto } from './dto/assign-class-staff.dto';
import type { CreateClassDto } from './dto/create-class.dto';
import type { UpdateClassDto, UpdateClassStatusDto } from './dto/update-class.dto';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const YEAR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STAFF_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const mockTenant = { tenant_id: TENANT_ID };

function buildMockClassesService() {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    findStaff: jest.fn(),
    assignStaff: jest.fn(),
    removeStaff: jest.fn(),
    preview: jest.fn(),
  };
}

describe('ClassesController', () => {
  let controller: ClassesController;
  let service: ReturnType<typeof buildMockClassesService>;

  beforeEach(async () => {
    service = buildMockClassesService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassesController],
      providers: [{ provide: ClassesService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ClassesController>(ClassesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call create with tenant_id and dto', async () => {
    const dto: CreateClassDto = {
      name: '10A',
      academic_year_id: YEAR_ID,
      status: 'active',
    };
    const expected = { id: CLASS_ID, name: '10A' };
    service.create.mockResolvedValue(expected);

    const result = await controller.create(mockTenant, dto);

    expect(service.create).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call findAll with tenant_id and query params', async () => {
    const query = { page: 1, pageSize: 20, academic_year_id: YEAR_ID, status: 'active' as const };
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    service.findAll.mockResolvedValue(expected);

    const result = await controller.findAll(mockTenant, query);

    expect(service.findAll).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ page: 1, pageSize: 20, academic_year_id: YEAR_ID, status: 'active' }),
    );
    expect(result).toBe(expected);
  });

  it('should call findOne with tenant_id and id', async () => {
    const expected = { id: CLASS_ID, name: '10A' };
    service.findOne.mockResolvedValue(expected);

    const result = await controller.findOne(mockTenant, CLASS_ID);

    expect(service.findOne).toHaveBeenCalledWith(TENANT_ID, CLASS_ID);
    expect(result).toBe(expected);
  });

  it('should call update with tenant_id, id, and dto', async () => {
    const dto: UpdateClassDto = { name: 'Updated Name' };
    const expected = { id: CLASS_ID, name: 'Updated Name' };
    service.update.mockResolvedValue(expected);

    const result = await controller.update(mockTenant, CLASS_ID, dto);

    expect(service.update).toHaveBeenCalledWith(TENANT_ID, CLASS_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call updateStatus with tenant_id, id, and dto', async () => {
    const dto: UpdateClassStatusDto = { status: 'inactive' };
    const expected = { id: CLASS_ID, status: 'inactive' };
    service.updateStatus.mockResolvedValue(expected);

    const result = await controller.updateStatus(mockTenant, CLASS_ID, dto);

    expect(service.updateStatus).toHaveBeenCalledWith(TENANT_ID, CLASS_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call findStaff with tenant_id and id', async () => {
    const expected = { data: [] };
    service.findStaff.mockResolvedValue(expected);

    const result = await controller.findStaff(mockTenant, CLASS_ID);

    expect(service.findStaff).toHaveBeenCalledWith(TENANT_ID, CLASS_ID);
    expect(result).toBe(expected);
  });

  it('should call assignStaff with tenant_id, id, and dto', async () => {
    const dto: AssignClassStaffDto = { staff_profile_id: STAFF_ID, assignment_role: 'teacher' };
    const expected = { class_id: CLASS_ID, staff_profile_id: STAFF_ID };
    service.assignStaff.mockResolvedValue(expected);

    const result = await controller.assignStaff(mockTenant, CLASS_ID, dto);

    expect(service.assignStaff).toHaveBeenCalledWith(TENANT_ID, CLASS_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call removeStaff with tenant_id, classId, staffProfileId, and role', async () => {
    service.removeStaff.mockResolvedValue(undefined);

    await controller.removeStaff(mockTenant, CLASS_ID, STAFF_ID, 'teacher');

    expect(service.removeStaff).toHaveBeenCalledWith(TENANT_ID, CLASS_ID, STAFF_ID, 'teacher');
  });

  it('should call preview with tenant_id and id', async () => {
    const expected = {
      id: CLASS_ID,
      entity_type: 'class' as const,
      primary_label: '10A',
      secondary_label: '2025/2026',
      status: 'active',
      facts: [],
    };
    service.preview.mockResolvedValue(expected);

    const result = await controller.preview(mockTenant, CLASS_ID);

    expect(service.preview).toHaveBeenCalledWith(TENANT_ID, CLASS_ID);
    expect(result).toBe(expected);
  });
});
