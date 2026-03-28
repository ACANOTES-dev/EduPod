import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { RegulatoryCalendarService } from './regulatory-calendar.service';
import { RegulatoryCbaService } from './regulatory-cba.service';
import { RegulatoryDashboardService } from './regulatory-dashboard.service';
import { RegulatoryDesMappingsService } from './regulatory-des-mappings.service';
import { RegulatoryDesService } from './regulatory-des.service';
import { RegulatoryOctoberReturnsService } from './regulatory-october-returns.service';
import { RegulatoryPpodService } from './regulatory-ppod.service';
import { RegulatoryReducedDaysService } from './regulatory-reduced-days.service';
import { RegulatorySubmissionService } from './regulatory-submission.service';
import { RegulatoryTransfersService } from './regulatory-transfers.service';
import { RegulatoryTuslaMappingsService } from './regulatory-tusla-mappings.service';
import { RegulatoryTuslaService } from './regulatory-tusla.service';
import { RegulatoryController } from './regulatory.controller';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EVENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SUBMISSION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const MAPPING_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const STUDENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const RECORD_ID = '11111111-1111-1111-1111-111111111111';
const SUBJECT_ID = '22222222-2222-2222-2222-222222222222';
const TRANSFER_ID = '33333333-3333-3333-3333-333333333333';

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
  let mockTuslaService: {
    getThresholdMonitor: jest.Mock;
    generateSar: jest.Mock;
    generateAar: jest.Mock;
    getSuspensions: jest.Mock;
    getExpulsions: jest.Mock;
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
  let mockDesService: {
    checkReadiness: jest.Mock;
    previewFile: jest.Mock;
    generateFile: jest.Mock;
  };
  let mockOctoberReturnsService: {
    checkReadiness: jest.Mock;
    preview: jest.Mock;
    getStudentIssues: jest.Mock;
  };
  let mockPpodService: {
    getSyncStatus: jest.Mock;
    listMappedStudents: jest.Mock;
    getSyncLog: jest.Mock;
    previewDiff: jest.Mock;
    importFromPpod: jest.Mock;
    exportForPpod: jest.Mock;
    syncSingleStudent: jest.Mock;
  };
  let mockCbaService: {
    getCbaStatus: jest.Mock;
    getPendingResults: jest.Mock;
    syncExport: jest.Mock;
    syncStudent: jest.Mock;
  };
  let mockDashboardService: {
    getDashboardSummary: jest.Mock;
    getOverdueItems: jest.Mock;
  };
  let mockTransfersService: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
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

    mockTuslaService = {
      getThresholdMonitor: jest.fn(),
      generateSar: jest.fn(),
      generateAar: jest.fn(),
      getSuspensions: jest.fn(),
      getExpulsions: jest.fn(),
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

    mockDesService = {
      checkReadiness: jest.fn(),
      previewFile: jest.fn(),
      generateFile: jest.fn(),
    };

    mockOctoberReturnsService = {
      checkReadiness: jest.fn(),
      preview: jest.fn(),
      getStudentIssues: jest.fn(),
    };

    mockPpodService = {
      getSyncStatus: jest.fn(),
      listMappedStudents: jest.fn(),
      getSyncLog: jest.fn(),
      previewDiff: jest.fn(),
      importFromPpod: jest.fn(),
      exportForPpod: jest.fn(),
      syncSingleStudent: jest.fn(),
    };

    mockCbaService = {
      getCbaStatus: jest.fn(),
      getPendingResults: jest.fn(),
      syncExport: jest.fn(),
      syncStudent: jest.fn(),
    };

    mockDashboardService = {
      getDashboardSummary: jest.fn(),
      getOverdueItems: jest.fn(),
    };

    mockTransfersService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RegulatoryController],
      providers: [
        { provide: RegulatoryCalendarService, useValue: mockCalendarService },
        { provide: RegulatorySubmissionService, useValue: mockSubmissionService },
        { provide: RegulatoryTuslaMappingsService, useValue: mockTuslaMappingsService },
        { provide: RegulatoryTuslaService, useValue: mockTuslaService },
        { provide: RegulatoryDashboardService, useValue: mockDashboardService },
        { provide: RegulatoryDesMappingsService, useValue: mockDesMappingsService },
        { provide: RegulatoryDesService, useValue: mockDesService },
        { provide: RegulatoryOctoberReturnsService, useValue: mockOctoberReturnsService },
        { provide: RegulatoryPpodService, useValue: mockPpodService },
        { provide: RegulatoryReducedDaysService, useValue: mockReducedDaysService },
        { provide: RegulatoryCbaService, useValue: mockCbaService },
        { provide: RegulatoryTransfersService, useValue: mockTransfersService },
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

  // ─── Tusla Compliance ──────────────────────────────────────────────────────

  it('should get threshold monitor data', async () => {
    const expected = { threshold: 20, data: [] };
    mockTuslaService.getThresholdMonitor.mockResolvedValue(expected);

    const result = await controller.getThresholdMonitor(mockTenant, {
      threshold_days: 20,
    });

    expect(result).toEqual(expected);
    expect(mockTuslaService.getThresholdMonitor).toHaveBeenCalledWith(TENANT_ID, {
      threshold_days: 20,
      start_date: undefined,
      end_date: undefined,
    });
  });

  it('should generate SAR report', async () => {
    const dto = {
      academic_year: '2025-2026',
      period: 1,
      start_date: '2025-09-01',
      end_date: '2025-12-20',
    };
    const expected = { ...dto, total_students: 5, rows: [] };
    mockTuslaService.generateSar.mockResolvedValue(expected);

    const result = await controller.generateSar(mockTenant, dto);

    expect(result).toEqual(expected);
    expect(mockTuslaService.generateSar).toHaveBeenCalledWith(TENANT_ID, dto);
  });

  it('should generate AAR report', async () => {
    const dto = { academic_year: '2025-2026' };
    const expected = {
      academic_year: '2025-2026',
      total_students: 120,
      total_days_lost: 450,
      students_over_20_days: 8,
    };
    mockTuslaService.generateAar.mockResolvedValue(expected);

    const result = await controller.generateAar(mockTenant, dto);

    expect(result).toEqual(expected);
    expect(mockTuslaService.generateAar).toHaveBeenCalledWith(TENANT_ID, dto);
  });

  it('should get suspensions requiring Tusla notification', async () => {
    const expected = [{ id: RECORD_ID, suspension_days: 7, student: { id: STUDENT_ID } }];
    mockTuslaService.getSuspensions.mockResolvedValue(expected);

    const result = await controller.getSuspensions(mockTenant, {});

    expect(result).toEqual(expected);
    expect(mockTuslaService.getSuspensions).toHaveBeenCalledWith(TENANT_ID, undefined);
  });

  it('should get expulsions requiring Tusla notification', async () => {
    const expected = [{ id: RECORD_ID, case_number: 'EXC-001', student: { id: STUDENT_ID } }];
    mockTuslaService.getExpulsions.mockResolvedValue(expected);

    const result = await controller.getExpulsions(mockTenant, {});

    expect(result).toEqual(expected);
    expect(mockTuslaService.getExpulsions).toHaveBeenCalledWith(TENANT_ID, undefined);
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

  // ─── DES Returns ──────────────────────────────────────────────────────────

  it('should check DES readiness', async () => {
    const expected = { ready: true, academic_year: '2025-2026', categories: [] };
    mockDesService.checkReadiness.mockResolvedValue(expected);

    const result = await controller.desReadiness(mockTenant, { academic_year: '2025-2026' });

    expect(result).toEqual(expected);
    expect(mockDesService.checkReadiness).toHaveBeenCalledWith(TENANT_ID, '2025-2026');
  });

  it('should preview a DES file', async () => {
    const expected = { file_type: 'file_a', columns: [], rows: [], record_count: 0, validation_errors: [] };
    mockDesService.previewFile.mockResolvedValue(expected);

    const result = await controller.desPreview(mockTenant, 'file_a', { academic_year: '2025-2026' });

    expect(result).toEqual(expected);
    expect(mockDesService.previewFile).toHaveBeenCalledWith(TENANT_ID, 'file_a', '2025-2026');
  });

  it('should generate a DES file', async () => {
    const expected = { id: SUBMISSION_ID, domain: 'des_september_returns' };
    mockDesService.generateFile.mockResolvedValue(expected);

    const result = await controller.desGenerate(mockTenant, mockUser, 'file_e', { academic_year: '2025-2026' });

    expect(result).toEqual(expected);
    expect(mockDesService.generateFile).toHaveBeenCalledWith(TENANT_ID, USER_ID, 'file_e', '2025-2026');
  });

  it('should reject invalid DES file type', async () => {
    await expect(controller.desPreview(mockTenant, 'invalid', { academic_year: '2025-2026' }))
      .rejects.toThrow();
  });

  // ─── October Returns ──────────────────────────────────────────────────────

  it('should check October Returns readiness', async () => {
    const expected = { ready: true, academic_year: '2025-2026', student_count: 120, categories: [] };
    mockOctoberReturnsService.checkReadiness.mockResolvedValue(expected);

    const result = await controller.octoberReturnsReadiness(mockTenant, { academic_year: '2025-2026' });

    expect(result).toEqual(expected);
    expect(mockOctoberReturnsService.checkReadiness).toHaveBeenCalledWith(TENANT_ID, '2025-2026');
  });

  it('should preview October Returns', async () => {
    const expected = { academic_year: '2025-2026', summary: { total_students: 120 } };
    mockOctoberReturnsService.preview.mockResolvedValue(expected);

    const result = await controller.octoberReturnsPreview(mockTenant, { academic_year: '2025-2026' });

    expect(result).toEqual(expected);
    expect(mockOctoberReturnsService.preview).toHaveBeenCalledWith(TENANT_ID, '2025-2026');
  });

  it('should get October Returns student issues', async () => {
    const expected = { academic_year: '2025-2026', total_students: 120, students_with_issues: 3, issues: [] };
    mockOctoberReturnsService.getStudentIssues.mockResolvedValue(expected);

    const result = await controller.octoberReturnsIssues(mockTenant, { academic_year: '2025-2026' });

    expect(result).toEqual(expected);
    expect(mockOctoberReturnsService.getStudentIssues).toHaveBeenCalledWith(TENANT_ID, '2025-2026');
  });

  // ─── P-POD/POD ─────────────────────────────────────────────────────────────

  it('should get PPOD sync status', async () => {
    const expected = { total_mapped: 10, synced: 8, pending: 2, changed: 0, errors: 0, last_sync: null };
    mockPpodService.getSyncStatus.mockResolvedValue(expected);

    const result = await controller.getPpodStatus(mockTenant, { database_type: 'ppod' });

    expect(result).toEqual(expected);
  });

  it('should list PPOD students', async () => {
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockPpodService.listMappedStudents.mockResolvedValue(expected);

    const result = await controller.listPpodStudents(mockTenant, { database_type: 'ppod', page: 1, pageSize: 20 });

    expect(result).toEqual(expected);
  });

  it('should import from PPOD', async () => {
    const expected = { sync_log_id: 'abc', records_created: 5, records_updated: 0, records_failed: 0, errors: [] };
    mockPpodService.importFromPpod.mockResolvedValue(expected);

    const result = await controller.importFromPpod(mockTenant, mockUser, { database_type: 'ppod', file_content: 'csv...' });

    expect(result).toEqual(expected);
    expect(mockPpodService.importFromPpod).toHaveBeenCalledWith(TENANT_ID, USER_ID, { database_type: 'ppod', file_content: 'csv...' });
  });

  it('should export for PPOD', async () => {
    const expected = { sync_log_id: 'abc', records_pushed: 3, csv_content: 'csv...' };
    mockPpodService.exportForPpod.mockResolvedValue(expected);

    const result = await controller.exportForPpod(mockTenant, mockUser, { database_type: 'ppod', scope: 'incremental' });

    expect(result).toEqual(expected);
  });

  it('should get PPOD diff', async () => {
    const expected = [{ student_id: 'x', status: 'changed' }];
    mockPpodService.previewDiff.mockResolvedValue(expected);

    const result = await controller.getPpodDiff(mockTenant, { database_type: 'ppod' });

    expect(result).toEqual(expected);
  });

  it('should get PPOD sync log', async () => {
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockPpodService.getSyncLog.mockResolvedValue(expected);

    const result = await controller.getPpodSyncLog(mockTenant, { page: 1, pageSize: 20 });

    expect(result).toEqual(expected);
  });

  it('should sync single PPOD student', async () => {
    const expected = { status: 'synced', student_id: STUDENT_ID, mapping_id: 'x', csv_content: '' };
    mockPpodService.syncSingleStudent.mockResolvedValue(expected);

    const result = await controller.syncPpodStudent(mockTenant, mockUser, STUDENT_ID, { database_type: 'ppod' });

    expect(result).toEqual(expected);
  });

  // ─── CBA Sync ──────────────────────────────────────────────────────────────

  it('should get CBA status', async () => {
    const expected = { academic_year: '2025-2026', total: 10, pending: 5, synced: 5, errors: 0, last_synced_at: null };
    mockCbaService.getCbaStatus.mockResolvedValue(expected);

    const result = await controller.getCbaStatus(mockTenant, { academic_year: '2025-2026' });

    expect(result).toEqual(expected);
  });

  it('should get CBA pending results', async () => {
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockCbaService.getPendingResults.mockResolvedValue(expected);

    const result = await controller.getCbaPending(mockTenant, { academic_year: '2025-2026', page: 1, pageSize: 20 });

    expect(result).toEqual(expected);
  });

  it('should sync CBA export', async () => {
    const expected = { synced_count: 3, error_count: 0, errors: [] };
    mockCbaService.syncExport.mockResolvedValue(expected);

    const result = await controller.syncCba(mockTenant, mockUser, { academic_year: '2025-2026' });

    expect(result).toEqual(expected);
  });

  it('should sync CBA for single student', async () => {
    const expected = { synced_count: 1, error_count: 0, errors: [] };
    mockCbaService.syncStudent.mockResolvedValue(expected);

    const result = await controller.syncCbaStudent(mockTenant, mockUser, STUDENT_ID, { academic_year: '2025-2026' });

    expect(result).toEqual(expected);
    expect(mockCbaService.syncStudent).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID, { academic_year: '2025-2026' }, USER_ID);
  });

  // ─── Transfers ─────────────────────────────────────────────────────────────

  it('should list transfers', async () => {
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockTransfersService.findAll.mockResolvedValue(expected);

    const result = await controller.listTransfers(mockTenant, { page: 1, pageSize: 20 });

    expect(result).toEqual(expected);
  });

  it('should create a transfer', async () => {
    const dto = {
      student_id: STUDENT_ID,
      direction: 'outbound' as const,
      other_school_roll_no: '12345A',
      transfer_date: '2026-06-01',
    };
    const expected = { id: TRANSFER_ID, ...dto };
    mockTransfersService.create.mockResolvedValue(expected);

    const result = await controller.createTransfer(mockTenant, mockUser, dto);

    expect(result).toEqual(expected);
    expect(mockTransfersService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
  });

  it('should get a single transfer', async () => {
    const expected = { id: TRANSFER_ID, status: 'pending' };
    mockTransfersService.findOne.mockResolvedValue(expected);

    const result = await controller.getTransfer(mockTenant, TRANSFER_ID);

    expect(result).toEqual(expected);
  });

  it('should update a transfer', async () => {
    const dto = { status: 'accepted' as const };
    const expected = { id: TRANSFER_ID, status: 'accepted' };
    mockTransfersService.update.mockResolvedValue(expected);

    const result = await controller.updateTransfer(mockTenant, TRANSFER_ID, dto);

    expect(result).toEqual(expected);
  });

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  it('should return dashboard summary', async () => {
    const expected = {
      calendar: { upcoming_deadlines: 2, overdue: 1, next_deadline: null },
      tusla: { students_approaching_threshold: 0, students_exceeded_threshold: 0, active_alerts: 0 },
      des: { readiness_status: 'not_started', recent_submissions: 0 },
      october_returns: { readiness_status: 'not_started' },
      ppod: { synced: 0, pending: 0, errors: 0, last_sync_at: null },
      cba: { pending_sync: 0, synced: 0, last_sync_at: null },
    };
    mockDashboardService.getDashboardSummary.mockResolvedValue(expected);

    const result = await controller.getDashboardSummary(mockTenant);

    expect(result).toEqual(expected);
    expect(mockDashboardService.getDashboardSummary).toHaveBeenCalledWith(TENANT_ID);
  });

  it('should return overdue items', async () => {
    const expected = [
      { id: EVENT_ID, type: 'calendar_event', title: 'Overdue Event', domain: 'tusla_attendance', due_date: new Date('2026-03-01'), days_overdue: 27 },
    ];
    mockDashboardService.getOverdueItems.mockResolvedValue(expected);

    const result = await controller.getDashboardOverdue(mockTenant);

    expect(result).toEqual(expected);
    expect(mockDashboardService.getOverdueItems).toHaveBeenCalledWith(TENANT_ID);
  });
});
