import {
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
