import { Test } from '@nestjs/testing';

import type { MessagingRole } from '@school/shared/inbox';

import { RbacReadFacade } from '../../rbac/rbac-read.facade';
import { MessagingPolicyService } from '../policy/messaging-policy.service';
import { RoleMappingService } from '../policy/role-mapping.service';

import { InboxPeopleSearchService } from './people-search.service';

const TENANT_ID = '00000000-0000-0000-0000-00000000aaaa';
const SENDER_ID = '00000000-0000-0000-0000-0000000s1111';

function makeRow(userId: string, first: string, last: string, email: string) {
  return {
    user_id: userId,
    first_name: first,
    last_name: last,
    email,
  };
}

describe('InboxPeopleSearchService', () => {
  let service: InboxPeopleSearchService;
  let rbacReadFacade: { searchActiveMembersByName: jest.Mock };
  let roleMapping: { resolveMessagingRole: jest.Mock; resolveMessagingRolesBatch: jest.Mock };
  let policyService: { canStartConversation: jest.Mock };

  beforeEach(async () => {
    rbacReadFacade = {
      searchActiveMembersByName: jest.fn(),
    };
    roleMapping = {
      resolveMessagingRole: jest.fn(),
      resolveMessagingRolesBatch: jest.fn(),
    };
    policyService = {
      canStartConversation: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        InboxPeopleSearchService,
        { provide: RbacReadFacade, useValue: rbacReadFacade },
        { provide: RoleMappingService, useValue: roleMapping },
        { provide: MessagingPolicyService, useValue: policyService },
      ],
    }).compile();
    service = moduleRef.get(InboxPeopleSearchService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns an empty list when no candidates match', async () => {
    rbacReadFacade.searchActiveMembersByName.mockResolvedValueOnce([]);
    const result = await service.search({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      query: 'nobody',
      limit: 20,
    });
    expect(result).toEqual([]);
    expect(policyService.canStartConversation).not.toHaveBeenCalled();
  });

  it('admin-tier sender skips policy filtering and returns all active candidates', async () => {
    const rows = [
      makeRow('u1', 'Alice', 'Ash', 'alice@example.com'),
      makeRow('u2', 'Bob', 'Brown', 'bob@example.com'),
    ];
    rbacReadFacade.searchActiveMembersByName.mockResolvedValueOnce(rows);
    roleMapping.resolveMessagingRole.mockResolvedValueOnce('principal' as MessagingRole);
    roleMapping.resolveMessagingRolesBatch.mockResolvedValueOnce(
      new Map<string, MessagingRole | null>([
        ['u1', 'parent'],
        ['u2', 'teacher'],
      ]),
    );

    const result = await service.search({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      query: '',
      limit: 20,
    });

    expect(policyService.canStartConversation).not.toHaveBeenCalled();
    expect(result).toHaveLength(2);
    expect(result[0]?.role_label).toBe('Parent');
    expect(result[1]?.role_label).toBe('Teacher');
  });

  it('filters out recipients the policy engine denies for a teacher sender', async () => {
    const rows = [
      makeRow('u1', 'Alice', 'Ash', 'alice@example.com'),
      makeRow('u2', 'Bob', 'Brown', 'bob@example.com'),
      makeRow('u3', 'Carol', 'Cole', 'carol@example.com'),
    ];
    rbacReadFacade.searchActiveMembersByName.mockResolvedValueOnce(rows);
    roleMapping.resolveMessagingRole.mockResolvedValueOnce('teacher' as MessagingRole);
    roleMapping.resolveMessagingRolesBatch.mockResolvedValueOnce(
      new Map<string, MessagingRole | null>([
        ['u1', 'parent'],
        ['u2', 'parent'],
        ['u3', 'parent'],
      ]),
    );
    policyService.canStartConversation.mockResolvedValueOnce({
      allowed: false,
      reason: 'RELATIONAL_SCOPE_VIOLATED',
      deniedRecipientIds: ['u2'],
    });

    const result = await service.search({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      query: '',
      limit: 20,
    });

    expect(result.map((r) => r.user_id)).toEqual(['u1', 'u3']);
  });

  it('caps the returned list at the requested limit', async () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      makeRow(`u${i}`, 'First', `Last${i}`, `u${i}@example.com`),
    );
    rbacReadFacade.searchActiveMembersByName.mockResolvedValueOnce(rows);
    roleMapping.resolveMessagingRole.mockResolvedValueOnce('principal' as MessagingRole);
    roleMapping.resolveMessagingRolesBatch.mockResolvedValueOnce(
      new Map<string, MessagingRole | null>(rows.map((r) => [r.user_id, 'teacher'])),
    );

    const result = await service.search({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      query: '',
      limit: 10,
    });

    expect(result).toHaveLength(10);
  });

  it('excludes rows whose role could not be resolved', async () => {
    const rows = [
      makeRow('u1', 'Alice', 'Ash', 'alice@example.com'),
      makeRow('u2', 'Bob', 'Brown', 'bob@example.com'),
    ];
    rbacReadFacade.searchActiveMembersByName.mockResolvedValueOnce(rows);
    roleMapping.resolveMessagingRole.mockResolvedValueOnce('principal' as MessagingRole);
    roleMapping.resolveMessagingRolesBatch.mockResolvedValueOnce(
      new Map<string, MessagingRole | null>([
        ['u1', 'parent'],
        ['u2', null],
      ]),
    );

    const result = await service.search({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      query: '',
      limit: 20,
    });

    expect(result.map((r) => r.user_id)).toEqual(['u1']);
  });

  it('returns empty when sender has no resolvable role', async () => {
    rbacReadFacade.searchActiveMembersByName.mockResolvedValueOnce([
      makeRow('u1', 'Alice', 'Ash', 'alice@example.com'),
    ]);
    roleMapping.resolveMessagingRole.mockResolvedValueOnce(null);

    const result = await service.search({
      tenantId: TENANT_ID,
      senderUserId: SENDER_ID,
      query: '',
      limit: 20,
    });
    expect(result).toEqual([]);
  });
});
