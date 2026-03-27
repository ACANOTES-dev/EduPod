/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { BehaviourSanctionsController } from './behaviour-sanctions.controller';
import { BehaviourSanctionsService } from './behaviour-sanctions.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SANCTION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  tenant_id: TENANT_ID,
  email: 'admin@test.com',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockSanctionsService = {
  create: jest.fn(),
  list: jest.fn(),
  getTodaySanctions: jest.fn(),
  getMySupervision: jest.fn(),
  getCalendarView: jest.fn(),
  getActiveSuspensions: jest.fn(),
  getReturningSoon: jest.fn(),
  bulkMarkServed: jest.fn(),
  getById: jest.fn(),
  update: jest.fn(),
  transitionStatus: jest.fn(),
  recordParentMeeting: jest.fn(),
};

describe('BehaviourSanctionsController', () => {
  let controller: BehaviourSanctionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourSanctionsController],
      providers: [
        { provide: BehaviourSanctionsService, useValue: mockSanctionsService },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/module-enabled.guard').ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BehaviourSanctionsController>(BehaviourSanctionsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Create ───────────────────────────────────────────────────────────────

  it('should call sanctionsService.create with tenant_id, user_id, and dto', async () => {
    const dto = { student_id: 's1', type: 'detention', incident_id: 'inc-1' };
    mockSanctionsService.create.mockResolvedValue({ id: SANCTION_ID });

    const result = await controller.create(TENANT, USER, dto as never);

    expect(mockSanctionsService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toEqual({ id: SANCTION_ID });
  });

  // ─── List ─────────────────────────────────────────────────────────────────

  it('should call sanctionsService.list with tenant_id and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockSanctionsService.list.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.list(TENANT, query as never);

    expect(mockSanctionsService.list).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  // ─── Static routes ────────────────────────────────────────────────────────

  it('should call sanctionsService.getTodaySanctions with tenant_id', async () => {
    mockSanctionsService.getTodaySanctions.mockResolvedValue({ data: [] });

    const result = await controller.getTodaySanctions(TENANT);

    expect(mockSanctionsService.getTodaySanctions).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual({ data: [] });
  });

  it('should call sanctionsService.getMySupervision with tenant_id and user_id', async () => {
    mockSanctionsService.getMySupervision.mockResolvedValue({ data: [] });

    const result = await controller.getMySupervision(TENANT, USER);

    expect(mockSanctionsService.getMySupervision).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(result).toEqual({ data: [] });
  });

  it('should call sanctionsService.getCalendarView with tenant_id and query', async () => {
    const query = { start_date: '2026-03-01', end_date: '2026-03-31' };
    mockSanctionsService.getCalendarView.mockResolvedValue({ events: [] });

    const result = await controller.getCalendarView(TENANT, query as never);

    expect(mockSanctionsService.getCalendarView).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toEqual({ events: [] });
  });

  it('should call sanctionsService.getActiveSuspensions with tenant_id', async () => {
    mockSanctionsService.getActiveSuspensions.mockResolvedValue({ data: [] });

    const result = await controller.getActiveSuspensions(TENANT);

    expect(mockSanctionsService.getActiveSuspensions).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual({ data: [] });
  });

  it('should call sanctionsService.getReturningSoon with tenant_id', async () => {
    mockSanctionsService.getReturningSoon.mockResolvedValue({ data: [] });

    const result = await controller.getReturningSoon(TENANT);

    expect(mockSanctionsService.getReturningSoon).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual({ data: [] });
  });

  it('should call sanctionsService.bulkMarkServed with tenant_id, dto, and user_id', async () => {
    const dto = { sanction_ids: ['s1', 's2'] };
    mockSanctionsService.bulkMarkServed.mockResolvedValue({ updated: 2 });

    const result = await controller.bulkMarkServed(TENANT, USER, dto as never);

    expect(mockSanctionsService.bulkMarkServed).toHaveBeenCalledWith(TENANT_ID, dto, USER_ID);
    expect(result).toEqual({ updated: 2 });
  });

  // ─── Parameterised :id routes ─────────────────────────────────────────────

  it('should call sanctionsService.getById with tenant_id and id', async () => {
    mockSanctionsService.getById.mockResolvedValue({ id: SANCTION_ID });

    const result = await controller.getById(TENANT, SANCTION_ID);

    expect(mockSanctionsService.getById).toHaveBeenCalledWith(TENANT_ID, SANCTION_ID);
    expect(result).toEqual({ id: SANCTION_ID });
  });

  it('should call sanctionsService.update with tenant_id, id, dto, and user_id', async () => {
    const dto = { notes: 'Updated notes' };
    mockSanctionsService.update.mockResolvedValue({ id: SANCTION_ID });

    const result = await controller.update(TENANT, USER, SANCTION_ID, dto as never);

    expect(mockSanctionsService.update).toHaveBeenCalledWith(TENANT_ID, SANCTION_ID, dto, USER_ID);
    expect(result).toEqual({ id: SANCTION_ID });
  });

  it('should call sanctionsService.transitionStatus with tenant_id, id, status, reason, user_id', async () => {
    const dto = { status: 'served', reason: 'Completed' };
    mockSanctionsService.transitionStatus.mockResolvedValue({ id: SANCTION_ID, status: 'served' });

    const result = await controller.transitionStatus(TENANT, USER, SANCTION_ID, dto as never);

    expect(mockSanctionsService.transitionStatus).toHaveBeenCalledWith(
      TENANT_ID, SANCTION_ID, 'served', 'Completed', USER_ID,
    );
    expect(result).toEqual({ id: SANCTION_ID, status: 'served' });
  });

  it('should call sanctionsService.recordParentMeeting with tenant_id, id, and dto', async () => {
    const dto = { date: '2026-03-20', notes: 'Met with parent' };
    mockSanctionsService.recordParentMeeting.mockResolvedValue({ recorded: true });

    const result = await controller.recordParentMeeting(TENANT, SANCTION_ID, dto as never);

    expect(mockSanctionsService.recordParentMeeting).toHaveBeenCalledWith(TENANT_ID, SANCTION_ID, dto);
    expect(result).toEqual({ recorded: true });
  });

  it('should return redirect message for submitAppeal', async () => {
    const result = await controller.submitAppeal(SANCTION_ID);

    expect(result).toEqual({ message: 'Use POST /appeals endpoint' });
  });

  it('should return redirect message for appealOutcome', async () => {
    const result = await controller.appealOutcome(SANCTION_ID);

    expect(result).toEqual({ message: 'Handled by appeals service — use PATCH /appeals/:id/outcome' });
  });
});
