/**
 * RLS Integration Tests — Homework Module
 *
 * Verifies tenant isolation for all 6 homework tables
 * Tests that cross-tenant queries return empty results
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';

const TENANT_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLASS_A_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CLASS_B_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_A_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const STUDENT_B_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const USER_A_ID = '11111111-1111-1111-1111-111111111111';
const USER_B_ID = '22222222-2222-2222-2222-222222222222';
const ACADEMIC_YEAR_ID = '33333333-3333-3333-3333-333333333333';

describe('Homework RLS Integration Tests', () => {
  let module: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    prisma = module.get(PrismaService);
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await module.close();
  });

  async function cleanupTestData() {
    await prisma.$executeRaw`DELETE FROM diary_parent_notes WHERE tenant_id IN (${TENANT_A_ID}, ${TENANT_B_ID})`;
    await prisma.$executeRaw`DELETE FROM diary_notes WHERE tenant_id IN (${TENANT_A_ID}, ${TENANT_B_ID})`;
    await prisma.$executeRaw`DELETE FROM homework_completions WHERE tenant_id IN (${TENANT_A_ID}, ${TENANT_B_ID})`;
    await prisma.$executeRaw`DELETE FROM homework_attachments WHERE tenant_id IN (${TENANT_A_ID}, ${TENANT_B_ID})`;
    await prisma.$executeRaw`DELETE FROM homework_assignments WHERE tenant_id IN (${TENANT_A_ID}, ${TENANT_B_ID})`;
    await prisma.$executeRaw`DELETE FROM homework_recurrence_rules WHERE tenant_id IN (${TENANT_A_ID}, ${TENANT_B_ID})`;
  }

  async function withTenantContext(tenantId: string, fn: () => Promise<void>) {
    await prisma.$executeRaw`SET LOCAL app.current_tenant_id = ${tenantId}`;
    try {
      await fn();
    } finally {
      await prisma.$executeRaw`SET LOCAL app.current_tenant_id = ''`;
    }
  }

  describe('homework_assignments RLS', () => {
    let assignmentAId: string;
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
        assignmentAId = result.id;
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
      await withTenantContext(TENANT_A_ID, async () => {
        const assignments = await prisma.homeworkAssignment.findMany({
          where: { tenant_id: TENANT_A_ID },
        });
        expect(assignments).toHaveLength(1);
        expect(assignments[0].title).toBe('Tenant A Assignment');
      });
    });

    it('should return empty when Tenant A queries for Tenant B data', async () => {
      await withTenantContext(TENANT_A_ID, async () => {
        const assignments = await prisma.homeworkAssignment.findMany({
          where: { id: assignmentBId },
        });
        expect(assignments).toHaveLength(0);
      });
    });
  });

  describe('homework_completions RLS', () => {
    let completionAId: string;
    let assignmentAId: string;

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
        assignmentAId = assignment.id;

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
      await withTenantContext(TENANT_A_ID, async () => {
        const completions = await prisma.homeworkCompletion.findMany({
          where: { tenant_id: TENANT_A_ID },
        });
        expect(completions).toHaveLength(1);
        expect(completions[0].student_id).toBe(STUDENT_A_ID);
      });
    });

    it('should return empty when Tenant B queries for Tenant A completion', async () => {
      await withTenantContext(TENANT_B_ID, async () => {
        const completion = await prisma.homeworkCompletion.findFirst({
          where: { id: completionAId },
        });
        expect(completion).toBeNull();
      });
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
      await withTenantContext(TENANT_B_ID, async () => {
        const attachment = await prisma.homeworkAttachment.findFirst({
          where: { id: attachmentAId },
        });
        expect(attachment).toBeNull();
      });
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
      await withTenantContext(TENANT_B_ID, async () => {
        const rule = await prisma.homeworkRecurrenceRule.findFirst({
          where: { id: ruleAId },
        });
        expect(rule).toBeNull();
      });
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
      await withTenantContext(TENANT_B_ID, async () => {
        const note = await prisma.diaryNote.findFirst({
          where: { id: noteAId },
        });
        expect(note).toBeNull();
      });
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
      await withTenantContext(TENANT_B_ID, async () => {
        const note = await prisma.diaryParentNote.findFirst({
          where: { id: parentNoteAId },
        });
        expect(note).toBeNull();
      });
    });
  });
});
