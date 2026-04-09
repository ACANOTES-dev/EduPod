import {
  createSubjectCommentSchema,
  finaliseSubjectCommentSchema,
  requestSubjectCommentAiDraftSchema,
  updateSubjectCommentSchema,
} from '../subject-comment.schema';

const STUDENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SUBJECT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLASS_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PERIOD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

describe('createSubjectCommentSchema', () => {
  it('accepts a valid payload', () => {
    const result = createSubjectCommentSchema.safeParse({
      student_id: STUDENT_ID,
      subject_id: SUBJECT_ID,
      class_id: CLASS_ID,
      academic_period_id: PERIOD_ID,
      comment_text: 'Strong progress this term.',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a payload with is_ai_draft omitted', () => {
    const result = createSubjectCommentSchema.parse({
      student_id: STUDENT_ID,
      subject_id: SUBJECT_ID,
      class_id: CLASS_ID,
      academic_period_id: PERIOD_ID,
      comment_text: 'Doing well.',
    });
    expect(result.is_ai_draft).toBeUndefined();
  });

  it('rejects an empty comment', () => {
    const result = createSubjectCommentSchema.safeParse({
      student_id: STUDENT_ID,
      subject_id: SUBJECT_ID,
      class_id: CLASS_ID,
      academic_period_id: PERIOD_ID,
      comment_text: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an over-long comment', () => {
    const result = createSubjectCommentSchema.safeParse({
      student_id: STUDENT_ID,
      subject_id: SUBJECT_ID,
      class_id: CLASS_ID,
      academic_period_id: PERIOD_ID,
      comment_text: 'a'.repeat(4001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid ids', () => {
    const result = createSubjectCommentSchema.safeParse({
      student_id: 'nope',
      subject_id: SUBJECT_ID,
      class_id: CLASS_ID,
      academic_period_id: PERIOD_ID,
      comment_text: 'Valid text.',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateSubjectCommentSchema', () => {
  it('accepts a payload with only comment_text', () => {
    expect(updateSubjectCommentSchema.safeParse({ comment_text: 'Updated.' }).success).toBe(true);
  });

  it('rejects a missing comment_text', () => {
    expect(updateSubjectCommentSchema.safeParse({}).success).toBe(false);
  });
});

describe('finaliseSubjectCommentSchema', () => {
  it('accepts an empty body', () => {
    expect(finaliseSubjectCommentSchema.safeParse({}).success).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(finaliseSubjectCommentSchema.safeParse({ extra: 1 }).success).toBe(false);
  });
});

describe('requestSubjectCommentAiDraftSchema', () => {
  it('accepts a valid payload', () => {
    expect(
      requestSubjectCommentAiDraftSchema.safeParse({
        student_id: STUDENT_ID,
        subject_id: SUBJECT_ID,
        academic_period_id: PERIOD_ID,
      }).success,
    ).toBe(true);
  });

  it('rejects missing fields', () => {
    expect(requestSubjectCommentAiDraftSchema.safeParse({ student_id: STUDENT_ID }).success).toBe(
      false,
    );
  });
});
