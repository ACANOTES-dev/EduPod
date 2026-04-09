import type { ReportCardRenderPayload } from '@school/shared';

import { buildTemplateViewModel, __test__ } from './template-helpers';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function basePayload(overrides: Partial<ReportCardRenderPayload> = {}): ReportCardRenderPayload {
  const base: ReportCardRenderPayload = {
    tenant: {
      id: 't-1',
      name: 'Nurul Huda Language School',
      logo_storage_key: null,
      principal_name: 'Mr John Doe',
      principal_signature_storage_key: null,
      address: null,
    },
    language: 'en',
    direction: 'ltr',
    template: {
      id: 'tpl-1',
      content_scope: 'grades_only',
    },
    student: {
      id: 's-1',
      personal_info: {
        full_name: 'Clark Mitchell',
        student_number: 'NHL-2024-0147',
        date_of_birth: '2018-03-14',
        nationality: 'Irish',
        year_group: 'Second Class',
        class_name: '2A',
        homeroom_teacher: 'Ms Fatima Al-Awadhi',
      },
      rank_badge: null,
    },
    academic_period: {
      id: 'ap-1',
      name: 'Semester 1',
      academic_year_name: '2025-2026',
    },
    grades: {
      subjects: [
        {
          subject_id: 'sub-1',
          subject_name: 'Mathematics',
          teacher_name: null,
          score: 92,
          grade: 'A',
          subject_comment: 'Demonstrates strong numerical reasoning.',
        },
        {
          subject_id: 'sub-2',
          subject_name: 'English Language',
          teacher_name: null,
          score: 88,
          grade: 'B+',
          subject_comment: '',
        },
      ],
      overall: {
        weighted_average: 90,
        overall_grade: 'A-',
        overall_comment: 'Strong semester overall.',
      },
      grading_scale: [
        { label: 'A', min: 90, max: 100 },
        { label: 'B', min: 80, max: 89 },
      ],
    },
    issued_at: '2026-04-09T00:00:00.000Z',
  };
  return { ...base, ...overrides };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildTemplateViewModel — English', () => {
  it('maps tenant, period and student metadata', () => {
    const vm = buildTemplateViewModel({ payload: basePayload(), signatureDataUrl: null });

    expect(vm.language).toBe('en');
    expect(vm.direction).toBe('ltr');
    expect(vm.tenant_name).toBe('Nurul Huda Language School');
    expect(vm.period_name).toBe('Semester 1');
    expect(vm.academic_year).toBe('2025-2026');
    expect(vm.eyebrow).toBe('Academic Report');
    expect(vm.report_title).toBe('Report Card');
    expect(vm.sections.results_label).toBe('Academic Results');
  });

  it('formats issued_at as an English long date', () => {
    const vm = buildTemplateViewModel({ payload: basePayload(), signatureDataUrl: null });
    expect(vm.issued_date).toMatch(/April 2026$/);
  });

  it('renders student details in fixed order and skips missing fields', () => {
    const vm = buildTemplateViewModel({ payload: basePayload(), signatureDataUrl: null });
    const labels = vm.student.details.map((d) => d.label);
    expect(labels[0]).toBe('Full Name');
    expect(labels).toContain('Student ID');
    expect(labels).not.toContain('Sex'); // not in payload
  });

  it('marks student_number as mono', () => {
    const vm = buildTemplateViewModel({ payload: basePayload(), signatureDataUrl: null });
    const studentIdField = vm.student.details.find((d) => d.label === 'Student ID');
    expect(studentIdField?.mono).toBe(true);
  });

  it('formats subject marks as percent and preserves grade', () => {
    const vm = buildTemplateViewModel({ payload: basePayload(), signatureDataUrl: null });
    expect(vm.subjects[0]).toMatchObject({
      subject_name: 'Mathematics',
      mark: '92.0%',
      grade: 'A',
      grade_class: 'a',
    });
    expect(vm.subjects[1]).toMatchObject({
      grade: 'B+',
      grade_class: 'b',
    });
  });

  it('formats overall average and grade', () => {
    const vm = buildTemplateViewModel({ payload: basePayload(), signatureDataUrl: null });
    expect(vm.overall.weighted_average).toBe('90.0%');
    expect(vm.overall.overall_grade).toBe('A-');
    expect(vm.overall.has_comment).toBe(true);
  });

  it('renders an em dash when weighted_average is null', () => {
    const payload = basePayload();
    payload.grades.overall.weighted_average = null;
    payload.grades.overall.overall_grade = null;
    const vm = buildTemplateViewModel({ payload, signatureDataUrl: null });
    expect(vm.overall.weighted_average).toBe('—');
    expect(vm.overall.overall_grade).toBe('—');
  });

  it('returns no rank badge label when rank_badge is null', () => {
    const vm = buildTemplateViewModel({ payload: basePayload(), signatureDataUrl: null });
    expect(vm.student.rank_badge_label).toBeNull();
  });

  it('returns the correct rank label for top-3 rank', () => {
    const payload = basePayload();
    payload.student.rank_badge = 1;
    const vmOne = buildTemplateViewModel({ payload, signatureDataUrl: null });
    expect(vmOne.student.rank_badge_label).toBe('Top of class');

    payload.student.rank_badge = 2;
    expect(
      buildTemplateViewModel({ payload, signatureDataUrl: null }).student.rank_badge_label,
    ).toBe('2nd in class');

    payload.student.rank_badge = 3;
    expect(
      buildTemplateViewModel({ payload, signatureDataUrl: null }).student.rank_badge_label,
    ).toBe('3rd in class');
  });

  it('flags signature unavailable when no data URL', () => {
    const vm = buildTemplateViewModel({ payload: basePayload(), signatureDataUrl: null });
    expect(vm.principal.signature_available).toBe(false);
    expect(vm.principal.signature_src).toBeNull();
  });

  it('flags signature available when a data URL is provided', () => {
    const vm = buildTemplateViewModel({
      payload: basePayload(),
      signatureDataUrl: 'data:image/png;base64,abc',
    });
    expect(vm.principal.signature_available).toBe(true);
    expect(vm.principal.signature_src).toBe('data:image/png;base64,abc');
  });
});

