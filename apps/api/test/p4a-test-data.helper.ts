/**
 * Shared helper for P4A e2e tests.
 * Creates necessary prerequisite data: academic year, class, student, enrolment, teacher assignment.
 */
import { INestApplication } from '@nestjs/common';

import { authGet, authPost, AL_NOOR_DOMAIN } from './helpers';

export interface P4ATestData {
  academicYearId: string;
  yearGroupId: string;
  classId: string;
  studentId: string;
  householdId: string;
  teacherStaffProfileId: string;
  roomId: string;
  /** Base year for the academic year (e.g., 3456). The year runs from baseYear-09-01 to (baseYear+1)-06-30. */
  baseYear: number;
  /** Helper to generate a date string within the academic year range. Month 1-12, day 1-28. */
  dateInYear: (month: number, day: number) => string;
}

/**
 * Set up base data required for P4A e2e tests.
 * Creates a unique academic year, class, room, assigns teacher, creates student, and enrols.
 */
export async function setupP4ATestData(
  app: INestApplication,
  adminToken: string,
): Promise<P4ATestData> {
  const ts = Date.now();
  // Use a random far-future year range to avoid overlapping with existing academic years
  const baseYear = 3000 + Math.floor(Math.random() * 5000);

  const dateInYear = (month: number, day: number): string => {
    // Months 9-12 are in baseYear, months 1-6 are in baseYear+1
    const year = month >= 9 ? baseYear : baseYear + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // 1. Create academic year
  const ayRes = await authPost(
    app,
    '/api/v1/academic-years',
    adminToken,
    {
      name: `P4A Test Year ${ts}`,
      start_date: `${baseYear}-09-01`,
      end_date: `${baseYear + 1}-06-30`,
      status: 'active',
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const academicYearId = ayRes.body.data.id;

  // 2. Create year group
  const ygRes = await authPost(
    app,
    '/api/v1/year-groups',
    adminToken,
    {
      name: `Test YG ${ts}`,
      display_order: 1,
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const yearGroupId = ygRes.body.data.id;

  // 3. Create class
  const classRes = await authPost(
    app,
    '/api/v1/classes',
    adminToken,
    {
      academic_year_id: academicYearId,
      year_group_id: yearGroupId,
      name: `P4A Test Class ${ts}`,
      max_capacity: 30,
      class_type: 'floating',
      status: 'active',
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const classId = classRes.body.data.id;

  // 4. Create room
  const roomRes = await authPost(
    app,
    '/api/v1/rooms',
    adminToken,
    {
      name: `P4A Test Room ${ts}`,
      room_type: 'classroom',
      capacity: 30,
      is_exclusive: true,
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const roomId = roomRes.body.data.id;

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

  // 7. Create a household for the student
  const hhRes = await authPost(
    app,
    '/api/v1/households',
    adminToken,
    {
      household_name: `P4A Test Family ${ts}`,
      emergency_contacts: [
        { contact_name: 'Emergency Contact', phone: '+971501234567', display_order: 1 },
      ],
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const householdId = hhRes.body.data.id;

  // 8. Create a student
  const studentRes = await authPost(
    app,
    '/api/v1/students',
    adminToken,
    {
      household_id: householdId,
      first_name: 'P4A',
      last_name: `Student${ts}`,
      date_of_birth: '2015-05-15',
      gender: 'male',
      status: 'active',
      national_id: `NID-P4A-${ts}`,
      nationality: 'Irish',
    },
    AL_NOOR_DOMAIN,
  ).expect(201);
  const studentId = studentRes.body.data.id;

  // 9. Enrol student in class
  await authPost(
    app,
    `/api/v1/classes/${classId}/enrolments`,
    adminToken,
    {
      student_id: studentId,
      start_date: dateInYear(9, 1),
    },
    AL_NOOR_DOMAIN,
  ).expect(201);

  return {
    academicYearId,
    yearGroupId,
    classId,
    studentId,
    householdId,
    teacherStaffProfileId,
    roomId,
    baseYear,
    dateInYear,
  };
}
