/**
 * Shared helper for P5 (Gradebook) e2e tests.
 * Creates all prerequisite data: academic year, period, subject, class,
 * students, teacher, grading scale, assessment categories, grade config,
 * and an open assessment.
 */
import { INestApplication } from '@nestjs/common';

import {
  allocateAcademicYearBase,
  authGet,
  authPatch,
  authPost,
  authPut,
  AL_NOOR_DOMAIN,
  CEDAR_DOMAIN,
} from './helpers';

// ─── Al Noor Test Data ──────────────────────────────────────────────────────

export interface P5TestData {
  academicYearId: string;
  academicPeriodId: string;
  classId: string;
  subjectId: string;
  studentId: string;
  studentId2: string;
  householdId: string;
  teacherStaffProfileId: string;
  gradingScaleId: string;
  categoryHomeworkId: string;
  categoryExamsId: string;
  gradeConfigId: string;
  assessmentId: string;
  /** Base year for the academic year (e.g., 3456). The year runs from baseYear-09-01 to (baseYear+1)-06-30. */
  baseYear: number;
  /** Helper to generate a date string within the academic year range. Month 1-12, day 1-28. */
  dateInYear: (month: number, day: number) => string;
}

/**
 * Set up all data required for P5 gradebook e2e tests in the Al Noor tenant.
 */
