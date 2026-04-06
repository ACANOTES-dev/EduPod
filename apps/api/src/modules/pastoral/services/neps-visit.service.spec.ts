import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { NepsVisitService } from './neps-visit.service';
import { PastoralEventService } from './pastoral-event.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const VISIT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const VISIT_STUDENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const REFERRAL_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  pastoralNepsVisit: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  pastoralNepsVisitStudent: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeVisit = (overrides: Record<string, unknown> = {}) => ({
  id: VISIT_ID,
  tenant_id: TENANT_ID,
  visit_date: new Date('2026-03-20T00:00:00Z'),
  psychologist_name: 'Dr. Smith',
  notes: null,
  created_by_user_id: ACTOR_USER_ID,
  created_at: new Date('2026-03-20T10:00:00Z'),
  updated_at: new Date('2026-03-20T10:00:00Z'),
  ...overrides,
});

const makeVisitWithStudents = (overrides: Record<string, unknown> = {}) => ({
  ...makeVisit(),
  students: [
    {
      id: VISIT_STUDENT_ID,
      student_id: STUDENT_ID,
      referral_id: null,
      outcome: null,
      created_at: new Date('2026-03-20T10:00:00Z'),
      student: { id: STUDENT_ID, first_name: 'John', last_name: 'Doe' },
    },
  ],
  ...overrides,
});

