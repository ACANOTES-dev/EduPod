import {
  closeCommentWindowSchema,
  createCommentWindowSchema,
  updateCommentWindowSchema,
} from '../comment-window.schema';

const PERIOD_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('createCommentWindowSchema', () => {
  it('accepts a valid window with closes_at strictly after opens_at', () => {
    const result = createCommentWindowSchema.safeParse({
      academic_period_id: PERIOD_ID,
      opens_at: '2026-04-01T08:00:00Z',
      closes_at: '2026-04-08T17:00:00Z',
      instructions: 'Please finalise by Friday.',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an instructions=null payload', () => {
    const result = createCommentWindowSchema.safeParse({
      academic_period_id: PERIOD_ID,
      opens_at: '2026-04-01T08:00:00Z',
      closes_at: '2026-04-08T17:00:00Z',
      instructions: null,
    });
    expect(result.success).toBe(true);
  });

  it('edge: rejects closes_at equal to opens_at', () => {
    const result = createCommentWindowSchema.safeParse({
      academic_period_id: PERIOD_ID,
      opens_at: '2026-04-01T08:00:00Z',
      closes_at: '2026-04-01T08:00:00Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['closes_at']);
    }
  });

  it('edge: rejects closes_at before opens_at', () => {
    const result = createCommentWindowSchema.safeParse({
      academic_period_id: PERIOD_ID,
      opens_at: '2026-04-08T17:00:00Z',
      closes_at: '2026-04-01T08:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid academic_period_id', () => {
    const result = createCommentWindowSchema.safeParse({
      academic_period_id: 'not-a-uuid',
      opens_at: '2026-04-01T08:00:00Z',
      closes_at: '2026-04-08T17:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing opens_at', () => {
    const result = createCommentWindowSchema.safeParse({
      academic_period_id: PERIOD_ID,
      closes_at: '2026-04-08T17:00:00Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateCommentWindowSchema', () => {
  it('accepts a partial update with only instructions', () => {
    const result = updateCommentWindowSchema.safeParse({ instructions: 'New note' });
    expect(result.success).toBe(true);
  });

  it('accepts an update that only moves opens_at', () => {
    const result = updateCommentWindowSchema.safeParse({
      opens_at: '2026-04-02T08:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an update where both timestamps are present and invalid', () => {
    const result = updateCommentWindowSchema.safeParse({
      opens_at: '2026-04-08T17:00:00Z',
      closes_at: '2026-04-01T08:00:00Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['closes_at']);
    }
  });
});

describe('closeCommentWindowSchema', () => {
  it('accepts an empty payload', () => {
    expect(closeCommentWindowSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a closed_at override', () => {
    expect(closeCommentWindowSchema.safeParse({ closed_at: '2026-04-09T10:00:00Z' }).success).toBe(
      true,
    );
  });

  it('rejects a non-datetime closed_at', () => {
    expect(closeCommentWindowSchema.safeParse({ closed_at: 'yesterday' }).success).toBe(false);
  });
});