export async function setupP5TestData(
  app: INestApplication,
  adminToken: string,
): Promise<P5TestData> {
  const ts = Date.now();
  let baseYear = allocateAcademicYearBase();

  const dateInYear = (month: number, day: number): string => {
    // Months 9-12 are in baseYear, months 1-6 are in baseYear+1
    const year = month >= 9 ? baseYear : baseYear + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // 1. Create academic year
  let academicYearId: string | undefined;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const ayRes = await authPost(
      app,
      '/api/v1/academic-years',
      adminToken,
      {
        name: `P5 Test Year ${ts}-${baseYear}`,
        start_date: `${baseYear}-09-01`,
        end_date: `${baseYear + 1}-06-30`,
        status: 'active',
      },
      AL_NOOR_DOMAIN,
    );

    if (ayRes.status === 201) {
      academicYearId = ayRes.body.data.id as string;
      break;
    }

    if (ayRes.status !== 409) {
      throw new Error(`Failed to create academic year: ${JSON.stringify(ayRes.body)}`);
    }

    baseYear += 2;
  }

  if (!academicYearId) {
    throw new Error('Failed to create a non-overlapping academic year for P5 test data');
  }

  // 2. Create academic period within the year
  const apRes = await authPost(
    app,
    `/api/v1/academic-years/${academicYearId}/periods`,
    adminToken,
    {
      name: `P5 Term 1 ${ts}`,
      period_type: 'term',
      start_date: dateInYear(9, 1),
      end_date: dateInYear(12, 20),
      status: 'active',
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const academicPeriodId = apRes.body.data.id;

  // 3. Create subject with subject_type: 'academic'
  const subRes = await authPost(
    app,
    '/api/v1/subjects',
    adminToken,
    {
      name: `P5 Mathematics ${ts}`,
      code: `MATH-${ts}`,
      subject_type: 'academic',
      active: true,
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const subjectId = subRes.body.data.id;

  // 3b. Create year group (required for class creation)
  const ygRes = await authPost(
    app,
    '/api/v1/year-groups',
    adminToken,
    {
      name: `P5 Year Group ${ts}`,
      display_order: 1,
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const yearGroupId = ygRes.body.data.id;

  // 4. Create class linked to the academic year
  const classRes = await authPost(
    app,
    '/api/v1/classes',
    adminToken,
    {
      academic_year_id: academicYearId,
      year_group_id: yearGroupId,
      name: `P5 Test Class ${ts}`,
      max_capacity: 30,
      class_type: 'floating',
      status: 'active',
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const classId = classRes.body.data.id;

  // 5. Find teacher staff profile
  const staffRes = await authGet(
    app,
    '/api/v1/staff-profiles?page=1&pageSize=50',
    adminToken,
    AL_NOOR_DOMAIN,
  ).expect(200);
  const teacherProfile = staffRes.body.data.find((s: Record<string, unknown>) => {
    const user = s['user'] as Record<string, string> | undefined;
    return user?.email === 'teacher@alnoor.test';
  });
  const teacherStaffProfileId = teacherProfile?.id as string;

  // 6. Assign teacher to class
  if (teacherStaffProfileId) {
    const assignRes = await authPost(
      app,
      `/api/v1/classes/${classId}/staff`,
      adminToken,
      {
        staff_profile_id: teacherStaffProfileId,
        assignment_role: 'teacher',
      },
      AL_NOOR_DOMAIN,
    );
    if (assignRes.status !== 201 && assignRes.status !== 409) {
      throw new Error(`Failed to assign teacher to class: ${JSON.stringify(assignRes.body)}`);
    }
  }

  // 7. Create a household for students
  const hhRes = await authPost(
    app,
    '/api/v1/households',
    adminToken,
    {
      household_name: `P5 Test Family ${ts}`,
      emergency_contacts: [
        { contact_name: 'Emergency Contact', phone: '+971501234567', display_order: 1 },
      ],
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const householdId = hhRes.body.data.id;

  // 8. Create first student
  const student1Res = await authPost(
    app,
    '/api/v1/students',
    adminToken,
    {
      household_id: householdId,
      first_name: 'P5Alice',
      last_name: `Student${ts}`,
      date_of_birth: '2015-03-10',
      gender: 'female',
      national_id: `NID-A-${ts}`,
      nationality: 'Irish',
      status: 'active',
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const studentId = student1Res.body.data.id;

  // 9. Create second student (same household for cross-student testing)
  const student2Res = await authPost(
    app,
    '/api/v1/students',
    adminToken,
    {
      household_id: householdId,
      first_name: 'P5Bob',
      last_name: `Student${ts}`,
      date_of_birth: '2016-07-22',
      gender: 'male',
      national_id: `NID-B-${ts}`,
      nationality: 'Irish',
      status: 'active',
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const studentId2 = student2Res.body.data.id;

  // 10. Enrol both students in the class
  await authPost(
    app,
    `/api/v1/classes/${classId}/enrolments`,
    adminToken,
    { student_id: studentId, start_date: dateInYear(9, 1) },
    AL_NOOR_DOMAIN,
  ).expect(201);

  await authPost(
    app,
    `/api/v1/classes/${classId}/enrolments`,
    adminToken,
    { student_id: studentId2, start_date: dateInYear(9, 1) },
    AL_NOOR_DOMAIN,
  ).expect(201);

  // 11. Create grading scale (numeric: 0-59=F, 60-79=C, 80-89=B, 90-100=A)
  const scaleRes = await authPost(
    app,
    '/api/v1/gradebook/grading-scales',
    adminToken,
    {
      name: `P5 Numeric Scale ${ts}`,
      config_json: {
        type: 'numeric',
        ranges: [
          { min: 0, max: 59, label: 'F', gpa_value: 0 },
          { min: 60, max: 79, label: 'C', gpa_value: 2 },
          { min: 80, max: 89, label: 'B', gpa_value: 3 },
          { min: 90, max: 100, label: 'A', gpa_value: 4 },
        ],
        passing_threshold: 60,
      },
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const gradingScaleId = scaleRes.body.data.id;

  // 12. Create assessment categories: Homework (weight 40) and Exams (weight 60)
  const catHwRes = await authPost(
    app,
    '/api/v1/gradebook/assessment-categories',
    adminToken,
    {
      name: `Homework ${ts}`,
      default_weight: 40,
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const categoryHomeworkId = catHwRes.body.data.id;

  const catExRes = await authPost(
    app,
    '/api/v1/gradebook/assessment-categories',
    adminToken,
    {
      name: `Exams ${ts}`,
      default_weight: 60,
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const categoryExamsId = catExRes.body.data.id;

  // 13. Set up grade config linking scale + categories to class+subject
  const gcRes = await authPut(
    app,
    `/api/v1/gradebook/classes/${classId}/subjects/${subjectId}/grade-config`,
    adminToken,
    {
      grading_scale_id: gradingScaleId,
      category_weight_json: {
        weights: [
          { category_id: categoryHomeworkId, weight: 40 },
          { category_id: categoryExamsId, weight: 60 },
        ],
      },
    },
    AL_NOOR_DOMAIN,
  );
  if (gcRes.status !== 200 && gcRes.status !== 201) {
    throw new Error(`Failed to upsert grade config: ${JSON.stringify(gcRes.body)}`);
  }
  const gradeConfigId = gcRes.body.data.id;

  // 14. Create assessment (draft status initially)
  const asmtRes = await authPost(
    app,
    '/api/v1/gradebook/assessments',
    adminToken,
    {
      class_id: classId,
      subject_id: subjectId,
      academic_period_id: academicPeriodId,
      category_id: categoryHomeworkId,
      title: `P5 Homework 1 ${ts}`,
      max_score: 100,
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const assessmentId = asmtRes.body.data.id;

  // 15. Open the assessment (transition from draft → open)
  await authPatch(
    app,
    `/api/v1/gradebook/assessments/${assessmentId}/status`,
    adminToken,
    { status: 'open' },
    AL_NOOR_DOMAIN,
  ).expect(200);

  return {
    academicYearId,
    academicPeriodId,
    classId,
    subjectId,
    studentId,
    studentId2,
    householdId,
    teacherStaffProfileId,
    gradingScaleId,
    categoryHomeworkId,
    categoryExamsId,
    gradeConfigId,
    assessmentId,
    baseYear,
    dateInYear,
  };
}

// ─── Cedar Tenant Test Data (for RLS cross-tenant testing) ──────────────────

export interface CedarP5TestData {
  academicYearId: string;
  academicPeriodId: string;
  classId: string;
  subjectId: string;
  studentId: string;
  householdId: string;
  gradingScaleId: string;
  categoryId: string;
  gradeConfigId: string;
  assessmentId: string;
}

/**
 * Set up minimal gradebook data in the Cedar tenant for RLS leakage tests.
 * Creates: academic year, period, subject, class, student, grading scale,
 * one category, grade config, and one open assessment.
 */
export async function setupCedarP5TestData(
  app: INestApplication,
  cedarAdminToken: string,
): Promise<CedarP5TestData> {
  const ts = Date.now();
  const baseYear = allocateAcademicYearBase(4000);

  const dateInYear = (month: number, day: number): string => {
    const year = month >= 9 ? baseYear : baseYear + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // 1. Academic year
  const ayRes = await authPost(
    app,
    '/api/v1/academic-years',
    cedarAdminToken,
    {
      name: `Cedar P5 Year ${ts}`,
      start_date: `${baseYear}-09-01`,
      end_date: `${baseYear + 1}-06-30`,
      status: 'active',
    },
    CEDAR_DOMAIN,
  ).expect(201);
  const academicYearId = ayRes.body.data.id;

  // 2. Academic period
  const apRes = await authPost(
    app,
    `/api/v1/academic-years/${academicYearId}/periods`,
    cedarAdminToken,
    {
      name: `Cedar P5 Term ${ts}`,
      period_type: 'term',
      start_date: dateInYear(9, 1),
      end_date: dateInYear(12, 20),
      status: 'active',
    },
    CEDAR_DOMAIN,
  ).expect(201);
  const academicPeriodId = apRes.body.data.id;

  // 3. Subject
  const subRes = await authPost(
    app,
    '/api/v1/subjects',
    cedarAdminToken,
    {
      name: `Cedar P5 Science ${ts}`,
      code: `SCI-${ts}`,
      subject_type: 'academic',
      active: true,
    },
    CEDAR_DOMAIN,
  ).expect(201);
  const subjectId = subRes.body.data.id;

  // 3b. Year group (required for class creation)
  const ygRes = await authPost(
    app,
    '/api/v1/year-groups',
    cedarAdminToken,
    {
      name: `Cedar P5 Year Group ${ts}`,
      display_order: 1,
    },
    CEDAR_DOMAIN,
  ).expect(201);
  const cedarYearGroupId = ygRes.body.data.id;

  // 4. Class
  const classRes = await authPost(
    app,
    '/api/v1/classes',
    cedarAdminToken,
    {
      academic_year_id: academicYearId,
      year_group_id: cedarYearGroupId,
      name: `Cedar P5 Class ${ts}`,
      max_capacity: 30,
      class_type: 'floating',
      status: 'active',
    },
    CEDAR_DOMAIN,
  ).expect(201);
  const classId = classRes.body.data.id;

  // 5. Household + student
  const hhRes = await authPost(
    app,
    '/api/v1/households',
    cedarAdminToken,
    {
      household_name: `Cedar P5 Family ${ts}`,
      emergency_contacts: [
        { contact_name: 'Cedar Contact', phone: '+971509876543', display_order: 1 },
      ],
    },
    CEDAR_DOMAIN,
  ).expect(201);
  const householdId = hhRes.body.data.id;

  const stuRes = await authPost(
    app,
    '/api/v1/students',
    cedarAdminToken,
    {
      household_id: householdId,
      first_name: 'CedarP5',
      last_name: `Student${ts}`,
      date_of_birth: '2015-01-01',
      gender: 'female',
      national_id: `NID-C-${ts}`,
      nationality: 'Irish',
      status: 'active',
    },
    CEDAR_DOMAIN,
  ).expect(201);
  const studentId = stuRes.body.data.id;

  // 6. Enrol student
  await authPost(
    app,
    `/api/v1/classes/${classId}/enrolments`,
    cedarAdminToken,
    { student_id: studentId, start_date: dateInYear(9, 1) },
    CEDAR_DOMAIN,
  ).expect(201);

  // 7. Grading scale
  const scaleRes = await authPost(
    app,
    '/api/v1/gradebook/grading-scales',
    cedarAdminToken,
    {
      name: `Cedar P5 Scale ${ts}`,
      config_json: {
        type: 'numeric',
        ranges: [
          { min: 0, max: 59, label: 'F', gpa_value: 0 },
          { min: 60, max: 100, label: 'P', gpa_value: 3 },
        ],
        passing_threshold: 60,
      },
    },
    CEDAR_DOMAIN,
  ).expect(201);
  const gradingScaleId = scaleRes.body.data.id;

  // 8. Assessment category
  const catRes = await authPost(
    app,
    '/api/v1/gradebook/assessment-categories',
    cedarAdminToken,
    {
      name: `Cedar Tests ${ts}`,
      default_weight: 100,
    },
    CEDAR_DOMAIN,
  ).expect(201);
  const categoryId = catRes.body.data.id;

  // 9. Grade config
  const gcRes = await authPut(
    app,
    `/api/v1/gradebook/classes/${classId}/subjects/${subjectId}/grade-config`,
    cedarAdminToken,
    {
      grading_scale_id: gradingScaleId,
      category_weight_json: {
        weights: [{ category_id: categoryId, weight: 100 }],
      },
    },
    CEDAR_DOMAIN,
  );
  if (gcRes.status !== 200 && gcRes.status !== 201) {
    throw new Error(`Failed to upsert Cedar grade config: ${JSON.stringify(gcRes.body)}`);
  }
  const gradeConfigId = gcRes.body.data.id;

  // 10. Assessment (draft → open)
  const asmtRes = await authPost(
    app,
    '/api/v1/gradebook/assessments',
    cedarAdminToken,
    {
      class_id: classId,
      subject_id: subjectId,
      academic_period_id: academicPeriodId,
      category_id: categoryId,
      title: `Cedar P5 Quiz ${ts}`,
      max_score: 50,
      due_date: dateInYear(10, 10),
    },
    CEDAR_DOMAIN,
  ).expect(201);
  const assessmentId = asmtRes.body.data.id;

  await authPatch(
    app,
    `/api/v1/gradebook/assessments/${assessmentId}/status`,
    cedarAdminToken,
    { status: 'open' },
    CEDAR_DOMAIN,
  ).expect(200);

  return {
    academicYearId,
    academicPeriodId,
    classId,
    subjectId,
    studentId,
    householdId,
    gradingScaleId,
    categoryId,
    gradeConfigId,
    assessmentId,
  };
}