const makeVisitStudent = (overrides: Record<string, unknown> = {}) => ({
  id: VISIT_STUDENT_ID,
  tenant_id: TENANT_ID,
  visit_id: VISIT_ID,
  student_id: STUDENT_ID,
  referral_id: null,
  outcome: null,
  created_at: new Date('2026-03-20T10:00:00Z'),
  ...overrides,
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('NepsVisitService', () => {
  let service: NepsVisitService;
  let mockEventService: { write: jest.Mock };

  beforeEach(async () => {
    mockEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NepsVisitService,
        { provide: PrismaService, useValue: {} },
        { provide: PastoralEventService, useValue: mockEventService },
      ],
    }).compile();

    service = module.get<NepsVisitService>(NepsVisitService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ─────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create visit and fire audit event', async () => {
      const visit = makeVisit();
      mockRlsTx.pastoralNepsVisit.create.mockResolvedValue(visit);

      const result = await service.create(TENANT_ID, ACTOR_USER_ID, {
        visit_date: '2026-03-20',
        psychologist_name: 'Dr. Smith',
      });

      expect(result.id).toBe(VISIT_ID);
      expect(result.psychologist_name).toBe('Dr. Smith');
      expect(mockRlsTx.pastoralNepsVisit.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          visit_date: expect.any(Date),
          psychologist_name: 'Dr. Smith',
          notes: null,
          created_by_user_id: ACTOR_USER_ID,
        },
      });
      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'neps_visit_created',
          entity_type: 'referral',
          entity_id: VISIT_ID,
          actor_user_id: ACTOR_USER_ID,
          payload: expect.objectContaining({
            visit_id: VISIT_ID,
            visit_date: '2026-03-20',
            psychologist_name: 'Dr. Smith',
          }),
        }),
      );
    });
  });

  // ─── list ───────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return paginated visits with student count', async () => {
      const visits = [
        makeVisit({ _count: { students: 2 } }),
        makeVisit({ id: 'visit-2', _count: { students: 0 } }),
      ];
      mockRlsTx.pastoralNepsVisit.findMany.mockResolvedValue(visits);
      mockRlsTx.pastoralNepsVisit.count.mockResolvedValue(2);

      const result = await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(mockRlsTx.pastoralNepsVisit.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        orderBy: { visit_date: 'desc' },
        skip: 0,
        take: 20,
        include: { _count: { select: { students: true } } },
      });
    });

    it('should filter by date range', async () => {
      mockRlsTx.pastoralNepsVisit.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralNepsVisit.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        from_date: '2026-03-01',
        to_date: '2026-03-31',
        page: 1,
        pageSize: 20,
      });

      expect(mockRlsTx.pastoralNepsVisit.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          visit_date: {
            gte: new Date('2026-03-01'),
            lte: new Date('2026-03-31'),
          },
        },
        orderBy: { visit_date: 'desc' },
        skip: 0,
        take: 20,
        include: { _count: { select: { students: true } } },
      });
    });
  });

  // ─── get ────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('should return visit with linked students', async () => {
      const visitWithStudents = makeVisitWithStudents();
      mockRlsTx.pastoralNepsVisit.findFirst.mockResolvedValue(visitWithStudents);

      const result = await service.get(TENANT_ID, VISIT_ID);

      expect(result.id).toBe(VISIT_ID);
      expect(result.students).toHaveLength(1);
      const firstStudent = result.students[0]!;
      expect(firstStudent.student_id).toBe(STUDENT_ID);
      expect(firstStudent.student?.first_name).toBe('John');
      expect(mockRlsTx.pastoralNepsVisit.findFirst).toHaveBeenCalledWith({
        where: { id: VISIT_ID, tenant_id: TENANT_ID },
        include: {
          students: {
            include: {
              student: {
                select: { id: true, first_name: true, last_name: true },
              },
            },
          },
        },
      });
    });

    it('should throw NotFoundException when not found', async () => {
      mockRlsTx.pastoralNepsVisit.findFirst.mockResolvedValue(null);

      await expect(service.get(TENANT_ID, VISIT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update visit fields', async () => {
      const existing = makeVisit();
      mockRlsTx.pastoralNepsVisit.findFirst.mockResolvedValue(existing);
      const updated = makeVisit({
        psychologist_name: 'Dr. Jones',
        notes: 'Updated notes',
      });
      mockRlsTx.pastoralNepsVisit.update.mockResolvedValue(updated);

      const result = await service.update(TENANT_ID, VISIT_ID, {
        psychologist_name: 'Dr. Jones',
        notes: 'Updated notes',
      });

      expect(result.psychologist_name).toBe('Dr. Jones');
      expect(result.notes).toBe('Updated notes');
      expect(mockRlsTx.pastoralNepsVisit.update).toHaveBeenCalledWith({
        where: { id: VISIT_ID },
        data: {
          psychologist_name: 'Dr. Jones',
          notes: 'Updated notes',
        },
      });
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete visit', async () => {
      const existing = makeVisit();
      mockRlsTx.pastoralNepsVisit.findFirst.mockResolvedValue(existing);
      mockRlsTx.pastoralNepsVisit.delete.mockResolvedValue(existing);

      await service.remove(TENANT_ID, VISIT_ID);

      expect(mockRlsTx.pastoralNepsVisit.delete).toHaveBeenCalledWith({
        where: { id: VISIT_ID },
      });
    });

    it('should throw NotFoundException when not found', async () => {
      mockRlsTx.pastoralNepsVisit.findFirst.mockResolvedValue(null);

      await expect(service.remove(TENANT_ID, VISIT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── addStudent ─────────────────────────────────────────────────────────

  describe('addStudent', () => {
    it('should link student to visit', async () => {
      const visit = makeVisit();
      mockRlsTx.pastoralNepsVisit.findFirst.mockResolvedValue(visit);
      const visitStudent = makeVisitStudent({ referral_id: REFERRAL_ID });
      mockRlsTx.pastoralNepsVisitStudent.create.mockResolvedValue(visitStudent);

      const result = await service.addStudent(TENANT_ID, VISIT_ID, {
        student_id: STUDENT_ID,
        referral_id: REFERRAL_ID,
      });

      expect(result.id).toBe(VISIT_STUDENT_ID);
      expect(result.student_id).toBe(STUDENT_ID);
      expect(result.referral_id).toBe(REFERRAL_ID);
      expect(mockRlsTx.pastoralNepsVisitStudent.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          visit_id: VISIT_ID,
          student_id: STUDENT_ID,
          referral_id: REFERRAL_ID,
        },
      });
    });

    it('should throw ConflictException on duplicate student link', async () => {
      const visit = makeVisit();
      mockRlsTx.pastoralNepsVisit.findFirst.mockResolvedValue(visit);

      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['tenant_id', 'visit_id', 'student_id'] },
      });
      mockRlsTx.pastoralNepsVisitStudent.create.mockRejectedValue(prismaError);

      await expect(
        service.addStudent(TENANT_ID, VISIT_ID, {
          student_id: STUDENT_ID,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── updateStudentOutcome ───────────────────────────────────────────────

  describe('updateStudentOutcome', () => {
    it('should update outcome text', async () => {
      const existing = makeVisitStudent();
      mockRlsTx.pastoralNepsVisitStudent.findFirst.mockResolvedValue(existing);
      const updated = makeVisitStudent({ outcome: 'Positive progress observed' });
      mockRlsTx.pastoralNepsVisitStudent.update.mockResolvedValue(updated);

      const result = await service.updateStudentOutcome(TENANT_ID, VISIT_STUDENT_ID, {
        outcome: 'Positive progress observed',
      });

      expect(result.outcome).toBe('Positive progress observed');
      expect(mockRlsTx.pastoralNepsVisitStudent.update).toHaveBeenCalledWith({
        where: { id: VISIT_STUDENT_ID },
        data: { outcome: 'Positive progress observed' },
      });
    });
  });

  // ─── removeStudent ──────────────────────────────────────────────────────

  describe('removeStudent', () => {
    it('should remove student link', async () => {
      const existing = makeVisitStudent();
      mockRlsTx.pastoralNepsVisitStudent.findFirst.mockResolvedValue(existing);
      mockRlsTx.pastoralNepsVisitStudent.delete.mockResolvedValue(existing);

      await service.removeStudent(TENANT_ID, VISIT_STUDENT_ID);

      expect(mockRlsTx.pastoralNepsVisitStudent.delete).toHaveBeenCalledWith({
        where: { id: VISIT_STUDENT_ID },
      });
    });

    it('should throw NotFoundException when visit-student not found', async () => {
      mockRlsTx.pastoralNepsVisitStudent.findFirst.mockResolvedValue(null);

      await expect(service.removeStudent(TENANT_ID, VISIT_STUDENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── update — not found ────────────────────────────────────────────

  describe('update — not found', () => {
    it('should throw NotFoundException when visit not found', async () => {
      mockRlsTx.pastoralNepsVisit.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, VISIT_ID, { psychologist_name: 'Dr. New' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update — individual field branches ────────────────────────────

  describe('update — individual field branches', () => {
    it('should update only visit_date when provided', async () => {
      mockRlsTx.pastoralNepsVisit.findFirst.mockResolvedValue(makeVisit());
      mockRlsTx.pastoralNepsVisit.update.mockResolvedValue(
        makeVisit({ visit_date: new Date('2026-06-01') }),
      );

      await service.update(TENANT_ID, VISIT_ID, { visit_date: '2026-06-01' });

      expect(mockRlsTx.pastoralNepsVisit.update).toHaveBeenCalledWith({
        where: { id: VISIT_ID },
        data: { visit_date: new Date('2026-06-01') },
      });
    });

    it('should update only notes when provided', async () => {
      mockRlsTx.pastoralNepsVisit.findFirst.mockResolvedValue(makeVisit());
      mockRlsTx.pastoralNepsVisit.update.mockResolvedValue(makeVisit({ notes: 'New notes' }));

      await service.update(TENANT_ID, VISIT_ID, { notes: 'New notes' });

      expect(mockRlsTx.pastoralNepsVisit.update).toHaveBeenCalledWith({
        where: { id: VISIT_ID },
        data: { notes: 'New notes' },
      });
    });
  });

  // ─── addStudent — not found and error rethrow ──────────────────────

  describe('addStudent — not found', () => {
    it('should throw NotFoundException when visit not found', async () => {
      mockRlsTx.pastoralNepsVisit.findFirst.mockResolvedValue(null);

      await expect(
        service.addStudent(TENANT_ID, VISIT_ID, { student_id: STUDENT_ID }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should re-throw non-P2002 errors from create', async () => {
      mockRlsTx.pastoralNepsVisit.findFirst.mockResolvedValue(makeVisit());
      mockRlsTx.pastoralNepsVisitStudent.create.mockRejectedValue(new Error('Connection lost'));

      await expect(
        service.addStudent(TENANT_ID, VISIT_ID, { student_id: STUDENT_ID }),
      ).rejects.toThrow('Connection lost');
    });
  });

  // ─── updateStudentOutcome — not found and null outcome ─────────────

  describe('updateStudentOutcome — not found', () => {
    it('should throw NotFoundException when visit-student not found', async () => {
      mockRlsTx.pastoralNepsVisitStudent.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStudentOutcome(TENANT_ID, VISIT_STUDENT_ID, {
          outcome: 'Some outcome',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should set outcome to null when outcome is undefined', async () => {
      mockRlsTx.pastoralNepsVisitStudent.findFirst.mockResolvedValue(
        makeVisitStudent({ outcome: 'Old outcome' }),
      );
      mockRlsTx.pastoralNepsVisitStudent.update.mockResolvedValue(
        makeVisitStudent({ outcome: null }),
      );

      await service.updateStudentOutcome(TENANT_ID, VISIT_STUDENT_ID, {});

      expect(mockRlsTx.pastoralNepsVisitStudent.update).toHaveBeenCalledWith({
        where: { id: VISIT_STUDENT_ID },
        data: { outcome: null },
      });
    });
  });

  // ─── list — partial date filters ──────────────────────────────────

  describe('list — partial date filters', () => {
    it('should filter by from_date only', async () => {
      mockRlsTx.pastoralNepsVisit.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralNepsVisit.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        from_date: '2026-03-01',
        page: 1,
        pageSize: 20,
      });

      expect(mockRlsTx.pastoralNepsVisit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenant_id: TENANT_ID,
            visit_date: { gte: new Date('2026-03-01') },
          },
        }),
      );
    });

    it('should filter by to_date only', async () => {
      mockRlsTx.pastoralNepsVisit.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralNepsVisit.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        to_date: '2026-03-31',
        page: 1,
        pageSize: 20,
      });

      expect(mockRlsTx.pastoralNepsVisit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenant_id: TENANT_ID,
            visit_date: { lte: new Date('2026-03-31') },
          },
        }),
      );
    });
  });

  // ─── create — with notes ──────────────────────────────────────────

  describe('create — with notes', () => {
    it('should pass notes when provided', async () => {
      mockRlsTx.pastoralNepsVisit.create.mockResolvedValue(makeVisit({ notes: 'Visit notes' }));

      const result = await service.create(TENANT_ID, ACTOR_USER_ID, {
        visit_date: '2026-03-20',
        psychologist_name: 'Dr. Smith',
        notes: 'Visit notes',
      });

      expect(result.notes).toBe('Visit notes');
      expect(mockRlsTx.pastoralNepsVisit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ notes: 'Visit notes' }),
      });
    });
  });
});
