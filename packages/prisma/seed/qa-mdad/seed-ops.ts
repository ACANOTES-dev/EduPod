import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import {
  FoundationResult,
  PeopleResult,
  ClassesResult,
  ClassInfo,
  SUBJECTS_BY_YEAR,
  PERIODS_PER_WEEK,
  getTier,
  FEES_BY_YEAR,
} from './types';
import {
  pickMaleName,
  pickFemaleName,
  pickFamilyName,
} from './names';

// ─── Helpers ────────────────────────────────────────────────────────────────

function time(hh: string, mm: string): Date {
  return new Date(`1970-01-01T${hh}:${mm}:00.000Z`);
}

function date(iso: string): Date {
  return new Date(iso);
}

/** Chunk an array into batches of size `n` */
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) {
    out.push(arr.slice(i, i + n));
  }
  return out;
}

/** Deterministic pseudo-random day offset within a range */
function pseudoDay(seed: number, maxDays: number): number {
  return ((seed * 17 + 31) % maxDays);
}

// ─── Period Template Arabic Names ───────────────────────────────────────────

const PERIOD_NAME_AR: Record<string, string> = {
  'Registration': 'التسجيل',
  'Period 1': 'الحصة 1',
  'Period 2': 'الحصة 2',
  'Period 3': 'الحصة 3',
  'Period 4': 'الحصة 4',
  'Period 5': 'الحصة 5',
  'Period 6': 'الحصة 6',
  'Morning Break': 'استراحة الصباح',
  'Lunch': 'الغداء',
  'Assembly': 'الطابور',
};

// ════════════════════════════════════════════════════════════════════════════
// Function 1: seedSchedule
// ════════════════════════════════════════════════════════════════════════════

export async function seedSchedule(
  prisma: PrismaClient,
  tenantId: string,
  foundation: FoundationResult,
  people: PeopleResult,
  classes: ClassesResult,
): Promise<void> {
  console.log('  [schedule] Creating period templates...');

  const ayId = foundation.academicYearId;

  // ─── A) Period Templates (45 total) ────────────────────────────────────

  type SlotDef = { name: string; start: [string, string]; end: [string, string]; type: string; order: number };

  const monThuSlots: SlotDef[] = [
    { name: 'Registration', start: ['08', '30'], end: ['08', '45'], type: 'assembly', order: 0 },
    { name: 'Period 1', start: ['08', '45'], end: ['09', '45'], type: 'teaching', order: 1 },
    { name: 'Period 2', start: ['09', '45'], end: ['10', '45'], type: 'teaching', order: 2 },
    { name: 'Morning Break', start: ['10', '45'], end: ['11', '10'], type: 'break_supervision', order: 3 },
    { name: 'Period 3', start: ['11', '10'], end: ['12', '10'], type: 'teaching', order: 4 },
    { name: 'Period 4', start: ['12', '10'], end: ['13', '10'], type: 'teaching', order: 5 },
    { name: 'Lunch', start: ['13', '10'], end: ['14', '00'], type: 'lunch_duty', order: 6 },
    { name: 'Period 5', start: ['14', '00'], end: ['15', '00'], type: 'teaching', order: 7 },
    { name: 'Period 6', start: ['15', '00'], end: ['16', '00'], type: 'teaching', order: 8 },
  ];

  const fridaySlots: SlotDef[] = [
    { name: 'Assembly', start: ['08', '30'], end: ['09', '00'], type: 'assembly', order: 0 },
    { name: 'Period 1', start: ['09', '00'], end: ['10', '00'], type: 'teaching', order: 1 },
    { name: 'Period 2', start: ['10', '00'], end: ['11', '00'], type: 'teaching', order: 2 },
    { name: 'Morning Break', start: ['11', '00'], end: ['11', '25'], type: 'break_supervision', order: 3 },
    { name: 'Period 3', start: ['11', '25'], end: ['12', '25'], type: 'teaching', order: 4 },
    { name: 'Period 4', start: ['12', '25'], end: ['13', '25'], type: 'teaching', order: 5 },
    { name: 'Lunch', start: ['13', '25'], end: ['14', '15'], type: 'lunch_duty', order: 6 },
    { name: 'Period 5', start: ['14', '15'], end: ['15', '15'], type: 'teaching', order: 7 },
    { name: 'Period 6', start: ['15', '15'], end: ['16', '15'], type: 'teaching', order: 8 },
  ];

  const templateRecords: Array<Record<string, unknown>> = [];

  // Mon-Thu (weekdays 0-3)
  for (let wd = 0; wd <= 3; wd++) {
    for (const slot of monThuSlots) {
      templateRecords.push({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        academic_year_id: ayId,
        weekday: wd,
        period_name: slot.name,
        period_name_ar: PERIOD_NAME_AR[slot.name] ?? slot.name,
        period_order: slot.order,
        start_time: time(slot.start[0], slot.start[1]),
        end_time: time(slot.end[0], slot.end[1]),
        schedule_period_type: slot.type as never,
        year_group_id: null,
        supervision_mode: 'none' as never,
        break_group_id: null,
      });
    }
  }

  // Friday (weekday 4)
  for (const slot of fridaySlots) {
    templateRecords.push({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      academic_year_id: ayId,
      weekday: 4,
      period_name: slot.name,
      period_name_ar: PERIOD_NAME_AR[slot.name] ?? slot.name,
      period_order: slot.order,
      start_time: time(slot.start[0], slot.start[1]),
      end_time: time(slot.end[0], slot.end[1]),
      schedule_period_type: slot.type as never,
      year_group_id: null,
      supervision_mode: 'none' as never,
      break_group_id: null,
    });
  }

  await prisma.schedulePeriodTemplate.createMany({
    data: templateRecords as never,
    skipDuplicates: true,
  });
  console.log(`    Created ${templateRecords.length} period templates`);

  // ─── B) Curriculum Requirements (~80) ──────────────────────────────────

  console.log('  [schedule] Creating curriculum requirements...');
  const scienceLabs = new Set(['BIO', 'CHEM', 'PHY']);
  const currReqs: Array<Record<string, unknown>> = [];

  for (let yi = 0; yi < 6; yi++) {
    const ygId = foundation.yearGroupIds[yi]!;
    const tier = getTier(yi);
    const subjects = SUBJECTS_BY_YEAR[yi]!;
    for (const code of subjects) {
      const ppw = PERIODS_PER_WEEK[code]?.[tier] ?? 0;
      if (ppw === 0) continue;
      const isScience = scienceLabs.has(code);
      currReqs.push({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        academic_year_id: ayId,
        year_group_id: ygId,
        subject_id: foundation.subjectMap.get(code)!,
        min_periods_per_week: ppw,
        max_periods_per_day: 2,
        preferred_periods_per_week: ppw,
        requires_double_period: isScience,
        double_period_count: isScience ? 1 : 0,
      });
    }
  }

  await prisma.curriculumRequirement.createMany({
    data: currReqs as never,
    skipDuplicates: true,
  });
  console.log(`    Created ${currReqs.length} curriculum requirements`);

  // ─── C) Teacher Competencies (~200) ────────────────────────────────────

  console.log('  [schedule] Creating teacher competencies...');
  const competencies: Array<Record<string, unknown>> = [];

  for (const staff of people.staff) {
    if (!staff.isTeacher || staff.subjectCodes.length === 0) continue;
    for (const code of staff.subjectCodes) {
      const subjectId = foundation.subjectMap.get(code);
      if (!subjectId) continue;
      // Competent for all year groups that take this subject
      for (let yi = 0; yi < 6; yi++) {
        const subjects = SUBJECTS_BY_YEAR[yi]!;
        if (!subjects.includes(code)) continue;
        competencies.push({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          academic_year_id: ayId,
          staff_profile_id: staff.staffProfileId,
          subject_id: subjectId,
          year_group_id: foundation.yearGroupIds[yi]!,
          is_primary: true,
        });
      }
    }
  }

  for (const batch of chunk(competencies, 500)) {
    await prisma.teacherCompetency.createMany({
      data: batch as never,
      skipDuplicates: true,
    });
  }
  console.log(`    Created ${competencies.length} teacher competencies`);

  // ─── D) Staff Availability (~250) ──────────────────────────────────────

  console.log('  [schedule] Creating staff availability...');
  const availability: Array<Record<string, unknown>> = [];

  const teachers = people.staff.filter((s) => s.isTeacher);
  for (const staff of teachers) {
    const isPartTime = staff.employmentType === 'part_time';
    const days = isPartTime ? [0, 2, 4] : [0, 1, 2, 3, 4]; // Mon-Wed-Fri or all
    for (const wd of days) {
      const endHour = wd === 4 ? '16' : '16';
      const endMin = wd === 4 ? '15' : '00';
      availability.push({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        staff_profile_id: staff.staffProfileId,
        academic_year_id: ayId,
        weekday: wd,
        available_from: time('08', '30'),
        available_to: time(endHour, endMin),
      });
    }
  }

  for (const batch of chunk(availability, 500)) {
    await prisma.staffAvailability.createMany({
      data: batch as never,
      skipDuplicates: true,
    });
  }
  console.log(`    Created ${availability.length} staff availability records`);

  // ─── E) Break Groups (2) ───────────────────────────────────────────────

  console.log('  [schedule] Creating break groups...');

  const juniorBreakId = crypto.randomUUID();
  const seniorBreakId = crypto.randomUUID();

  await prisma.breakGroup.createMany({
    data: [
      {
        id: juniorBreakId,
        tenant_id: tenantId,
        academic_year_id: ayId,
        name: 'Junior Break',
        name_ar: 'استراحة المرحلة الابتدائية',
        location: 'Main Courtyard',
        required_supervisor_count: 3,
      },
      {
        id: seniorBreakId,
        tenant_id: tenantId,
        academic_year_id: ayId,
        name: 'Senior Break',
        name_ar: 'استراحة المرحلة العليا',
        location: 'Senior Quad',
        required_supervisor_count: 3,
      },
    ] as never,
    skipDuplicates: true,
  });

  // Junior: Y1-Y3, Senior: Y4-Y6
  const bgYearGroups: Array<Record<string, unknown>> = [];
  for (let yi = 0; yi < 3; yi++) {
    bgYearGroups.push({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      break_group_id: juniorBreakId,
      year_group_id: foundation.yearGroupIds[yi]!,
    });
  }
  for (let yi = 3; yi < 6; yi++) {
    bgYearGroups.push({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      break_group_id: seniorBreakId,
      year_group_id: foundation.yearGroupIds[yi]!,
    });
  }

  await prisma.breakGroupYearGroup.createMany({
    data: bgYearGroups as never,
    skipDuplicates: true,
  });
  console.log('    Created 2 break groups with 6 year-group links');
}

