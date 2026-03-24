import { Test, TestingModule } from '@nestjs/testing';

import { ClassAssignmentsController } from './class-assignments.controller';
import { ClassAssignmentService } from './class-assignments.service';
import type { BulkClassAssignmentDto } from './dto/bulk-class-assignment.dto';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const YEAR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const mockTenant = { tenant_id: TENANT_ID };

function buildMockClassAssignmentService() {
  return {
    getAssignments: jest.fn(),
    getExportData: jest.fn(),
    bulkAssign: jest.fn(),
  };
}

describe('ClassAssignmentsController', () => {
  let controller: ClassAssignmentsController;
  let service: ReturnType<typeof buildMockClassAssignmentService>;

  beforeEach(async () => {
    service = buildMockClassAssignmentService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassAssignmentsController],
      providers: [{ provide: ClassAssignmentService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ClassAssignmentsController>(ClassAssignmentsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call getAssignments with tenant_id', async () => {
    const expected = { year_groups: [], unassigned_count: 0 };
    service.getAssignments.mockResolvedValue(expected);

    const result = await controller.getClassAssignments(mockTenant);

    expect(service.getAssignments).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toBe(expected);
  });

  it('should call getExportData with tenant_id', async () => {
    const expected = {
      academic_year: '2025/2026',
      school_name: 'Test School',
      logo_url: null,
      class_lists: [],
    };
    service.getExportData.mockResolvedValue(expected);

    const result = await controller.getExportData(mockTenant);

    expect(service.getExportData).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toBe(expected);
  });

  it('should call bulkAssign with tenant_id and dto', async () => {
    const dto: BulkClassAssignmentDto = {
      start_date: '2025-09-01',
      assignments: [{ student_id: STUDENT_ID, class_id: CLASS_ID }],
    };
    const expected = { assigned: 1, skipped: 0, errors: [] };
    service.bulkAssign.mockResolvedValue(expected);

    const result = await controller.bulkAssign(mockTenant, dto);

    expect(service.bulkAssign).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toBe(expected);
  });

  it('should forward year_group filter from getAssignments result', async () => {
    const expected = {
      year_groups: [{ id: YEAR_ID, name: 'Year 10', display_order: 1, homeroom_classes: [], students: [] }],
      unassigned_count: 5,
    };
    service.getAssignments.mockResolvedValue(expected);

    const result = await controller.getClassAssignments(mockTenant);

    expect(result).toEqual(expected);
  });
});
