import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { ReferralPrepopulateService } from './referral-prepopulate.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ACADEMIC_YEAR_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const PERIOD_1_ID = 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1';
const PERIOD_2_ID = 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2';

// ─── RLS Mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  academicYear: {
    findFirst: jest.fn(),
  },
  academicPeriod: {
    findMany: jest.fn(),
  },
  dailyAttendanceSummary: {
    findMany: jest.fn(),
  },
  grade: {
    findMany: jest.fn(),
  },
  behaviourIncidentParticipant: {
    findMany: jest.fn(),
  },
  pastoralIntervention: {
    findMany: jest.fn(),
  },
  pastoralParentContact: {
    findMany: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockRlsTx),
      ),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const ACTIVE_YEAR = {
  id: ACADEMIC_YEAR_ID,
  start_date: new Date('2025-09-01'),
  end_date: new Date('2026-06-30'),
};

/** Sets up the default active year mock for all sub-queries. */
function setupActiveYear(): void {
  mockRlsTx.academicYear.findFirst.mockResolvedValue(ACTIVE_YEAR);
}

/** Sets up all mocks to return empty/no-data defaults. */
function setupEmptyDefaults(): void {
  mockRlsTx.academicYear.findFirst.mockResolvedValue(ACTIVE_YEAR);
  mockRlsTx.academicPeriod.findMany.mockResolvedValue([]);
  mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([]);
  mockRlsTx.grade.findMany.mockResolvedValue([]);
  mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
  mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
  mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([]);
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('ReferralPrepopulateService', () => {
  let service: ReferralPrepopulateService;

  beforeEach(async () => {
    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        (fn as jest.Mock).mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralPrepopulateService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    service = module.get<ReferralPrepopulateService>(ReferralPrepopulateService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── 1. generateSnapshot — full shape ──────────────────────────────────

  describe('generateSnapshot — returns correct shape with all sections populated', () => {
    it('should return a complete snapshot with all sections', async () => {
      setupActiveYear();
      mockRlsTx.academicPeriod.findMany.mockResolvedValue([
        { id: PERIOD_1_ID },
        { id: PERIOD_2_ID },
      ]);
      mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([
        { derived_status: 'present' },
        { derived_status: 'present' },
        { derived_status: 'absent' },
        { derived_status: 'late' },
      ]);
      mockRlsTx.grade.findMany.mockResolvedValue([
        {
          raw_score: 85,
          assessment: {
            subject: { name: 'Mathematics' },
            academic_period_id: PERIOD_2_ID,
          },
        },
      ]);
      mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([
        { incident: { category: { name: 'Disruption' } } },
      ]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([
        {
          intervention_type: 'behaviour_support',
          continuum_level: 2,
          status: 'pc_active',
          outcome_notes: null,
          created_at: new Date('2026-01-15'),
        },
      ]);
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([
        {
          contact_date: new Date('2026-03-10'),
          contact_method: 'phone',
          outcome: 'Parent informed of concern',
        },
      ]);

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      expect(result.snapshot_generated_at).toBeDefined();
      expect(result.attendance).toBeDefined();
      expect(result.academic_performance).toBeDefined();
      expect(result.behaviour).toBeDefined();
      expect(result.interventions).toBeDefined();
      expect(result.parent_contacts).toBeDefined();

      // Verify shapes
      expect(result.attendance.total_days).toBe(4);
      expect(result.academic_performance.subjects).toHaveLength(1);
      expect(result.behaviour.total_incidents).toBe(1);
      expect(result.interventions).toHaveLength(1);
      expect(result.parent_contacts).toHaveLength(1);
    });
  });

  // ─── 2. Attendance — percentage and chronic absence ─────────────────────

  describe('Attendance — percentage and chronic_absence_flag', () => {
    it('should calculate attendance percentage and flag chronic absence correctly', async () => {
      setupActiveYear();
      // 8 present, 2 absent out of 10 = 80% => chronic absence
      mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([
        ...Array.from({ length: 8 }, () => ({ derived_status: 'present' })),
        { derived_status: 'absent' },
        { derived_status: 'absent' },
      ]);

      // Need to set up the other mocks so the parallel Promise.all doesn't fail
      mockRlsTx.academicPeriod.findMany.mockResolvedValue([]);
      mockRlsTx.grade.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([]);

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      expect(result.attendance.total_days).toBe(10);
      expect(result.attendance.days_present).toBe(8);
      expect(result.attendance.days_absent).toBe(2);
      expect(result.attendance.attendance_percentage).toBe(80);
      expect(result.attendance.chronic_absence_flag).toBe(true);
    });

    it('should not flag chronic absence when attendance >= 90%', async () => {
      setupActiveYear();
      mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([
        ...Array.from({ length: 9 }, () => ({ derived_status: 'present' })),
        { derived_status: 'absent' },
      ]);
      mockRlsTx.academicPeriod.findMany.mockResolvedValue([]);
      mockRlsTx.grade.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([]);

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      expect(result.attendance.attendance_percentage).toBe(90);
      expect(result.attendance.chronic_absence_flag).toBe(false);
    });

    it('should count late as present for attendance percentage', async () => {
      setupActiveYear();
      mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([
        { derived_status: 'present' },
        { derived_status: 'late' },
        { derived_status: 'absent' },
      ]);
      mockRlsTx.academicPeriod.findMany.mockResolvedValue([]);
      mockRlsTx.grade.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([]);

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      // 2 out of 3 are present (present + late), 66.67%
      expect(result.attendance.days_present).toBe(2);
      expect(result.attendance.attendance_percentage).toBe(66.67);
    });
  });

  // ─── 3. Attendance — no records ─────────────────────────────────────────

  describe('Attendance — handles no attendance records', () => {
    it('should return zero counts when no attendance records exist', async () => {
      setupEmptyDefaults();

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      expect(result.attendance.total_days).toBe(0);
      expect(result.attendance.days_present).toBe(0);
      expect(result.attendance.days_absent).toBe(0);
      expect(result.attendance.attendance_percentage).toBe(0);
      expect(result.attendance.chronic_absence_flag).toBe(false);
    });

    it('should return empty period when no active academic year exists', async () => {
      mockRlsTx.academicYear.findFirst.mockResolvedValue(null);
      mockRlsTx.academicPeriod.findMany.mockResolvedValue([]);
      mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockRlsTx.grade.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([]);

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      expect(result.attendance.total_days).toBe(0);
      expect(result.attendance.period.from).toBe('');
      expect(result.attendance.period.to).toBe('');
    });
  });

  // ─── 4. Academic — returns subjects with grades ─────────────────────────

  describe('Academic — returns subjects with grades', () => {
    it('should return subjects with current grades', async () => {
      setupActiveYear();
      mockRlsTx.academicPeriod.findMany.mockResolvedValue([
        { id: PERIOD_1_ID },
        { id: PERIOD_2_ID },
      ]);
      mockRlsTx.grade.findMany.mockResolvedValue([
        {
          raw_score: 92,
          assessment: {
            subject: { name: 'Mathematics' },
            academic_period_id: PERIOD_2_ID,
          },
        },
        {
          raw_score: 78,
          assessment: {
            subject: { name: 'English' },
            academic_period_id: PERIOD_2_ID,
          },
        },
      ]);
      mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([]);

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      expect(result.academic_performance.subjects).toHaveLength(2);

      const mathSubject = result.academic_performance.subjects.find(
        (s) => s.subject_name === 'Mathematics',
      );
      expect(mathSubject).toBeDefined();
      expect(mathSubject!.current_grade).toBe('92.0');

      const englishSubject = result.academic_performance.subjects.find(
        (s) => s.subject_name === 'English',
      );
      expect(englishSubject).toBeDefined();
      expect(englishSubject!.current_grade).toBe('78.0');
    });
  });

  // ─── 5. Academic — handles no grades ────────────────────────────────────

  describe('Academic — handles no grades', () => {
    it('should return empty subjects array when no grades exist', async () => {
      setupActiveYear();
      mockRlsTx.academicPeriod.findMany.mockResolvedValue([{ id: PERIOD_1_ID }]);
      mockRlsTx.grade.findMany.mockResolvedValue([]);
      mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([]);

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      expect(result.academic_performance.subjects).toEqual([]);
    });

    it('should return empty subjects when no academic periods exist', async () => {
      setupActiveYear();
      mockRlsTx.academicPeriod.findMany.mockResolvedValue([]);
      mockRlsTx.grade.findMany.mockResolvedValue([]);
      mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([]);

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      expect(result.academic_performance.subjects).toEqual([]);
    });
  });

  // ─── 6. Academic — trend calculation ────────────────────────────────────

  describe('Academic — trend calculation', () => {
    it('should detect improving trend when latest period score is higher', async () => {
      setupActiveYear();
      mockRlsTx.academicPeriod.findMany.mockResolvedValue([
        { id: PERIOD_1_ID },
        { id: PERIOD_2_ID },
      ]);
      mockRlsTx.grade.findMany.mockResolvedValue([
        {
          raw_score: 70,
          assessment: {
            subject: { name: 'Mathematics' },
            academic_period_id: PERIOD_1_ID,
          },
        },
        {
          raw_score: 85,
          assessment: {
            subject: { name: 'Mathematics' },
            academic_period_id: PERIOD_2_ID,
          },
        },
      ]);
      mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([]);

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      const math = result.academic_performance.subjects.find(
        (s) => s.subject_name === 'Mathematics',
      );
      expect(math!.trend).toBe('improving');
    });

    it('should detect declining trend when latest period score is lower', async () => {
      setupActiveYear();
      mockRlsTx.academicPeriod.findMany.mockResolvedValue([
        { id: PERIOD_1_ID },
        { id: PERIOD_2_ID },
      ]);
      mockRlsTx.grade.findMany.mockResolvedValue([
        {
          raw_score: 90,
          assessment: {
            subject: { name: 'English' },
            academic_period_id: PERIOD_1_ID,
          },
        },
        {
          raw_score: 72,
          assessment: {
            subject: { name: 'English' },
            academic_period_id: PERIOD_2_ID,
          },
        },
      ]);
      mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([]);

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      const english = result.academic_performance.subjects.find(
        (s) => s.subject_name === 'English',
      );
      expect(english!.trend).toBe('declining');
    });

    it('should detect stable trend when scores are within 0.5 of each other', async () => {
      setupActiveYear();
      mockRlsTx.academicPeriod.findMany.mockResolvedValue([
        { id: PERIOD_1_ID },
        { id: PERIOD_2_ID },
      ]);
      mockRlsTx.grade.findMany.mockResolvedValue([
        {
          raw_score: 80,
          assessment: {
            subject: { name: 'Science' },
            academic_period_id: PERIOD_1_ID,
          },
        },
        {
          raw_score: 80.3,
          assessment: {
            subject: { name: 'Science' },
            academic_period_id: PERIOD_2_ID,
          },
        },
      ]);
      mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([]);

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      const science = result.academic_performance.subjects.find(
        (s) => s.subject_name === 'Science',
      );
      expect(science!.trend).toBe('stable');
    });

    it('should return insufficient_data when only one period has grades', async () => {
      setupActiveYear();
      mockRlsTx.academicPeriod.findMany.mockResolvedValue([
        { id: PERIOD_1_ID },
        { id: PERIOD_2_ID },
      ]);
      mockRlsTx.grade.findMany.mockResolvedValue([
        {
          raw_score: 88,
          assessment: {
            subject: { name: 'History' },
            academic_period_id: PERIOD_1_ID,
          },
        },
      ]);
      mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([]);

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      const history = result.academic_performance.subjects.find(
        (s) => s.subject_name === 'History',
      );
      expect(history!.trend).toBe('insufficient_data');
    });
  });

  // ─── 7. Behaviour — groups incidents by category ────────────────────────

  describe('Behaviour — groups incidents by category correctly', () => {
    it('should group incidents by category name and count correctly', async () => {
      setupActiveYear();
      mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([
        { incident: { category: { name: 'Disruption' } } },
        { incident: { category: { name: 'Disruption' } } },
        { incident: { category: { name: 'Aggression' } } },
        { incident: { category: { name: 'Disruption' } } },
        { incident: { category: { name: 'Tardiness' } } },
      ]);
      mockRlsTx.academicPeriod.findMany.mockResolvedValue([]);
      mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockRlsTx.grade.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([]);

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      expect(result.behaviour.total_incidents).toBe(5);
      expect(result.behaviour.incident_breakdown).toEqual({
        Disruption: 3,
        Aggression: 1,
        Tardiness: 1,
      });
    });
  });

  // ─── 8. Behaviour — no incidents ────────────────────────────────────────

  describe('Behaviour — handles no incidents', () => {
    it('should return zero total and empty breakdown when no incidents exist', async () => {
      setupActiveYear();
      mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockRlsTx.academicPeriod.findMany.mockResolvedValue([]);
      mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockRlsTx.grade.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([]);

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      expect(result.behaviour.total_incidents).toBe(0);
      expect(result.behaviour.incident_breakdown).toEqual({});
    });
  });

  // ─── 9. Interventions — maps data correctly ────────────────────────────

  describe('Interventions — maps intervention data correctly', () => {
    it('should map interventions with type, level, status, and dates', async () => {
      setupActiveYear();
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([
        {
          intervention_type: 'behaviour_support',
          continuum_level: 2,
          status: 'achieved',
          outcome_notes: 'Student showed improvement',
          created_at: new Date('2026-01-15T10:00:00Z'),
        },
        {
          intervention_type: 'academic_support',
          continuum_level: 1,
          status: 'pc_active',
          outcome_notes: null,
          created_at: new Date('2026-02-20T09:00:00Z'),
        },
      ]);
      mockRlsTx.academicPeriod.findMany.mockResolvedValue([]);
      mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockRlsTx.grade.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([]);

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      expect(result.interventions).toHaveLength(2);

      const first = result.interventions[0]!;
      expect(first.type).toBe('behaviour_support');
      expect(first.continuum_level).toBe(2);
      expect(first.outcome).toBe('achieved');
      expect(first.description).toBe('Student showed improvement');
      expect(first.start_date).toBe('2026-01-15T10:00:00.000Z');

      const second = result.interventions[1]!;
      expect(second.type).toBe('academic_support');
      expect(second.continuum_level).toBe(1);
      expect(second.outcome).toBe('pc_active');
      expect(second.description).toBe('Active');
    });
  });

  // ─── 10. Parent contacts — returns most recent 10 ──────────────────────

  describe('Parent contacts — returns most recent 10 contacts', () => {
    it('should return up to 10 contacts ordered by date DESC', async () => {
      setupActiveYear();
      const contacts = Array.from({ length: 10 }, (_, i) => ({
        contact_date: new Date(`2026-03-${String(i + 1).padStart(2, '0')}T10:00:00Z`),
        contact_method: i % 2 === 0 ? 'phone' : 'email',
        outcome: `Outcome ${i + 1}`,
      }));

      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue(contacts);
      mockRlsTx.academicPeriod.findMany.mockResolvedValue([]);
      mockRlsTx.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockRlsTx.grade.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      expect(result.parent_contacts).toHaveLength(10);
      expect(result.parent_contacts[0]!.method).toBe('phone');
      expect(result.parent_contacts[0]!.outcome).toBe('Outcome 1');
    });
  });

  // ─── 11. Parent contacts — handles no contacts ─────────────────────────

  describe('Parent contacts — handles no contacts', () => {
    it('should return empty array when no parent contacts exist', async () => {
      setupEmptyDefaults();

      const result = await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      expect(result.parent_contacts).toEqual([]);
    });
  });

  // ─── 12. All sections in one transaction ───────────────────────────────

  describe('All sections in one transaction', () => {
    it('should use createRlsClient and execute all queries in a single transaction', async () => {
      const { createRlsClient } = jest.requireMock(
        '../../../common/middleware/rls.middleware',
      ) as { createRlsClient: jest.Mock };

      setupEmptyDefaults();

      await service.generateSnapshot(TENANT_ID, STUDENT_ID);

      // Verify createRlsClient was called with correct tenant
      expect(createRlsClient).toHaveBeenCalledWith(
        expect.anything(),
        { tenant_id: TENANT_ID },
      );

      // Verify $transaction was called (all sub-queries run inside it)
      const rlsClient = createRlsClient.mock.results[0]?.value as {
        $transaction: jest.Mock;
      };
      expect(rlsClient.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