// ════════════════════════════════════════════════════════════════════════════
// Function 2: seedGrading
// ════════════════════════════════════════════════════════════════════════════

export async function seedGrading(
  prisma: PrismaClient,
  tenantId: string,
  foundation: FoundationResult,
  people: PeopleResult,
  classes: ClassesResult,
): Promise<void> {
  console.log('  [grading] Creating grading scale...');

  // ─── A) Grading Scale ──────────────────────────────────────────────────

  const gradingScaleId = crypto.randomUUID();
  await prisma.gradingScale.create({
    data: {
      id: gradingScaleId,
      tenant_id: tenantId,
      name: 'MDAD Standard Scale',
      config_json: {
        grades: [
          { label: 'A+', min: 97, max: 100 },
          { label: 'A', min: 93, max: 96 },
          { label: 'A-', min: 90, max: 92 },
          { label: 'B+', min: 87, max: 89 },
          { label: 'B', min: 83, max: 86 },
          { label: 'B-', min: 80, max: 82 },
          { label: 'C+', min: 77, max: 79 },
          { label: 'C', min: 73, max: 76 },
          { label: 'C-', min: 70, max: 72 },
          { label: 'D+', min: 67, max: 69 },
          { label: 'D', min: 63, max: 66 },
          { label: 'D-', min: 60, max: 62 },
          { label: 'F', min: 0, max: 59 },
        ],
      },
    },
  });

  // ─── B) Assessment Categories (5) ──────────────────────────────────────

  console.log('  [grading] Creating assessment categories...');
  const catDefs = [
    { name: 'Homework', weight: 0.15 },
    { name: 'Classwork', weight: 0.15 },
    { name: 'Quizzes', weight: 0.20 },
    { name: 'Mid-Term Exam', weight: 0.20 },
    { name: 'Final Exam', weight: 0.30 },
  ];

  const categoryIds: string[] = [];
  const categoryWeightMap: Record<string, number> = {};
  for (const cat of catDefs) {
    const catId = crypto.randomUUID();
    categoryIds.push(catId);
    categoryWeightMap[catId] = cat.weight;
  }

  await prisma.assessmentCategory.createMany({
    data: catDefs.map((cat, i) => ({
      id: categoryIds[i]!,
      tenant_id: tenantId,
      name: cat.name,
      default_weight: cat.weight,
    })) as never,
    skipDuplicates: true,
  });

  // Category lookup by name for later use
  const catByName: Record<string, string> = {};
  catDefs.forEach((cat, i) => { catByName[cat.name] = categoryIds[i]!; });

  // ─── C) ClassSubjectGradeConfig (first 50 subject classes) ─────────────

  console.log('  [grading] Creating class-subject grade configs...');
  const sampleClasses = classes.subjectClasses.slice(0, 50);
  const gradeConfigs: Array<Record<string, unknown>> = [];

  for (const sc of sampleClasses) {
    if (!sc.subjectId) continue;
    gradeConfigs.push({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      class_id: sc.id,
      subject_id: sc.subjectId,
      grading_scale_id: gradingScaleId,
      category_weight_json: categoryWeightMap,
    });
  }

  await prisma.classSubjectGradeConfig.createMany({
    data: gradeConfigs as never,
    skipDuplicates: true,
  });
  console.log(`    Created ${gradeConfigs.length} grade configs`);

  // ─── D) Assessments (~150) ─────────────────────────────────────────────

  console.log('  [grading] Creating assessments...');
  const term1Id = foundation.periodIds[0]!;
  const term2Id = foundation.periodIds[1]!;

  // Pick 30 representative subject classes for assessments
  const assessmentClasses = classes.subjectClasses.slice(0, 30);
  const assessmentRecords: Array<Record<string, unknown> & { _classInfo: ClassInfo; _catName: string }> = [];
  const allAssessmentIds: string[] = [];

  for (let ci = 0; ci < assessmentClasses.length; ci++) {
    const sc = assessmentClasses[ci]!;
    if (!sc.subjectId) continue;

    // Term 1: 3 assessments (quiz, homework, mid-term) — closed
    const t1Assessments = [
      { title: `${sc.name} - Quiz 1`, catName: 'Quizzes', status: 'closed' as const },
      { title: `${sc.name} - Homework 1`, catName: 'Homework', status: 'closed' as const },
      { title: `${sc.name} - Mid-Term`, catName: 'Mid-Term Exam', status: 'closed' as const },
    ];

    for (const a of t1Assessments) {
      const aId = crypto.randomUUID();
      allAssessmentIds.push(aId);
      assessmentRecords.push({
        id: aId,
        tenant_id: tenantId,
        class_id: sc.id,
        subject_id: sc.subjectId,
        academic_period_id: term1Id,
        category_id: catByName[a.catName]!,
        title: a.title,
        max_score: 100,
        due_date: date('2025-11-30'),
        grading_deadline: date('2025-12-10'),
        status: a.status as never,
        _classInfo: sc,
        _catName: a.catName,
      });
    }

    // Term 2: 2 assessments (quiz, classwork) — open or draft
    const t2Assessments = [
      { title: `${sc.name} - Quiz 2`, catName: 'Quizzes', status: ci % 2 === 0 ? 'open' : 'draft' },
      { title: `${sc.name} - Classwork 1`, catName: 'Classwork', status: ci % 3 === 0 ? 'open' : 'draft' },
    ];

    for (const a of t2Assessments) {
      const aId = crypto.randomUUID();
      allAssessmentIds.push(aId);
      assessmentRecords.push({
        id: aId,
        tenant_id: tenantId,
        class_id: sc.id,
        subject_id: sc.subjectId,
        academic_period_id: term2Id,
        category_id: catByName[a.catName]!,
        title: a.title,
        max_score: 100,
        due_date: date('2026-03-15'),
        grading_deadline: date('2026-03-20'),
        status: a.status as never,
        _classInfo: sc,
        _catName: a.catName,
      });
    }
  }

  // Strip internal metadata before inserting
  const assessmentInserts = assessmentRecords.map(({ _classInfo, _catName, ...rest }) => rest);

  for (const batch of chunk(assessmentInserts, 500)) {
    await prisma.assessment.createMany({
      data: batch as never,
      skipDuplicates: true,
    });
  }
  console.log(`    Created ${assessmentInserts.length} assessments`);

  // ─── E) Grades (~3000+) ────────────────────────────────────────────────

  console.log('  [grading] Creating grades...');
  const gradeRecords: Array<Record<string, unknown>> = [];

  for (let ai = 0; ai < assessmentRecords.length; ai++) {
    const aRec = assessmentRecords[ai]!;
    const isTerm1 = aRec.academic_period_id === term1Id;
    const sc = aRec._classInfo;

    // Find the teacher userId for this class
    const teacherStaff = people.staff.find((s) => s.staffProfileId === sc.teacherStaffId);
    const teacherUserId = teacherStaff?.userId ?? people.ownerUserId;

    const studentIds = sc.studentIds;

    // Term 1 closed: all students. Term 2: ~70%
    const gradedStudents = isTerm1
      ? studentIds
      : studentIds.filter((_, si) => (si * 7 + ai * 3) % 10 < 7);

    for (let si = 0; si < gradedStudents.length; si++) {
      const studentId = gradedStudents[si]!;
      const rawScore = (si * 7 + ai * 13 + 42) % 56 + 45;
      const isMissing = (si * 11 + ai * 17) % 100 < 3; // ~3%

      // Deterministic date within term
      const baseDate = isTerm1
        ? new Date('2025-10-15')
        : new Date('2026-02-15');
      const dayOffset = pseudoDay(si + ai * 100, 30);
      const enteredAt = new Date(baseDate.getTime() + dayOffset * 86400000);

      gradeRecords.push({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        assessment_id: aRec.id as string,
        student_id: studentId,
        raw_score: isMissing ? null : rawScore,
        is_missing: isMissing,
        comment: null,
        entered_by_user_id: teacherUserId,
        entered_at: enteredAt,
      });
    }
  }

  console.log(`    Inserting ${gradeRecords.length} grades in batches...`);
  for (const batch of chunk(gradeRecords, 1000)) {
    await prisma.grade.createMany({
      data: batch as never,
      skipDuplicates: true,
    });
  }
  console.log(`    Created ${gradeRecords.length} grades`);
}

