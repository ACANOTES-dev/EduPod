import { Test, TestingModule } from '@nestjs/testing';

import { PersonalTimetableService } from './personal-timetable.service';
import { SchedulingPublicController } from './scheduling-public.controller';

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
