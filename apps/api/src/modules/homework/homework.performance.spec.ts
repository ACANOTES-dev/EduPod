/**
 * Performance Load Tests — Homework Module
 *
 * Simulates 200 students × 50 homework assignments
 * Verifies response times under load
 */

import { Test, TestingModule } from '@nestjs/testing';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';

import { HomeworkAnalyticsService } from './homework-analytics.service';
import { HomeworkCompletionAnalyticsService } from './homework-completion-analytics.service';
import { HomeworkLoadAnalyticsService } from './homework-load-analytics.service';
import { HomeworkStudentAnalyticsService } from './homework-student-analytics.service';

const TENANT_ID = '10ad0000-0000-4000-a000-000000000001';
const ACADEMIC_YEAR_ID = '10ad0000-0000-4000-a000-000000000002';
const CLASS_ID = '10ad0000-0000-4000-a000-000000000003';
const SUBJECT_ID = '10ad0000-0000-4000-a000-000000000004';
const USER_ID = '10ad0000-0000-4000-a000-000000000005';
const HOUSEHOLD_ID = '10ad0000-0000-4000-a000-000000000006';

describe('Homework Performance Load Tests', () => {
  let module: TestingModule;
  let analyticsService: HomeworkAnalyticsService;
  let prisma: PrismaService;

  const NUM_STUDENTS = 200;
  const NUM_ASSIGNMENTS = 50;
  const MAX_RESPONSE_TIME_MS = 500;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        HomeworkAnalyticsService,
        HomeworkCompletionAnalyticsService,
        HomeworkLoadAnalyticsService,
        HomeworkStudentAnalyticsService,
        PrismaService,
        AcademicReadFacade,
        ClassesReadFacade,
        StudentReadFacade,
      ],
    }).compile();

    analyticsService = module.get(HomeworkAnalyticsService);
    prisma = module.get(PrismaService);

    await seedTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await module.close();
  });

  async function seedTestData() {
    // Create prerequisite records
    await prisma.tenant.upsert({
      where: { id: TENANT_ID },
      update: {},
      create: {
        id: TENANT_ID,
        name: 'Load Test School',
        slug: 'load-test',
        default_locale: 'en',
        timezone: 'UTC',
        date_format: 'YYYY-MM-DD',
        currency_code: 'USD',
        academic_year_start_month: 9,
        status: 'active',
      },
    });

    await prisma.user.upsert({
      where: { id: USER_ID },
      update: {},
      create: {
        id: USER_ID,
        email: 'loadtest-teacher@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'LoadTest',
        last_name: 'Teacher',
        global_status: 'active',
      },
    });

    await prisma.academicYear.upsert({
      where: { id: ACADEMIC_YEAR_ID },
      update: {},
      create: {
        id: ACADEMIC_YEAR_ID,
        tenant_id: TENANT_ID,
        name: 'Load Test Year',
        start_date: new Date('2025-09-01'),
        end_date: new Date('2026-06-30'),
        status: 'active',
      },
    });

    await prisma.subject.upsert({
      where: { id: SUBJECT_ID },
      update: {},
      create: {
        id: SUBJECT_ID,
        tenant_id: TENANT_ID,
        name: 'Load Test Subject',
        active: true,
      },
    });

    await prisma.class.upsert({
      where: { id: CLASS_ID },
      update: {},
      create: {
        id: CLASS_ID,
        tenant_id: TENANT_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
        name: 'Load Test Class',
        status: 'active',
      },
    });

    await prisma.household.upsert({
      where: { id: HOUSEHOLD_ID },
      update: {},
      create: {
        id: HOUSEHOLD_ID,
        tenant_id: TENANT_ID,
        household_name: 'Load Test Household',
      },
    });

    // Create students
    const studentIds: string[] = [];
    for (let i = 0; i < NUM_STUDENTS; i++) {
      const student = await prisma.student.create({
        data: {
          tenant_id: TENANT_ID,
          household_id: HOUSEHOLD_ID,
          first_name: `Student${i}`,
          last_name: `Test${i}`,
          student_number: `STU${i.toString().padStart(6, '0')}`,
          status: 'active' as const,
          date_of_birth: new Date('2010-01-01'),
        },
      });
      studentIds.push(student.id);

      // Enroll student in class
      await prisma.classEnrolment.create({
        data: {
          tenant_id: TENANT_ID,
          student_id: student.id,
          class_id: CLASS_ID,
          status: 'active' as const,
          start_date: new Date('2026-01-01'),
        },
      });
    }

    // Create assignments and completions
    for (let i = 0; i < NUM_ASSIGNMENTS; i++) {
      const assignment = await prisma.homeworkAssignment.create({
        data: {
          tenant_id: TENANT_ID,
          class_id: CLASS_ID,
          subject_id: SUBJECT_ID,
          academic_year_id: ACADEMIC_YEAR_ID,
          assigned_by_user_id: USER_ID,
          title: `Assignment ${i}`,
          homework_type: 'written',
          status: 'published',
          due_date: new Date(`2026-04-${(i % 30) + 1}`),
          published_at: new Date(),
        },
      });

      // Create completions for all students (70% completed, 30% not started)
      const completions = studentIds.map((studentId, idx) => ({
        tenant_id: TENANT_ID,
        homework_assignment_id: assignment.id,
        student_id: studentId,
        status: idx < NUM_STUDENTS * 0.7 ? ('completed' as const) : ('not_started' as const),
        completed_at: idx < NUM_STUDENTS * 0.7 ? new Date() : null,
      }));

      await prisma.homeworkCompletion.createMany({
        data: completions,
        skipDuplicates: true,
      });
    }
  }

  async function cleanupTestData() {
    await prisma.$executeRawUnsafe(
      `DELETE FROM homework_completions WHERE tenant_id = '${TENANT_ID}'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM homework_assignments WHERE tenant_id = '${TENANT_ID}'`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM class_enrolments WHERE tenant_id = '${TENANT_ID}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM students WHERE tenant_id = '${TENANT_ID}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM households WHERE tenant_id = '${TENANT_ID}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM classes WHERE tenant_id = '${TENANT_ID}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM subjects WHERE tenant_id = '${TENANT_ID}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM academic_years WHERE tenant_id = '${TENANT_ID}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = '${USER_ID}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM tenants WHERE id = '${TENANT_ID}'`);
  }

  describe('Completion Rate Aggregation', () => {
    it('should return completion rates within acceptable time', async () => {
      const startTime = Date.now();

      const result = await analyticsService.completionRates(TENANT_ID, {});

      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(MAX_RESPONSE_TIME_MS);
      console.log(`Completion rates query took ${duration}ms`); // eslint-disable-line no-console -- performance test output
    });

    it('should handle analytics for large date ranges', async () => {
      const startTime = Date.now();

      const result = await analyticsService.classPatterns(TENANT_ID, CLASS_ID, {
        date_from: '2026-04-01',
        date_to: '2026-04-30',
      });

      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(MAX_RESPONSE_TIME_MS * 2);
      console.log(`Class patterns query took ${duration}ms`); // eslint-disable-line no-console -- performance test output
    });
  });

  describe('Load Analysis', () => {
    it('should calculate load distribution efficiently', async () => {
      const startTime = Date.now();

      const result = await analyticsService.loadAnalysis(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
      });

      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(MAX_RESPONSE_TIME_MS);
      console.log(`Load analysis query took ${duration}ms`); // eslint-disable-line no-console -- performance test output
    });
  });

  describe('Non-Completers Query', () => {
    it('should identify non-completers quickly', async () => {
      const startTime = Date.now();

      const result = await analyticsService.nonCompleters(TENANT_ID, {});

      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(MAX_RESPONSE_TIME_MS);
      console.log(`Non-completers query took ${duration}ms`); // eslint-disable-line no-console -- performance test output
    });
  });
});
