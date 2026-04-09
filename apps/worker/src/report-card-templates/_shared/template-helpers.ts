import type { PersonalInfoFieldKey, ReportCardRenderPayload } from '@school/shared';

// ─── Handlebars view model ───────────────────────────────────────────────────
// The raw ReportCardRenderPayload is close to what a template needs, but a few
// things are easier to compute once here than in Handlebars: section numbering,
// the rendered student name, formatted dates, grade-pill colour classes, and
// an ordered list of student detail fields.

export type TemplateLanguage = 'en' | 'ar';

export interface DetailField {
  label: string;
  value: string;
  mono: boolean;
}

export interface SubjectRow {
  subject_name: string;
  mark: string;
  grade: string;
  grade_class: string; // a/b/c for colour coding
  remark: string;
}

export interface TemplateViewModel {
  language: TemplateLanguage;
  direction: 'ltr' | 'rtl';
  lang_attr: 'en' | 'ar';
  tenant_name: string;
  eyebrow: string;
  report_title: string;
  academic_year: string;
  period_name: string;
  issued_label: string;
  issued_date: string;
  student: {
    full_name: string;
    display_name: string; // surname-capitalised
    details: DetailField[];
    rank_badge: 1 | 2 | 3 | null;
    rank_badge_label: string | null;
  };
  subjects: SubjectRow[];
  has_subjects: boolean;
  overall: {
    weighted_average: string; // formatted percent or '—'
    overall_grade: string; // letter or '—'
    overall_comment: string;
    has_comment: boolean;
  };
  grading_scale: Array<{ label: string; range: string }>;
  has_grading_scale: boolean;
  principal: {
    name: string | null;
    signature_src: string | null;
    signature_available: boolean;
    title_label: string;
  };
  footer_label: string;
  sections: {
    student_label: string;
    results_label: string;
    overall_label: string;
    comment_label: string;
    grading_scale_label: string;
  };
  // Column headings for the subjects table
  headings: {
    subject: string;
    mark: string;
    grade: string;
    remark: string;
  };
}

// ─── Translation tables ──────────────────────────────────────────────────────

const DETAIL_LABELS: Record<PersonalInfoFieldKey, { en: string; ar: string }> = {
  full_name: { en: 'Full Name', ar: 'الاسم الكامل' },
  student_number: { en: 'Student ID', ar: 'رقم الطالب' },
  date_of_birth: { en: 'Date of Birth', ar: 'تاريخ الميلاد' },
  sex: { en: 'Sex', ar: 'الجنس' },
  nationality: { en: 'Nationality', ar: 'الجنسية' },
  national_id: { en: 'National ID', ar: 'الرقم الوطني' },
  admission_date: { en: 'Admission Date', ar: 'تاريخ الالتحاق' },
  photo: { en: 'Photo', ar: 'الصورة' },
  homeroom_teacher: { en: 'Homeroom Teacher', ar: 'معلم الفصل' },
  year_group: { en: 'Year Group', ar: 'المستوى الدراسي' },
  class_name: { en: 'Class', ar: 'الفصل' },
};

const MONO_FIELDS: ReadonlySet<PersonalInfoFieldKey> = new Set(['student_number', 'national_id']);

const STRINGS = {
  en: {
    eyebrow: 'Academic Report',
    report_title: 'Report Card',
    issued_label: 'Issued',
    em_dash: '—',
    student_label: 'Student',
    results_label: 'Academic Results',
    overall_label: 'Overall Performance',
    comment_label: 'Homeroom Comment',
    grading_scale_label: 'Grading Scale',
    subject_heading: 'Subject',
    mark_heading: 'Mark',
    grade_heading: 'Grade',
    remark_heading: 'Remark',
    principal_title: 'School Principal',
    rank_top_1: 'Top of class',
    rank_top_2: '2nd in class',
    rank_top_3: '3rd in class',
  },
  ar: {
    eyebrow: 'التقرير الأكاديمي',
    report_title: 'بطاقة التقرير',
    issued_label: 'الإصدار',
    em_dash: '—',
    student_label: 'الطالب',
    results_label: 'النتائج الأكاديمية',
    overall_label: 'الأداء العام',
    comment_label: 'ملاحظة معلم الفصل',
    grading_scale_label: 'سلم الدرجات',
    subject_heading: 'المادة',
    mark_heading: 'الدرجة',
    grade_heading: 'التقدير',
    remark_heading: 'الملاحظة',
    principal_title: 'مدير المدرسة',
    rank_top_1: 'الأول على الفصل',
    rank_top_2: 'الثاني على الفصل',
    rank_top_3: 'الثالث على الفصل',
  },
} as const;

