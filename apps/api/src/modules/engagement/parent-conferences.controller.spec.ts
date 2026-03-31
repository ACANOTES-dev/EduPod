import { Test } from '@nestjs/testing';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { ConferencesService } from './conferences.service';
import { ParentConferencesController } from './parent-conferences.controller';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const EVENT_ID = '00000000-0000-0000-0000-000000000010';
const USER_ID = '00000000-0000-0000-0000-000000000020';
const BOOKING_ID = '00000000-0000-0000-0000-000000000030';

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
  getAvailableSlots: jest.fn(),
  parentBook: jest.fn(),
  getParentBookings: jest.fn(),
  parentCancelBooking: jest.fn(),
};

describe('ParentConferencesController', () => {
  let controller: ParentConferencesController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ParentConferencesController],
      providers: [{ provide: ConferencesService, useValue: mockConferencesService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ParentConferencesController>(ParentConferencesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('getAvailableSlots — delegates to conferencesService.getAvailableSlots', async () => {
    mockConferencesService.getAvailableSlots.mockResolvedValue([]);

    await controller.getAvailableSlots(tenantCtx, userCtx, EVENT_ID);

    expect(mockConferencesService.getAvailableSlots).toHaveBeenCalledWith(
      TENANT_ID,
      EVENT_ID,
      USER_ID,
    );
  });

  it('book — delegates to conferencesService.parentBook', async () => {
    const dto = {
      time_slot_id: '00000000-0000-0000-0000-000000000040',
      student_id: '00000000-0000-0000-0000-000000000050',
      booking_type: 'parent_booked' as const,
    };
    mockConferencesService.parentBook.mockResolvedValue({ id: BOOKING_ID });

    await controller.book(tenantCtx, userCtx, EVENT_ID, dto);

    expect(mockConferencesService.parentBook).toHaveBeenCalledWith(
      TENANT_ID,
      EVENT_ID,
      USER_ID,
      dto,
    );
  });

  it('getMyBookings — delegates to conferencesService.getParentBookings', async () => {
    mockConferencesService.getParentBookings.mockResolvedValue([]);

    await controller.getMyBookings(tenantCtx, userCtx, EVENT_ID);

    expect(mockConferencesService.getParentBookings).toHaveBeenCalledWith(
      TENANT_ID,
      EVENT_ID,
      USER_ID,
    );
  });

  it('cancelBooking — delegates to conferencesService.parentCancelBooking', async () => {
    mockConferencesService.parentCancelBooking.mockResolvedValue(undefined);

    await controller.cancelBooking(tenantCtx, userCtx, EVENT_ID, BOOKING_ID);

    expect(mockConferencesService.parentCancelBooking).toHaveBeenCalledWith(
      TENANT_ID,
      EVENT_ID,
      BOOKING_ID,
      USER_ID,
    );
  });
});
