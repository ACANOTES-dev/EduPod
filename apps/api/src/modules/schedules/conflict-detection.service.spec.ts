import { Test, TestingModule } from '@nestjs/testing';

import {
  ClassesReadFacade,
  MOCK_FACADE_PROVIDERS,
  RoomsReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { ConflictDetectionService } from './conflict-detection.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    class_id: 'class-1',
    academic_year_id: 'ay-1',
    room_id: 'room-1',
    teacher_staff_id: 'teacher-1',
    weekday: 1,
    start_time: '08:00',
    end_time: '09:00',
    effective_start_date: '2026-01-01',
    effective_end_date: '2026-06-30',
    ...overrides,
  };
}

function makeScheduleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched-existing',
    class_id: 'class-other',
    room_id: 'room-1',
    teacher_staff_id: 'teacher-1',
    weekday: 1,
    start_time: new Date('1970-01-01T08:00:00.000Z'),
    end_time: new Date('1970-01-01T09:00:00.000Z'),
    effective_start_date: new Date('2026-01-01'),
    effective_end_date: new Date('2026-06-30'),
    class_entity: { name: 'Other Class' },
    ...overrides,
  };
}

describe('ConflictDetectionService', () => {
  let service: ConflictDetectionService;
  let mockPrisma: {
    schedule: { findMany: jest.Mock };
  };

  const mockRoomsReadFacade = {
    findById: jest.fn().mockResolvedValue(null),
  };

  const mockClassesReadFacade = {
    findEnrolledStudentIds: jest.fn().mockResolvedValue([]),
    countEnrolledStudents: jest.fn().mockResolvedValue(0),
    findOtherClassEnrolmentsForStudents: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    mockPrisma = {
      schedule: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: RoomsReadFacade, useValue: mockRoomsReadFacade },
        { provide: ClassesReadFacade, useValue: mockClassesReadFacade },
        ConflictDetectionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ConflictDetectionService>(ConflictDetectionService);

    jest.clearAllMocks();
    // Reset default values after clearAllMocks
    mockPrisma.schedule.findMany.mockResolvedValue([]);
    mockRoomsReadFacade.findById.mockResolvedValue(null);
    mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue([]);
    mockClassesReadFacade.countEnrolledStudents.mockResolvedValue(0);
    mockClassesReadFacade.findOtherClassEnrolmentsForStudents.mockResolvedValue([]);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── 1. Hard conflict: exclusive room double-booking ────────────────────
  it('should detect hard conflict for exclusive room double-booking', async () => {
    // Room query for conflict check returns an overlapping schedule
    mockPrisma.schedule.findMany.mockResolvedValueOnce([makeScheduleRow()]);
    // roomsReadFacade.findById returns an exclusive room
    mockRoomsReadFacade.findById.mockResolvedValue({
      is_exclusive: true,
      name: 'Lab A',
      capacity: 30,
    });
    // No student enrolments for student-conflict path
    mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue([]);
    mockClassesReadFacade.countEnrolledStudents.mockResolvedValue(10);

    const result = await service.detectConflicts(TENANT_ID, makeEntry());

    expect(result.hard.length).toBeGreaterThanOrEqual(1);
    const roomConflict = result.hard.find((c) => c.category === 'room_double_booking');
    expect(roomConflict).toBeDefined();
    expect(roomConflict!.type).toBe('hard');
  });

  // ─── 2. Soft conflict: non-exclusive room double-booking ────────────────
  it('should detect soft conflict for non-exclusive room double-booking', async () => {
    mockPrisma.schedule.findMany.mockResolvedValueOnce([makeScheduleRow()]);
    mockRoomsReadFacade.findById.mockResolvedValue({
      is_exclusive: false,
      name: 'Hall B',
      capacity: 100,
    });
    mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue([]);
    mockClassesReadFacade.countEnrolledStudents.mockResolvedValue(10);

    const result = await service.detectConflicts(TENANT_ID, makeEntry());

    const softRoomConflict = result.soft.find((c) => c.category === 'room_shared_warning');
    expect(softRoomConflict).toBeDefined();
    expect(softRoomConflict!.type).toBe('soft');
    expect(result.hard.filter((c) => c.category === 'room_double_booking')).toHaveLength(0);
  });

  // ─── 3. Hard conflict: teacher double-booking ───────────────────────────
  it('should detect hard conflict for teacher double-booking', async () => {
    // Room query — no room conflicts
    mockPrisma.schedule.findMany
      .mockResolvedValueOnce([]) // room conflicts query
      .mockResolvedValueOnce([
        // teacher conflicts query
        makeScheduleRow({ teacher_staff_id: 'teacher-1' }),
      ])
      .mockResolvedValueOnce([]); // student schedule query (won't be reached since no student enrolments)

    mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue([]);
    mockRoomsReadFacade.findById.mockResolvedValue({
      capacity: 30,
      name: 'Room',
    });
    mockClassesReadFacade.countEnrolledStudents.mockResolvedValue(10);

    const result = await service.detectConflicts(TENANT_ID, makeEntry());

    const teacherConflict = result.hard.find((c) => c.category === 'teacher_double_booking');
    expect(teacherConflict).toBeDefined();
    expect(teacherConflict!.type).toBe('hard');
  });

  // ─── 4. Hard conflict: student double-booking ──────────────────────────
  it('should detect hard conflict for student double-booking', async () => {
    // No room conflicts
    mockPrisma.schedule.findMany.mockResolvedValueOnce([]);
    // No teacher conflicts
    mockPrisma.schedule.findMany.mockResolvedValueOnce([]);
    // Student enrolments for the proposed class (via facade)
    mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue([
      'student-1',
      'student-2',
    ]);
    // Other enrolments for those students (via facade)
    mockClassesReadFacade.findOtherClassEnrolmentsForStudents.mockResolvedValue([
      { class_id: 'class-other', student_id: 'student-1' },
    ]);
    // Schedule overlap for class-other
    mockPrisma.schedule.findMany.mockResolvedValueOnce([
      makeScheduleRow({ id: 'sched-other', class_id: 'class-other' }),
    ]);
    // Room capacity check
    mockRoomsReadFacade.findById.mockResolvedValue({
      capacity: 30,
      name: 'Room',
    });
    mockClassesReadFacade.countEnrolledStudents.mockResolvedValue(10);

    const result = await service.detectConflicts(TENANT_ID, makeEntry());

    const studentConflict = result.hard.find((c) => c.category === 'student_double_booking');
    expect(studentConflict).toBeDefined();
    expect(studentConflict!.type).toBe('hard');
    expect(studentConflict!.message).toContain('1 student(s)');
  });

  // ─── 5. Soft conflict: room over capacity ──────────────────────────────
  it('should detect soft conflict for room over capacity', async () => {
    // No room schedule conflicts
    mockPrisma.schedule.findMany.mockResolvedValueOnce([]);
    // No teacher conflicts
    mockPrisma.schedule.findMany.mockResolvedValueOnce([]);
    // No student enrolments for student-conflict path
    mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue([]);
    // Room with small capacity
    mockRoomsReadFacade.findById.mockResolvedValue({
      capacity: 5,
      name: 'Small Room',
    });
    // Class has 20 students enrolled
    mockClassesReadFacade.countEnrolledStudents.mockResolvedValue(20);

    const result = await service.detectConflicts(TENANT_ID, makeEntry());

    const capacityConflict = result.soft.find((c) => c.category === 'room_over_capacity');
    expect(capacityConflict).toBeDefined();
    expect(capacityConflict!.type).toBe('soft');
    expect(capacityConflict!.message).toContain('20 students');
    expect(capacityConflict!.message).toContain('capacity is 5');
  });

  // ─── 6. Exclude self from conflict check on update ─────────────────────
  it('should exclude self from conflict check on update', async () => {
    // Return no conflicts when the ID is excluded
    mockPrisma.schedule.findMany.mockResolvedValue([]);
    mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue([]);
    mockRoomsReadFacade.findById.mockResolvedValue({ capacity: 30, name: 'Room' });
    mockClassesReadFacade.countEnrolledStudents.mockResolvedValue(10);

    await service.detectConflicts(TENANT_ID, makeEntry(), 'sched-self');

    // Verify the schedule.findMany was called with { id: { not: 'sched-self' } } in the where clause
    const firstCall = mockPrisma.schedule.findMany.mock.calls[0][0];
    expect(firstCall.where.id).toEqual({ not: 'sched-self' });
  });

  // ─── 7. Handle open-ended date ranges (null effective_end_date) ────────
  it('should handle open-ended date ranges (null effective_end_date)', async () => {
    mockPrisma.schedule.findMany.mockResolvedValue([]);
    mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue([]);
    mockRoomsReadFacade.findById.mockResolvedValue({ capacity: 30, name: 'Room' });
    mockClassesReadFacade.countEnrolledStudents.mockResolvedValue(10);

    const entry = makeEntry({ effective_end_date: null });

    await service.detectConflicts(TENANT_ID, entry);

    // When effective_end_date is null, the AND clause should be empty ([])
    // This means the query doesn't restrict by proposed end date — open-ended
    const firstCall = mockPrisma.schedule.findMany.mock.calls[0][0];
    expect(firstCall.where.AND).toEqual([]);
  });

  // ─── 8. No conflict when time ranges don't overlap ─────────────────────
  it('should NOT detect conflict when time ranges do not overlap', async () => {
    // Return empty for all schedule queries — no overlapping times found
    mockPrisma.schedule.findMany.mockResolvedValue([]);
    mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue([]);
    mockRoomsReadFacade.findById.mockResolvedValue({ capacity: 30, name: 'Room' });
    mockClassesReadFacade.countEnrolledStudents.mockResolvedValue(10);

    // Proposed: 08:00-09:00, existing would be 10:00-11:00 (no overlap)
    // Since the Prisma query filters by time overlap, returning empty means no overlap
    const result = await service.detectConflicts(TENANT_ID, makeEntry());

    expect(result.hard).toHaveLength(0);
    expect(result.soft).toHaveLength(0);
  });

  // ─── 9. No conflict on different weekdays ──────────────────────────────
  it('should NOT detect conflict on different weekdays', async () => {
    mockPrisma.schedule.findMany.mockResolvedValue([]);
    mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue([]);
    mockRoomsReadFacade.findById.mockResolvedValue({ capacity: 30, name: 'Room' });
    mockClassesReadFacade.countEnrolledStudents.mockResolvedValue(10);

    const entry = makeEntry({ weekday: 3 }); // Wednesday vs Monday existing

    const result = await service.detectConflicts(TENANT_ID, entry);

    // The Prisma where clause filters by weekday, so different weekdays return no matches
    const firstCall = mockPrisma.schedule.findMany.mock.calls[0][0];
    expect(firstCall.where.weekday).toBe(3);
    expect(result.hard).toHaveLength(0);
    expect(result.soft).toHaveLength(0);
  });

  // ─── 10. No conflict when date ranges don't overlap ────────────────────
  it('should NOT detect conflict when date ranges do not overlap', async () => {
    mockPrisma.schedule.findMany.mockResolvedValue([]);
    mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue([]);
    mockRoomsReadFacade.findById.mockResolvedValue({ capacity: 30, name: 'Room' });
    mockClassesReadFacade.countEnrolledStudents.mockResolvedValue(10);

    // Proposed entry with specific date range — Prisma query handles date overlap filter
    const entry = makeEntry({
      effective_start_date: '2027-01-01',
      effective_end_date: '2027-06-30',
    });

    const result = await service.detectConflicts(TENANT_ID, entry);

    // The where clause includes date range overlap conditions
    const firstCall = mockPrisma.schedule.findMany.mock.calls[0][0];
    expect(firstCall.where.OR).toEqual([
      { effective_end_date: null },
      { effective_end_date: { gte: new Date('2027-01-01') } },
    ]);
    expect(firstCall.where.AND).toEqual([
      { effective_start_date: { lte: new Date('2027-06-30') } },
    ]);
    expect(result.hard).toHaveLength(0);
    expect(result.soft).toHaveLength(0);
  });
});
