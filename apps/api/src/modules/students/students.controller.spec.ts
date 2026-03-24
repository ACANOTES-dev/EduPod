/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { CreateStudentDto } from './dto/create-student.dto';
import type { UpdateStudentStatusDto } from './dto/update-student-status.dto';
import type { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const HOUSEHOLD_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const mockTenant = { tenant_id: TENANT_ID };

function buildMockStudentsService() {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    allergyReport: jest.fn(),
    preview: jest.fn(),
    exportPack: jest.fn(),
  };
}

describe('StudentsController', () => {
  let controller: StudentsController;
  let service: ReturnType<typeof buildMockStudentsService>;

  beforeEach(async () => {
    service = buildMockStudentsService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentsController],
      providers: [{ provide: StudentsService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StudentsController>(StudentsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call create with tenant_id and dto', async () => {
    const dto: CreateStudentDto = {
      household_id: HOUSEHOLD_ID,
      first_name: 'John',
      last_name: 'Doe',
      date_of_birth: '2010-05-15',
      national_id: 'NID-001',
      nationality: 'Irish',
      status: 'active',
    };
    const expected = { id: STUDENT_ID, first_name: 'John', last_name: 'Doe' };
    service.create.mockResolvedValue(expected);

    const result = await controller.create(mockTenant, dto);

    expect(service.create).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call findAll with tenant_id and query params', async () => {
    const query = {
      page: 1,
      pageSize: 20,
      status: 'active' as const,
      year_group_id: undefined,
      household_id: undefined,
      has_allergy: undefined,
      search: undefined,
      sort: undefined,
      order: undefined,
    };
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    service.findAll.mockResolvedValue(expected);

    const result = await controller.findAll(mockTenant, query);

    expect(service.findAll).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ page: 1, pageSize: 20, status: 'active' }),
    );
    expect(result).toBe(expected);
  });

  it('should call findOne with tenant_id and id', async () => {
    const expected = { id: STUDENT_ID, first_name: 'John' };
    service.findOne.mockResolvedValue(expected);

    const result = await controller.findOne(mockTenant, STUDENT_ID);

    expect(service.findOne).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    expect(result).toBe(expected);
  });

  it('should call update with tenant_id, id, and dto', async () => {
    const dto: UpdateStudentDto = { first_name: 'Jonathan' };
    const expected = { id: STUDENT_ID, first_name: 'Jonathan' };
    service.update.mockResolvedValue(expected);

    const result = await controller.update(mockTenant, STUDENT_ID, dto);

    expect(service.update).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call updateStatus with tenant_id, id, and dto', async () => {
    const dto: UpdateStudentStatusDto = { status: 'withdrawn', reason: 'Family relocation' };
    const expected = { id: STUDENT_ID, status: 'withdrawn' };
    service.updateStatus.mockResolvedValue(expected);

    const result = await controller.updateStatus(mockTenant, STUDENT_ID, dto);

    expect(service.updateStatus).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call allergyReport with tenant_id and filters', async () => {
    const query = { year_group_id: undefined, class_id: undefined, format: undefined };
    const expected = { data: [], meta: { total: 0 } };
    service.allergyReport.mockResolvedValue(expected);

    const result = await controller.allergyReport(mockTenant, query);

    expect(service.allergyReport).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ year_group_id: undefined, class_id: undefined }),
    );
    expect(result).toBe(expected);
  });

  it('should call preview with tenant_id and id', async () => {
    const expected = {
      id: STUDENT_ID,
      entity_type: 'student' as const,
      primary_label: 'John Doe',
      secondary_label: 'Year 5',
      status: 'active',
      facts: [],
    };
    service.preview.mockResolvedValue(expected);

    const result = await controller.preview(mockTenant, STUDENT_ID);

    expect(service.preview).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    expect(result).toBe(expected);
  });

  it('should call exportPack with tenant_id and id', async () => {
    const expected = { profile: { id: STUDENT_ID }, attendance_summary: [], grades: [], report_cards: [] };
    service.exportPack.mockResolvedValue(expected);

    const result = await controller.exportPack(mockTenant, STUDENT_ID);

    expect(service.exportPack).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    expect(result).toBe(expected);
  });
});