// ─── Formatting helpers ──────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatIssuedDate(iso: string, language: TemplateLanguage): string {
  // Gregorian, Western numerals — per project i18n rule. `en-GB` produces
  // "9 April 2026"; `ar` + `nu: 'latn'` produces Arabic month name with
  // Western digits.
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const locale = language === 'ar' ? 'ar-u-nu-latn-ca-gregory' : 'en-GB';
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(1)}%`;
}

function rankBadgeLabel(rank: 1 | 2 | 3 | null, language: TemplateLanguage): string | null {
  if (rank === null) return null;
  const t = STRINGS[language];
  if (rank === 1) return t.rank_top_1;
  if (rank === 2) return t.rank_top_2;
  return t.rank_top_3;
}

function gradeClass(grade: string | null): string {
  if (!grade) return 'empty';
  const firstChar = grade.trim().charAt(0).toUpperCase();
  if (firstChar === 'A') return 'a';
  if (firstChar === 'B') return 'b';
  if (firstChar === 'C') return 'c';
  if (firstChar === 'D') return 'd';
  return 'f';
}

function detailOrderForTemplate(): PersonalInfoFieldKey[] {
  // Display order for the student details grid. The template renders whichever
  // of these are present in `personal_info`, in this exact sequence.
  return [
    'full_name',
    'student_number',
    'date_of_birth',
    'sex',
    'nationality',
    'admission_date',
    'year_group',
    'class_name',
    'homeroom_teacher',
  ];
}

// ─── Public adapter ──────────────────────────────────────────────────────────

export interface BuildViewModelInput {
  payload: ReportCardRenderPayload;
  /** Rendered data URL for the principal signature PNG, if loaded. */
  signatureDataUrl: string | null;
}

export function buildTemplateViewModel(input: BuildViewModelInput): TemplateViewModel {
  const { payload, signatureDataUrl } = input;
  const language: TemplateLanguage = payload.language;
  const t = STRINGS[language];

  const fullName = payload.student.personal_info.full_name ?? '';

  // Student detail fields — only render the keys that exist in `personal_info`
  // and have a non-empty value. `photo` is handled separately (no text row).
  const details: DetailField[] = [];
  const order = detailOrderForTemplate();
  for (const key of order) {
    if (key === 'photo') continue;
    if (!(key in payload.student.personal_info)) continue;
    const rawValue = payload.student.personal_info[key];
    if (rawValue === null || rawValue === undefined || rawValue === '') continue;
    details.push({
      label: DETAIL_LABELS[key][language],
      value: rawValue,
      mono: MONO_FIELDS.has(key),
    });
  }

  const subjects: SubjectRow[] = payload.grades.subjects.map((subject) => ({
    subject_name: subject.subject_name,
    mark: subject.score !== null ? `${subject.score.toFixed(1)}%` : '—',
    grade: subject.grade ?? '—',
    grade_class: gradeClass(subject.grade),
    remark: subject.subject_comment || '',
  }));

  const gradingScale = (payload.grades.grading_scale ?? []).map((band) => ({
    label: band.label,
    range: `${band.min}–${band.max}`,
  }));

  return {
    language,
    direction: payload.direction,
    lang_attr: language,
    tenant_name: payload.tenant.name,
    eyebrow: t.eyebrow,
    report_title: t.report_title,
    academic_year: payload.academic_period.academic_year_name,
    period_name: payload.academic_period.name,
    issued_label: t.issued_label,
    issued_date: formatIssuedDate(payload.issued_at, language),
    student: {
      full_name: fullName,
      display_name: fullName,
      details,
      rank_badge: payload.student.rank_badge,
      rank_badge_label: rankBadgeLabel(payload.student.rank_badge, language),
    },
    subjects,
    has_subjects: subjects.length > 0,
    overall: {
      weighted_average: formatPercent(payload.grades.overall.weighted_average),
      overall_grade: payload.grades.overall.overall_grade ?? '—',
      overall_comment: payload.grades.overall.overall_comment ?? '',
      has_comment: Boolean(payload.grades.overall.overall_comment?.trim()),
    },
    grading_scale: gradingScale,
    has_grading_scale: gradingScale.length > 0,
    principal: {
      name: payload.tenant.principal_name,
      signature_src: signatureDataUrl,
      signature_available: Boolean(signatureDataUrl),
      title_label: t.principal_title,
    },
    footer_label: `${payload.tenant.name} · ${t.report_title}`,
    sections: {
      student_label: t.student_label,
      results_label: t.results_label,
      overall_label: t.overall_label,
      comment_label: t.comment_label,
      grading_scale_label: t.grading_scale_label,
    },
    headings: {
      subject: t.subject_heading,
      mark: t.mark_heading,
      grade: t.grade_heading,
      remark: t.remark_heading,
    },
  };
}

// ─── HTML escape helper exported for tests ──────────────────────────────────

export const __test__ = { escapeHtml, formatPercent, gradeClass };