// ════════════════════════════════════════════════════════════════════════════
// Function 3: seedFinance
// ════════════════════════════════════════════════════════════════════════════

export async function seedFinance(
  prisma: PrismaClient,
  tenantId: string,
  foundation: FoundationResult,
  people: PeopleResult,
  ownerUserId: string,
): Promise<void> {
  console.log('  [finance] Creating fee structures...');

  // ─── A) Fee Structures (6) ─────────────────────────────────────────────

  const feeStructureIds: string[] = [];
  const feeStructures: Array<Record<string, unknown>> = [];

  for (let yi = 0; yi < 6; yi++) {
    const fsId = crypto.randomUUID();
    feeStructureIds.push(fsId);
    feeStructures.push({
      id: fsId,
      tenant_id: tenantId,
      name: `Year ${yi + 1} Tuition`,
      year_group_id: foundation.yearGroupIds[yi]!,
      amount: FEES_BY_YEAR[yi]!,
      billing_frequency: 'term' as never,
      active: true,
    });
  }

  await prisma.feeStructure.createMany({
    data: feeStructures as never,
    skipDuplicates: true,
  });

  // ─── B) Discounts (3) ──────────────────────────────────────────────────

  console.log('  [finance] Creating discounts...');
  const siblingDiscountId = crypto.randomUUID();
  const staffChildDiscountId = crypto.randomUUID();
  const earlyPayDiscountId = crypto.randomUUID();

  await prisma.discount.createMany({
    data: [
      {
        id: siblingDiscountId,
        tenant_id: tenantId,
        name: 'Sibling Discount',
        discount_type: 'percent' as never,
        value: 10,
        active: true,
      },
      {
        id: staffChildDiscountId,
        tenant_id: tenantId,
        name: 'Staff Child Discount',
        discount_type: 'percent' as never,
        value: 25,
        active: true,
      },
      {
        id: earlyPayDiscountId,
        tenant_id: tenantId,
        name: 'Early Payment Discount',
        discount_type: 'fixed' as never,
        value: 500,
        active: true,
      },
    ] as never,
    skipDuplicates: true,
  });

  // ─── C) HouseholdFeeAssignments (750) ──────────────────────────────────

  console.log('  [finance] Creating household fee assignments...');
  const feeAssignments: Array<Record<string, unknown>> = [];

  // Track how many students per household we've seen for sibling discount
  const householdStudentOrder: Map<string, number> = new Map();

  for (const student of people.students) {
    const order = (householdStudentOrder.get(student.householdId) ?? 0) + 1;
    householdStudentOrder.set(student.householdId, order);

    const fsId = feeStructureIds[student.yearGroupIndex]!;
    const discountId = order >= 2 ? siblingDiscountId : null;

    feeAssignments.push({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      household_id: student.householdId,
      student_id: student.id,
      fee_structure_id: fsId,
      discount_id: discountId,
      effective_from: date('2025-09-01'),
      effective_to: null,
    });
  }

  for (const batch of chunk(feeAssignments, 500)) {
    await prisma.householdFeeAssignment.createMany({
      data: batch as never,
      skipDuplicates: true,
    });
  }
  console.log(`    Created ${feeAssignments.length} fee assignments`);

  // ─── D) Term 1 Invoices (~750) ─────────────────────────────────────────

  console.log('  [finance] Creating invoices & lines...');
  const invoiceRecords: Array<Record<string, unknown>> = [];
  const invoiceLineRecords: Array<Record<string, unknown>> = [];
  const invoiceMeta: Array<{
    invoiceId: string;
    householdId: string;
    total: number;
    balance: number;
    status: string;
    studentId: string;
    feeStructureId: string;
    termAmount: number;
    discountAmount: number;
  }> = [];

  for (let si = 0; si < people.students.length; si++) {
    const student = people.students[si]!;
    const annualFee = FEES_BY_YEAR[student.yearGroupIndex]!;
    const termAmount = Math.round((annualFee / 3) * 100) / 100;

    // Determine if has sibling discount
    const fa = feeAssignments[si]!;
    const hasDiscount = fa.discount_id !== null;
    const discountAmount = hasDiscount ? Math.round(termAmount * 0.10 * 100) / 100 : 0;
    const total = Math.round((termAmount - discountAmount) * 100) / 100;

    // Status distribution: ~80% paid, ~10% partially_paid, ~5% overdue, ~5% issued
    const count = people.students.length;
    const paidThreshold = Math.floor(count * 0.80);
    const partialThreshold = Math.floor(count * 0.90);
    const overdueThreshold = Math.floor(count * 0.95);
    let status: string;
    let balance: number;
    if (si < paidThreshold) {
      status = 'paid';
      balance = 0;
    } else if (si < partialThreshold) {
      status = 'partially_paid';
      balance = Math.round(total * 0.40 * 100) / 100; // 40% remaining
    } else if (si < overdueThreshold) {
      status = 'overdue';
      balance = total;
    } else {
      status = 'issued';
      balance = total;
    }

    const invoiceId = crypto.randomUUID();
    const seq = String(si + 1).padStart(4, '0');

    invoiceRecords.push({
      id: invoiceId,
      tenant_id: tenantId,
      household_id: student.householdId,
      invoice_number: `MDAD-INV-202509-${seq}`,
      status: status as never,
      issue_date: date('2025-09-01'),
      due_date: date('2025-09-30'),
      subtotal_amount: termAmount,
      discount_amount: discountAmount,
      tax_amount: 0,
      total_amount: total,
      balance_amount: balance,
      currency_code: 'AED',
      created_by_user_id: ownerUserId,
    });

    invoiceLineRecords.push({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      invoice_id: invoiceId,
      description: `Year ${student.yearGroupIndex + 1} Tuition - Term 1`,
      quantity: 1,
      unit_amount: termAmount,
      line_total: termAmount,
      student_id: student.id,
      fee_structure_id: feeStructureIds[student.yearGroupIndex]!,
      billing_period_start: date('2025-09-01'),
      billing_period_end: date('2025-12-15'),
    });

    invoiceMeta.push({
      invoiceId,
      householdId: student.householdId,
      total,
      balance,
      status,
      studentId: student.id,
      feeStructureId: feeStructureIds[student.yearGroupIndex]!,
      termAmount,
      discountAmount,
    });
  }

  for (const batch of chunk(invoiceRecords, 500)) {
    await prisma.invoice.createMany({
      data: batch as never,
      skipDuplicates: true,
    });
  }
  for (const batch of chunk(invoiceLineRecords, 500)) {
    await prisma.invoiceLine.createMany({
      data: batch as never,
      skipDuplicates: true,
    });
  }
  console.log(`    Created ${invoiceRecords.length} invoices with lines`);

  // ─── E) Payments (~680) ────────────────────────────────────────────────

  console.log('  [finance] Creating payments & allocations...');
  const paymentRecords: Array<Record<string, unknown>> = [];
  const allocationRecords: Array<Record<string, unknown>> = [];
  const paymentMeta: Array<{ paymentId: string; amount: number; householdId: string }> = [];

  for (let si = 0; si < invoiceMeta.length; si++) {
    const inv = invoiceMeta[si]!;
    if (inv.status !== 'paid' && inv.status !== 'partially_paid') continue;

    const paymentId = crypto.randomUUID();
    const payAmount = inv.status === 'paid'
      ? inv.total
      : Math.round(inv.total * 0.60 * 100) / 100;

    // Payment method distribution
    let method: string;
    if (si % 10 < 6) method = 'bank_transfer';
    else if (si % 10 < 9) method = 'card_manual';
    else method = 'cash';

    // Random received date in Sep-Oct 2025
    const dayOff = pseudoDay(si, 60);
    const receivedAt = new Date('2025-09-01T10:00:00.000Z');
    receivedAt.setDate(receivedAt.getDate() + dayOff);

    paymentRecords.push({
      id: paymentId,
      tenant_id: tenantId,
      household_id: inv.householdId,
      payment_reference: `PAY-${String(si + 1).padStart(4, '0')}`,
      payment_method: method as never,
      amount: payAmount,
      currency_code: 'AED',
      status: 'posted' as never,
      received_at: receivedAt,
      posted_by_user_id: ownerUserId,
    });

    allocationRecords.push({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      payment_id: paymentId,
      invoice_id: inv.invoiceId,
      allocated_amount: payAmount,
    });

    paymentMeta.push({ paymentId, amount: payAmount, householdId: inv.householdId });
  }

  for (const batch of chunk(paymentRecords, 500)) {
    await prisma.payment.createMany({
      data: batch as never,
      skipDuplicates: true,
    });
  }
  for (const batch of chunk(allocationRecords, 500)) {
    await prisma.paymentAllocation.createMany({
      data: batch as never,
      skipDuplicates: true,
    });
  }
  console.log(`    Created ${paymentRecords.length} payments with allocations`);

  // ─── F) Receipts ───────────────────────────────────────────────────────

  console.log('  [finance] Creating receipts...');
  const receiptRecords: Array<Record<string, unknown>> = [];

  for (let pi = 0; pi < paymentMeta.length; pi++) {
    const pm = paymentMeta[pi]!;
    receiptRecords.push({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      payment_id: pm.paymentId,
      receipt_number: `MDAD-REC-${String(pi + 1).padStart(4, '0')}`,
      template_locale: 'ar',
      issued_at: new Date('2025-10-01T12:00:00.000Z'),
      issued_by_user_id: ownerUserId,
      render_version: '1.0',
    });
  }

  for (const batch of chunk(receiptRecords, 500)) {
    await prisma.receipt.createMany({
      data: batch as never,
      skipDuplicates: true,
    });
  }
  console.log(`    Created ${receiptRecords.length} receipts`);

  // ─── G) Refunds (5) ───────────────────────────────────────────────────

  console.log('  [finance] Creating refunds...');
  const refundStatuses = [
    'executed' as const,
    'executed' as const,
    'approved' as const,
    'approved' as const,
    'pending_approval' as const,
  ];

  const refundRecords: Array<Record<string, unknown>> = [];
  for (let ri = 0; ri < 5; ri++) {
    const pm = paymentMeta[ri * 50]!; // spread them out
    const refundAmount = Math.round(pm.amount * ((ri + 1) * 0.04) * 100) / 100; // 4-20%
    const refStatus = refundStatuses[ri]!;
    refundRecords.push({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      payment_id: pm.paymentId,
      refund_reference: `MDAD-REF-${String(ri + 1).padStart(3, '0')}`,
      amount: refundAmount,
      status: refStatus as never,
      reason: `Overpayment correction #${ri + 1}`,
      requested_by_user_id: ownerUserId,
      approved_by_user_id: refStatus !== 'pending_approval' ? ownerUserId : null,
      executed_at: refStatus === 'executed' ? new Date('2025-10-15T10:00:00.000Z') : null,
    });
  }

  await prisma.refund.createMany({
    data: refundRecords as never,
    skipDuplicates: true,
  });
  console.log('    Created 5 refunds');
}

