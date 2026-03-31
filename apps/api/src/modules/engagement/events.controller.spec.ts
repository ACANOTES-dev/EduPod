import { Test } from '@nestjs/testing';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { EventParticipantsService } from './event-participants.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { TripPackService } from './trip-pack.service';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const EVENT_ID = '00000000-0000-0000-0000-000000000010';
const USER_ID = '00000000-0000-0000-0000-000000000020';
const STAFF_ID = '00000000-0000-0000-0000-000000000030';
const PARTICIPANT_ID = '00000000-0000-0000-0000-000000000060';

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

const mockEventsService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  publish: jest.fn(),
  open: jest.fn(),
  close: jest.fn(),
  cancel: jest.fn(),
  getDashboard: jest.fn(),
  addStaff: jest.fn(),
  removeStaff: jest.fn(),
  listStaff: jest.fn(),
  approveRiskAssessment: jest.fn(),
  rejectRiskAssessment: jest.fn(),
  getAttendance: jest.fn(),
  markAttendance: jest.fn(),
  confirmHeadcount: jest.fn(),
  completeEvent: jest.fn(),
  createIncident: jest.fn(),
  listIncidents: jest.fn(),
};

const mockEventParticipantsService = {
  findAllForEvent: jest.fn(),
  updateParticipant: jest.fn(),
  remindOutstanding: jest.fn(),
};

const mockTripPackService = {
  generateTripPack: jest.fn(),
};

