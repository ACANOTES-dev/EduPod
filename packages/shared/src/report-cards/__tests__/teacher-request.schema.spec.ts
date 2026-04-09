import {
  approveTeacherRequestSchema,
  listTeacherRequestsQuerySchema,
  rejectTeacherRequestSchema,
  reviewTeacherRequestSchema,
  submitTeacherRequestSchema,
  teacherRequestStatusSchema,
  teacherRequestTypeSchema,
} from '../teacher-request.schema';

const PERIOD_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('teacherRequestTypeSchema', () => {
  it('accepts the two known types', () => {
    expect(teacherRequestTypeSchema.safeParse('open_comment_window').success).toBe(true);
    expect(teacherRequestTypeSchema.safeParse('regenerate_reports').success).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(teacherRequestTypeSchema.safeParse('open_window').success).toBe(false);
    expect(teacherRequestTypeSchema.safeParse('').success).toBe(false);
  });
});

describe('teacherRequestStatusSchema', () => {
  it('accepts every status value', () => {
    for (const status of ['pending', 'approved', 'rejected', 'completed', 'cancelled']) {
      expect(teacherRequestStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it('rejects unknown statuses', () => {
    expect(teacherRequestStatusSchema.safeParse('archived').success).toBe(false);
  });
});

describe('submitTeacherRequestSchema', () => {
  it('accepts a valid open_comment_window request without scope', () => {
    const result = submitTeacherRequestSchema.safeParse({
      request_type: 'open_comment_window',
      academic_period_id: PERIOD_ID,
      reason: 'Two students were absent during the original window.',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an open_comment_window request with explicit null scope', () => {
    const result = submitTeacherRequestSchema.safeParse({
      request_type: 'open_comment_window',
      academic_period_id: PERIOD_ID,
      target_scope_json: null,
      reason: 'Need extra time for SEN students.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects open_comment_window with a non-null target_scope_json', () => {
    const result = submitTeacherRequestSchema.safeParse({
      request_type: 'open_comment_window',
      academic_period_id: PERIOD_ID,
      target_scope_json: { scope: 'student', ids: [STUDENT_ID] },
      reason: 'Should be rejected.',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['target_scope_json']);
    }
  });

  it('accepts a valid regenerate_reports request with a student scope', () => {
    const result = submitTeacherRequestSchema.safeParse({
      request_type: 'regenerate_reports',
      academic_period_id: PERIOD_ID,
      target_scope_json: { scope: 'student', ids: [STUDENT_ID] },
      reason: 'Late grade entry — please regenerate this student.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects regenerate_reports without target_scope_json', () => {
    const result = submitTeacherRequestSchema.safeParse({
      request_type: 'regenerate_reports',
      academic_period_id: PERIOD_ID,
      reason: 'Missing scope.',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['target_scope_json']);
    }
  });

  it('rejects regenerate_reports with an empty ids array', () => {
    const result = submitTeacherRequestSchema.safeParse({
      request_type: 'regenerate_reports',
      academic_period_id: PERIOD_ID,
      target_scope_json: { scope: 'class', ids: [] },
      reason: 'Empty scope.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown scope values', () => {
    const result = submitTeacherRequestSchema.safeParse({
      request_type: 'regenerate_reports',
      academic_period_id: PERIOD_ID,
      target_scope_json: { scope: 'tenant', ids: [STUDENT_ID] },
      reason: 'Bad scope.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty reason', () => {
    const result = submitTeacherRequestSchema.safeParse({
      request_type: 'open_comment_window',
      academic_period_id: PERIOD_ID,
      reason: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('reviewTeacherRequestSchema', () => {
  it('accepts approve and reject decisions', () => {
    expect(reviewTeacherRequestSchema.safeParse({ decision: 'approve' }).success).toBe(true);
    expect(
      reviewTeacherRequestSchema.safeParse({ decision: 'reject', review_note: 'Out of scope.' })
        .success,
    ).toBe(true);
  });

  it('rejects unknown decisions', () => {
    expect(reviewTeacherRequestSchema.safeParse({ decision: 'defer' }).success).toBe(false);
  });
});

describe('approveTeacherRequestSchema', () => {
  it('accepts an empty object and defaults auto_execute to false', () => {
    const result = approveTeacherRequestSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.auto_execute).toBe(false);
    }
  });

  it('accepts a review_note and auto_execute = true', () => {
    const result = approveTeacherRequestSchema.safeParse({
      review_note: 'Approved — starting regen now.',
      auto_execute: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.auto_execute).toBe(true);
    }
  });

  it('rejects unknown keys', () => {
    const result = approveTeacherRequestSchema.safeParse({
      review_note: 'ok',
      bogus: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a review_note over the limit', () => {
    const result = approveTeacherRequestSchema.safeParse({
      review_note: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

describe('rejectTeacherRequestSchema', () => {
  it('requires a non-empty review_note', () => {
    expect(rejectTeacherRequestSchema.safeParse({}).success).toBe(false);
    expect(rejectTeacherRequestSchema.safeParse({ review_note: '' }).success).toBe(false);
    expect(rejectTeacherRequestSchema.safeParse({ review_note: 'Not this period.' }).success).toBe(
      true,
    );
  });

  it('rejects unknown keys', () => {
    const result = rejectTeacherRequestSchema.safeParse({
      review_note: 'Not this period.',
      auto_execute: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('listTeacherRequestsQuerySchema', () => {
  it('applies defaults for page and pageSize', () => {
    const result = listTeacherRequestsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.my).toBeUndefined();
    }
  });

  it('coerces page and pageSize from strings', () => {
    const result = listTeacherRequestsQuerySchema.safeParse({
      page: '3',
      pageSize: '50',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.pageSize).toBe(50);
    }
  });

  it('parses the my=true flag to a boolean', () => {
    const parsed = listTeacherRequestsQuerySchema.safeParse({ my: 'true' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.my).toBe(true);
    }
  });

  it('rejects pageSize above the cap', () => {
    expect(listTeacherRequestsQuerySchema.safeParse({ pageSize: 500 }).success).toBe(false);
  });

  it('rejects unknown statuses', () => {
    expect(listTeacherRequestsQuerySchema.safeParse({ status: 'archived' }).success).toBe(false);
  });
});
