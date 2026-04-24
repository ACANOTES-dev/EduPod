import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { BoardReportRequest } from '@school/shared/reports';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import {
  AcademicSectionAggregator,
  AttendanceSectionAggregator,
  BehaviourSectionAggregator,
  EnrolmentSectionAggregator,
  ExecutiveSummarySectionAggregator,
  FinanceSectionAggregator,
  SafeguardingSectionAggregator,
  StaffingSectionAggregator,
} from './board-report/sections';
import { BoardReportService } from './board-report.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ACADEMIC_YEAR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PERIOD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PRIOR_PERIOD_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const MOCK_PERSISTED_REPORT = {
  id: 'report-1',
  tenant_id: TENANT_ID,
  title: 'Acme — Board Report (Term 1, 2026-2027)',
  academic_period_id: PERIOD_ID,
  report_type: 'termly',
  sections_json: {
    schema_version: 1,
    term: {
      academic_year_id: ACADEMIC_YEAR_ID,
      academic_year_name: '2026-2027',
      term_number: 1,
      term_label: 'Term 1',
    },
    sections_included: ['executive', 'attendance'],
    anonymise: true,
    sections: { executive: { type: 'executive' }, attendance: { type: 'attendance' } },
  },
  generated_at: new Date('2026-09-15T10:00:00Z'),
  generated_by_user_id: USER_ID,
  file_url: null,
  created_at: new Date('2026-09-15T10:00:00Z'),
  updated_at: new Date('2026-09-15T10:00:00Z'),
};

const ACADEMIC_YEAR_ROW = {
  id: ACADEMIC_YEAR_ID,
  name: '2026-2027',
  start_date: new Date('2026-09-01'),
  end_date: new Date('2027-07-31'),
};

const PERIOD_ROWS = [
  {
    id: PRIOR_PERIOD_ID,
    name: 'Prior Term',
    start_date: new Date('2026-05-01'),
    end_date: new Date('2026-08-31'),
  },
  {
    id: PERIOD_ID,
    name: 'Term 1',
    start_date: new Date('2026-09-01'),
    end_date: new Date('2026-12-15'),
  },
];

const TENANT_ROW = { name: 'Acme' };