describe('buildTemplateViewModel — Arabic', () => {
  it('uses Arabic strings and RTL direction', () => {
    const payload = basePayload({ language: 'ar', direction: 'rtl' });
    const vm = buildTemplateViewModel({ payload, signatureDataUrl: null });
    expect(vm.direction).toBe('rtl');
    expect(vm.eyebrow).toBe('التقرير الأكاديمي');
    expect(vm.report_title).toBe('بطاقة التقرير');
    expect(vm.sections.student_label).toBe('الطالب');
    expect(vm.sections.results_label).toBe('النتائج الأكاديمية');
    expect(vm.sections.overall_label).toBe('الأداء العام');
    expect(vm.headings.subject).toBe('المادة');
    expect(vm.principal.title_label).toBe('مدير المدرسة');
  });

  it('emits Arabic detail labels', () => {
    const payload = basePayload({ language: 'ar', direction: 'rtl' });
    const vm = buildTemplateViewModel({ payload, signatureDataUrl: null });
    const labels = vm.student.details.map((d) => d.label);
    expect(labels).toContain('الاسم الكامل');
    expect(labels).toContain('رقم الطالب');
  });

  it('formats the issued date with Arabic locale but Western numerals', () => {
    const payload = basePayload({ language: 'ar', direction: 'rtl' });
    const vm = buildTemplateViewModel({ payload, signatureDataUrl: null });
    // Western numerals only — no Arabic-Indic digits (٠-٩)
    expect(vm.issued_date).not.toMatch(/[\u0660-\u0669]/);
    // Must still contain the Gregorian year
    expect(vm.issued_date).toContain('2026');
  });

  it('returns Arabic rank labels', () => {
    const payload = basePayload({ language: 'ar', direction: 'rtl' });
    payload.student.rank_badge = 1;
    const vm = buildTemplateViewModel({ payload, signatureDataUrl: null });
    expect(vm.student.rank_badge_label).toBe('الأول على الفصل');
  });
});

describe('buildTemplateViewModel — edge cases', () => {
  it('edge: handles empty subject list', () => {
    const payload = basePayload();
    payload.grades.subjects = [];
    const vm = buildTemplateViewModel({ payload, signatureDataUrl: null });
    expect(vm.has_subjects).toBe(false);
    expect(vm.subjects).toEqual([]);
  });

  it('edge: handles subject with null score and null grade', () => {
    const payload = basePayload();
    payload.grades.subjects = [
      {
        subject_id: 'sub-1',
        subject_name: 'Science',
        teacher_name: null,
        score: null,
        grade: null,
        subject_comment: '',
      },
    ];
    const vm = buildTemplateViewModel({ payload, signatureDataUrl: null });
    expect(vm.subjects[0]).toMatchObject({ mark: '—', grade: '—', grade_class: 'empty' });
  });

  it('edge: skips empty-string personal_info values', () => {
    const payload = basePayload();
    payload.student.personal_info.nationality = '';
    payload.student.personal_info.homeroom_teacher = null;
    const vm = buildTemplateViewModel({ payload, signatureDataUrl: null });
    expect(vm.student.details.find((d) => d.label === 'Nationality')).toBeUndefined();
    expect(vm.student.details.find((d) => d.label === 'Homeroom Teacher')).toBeUndefined();
  });

  it('edge: has_grading_scale false when no bands', () => {
    const payload = basePayload();
    payload.grades.grading_scale = [];
    const vm = buildTemplateViewModel({ payload, signatureDataUrl: null });
    expect(vm.has_grading_scale).toBe(false);
  });
});

describe('internal helpers', () => {
  it('escapeHtml escapes angle brackets, quotes and ampersands', () => {
    expect(__test__.escapeHtml('a & <b> "c" \'d\'')).toBe(
      'a &amp; &lt;b&gt; &quot;c&quot; &#39;d&#39;',
    );
  });

  it('formatPercent handles finite numbers and nulls', () => {
    expect(__test__.formatPercent(87.42)).toBe('87.4%');
    expect(__test__.formatPercent(null)).toBe('—');
    expect(__test__.formatPercent(Number.NaN)).toBe('—');
  });

  it('gradeClass maps letters to css classes', () => {
    expect(__test__.gradeClass('A')).toBe('a');
    expect(__test__.gradeClass('A-')).toBe('a');
    expect(__test__.gradeClass('B+')).toBe('b');
    expect(__test__.gradeClass('C')).toBe('c');
    expect(__test__.gradeClass('D')).toBe('d');
    expect(__test__.gradeClass('F')).toBe('f');
    expect(__test__.gradeClass(null)).toBe('empty');
  });
});
