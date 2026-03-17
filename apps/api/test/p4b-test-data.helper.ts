/**
 * Shared helper for P4B e2e tests.
 * Extends P4A test data with period grid entries and class scheduling requirements.
 */
import { INestApplication } from '@nestjs/common';

import { authPost, AL_NOOR_DOMAIN } from './helpers';
import { setupP4ATestData, P4ATestData } from './p4a-test-data.helper';

export interface P4BTestData extends P4ATestData {
  periodTemplateIds: string[];
  classRequirementId: string;
  subjectId: string;
  academicClassId: string;
}

/**
 * Set up base data required for P4B e2e tests.
 * Creates P4A base data, then adds period grid entries and a class scheduling requirement.
 */
export async function setupP4BTestData(
  app: INestApplication,
  adminToken: string,
): Promise<P4BTestData> {
  const p4aData = await setupP4ATestData(app, adminToken);
  const ts = Date.now();

  // 1. Create a subject (defaults to subject_type='academic')
  const subjectRes = await authPost(app, '/api/v1/subjects', adminToken, {
    name: `P4B Test Subject ${ts}`,
    code: `P4B${ts}`,
  }, AL_NOOR_DOMAIN).expect(201);
  const subjectId = subjectRes.body.data.id;

  // 2. Create an academic class linked to the subject
  const academicClassRes = await authPost(app, '/api/v1/classes', adminToken, {
    academic_year_id: p4aData.academicYearId,
    name: `P4B Academic Class ${ts}`,
    subject_id: subjectId,
    status: 'active',
  }, AL_NOOR_DOMAIN).expect(201);
  const academicClassId = academicClassRes.body.data.id;

  // 3. Assign teacher to the academic class
  if (p4aData.teacherStaffProfileId) {
    const assignRes = await authPost(
      app,
      `/api/v1/classes/${academicClassId}/staff`,
      adminToken,
      {
        staff_profile_id: p4aData.teacherStaffProfileId,
        assignment_role: 'teacher',
      },
      AL_NOOR_DOMAIN,
    );
    if (assignRes.status !== 201 && assignRes.status !== 409) {
      throw new Error(`Failed to assign teacher to academic class: ${JSON.stringify(assignRes.body)}`);
    }
  }

  // 4. Create period grid entries for Sunday (weekday 0) with 4 teaching periods
  const periodTemplateIds: string[] = [];
  const periods = [
    { weekday: 0, period_name: 'Period 1', period_order: 0, start_time: '08:00', end_time: '08:45' },
    { weekday: 0, period_name: 'Period 2', period_order: 1, start_time: '08:50', end_time: '09:35' },
    { weekday: 0, period_name: 'Period 3', period_order: 2, start_time: '09:40', end_time: '10:25' },
    { weekday: 0, period_name: 'Period 4', period_order: 3, start_time: '10:30', end_time: '11:15' },
  ];

  for (const period of periods) {
    const periodRes = await authPost(app, '/api/v1/period-grid', adminToken, {
      academic_year_id: p4aData.academicYearId,
      ...period,
      schedule_period_type: 'teaching',
    }, AL_NOOR_DOMAIN).expect(201);
    periodTemplateIds.push(periodRes.body.data.id);
  }

  // 5. Create a class scheduling requirement for the academic class
  const reqRes = await authPost(app, '/api/v1/class-scheduling-requirements', adminToken, {
    class_id: academicClassId,
    academic_year_id: p4aData.academicYearId,
    periods_per_week: 4,
  }, AL_NOOR_DOMAIN).expect(201);
  const classRequirementId = reqRes.body.data.id;

  return {
    ...p4aData,
    periodTemplateIds,
    classRequirementId,
    subjectId,
    academicClassId,
  };
}
