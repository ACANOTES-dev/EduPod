import { buildAdapter, type PrismaDelegate } from '../build-adapter';
import type { SubjectAdapter } from '../subject-adapter';
import type { FieldDescriptor, SubjectDescriptor } from '../types';

const fields: readonly FieldDescriptor[] = [
  {
    id: 'grade.identity.raw_score',
    label_key: 'reports.fields.grade.identity.raw_score',
    domain: 'identity',
    type: 'number',
    filterable: true,
    groupable: false,
    aggregations: ['count', 'avg', 'min', 'max', 'sum'],
    resolver: 'raw_score',
  },
  {
    id: 'grade.identity.is_missing',
    label_key: 'reports.fields.grade.identity.is_missing',
    domain: 'identity',
    type: 'boolean',
    filterable: true,
    groupable: true,
    resolver: 'is_missing',
  },
  {
    id: 'grade.identity.ai_assisted',
    label_key: 'reports.fields.grade.identity.ai_assisted',
    domain: 'identity',
    type: 'boolean',
    filterable: true,
    groupable: true,
    resolver: 'ai_assisted',
  },
  {
    id: 'grade.student.first_name',
    label_key: 'reports.fields.grade.student.first_name',
    domain: 'student',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'student_first_name',
  },
  {
    id: 'grade.student.last_name',
    label_key: 'reports.fields.grade.student.last_name',
    domain: 'student',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'student_last_name',
  },
  {
    id: 'grade.assessment.title',
    label_key: 'reports.fields.grade.assessment.title',
    domain: 'assessment',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'assessment_title',
  },
  {
    id: 'grade.timing.entered_at',
    label_key: 'reports.fields.grade.timing.entered_at',
    domain: 'timing',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'entered_at',
  },
  {
    id: 'grade.audit.created_at',
    label_key: 'reports.fields.grade.audit.created_at',
    domain: 'audit',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'created_at',
  },
];

const descriptor: SubjectDescriptor = {
  key: 'grade',
  label_key: 'reports.subjects.grade.label',
  icon_name: 'Award',
  primary_model: 'Grade',
  fields,
};

type GradeRow = {
  id: string;
  raw_score: unknown;
  is_missing: boolean;
  ai_assisted: boolean;
  entered_at: Date | null;
  created_at: Date;
  student: { id: string; first_name: string; last_name: string } | null;
  assessment: { id: string; title: string } | null;
};

export const GRADE_ADAPTER: SubjectAdapter = buildAdapter<GradeRow>({
  descriptor,
  filterColumnMap: {
    'grade.identity.raw_score': 'raw_score',
    'grade.identity.is_missing': 'is_missing',
    'grade.identity.ai_assisted': 'ai_assisted',
    'grade.student.first_name': 'student.first_name',
    'grade.student.last_name': 'student.last_name',
    'grade.assessment.title': 'assessment.title',
    'grade.timing.entered_at': 'entered_at',
    'grade.audit.created_at': 'created_at',
  },
  selectFragment: {
    id: true,
    raw_score: true,
    is_missing: true,
    ai_assisted: true,
    entered_at: true,
    created_at: true,
    student: { select: { id: true, first_name: true, last_name: true } },
    assessment: { select: { id: true, title: true } },
  },
  defaultOrderBy: [{ entered_at: 'desc' }],
  getDelegate: (tx) => tx.grade as unknown as PrismaDelegate,
  resolvers: {
    raw_score: (r) => normaliseDecimal(r.raw_score),
    is_missing: (r) => r.is_missing,
    ai_assisted: (r) => r.ai_assisted,
    student_first_name: (r) => r.student?.first_name ?? null,
    student_last_name: (r) => r.student?.last_name ?? null,
    assessment_title: (r) => r.assessment?.title ?? null,
    entered_at: (r) => r.entered_at,
    created_at: (r) => r.created_at,
  },
});

function normaliseDecimal(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const asString = (value as { toString: () => string }).toString?.();
  if (typeof asString === 'string') {
    const parsed = Number(asString);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