const mockTx = {
  boardReport: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  academicYear: { findFirst: jest.fn() },
  academicPeriod: { findMany: jest.fn() },
  tenant: { findFirst: jest.fn() },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('BoardReportService', () => {
  let service: BoardReportService;

  const aggregatorMocks = {
    executive: {
      key: 'executive' as const,
      aggregate: jest.fn().mockResolvedValue({
        type: 'executive',
        headline_metrics: {
          student_headcount: 0,
          attendance_rate_pct: 0,
          collection_rate_pct: 0,
          at_risk_student_count: 0,
          open_safeguarding_concerns: 0,
        },
        narrative: '',
      }),
    },
    enrolment: {
      key: 'enrolment' as const,
      aggregate: jest.fn().mockResolvedValue({
        type: 'enrolment',
        total_headcount: 0,
        headcount_by_year_group: [],
        gender_split: [],
        nationality_split: [],
        enrolment_change_vs_prior_term: { current: 0, prior: 0, delta: 0 },
      }),
    },
    attendance: {
      key: 'attendance' as const,
      aggregate: jest.fn().mockResolvedValue({
        type: 'attendance',
        average_rate_pct: 92,
        rate_by_year_group: [],
        chronic_absenteeism_count: 0,
        chronic_absenteeism_threshold_pct: 85,
        day_of_week_pattern: [],
      }),
    },
    academic: {
      key: 'academic' as const,
      aggregate: jest.fn().mockResolvedValue({
        type: 'academic',
        pass_fail_by_year_group: [],
        subject_averages: [],
        top_performers: [],
        bottom_performers: [],
      }),
    },
    behaviour: {
      key: 'behaviour' as const,
      aggregate: jest.fn().mockResolvedValue({
        type: 'behaviour',
        incident_count_total: 0,
        incident_count_by_category: [],
        incident_count_by_year_group: [],
        sanction_outcomes: [],
        appeals_outcomes: [],
        trend_vs_prior_term: { current: 0, prior: 0, delta: 0 },
      }),
    },
    safeguarding: {
      key: 'safeguarding' as const,
      aggregate: jest.fn().mockResolvedValue({
        type: 'safeguarding',
        open_concerns_count: 0,
        oldest_open_concern_age_days: null,
        age_histogram: [],
        actions_taken_count: 0,
        critical_incidents_count: 0,
        detail_summary: 'No open safeguarding concerns.',
      }),
    },
    finance: {
      key: 'finance' as const,
      aggregate: jest.fn().mockResolvedValue({
        type: 'finance',
        invoices_issued_count: 0,
        total_invoiced_amount: 0,
        total_collected_amount: 0,
        collection_rate_pct: 0,
        overdue_count: 0,
        overdue_amount: 0,
        write_off_count: 0,
        write_off_amount: 0,
        currency_code: 'GBP',
      }),
    },
    staffing: {
      key: 'staffing' as const,
      aggregate: jest.fn().mockResolvedValue({
        type: 'staffing',
        headcount_active: 0,
        headcount_inactive: 0,
        turnover_this_term: { arrivals: 0, departures: 0 },
        attendance_rate_pct: 0,
        pending_leave_requests: 0,
        absences_this_term: 0,
        cover_gaps_unfilled: 0,
      }),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockTx.boardReport.findMany.mockResolvedValue([MOCK_PERSISTED_REPORT]);
    mockTx.boardReport.count.mockResolvedValue(1);
    mockTx.boardReport.findFirst.mockResolvedValue(MOCK_PERSISTED_REPORT);
    mockTx.boardReport.create.mockResolvedValue(MOCK_PERSISTED_REPORT);
    mockTx.boardReport.delete.mockResolvedValue(MOCK_PERSISTED_REPORT);
    mockTx.academicYear.findFirst.mockResolvedValue(ACADEMIC_YEAR_ROW);
    mockTx.academicPeriod.findMany.mockResolvedValue(PERIOD_ROWS);
    mockTx.tenant.findFirst.mockResolvedValue(TENANT_ROW);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardReportService,
        { provide: PrismaService, useValue: {} },
        { provide: ExecutiveSummarySectionAggregator, useValue: aggregatorMocks.executive },
        { provide: EnrolmentSectionAggregator, useValue: aggregatorMocks.enrolment },
        { provide: AttendanceSectionAggregator, useValue: aggregatorMocks.attendance },
        { provide: AcademicSectionAggregator, useValue: aggregatorMocks.academic },
        { provide: BehaviourSectionAggregator, useValue: aggregatorMocks.behaviour },
        { provide: SafeguardingSectionAggregator, useValue: aggregatorMocks.safeguarding },
        { provide: FinanceSectionAggregator, useValue: aggregatorMocks.finance },
        { provide: StaffingSectionAggregator, useValue: aggregatorMocks.staffing },
      ],
    }).compile();

    service = module.get<BoardReportService>(BoardReportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── New-style generate() ────────────────────────────────────────────────

  describe('generate', () => {
    const baseRequest: BoardReportRequest = {
      term: { academic_year_id: ACADEMIC_YEAR_ID, term_number: 2 },
      sections: ['executive', 'attendance'],
      anonymise: true,
    };

    it('wraps every DB call in createRlsClient scoped to the caller tenant', async () => {
      await service.generate(TENANT_ID, USER_ID, baseRequest);

      expect(createRlsClient).toHaveBeenCalledWith(expect.anything(), { tenant_id: TENANT_ID });
    });

    it('only runs the aggregators for the requested sections', async () => {
      const report = await service.generate(TENANT_ID, USER_ID, baseRequest);

      expect(aggregatorMocks.executive.aggregate).toHaveBeenCalledTimes(1);
      expect(aggregatorMocks.attendance.aggregate).toHaveBeenCalledTimes(1);
      expect(aggregatorMocks.enrolment.aggregate).not.toHaveBeenCalled();
      expect(aggregatorMocks.academic.aggregate).not.toHaveBeenCalled();
      expect(aggregatorMocks.behaviour.aggregate).not.toHaveBeenCalled();
      expect(aggregatorMocks.finance.aggregate).not.toHaveBeenCalled();
      expect(aggregatorMocks.staffing.aggregate).not.toHaveBeenCalled();

      expect(report.sections_included).toEqual(['executive', 'attendance']);
      expect(report.sections.executive).toBeDefined();
      expect(report.sections.attendance?.average_rate_pct).toBe(92);
      expect(report.sections.enrolment).toBeUndefined();
    });

    it('resolves the requested term to the matching academic period and threads prior term through', async () => {
      await service.generate(TENANT_ID, USER_ID, baseRequest);

      const [tx, tenantId, resolvedTerm] = aggregatorMocks.attendance.aggregate.mock
        .calls[0] as unknown as [unknown, string, Record<string, unknown>];
      expect(tenantId).toBe(TENANT_ID);
      expect(resolvedTerm.academic_period_id).toBe(PERIOD_ID);
      expect(resolvedTerm.term_label).toBe('Term 1');
      expect(resolvedTerm.prior_term).toEqual(
        expect.objectContaining({ academic_period_id: PRIOR_PERIOD_ID }),
      );
      expect(tx).toBe(mockTx);
    });

    it('persists a BoardReport row with the generated payload', async () => {
      await service.generate(TENANT_ID, USER_ID, baseRequest);

      expect(mockTx.boardReport.create).toHaveBeenCalledTimes(1);
      const createArgs = mockTx.boardReport.create.mock.calls[0]?.[0] as
        | { data: Record<string, unknown> }
        | undefined;
      expect(createArgs?.data).toMatchObject({
        tenant_id: TENANT_ID,
        academic_period_id: PERIOD_ID,
        report_type: 'termly',
        generated_by_user_id: USER_ID,
      });
      const persistedSections = createArgs?.data?.sections_json as Record<string, unknown>;
      expect(persistedSections).toMatchObject({
        schema_version: 1,
        sections_included: ['executive', 'attendance'],
        anonymise: true,
      });
    });

    it('falls back to the full academic-year window when no periods match the term_number', async () => {
      mockTx.academicPeriod.findMany.mockResolvedValue([]);

      await service.generate(TENANT_ID, USER_ID, baseRequest);

      const [, , resolvedTerm] = aggregatorMocks.attendance.aggregate.mock.calls[0] as unknown as [
        unknown,
        string,
        Record<string, unknown>,
      ];
      expect(resolvedTerm.academic_period_id).toBeNull();
      expect(resolvedTerm.term_label).toBe('Term 2');
    });

    it('throws NotFoundException when the academic year does not belong to the tenant', async () => {
      mockTx.academicYear.findFirst.mockResolvedValue(null);

      await expect(service.generate(TENANT_ID, USER_ID, baseRequest)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(aggregatorMocks.executive.aggregate).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the tenant row cannot be resolved', async () => {
      mockTx.tenant.findFirst.mockResolvedValue(null);

      await expect(service.generate(TENANT_ID, USER_ID, baseRequest)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('deduplicates the requested sections and preserves canonical ordering when the full set is requested', async () => {
      const full: BoardReportRequest = {
        ...baseRequest,
        sections: [
          'staffing',
          'finance',
          'safeguarding',
          'behaviour',
          'academic',
          'attendance',
          'enrolment',
          'executive',
        ],
      };

      const report = await service.generate(TENANT_ID, USER_ID, full);

      expect(report.sections_included).toEqual([
        'executive',
        'enrolment',
        'attendance',
        'academic',
        'behaviour',
        'safeguarding',
        'finance',
        'staffing',
      ]);
    });

    it('passes the anonymise flag through to every aggregator', async () => {
      await service.generate(TENANT_ID, USER_ID, { ...baseRequest, anonymise: false });

      expect(aggregatorMocks.executive.aggregate).toHaveBeenCalledWith(
        mockTx,
        TENANT_ID,
        expect.any(Object),
        { anonymise: false },
      );
    });
  });

  // ─── listHistory() ───────────────────────────────────────────────────────

  describe('listHistory', () => {
    it('wraps its query in createRlsClient scoped to the caller tenant', async () => {
      await service.listHistory(TENANT_ID, 1, 10);
      expect(createRlsClient).toHaveBeenCalledWith(expect.anything(), { tenant_id: TENANT_ID });
    });

    it('returns paginated rows enriched with term label and generator display name', async () => {
      mockTx.boardReport.findMany.mockResolvedValue([
        {
          id: MOCK_PERSISTED_REPORT.id,
          academic_period_id: PERIOD_ID,
          period: {
            academic_year_id: ACADEMIC_YEAR_ID,
            name: 'Term 1',
            academic_year: { id: ACADEMIC_YEAR_ID, name: '2026-2027' },
          },
          sections_json: MOCK_PERSISTED_REPORT.sections_json,
          generated_at: MOCK_PERSISTED_REPORT.generated_at,
          generated_by_user_id: USER_ID,
          generated_by: {
            first_name: 'Alice',
            last_name: 'Admin',
            email: 'alice@example.com',
          },
        },
      ]);
      mockTx.boardReport.count.mockResolvedValue(1);

      const result = await service.listHistory(TENANT_ID, 1, 10);

      expect(result.meta).toEqual({ page: 1, pageSize: 10, total: 1 });
      expect(result.data).toHaveLength(1);
      const first = result.data[0];
      expect(first).toBeDefined();
      expect(first?.term_label).toBe('Term 1');
      expect(first?.academic_year_name).toBe('2026-2027');
      expect(first?.sections_included).toEqual(['executive', 'attendance']);
      expect(first?.anonymise).toBe(true);
      expect(first?.generated_by_display_name).toBe('Alice Admin');
    });

    it('falls back to email when the generator has no name set', async () => {
      mockTx.boardReport.findMany.mockResolvedValue([
        {
          id: MOCK_PERSISTED_REPORT.id,
          academic_period_id: PERIOD_ID,
          period: {
            academic_year_id: ACADEMIC_YEAR_ID,
            name: 'Term 1',
            academic_year: { id: ACADEMIC_YEAR_ID, name: '2026-2027' },
          },
          sections_json: MOCK_PERSISTED_REPORT.sections_json,
          generated_at: MOCK_PERSISTED_REPORT.generated_at,
          generated_by_user_id: USER_ID,
          generated_by: { first_name: null, last_name: null, email: 'unknown@example.com' },
        },
      ]);

      const result = await service.listHistory(TENANT_ID, 1, 10);
      expect(result.data[0]?.generated_by_display_name).toBe('unknown@example.com');
    });

    it('returns null display name when the generator user row was soft-deleted', async () => {
      mockTx.boardReport.findMany.mockResolvedValue([
        {
          id: MOCK_PERSISTED_REPORT.id,
          academic_period_id: PERIOD_ID,
          period: {
            academic_year_id: ACADEMIC_YEAR_ID,
            name: 'Term 1',
            academic_year: { id: ACADEMIC_YEAR_ID, name: '2026-2027' },
          },
          sections_json: MOCK_PERSISTED_REPORT.sections_json,
          generated_at: MOCK_PERSISTED_REPORT.generated_at,
          generated_by_user_id: USER_ID,
          generated_by: null,
        },
      ]);

      const result = await service.listHistory(TENANT_ID, 1, 10);
      expect(result.data[0]?.generated_by_display_name).toBeNull();
    });

    it('infers sections_included from legacy sections_json when the new key is absent', async () => {
      mockTx.boardReport.findMany.mockResolvedValue([
        {
          id: MOCK_PERSISTED_REPORT.id,
          academic_period_id: null,
          period: null,
          sections_json: { sections: { executive: {}, finance: {} } },
          generated_at: MOCK_PERSISTED_REPORT.generated_at,
          generated_by_user_id: USER_ID,
          generated_by: { first_name: 'X', last_name: 'Y', email: 'x@y.com' },
        },
      ]);

      const result = await service.listHistory(TENANT_ID, 1, 10);
      expect(result.data[0]?.sections_included.sort()).toEqual(['executive', 'finance']);
      expect(result.data[0]?.term_label).toBe('Custom term');
    });
  });

  // ─── Legacy CRUD preserved ───────────────────────────────────────────────

  describe('listBoardReports', () => {
    it('returns paginated legacy board-report rows', async () => {
      const result = await service.listBoardReports(TENANT_ID, 1, 20);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.data[0]?.id).toBe('report-1');
    });
  });

  describe('getBoardReport', () => {
    it('returns a single board report by id', async () => {
      const result = await service.getBoardReport(TENANT_ID, 'report-1');
      expect(result.id).toBe('report-1');
    });

    it('throws NotFoundException when report does not exist', async () => {
      mockTx.boardReport.findFirst.mockResolvedValue(null);
      await expect(service.getBoardReport(TENANT_ID, 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('generateBoardReport (legacy)', () => {
    it('creates the report from the legacy DTO shape', async () => {
      const dto = {
        title: 'Q1 Board Report',
        report_type: 'termly' as const,
        sections_json: ['attendance', 'grades'],
      };

      const result = await service.generateBoardReport(TENANT_ID, USER_ID, dto);
      expect(result.id).toBe('report-1');
      expect(mockTx.boardReport.create).toHaveBeenCalled();
    });
  });

  describe('deleteBoardReport', () => {
    it('deletes an existing report without error', async () => {
      await expect(service.deleteBoardReport(TENANT_ID, 'report-1')).resolves.toBeUndefined();
    });

    it('throws NotFoundException when report does not exist', async () => {
      mockTx.boardReport.findFirst.mockResolvedValue(null);
      await expect(service.deleteBoardReport(TENANT_ID, 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