// ════════════════════════════════════════════════════════════════════════════
// Function 4: seedPayroll
// ════════════════════════════════════════════════════════════════════════════

export async function seedPayroll(
  prisma: PrismaClient,
  tenantId: string,
  people: PeopleResult,
  ownerUserId: string,
): Promise<void> {
  console.log('  [payroll] Creating staff compensations...');

  // ─── A) StaffCompensations (~68) ───────────────────────────────────────

  const compensationRecords: Array<Record<string, unknown>> = [];
  for (const staff of people.staff) {
    const isPartTime = staff.employmentType === 'part_time';
    compensationRecords.push({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      staff_profile_id: staff.staffProfileId,
      compensation_type: isPartTime ? ('per_class' as never) : ('salaried' as never),
      base_salary: isPartTime ? null : staff.monthlySalary,
      per_class_rate: isPartTime ? 150 : null,
      assigned_class_count: null,
      bonus_class_rate: null,
      bonus_day_multiplier: 1.0,
      effective_from: date('2025-09-01'),
      effective_to: null,
      created_by_user_id: ownerUserId,
    });
  }

  await prisma.staffCompensation.createMany({
    data: compensationRecords as never,
    skipDuplicates: true,
  });
  console.log(`    Created ${compensationRecords.length} compensations`);

  // ─── B) Payroll Runs (7) ───────────────────────────────────────────────

  console.log('  [payroll] Creating payroll runs...');
  const months = [
    { label: 'September 2025', month: 9, year: 2025 },
    { label: 'October 2025', month: 10, year: 2025 },
    { label: 'November 2025', month: 11, year: 2025 },
    { label: 'December 2025', month: 12, year: 2025 },
    { label: 'January 2026', month: 1, year: 2026 },
    { label: 'February 2026', month: 2, year: 2026 },
    { label: 'March 2026', month: 3, year: 2026 },
  ];

  const payrollRunIds: string[] = [];
  const payrollRunRecords: Array<Record<string, unknown>> = [];
  const staffCount = people.staff.length;

  for (let mi = 0; mi < months.length; mi++) {
    const m = months[mi]!;
    const runId = crypto.randomUUID();
    payrollRunIds.push(runId);
    const isFinalised = mi < 6; // Sep-Feb finalised, March draft

    payrollRunRecords.push({
      id: runId,
      tenant_id: tenantId,
      period_label: m.label,
      period_month: m.month,
      period_year: m.year,
      total_working_days: 22,
      status: isFinalised ? ('finalised' as never) : ('draft' as never),
      total_basic_pay: 0, // will be computed below
      total_bonus_pay: 0,
      total_pay: 0,
      headcount: staffCount,
      created_by_user_id: ownerUserId,
      finalised_by_user_id: isFinalised ? ownerUserId : null,
      finalised_at: isFinalised ? new Date(`${m.year}-${String(m.month).padStart(2, '0')}-28T10:00:00.000Z`) : null,
    });
  }

  await prisma.payrollRun.createMany({
    data: payrollRunRecords as never,
    skipDuplicates: true,
  });

  // ─── C) Payroll Entries (~476) ─────────────────────────────────────────

  console.log('  [payroll] Creating payroll entries...');
  const entryRecords: Array<Record<string, unknown>> = [];
  const finalisedEntryIds: Array<{ entryId: string; runIndex: number; staffIndex: number }> = [];

  // Compute run totals
  const runTotals: number[] = Array(months.length).fill(0);

  for (let mi = 0; mi < months.length; mi++) {
    const runId = payrollRunIds[mi]!;
    for (let si = 0; si < people.staff.length; si++) {
      const staff = people.staff[si]!;
      const isPartTime = staff.employmentType === 'part_time';
      const basicPay = isPartTime ? 150 * 20 : staff.monthlySalary; // part-time: 20 classes assumed
      const totalPay = basicPay;

      const entryId = crypto.randomUUID();
      entryRecords.push({
        id: entryId,
        tenant_id: tenantId,
        payroll_run_id: runId,
        staff_profile_id: staff.staffProfileId,
        compensation_type: isPartTime ? ('per_class' as never) : ('salaried' as never),
        snapshot_base_salary: isPartTime ? null : staff.monthlySalary,
        snapshot_per_class_rate: isPartTime ? 150 : null,
        snapshot_assigned_class_count: null,
        snapshot_bonus_class_rate: null,
        snapshot_bonus_day_multiplier: 1.0,
        days_worked: 22,
        classes_taught: isPartTime ? 20 : null,
        auto_populated_class_count: null,
        basic_pay: basicPay,
        bonus_pay: 0,
        total_pay: totalPay,
        notes: mi === 6 ? 'Pending verification' : null, // draft run has notes
      });

      runTotals[mi] = (runTotals[mi] ?? 0) + totalPay;

      // Track finalised entries for payslips
      if (mi < 6) {
        finalisedEntryIds.push({ entryId, runIndex: mi, staffIndex: si });
      }
    }
  }

  for (const batch of chunk(entryRecords, 500)) {
    await prisma.payrollEntry.createMany({
      data: batch as never,
      skipDuplicates: true,
    });
  }
  console.log(`    Created ${entryRecords.length} payroll entries`);

  // Update run totals
  for (let mi = 0; mi < months.length; mi++) {
    await prisma.payrollRun.update({
      where: { id: payrollRunIds[mi]! },
      data: {
        total_basic_pay: runTotals[mi]!,
        total_pay: runTotals[mi]!,
      },
    });
  }

  // ─── D) Payslips (~408) ────────────────────────────────────────────────

  console.log('  [payroll] Creating payslips...');
  const payslipRecords: Array<Record<string, unknown>> = [];

  for (let ei = 0; ei < finalisedEntryIds.length; ei++) {
    const { entryId, runIndex } = finalisedEntryIds[ei]!;
    const m = months[runIndex]!;
    const seq = String(ei + 1).padStart(4, '0');
    const yyyymm = `${m.year}${String(m.month).padStart(2, '0')}`;

    payslipRecords.push({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      payroll_entry_id: entryId,
      payslip_number: `MDAD-PS-${yyyymm}-${seq}`,
      template_locale: 'ar',
      issued_at: new Date(`${m.year}-${String(m.month).padStart(2, '0')}-28T12:00:00.000Z`),
      issued_by_user_id: ownerUserId,
      snapshot_payload_json: {},
      render_version: '1.0',
    });
  }

  for (const batch of chunk(payslipRecords, 500)) {
    await prisma.payslip.createMany({
      data: batch as never,
      skipDuplicates: true,
    });
  }
  console.log(`    Created ${payslipRecords.length} payslips`);
}

