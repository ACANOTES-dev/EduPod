/**
 * RLS Integration Tests — Homework Module
 *
 * Verifies tenant isolation for all 6 homework tables
 * Tests that cross-tenant queries return empty results
 */

import { Test, TestingModule } from '@nestjs/testing';

import { RequestContextService } from '../../common/services/request-context.service';
import { PrismaService } from '../prisma/prisma.service';

const TENANT_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLASS_A_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CLASS_B_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_A_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const _STUDENT_B_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const USER_A_ID = '11111111-1111-1111-1111-111111111111';
const USER_B_ID = '22222222-2222-2222-2222-222222222222';
const ACADEMIC_YEAR_ID = '33333333-3333-3333-3333-333333333333';
const HOUSEHOLD_A_ID = '44444444-4444-4444-4444-444444444444';

describe('Homework RLS Integration Tests', () => {
  let module: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [PrismaService, RequestContextService],
    }).compile();

    prisma = module.get(PrismaService);
    await cleanupTestData();
    await seedPrerequisites();

    // Create non-BYPASSRLS role for RLS testing (idempotent)
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN CREATE ROLE ${RLS_TEST_ROLE} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${RLS_TEST_ROLE}`);
    await prisma.$executeRawUnsafe(
      `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${RLS_TEST_ROLE}`,
    );
  });

  afterAll(async () => {
    await cleanupTestData();
    await cleanupPrerequisites();
    // Clean up RLS test role
    try {
      await prisma.$executeRawUnsafe(
        `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${RLS_TEST_ROLE}`,
      );
      await prisma.$executeRawUnsafe(`REVOKE USAGE ON SCHEMA public FROM ${RLS_TEST_ROLE}`);
      await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${RLS_TEST_ROLE}`);
    } catch (err) {
      console.error('[homework RLS role cleanup]', err);
    }
    await module.close();
  });

  async function seedPrerequisites() {
    // Tenants
    for (const t of [
      { id: TENANT_A_ID, name: 'RLS Tenant A', slug: 'rls-hw-a' },
      { id: TENANT_B_ID, name: 'RLS Tenant B', slug: 'rls-hw-b' },
    ]) {
      await prisma.tenant.upsert({
        where: { id: t.id },
        update: {},
        create: {
          id: t.id,
          name: t.name,
          slug: t.slug,
          default_locale: 'en',
          timezone: 'UTC',
          date_format: 'YYYY-MM-DD',
          currency_code: 'USD',
          academic_year_start_month: 9,
          status: 'active',
        },
      });
    }

    // Users
    for (const u of [
      { id: USER_A_ID, email: 'rls-hw-user-a@test.local' },
      { id: USER_B_ID, email: 'rls-hw-user-b@test.local' },
    ]) {
      await prisma.user.upsert({
        where: { id: u.id },
        update: {},
        create: {
          id: u.id,
          email: u.email,
          password_hash: '$2a$10$placeholder',
          first_name: 'RLS',
          last_name: 'User',
          global_status: 'active',
        },
      });
    }

    // Academic year (shared — referenced by both tenants, owned by tenant A for simplicity)
    await prisma.academicYear.upsert({
      where: { id: ACADEMIC_YEAR_ID },
      update: {},
      create: {
        id: ACADEMIC_YEAR_ID,
        tenant_id: TENANT_A_ID,
        name: 'RLS Test Year',
        start_date: new Date('2025-09-01'),
        end_date: new Date('2026-06-30'),
        status: 'active',
      },
    });

    // Classes
    for (const c of [
      { id: CLASS_A_ID, tenant_id: TENANT_A_ID, name: 'RLS Class A' },
      { id: CLASS_B_ID, tenant_id: TENANT_B_ID, name: 'RLS Class B' },
    ]) {
      await prisma.class.upsert({
        where: { id: c.id },
        update: {},
        create: {
          id: c.id,
          tenant_id: c.tenant_id,
          academic_year_id: ACADEMIC_YEAR_ID,
          name: c.name,
          status: 'active',
          max_capacity: 25,
        },
      });
    }

    // Household + student (for completion/diary tests)
    await prisma.household.upsert({
      where: { id: HOUSEHOLD_A_ID },
      update: {},
      create: { id: HOUSEHOLD_A_ID, tenant_id: TENANT_A_ID, household_name: 'RLS HW Household' },
    });

    await prisma.student.upsert({
      where: { id: STUDENT_A_ID },
      update: {},
      create: {
        id: STUDENT_A_ID,
        tenant_id: TENANT_A_ID,
        household_id: HOUSEHOLD_A_ID,
        first_name: 'RLS',
        last_name: 'Student',
        date_of_birth: new Date('2012-01-01'),
        status: 'active',
      },
    });
  }

  async function cleanupTestData() {
    const tenantIds = `'${TENANT_A_ID}','${TENANT_B_ID}'`;
    await prisma.$executeRawUnsafe(
      `DELETE FROM diary_parent_notes WHERE tenant_id IN (${tenantIds})`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM diary_notes WHERE tenant_id IN (${tenantIds})`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM homework_completions WHERE tenant_id IN (${tenantIds})`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM homework_attachments WHERE tenant_id IN (${tenantIds})`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM homework_assignments WHERE tenant_id IN (${tenantIds})`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM homework_recurrence_rules WHERE tenant_id IN (${tenantIds})`,
    );
  }

  async function cleanupPrerequisites() {
    const tenantIds = `'${TENANT_A_ID}','${TENANT_B_ID}'`;
    await prisma.$executeRawUnsafe(`DELETE FROM students WHERE tenant_id IN (${tenantIds})`);
    await prisma.$executeRawUnsafe(`DELETE FROM households WHERE tenant_id IN (${tenantIds})`);
    await prisma.$executeRawUnsafe(`DELETE FROM classes WHERE tenant_id IN (${tenantIds})`);
    await prisma.$executeRawUnsafe(`DELETE FROM academic_years WHERE tenant_id IN (${tenantIds})`);
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id IN ('${USER_A_ID}','${USER_B_ID}')`);
    await prisma.$executeRawUnsafe(`DELETE FROM tenants WHERE id IN (${tenantIds})`);
  }

  const RLS_TEST_ROLE = 'rls_hw_test_user';

  /**
   * Queries a table as a specific tenant using a non-BYPASSRLS role inside a transaction.
   * SET LOCAL only works within a transaction, and the default Prisma connection
   * is a superuser with BYPASSRLS, so we must switch to a restricted role.
   */
  async function queryAsTenant<T>(tenantId: string, sql: string): Promise<T[]> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tenantId}', true)`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
      const result = await tx.$queryRawUnsafe(sql);
      return result as T[];
    });
  }

  // Legacy helper kept for creating data (uses superuser, no RLS needed for inserts)
  async function withTenantContext(_tenantId: string, fn: () => Promise<void>) {
    await fn();
  }

  describe('homework_assignments RLS', () => {
    let _assignmentAId: string;
    let assignmentBId: string;

    beforeAll(async () => {
      await withTenantContext(TENANT_A_ID, async () => {
        const result = await prisma.homeworkAssignment.create({
          data: {
            tenant_id: TENANT_A_ID,
            class_id: CLASS_A_ID,
            academic_year_id: ACADEMIC_YEAR_ID,
            assigned_by_user_id: USER_A_ID,
            title: 'Tenant A Assignment',
            homework_type: 'written',
            status: 'published',
            due_date: new Date('2026-04-01'),
            published_at: new Date(),
          },
        });
        _assignmentAId = result.id;
      });

      await withTenantContext(TENANT_B_ID, async () => {
        const result = await prisma.homeworkAssignment.create({
          data: {
            tenant_id: TENANT_B_ID,
            class_id: CLASS_B_ID,
            academic_year_id: ACADEMIC_YEAR_ID,
            assigned_by_user_id: USER_B_ID,
            title: 'Tenant B Assignment',
            homework_type: 'reading',
            status: 'published',
            due_date: new Date('2026-04-02'),
            published_at: new Date(),
          },
        });
        assignmentBId = result.id;
      });
    });

    it('should return only Tenant A assignments when querying as Tenant A', async () => {
      const assignments = await queryAsTenant<{ title: string }>(
        TENANT_A_ID,
        `SELECT title FROM homework_assignments WHERE tenant_id = '${TENANT_A_ID}'`,
      );
      expect(assignments).toHaveLength(1);
      expect(assignments[0]!.title).toBe('Tenant A Assignment');
    });

    it('should return empty when Tenant A queries for Tenant B data', async () => {
      const assignments = await queryAsTenant<{ id: string }>(
        TENANT_A_ID,
        `SELECT id FROM homework_assignments WHERE id = '${assignmentBId}'`,
      );
      expect(assignments).toHaveLength(0);
    });
  });

  describe('homework_completions RLS', () => {
    let completionAId: string;
    let _assignmentAId: string;

    beforeAll(async () => {
      await withTenantContext(TENANT_A_ID, async () => {
        const assignment = await prisma.homeworkAssignment.create({
          data: {
            tenant_id: TENANT_A_ID,
            class_id: CLASS_A_ID,
            academic_year_id: ACADEMIC_YEAR_ID,
            assigned_by_user_id: USER_A_ID,
            title: 'Completion Test A',
            homework_type: 'written',
            status: 'published',
            due_date: new Date('2026-04-01'),
          },
        });
        _assignmentAId = assignment.id;

        const completion = await prisma.homeworkCompletion.create({
          data: {
            tenant_id: TENANT_A_ID,
            homework_assignment_id: assignment.id,
            student_id: STUDENT_A_ID,
            status: 'not_started',
          },
        });
        completionAId = completion.id;
      });
    });

    it('should return only Tenant A completions when querying as Tenant A', async () => {
      const completions = await queryAsTenant<{ student_id: string }>(
        TENANT_A_ID,
        `SELECT student_id::text FROM homework_completions WHERE tenant_id = '${TENANT_A_ID}'`,
      );
      expect(completions).toHaveLength(1);
      expect(completions[0]!.student_id).toBe(STUDENT_A_ID);
    });

    it('should return empty when Tenant B queries for Tenant A completion', async () => {
      const completions = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id FROM homework_completions WHERE id = '${completionAId}'`,
      );
      expect(completions).toHaveLength(0);
    });
  });

  describe('homework_attachments RLS', () => {
    let attachmentAId: string;

    beforeAll(async () => {
      await withTenantContext(TENANT_A_ID, async () => {
        const assignment = await prisma.homeworkAssignment.create({
          data: {
            tenant_id: TENANT_A_ID,
            class_id: CLASS_A_ID,
            academic_year_id: ACADEMIC_YEAR_ID,
            assigned_by_user_id: USER_A_ID,
            title: 'Attachment Test',
            homework_type: 'written',
            status: 'published',
            due_date: new Date('2026-04-01'),
          },
        });

        const attachment = await prisma.homeworkAttachment.create({
          data: {
            tenant_id: TENANT_A_ID,
            homework_assignment_id: assignment.id,
            attachment_type: 'file',
            file_name: 'test.pdf',
            file_key: 'test-key',
            mime_type: 'application/pdf',
            display_order: 0,
          },
        });
        attachmentAId = attachment.id;
      });
    });

    it('should return empty when Tenant B queries for Tenant A attachment', async () => {
      const attachments = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id FROM homework_attachments WHERE id = '${attachmentAId}'`,
      );
      expect(attachments).toHaveLength(0);
    });
  });

  describe('homework_recurrence_rules RLS', () => {
    let ruleAId: string;

    beforeAll(async () => {
      await withTenantContext(TENANT_A_ID, async () => {
        const rule = await prisma.homeworkRecurrenceRule.create({
          data: {
            tenant_id: TENANT_A_ID,
            frequency: 'weekly',
            interval: 1,
            days_of_week: [1, 3, 5],
            start_date: new Date('2026-04-01'),
            active: true,
          },
        });
        ruleAId = rule.id;
      });
    });

    it('should return empty when Tenant B queries for Tenant A rule', async () => {
      const rules = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id FROM homework_recurrence_rules WHERE id = '${ruleAId}'`,
      );
      expect(rules).toHaveLength(0);
    });
  });

  describe('diary_notes RLS', () => {
    let noteAId: string;

    beforeAll(async () => {
      await withTenantContext(TENANT_A_ID, async () => {
        const note = await prisma.diaryNote.create({
          data: {
            tenant_id: TENANT_A_ID,
            student_id: STUDENT_A_ID,
            note_date: new Date('2026-04-01'),
            content: 'Test note for Tenant A',
          },
        });
        noteAId = note.id;
      });
    });

    it('should return empty when Tenant B queries for Tenant A note', async () => {
      const notes = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id FROM diary_notes WHERE id = '${noteAId}'`,
      );
      expect(notes).toHaveLength(0);
    });
  });

  describe('diary_parent_notes RLS', () => {
    let parentNoteAId: string;

    beforeAll(async () => {
      await withTenantContext(TENANT_A_ID, async () => {
        const parentNote = await prisma.diaryParentNote.create({
          data: {
            tenant_id: TENANT_A_ID,
            student_id: STUDENT_A_ID,
            author_user_id: USER_A_ID,
            note_date: new Date('2026-04-01'),
            content: 'Test parent note for Tenant A',
            acknowledged: false,
          },
        });
        parentNoteAId = parentNote.id;
      });
    });

    it('should return empty when Tenant B queries for Tenant A parent note', async () => {
      const notes = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id FROM diary_parent_notes WHERE id = '${parentNoteAId}'`,
      );
      expect(notes).toHaveLength(0);
    });
  });
});
