/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';
import { z } from 'zod';

import { ClassEnrolmentsController } from './class-enrolments.controller';
import { ClassEnrolmentsService } from './class-enrolments.service';
import type { BulkEnrolDto } from './dto/bulk-enrol.dto';
import type { CreateEnrolmentDto } from './dto/create-enrolment.dto';
import type { UpdateEnrolmentStatusDto } from './dto/update-enrolment-status.dto';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ENROLMENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const mockTenant = { tenant_id: TENANT_ID };

const _enrolmentStatusQuerySchema = z.object({
  status: z.enum(['active', 'dropped', 'completed']).optional(),
});

type EnrolmentStatusQuery = z.infer<typeof _enrolmentStatusQuerySchema>;

function buildMockClassEnrolmentsService() {
  return {
    findAllForClass: jest.fn(),
    create: jest.fn(),
    bulkEnrol: jest.fn(),
    updateStatus: jest.fn(),
  };
}

describe('ClassEnrolmentsController', () => {
  let controller: ClassEnrolmentsController;
  let service: ReturnType<typeof buildMockClassEnrolmentsService>;

  beforeEach(async () => {
    service = buildMockClassEnrolmentsService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassEnrolmentsController],
      providers: [{ provide: ClassEnrolmentsService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ClassEnrolmentsController>(ClassEnrolmentsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call findAllForClass with tenant_id, classId, and status', async () => {
    const query: EnrolmentStatusQuery = { status: 'active' };
    const expected = { data: [] };
    service.findAllForClass.mockResolvedValue(expected);

    const result = await controller.findAllForClass(mockTenant, CLASS_ID, query);

    expect(service.findAllForClass).toHaveBeenCalledWith(TENANT_ID, CLASS_ID, 'active');
    expect(result).toBe(expected);
  });

  it('should call findAllForClass with undefined status when not provided', async () => {
    const query: EnrolmentStatusQuery = {};
    const expected = { data: [] };
    service.findAllForClass.mockResolvedValue(expected);

    const result = await controller.findAllForClass(mockTenant, CLASS_ID, query);

    expect(service.findAllForClass).toHaveBeenCalledWith(TENANT_ID, CLASS_ID, undefined);
    expect(result).toBe(expected);
  });

  it('should call create with tenant_id, classId, and dto', async () => {
    const dto: CreateEnrolmentDto = {
      student_id: STUDENT_ID,
      start_date: '2025-09-01',
    };
    const expected = { id: ENROLMENT_ID, status: 'active' };
    service.create.mockResolvedValue(expected);

    const result = await controller.create(mockTenant, CLASS_ID, dto);

    expect(service.create).toHaveBeenCalledWith(TENANT_ID, CLASS_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call bulkEnrol with tenant_id, classId, and dto', async () => {
    const dto: BulkEnrolDto = {
      student_ids: [STUDENT_ID],
      start_date: '2025-09-01',
    };
    const expected = { enrolled: 1, skipped: 0, errors: [] };
    service.bulkEnrol.mockResolvedValue(expected);

    const result = await controller.bulkEnrol(mockTenant, CLASS_ID, dto);

    expect(service.bulkEnrol).toHaveBeenCalledWith(TENANT_ID, CLASS_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call updateStatus with tenant_id, id, and dto', async () => {
    const dto: UpdateEnrolmentStatusDto = { status: 'dropped' };
    const expected = { id: ENROLMENT_ID, status: 'dropped' };
    service.updateStatus.mockResolvedValue(expected);

    const result = await controller.updateStatus(mockTenant, ENROLMENT_ID, dto);

    expect(service.updateStatus).toHaveBeenCalledWith(TENANT_ID, ENROLMENT_ID, dto);
    expect(result).toBe(expected);
  });
});