// ════════════════════════════════════════════════════════════════════════════
// Function 5: seedAttendance
// ════════════════════════════════════════════════════════════════════════════

export async function seedAttendance(
  prisma: PrismaClient,
  tenantId: string,
  foundation: FoundationResult,
  people: PeopleResult,
  classes: ClassesResult,
): Promise<void> {
  console.log('  [attendance] Creating attendance sessions & records...');

  // Pick 2 homeroom classes: first one (Y1A) and last one (Y6E)
  const homeroomY1A = classes.homerooms.find((h) => h.name.includes('Y1') && h.sectionIndex === 0);
  const homeroomY6E = classes.homerooms.find((h) => h.name.includes('Y6') && h.sectionIndex === 4);
  const selectedHomerooms = [homeroomY1A, homeroomY6E].filter(Boolean) as ClassInfo[];

  if (selectedHomerooms.length === 0) {
    console.log('    No homerooms found, skipping attendance');
    return;
  }

  // Generate school dates (skip weekends: Sat=6, Sun=0 in UAE schedule — actually, UAE weekend is Sat+Sun)
  // For UAE schools, weekend is typically Sat-Sun. School days Mon-Fri.
  function getSchoolDates(start: string, count: number): Date[] {
    const dates: Date[] = [];
    const d = new Date(start);
    while (dates.length < count) {
      const dow = d.getDay(); // 0=Sun, 6=Sat
      if (dow >= 1 && dow <= 5) { // Mon-Fri
        dates.push(new Date(d));
      }
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }

  // Term 1: 10 school days starting Sep 1 2025
  const term1Dates = getSchoolDates('2025-09-01', 10);
  // Term 2: 5 school days starting Jan 6 2026
  const term2Dates = getSchoolDates('2026-01-06', 5);

  const sessionRecords: Array<Record<string, unknown>> = [];
  const attendanceRecords: Array<Record<string, unknown>> = [];

  const statusDistribution = (studentIndex: number): string => {
    const mod = studentIndex % 100;
    if (mod < 90) return 'present';
    if (mod < 95) return 'absent_unexcused';
    if (mod < 98) return 'late';
    return 'absent_excused';
  };

  for (const homeroom of selectedHomerooms) {
    // Find the homeroom teacher
    const teacherStaff = people.staff.find((s) => s.staffProfileId === homeroom.teacherStaffId);
    const teacherUserId = teacherStaff?.userId ?? people.ownerUserId;

    // Term 1 sessions
    for (const sessionDate of term1Dates) {
      const sessionId = crypto.randomUUID();
      sessionRecords.push({
        id: sessionId,
        tenant_id: tenantId,
        class_id: homeroom.id,
        schedule_id: null,
        session_date: sessionDate,
        status: 'submitted' as never,
        override_reason: null,
        submitted_by_user_id: teacherUserId,
        submitted_at: sessionDate,
      });

      // Records for all 25 students
      for (let si = 0; si < homeroom.studentIds.length; si++) {
        const studentId = homeroom.studentIds[si]!;
        const recStatus = statusDistribution(si + sessionDate.getDate());
        attendanceRecords.push({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          attendance_session_id: sessionId,
          student_id: studentId,
          status: recStatus as never,
          reason: recStatus === 'absent_excused' ? 'Medical appointment' : null,
          marked_by_user_id: teacherUserId,
          marked_at: sessionDate,
        });
      }
    }

    // Term 2 sessions
    for (const sessionDate of term2Dates) {
      const sessionId = crypto.randomUUID();
      sessionRecords.push({
        id: sessionId,
        tenant_id: tenantId,
        class_id: homeroom.id,
        schedule_id: null,
        session_date: sessionDate,
        status: 'open' as never,
        override_reason: null,
        submitted_by_user_id: teacherUserId,
        submitted_at: null,
      });

      for (let si = 0; si < homeroom.studentIds.length; si++) {
        const studentId = homeroom.studentIds[si]!;
        const recStatus = statusDistribution(si + sessionDate.getDate() + 50);
        attendanceRecords.push({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          attendance_session_id: sessionId,
          student_id: studentId,
          status: recStatus as never,
          reason: recStatus === 'absent_excused' ? 'Family emergency' : null,
          marked_by_user_id: teacherUserId,
          marked_at: sessionDate,
        });
      }
    }
  }

  for (const batch of chunk(sessionRecords, 500)) {
    await prisma.attendanceSession.createMany({
      data: batch as never,
      skipDuplicates: true,
    });
  }
  for (const batch of chunk(attendanceRecords, 500)) {
    await prisma.attendanceRecord.createMany({
      data: batch as never,
      skipDuplicates: true,
    });
  }
  console.log(`    Created ${sessionRecords.length} sessions, ${attendanceRecords.length} attendance records`);
}

// ════════════════════════════════════════════════════════════════════════════
// Function 6: seedExtras
// ════════════════════════════════════════════════════════════════════════════

export async function seedExtras(
  prisma: PrismaClient,
  tenantId: string,
  foundation: FoundationResult,
  people: PeopleResult,
  ownerUserId: string,
): Promise<void> {
  // ─── A) School Closures (8) ────────────────────────────────────────────

  console.log('  [extras] Creating school closures...');
  await prisma.schoolClosure.createMany({
    data: [
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        closure_date: date('2025-12-02'),
        reason: 'UAE National Day',
        affects_scope: 'all' as never,
        scope_entity_id: null,
        created_by_user_id: ownerUserId,
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        closure_date: date('2025-12-20'),
        reason: 'Winter Break begins',
        affects_scope: 'all' as never,
        scope_entity_id: null,
        created_by_user_id: ownerUserId,
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        closure_date: date('2025-12-25'),
        reason: 'Winter Holiday',
        affects_scope: 'all' as never,
        scope_entity_id: null,
        created_by_user_id: ownerUserId,
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        closure_date: date('2026-01-01'),
        reason: 'New Year',
        affects_scope: 'all' as never,
        scope_entity_id: null,
        created_by_user_id: ownerUserId,
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        closure_date: date('2026-03-30'),
        reason: 'Eid Al-Fitr',
        affects_scope: 'all' as never,
        scope_entity_id: null,
        created_by_user_id: ownerUserId,
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        closure_date: date('2025-10-15'),
        reason: 'Teacher PD Day',
        affects_scope: 'all' as never,
        scope_entity_id: null,
        created_by_user_id: ownerUserId,
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        closure_date: date('2025-11-20'),
        reason: 'Building Maintenance',
        affects_scope: 'year_group' as never,
        scope_entity_id: foundation.yearGroupIds[2]!, // Year 3
        created_by_user_id: ownerUserId,
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        closure_date: date('2025-11-21'),
        reason: 'Building Maintenance - Day 2',
        affects_scope: 'year_group' as never,
        scope_entity_id: foundation.yearGroupIds[2]!,
        created_by_user_id: ownerUserId,
      },
    ] as never,
    skipDuplicates: true,
  });
  console.log('    Created 8 school closures');

  // ─── B) Approval Workflows (5) ─────────────────────────────────────────

  console.log('  [extras] Creating approval workflows...');

  // Look up the school_owner role for this tenant
  const ownerRole = await prisma.role.findFirst({
    where: { tenant_id: tenantId, role_key: 'school_principal' },
  });

  if (ownerRole) {
    const actionTypes: Array<string> = [
      'announcement_publish',
      'invoice_issue',
      'application_accept',
      'payment_refund',
      'payroll_finalise',
    ];

    await prisma.approvalWorkflow.createMany({
      data: actionTypes.map((at) => ({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        action_type: at as never,
        approver_role_id: ownerRole.id,
        is_enabled: true,
      })) as never,
      skipDuplicates: true,
    });
    console.log('    Created 5 approval workflows');
  } else {
    console.log('    WARNING: school_owner role not found, skipping approval workflows');
  }

  // ─── C) Admission Form (1) ────────────────────────────────────────────

  console.log('  [extras] Creating admission form...');
  const formId = crypto.randomUUID();

  await prisma.admissionFormDefinition.create({
    data: {
      id: formId,
      tenant_id: tenantId,
      name: '2025-2026 Admissions Form',
      version_number: 1,
      status: 'published' as never,
    },
  });

  const fieldDefs = [
    { key: 'student_first_name', label: 'Student First Name', type: 'short_text', required: true },
    { key: 'student_last_name', label: 'Student Last Name', type: 'short_text', required: true },
    { key: 'date_of_birth', label: 'Date of Birth', type: 'date', required: true },
    { key: 'gender', label: 'Gender', type: 'single_select', required: true, options: ['Male', 'Female'] },
    { key: 'previous_school', label: 'Previous School', type: 'short_text', required: false },
    { key: 'parent_name', label: 'Parent/Guardian Name', type: 'short_text', required: true },
    { key: 'parent_email', label: 'Parent Email', type: 'email', required: true },
    { key: 'parent_phone', label: 'Parent Phone', type: 'phone', required: true },
    { key: 'medical_conditions', label: 'Medical Conditions', type: 'long_text', required: false },
    { key: 'allergies', label: 'Any Allergies?', type: 'yes_no', required: false },
    { key: 'preferred_year_group', label: 'Preferred Year Group', type: 'single_select', required: false, options: ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6'] },
    { key: 'additional_notes', label: 'Additional Notes', type: 'long_text', required: false },
  ];

  await prisma.admissionFormField.createMany({
    data: fieldDefs.map((f, i) => ({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      form_definition_id: formId,
      field_key: f.key,
      label: f.label,
      field_type: f.type as never,
      required: f.required,
      visible_to_parent: true,
      visible_to_staff: true,
      searchable: f.required,
      reportable: f.required,
      options_json: 'options' in f ? f.options : null,
      display_order: i + 1,
      active: true,
    })) as never,
    skipDuplicates: true,
  });
  console.log('    Created admission form with 12 fields');

  // ─── D) Applications (15) ─────────────────────────────────────────────

  console.log('  [extras] Creating applications...');
  const appStatuses: Array<{ status: string; count: number }> = [
    { status: 'draft', count: 3 },
    { status: 'submitted', count: 4 },
    { status: 'under_review', count: 3 },
    { status: 'accepted', count: 2 },
    { status: 'rejected', count: 2 },
    { status: 'withdrawn', count: 1 },
  ];

  const applicationRecords: Array<Record<string, unknown>> = [];
  let appSeq = 0;

  for (const { status, count } of appStatuses) {
    for (let i = 0; i < count; i++) {
      appSeq++;
      const isMale = appSeq % 2 === 0;
      const firstName = isMale ? pickMaleName(appSeq + 200) : pickFemaleName(appSeq + 200);
      const lastName = pickFamilyName(appSeq + 200);

      applicationRecords.push({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        form_definition_id: formId,
        application_number: `MDAD-APP-202509-${String(appSeq).padStart(4, '0')}`,
        submitted_by_parent_id: null,
        student_first_name: firstName,
        student_last_name: lastName,
        date_of_birth: date(`${2019 - (appSeq % 6)}-${String((appSeq % 12) + 1).padStart(2, '0')}-15`),
        status: status as never,
        submitted_at: status !== 'draft' ? new Date('2025-08-15T10:00:00.000Z') : null,
        reviewed_at: ['accepted', 'rejected'].includes(status) ? new Date('2025-09-10T10:00:00.000Z') : null,
        reviewed_by_user_id: ['accepted', 'rejected'].includes(status) ? ownerUserId : null,
        payload_json: {
          student_first_name: firstName,
          student_last_name: lastName,
          parent_name: `${pickMaleName(appSeq + 300)} ${lastName}`,
          parent_email: `parent.${lastName.toLowerCase().replace(/[^a-z]/g, '')}${appSeq}@example.com`,
          parent_phone: `+971-50-${String(1000000 + appSeq).slice(-7)}`,
          preferred_year_group: `Year ${(appSeq % 6) + 1}`,
          gender: isMale ? 'Male' : 'Female',
        },
      });
    }
  }

  await prisma.application.createMany({
    data: applicationRecords as never,
    skipDuplicates: true,
  });
  console.log(`    Created ${applicationRecords.length} applications`);

  // ─── E) Announcements (5) ─────────────────────────────────────────────

  console.log('  [extras] Creating announcements...');
  const y6Id = foundation.yearGroupIds[5]!;

  await prisma.announcement.createMany({
    data: [
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        title: 'Welcome Back to the 2025-2026 Academic Year',
        body_html: '<p>Dear parents and students, welcome back to MDAD Academy for the 2025-2026 academic year. We look forward to an excellent year of learning and growth.</p>',
        status: 'published' as never,
        scope: 'school' as never,
        target_payload: {},
        published_at: new Date('2025-09-01T08:00:00.000Z'),
        author_user_id: ownerUserId,
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        title: 'Term 2 Schedule Update',
        body_html: '<p>Please note the updated schedule for Term 2 beginning January 6, 2026. All students are expected to arrive by 8:15am.</p>',
        status: 'published' as never,
        scope: 'school' as never,
        target_payload: {},
        published_at: new Date('2026-01-06T08:00:00.000Z'),
        author_user_id: ownerUserId,
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        title: 'Year 6 Exam Preparation Information',
        body_html: '<p>Year 6 students: your final exams begin March 15. Revision materials are available in the school portal. Study groups will be held after school Tuesdays and Thursdays.</p>',
        status: 'published' as never,
        scope: 'year_group' as never,
        target_payload: { year_group_id: y6Id },
        published_at: new Date('2026-02-15T08:00:00.000Z'),
        author_user_id: ownerUserId,
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        title: 'Annual Sports Day',
        body_html: '<p>Join us for MDAD Academy Annual Sports Day on April 15, 2026. All students will participate in inter-house competitions.</p>',
        status: 'scheduled' as never,
        scope: 'school' as never,
        target_payload: {},
        scheduled_publish_at: new Date('2026-04-15T08:00:00.000Z'),
        author_user_id: ownerUserId,
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        title: 'Parent-Teacher Evening Invitation',
        body_html: '<p>We are pleased to invite all parents to our Parent-Teacher Evening. More details to follow regarding scheduling.</p>',
        status: 'draft' as never,
        scope: 'school' as never,
        target_payload: {},
        author_user_id: ownerUserId,
      },
    ] as never,
    skipDuplicates: true,
  });
  console.log('    Created 5 announcements');

  // ─── F) Parent Inquiries (10) ─────────────────────────────────────────

  console.log('  [extras] Creating parent inquiries...');

  // We need parent records (not just user ids). Look up parents via prisma.
  const parentRecords = await prisma.parent.findMany({
    where: { tenant_id: tenantId, user_id: { not: null } },
    select: { id: true, user_id: true },
    take: 10,
  });

  if (parentRecords.length > 0) {
    const inquirySubjects = [
      'Homework concern',
      'Bus schedule question',
      'Medical note update',
      'Request for extra tutoring',
      'Lunch menu inquiry',
      'Sports team tryout schedule',
      'Library book policy',
      'Uniform purchase query',
      'After-school club question',
      'Report card clarification',
    ];
    const inquiryStatuses = ['open', 'open', 'open', 'open', 'in_progress', 'in_progress', 'in_progress', 'closed', 'closed', 'closed'];

    const inquiryRecords: Array<Record<string, unknown>> = [];
    const messageRecords: Array<Record<string, unknown>> = [];

    for (let qi = 0; qi < Math.min(10, parentRecords.length); qi++) {
      const parent = parentRecords[qi]!;
      const inquiryId = crypto.randomUUID();

      inquiryRecords.push({
        id: inquiryId,
        tenant_id: tenantId,
        parent_id: parent.id,
        student_id: null,
        subject: inquirySubjects[qi]!,
        status: inquiryStatuses[qi] as never,
      });

      // 1-3 messages per inquiry
      const msgCount = (qi % 3) + 1;
      for (let mi = 0; mi < msgCount; mi++) {
        const isFromParent = mi % 2 === 0;
        messageRecords.push({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          inquiry_id: inquiryId,
          author_type: isFromParent ? ('parent' as never) : ('admin' as never),
          author_user_id: isFromParent ? parent.user_id! : ownerUserId,
          message: isFromParent
            ? `Hello, I have a question about ${inquirySubjects[qi]!.toLowerCase()}. Could you please assist?`
            : 'Thank you for reaching out. We will look into this and get back to you shortly.',
        });
      }
    }

    await prisma.parentInquiry.createMany({
      data: inquiryRecords as never,
      skipDuplicates: true,
    });
    await prisma.parentInquiryMessage.createMany({
      data: messageRecords as never,
      skipDuplicates: true,
    });
    console.log(`    Created ${inquiryRecords.length} inquiries with ${messageRecords.length} messages`);
  } else {
    console.log('    No parents found, skipping inquiries');
  }

  // ─── G) Website Pages (4) ─────────────────────────────────────────────

  console.log('  [extras] Creating website pages...');
  await prisma.websitePage.createMany({
    data: [
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        locale: 'en',
        page_type: 'home' as never,
        slug: '/',
        title: 'Welcome to MDAD Academy',
        meta_title: 'MDAD Academy - Excellence in Education',
        meta_description: 'MDAD Academy provides world-class education for students in the UAE.',
        body_html: '<h1>Welcome to MDAD Academy</h1><p>Nurturing minds, building futures. MDAD Academy is dedicated to providing an outstanding education in a supportive bilingual environment.</p>',
        status: 'published' as never,
        show_in_nav: true,
        nav_order: 1,
        author_user_id: ownerUserId,
        published_at: new Date('2025-08-01T10:00:00.000Z'),
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        locale: 'en',
        page_type: 'about' as never,
        slug: '/about',
        title: 'About MDAD Academy',
        meta_title: 'About Us - MDAD Academy',
        meta_description: 'Learn about MDAD Academy, our mission, vision and values.',
        body_html: '<h1>About Us</h1><p>MDAD Academy was established with a vision to provide excellent education that combines modern pedagogical approaches with traditional values.</p>',
        status: 'published' as never,
        show_in_nav: true,
        nav_order: 2,
        author_user_id: ownerUserId,
        published_at: new Date('2025-08-01T10:00:00.000Z'),
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        locale: 'en',
        page_type: 'admissions' as never,
        slug: '/admissions',
        title: 'Admissions',
        meta_title: 'Admissions - MDAD Academy',
        meta_description: 'Apply to MDAD Academy. Learn about our admissions process and requirements.',
        body_html: '<h1>Admissions</h1><p>We welcome applications for all year groups. Our admissions process is designed to be straightforward and transparent.</p>',
        status: 'published' as never,
        show_in_nav: true,
        nav_order: 3,
        author_user_id: ownerUserId,
        published_at: new Date('2025-08-01T10:00:00.000Z'),
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        locale: 'en',
        page_type: 'contact' as never,
        slug: '/contact',
        title: 'Contact Us',
        meta_title: 'Contact - MDAD Academy',
        meta_description: 'Get in touch with MDAD Academy.',
        body_html: '<h1>Contact Us</h1><p>We are happy to hear from you. Reach out via phone, email, or visit us in person.</p><p>Email: info@mdad.academy</p><p>Phone: +971-4-123-4567</p>',
        status: 'published' as never,
        show_in_nav: true,
        nav_order: 4,
        author_user_id: ownerUserId,
        published_at: new Date('2025-08-01T10:00:00.000Z'),
      },
    ] as never,
    skipDuplicates: true,
  });
  console.log('    Created 4 website pages');

  // ─── H) Contact Form Submissions (5) ──────────────────────────────────

  console.log('  [extras] Creating contact form submissions...');
  const contactStatuses = ['new_submission', 'new_submission', 'reviewed', 'reviewed', 'closed'];
  const contactSubmissions = [
    { name: 'Fatima Al-Rashid', email: 'fatima.rashid@example.com', message: 'I would like to inquire about enrolment for Year 3. What are the admission requirements?' },
    { name: 'Omar Khalil', email: 'omar.khalil@example.com', message: 'Could you provide information about the school transportation services?' },
    { name: 'Sara Al-Mansour', email: 'sara.mansour@example.com', message: 'I am interested in visiting the school. Can I schedule a campus tour?' },
    { name: 'Ahmed Ibrahim', email: 'ahmed.ibrahim@example.com', message: 'Do you offer scholarship programmes for outstanding students?' },
    { name: 'Layla Al-Hamdan', email: 'layla.hamdan@example.com', message: 'What extracurricular activities are available for Year 5 students?' },
  ];

  await prisma.contactFormSubmission.createMany({
    data: contactSubmissions.map((cs, i) => ({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      name: cs.name,
      email: cs.email,
      phone: `+971-50-${String(5550000 + i).slice(-7)}`,
      message: cs.message,
      status: contactStatuses[i] as never,
    })) as never,
    skipDuplicates: true,
  });
  console.log('    Created 5 contact form submissions');
}
