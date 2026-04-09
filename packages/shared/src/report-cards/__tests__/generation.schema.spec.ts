import {
  dryRunGenerationCommentGateSchema,
  generationScopeSchema,
  listGenerationRunsQuerySchema,
  startGenerationRunSchema,
} from '../generation.schema';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';

describe('generationScopeSchema', () => {
  it('accepts year_group mode with a non-empty id list', () => {
    expect(
      generationScopeSchema.safeParse({ mode: 'year_group', year_group_ids: [UUID] }).success,
    ).toBe(true);
  });

  it('accepts class mode with a non-empty id list', () => {
    expect(generationScopeSchema.safeParse({ mode: 'class', class_ids: [UUID] }).success).toBe(
      true,
    );
  });

  it('accepts individual mode with a non-empty id list', () => {
    expect(
      generationScopeSchema.safeParse({ mode: 'individual', student_ids: [UUID, UUID2] }).success,
    ).toBe(true);
  });

  it('rejects mode mismatch on the id field', () => {
    expect(generationScopeSchema.safeParse({ mode: 'year_group', class_ids: [UUID] }).success).toBe(
      false,
    );
  });

  it('rejects empty id list for every mode', () => {
    expect(
      generationScopeSchema.safeParse({ mode: 'year_group', year_group_ids: [] }).success,
    ).toBe(false);
    expect(generationScopeSchema.safeParse({ mode: 'class', class_ids: [] }).success).toBe(false);
    expect(generationScopeSchema.safeParse({ mode: 'individual', student_ids: [] }).success).toBe(
      false,
    );
  });

  it('rejects unknown mode', () => {
    expect(generationScopeSchema.safeParse({ mode: 'cohort', student_ids: [UUID] }).success).toBe(
      false,
    );
  });

  it('rejects non-uuid ids', () => {
    expect(
      generationScopeSchema.safeParse({ mode: 'class', class_ids: ['not-a-uuid'] }).success,
    ).toBe(false);
  });
});

describe('dryRunGenerationCommentGateSchema', () => {
  it('defaults content_scope to grades_only', () => {
    const parsed = dryRunGenerationCommentGateSchema.parse({
      scope: { mode: 'class', class_ids: [UUID] },
      academic_period_id: UUID,
    });
    expect(parsed.content_scope).toBe('grades_only');
  });

  it('rejects missing period', () => {
    expect(
      dryRunGenerationCommentGateSchema.safeParse({
        scope: { mode: 'class', class_ids: [UUID] },
      }).success,
    ).toBe(false);
  });

  it('rejects unknown content_scope', () => {
    expect(
      dryRunGenerationCommentGateSchema.safeParse({
        scope: { mode: 'class', class_ids: [UUID] },
        academic_period_id: UUID,
        content_scope: 'grades_homework',
      }).success,
    ).toBe(false);
  });
});

describe('startGenerationRunSchema', () => {
  it('defaults override_comment_gate to false', () => {
    const parsed = startGenerationRunSchema.parse({
      scope: { mode: 'class', class_ids: [UUID] },
      academic_period_id: UUID,
    });
    expect(parsed.override_comment_gate).toBe(false);
  });

  it('accepts override_comment_gate and personal_info_fields', () => {
    const parsed = startGenerationRunSchema.parse({
      scope: { mode: 'individual', student_ids: [UUID] },
      academic_period_id: UUID,
      override_comment_gate: true,
      personal_info_fields: ['full_name', 'student_number'],
    });
    expect(parsed.override_comment_gate).toBe(true);
    expect(parsed.personal_info_fields).toEqual(['full_name', 'student_number']);
  });

  it('rejects unknown personal_info_fields entries', () => {
    expect(
      startGenerationRunSchema.safeParse({
        scope: { mode: 'individual', student_ids: [UUID] },
        academic_period_id: UUID,
        personal_info_fields: ['favourite_colour'],
      }).success,
    ).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(
      startGenerationRunSchema.safeParse({
        scope: { mode: 'class', class_ids: [UUID] },
        academic_period_id: UUID,
        smuggled_field: true,
      }).success,
    ).toBe(false);
  });
});

describe('listGenerationRunsQuerySchema', () => {
  it('applies default pagination', () => {
    const parsed = listGenerationRunsQuerySchema.parse({});
    expect(parsed).toEqual({ page: 1, pageSize: 20 });
  });

  it('coerces string page values', () => {
    const parsed = listGenerationRunsQuerySchema.parse({ page: '3', pageSize: '50' });
    expect(parsed).toEqual({ page: 3, pageSize: 50 });
  });

  it('rejects pageSize above 100', () => {
    expect(listGenerationRunsQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});
