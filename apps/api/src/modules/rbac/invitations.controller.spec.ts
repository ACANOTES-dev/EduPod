/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type {
  AcceptInvitationDto,
  CreateInvitationDto,
  JwtPayload,
  TenantContext,
} from '@school/shared';

import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const INVITATION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const mockTenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const mockJwtPayload: JwtPayload = {
  sub: USER_ID,
  email: 'admin@school.test',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

function buildMockInvitationsService() {
  return {
    createInvitation: jest.fn(),
    listInvitations: jest.fn(),
    revokeInvitation: jest.fn(),
    acceptInvitation: jest.fn(),
  };
}

describe('InvitationsController', () => {
  let controller: InvitationsController;
  let service: ReturnType<typeof buildMockInvitationsService>;

  beforeEach(async () => {
    service = buildMockInvitationsService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvitationsController],
      providers: [{ provide: InvitationsService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InvitationsController>(InvitationsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call createInvitation with tenant_id, user_id, and dto', async () => {
    const dto: CreateInvitationDto = {
      email: 'new@school.test',
      role_ids: ['role-1'],
    };
    const expected = { id: INVITATION_ID, email: dto.email, status: 'pending' };
    service.createInvitation.mockResolvedValue(expected);

    const result = await controller.createInvitation(mockTenant, mockJwtPayload, dto);

    expect(service.createInvitation).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call listInvitations with tenant_id, page, and pageSize', async () => {
    const query = { page: 1, pageSize: 20, order: 'desc' as const };
    const expected = {
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    };
    service.listInvitations.mockResolvedValue(expected);

    const result = await controller.listInvitations(mockTenant, query);

    expect(service.listInvitations).toHaveBeenCalledWith(TENANT_ID, 1, 20);
    expect(result).toBe(expected);
  });

  it('should call revokeInvitation with tenant_id and id', async () => {
    const expected = { id: INVITATION_ID, status: 'revoked' };
    service.revokeInvitation.mockResolvedValue(expected);

    const result = await controller.revokeInvitation(mockTenant, INVITATION_ID);

    expect(service.revokeInvitation).toHaveBeenCalledWith(TENANT_ID, INVITATION_ID);
    expect(result).toBe(expected);
  });

  it('should call acceptInvitation with token and registration data', async () => {
    const dto: AcceptInvitationDto = {
      token: 'abc123token',
      first_name: 'John',
      last_name: 'Doe',
      password: 'SecurePass123!',
      phone: '+353861234567',
    };
    const expected = {
      accepted: true,
      user: { id: USER_ID, email: 'new@school.test' },
    };
    service.acceptInvitation.mockResolvedValue(expected);

    const result = await controller.acceptInvitation(dto);

    expect(service.acceptInvitation).toHaveBeenCalledWith('abc123token', {
      first_name: 'John',
      last_name: 'Doe',
      password: 'SecurePass123!',
      phone: '+353861234567',
    });
    expect(result).toBe(expected);
  });

  it('should return service result unchanged for listInvitations', async () => {
    const expected = {
      data: [{ id: INVITATION_ID, email: 'user@test.com', status: 'pending' }],
      meta: { page: 2, pageSize: 10, total: 15 },
    };
    service.listInvitations.mockResolvedValue(expected);

    const result = await controller.listInvitations(mockTenant, {
      page: 2,
      pageSize: 10,
      order: 'desc',
    });

    expect(result).toBe(expected);
  });
});
