import { Test } from '@nestjs/testing';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { ConferencesController } from './conferences.controller';
import { ConferencesService } from './conferences.service';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const EVENT_ID = '00000000-0000-0000-0000-000000000010';
const USER_ID = '00000000-0000-0000-0000-000000000020';
const SLOT_ID = '00000000-0000-0000-0000-000000000030';
const BOOKING_ID = '00000000-0000-0000-0000-000000000040';

const tenantCtx = {
  tenant_id: TENANT_ID,
  slug: 'test',
  name: 'Test',
  status: 'active' as const,
  default_locale: 'en',
  timezone: 'UTC',
};
const userCtx = {
  sub: USER_ID,
  email: 'test@test.com',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access' as const,
  iat: 0,
  exp: 0,
};

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockConferencesService = {
  generateTimeSlots: jest.fn(),
  findAllTimeSlots: jest.fn(),
  updateTimeSlot: jest.fn(),
  findAllBookings: jest.fn(),
  createBooking: jest.fn(),
  cancelBooking: jest.fn(),
  getTeacherSchedule: jest.fn(),
  getBookingStats: jest.fn(),
};

describe('ConferencesController', () => {
  let controller: ConferencesController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ConferencesController],
      providers: [{ provide: ConferencesService, useValue: mockConferencesService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ConferencesController>(ConferencesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('generateTimeSlots — delegates to conferencesService.generateTimeSlots', async () => {
    const dto = {
      date: '2026-04-10',
      start_time: '08:00',
      end_time: '12:00',
      slot_duration_minutes: 15,
      buffer_minutes: 5,
      teacher_ids: ['t1'],
    };
    mockConferencesService.generateTimeSlots.mockResolvedValue({ created: 12, per_teacher: 12 });

    await controller.generateTimeSlots(tenantCtx, EVENT_ID, dto);

    expect(mockConferencesService.generateTimeSlots).toHaveBeenCalledWith(TENANT_ID, EVENT_ID, dto);
  });

  it('findAllTimeSlots — delegates with parsed query params', async () => {
    mockConferencesService.findAllTimeSlots.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });

    await controller.findAllTimeSlots(tenantCtx, EVENT_ID, '1', '20', 't1', 'available');

    expect(mockConferencesService.findAllTimeSlots).toHaveBeenCalledWith(TENANT_ID, EVENT_ID, {
      page: 1,
      pageSize: 20,
      teacher_id: 't1',
      status: 'available',
    });
  });

  it('updateTimeSlot — delegates with eventId, slotId, dto', async () => {
    const dto = { status: 'blocked' as const };
    mockConferencesService.updateTimeSlot.mockResolvedValue({ id: SLOT_ID, status: 'blocked' });

    await controller.updateTimeSlot(tenantCtx, EVENT_ID, SLOT_ID, dto);

    expect(mockConferencesService.updateTimeSlot).toHaveBeenCalledWith(
      TENANT_ID,
      EVENT_ID,
      SLOT_ID,
      dto,
    );
  });

  it('findAllBookings — delegates with parsed params', async () => {
    mockConferencesService.findAllBookings.mockResolvedValue({
      data: [],
      meta: { page: 2, pageSize: 10, total: 0 },
    });

    await controller.findAllBookings(tenantCtx, EVENT_ID, '2', '10');

    expect(mockConferencesService.findAllBookings).toHaveBeenCalledWith(TENANT_ID, EVENT_ID, {
      page: 2,
      pageSize: 10,
    });
  });

  it('createBooking — delegates with tenant, user, dto', async () => {
    const dto = { time_slot_id: SLOT_ID, student_id: 's1', booking_type: 'parent_booked' as const };
    mockConferencesService.createBooking.mockResolvedValue({ id: BOOKING_ID });

    await controller.createBooking(tenantCtx, userCtx, EVENT_ID, dto);

    expect(mockConferencesService.createBooking).toHaveBeenCalledWith(
      TENANT_ID,
      EVENT_ID,
      USER_ID,
      dto,
    );
  });

  it('cancelBooking — delegates to conferencesService.cancelBooking', async () => {
    mockConferencesService.cancelBooking.mockResolvedValue(undefined);

    await controller.cancelBooking(tenantCtx, EVENT_ID, BOOKING_ID);

    expect(mockConferencesService.cancelBooking).toHaveBeenCalledWith(
      TENANT_ID,
      EVENT_ID,
      BOOKING_ID,
    );
  });

  it('getTeacherSchedule — delegates with user.sub', async () => {
    mockConferencesService.getTeacherSchedule.mockResolvedValue({
      teacher_id: 'staff-1',
      event_id: EVENT_ID,
      slots: [],
    });

    await controller.getTeacherSchedule(tenantCtx, userCtx, EVENT_ID);

    expect(mockConferencesService.getTeacherSchedule).toHaveBeenCalledWith(
      TENANT_ID,
      EVENT_ID,
      USER_ID,
    );
  });

  it('getBookingStats — delegates to conferencesService.getBookingStats', async () => {
    mockConferencesService.getBookingStats.mockResolvedValue({
      per_teacher: [],
      totals: { total: 0, available: 0, booked: 0, blocked: 0, completed: 0, cancelled: 0 },
    });

    await controller.getBookingStats(tenantCtx, EVENT_ID);

    expect(mockConferencesService.getBookingStats).toHaveBeenCalledWith(TENANT_ID, EVENT_ID);
  });
});
