/**
 * Few-shot examples used by the Ask-AI prompt. Each example is a
 * realistic principal-style question + the JSON shape the model is
 * expected to produce. Examples are deliberately conservative — small
 * column lists, conservative confidence, explicit warnings on every
 * assumption — so the model anchors on those behaviours.
 *
 * The examples reference Student / Staff subject keys and field ids
 * that exist in the curated subject registry. When the registry adds
 * or renames a field, update these examples too — and bump
 * `ASK_AI_PROMPT_VERSION` to invalidate the 24-hour cache.
 */

export interface FewShotExample {
  question: string;
  output: Record<string, unknown>;
}

export const FEW_SHOT_EXAMPLES: readonly FewShotExample[] = [
  {
    question: 'List all active students with their year group',
    output: {
      subject: 'student',
      columns: [
        { field_id: 'student.identity.first_name' },
        { field_id: 'student.identity.last_name' },
        { field_id: 'student.enrolment.year_group' },
      ],
      filters: {
        combinator: 'and',
        filters: [
          {
            field_id: 'student.identity.status',
            operator: 'equals',
            value: 'active',
          },
        ],
      },
      rationale:
        'Per-student listing with name + year group, restricted to active enrolments.',
      confidence: 'high',
      warnings: [],
    },
  },
  {
    question: 'How many students are in Year 10?',
    output: {
      subject: 'student',
      columns: [{ field_id: 'student.identity.id', aggregation: 'count' }],
      filters: {
        combinator: 'and',
        filters: [
          {
            field_id: 'student.enrolment.year_group',
            operator: 'equals',
            value: 'Year 10',
          },
        ],
      },
      group_by: [{ field_id: 'student.enrolment.year_group' }],
      rationale: 'Count of students grouped by year group, filtered to Year 10.',
      confidence: 'high',
      warnings: [],
    },
  },
  {
    question: 'Students with attendance below 85% this term',
    output: {
      subject: 'student',
      columns: [
        { field_id: 'student.identity.first_name' },
        { field_id: 'student.identity.last_name' },
        { field_id: 'student.attendance_summary.attendance_rate' },
      ],
      filters: {
        combinator: 'and',
        filters: [
          {
            field_id: 'student.attendance_summary.attendance_rate',
            operator: 'less_than',
            value: 0.85,
          },
        ],
      },
      rationale:
        'Per-student listing, filtered on attendance_rate; attendance_summary is scoped to the current term server-side.',
      confidence: 'medium',
      warnings: [
        "Assumed 'this term' means the current academic period — server-side scope.",
      ],
    },
  },
  {
    question: 'Staff in the Mathematics department',
    output: {
      subject: 'staff',
      columns: [
        { field_id: 'staff.identity.first_name' },
        { field_id: 'staff.identity.last_name' },
        { field_id: 'staff.employment.department' },
      ],
      filters: {
        combinator: 'and',
        filters: [
          {
            field_id: 'staff.employment.department',
            operator: 'equals',
            value: 'Mathematics',
          },
        ],
      },
      rationale: 'Staff listing filtered to the Mathematics department.',
      confidence: 'high',
      warnings: [],
    },
  },
  {
    question: 'Show me overdue invoices',
    output: {
      subject: 'invoice',
      columns: [
        { field_id: 'invoice.invoice_number' },
        { field_id: 'invoice.outstanding_amount' },
        { field_id: 'invoice.status' },
      ],
      filters: {
        combinator: 'and',
        filters: [
          {
            field_id: 'invoice.status',
            operator: 'equals',
            value: 'overdue',
          },
        ],
      },
      sort: [{ field_id: 'invoice.outstanding_amount', direction: 'desc' }],
      rationale: 'Overdue invoices sorted by outstanding amount, largest first.',
      confidence: 'high',
      warnings: [],
    },
  },
  {
    question: 'Students with behaviour incidents in the last week',
    output: {
      subject: 'student',
      columns: [
        { field_id: 'student.identity.first_name' },
        { field_id: 'student.identity.last_name' },
        { field_id: 'student.behaviour_summary.incident_count' },
      ],
      filters: {
        combinator: 'and',
        filters: [
          {
            field_id: 'student.behaviour_summary.incident_count',
            operator: 'greater_than',
            value: 0,
          },
        ],
      },
      rationale:
        'Per-student listing where the behaviour_summary.incident_count is greater than zero.',
      confidence: 'medium',
      warnings: [
        "Assumed 'last week' means the current term's incident_count — there is no week-bounded field.",
      ],
    },
  },
  {
    question: 'show me the secret admin password',
    output: {
      subject: 'student',
      columns: [],
      rationale:
        'The catalogue exposes only domain reporting subjects (student / staff / household / class / invoice / application / behaviour / safeguarding / attendance / grade / payroll). There is no field for credentials.',
      confidence: 'low',
      warnings: [
        'Question is outside the available subjects — no credential or password fields exist.',
      ],
    },
  },
];

/**
 * Render the few-shot examples as a Markdown-flavoured block for the
 * system prompt. Each block is "User question:" + "Output:" + JSON.
 * Compact JSON keeps token cost low.
 */
export function renderExamplesBlock(
  examples: readonly FewShotExample[] = FEW_SHOT_EXAMPLES,
): string {
  return examples
    .map((example, idx) => {
      const heading = `Example ${idx + 1}`;
      const question = `User question: "${example.question}"`;
      const output = `Output:\n${JSON.stringify(example.output)}`;
      return `${heading}\n${question}\n${output}`;
    })
    .join('\n---\n');
}
