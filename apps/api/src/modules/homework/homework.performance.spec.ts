/**
 * Performance Load Tests — Homework Module
 *
 * Simulates 200 students × 50 homework assignments
 * Verifies response times under load
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HomeworkAnalyticsService } from './homework-analytics.service';
import { PrismaService } from '../prisma/prisma.service';

const TENANT_ID = 'load-test-tenant-000000000001';
const ACADEMIC_YEAR_ID = 'load-test-year-000000000001';
const CLASS_ID = 'load-test-class-000000000001';
const SUBJECT_ID = 'load-test-subject-000000001';
const USER_ID = 'load-test-user-000000000001';

describe('Homework Performance Load Tests', () => {
  let module: TestingModule;
  let analyticsService: HomeworkAnalyticsService;
  let prisma: PrismaService;

  const NUM_STUDENTS = 200;
  const NUM_ASSIGNMENTS = 50;
  const MAX_RESPONSE_TIME_MS = 500;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [HomeworkAnalyticsService, PrismaService],
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
    // Create students
    const studentIds: string[] = [];
    for (let i = 0; i < NUM_STUDENTS; i++) {
      const student = await prisma.student.create({
        data: {
          tenant_id: TENANT_ID,
          first_name: `Student${i}`,
          last_name: `Test${i}`,
          student_number: `STU${i.toString().padStart(6, '0')}`,
          status: 'active',
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
          academic_year_id: ACADEMIC_YEAR_ID,
          status: 'active',
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
        status: idx < NUM_STUDENTS * 0.7 ? 'completed' : 'not_started',
        completed_at: idx < NUM_STUDENTS * 0.7 ? new Date() : null,
      }));

      await prisma.homeworkCompletion.createMany({
        data: completions,
        skipDuplicates: true,
      });
    }
  }

  async function cleanupTestData() {
    await prisma.$executeRaw`DELETE FROM homework_completions WHERE tenant_id = ${TENANT_ID}`;
    await prisma.$executeRaw`DELETE FROM homework_assignments WHERE tenant_id = ${TENANT_ID}`;
    await prisma.$executeRaw`DELETE FROM class_enrolments WHERE tenant_id = ${TENANT_ID}`;
    await prisma.$executeRaw`DELETE FROM students WHERE tenant_id = ${TENANT_ID}`;
  }

  describe('Completion Rate Aggregation', () => {
    it('should return completion rates within acceptable time', async () => {
      const startTime = Date.now();

      const result = await analyticsService.getCompletionRatesByClass(TENANT_ID, {
        class_id: CLASS_ID,
      });

      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(MAX_RESPONSE_TIME_MS);
      console.log(`Completion rates query took ${duration}ms`);
    });

    it('should handle analytics for large date ranges', async () => {
      const startTime = Date.now();

      const result = await analyticsService.getCompletionTrends(TENANT_ID, {
        class_id: CLASS_ID,
        start_date: '2026-04-01',
        end_date: '2026-04-30',
      });

      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(MAX_RESPONSE_TIME_MS * 2);
      console.log(`Trends query took ${duration}ms`);
    });
  });

  describe('Load Analysis', () => {
    it('should calculate load distribution efficiently', async () => {
      const startTime = Date.now();

      const result = await analyticsService.getLoadAnalysis(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
      });

      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(MAX_RESPONSE_TIME_MS);
      console.log(`Load analysis query took ${duration}ms`);
    });
  });

  describe('Non-Completers Query', () => {
    it('should identify non-completers quickly', async () => {
      const startTime = Date.now();

      const result = await analyticsService.getNonCompleters(TENANT_ID, {
        class_id: CLASS_ID,
        threshold_percentage: 50,
      });

      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(MAX_RESPONSE_TIME_MS);
      console.log(`Non-completers query took ${duration}ms`);
    });
  });
});
