import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_ADMIN_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  AL_NOOR_PARENT_EMAIL,
  CEDAR_ADMIN_EMAIL,
  CEDAR_DOMAIN,
  DEV_PASSWORD,
  createTestApp,
  closeTestApp,
  getAuthToken,
  login,
  authGet,
  authPost,
  authPatch,
  authPut,
  authDelete,
  cleanupRedisKeys,
} from './helpers';
import { setupP5TestData, P5TestData } from './p5-test-data.helper';

jest.setTimeout(120_000);

describe('P5 Gradebook (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let teacherToken: string;
  let parentToken: string;
  let td: P5TestData;

  // Parent-linked student ID (created in beforeAll for parent portal tests)
  let parentLinkedStudentId: string;
  let parentId: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, AL_NOOR_ADMIN_EMAIL, AL_NOOR_DOMAIN);
    teacherToken = await getAuthToken(app, AL_NOOR_TEACHER_EMAIL, AL_NOOR_DOMAIN);
    parentToken = await getAuthToken(app, AL_NOOR_PARENT_EMAIL, AL_NOOR_DOMAIN);

    td = await setupP5TestData(app, adminToken);

    // Find parent profile for parent@alnoor.test
    const parentsRes = await authGet(
      app,
      '/api/v1/parents?page=1&pageSize=50',
      adminToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const parentProfile = parentsRes.body.data.find(
      (p: Record<string, unknown>) => {
        const user = p['user'] as Record<string, string> | undefined;
        return user?.email === AL_NOOR_PARENT_EMAIL;
      },
    );
    parentId = parentProfile?.id as string;

    // Create a student linked to the parent (for parent portal tests)
    if (parentId) {
      const stuRes = await authPost(app, '/api/v1/students', adminToken, {
        household_id: td.householdId,
        first_name: 'ParentLinked',
        last_name: `Student${Date.now()}`,
        date_of_birth: '2015-06-01',
        gender: 'female',
        status: 'active',
        parent_links: [
          { parent_id: parentId, relationship_label: 'mother' },
        ],
      }, AL_NOOR_DOMAIN).expect(201);
      parentLinkedStudentId = stuRes.body.data.id;

      // Enrol the parent-linked student in the test class
      await authPost(
        app,
        `/api/v1/classes/${td.classId}/enrolments`,
        adminToken,
        { student_id: parentLinkedStudentId, start_date: td.dateInYear(9, 1) },
        AL_NOOR_DOMAIN,
      ).expect(201);
    }
  });

  afterAll(async () => {
    await cleanupRedisKeys(['transcript:*']);
    await closeTestApp();
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 1: Grading Scales API
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Grading Scales (/api/v1/gradebook/grading-scales)', () => {
    let createdScaleId: string;
    let inUseScaleId: string;

    it('POST → 201 (create grading scale)', async () => {
      const res = await authPost(app, '/api/v1/gradebook/grading-scales', adminToken, {
        name: `Test Scale ${Date.now()}`,
        config_json: {
          type: 'letter',
          grades: [
            { label: 'A', numeric_value: 4 },
            { label: 'B', numeric_value: 3 },
            { label: 'C', numeric_value: 2 },
            { label: 'F', numeric_value: 0 },
          ],
          passing_threshold: 2,
        },
      }, AL_NOOR_DOMAIN).expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toContain('Test Scale');
      createdScaleId = res.body.data.id;
    });

    it('GET → 200 (list grading scales with pagination)', async () => {
      const res = await authGet(
        app,
        '/api/v1/gradebook/grading-scales?page=1&pageSize=10',
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('GET /:id → 200 (single scale with is_in_use)', async () => {
      const res = await authGet(
        app,
        `/api/v1/gradebook/grading-scales/${createdScaleId}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.id).toBe(createdScaleId);
      expect(typeof res.body.data.is_in_use).toBe('boolean');
    });

    it('PATCH /:id → 200 (update scale name)', async () => {
      const newName = `Updated Scale ${Date.now()}`;
      const res = await authPatch(
        app,
        `/api/v1/gradebook/grading-scales/${createdScaleId}`,
        adminToken,
        { name: newName },
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.name).toBe(newName);
    });

    it('DELETE /:id → 200 (delete unused scale)', async () => {
      // Create a throwaway scale to delete
      const tempRes = await authPost(app, '/api/v1/gradebook/grading-scales', adminToken, {
        name: `Deletable Scale ${Date.now()}`,
        config_json: {
          type: 'numeric',
          ranges: [{ min: 0, max: 100, label: 'Pass', gpa_value: 4 }],
        },
      }, AL_NOOR_DOMAIN).expect(201);

      await authDelete(
        app,
        `/api/v1/gradebook/grading-scales/${tempRes.body.data.id}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);
    });

    it('POST → 401 (no auth)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/gradebook/grading-scales')
        .set('Host', AL_NOOR_DOMAIN)
        .send({
          name: 'Should Fail',
          config_json: { type: 'numeric', ranges: [{ min: 0, max: 100, label: 'P', gpa_value: 4 }] },
        })
        .expect(401);
    });

    it('POST → 403 (teacher lacks gradebook.manage)', async () => {
      await authPost(app, '/api/v1/gradebook/grading-scales', teacherToken, {
        name: `Teacher Scale ${Date.now()}`,
        config_json: {
          type: 'numeric',
          ranges: [{ min: 0, max: 100, label: 'P', gpa_value: 4 }],
        },
      }, AL_NOOR_DOMAIN).expect(403);
    });

    it('POST → 409 (duplicate name)', async () => {
      // Create a scale, then try to create another with the same name
      const name = `Unique Scale ${Date.now()}`;
      await authPost(app, '/api/v1/gradebook/grading-scales', adminToken, {
        name,
        config_json: {
          type: 'numeric',
          ranges: [{ min: 0, max: 100, label: 'P', gpa_value: 4 }],
        },
      }, AL_NOOR_DOMAIN).expect(201);

      const res = await authPost(app, '/api/v1/gradebook/grading-scales', adminToken, {
        name,
        config_json: {
          type: 'numeric',
          ranges: [{ min: 0, max: 100, label: 'P', gpa_value: 4 }],
        },
      }, AL_NOOR_DOMAIN).expect(409);

      expect(res.body.error?.code).toBe('GRADING_SCALE_NAME_EXISTS');
    });

    it('PATCH → 409 (update config of in-use scale)', async () => {
      // The test data scale (td.gradingScaleId) is referenced by grade config.
      // To make it truly "in use", we need grades entered.
      // Enter a grade against the open assessment to make the scale in-use.
      inUseScaleId = td.gradingScaleId;

      await authPut(
        app,
        `/api/v1/gradebook/assessments/${td.assessmentId}/grades`,
        adminToken,
        {
          grades: [
            { student_id: td.studentId, raw_score: 85, is_missing: false },
          ],
        },
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Now try to update config_json on the in-use scale
      const res = await authPatch(
        app,
        `/api/v1/gradebook/grading-scales/${inUseScaleId}`,
        adminToken,
        {
          config_json: {
            type: 'numeric',
            ranges: [{ min: 0, max: 100, label: 'Modified', gpa_value: 5 }],
          },
        },
        AL_NOOR_DOMAIN,
      ).expect(409);

      expect(res.body.error?.code).toBe('GRADING_SCALE_IMMUTABLE');
    });

    it('DELETE → 409 (delete in-use scale)', async () => {
      // td.gradingScaleId is referenced by grade configs
      const res = await authDelete(
        app,
        `/api/v1/gradebook/grading-scales/${td.gradingScaleId}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(409);

      expect(res.body.error?.code).toBe('GRADING_SCALE_IN_USE');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 2: Assessment Categories API
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Assessment Categories (/api/v1/gradebook/assessment-categories)', () => {
    let createdCategoryId: string;

    it('POST → 201 (create category)', async () => {
      const res = await authPost(app, '/api/v1/gradebook/assessment-categories', adminToken, {
        name: `Test Category ${Date.now()}`,
        default_weight: 25,
      }, AL_NOOR_DOMAIN).expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toContain('Test Category');
      createdCategoryId = res.body.data.id;
    });

    it('GET → 200 (list categories)', async () => {
      const res = await authGet(
        app,
        '/api/v1/gradebook/assessment-categories',
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('PATCH /:id → 200 (update category)', async () => {
      const newName = `Updated Category ${Date.now()}`;
      const res = await authPatch(
        app,
        `/api/v1/gradebook/assessment-categories/${createdCategoryId}`,
        adminToken,
        { name: newName, default_weight: 30 },
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.name).toBe(newName);
    });

    it('DELETE /:id → 200 (delete unused category)', async () => {
      // Create a fresh category not referenced by any assessments
      const tempRes = await authPost(app, '/api/v1/gradebook/assessment-categories', adminToken, {
        name: `Deletable Cat ${Date.now()}`,
        default_weight: 10,
      }, AL_NOOR_DOMAIN).expect(201);

      await authDelete(
        app,
        `/api/v1/gradebook/assessment-categories/${tempRes.body.data.id}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);
    });

    it('POST → 403 (teacher cannot create)', async () => {
      await authPost(app, '/api/v1/gradebook/assessment-categories', teacherToken, {
        name: `Teacher Cat ${Date.now()}`,
        default_weight: 20,
      }, AL_NOOR_DOMAIN).expect(403);
    });

    it('DELETE → 409 (category in use by assessment)', async () => {
      // td.categoryHomeworkId is referenced by the test assessment
      const res = await authDelete(
        app,
        `/api/v1/gradebook/assessment-categories/${td.categoryHomeworkId}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(409);

      expect(res.body.error?.code).toBe('CATEGORY_IN_USE');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 3: Assessments API
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Assessments (/api/v1/gradebook/assessments)', () => {
    let newAssessmentId: string;
    let cancellableAssessmentId: string;

    it('POST → 201 (admin creates assessment)', async () => {
      const res = await authPost(app, '/api/v1/gradebook/assessments', adminToken, {
        class_id: td.classId,
        subject_id: td.subjectId,
        academic_period_id: td.academicPeriodId,
        category_id: td.categoryExamsId,
        title: `Midterm Exam ${Date.now()}`,
        max_score: 100,
        due_date: td.dateInYear(11, 1),
      }, AL_NOOR_DOMAIN).expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe('draft');
      newAssessmentId = res.body.data.id;
    });

    it('GET → 200 (list assessments)', async () => {
      const res = await authGet(
        app,
        `/api/v1/gradebook/assessments?class_id=${td.classId}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('PATCH /:id/status → 200 (draft → open)', async () => {
      const res = await authPatch(
        app,
        `/api/v1/gradebook/assessments/${newAssessmentId}/status`,
        adminToken,
        { status: 'open' },
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.status).toBe('open');
    });

    it('PATCH /:id/status → 200 (open → submitted_locked)', async () => {
      const res = await authPatch(
        app,
        `/api/v1/gradebook/assessments/${newAssessmentId}/status`,
        adminToken,
        { status: 'submitted_locked' },
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.status).toBe('submitted_locked');
    });

    it('PATCH /:id/status → 400 (submitted_locked → open, re-open)', async () => {
      const res = await authPatch(
        app,
        `/api/v1/gradebook/assessments/${newAssessmentId}/status`,
        adminToken,
        { status: 'open' },
        AL_NOOR_DOMAIN,
      ).expect(400);

      expect(res.body.error?.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('PATCH /:id/status → 400 (draft → closed without cancellation reason)', async () => {
      const draftRes = await authPost(app, '/api/v1/gradebook/assessments', adminToken, {
        class_id: td.classId,
        subject_id: td.subjectId,
        academic_period_id: td.academicPeriodId,
        category_id: td.categoryExamsId,
        title: `Cancellable Draft ${Date.now()}`,
        max_score: 75,
      }, AL_NOOR_DOMAIN).expect(201);
      cancellableAssessmentId = draftRes.body.data.id;

      const res = await authPatch(
        app,
        `/api/v1/gradebook/assessments/${cancellableAssessmentId}/status`,
        adminToken,
        { status: 'closed' },
        AL_NOOR_DOMAIN,
      ).expect(400);

      expect(res.body.error?.code).toBe('CANCELLATION_REASON_REQUIRED');
    });

    it('PATCH /:id/status → 200 (draft → closed with cancellation reason)', async () => {
      const res = await authPatch(
        app,
        `/api/v1/gradebook/assessments/${cancellableAssessmentId}/status`,
        adminToken,
        { status: 'closed', cancellation_reason: 'Assessment withdrawn before grading' },
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.status).toBe('closed');
    });

    it('PATCH /:id/status → 400 (invalid: submitted_locked → final_locked)', async () => {
      const res = await authPatch(
        app,
        `/api/v1/gradebook/assessments/${newAssessmentId}/status`,
        adminToken,
        { status: 'final_locked' },
        AL_NOOR_DOMAIN,
      ).expect(400);

      expect(res.body.error?.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 4: Grades API
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Grades (/api/v1/gradebook/assessments/:assessmentId/grades)', () => {
    it('PUT → 200 (bulk upsert grades on open assessment)', async () => {
      // td.assessmentId is open; we already entered one grade in grading scale test
      const res = await authPut(
        app,
        `/api/v1/gradebook/assessments/${td.assessmentId}/grades`,
        adminToken,
        {
          grades: [
            { student_id: td.studentId, raw_score: 92, is_missing: false, comment: 'Excellent work' },
            { student_id: td.studentId2, raw_score: 78, is_missing: false },
          ],
        },
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
    });

    it('GET → 200 (get grades by assessment)', async () => {
      const res = await authGet(
        app,
        `/api/v1/gradebook/assessments/${td.assessmentId}/grades`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      // Verify student info is included
      const grade = res.body.data[0];
      expect(grade.student).toBeDefined();
      expect(grade.student.id).toBeDefined();
    });

    it('PUT → 409 (grades on closed assessment)', async () => {
      const lockedAssessmentRes = await authPost(app, '/api/v1/gradebook/assessments', adminToken, {
        class_id: td.classId,
        subject_id: td.subjectId,
        academic_period_id: td.academicPeriodId,
        category_id: td.categoryHomeworkId,
        title: `Locked Assessment ${Date.now()}`,
        max_score: 100,
      }, AL_NOOR_DOMAIN).expect(201);
      const lockedAssessmentId = lockedAssessmentRes.body.data.id;

      await authPatch(
        app,
        `/api/v1/gradebook/assessments/${lockedAssessmentId}/status`,
        adminToken,
        { status: 'open' },
        AL_NOOR_DOMAIN,
      ).expect(200);

      await authPatch(
        app,
        `/api/v1/gradebook/assessments/${lockedAssessmentId}/status`,
        adminToken,
        { status: 'submitted_locked' },
        AL_NOOR_DOMAIN,
      ).expect(200);

      const res = await authPut(
        app,
        `/api/v1/gradebook/assessments/${lockedAssessmentId}/grades`,
        adminToken,
        {
          grades: [
            { student_id: td.studentId, raw_score: 95, is_missing: false },
          ],
        },
        AL_NOOR_DOMAIN,
      ).expect(409);

      expect(res.body.error?.code).toBe('ASSESSMENT_NOT_GRADEABLE');
    });

    it('PUT → 400 (non-enrolled student)', async () => {
      const fakeStudentId = '00000000-0000-0000-0000-000000000001';
      const res = await authPut(
        app,
        `/api/v1/gradebook/assessments/${td.assessmentId}/grades`,
        adminToken,
        {
          grades: [
            { student_id: fakeStudentId, raw_score: 50, is_missing: false },
          ],
        },
        AL_NOOR_DOMAIN,
      ).expect(400);

      expect(res.body.error?.code).toBe('STUDENTS_NOT_ENROLLED');
    });

    it('PUT → 400 (score exceeds max)', async () => {
      // td.assessmentId has max_score = 100
      const res = await authPut(
        app,
        `/api/v1/gradebook/assessments/${td.assessmentId}/grades`,
        adminToken,
        {
          grades: [
            { student_id: td.studentId, raw_score: 150, is_missing: false },
          ],
        },
        AL_NOOR_DOMAIN,
      ).expect(400);

      expect(res.body.error?.code).toBe('SCORE_EXCEEDS_MAX');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 5: Period Grades API
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Period Grades (/api/v1/gradebook/period-grades)', () => {
    let periodGradeSnapshotId: string;

    it('POST /compute → 201 (compute period grades)', async () => {
      // Ensure grades exist (from section 4)
      const res = await authPost(app, '/api/v1/gradebook/period-grades/compute', adminToken, {
        class_id: td.classId,
        subject_id: td.subjectId,
        academic_period_id: td.academicPeriodId,
      }, AL_NOOR_DOMAIN).expect(201);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      // Verify snapshot has computed_value and display_value
      const snapshot = res.body.data[0];
      expect(snapshot.computed_value).toBeDefined();
      expect(snapshot.display_value).toBeDefined();
      periodGradeSnapshotId = snapshot.id;
    });

    it('POST /:id/override → 200 (admin overrides grade)', async () => {
      expect(periodGradeSnapshotId).toBeDefined();

      const res = await authPost(
        app,
        `/api/v1/gradebook/period-grades/${periodGradeSnapshotId}/override`,
        adminToken,
        {
          overridden_value: 'A+',
          override_reason: 'Student showed exceptional improvement',
        },
        AL_NOOR_DOMAIN,
      ).expect(201);

      expect(res.body.data.overridden_value).toBe('A+');
      expect(res.body.data.override_reason).toBe('Student showed exceptional improvement');
    });

    it('POST /:id/override → 400 (missing override_reason)', async () => {
      expect(periodGradeSnapshotId).toBeDefined();

      const res = await authPost(
        app,
        `/api/v1/gradebook/period-grades/${periodGradeSnapshotId}/override`,
        adminToken,
        {
          overridden_value: 'B',
          // override_reason is missing
        },
        AL_NOOR_DOMAIN,
      ).expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('POST /:id/override → 403 (teacher lacks override permission)', async () => {
      expect(periodGradeSnapshotId).toBeDefined();

      await authPost(
        app,
        `/api/v1/gradebook/period-grades/${periodGradeSnapshotId}/override`,
        teacherToken,
        {
          overridden_value: 'C',
          override_reason: 'Teacher override attempt',
        },
        AL_NOOR_DOMAIN,
      ).expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 6: Report Cards API
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Report Cards (/api/v1/report-cards)', () => {
    let reportCardId: string;

    it('POST /generate → 201 (generate draft report cards)', async () => {
      const res = await authPost(app, '/api/v1/report-cards/generate', adminToken, {
        student_ids: [td.studentId],
        academic_period_id: td.academicPeriodId,
      }, AL_NOOR_DOMAIN).expect(201);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].status).toBe('draft');
      reportCardId = res.body.data[0].id;
    });

    it('GET → 200 (list report cards)', async () => {
      const res = await authGet(
        app,
        `/api/v1/report-cards?academic_period_id=${td.academicPeriodId}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('GET /:id → 200 (single report card with snapshot)', async () => {
      expect(reportCardId).toBeDefined();

      const res = await authGet(
        app,
        `/api/v1/report-cards/${reportCardId}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.id).toBe(reportCardId);
      expect(res.body.data.snapshot_payload_json).toBeDefined();
      expect(res.body.data.snapshot_payload_json.student).toBeDefined();
      expect(res.body.data.snapshot_payload_json.period).toBeDefined();
    });

    it('PATCH /:id → 200 (update draft comments)', async () => {
      expect(reportCardId).toBeDefined();

      const res = await authPatch(
        app,
        `/api/v1/report-cards/${reportCardId}`,
        adminToken,
        {
          teacher_comment: 'Good progress this term.',
          principal_comment: 'Keep up the good work.',
        },
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.teacher_comment).toBe('Good progress this term.');
      expect(res.body.data.principal_comment).toBe('Keep up the good work.');
    });

    it('POST /:id/publish → 201 (publish report card)', async () => {
      expect(reportCardId).toBeDefined();

      const res = await authPost(
        app,
        `/api/v1/report-cards/${reportCardId}/publish`,
        adminToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(201);

      expect(res.body.data.status).toBe('published');
      expect(res.body.data.published_at).toBeDefined();
    });

    it('POST /:id/revise → 201 (revise published card)', async () => {
      expect(reportCardId).toBeDefined();

      const res = await authPost(
        app,
        `/api/v1/report-cards/${reportCardId}/revise`,
        adminToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(201);

      expect(res.body.data.status).toBe('draft');
      expect(res.body.data.revision_of_report_card_id).toBe(reportCardId);
    });

    it('PATCH → 409 (update published card)', async () => {
      // reportCardId is now "revised" status (after the revise test above set it)
      // Create and publish a fresh card to test updating a published card
      const genRes = await authPost(app, '/api/v1/report-cards/generate', adminToken, {
        student_ids: [td.studentId2],
        academic_period_id: td.academicPeriodId,
      }, AL_NOOR_DOMAIN).expect(201);
      const freshCardId = genRes.body.data[0].id;

      await authPost(
        app,
        `/api/v1/report-cards/${freshCardId}/publish`,
        adminToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(201);

      const res = await authPatch(
        app,
        `/api/v1/report-cards/${freshCardId}`,
        adminToken,
        { teacher_comment: 'Should not work' },
        AL_NOOR_DOMAIN,
      ).expect(409);

      expect(res.body.error?.code).toBe('REPORT_CARD_NOT_DRAFT');
    });

    it('POST /:id/publish → 409 (publish non-draft)', async () => {
      // The studentId2 card was published in the "update published card" test above
      // Find it by listing published cards for studentId2
      const listRes = await authGet(
        app,
        `/api/v1/report-cards?student_id=${td.studentId2}&status=published`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(listRes.body.data.length).toBeGreaterThan(0);
      const publishedCardId = listRes.body.data[0].id;

      // Try to publish an already-published card
      const res = await authPost(
        app,
        `/api/v1/report-cards/${publishedCardId}/publish`,
        adminToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(409);

      expect(res.body.error?.code).toBe('REPORT_CARD_NOT_DRAFT');
    });

    it('POST /:id/publish → 403 (teacher lacks publish permission)', async () => {
      // The revise test created a new draft for studentId — use that
      // Find the draft revision for studentId
      const listRes = await authGet(
        app,
        `/api/v1/report-cards?student_id=${td.studentId}&status=draft`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(listRes.body.data.length).toBeGreaterThan(0);
      const draftCardId = listRes.body.data[0].id;

      await authPost(
        app,
        `/api/v1/report-cards/${draftCardId}/publish`,
        teacherToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 7: Parent Portal API
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Parent Portal (/api/v1/parent/students/:studentId)', () => {
    let publishedReportCardStudentId: string;

    beforeAll(async () => {
      // Set up: enter grades and generate+publish a report card for the parent-linked student
      if (!parentLinkedStudentId || !parentId) {
        return;
      }

      // Enter grades for the parent-linked student on the open assessment
      await authPut(
        app,
        `/api/v1/gradebook/assessments/${td.assessmentId}/grades`,
        adminToken,
        {
          grades: [
            { student_id: parentLinkedStudentId, raw_score: 88, is_missing: false },
          ],
        },
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Compute period grades
      await authPost(app, '/api/v1/gradebook/period-grades/compute', adminToken, {
        class_id: td.classId,
        subject_id: td.subjectId,
        academic_period_id: td.academicPeriodId,
      }, AL_NOOR_DOMAIN).expect(201);

      // Generate and publish report card
      const genRes = await authPost(app, '/api/v1/report-cards/generate', adminToken, {
        student_ids: [parentLinkedStudentId],
        academic_period_id: td.academicPeriodId,
      }, AL_NOOR_DOMAIN).expect(201);

      const cardId = genRes.body.data[0].id;
      publishedReportCardStudentId = parentLinkedStudentId;

      await authPost(
        app,
        `/api/v1/report-cards/${cardId}/publish`,
        adminToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(200);
    });

    it('GET /grades → 200 (parent views child grades)', async () => {
      if (!parentLinkedStudentId || !parentId) {
        return;
      }

      const res = await authGet(
        app,
        `/api/v1/parent/students/${parentLinkedStudentId}/grades`,
        parentToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data).toBeDefined();
    });

    it('GET /report-cards → 200 (parent views published report cards)', async () => {
      if (!publishedReportCardStudentId || !parentId) {
        return;
      }

      const res = await authGet(
        app,
        `/api/v1/parent/students/${publishedReportCardStudentId}/report-cards`,
        parentToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      // All returned cards should be published
      for (const card of res.body.data) {
        expect(card.status).toBe('published');
      }
    });

    it('GET /grades → 403 (parent views unlinked student)', async () => {
      const unlinkedStudentId = '00000000-0000-0000-0000-000000000099';

      const res = await authGet(
        app,
        `/api/v1/parent/students/${unlinkedStudentId}/grades`,
        parentToken,
        AL_NOOR_DOMAIN,
      );

      // Should be 403 (NOT_LINKED_TO_STUDENT) or 404 (PARENT_NOT_FOUND if no parent profile)
      expect([403, 404]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 8: RLS Cross-Tenant Isolation
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('RLS Cross-Tenant Isolation', () => {
    let cedarAdminToken: string;

    beforeAll(async () => {
      cedarAdminToken = await getAuthToken(app, CEDAR_ADMIN_EMAIL, CEDAR_DOMAIN);
    });

    it('Cedar admin cannot see Al Noor grading scales', async () => {
      const res = await authGet(
        app,
        `/api/v1/gradebook/grading-scales/${td.gradingScaleId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);

      expect(res.body.error?.code).toBe('GRADING_SCALE_NOT_FOUND');
    });

    it('Cedar admin cannot see Al Noor assessment categories', async () => {
      const res = await authGet(
        app,
        `/api/v1/gradebook/assessment-categories/${td.categoryHomeworkId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);

      expect(res.body.error?.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('Cedar admin cannot see Al Noor assessments', async () => {
      const res = await authGet(
        app,
        `/api/v1/gradebook/assessments/${td.assessmentId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);

      expect(res.body.error?.code).toBe('ASSESSMENT_NOT_FOUND');
    });

    it('Cedar admin cannot see Al Noor grades', async () => {
      const res = await authGet(
        app,
        `/api/v1/gradebook/assessments/${td.assessmentId}/grades`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);

      expect(res.body.error?.code).toBe('ASSESSMENT_NOT_FOUND');
    });

    it('Cedar admin cannot update Al Noor grading scale', async () => {
      await authPatch(
        app,
        `/api/v1/gradebook/grading-scales/${td.gradingScaleId}`,
        cedarAdminToken,
        { name: 'Hijacked Scale' },
        CEDAR_DOMAIN,
      ).expect(404);
    });

    it('Cedar admin cannot delete Al Noor assessment category', async () => {
      await authDelete(
        app,
        `/api/v1/gradebook/assessment-categories/${td.categoryHomeworkId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });

    it('Cedar admin cannot enter grades on Al Noor assessment', async () => {
      const res = await authPut(
        app,
        `/api/v1/gradebook/assessments/${td.assessmentId}/grades`,
        cedarAdminToken,
        {
          grades: [
            { student_id: td.studentId, raw_score: 50, is_missing: false },
          ],
        },
        CEDAR_DOMAIN,
      ).expect(404);

      expect(res.body.error?.code).toBe('ASSESSMENT_NOT_FOUND');
    });

    it('Cedar admin cannot compute Al Noor period grades', async () => {
      // This should fail because the class/subject/period don't exist in Cedar
      const res = await authPost(
        app,
        '/api/v1/gradebook/period-grades/compute',
        cedarAdminToken,
        {
          class_id: td.classId,
          subject_id: td.subjectId,
          academic_period_id: td.academicPeriodId,
        },
        CEDAR_DOMAIN,
      );

      // Should either be 404 or return empty results since the entities belong to Al Noor
      expect([404, 400, 201]).toContain(res.status);
      if (res.status === 201) {
        // If it returns 201, data should be empty (no matching data in Cedar)
        expect(res.body.data.length).toBe(0);
      }
    });

    it('Cedar admin cannot generate report cards for Al Noor students', async () => {
      const res = await authPost(
        app,
        '/api/v1/report-cards/generate',
        cedarAdminToken,
        {
          student_ids: [td.studentId],
          academic_period_id: td.academicPeriodId,
        },
        CEDAR_DOMAIN,
      );

      // Should fail because period or students don't exist in Cedar tenant
      expect([404, 400]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 9: Grade Config API
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Grade Configs (/api/v1/gradebook/classes/:classId/subjects/:subjectId/grade-config)', () => {
    it('PUT → 200 (upsert grade config)', async () => {
      // Already tested via test data setup, verify it works explicitly
      const res = await authPut(
        app,
        `/api/v1/gradebook/classes/${td.classId}/subjects/${td.subjectId}/grade-config`,
        adminToken,
        {
          grading_scale_id: td.gradingScaleId,
          category_weight_json: {
            weights: [
              { category_id: td.categoryHomeworkId, weight: 30 },
              { category_id: td.categoryExamsId, weight: 70 },
            ],
          },
        },
        AL_NOOR_DOMAIN,
      );

      expect([200, 201]).toContain(res.status);
      expect(res.body.data.id).toBeDefined();
    });

    it('GET /classes/:classId/grade-configs → 200', async () => {
      const res = await authGet(
        app,
        `/api/v1/gradebook/classes/${td.classId}/grade-configs`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /classes/:classId/subjects/:subjectId/grade-config → 200', async () => {
      const res = await authGet(
        app,
        `/api/v1/gradebook/classes/${td.classId}/subjects/${td.subjectId}/grade-config`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.grading_scale_id).toBe(td.gradingScaleId);
    });

    it('PUT → 403 (teacher cannot manage grade configs)', async () => {
      await authPut(
        app,
        `/api/v1/gradebook/classes/${td.classId}/subjects/${td.subjectId}/grade-config`,
        teacherToken,
        {
          grading_scale_id: td.gradingScaleId,
          category_weight_json: {
            weights: [{ category_id: td.categoryHomeworkId, weight: 100 }],
          },
        },
        AL_NOOR_DOMAIN,
      ).expect(403);
    });

    it('Teacher can view grade configs (gradebook.view)', async () => {
      const res = await authGet(
        app,
        `/api/v1/gradebook/classes/${td.classId}/grade-configs`,
        teacherToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 10: Teacher Access (enter_grades + view only)
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Teacher Permission Boundaries', () => {
    it('Teacher can list assessments (gradebook.view)', async () => {
      const res = await authGet(
        app,
        `/api/v1/gradebook/assessments?class_id=${td.classId}`,
        teacherToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('Teacher can enter grades (gradebook.enter_grades)', async () => {
      const res = await authPut(
        app,
        `/api/v1/gradebook/assessments/${td.assessmentId}/grades`,
        teacherToken,
        {
          grades: [
            { student_id: td.studentId, raw_score: 90, is_missing: false },
          ],
        },
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.length).toBe(1);
    });

    it('Teacher can create assessments (gradebook.enter_grades)', async () => {
      const res = await authPost(app, '/api/v1/gradebook/assessments', teacherToken, {
        class_id: td.classId,
        subject_id: td.subjectId,
        academic_period_id: td.academicPeriodId,
        category_id: td.categoryHomeworkId,
        title: `Teacher Quiz ${Date.now()}`,
        max_score: 20,
      }, AL_NOOR_DOMAIN).expect(201);

      expect(res.body.data.status).toBe('draft');
    });

    it('Teacher cannot manage grading scales', async () => {
      await authPost(app, '/api/v1/gradebook/grading-scales', teacherToken, {
        name: 'Nope',
        config_json: {
          type: 'numeric',
          ranges: [{ min: 0, max: 100, label: 'P', gpa_value: 4 }],
        },
      }, AL_NOOR_DOMAIN).expect(403);
    });

    it('Teacher cannot manage assessment categories', async () => {
      await authPost(app, '/api/v1/gradebook/assessment-categories', teacherToken, {
        name: 'Nope',
        default_weight: 10,
      }, AL_NOOR_DOMAIN).expect(403);
    });

    it('Teacher cannot compute period grades (gradebook.manage)', async () => {
      await authPost(app, '/api/v1/gradebook/period-grades/compute', teacherToken, {
        class_id: td.classId,
        subject_id: td.subjectId,
        academic_period_id: td.academicPeriodId,
      }, AL_NOOR_DOMAIN).expect(403);
    });

    it('Teacher cannot generate report cards (gradebook.manage)', async () => {
      await authPost(app, '/api/v1/report-cards/generate', teacherToken, {
        student_ids: [td.studentId],
        academic_period_id: td.academicPeriodId,
      }, AL_NOOR_DOMAIN).expect(403);
    });

    it('Teacher cannot publish report cards', async () => {
      // Revise the published card for studentId2 to create a new draft
      const listRes = await authGet(
        app,
        `/api/v1/report-cards?student_id=${td.studentId2}&status=published`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(listRes.body.data.length).toBeGreaterThan(0);
      const publishedId = listRes.body.data[0].id;

      // Revise it (creates a new draft, sets original to revised)
      const reviseRes = await authPost(
        app,
        `/api/v1/report-cards/${publishedId}/revise`,
        adminToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(201);

      const draftCardId = reviseRes.body.data.id;

      // Teacher should not be able to publish
      await authPost(
        app,
        `/api/v1/report-cards/${draftCardId}/publish`,
        teacherToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(403);
    });
  });
});
