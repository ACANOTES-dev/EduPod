import { Test } from '@nestjs/testing';

import { AuthReadFacade } from '../auth/auth-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { QueueManagementService } from '../queue-admin/queue-management.service';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

import { PlatformSearchService } from './platform-search.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ALERT_ID = '33333333-3333-4333-8333-333333333333';

function buildMockPrisma() {
  return {
    platformAlertHistory: { findMany: jest.fn() },
  };
}

function buildMockAuthReadFacade() {
  return {
    searchUserSummaries: jest.fn(),
  };
}

function buildMockQueueManagement() {
  return {
    getKnownQueueNames: jest.fn(() => ['notifications', 'finance']),
    listJobs: jest.fn(),
  };
}

function buildMockTenantReadFacade() {
  return {
    searchPlatformSummaries: jest.fn(),
  };
}

describe('PlatformSearchService', () => {
  let service: PlatformSearchService;
  let authReadFacade: ReturnType<typeof buildMockAuthReadFacade>;
  let prisma: ReturnType<typeof buildMockPrisma>;
  let queues: ReturnType<typeof buildMockQueueManagement>;
  let tenantReadFacade: ReturnType<typeof buildMockTenantReadFacade>;

  beforeEach(async () => {
    authReadFacade = buildMockAuthReadFacade();
    prisma = buildMockPrisma();
    queues = buildMockQueueManagement();
    tenantReadFacade = buildMockTenantReadFacade();
    const module = await Test.createTestingModule({
      providers: [
        PlatformSearchService,
        { provide: AuthReadFacade, useValue: authReadFacade },
        { provide: PrismaService, useValue: prisma },
        { provide: QueueManagementService, useValue: queues },
        { provide: TenantReadFacade, useValue: tenantReadFacade },
      ],
    }).compile();

    service = module.get(PlatformSearchService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns empty results for short queries', async () => {
    await expect(service.search('a')).resolves.toEqual({
      alerts: [],
      jobs: [],
      tenants: [],
      users: [],
    });

    expect(tenantReadFacade.searchPlatformSummaries).not.toHaveBeenCalled();
    expect(queues.listJobs).not.toHaveBeenCalled();
  });

  it('searches tenants, users, alerts, and queue jobs', async () => {
    const firedAt = new Date('2026-05-17T12:00:00.000Z');
    tenantReadFacade.searchPlatformSummaries.mockResolvedValueOnce([
      { id: TENANT_ID, name: 'North High', slug: 'north', status: 'active' },
    ]);
    authReadFacade.searchUserSummaries.mockResolvedValueOnce([
      {
        email: 'owner@example.com',
        first_name: 'Ada',
        global_status: 'active',
        id: USER_ID,
        last_name: 'Lovelace',
      },
    ]);
    prisma.platformAlertHistory.findMany.mockResolvedValueOnce([
      {
        fired_at: firedAt,
        id: ALERT_ID,
        message: 'Notifications queue failed',
        rule: { name: 'Queue failures' },
        severity: 'critical',
        status: 'fired',
      },
    ]);
    queues.listJobs
      .mockResolvedValueOnce({
        data: [
          {
            attempts_made: 1,
            failed_reason: 'SMTP timeout',
            id: 'job-1',
            name: 'notifications:dispatch',
            status: 'failed',
            timestamp: 100,
          },
        ],
        meta: { page: 1, pageSize: 10, total: 1 },
      })
      .mockResolvedValueOnce({
        data: [
          {
            attempts_made: 0,
            failed_reason: null,
            id: 'job-2',
            name: 'finance:invoice',
            status: 'completed',
            timestamp: 50,
          },
        ],
        meta: { page: 1, pageSize: 10, total: 1 },
      });

    await expect(service.search('notifications')).resolves.toEqual({
      alerts: [
        {
          fired_at: firedAt,
          id: ALERT_ID,
          message: 'Notifications queue failed',
          rule_name: 'Queue failures',
          severity: 'critical',
          status: 'fired',
        },
      ],
      jobs: [
        {
          attempts_made: 1,
          failed_reason: 'SMTP timeout',
          id: 'job-1',
          name: 'notifications:dispatch',
          queue: 'notifications',
          status: 'failed',
          timestamp: 100,
        },
      ],
      tenants: [{ id: TENANT_ID, name: 'North High', slug: 'north', status: 'active' }],
      users: [
        {
          email: 'owner@example.com',
          first_name: 'Ada',
          global_status: 'active',
          id: USER_ID,
          last_name: 'Lovelace',
        },
      ],
    });

    expect(tenantReadFacade.searchPlatformSummaries).toHaveBeenCalledWith('notifications', 5);
    expect(authReadFacade.searchUserSummaries).toHaveBeenCalledWith('notifications', 5);
    expect(prisma.platformAlertHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });
});
