import { createConcernSchema, updateConcernMetadataSchema } from './concern.schema';

describe('createConcernSchema', () => {
  it('accepts structured additional students involved', () => {
    const result = createConcernSchema.safeParse({
      student_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      category: 'bullying',
      severity: 'elevated',
      narrative: 'Student reported a conflict involving two classmates after lunch.',
      occurred_at: '2026-03-27T10:00:00Z',
      students_involved: [
        { student_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
        { student_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc' },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects duplicate involved students', () => {
    const result = createConcernSchema.safeParse({
      student_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      category: 'bullying',
      severity: 'elevated',
      narrative: 'Student reported a conflict involving two classmates after lunch.',
      occurred_at: '2026-03-27T10:00:00Z',
      students_involved: [
        { student_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
        { student_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects including the primary student in students_involved', () => {
    const result = createConcernSchema.safeParse({
      student_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      category: 'bullying',
      severity: 'elevated',
      narrative: 'Student reported a conflict involving two classmates after lunch.',
      occurred_at: '2026-03-27T10:00:00Z',
      students_involved: [{ student_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }],
    });

    expect(result.success).toBe(false);
  });
});

describe('updateConcernMetadataSchema', () => {
  it('allows replacing the involved students set', () => {
    const result = updateConcernMetadataSchema.safeParse({
      students_involved: [{ student_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }],
    });

    expect(result.success).toBe(true);
  });
});
