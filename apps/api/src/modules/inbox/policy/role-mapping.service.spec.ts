import { Test, TestingModule } from '@nestjs/testing';

import { RbacReadFacade } from '../../rbac/rbac-read.facade';

import { RoleMappingService } from './role-mapping.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('RoleMappingService — resolveMessagingRole', () => {
  let service: RoleMappingService;
  let rbac: { findActiveMembershipRolesByUserIds: jest.Mock };

  beforeEach(async () => {
    rbac = { findActiveMembershipRolesByUserIds: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoleMappingService, { provide: RbacReadFacade, useValue: rbac }],
    }).compile();
    service = module.get(RoleMappingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns null for a user with no active membership', async () => {
    rbac.findActiveMembershipRolesByUserIds.mockResolvedValue([]);
    const result = await service.resolveMessagingRole(TENANT_ID, 'u-1');
    expect(result).toBeNull();
  });

  it('returns the most permissive bucket when a user has multiple roles', async () => {
    rbac.findActiveMembershipRolesByUserIds.mockResolvedValue([
      { user_id: 'u-1', role_keys: ['teacher', 'parent'] },
    ]);
    const result = await service.resolveMessagingRole(TENANT_ID, 'u-1');
    expect(result).toBe('teacher');
  });

  it('returns null when every role_key is unmapped (falls through to null)', async () => {
    rbac.findActiveMembershipRolesByUserIds.mockResolvedValue([
      { user_id: 'u-1', role_keys: ['some_weird_custom_role'] },
    ]);
    const result = await service.resolveMessagingRole(TENANT_ID, 'u-1');
    expect(result).toBeNull();
  });

  it('uses a caller-supplied cache to dedupe lookups', async () => {
    rbac.findActiveMembershipRolesByUserIds.mockResolvedValue([
      { user_id: 'u-1', role_keys: ['school_principal'] },
    ]);
    const cache = new Map<string, import('@school/shared/inbox').MessagingRole | null>();
    const first = await service.resolveMessagingRole(TENANT_ID, 'u-1', cache);
    const second = await service.resolveMessagingRole(TENANT_ID, 'u-1', cache);
    expect(first).toBe('principal');
    expect(second).toBe('principal');
    expect(rbac.findActiveMembershipRolesByUserIds).toHaveBeenCalledTimes(1);
  });
});

describe('RoleMappingService — resolveMessagingRolesBatch', () => {
  let service: RoleMappingService;
  let rbac: { findActiveMembershipRolesByUserIds: jest.Mock };

  beforeEach(async () => {
    rbac = { findActiveMembershipRolesByUserIds: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoleMappingService, { provide: RbacReadFacade, useValue: rbac }],
    }).compile();
    service = module.get(RoleMappingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('resolves N users in a single facade call', async () => {
    rbac.findActiveMembershipRolesByUserIds.mockResolvedValue([
      { user_id: 'u-1', role_keys: ['teacher'] },
      { user_id: 'u-2', role_keys: ['parent'] },
      { user_id: 'u-3', role_keys: ['school_principal'] },
    ]);
    const result = await service.resolveMessagingRolesBatch(TENANT_ID, ['u-1', 'u-2', 'u-3']);
    expect(result.get('u-1')).toBe('teacher');
    expect(result.get('u-2')).toBe('parent');
    expect(result.get('u-3')).toBe('principal');
    expect(rbac.findActiveMembershipRolesByUserIds).toHaveBeenCalledTimes(1);
  });

  it('returns null for users with no membership', async () => {
    rbac.findActiveMembershipRolesByUserIds.mockResolvedValue([
      { user_id: 'u-1', role_keys: ['teacher'] },
    ]);
    const result = await service.resolveMessagingRolesBatch(TENANT_ID, ['u-1', 'u-missing']);
    expect(result.get('u-1')).toBe('teacher');
    expect(result.get('u-missing')).toBeNull();
  });

  it('returns an empty map for an empty input without touching rbac', async () => {
    const result = await service.resolveMessagingRolesBatch(TENANT_ID, []);
    expect(result.size).toBe(0);
    expect(rbac.findActiveMembershipRolesByUserIds).not.toHaveBeenCalled();
  });
});
