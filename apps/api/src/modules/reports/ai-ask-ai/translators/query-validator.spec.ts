import type { SubjectDescriptor } from '../../subject-registry/types';

import { validateAiResponse } from './query-validator';

const STUDENT_SUBJECT: SubjectDescriptor = {
  key: 'student',
  label_key: 'reports.subjects.student',
  icon_name: 'GraduationCap',
  primary_model: 'Student',
  fields: [
    {
      id: 'student.identity.first_name',
      label_key: 'k',
      domain: 'identity',
      type: 'string',
      filterable: true,
      groupable: false,
      resolver: 'r',
    },
    {
      id: 'student.identity.last_name',
      label_key: 'k',
      domain: 'identity',
      type: 'string',
      filterable: true,
      groupable: false,
      resolver: 'r',
    },
    {
      id: 'student.identity.id',
      label_key: 'k',
      domain: 'identity',
      type: 'string',
      filterable: false,
      groupable: false,
      aggregations: ['count'],
      resolver: 'r',
    },
    {
      id: 'student.enrolment.year_group',
      label_key: 'k',
      domain: 'enrolment',
      type: 'enum',
      filterable: true,
      groupable: true,
      resolver: 'r',
    },
    {
      id: 'student.attendance_summary.attendance_rate',
      label_key: 'k',
      domain: 'attendance_summary',
      type: 'number',
      filterable: true,
      groupable: false,
      aggregations: ['avg', 'min', 'max'],
      resolver: 'r',
    },
  ],
};

const SUBJECTS: readonly SubjectDescriptor[] = [STUDENT_SUBJECT];

describe('validateAiResponse', () => {
  it('parses a valid response', () => {
    const raw = JSON.stringify({
      subject: 'student',
      columns: [{ field_id: 'student.identity.first_name' }],
      rationale: 'r',
      confidence: 'high',
      warnings: [],
    });
    const out = validateAiResponse(raw, SUBJECTS);
    expect(out.query).not.toBeNull();
    expect(out.query?.subject).toBe('student');
    expect(out.confidence).toBe('high');
    expect(out.warnings).toHaveLength(0);
  });

  it('rejects non-JSON input', () => {
    const out = validateAiResponse('totally not json', SUBJECTS);
    expect(out.query).toBeNull();
    expect(out.confidence).toBe('low');
    expect(out.warnings.join(' ')).toMatch(/JSON/);
  });

  it('rejects unknown subject', () => {
    const raw = JSON.stringify({
      subject: 'wizard',
      columns: [{ field_id: 'wizard.spell' }],
    });
    const out = validateAiResponse(raw, SUBJECTS);
    expect(out.query).toBeNull();
    expect(out.warnings.join(' ')).toMatch(/unknown subject/i);
  });

  it('drops unknown column ids and lowers confidence', () => {
    const raw = JSON.stringify({
      subject: 'student',
      columns: [
        { field_id: 'student.identity.first_name' },
        { field_id: 'student.does_not_exist' },
      ],
      confidence: 'high',
    });
    const out = validateAiResponse(raw, SUBJECTS);
    expect(out.query).not.toBeNull();
    expect(out.query?.columns).toHaveLength(1);
    expect(out.confidence).toBe('medium');
    expect(out.warnings.join(' ')).toMatch(/Dropped 1 column/);
  });

  it('drops illegal operators for the field type', () => {
    const raw = JSON.stringify({
      subject: 'student',
      columns: [{ field_id: 'student.identity.first_name' }],
      filters: {
        combinator: 'and',
        filters: [
          {
            field_id: 'student.identity.first_name',
            operator: 'greater_than',
            value: 'A',
          },
        ],
      },
      confidence: 'high',
    });
    const out = validateAiResponse(raw, SUBJECTS);
    expect(out.warnings.join(' ')).toMatch(/Dropped 1 filter/);
  });

  it('tolerates the legacy `op` alias and `children` filter shape', () => {
    const raw = JSON.stringify({
      subject: 'student',
      columns: [{ field_id: 'student.identity.first_name' }],
      filters: {
        combinator: 'and',
        children: [
          {
            field_id: 'student.identity.first_name',
            op: 'contains',
            value: 'Smith',
          },
        ],
      },
    });
    const out = validateAiResponse(raw, SUBJECTS);
    expect(out.query).not.toBeNull();
    expect(out.query?.filters?.filters).toHaveLength(1);
  });

  it('rejects when no valid columns survive', () => {
    const raw = JSON.stringify({
      subject: 'student',
      columns: [{ field_id: 'student.does_not_exist' }],
    });
    const out = validateAiResponse(raw, SUBJECTS);
    expect(out.query).toBeNull();
    expect(out.warnings.join(' ')).toMatch(/did not include any valid columns/);
  });

  it('drops non-groupable group_by entries', () => {
    const raw = JSON.stringify({
      subject: 'student',
      columns: [
        { field_id: 'student.identity.id', aggregation: 'count' },
        { field_id: 'student.enrolment.year_group' },
      ],
      group_by: [
        { field_id: 'student.enrolment.year_group' },
        { field_id: 'student.identity.first_name' },
      ],
    });
    const out = validateAiResponse(raw, SUBJECTS);
    expect(out.query).not.toBeNull();
    expect(out.query?.group_by).toHaveLength(1);
    expect(out.warnings.join(' ')).toMatch(/Dropped 1 group-by/);
  });

  it('strips a Markdown code fence around the JSON', () => {
    const raw =
      '```json\n' +
      JSON.stringify({
        subject: 'student',
        columns: [{ field_id: 'student.identity.first_name' }],
      }) +
      '\n```';
    const out = validateAiResponse(raw, SUBJECTS);
    expect(out.query).not.toBeNull();
  });

  it('drops a non-filterable field used as a filter', () => {
    const raw = JSON.stringify({
      subject: 'student',
      columns: [{ field_id: 'student.identity.first_name' }],
      filters: {
        combinator: 'and',
        filters: [
          {
            field_id: 'student.identity.id',
            operator: 'equals',
            value: 'x',
          },
        ],
      },
    });
    const out = validateAiResponse(raw, SUBJECTS);
    expect(out.warnings.join(' ')).toMatch(/Dropped 1 filter/);
  });

  it('returns query=null and rationale when AI emits an empty proposal', () => {
    const raw = JSON.stringify({
      subject: 'student',
      columns: [],
      rationale: 'I do not know',
      confidence: 'low',
      warnings: ['ambiguous'],
    });
    const out = validateAiResponse(raw, SUBJECTS);
    expect(out.query).toBeNull();
    expect(out.rationale).toBe('I do not know');
    expect(out.confidence).toBe('low');
    expect(out.warnings).toContain('ambiguous');
  });
});
