import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { RegulatoryCalendarService } from './regulatory-calendar.service';
import { RegulatoryDesMappingsService } from './regulatory-des-mappings.service';
import { RegulatoryReducedDaysService } from './regulatory-reduced-days.service';
import { RegulatorySubmissionService } from './regulatory-submission.service';
import { RegulatoryTuslaMappingsService } from './regulatory-tusla-mappings.service';
import { RegulatoryController } from './regulatory.controller';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EVENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SUBMISSION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const MAPPING_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const STUDENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const RECORD_ID = '11111111-1111-1111-1111-111111111111';
const SUBJECT_ID = '22222222-2222-2222-2222-222222222222';

const mockTenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'admin@school.test',
  tenant_id: TENANT_ID,
  membership_id: 'membership-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('RegulatoryController', () => {
  let controller: RegulatoryController;
  let mockCalendarService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    seedDefaults: jest.Mock;
  };
  let mockSubmissionService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let mockTuslaMappingsService: {
    create: jest.Mock;
    findAll: jest.Mock;
    remove: jest.Mock;
  };
  let mockDesMappingsService: {
    create: jest.Mock;
    findAll: jest.Mock;
    remove: jest.Mock;
  };
  let mockReducedDaysService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    mockCalendarService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      seedDefaults: jest.fn(),
    };

    mockSubmissionService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    mockTuslaMappingsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      remove: jest.fn(),
    };

    mockDesMappingsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      remove: jest.fn(),
    };

    mockReducedDaysService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RegulatoryController],
      providers: [
        { provide: RegulatoryCalendarService, useValue: mockCalendarService },
        { provide: RegulatorySubmissionService, useValue: mockSubmissionService },
        { provide: RegulatoryTuslaMappingsService, useValue: mockTuslaMappingsService },
        { provide: RegulatoryDesMappingsService, useValue: mockDesMappingsService },
        { provide: RegulatoryReducedDaysService, useValue: mockReducedDaysService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RegulatoryController>(RegulatoryController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Calendar ───────────────────────────────────────────────────────────────

  it('should list calendar events', async () => {
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockCalendarService.findAll.mockResolvedValue(expected);

    const result = await controller.listCalendarEvents(mockTenant, {
      page: 1,
      pageSize: 20,
    });

    expect(result).toEqual(expected);
    expect(mockCalendarService.findAll).toHaveBeenCalledWith(TENANT_ID, {
      page: 1,
      pageSize: 20,
      domain: undefined,
      status: undefined,
      academic_year: undefined,
      from_date: undefined,
      to_date: undefined,
    });
  });

  it('should create a calendar event', async () => {
    const dto = {
      domain: 'tusla_attendance' as const,
      event_type: 'hard_deadline' as const,
      title: 'Tusla SAR Period 1',
      due_date: '2026-02-01',
      is_recurring: false,
      reminder_days: [] as number[],
    };
    const expected = { id: EVENT_ID, ...dto };
    mockCalendarService.create.mockResolvedValue(expected);

    const result = await controller.createCalendarEvent(mockTenant, mockUser, dto);

    expect(result).toEqual(expected);
    expect(mockCalendarService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
  });

  it('should update a calendar event', async () => {
    const dto = { status: 'submitted' as const };
    const expected = { id: EVENT_ID, status: 'submitted' };
    mockCalendarService.update.mockResolvedValue(expected);

    const result = await controller.updateCalendarEvent(mockTenant, mockUser, EVENT_ID, dto);

    expect(result).toEqual(expected);
    expect(mockCalendarService.update).toHaveBeenCalledWith(TENANT_ID, EVENT_ID, USER_ID, dto);
  });

  it('should delete a calendar event', async () => {
    mockCalendarService.remove.mockResolvedValue(undefined);

    await controller.deleteCalendarEvent(mockTenant, EVENT_ID);

    expect(mockCalendarService.remove).toHaveBeenCalledWith(TENANT_ID, EVENT_ID);
  });

  it('should seed default calendar events', async () => {
    const expected = { created: 9, total: 9 };
    mockCalendarService.seedDefaults.mockResolvedValue(expected);

    const result = await controller.seedCalendarDefaults(mockTenant, { academic_year: '2025-2026' });

    expect(result).toEqual(expected);
    expect(mockCalendarService.seedDefaults).toHaveBeenCalledWith(TENANT_ID, '2025-2026');
  });

  // ─── Submissions ──────────────────────────────────────────────────────────

  it('should list submissions', async () => {
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockSubmissionService.findAll.mockResolvedValue(expected);

    const result = await controller.listSubmissions(mockTenant, {
      page: 1,
      pageSize: 20,
    });

    expect(result).toEqual(expected);
  });

  it('should get a single submission', async () => {
    const expected = { id: SUBMISSION_ID, submission_type: 'tusla_sar_period_1' };
    mockSubmissionService.findOne.mockResolvedValue(expected);

    const result = await controller.getSubmission(mockTenant, SUBMISSION_ID);

    expect(result).toEqual(expected);
    expect(mockSubmissionService.findOne).toHaveBeenCalledWith(TENANT_ID, SUBMISSION_ID);
  });

  it('should create a submission', async () => {
    const dto = {
      domain: 'tusla_attendance' as const,
      submission_type: 'tusla_sar_period_1',
      academic_year: '2025-2026',
      status: 'in_progress' as const,
    };
    const expected = { id: SUBMISSION_ID, ...dto };
    mockSubmissionService.create.mockResolvedValue(expected);

    const result = await controller.createSubmission(mockTenant, mockUser, dto);

    expect(result).toEqual(expected);
    expect(mockSubmissionService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
  });

  it('should update a submission', async () => {
    const dto = { status: 'submitted' as const };
    const expected = { id: SUBMISSION_ID, status: 'submitted' };
    mockSubmissionService.update.mockResolvedValue(expected);

    const result = await controller.updateSubmission(mockTenant, mockUser, SUBMISSION_ID, dto);

    expect(result).toEqual(expected);
    expect(mockSubmissionService.update).toHaveBeenCalledWith(TENANT_ID, SUBMISSION_ID, USER_ID, dto);
  });

  // ─── Tusla Absence Mappings ─────────────────────────────────────────────────

  it('should list tusla absence mappings', async () => {
    const expected = [{ id: MAPPING_ID, display_label: 'Illness' }];
    mockTuslaMappingsService.findAll.mockResolvedValue(expected);

    const result = await controller.listTuslaMappings(mockTenant);

    expect(result).toEqual(expected);
    expect(mockTuslaMappingsService.findAll).toHaveBeenCalledWith(TENANT_ID);
  });

  it('should create a tusla absence mapping', async () => {
    const dto = {
      attendance_status: 'absent_excused' as const,
      tusla_category: 'illness' as const,
      display_label: 'Illness',
      is_default: true,
    };
    const expected = { id: MAPPING_ID, ...dto };
    mockTuslaMappingsService.create.mockResolvedValue(expected);

    const result = await controller.createTuslaMapping(mockTenant, dto);

    expect(result).toEqual(expected);
    expect(mockTuslaMappingsService.create).toHaveBeenCalledWith(TENANT_ID, dto);
  });

  it('should delete a tusla absence mapping', async () => {
    mockTuslaMappingsService.remove.mockResolvedValue(undefined);

    await controller.deleteTuslaMapping(mockTenant, MAPPING_ID);

    expect(mockTuslaMappingsService.remove).toHaveBeenCalledWith(TENANT_ID, MAPPING_ID);
  });

  // ─── DES Subject Mappings ───────────────────────────────────────────────────

  it('should list DES subject mappings', async () => {
    const expected = [{ id: MAPPING_ID, des_code: 'MA01', subject: { id: SUBJECT_ID, name: 'Maths' } }];
    mockDesMappingsService.findAll.mockResolvedValue(expected);

    const result = await controller.listDesMappings(mockTenant);

    expect(result).toEqual(expected);
    expect(mockDesMappingsService.findAll).toHaveBeenCalledWith(TENANT_ID);
  });

  it('should create a DES subject mapping', async () => {
    const dto = {
      subject_id: SUBJECT_ID,
      des_code: 'MA01',
      des_name: 'Mathematics',
      is_verified: true,
    };
    const expected = { id: MAPPING_ID, ...dto };
    mockDesMappingsService.create.mockResolvedValue(expected);

    const result = await controller.createDesMapping(mockTenant, dto);

    expect(result).toEqual(expected);
    expect(mockDesMappingsService.create).toHaveBeenCalledWith(TENANT_ID, dto);
  });

  it('should delete a DES subject mapping', async () => {
    mockDesMappingsService.remove.mockResolvedValue(undefined);

    await controller.deleteDesMapping(mockTenant, MAPPING_ID);

    expect(mockDesMappingsService.remove).toHaveBeenCalledWith(TENANT_ID, MAPPING_ID);
  });

  // ─── Reduced School Days ────────────────────────────────────────────────────

  it('should list reduced school days', async () => {
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockReducedDaysService.findAll.mockResolvedValue(expected);

    const result = await controller.listReducedSchoolDays(mockTenant, {
      page: 1,
      pageSize: 20,
    });

    expect(result).toEqual(expected);
    expect(mockReducedDaysService.findAll).toHaveBeenCalledWith(TENANT_ID, {
      page: 1,
      pageSize: 20,
      student_id: undefined,
      is_active: undefined,
    });
  });

  it('should create a reduced school day', async () => {
    const dto = {
      student_id: STUDENT_ID,
      start_date: '2026-01-15',
      hours_per_day: 3.5,
      reason: 'medical_needs' as const,
    };
    const expected = { id: RECORD_ID, ...dto };
    mockReducedDaysService.create.mockResolvedValue(expected);

    const result = await controller.createReducedSchoolDay(mockTenant, mockUser, dto);

    expect(result).toEqual(expected);
    expect(mockReducedDaysService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
  });

  it('should get a single reduced school day', async () => {
    const expected = { id: RECORD_ID, student_id: STUDENT_ID };
    mockReducedDaysService.findOne.mockResolvedValue(expected);

    const result = await controller.getReducedSchoolDay(mockTenant, RECORD_ID);

    expect(result).toEqual(expected);
    expect(mockReducedDaysService.findOne).toHaveBeenCalledWith(TENANT_ID, RECORD_ID);
  });

  it('should update a reduced school day', async () => {
    const dto = { is_active: false };
    const expected = { id: RECORD_ID, is_active: false };
    mockReducedDaysService.update.mockResolvedValue(expected);

    const result = await controller.updateReducedSchoolDay(mockTenant, RECORD_ID, dto);

    expect(result).toEqual(expected);
    expect(mockReducedDaysService.update).toHaveBeenCalledWith(TENANT_ID, RECORD_ID, dto);
  });
});
