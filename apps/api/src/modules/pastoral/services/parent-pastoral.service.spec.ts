import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  ParentReadFacade,
  ConfigurationReadFacade,
} from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { ParentPastoralService } from './parent-pastoral.service';
import { PastoralEventService } from './pastoral-event.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PARENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_ID_B = 'dddddddd-dddd-dddd-dddd-ddddddddddde';
const CONCERN_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const INTERVENTION_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  studentParent: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  pastoralConcern: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  pastoralConcernVersion: {
    create: jest.fn(),
  },
  pastoralIntervention: {
    findMany: jest.fn(),
  },
  behaviourGuardianRestriction: {
    findFirst: jest.fn(),
  },
  classEnrolment: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
    ),
  }),
}));

// ─── Factory Helpers ────────────────────────────────────────────────────────

const makeParent = (overrides: Record<string, unknown> = {}) => ({
  id: PARENT_ID,
  tenant_id: TENANT_ID,
  user_id: USER_ID,
  status: 'active',
  first_name: 'Jane',
  last_name: 'Parent',
  ...overrides,
});

const makeStudentLink = (studentId: string = STUDENT_ID) => ({
  parent_id: PARENT_ID,
  student_id: studentId,
  tenant_id: TENANT_ID,
  student: {
    id: studentId,
    first_name: 'Alice',
    last_name: 'Student',
  },
});

const makeConcern = (overrides: Record<string, unknown> = {}) => ({
  id: CONCERN_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  logged_by_user_id: 'teacher-user-id',
  author_masked: false,
  category: 'academic',
  severity: 'routine',
  tier: 1,
  occurred_at: new Date('2026-03-15T10:00:00Z'),
  parent_shareable: true,
  parent_share_level: 'category_only',
  created_at: new Date('2026-03-15T10:00:00Z'),
  versions: [{ narrative: 'Full concern narrative text for testing purposes.' }],
  ...overrides,
});

const makeIntervention = (overrides: Record<string, unknown> = {}) => ({
  id: INTERVENTION_ID,
  student_id: STUDENT_ID,
  intervention_type: 'classroom_support',
  continuum_level: 1,
  target_outcomes: [
    { description: 'Improve attendance', measurable_target: '90% attendance by term end' },
  ],
  parent_input: 'Parent agrees with plan',
  student_voice: 'I want to do better',
  status: 'pc_active',
  next_review_date: new Date('2026-06-01'),
  created_at: new Date('2026-03-15T10:00:00Z'),
  ...overrides,
});