describe('EventsController', () => {
  let controller: EventsController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        { provide: EventsService, useValue: mockEventsService },
        { provide: EventParticipantsService, useValue: mockEventParticipantsService },
        { provide: TripPackService, useValue: mockTripPackService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EventsController>(EventsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('create — delegates to eventsService.create', async () => {
    const dto = {
      title: 'Trip',
      event_type: 'school_trip' as const,
      academic_year_id: 'ay-1',
      target_type: 'whole_school' as const,
      risk_assessment_required: false,
    };
    mockEventsService.create.mockResolvedValue({ id: EVENT_ID });

    await controller.create(tenantCtx, userCtx, dto);

    expect(mockEventsService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
  });

  it('findAll — delegates with parsed params', async () => {
    mockEventsService.findAll.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });

    await controller.findAll(tenantCtx, '1', '20', 'draft');

    expect(mockEventsService.findAll).toHaveBeenCalledWith(TENANT_ID, {
      page: 1,
      pageSize: 20,
      status: 'draft',
      event_type: undefined,
      academic_year_id: undefined,
      search: undefined,
    });
  });

  it('findOne — delegates to eventsService.findOne', async () => {
    mockEventsService.findOne.mockResolvedValue({ id: EVENT_ID });

    await controller.findOne(tenantCtx, EVENT_ID);

    expect(mockEventsService.findOne).toHaveBeenCalledWith(TENANT_ID, EVENT_ID);
  });

  it('update — delegates to eventsService.update', async () => {
    const dto = { title: 'Updated' };
    mockEventsService.update.mockResolvedValue({ id: EVENT_ID, title: 'Updated' });

    await controller.update(tenantCtx, EVENT_ID, dto);

    expect(mockEventsService.update).toHaveBeenCalledWith(TENANT_ID, EVENT_ID, dto);
  });

  it('remove — delegates to eventsService.remove', async () => {
    mockEventsService.remove.mockResolvedValue(undefined);

    await controller.remove(tenantCtx, EVENT_ID);

    expect(mockEventsService.remove).toHaveBeenCalledWith(TENANT_ID, EVENT_ID);
  });

  it('publish — delegates to eventsService.publish', async () => {
    mockEventsService.publish.mockResolvedValue({ status: 'published' });

    await controller.publish(tenantCtx, userCtx, EVENT_ID);

    expect(mockEventsService.publish).toHaveBeenCalledWith(TENANT_ID, EVENT_ID, USER_ID);
  });

  it('open — delegates to eventsService.open', async () => {
    mockEventsService.open.mockResolvedValue({ status: 'open' });

    await controller.open(tenantCtx, userCtx, EVENT_ID);

    expect(mockEventsService.open).toHaveBeenCalledWith(TENANT_ID, EVENT_ID, USER_ID);
  });

  it('close — delegates to eventsService.close', async () => {
    mockEventsService.close.mockResolvedValue({ status: 'closed' });

    await controller.close(tenantCtx, userCtx, EVENT_ID);

    expect(mockEventsService.close).toHaveBeenCalledWith(TENANT_ID, EVENT_ID, USER_ID);
  });

  it('cancel — delegates to eventsService.cancel', async () => {
    mockEventsService.cancel.mockResolvedValue({ status: 'cancelled' });

    await controller.cancel(tenantCtx, userCtx, EVENT_ID);

    expect(mockEventsService.cancel).toHaveBeenCalledWith(TENANT_ID, EVENT_ID, USER_ID);
  });

  it('listStaff — delegates to eventsService.listStaff', async () => {
    mockEventsService.listStaff.mockResolvedValue([]);

    await controller.listStaff(tenantCtx, EVENT_ID);

    expect(mockEventsService.listStaff).toHaveBeenCalledWith(TENANT_ID, EVENT_ID);
  });

  it('addStaff — delegates to eventsService.addStaff', async () => {
    mockEventsService.addStaff.mockResolvedValue({ id: 'new' });

    await controller.addStaff(tenantCtx, EVENT_ID, { staff_id: STAFF_ID, role: 'organiser' });

    expect(mockEventsService.addStaff).toHaveBeenCalledWith(
      TENANT_ID,
      EVENT_ID,
      STAFF_ID,
      'organiser',
    );
  });

  it('removeStaff — delegates to eventsService.removeStaff', async () => {
    mockEventsService.removeStaff.mockResolvedValue(undefined);

    await controller.removeStaff(tenantCtx, EVENT_ID, STAFF_ID);

    expect(mockEventsService.removeStaff).toHaveBeenCalledWith(TENANT_ID, EVENT_ID, STAFF_ID);
  });

  it('findAllParticipants — delegates to eventParticipantsService', async () => {
    mockEventParticipantsService.findAllForEvent.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });

    await controller.findAllParticipants(tenantCtx, EVENT_ID, '1', '20');

    expect(mockEventParticipantsService.findAllForEvent).toHaveBeenCalledWith(
      TENANT_ID,
      EVENT_ID,
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
  });

  it('updateParticipant — delegates to eventParticipantsService', async () => {
    mockEventParticipantsService.updateParticipant.mockResolvedValue({ id: PARTICIPANT_ID });
    const dto = { consent_status: 'granted' };

    await controller.updateParticipant(tenantCtx, EVENT_ID, PARTICIPANT_ID, dto);

    expect(mockEventParticipantsService.updateParticipant).toHaveBeenCalledWith(
      TENANT_ID,
      EVENT_ID,
      PARTICIPANT_ID,
      dto,
    );
  });

  it('getDashboard — delegates to eventsService.getDashboard', async () => {
    mockEventsService.getDashboard.mockResolvedValue({ total_invited: 10 });

    await controller.getDashboard(tenantCtx, EVENT_ID);

    expect(mockEventsService.getDashboard).toHaveBeenCalledWith(TENANT_ID, EVENT_ID);
  });

  it('remindOutstanding — delegates to eventParticipantsService', async () => {
    mockEventParticipantsService.remindOutstanding.mockResolvedValue({ reminded: 5 });

    await controller.remindOutstanding(tenantCtx, EVENT_ID);

    expect(mockEventParticipantsService.remindOutstanding).toHaveBeenCalledWith(
      TENANT_ID,
      EVENT_ID,
    );
  });

  // ─── Trip & Logistics Endpoints ──────────────────────────────────────────

  it('approveRiskAssessment — delegates to eventsService', async () => {
    mockEventsService.approveRiskAssessment.mockResolvedValue({ risk_assessment_approved: true });

    await controller.approveRiskAssessment(tenantCtx, userCtx, EVENT_ID);

    expect(mockEventsService.approveRiskAssessment).toHaveBeenCalledWith(
      TENANT_ID,
      EVENT_ID,
      USER_ID,
    );
  });

  it('rejectRiskAssessment — delegates to eventsService', async () => {
    mockEventsService.rejectRiskAssessment.mockResolvedValue({ risk_assessment_approved: false });

    await controller.rejectRiskAssessment(tenantCtx, EVENT_ID);

    expect(mockEventsService.rejectRiskAssessment).toHaveBeenCalledWith(TENANT_ID, EVENT_ID);
  });

  it('generateTripPack — delegates to tripPackService', async () => {
    mockTripPackService.generateTripPack.mockResolvedValue(Buffer.from('pdf'));

    const result = await controller.generateTripPack(tenantCtx, EVENT_ID);

    expect(mockTripPackService.generateTripPack).toHaveBeenCalledWith(TENANT_ID, EVENT_ID, 'en');
    expect(result).toEqual({ generated: true, size: 3 });
  });

  it('downloadTripPack — returns PDF buffer', async () => {
    const pdfBuffer = Buffer.from('pdf-content');
    mockTripPackService.generateTripPack.mockResolvedValue(pdfBuffer);

    const result = await controller.downloadTripPack(tenantCtx, EVENT_ID);

    expect(result).toBe(pdfBuffer);
  });

  it('getAttendance — delegates to eventsService', async () => {
    mockEventsService.getAttendance.mockResolvedValue({
      data: [],
      summary: { total: 0, marked_present: 0, marked_absent: 0, unmarked: 0 },
    });

    await controller.getAttendance(tenantCtx, EVENT_ID);

    expect(mockEventsService.getAttendance).toHaveBeenCalledWith(TENANT_ID, EVENT_ID);
  });

  it('markAttendance — delegates to eventsService', async () => {
    const STUDENT_ID = '00000000-0000-0000-0000-000000000050';
    mockEventsService.markAttendance.mockResolvedValue({ attendance_marked: true });

    await controller.markAttendance(tenantCtx, userCtx, EVENT_ID, {
      student_id: STUDENT_ID,
      present: true,
    });

    expect(mockEventsService.markAttendance).toHaveBeenCalledWith(
      TENANT_ID,
      EVENT_ID,
      STUDENT_ID,
      true,
      USER_ID,
    );
  });

  it('confirmHeadcount — delegates to eventsService', async () => {
    mockEventsService.confirmHeadcount.mockResolvedValue({ status: 'in_progress' });

    await controller.confirmHeadcount(tenantCtx, EVENT_ID, { count_present: 15 });

    expect(mockEventsService.confirmHeadcount).toHaveBeenCalledWith(TENANT_ID, EVENT_ID, 15);
  });

  it('completeEvent — delegates to eventsService', async () => {
    mockEventsService.completeEvent.mockResolvedValue({ status: 'completed' });

    await controller.completeEvent(tenantCtx, EVENT_ID);

    expect(mockEventsService.completeEvent).toHaveBeenCalledWith(TENANT_ID, EVENT_ID);
  });

  it('createIncident — delegates to eventsService', async () => {
    const dto = { title: 'Incident', description: 'Description' };
    mockEventsService.createIncident.mockResolvedValue({ id: 'inc-1' });

    await controller.createIncident(tenantCtx, userCtx, EVENT_ID, dto);

    expect(mockEventsService.createIncident).toHaveBeenCalledWith(
      TENANT_ID,
      EVENT_ID,
      USER_ID,
      dto,
    );
  });

  it('listIncidents — delegates to eventsService', async () => {
    mockEventsService.listIncidents.mockResolvedValue([]);

    await controller.listIncidents(tenantCtx, EVENT_ID);

    expect(mockEventsService.listIncidents).toHaveBeenCalledWith(TENANT_ID, EVENT_ID);
  });
});
