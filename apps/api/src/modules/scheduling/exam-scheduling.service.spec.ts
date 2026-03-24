import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ExamSchedulingService } from './exam-scheduling.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SESSION_ID = 'session-1';
const PERIOD_ID = 'period-1';

const mockTx = {
  examSession: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  examSlot: {
    create: jest.fn(),
    update: jest.fn(),
  },
  examInvigilation: {
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

const makePlanningSession = (status = 'planning') => ({
  id: SESSION_ID,
  status,
  start_date: new Date('2026-06-01'),
  end_date: new Date('2026-06-10'),
  academic_period_id: PERIOD_ID,
  name: 'Summer Exams 2026',
  created_at: new Date('2026-03-01'),
  updated_at: new Date('2026-03-01'),
  exam_slots: [],
});

describe('ExamSchedulingService', () => {
  let service: ExamSchedulingService;
  let mockPrisma: {
    academicPeriod: { findFirst: jest.Mock };
    examSession: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    examSlot: { findMany: jest.Mock };
    room: { findMany: jest.Mock };
    staffProfile: { findMany: jest.Mock };
    examInvigilation: { count: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      academicPeriod: {
        findFirst: jest.fn().mockResolvedValue({ id: PERIOD_ID }),
      },
      examSession: {
        findFirst: jest.fn().mockResolvedValue(makePlanningSession()),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      examSlot: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      room: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      staffProfile: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      examInvigilation: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    mockTx.examSession.create.mockResolvedValue({
      id: SESSION_ID,
      status: 'planning',
      created_at: new Date('2026-03-01'),
    });
    mockTx.examSession.update.mockResolvedValue({
      id: SESSION_ID,
      name: 'Updated Name',
      status: 'planning',
      updated_at: new Date('2026-03-02'),
    });
    mockTx.examSlot.create.mockResolvedValue({
      id: 'slot-1',
      created_at: new Date('2026-03-01'),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExamSchedulingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ExamSchedulingService>(ExamSchedulingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createExamSession ────────────────────────────────────────────────────

  describe('createExamSession', () => {
    it('should create a new exam session in planning status', async () => {
      const result = await service.createExamSession(TENANT_ID, {
        academic_period_id: PERIOD_ID,
        name: 'Summer Exams 2026',
        start_date: '2026-06-01',
        end_date: '2026-06-10',
      });

      expect(result.id).toBe(SESSION_ID);
      expect(result.status).toBe('planning');
      expect(mockTx.examSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            academic_period_id: PERIOD_ID,
            status: 'planning',
          }),
        }),
      );
    });

    it('should throw NotFoundException when academic period does not exist', async () => {
      mockPrisma.academicPeriod.findFirst.mockResolvedValue(null);

      await expect(
        service.createExamSession(TENANT_ID, {
          academic_period_id: 'nonexistent',
          name: 'Test',
          start_date: '2026-06-01',
          end_date: '2026-06-10',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateExamSession ────────────────────────────────────────────────────

  describe('updateExamSession', () => {
    it('should update a planning session', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('planning'));

      const result = await service.updateExamSession(TENANT_ID, SESSION_ID, {
        name: 'Updated Name',
      });

      expect(result.name).toBe('Updated Name');
      expect(mockTx.examSession.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException when session is published', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('published'));

      await expect(
        service.updateExamSession(TENANT_ID, SESSION_ID, { name: 'Updated' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when session is completed', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('completed'));

      await expect(
        service.updateExamSession(TENANT_ID, SESSION_ID, { name: 'Updated' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when session does not exist', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(null);

      await expect(
        service.updateExamSession(TENANT_ID, 'nonexistent', { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deleteExamSession ────────────────────────────────────────────────────

  describe('deleteExamSession', () => {
    it('should delete a planning session', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('planning'));

      const result = await service.deleteExamSession(TENANT_ID, SESSION_ID);

      expect(result.deleted).toBe(true);
      expect(mockTx.examSession.delete).toHaveBeenCalled();
    });

    it('should throw BadRequestException when session is published', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('published'));

      await expect(
        service.deleteExamSession(TENANT_ID, SESSION_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── addExamSlot ──────────────────────────────────────────────────────────

  describe('addExamSlot', () => {
    it('should add a slot within the session date range', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession());

      const result = await service.addExamSlot(TENANT_ID, SESSION_ID, {
        subject_id: 'sub-1',
        year_group_id: 'yg-1',
        date: '2026-06-05',
        start_time: '09:00',
        end_time: '11:00',
        duration_minutes: 120,
        student_count: 30,
      });

      expect(result.exam_session_id).toBe(SESSION_ID);
      expect(result.subject_id).toBe('sub-1');
      expect(mockTx.examSlot.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException when slot date is outside session bounds', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession());

      await expect(
        service.addExamSlot(TENANT_ID, SESSION_ID, {
          subject_id: 'sub-1',
          year_group_id: 'yg-1',
          date: '2026-07-01', // outside June 1–10
          start_time: '09:00',
          end_time: '11:00',
          duration_minutes: 120,
          student_count: 30,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when session does not exist', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(null);

      await expect(
        service.addExamSlot(TENANT_ID, 'nonexistent', {
          subject_id: 'sub-1',
          year_group_id: 'yg-1',
          date: '2026-06-05',
          start_time: '09:00',
          end_time: '11:00',
          duration_minutes: 120,
          student_count: 30,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── publishExamSchedule ──────────────────────────────────────────────────

  describe('publishExamSchedule', () => {
    it('should publish a planning session', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('planning'));

      const result = await service.publishExamSchedule(TENANT_ID, SESSION_ID);

      expect(result.status).toBe('published');
      expect(mockTx.examSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'published' }),
        }),
      );
    });

    it('should throw BadRequestException when session is already published', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('published'));

      await expect(
        service.publishExamSchedule(TENANT_ID, SESSION_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when session is completed', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('completed'));

      await expect(
        service.publishExamSchedule(TENANT_ID, SESSION_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when session does not exist', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(null);

      await expect(
        service.publishExamSchedule(TENANT_ID, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