const makeTenantSettingsRecord = (
  pastoralOverrides: Record<string, unknown> = {},
) => ({
  id: 'settings-1',
  tenant_id: TENANT_ID,
  settings: {
    pastoral: {
      parent_self_referral_enabled: true,
      ...pastoralOverrides,
    },
  },
  created_at: new Date(),
  updated_at: new Date(),
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('ParentPastoralService', () => {
  let service: ParentPastoralService;
  let mockPrisma: Record<string, unknown>;
  let mockParentReadFacade: { findActiveByUserId: jest.Mock };
  let mockConfigFacade: { findSettings: jest.Mock };
  let mockEventService: { write: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {};

    mockParentReadFacade = {
      findActiveByUserId: jest.fn(),
    };

    mockConfigFacade = {
      findSettings: jest.fn(),
    };

    mockEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        (fn as jest.Mock).mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ParentPastoralService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PastoralEventService, useValue: mockEventService },
        { provide: ParentReadFacade, useValue: mockParentReadFacade },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
      ],
    }).compile();

    service = module.get<ParentPastoralService>(ParentPastoralService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getSharedConcerns ──────────────────────────────────────────────────

  describe('getSharedConcerns', () => {
    const query = { page: 1, pageSize: 20 };

    it('should return only parent_shareable=true concerns', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);

      const shareableConcern = makeConcern({ parent_shareable: true });
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([shareableConcern]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(1);

      const result = await service.getSharedConcerns(TENANT_ID, USER_ID, query);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.id).toBe(CONCERN_ID);

      // Verify the where clause includes parent_shareable=true
      const whereArg = mockRlsTx.pastoralConcern.findMany.mock.calls[0]![0].where;
      expect(whereArg.parent_shareable).toBe(true);
    });

    it('should omit narrative for category_only share level', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);

      const concern = makeConcern({
        parent_share_level: 'category_only',
        versions: [{ narrative: 'This should not appear at all' }],
      });
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([concern]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(1);

      const result = await service.getSharedConcerns(TENANT_ID, USER_ID, query);

      expect(result.data[0]!.summary).toBeUndefined();
      expect(result.data[0]!.narrative).toBeUndefined();
    });

    it('should truncate narrative to 200 chars for category_summary share level', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);

      const longNarrative = 'A'.repeat(500);
      const concern = makeConcern({
        parent_share_level: 'category_summary',
        versions: [{ narrative: longNarrative }],
      });
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([concern]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(1);

      const result = await service.getSharedConcerns(TENANT_ID, USER_ID, query);

      expect(result.data[0]!.summary).toBeDefined();
      expect(result.data[0]!.summary!.length).toBe(200);
      expect(result.data[0]!.narrative).toBeUndefined();
    });

    it('should return full narrative for full_detail share level', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);

      const fullNarrative = 'Complete concern narrative text with all details.';
      const concern = makeConcern({
        parent_share_level: 'full_detail',
        versions: [{ narrative: fullNarrative }],
      });
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([concern]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(1);

      const result = await service.getSharedConcerns(TENANT_ID, USER_ID, query);

      expect(result.data[0]!.summary).toBe(fullNarrative);
      expect(result.data[0]!.narrative).toBe(fullNarrative);
    });

    it('should never return author information', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);

      const concern = makeConcern({
        logged_by_user_id: 'teacher-123',
        logged_by: { first_name: 'Secret', last_name: 'Teacher' },
      });
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([concern]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(1);

      const result = await service.getSharedConcerns(TENANT_ID, USER_ID, query);

      const view = result.data[0] as unknown as Record<string, unknown>;
      // ParentConcernView has no author fields — verify they are absent
      expect(view).not.toHaveProperty('logged_by_user_id');
      expect(view).not.toHaveProperty('logged_by');
      expect(view).not.toHaveProperty('author_name');
      expect(view).not.toHaveProperty('author_masked');
    });

    it('should never return Tier 3 concerns even if marked shareable', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);

      // Even if DB somehow returns tier 3 (e.g., mock), the WHERE prevents it
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(0);

      const result = await service.getSharedConcerns(TENANT_ID, USER_ID, query);

      // Verify the where clause enforces tier < 3
      const whereArg = mockRlsTx.pastoralConcern.findMany.mock.calls[0]![0].where;
      expect(whereArg.tier).toEqual({ lt: 3 });
      expect(result.data).toHaveLength(0);
    });

    it('should return empty results for restricted students', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);

      // Guardian restriction is active
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue({
        id: 'restriction-1',
        restriction_type: 'no_behaviour_visibility',
        status: 'active_restriction',
      });

      const result = await service.getSharedConcerns(TENANT_ID, USER_ID, query);

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      // Concern query should NOT have been called (short-circuited)
      expect(mockRlsTx.pastoralConcern.findMany).not.toHaveBeenCalled();
    });

    it('should return 404 if parent record not found', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(null);

      await expect(
        service.getSharedConcerns(TENANT_ID, USER_ID, query),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── submitSelfReferral ─────────────────────────────────────────────────

  describe('submitSelfReferral', () => {
    const dto = {
      student_id: STUDENT_ID,
      description: 'I am concerned about my child academic progress and wellbeing.',
    };

    it('should create a Tier 1 routine concern with parent_self_referral source', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockConfigFacade.findSettings.mockResolvedValue(makeTenantSettingsRecord());

      mockRlsTx.studentParent.findFirst.mockResolvedValue({
        parent_id: PARENT_ID,
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
      });

      const createdConcern = {
        id: CONCERN_ID,
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        logged_by_user_id: USER_ID,
        category: 'other',
        severity: 'routine',
        tier: 1,
        created_at: new Date('2026-03-15T10:00:00Z'),
      };
      mockRlsTx.pastoralConcern.create.mockResolvedValue(createdConcern);
      mockRlsTx.pastoralConcernVersion.create.mockResolvedValue({ id: 'version-1' });
      mockRlsTx.classEnrolment.findFirst.mockResolvedValue(null);

      const result = await service.submitSelfReferral(TENANT_ID, USER_ID, dto);

      expect(result.data.id).toBe(CONCERN_ID);

      // Verify concern created with correct values
      const createArgs = mockRlsTx.pastoralConcern.create.mock.calls[0]![0].data;
      expect(createArgs.tier).toBe(1);
      expect(createArgs.severity).toBe('routine');
      expect(createArgs.category).toBe('other');
      expect(createArgs.logged_by_user_id).toBe(USER_ID);

      // Verify narrative version created
      expect(mockRlsTx.pastoralConcernVersion.create).toHaveBeenCalledTimes(1);
      const versionArgs = mockRlsTx.pastoralConcernVersion.create.mock.calls[0]![0].data;
      expect(versionArgs.narrative).toBe(dto.description);
      expect(versionArgs.version_number).toBe(1);

      // Verify audit event with source = 'parent_self_referral'
      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'concern_created',
          entity_type: 'concern',
          tier: 1,
          payload: expect.objectContaining({
            source: 'parent_self_referral',
            severity: 'routine',
            tier: 1,
          }),
        }),
      );
    });

    it('should auto-assign to homeroom teacher when available', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockConfigFacade.findSettings.mockResolvedValue(makeTenantSettingsRecord());

      mockRlsTx.studentParent.findFirst.mockResolvedValue({
        parent_id: PARENT_ID,
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
      });

      mockRlsTx.pastoralConcern.create.mockResolvedValue({
        id: CONCERN_ID,
        created_at: new Date('2026-03-15T10:00:00Z'),
      });
      mockRlsTx.pastoralConcernVersion.create.mockResolvedValue({ id: 'version-1' });

      // Homeroom teacher exists
      mockRlsTx.classEnrolment.findFirst.mockResolvedValue({
        class_entity: { homeroom_teacher_staff_id: 'teacher-staff-id' },
      });
      mockRlsTx.pastoralConcern.update.mockResolvedValue({});

      await service.submitSelfReferral(TENANT_ID, USER_ID, dto);

      // Verify auto-assign updated the concern
      expect(mockRlsTx.pastoralConcern.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CONCERN_ID },
          data: expect.objectContaining({
            follow_up_needed: true,
            follow_up_suggestion: 'Auto-assigned to homeroom teacher',
          }),
        }),
      );
    });

    it('should reject if parent_self_referral_enabled is false', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockConfigFacade.findSettings.mockResolvedValue(
        makeTenantSettingsRecord({ parent_self_referral_enabled: false }),
      );

      await expect(
        service.submitSelfReferral(TENANT_ID, USER_ID, dto),
      ).rejects.toThrow(BadRequestException);

      // Concern should NOT have been created
      expect(mockRlsTx.pastoralConcern.create).not.toHaveBeenCalled();
    });

    it('should reject if parent is not linked to student', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockConfigFacade.findSettings.mockResolvedValue(makeTenantSettingsRecord());

      // No parent-student link
      mockRlsTx.studentParent.findFirst.mockResolvedValue(null);

      await expect(
        service.submitSelfReferral(TENANT_ID, USER_ID, dto),
      ).rejects.toThrow(ForbiddenException);

      // Concern should NOT have been created
      expect(mockRlsTx.pastoralConcern.create).not.toHaveBeenCalled();
    });

    it('should use provided category when specified', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockConfigFacade.findSettings.mockResolvedValue(makeTenantSettingsRecord());

      mockRlsTx.studentParent.findFirst.mockResolvedValue({
        parent_id: PARENT_ID,
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
      });

      mockRlsTx.pastoralConcern.create.mockResolvedValue({
        id: CONCERN_ID,
        created_at: new Date('2026-03-15T10:00:00Z'),
      });
      mockRlsTx.pastoralConcernVersion.create.mockResolvedValue({ id: 'version-1' });
      mockRlsTx.classEnrolment.findFirst.mockResolvedValue(null);

      await service.submitSelfReferral(TENANT_ID, USER_ID, {
        ...dto,
        category: 'academic',
      });

      const createArgs = mockRlsTx.pastoralConcern.create.mock.calls[0]![0].data;
      expect(createArgs.category).toBe('academic');
    });
  });

  // ─── getInterventionSummaries ─────────────────────────────────────────

  describe('getInterventionSummaries', () => {
    it('should return only parent_informed=true interventions', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);

      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([makeIntervention()]);

      const result = await service.getInterventionSummaries(TENANT_ID, USER_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.id).toBe(INTERVENTION_ID);

      // Verify the where clause includes parent_informed=true
      const whereArg = mockRlsTx.pastoralIntervention.findMany.mock.calls[0]![0].where;
      expect(whereArg.parent_informed).toBe(true);
    });

    it('should omit case_id, case_owner, and created_by from response', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);

      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([makeIntervention()]);

      const result = await service.getInterventionSummaries(TENANT_ID, USER_ID);

      const view = result.data[0] as unknown as Record<string, unknown>;
      expect(view).not.toHaveProperty('case_id');
      expect(view).not.toHaveProperty('case_owner');
      expect(view).not.toHaveProperty('created_by_user_id');
      expect(view).not.toHaveProperty('created_by');

      // Verify select clause explicitly excludes case_id and created_by_user_id
      const selectArg = mockRlsTx.pastoralIntervention.findMany.mock.calls[0]![0].select;
      expect(selectArg.case_id).toBeUndefined();
      expect(selectArg.created_by_user_id).toBeUndefined();
    });

    it('should return empty for restricted students', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);

      // Guardian restriction active
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue({
        id: 'restriction-1',
        restriction_type: 'no_behaviour_visibility',
        status: 'active_restriction',
      });

      const result = await service.getInterventionSummaries(TENANT_ID, USER_ID);

      expect(result.data).toHaveLength(0);
      // Intervention query should NOT have been called
      expect(mockRlsTx.pastoralIntervention.findMany).not.toHaveBeenCalled();
    });

    it('should filter by specific student_id when provided', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([
        makeStudentLink(STUDENT_ID),
        makeStudentLink(STUDENT_ID_B),
      ]);
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);

      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([makeIntervention()]);

      await service.getInterventionSummaries(TENANT_ID, USER_ID, STUDENT_ID);

      const whereArg = mockRlsTx.pastoralIntervention.findMany.mock.calls[0]![0].where;
      expect(whereArg.student_id.in).toEqual([STUDENT_ID]);
    });

    it('should correctly parse target_outcomes JSON', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);

      const intervention = makeIntervention({
        target_outcomes: [
          { description: 'Goal A', measurable_target: 'Metric A' },
          { description: 'Goal B', measurable_target: 'Metric B' },
        ],
      });
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([intervention]);

      const result = await service.getInterventionSummaries(TENANT_ID, USER_ID);

      expect(result.data[0]!.target_outcomes).toEqual([
        { description: 'Goal A', measurable_target: 'Metric A' },
        { description: 'Goal B', measurable_target: 'Metric B' },
      ]);
    });

    it('should return empty target_outcomes for malformed JSON', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);

      const intervention = makeIntervention({
        target_outcomes: 'not an array',
      });
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([intervention]);

      const result = await service.getInterventionSummaries(TENANT_ID, USER_ID);

      expect(result.data[0]!.target_outcomes).toEqual([]);
    });

    it('should include student_name in intervention view', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);

      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([makeIntervention()]);

      const result = await service.getInterventionSummaries(TENANT_ID, USER_ID);

      expect(result.data[0]!.student_name).toBe('Alice Student');
    });
  });

  // ─── resolveParent ────────────────────────────────────────────────────

  describe('resolveParent', () => {
    it('should throw NotFoundException when parent record not found', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(null);

      await expect(
        service.resolveParent(TENANT_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return parent record when found', async () => {
      const parent = makeParent();
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(parent);

      const result = await service.resolveParent(TENANT_ID, USER_ID);

      expect(result.id).toBe(PARENT_ID);
      expect(mockParentReadFacade.findActiveByUserId).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    });
  });

  // ─── Edge cases ─────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('edge: should return empty when parent has no linked students', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([]);

      const result = await service.getSharedConcerns(TENANT_ID, USER_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('edge: should handle multiple students with mixed restrictions', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([
        makeStudentLink(STUDENT_ID),
        makeStudentLink(STUDENT_ID_B),
      ]);

      // First student restricted, second allowed
      mockRlsTx.behaviourGuardianRestriction.findFirst
        .mockResolvedValueOnce({ id: 'restriction-1' }) // STUDENT_ID restricted
        .mockResolvedValueOnce(null);                     // STUDENT_ID_B allowed

      const concern = makeConcern({ student_id: STUDENT_ID_B });
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([concern]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(1);

      await service.getSharedConcerns(TENANT_ID, USER_ID, { page: 1, pageSize: 20 });

      // Only the second student's concerns should be queried
      const whereArg = mockRlsTx.pastoralConcern.findMany.mock.calls[0]![0].where;
      expect(whereArg.student_id.in).toEqual([STUDENT_ID_B]);
    });

    it('edge: self-referral defaults to true when setting is absent', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      // Return settings with NO parent_self_referral_enabled key
      mockConfigFacade.findSettings.mockResolvedValue({
        id: 'settings-1',
        tenant_id: TENANT_ID,
        settings: { pastoral: {} },
        created_at: new Date(),
        updated_at: new Date(),
      });

      mockRlsTx.studentParent.findFirst.mockResolvedValue({
        parent_id: PARENT_ID,
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
      });

      mockRlsTx.pastoralConcern.create.mockResolvedValue({
        id: CONCERN_ID,
        created_at: new Date('2026-03-15T10:00:00Z'),
      });
      mockRlsTx.pastoralConcernVersion.create.mockResolvedValue({ id: 'version-1' });
      mockRlsTx.classEnrolment.findFirst.mockResolvedValue(null);

      // Should NOT throw — defaults to enabled
      const result = await service.submitSelfReferral(TENANT_ID, USER_ID, {
        student_id: STUDENT_ID,
        description: 'Concern about my child wellbeing and progress in school.',
      });

      expect(result.data.id).toBe(CONCERN_ID);
    });

    it('edge: getSharedConcerns with empty versions array returns empty narrative', async () => {
      mockParentReadFacade.findActiveByUserId.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);

      const concern = makeConcern({
        parent_share_level: 'full_detail',
        versions: [], // no versions
      });
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([concern]);
      mockRlsTx.pastoralConcern.count.mockResolvedValue(1);

      const result = await service.getSharedConcerns(TENANT_ID, USER_ID, { page: 1, pageSize: 20 });

      // Should still return the concern with empty narrative
      expect(result.data[0]!.narrative).toBe('');
      expect(result.data[0]!.summary).toBe('');
    });
  });
});
