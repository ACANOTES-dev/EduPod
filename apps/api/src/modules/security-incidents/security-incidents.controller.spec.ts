/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload } from '@school/shared';

import { SecurityIncidentsController } from './security-incidents.controller';
import { SecurityIncidentsService } from './security-incidents.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INCIDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TENANT_A_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const jwtPayload: JwtPayload = {
  sub: USER_ID,
  email: 'admin@platform.test',
  tenant_id: null,
  membership_id: null,
  type: 'access',
  iat: 0,
  exp: 9999999999,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SecurityIncidentsController', () => {
  let controller: SecurityIncidentsController;
  let mockService: {
    list: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    addEvent: jest.Mock;
    notifyControllers: jest.Mock;
    notifyDpc: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      list: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
      findOne: jest.fn().mockResolvedValue({ id: INCIDENT_ID }),
      create: jest.fn().mockResolvedValue({ id: INCIDENT_ID }),
      update: jest.fn().mockResolvedValue({ id: INCIDENT_ID }),
      addEvent: jest.fn().mockResolvedValue({ id: 'event-id' }),
      notifyControllers: jest.fn().mockResolvedValue(undefined),
      notifyDpc: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SecurityIncidentsController],
      providers: [{ provide: SecurityIncidentsService, useValue: mockService }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../tenants/guards/platform-owner.guard').PlatformOwnerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SecurityIncidentsController>(SecurityIncidentsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── list ───────────────────────────────────────────────────────────────────

  it('list — should delegate to service.list', async () => {
    const query = { page: 1, pageSize: 20 };

    const result = await controller.list(query);

    expect(mockService.list).toHaveBeenCalledWith(query);
    expect(result).toEqual({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  it('create — should pass dto and userId to service.create', async () => {
    const dto = {
      severity: 'high' as const,
      incident_type: 'unusual_access' as const,
      description: 'Unauthorized access detected to student records',
    };

    const result = await controller.create(dto, jwtPayload);

    expect(mockService.create).toHaveBeenCalledWith(dto, USER_ID);
    expect(result).toEqual({ id: INCIDENT_ID });
  });

  // ─── findOne ────────────────────────────────────────────────────────────────

  it('findOne — should delegate to service.findOne', async () => {
    const result = await controller.findOne(INCIDENT_ID);

    expect(mockService.findOne).toHaveBeenCalledWith(INCIDENT_ID);
    expect(result).toEqual({ id: INCIDENT_ID });
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  it('update — should pass id, dto, and userId to service.update', async () => {
    const dto = { severity: 'critical' as const };

    const result = await controller.update(INCIDENT_ID, dto, jwtPayload);

    expect(mockService.update).toHaveBeenCalledWith(INCIDENT_ID, dto, USER_ID);
    expect(result).toEqual({ id: INCIDENT_ID });
  });

  // ─── addEvent ───────────────────────────────────────────────────────────────

  it('addEvent — should pass incidentId, dto, and userId to service.addEvent', async () => {
    const dto = {
      event_type: 'containment' as const,
      description: 'System access revoked for compromised account',
    };

    const result = await controller.addEvent(INCIDENT_ID, dto, jwtPayload);

    expect(mockService.addEvent).toHaveBeenCalledWith(INCIDENT_ID, dto, USER_ID);
    expect(result).toEqual({ id: 'event-id' });
  });

  // ─── notifyControllers ──────────────────────────────────────────────────────

  it('notifyControllers — should delegate with correct params', async () => {
    const dto = {
      tenant_ids: [TENANT_A_ID],
      message: 'A security incident has been detected affecting your school data.',
    };

    await controller.notifyControllers(INCIDENT_ID, dto, jwtPayload);

    expect(mockService.notifyControllers).toHaveBeenCalledWith(INCIDENT_ID, dto, USER_ID);
  });

  // ─── notifyDpc ──────────────────────────────────────────────────────────────

  it('notifyDpc — should delegate with correct params', async () => {
    const dto = {
      dpc_reference_number: 'DPC-2026-001',
      notes: 'Notification submitted within 72-hour window',
    };

    await controller.notifyDpc(INCIDENT_ID, dto, jwtPayload);

    expect(mockService.notifyDpc).toHaveBeenCalledWith(INCIDENT_ID, dto, USER_ID);
  });
});
