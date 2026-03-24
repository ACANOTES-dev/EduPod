import { CanActivate } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';
import type { Request } from 'express';

import { AuthGuard } from '../../common/guards/auth.guard';

import { AuditLogService } from './audit-log.service';
import { EngagementController } from './engagement.controller';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const mockGuard: CanActivate = { canActivate: () => true };

describe('EngagementController', () => {
  let controller: EngagementController;
  let mockService: {
    track: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      track: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EngagementController],
      providers: [{ provide: AuditLogService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard).useValue(mockGuard)
      .compile();

    controller = module.get<EngagementController>(EngagementController);
  });

  afterEach(() => jest.clearAllMocks());

  const tenant: TenantContext = {
    tenant_id: TENANT_ID,
    slug: 'test-school',
    name: 'Test School',
    status: 'active',
    default_locale: 'en',
    timezone: 'Europe/Dublin',
  };
  const user: JwtPayload = {
    sub: USER_ID,
    email: 'user@example.com',
    tenant_id: TENANT_ID,
    membership_id: 'mem-1',
    type: 'access',
    iat: 0,
    exp: 0,
  };
  const mockReq = { ip: '192.168.1.1' } as Request;

  describe('track()', () => {
    it('should call auditLogService.track with all parameters', async () => {
      const body = { event_type: 'page_view', entity_type: 'announcement', entity_id: 'entity-1' };

      const result = await controller.track(tenant, user, body, mockReq);

      expect(mockService.track).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'page_view',
        'announcement',
        'entity-1',
        '192.168.1.1',
      );
      expect(result).toEqual({ ok: true });
    });

    it('should pass null for entity_type when not provided', async () => {
      const body = { event_type: 'session_start' };

      await controller.track(tenant, user, body, mockReq);

      expect(mockService.track).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'session_start',
        null,
        null,
        '192.168.1.1',
      );
    });

    it('should use 0.0.0.0 as fallback when req.ip is undefined', async () => {
      const body = { event_type: 'click' };
      const reqNoIp = { ip: undefined } as unknown as Request;

      await controller.track(tenant, user, body, reqNoIp);

      expect(mockService.track).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'click',
        null,
        null,
        '0.0.0.0',
      );
    });

    it('should always return { ok: true }', async () => {
      const body = { event_type: 'page_view' };

      const result = await controller.track(tenant, user, body, mockReq);

      expect(result).toEqual({ ok: true });
    });
  });
});
