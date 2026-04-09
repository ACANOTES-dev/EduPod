import {
  createOverallCommentSchema,
  finaliseOverallCommentSchema,
  updateOverallCommentSchema,
} from '../overall-comment.schema';

const STUDENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PERIOD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

describe('createOverallCommentSchema', () => {
  it('accepts a valid payload', () => {
    expect(
      createOverallCommentSchema.safeParse({
        student_id: STUDENT_ID,
        class_id: CLASS_ID,
        academic_period_id: PERIOD_ID,
        comment_text: 'A successful term overall.',
      }).success,
    ).toBe(true);
  });

  it('rejects an empty comment', () => {
    expect(
      createOverallCommentSchema.safeParse({
        student_id: STUDENT_ID,
        class_id: CLASS_ID,
        academic_period_id: PERIOD_ID,
        comment_text: '',
      }).success,
    ).toBe(false);
  });

  it('rejects an over-long comment', () => {
    expect(
      createOverallCommentSchema.safeParse({
        student_id: STUDENT_ID,
        class_id: CLASS_ID,
        academic_period_id: PERIOD_ID,
        comment_text: 'a'.repeat(8001),
      }).success,
    ).toBe(false);
  });
});

describe('updateOverallCommentSchema', () => {
  it('accepts a non-empty comment', () => {
    expect(updateOverallCommentSchema.safeParse({ comment_text: 'Updated.' }).success).toBe(true);
  });

  it('rejects an empty comment', () => {
    expect(updateOverallCommentSchema.safeParse({ comment_text: '' }).success).toBe(false);
  });
});

describe('finaliseOverallCommentSchema', () => {
  it('accepts an empty body', () => {
    expect(finaliseOverallCommentSchema.safeParse({}).success).toBe(true);
  });

  it('rejects extra keys', () => {
    expect(finaliseOverallCommentSchema.safeParse({ note: 'x' }).success).toBe(false);
  });
});
