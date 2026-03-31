import { senTransitionNoteTypeSchema } from '../enums';

import {
  cloneSupportPlanSchema,
  createResourceAllocationSchema,
  createSenGoalProgressSchema,
  createSenGoalSchema,
  createSenGoalStrategySchema,
  createSenStudentHoursSchema,
  createSnaAssignmentSchema,
  createSupportPlanSchema,
  createTransitionNoteSchema,
  endSnaAssignmentSchema,
  listTransitionNotesQuerySchema,
  listResourceAllocationsQuerySchema,
  listSenGoalProgressQuerySchema,
  listSnaAssignmentsQuerySchema,
  ncseReturnQuerySchema,
  planComplianceQuerySchema,
  professionalInvolvementReportQuerySchema,
  resourceUtilisationQuerySchema,
  senGoalStatusTransitionSchema,
  senSnaTimeRangeSchema,
  senOverviewReportQuerySchema,
  senWeeklyScheduleSchema,
  supportPlanStatusTransitionSchema,
  updateResourceAllocationSchema,
  updateSnaAssignmentSchema,
} from './index';

describe('SEN route-aligned schemas', () => {
  it('accepts support plan creation without sen_profile_id in the body', () => {
    expect(
      createSupportPlanSchema.parse({
        academic_year_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      }),
    ).toEqual({
      academic_year_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });
  });

  it('accepts goal creation without support_plan_id in the body', () => {
    expect(
      createSenGoalSchema.parse({
        title: 'Improve decoding',
        target: 'Read 10 CVC words independently',
        baseline: 'Needs prompting for each word',
        target_date: '2026-06-30',
      }),
    ).toEqual({
      title: 'Improve decoding',
      target: 'Read 10 CVC words independently',
      baseline: 'Needs prompting for each word',
      target_date: '2026-06-30',
    });
  });

  it('accepts strategy and progress payloads without goal_id in the body', () => {
    expect(
      createSenGoalStrategySchema.parse({
        description: 'Daily small-group phonics practice',
      }),
    ).toEqual({
      description: 'Daily small-group phonics practice',
    });

    expect(
      createSenGoalProgressSchema.parse({
        note: 'Student recognised 6 words independently today',
      }),
    ).toEqual({
      note: 'Student recognised 6 words independently today',
    });
  });

  it('validates dedicated transition and clone payloads', () => {
    expect(
      supportPlanStatusTransitionSchema.parse({
        status: 'under_review',
        review_notes: 'Preparing for review meeting',
      }),
    ).toEqual({
      status: 'under_review',
      review_notes: 'Preparing for review meeting',
    });

    expect(
      senGoalStatusTransitionSchema.parse({
        status: 'achieved',
        note: 'Target met consistently across three sessions',
      }),
    ).toEqual({
      status: 'achieved',
      note: 'Target met consistently across three sessions',
    });

    expect(
      cloneSupportPlanSchema.parse({
        academic_year_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      }),
    ).toEqual({
      academic_year_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    });
  });

  it('defaults goal progress list pagination', () => {
    expect(listSenGoalProgressQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it('validates transition note payloads and note-type filtering', () => {
    expect(
      createTransitionNoteSchema.parse({
        sen_profile_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        note_type: 'year_to_year',
        content: 'Continue phonics warm-up and check-ins.',
      }),
    ).toEqual({
      sen_profile_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      note_type: 'year_to_year',
      content: 'Continue phonics warm-up and check-ins.',
    });

    expect(listTransitionNotesQuerySchema.parse({ note_type: 'general' })).toEqual({
      note_type: 'general',
    });
    expect(senTransitionNoteTypeSchema.safeParse('unsupported').success).toBe(false);
  });
});

// ─── Phase 04 — Resource Allocation schemas ───────────────────────────────────

describe('Resource Allocation schemas', () => {
  const UUID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const UUID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const UUID_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  it('accepts valid resource allocation creation', () => {
    expect(
      createResourceAllocationSchema.parse({
        academic_year_id: UUID_A,
        total_hours: 15.5,
        source: 'seno',
        notes: 'SENO allocation for Term 1',
      }),
    ).toEqual({
      academic_year_id: UUID_A,
      total_hours: 15.5,
      source: 'seno',
      notes: 'SENO allocation for Term 1',
    });
  });

  it('rejects resource allocation with invalid source', () => {
    const result = createResourceAllocationSchema.safeParse({
      academic_year_id: UUID_A,
      total_hours: 10,
      source: 'government',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid student hours creation', () => {
    expect(
      createSenStudentHoursSchema.parse({
        resource_allocation_id: UUID_A,
        student_id: UUID_B,
        sen_profile_id: UUID_C,
        allocated_hours: 5.25,
      }),
    ).toEqual({
      resource_allocation_id: UUID_A,
      student_id: UUID_B,
      sen_profile_id: UUID_C,
      allocated_hours: 5.25,
    });
  });

  it('accepts partial resource allocation update', () => {
    expect(
      updateResourceAllocationSchema.parse({
        total_hours: 20,
      }),
    ).toEqual({
      total_hours: 20,
    });
  });

  it('accepts empty resource allocation update', () => {
    expect(updateResourceAllocationSchema.parse({})).toEqual({});
  });

  it('defaults resource allocation list pagination', () => {
    expect(listResourceAllocationsQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it('accepts resource allocation list with filters', () => {
    expect(
      listResourceAllocationsQuerySchema.parse({
        academic_year_id: UUID_A,
        source: 'school',
      }),
    ).toEqual({
      page: 1,
      pageSize: 20,
      academic_year_id: UUID_A,
      source: 'school',
    });
  });

  it('accepts utilisation query with optional academic_year_id', () => {
    expect(resourceUtilisationQuerySchema.parse({})).toEqual({});
    expect(resourceUtilisationQuerySchema.parse({ academic_year_id: UUID_A })).toEqual({
      academic_year_id: UUID_A,
    });
  });

  it('rejects utilisation query with invalid UUID', () => {
    const result = resourceUtilisationQuerySchema.safeParse({
      academic_year_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('defaults Phase 06 report queries and validates academic year ids', () => {
    expect(ncseReturnQuerySchema.parse({})).toEqual({});
    expect(senOverviewReportQuerySchema.parse({})).toEqual({});
    expect(planComplianceQuerySchema.parse({})).toEqual({
      overdue: true,
      due_within_days: 14,
      stale_goal_weeks: 4,
    });
    expect(professionalInvolvementReportQuerySchema.parse({})).toEqual({});

    expect(
      planComplianceQuerySchema.safeParse({
        academic_year_id: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });
});

// ─── Phase 04 — SNA Assignment schemas ────────────────────────────────────────

describe('SNA Assignment schemas', () => {
  const UUID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const UUID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const UUID_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  it('accepts valid SNA assignment creation with weekly schedule', () => {
    const payload = {
      sna_staff_profile_id: UUID_A,
      student_id: UUID_B,
      sen_profile_id: UUID_C,
      schedule: {
        monday: [{ start: '09:00', end: '11:00' }],
        tuesday: [{ start: '10:00', end: '12:00' }],
        wednesday: [],
        thursday: [{ start: '09:00', end: '10:30' }],
        friday: [],
      },
      start_date: '2026-09-01',
    };

    expect(createSnaAssignmentSchema.parse(payload)).toEqual(payload);
  });

  it('rejects SNA assignment without required fields', () => {
    const result = createSnaAssignmentSchema.safeParse({
      sna_staff_profile_id: UUID_A,
      // missing student_id, sen_profile_id, schedule, start_date
    });
    expect(result.success).toBe(false);
  });

  it('validates weekly schedule .strict() rejects extra keys', () => {
    const result = senWeeklyScheduleSchema.safeParse({
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [{ start: '09:00', end: '10:00' }],
    });
    expect(result.success).toBe(false);
  });

  it('defaults weekly schedule empty arrays for missing days', () => {
    expect(senWeeklyScheduleSchema.parse({})).toEqual({
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
    });
  });

  it('rejects time range when end <= start', () => {
    const result = senSnaTimeRangeSchema.safeParse({
      start: '14:00',
      end: '10:00',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const endError = result.error.issues.find((i) => i.path.includes('end'));
      expect(endError?.message).toBe('End time must be after start time');
    }
  });

  it('rejects time range with equal start and end', () => {
    const result = senSnaTimeRangeSchema.safeParse({
      start: '09:00',
      end: '09:00',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid time range', () => {
    expect(senSnaTimeRangeSchema.parse({ start: '08:30', end: '11:45' })).toEqual({
      start: '08:30',
      end: '11:45',
    });
  });

  it('rejects time range with invalid HH:MM format', () => {
    const result = senSnaTimeRangeSchema.safeParse({
      start: '9:00',
      end: '25:00',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid end SNA assignment', () => {
    expect(endSnaAssignmentSchema.parse({ end_date: '2026-12-20' })).toEqual({
      end_date: '2026-12-20',
    });
  });

  it('rejects end SNA assignment with invalid date', () => {
    const result = endSnaAssignmentSchema.safeParse({ end_date: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  it('defaults SNA assignment list pagination', () => {
    expect(listSnaAssignmentsQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it('accepts SNA assignment list with filters', () => {
    expect(
      listSnaAssignmentsQuerySchema.parse({
        student_id: UUID_B,
        status: 'active',
      }),
    ).toEqual({
      page: 1,
      pageSize: 20,
      student_id: UUID_B,
      status: 'active',
    });
  });

  it('accepts partial SNA assignment update', () => {
    expect(
      updateSnaAssignmentSchema.parse({
        notes: 'Updated schedule for Term 2',
      }),
    ).toEqual({
      notes: 'Updated schedule for Term 2',
    });
  });

  it('accepts empty SNA assignment update', () => {
    expect(updateSnaAssignmentSchema.parse({})).toEqual({});
  });
});
