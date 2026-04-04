import { Test, TestingModule } from '@nestjs/testing';

import { PersonalTimetableService } from './personal-timetable.service';
import { SchedulingPublicController } from './scheduling-public.controller';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

const TENANT_ID = 'tenant-uuid';
const TOKEN = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab';

const mockPersonalTimetableService = {
  generateIcsCalendar: jest.fn(),
};

describe('SchedulingPublicController', () => {
  let controller: SchedulingPublicController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulingPublicController],
      providers: [
        { provide: SchedulesReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      findCoreById: jest.fn().mockResolvedValue(null),
      existsById: jest.fn().mockResolvedValue(null),
      findBusyTeacherIds: jest.fn().mockResolvedValue(new Set()),
      countWeeklyPeriodsPerTeacher: jest.fn().mockResolvedValue(new Map()),
      findTeacherTimetable: jest.fn().mockResolvedValue([]),
      findClassTimetable: jest.fn().mockResolvedValue([]),
      findPinnedEntries: jest.fn().mockResolvedValue([]),
      countPinnedEntries: jest.fn().mockResolvedValue(0),
      findByAcademicYear: jest.fn().mockResolvedValue([]),
      findScheduledClassIds: jest.fn().mockResolvedValue([]),
      countEntriesPerClass: jest.fn().mockResolvedValue(new Map()),
      count: jest.fn().mockResolvedValue(0),
      hasRotationEntries: jest.fn().mockResolvedValue(false),
      countByRoom: jest.fn().mockResolvedValue(0),
      findTeacherScheduleEntries: jest.fn().mockResolvedValue([]),
      findTeacherWorkloadEntries: jest.fn().mockResolvedValue([]),
      countRoomAssignedEntries: jest.fn().mockResolvedValue(0),
      findByIdWithSwapContext: jest.fn().mockResolvedValue(null),
      hasConflict: jest.fn().mockResolvedValue(false),
      findByIdWithSubstitutionContext: jest.fn().mockResolvedValue(null),
      findRoomScheduleEntries: jest.fn().mockResolvedValue([]),
    } },
        { provide: StaffProfileReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      findByIds: jest.fn().mockResolvedValue([]),
      findByUserId: jest.fn().mockResolvedValue(null),
      findActiveStaff: jest.fn().mockResolvedValue([]),
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
      resolveProfileId: jest.fn().mockResolvedValue('staff-1'),
    } },
        {
          provide: PersonalTimetableService,
          useValue: mockPersonalTimetableService,
        },
      ],
    }).compile();
    controller = module.get<SchedulingPublicController>(
      SchedulingPublicController,
    );
    jest.clearAllMocks();
  });

  it('should call generateIcsCalendar and send ICS content', async () => {
    const icsContent =
      'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR';
    mockPersonalTimetableService.generateIcsCalendar.mockResolvedValue(
      icsContent,
    );

    const mockRes = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await controller.getCalendarIcs(
      TENANT_ID,
      TOKEN,
      mockRes as never,
    );

    expect(
      mockPersonalTimetableService.generateIcsCalendar,
    ).toHaveBeenCalledWith(TENANT_ID, TOKEN);
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/calendar; charset=utf-8',
    );
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="timetable.ics"',
    );
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-cache, no-store',
    );
    expect(mockRes.send).toHaveBeenCalledWith(icsContent);
  });

  it('should propagate service errors for invalid token', async () => {
    mockPersonalTimetableService.generateIcsCalendar.mockRejectedValue(
      new Error('Token not found'),
    );

    const mockRes = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await expect(
      controller.getCalendarIcs(TENANT_ID, 'invalid-token', mockRes as never),
    ).rejects.toThrow('Token not found');
  });

  it('should set correct response headers for calendar content', async () => {
    mockPersonalTimetableService.generateIcsCalendar.mockResolvedValue(
      'BEGIN:VCALENDAR\nEND:VCALENDAR',
    );

    const mockRes = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await controller.getCalendarIcs(TENANT_ID, TOKEN, mockRes as never);

    expect(mockRes.setHeader).toHaveBeenCalledTimes(3);
    expect(mockRes.send).toHaveBeenCalledTimes(1);
  });
});
