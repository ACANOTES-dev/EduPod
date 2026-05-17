import { SentryIngestionService } from './sentry-ingestion.service';
import type { NormalizedSentryIssue } from './sentry-types';

const ISSUE: NormalizedSentryIssue = {
  affected_url: 'https://dua.edupod.app/en/admin',
  affected_user_count: 3,
  breadcrumb_summary: ['clicked admin'],
  correlation_ids: ['corr-1'],
  culprit: 'AdminPage',
  environment: 'production',
  event_id: 'event-1',
  fingerprint: ['fingerprint-1'],
  first_seen_at: new Date('2026-05-17T09:10:00.000Z'),
  last_seen_at: new Date('2026-05-17T10:35:00.000Z'),
  level: 'error',
  organization: 'edupod',
  permalink: 'https://sentry.example/issues/1',
  project: 'web',
  release: 'web@1',
  sentry_issue_id: 'SENTRY-1',
  stack_summary: 'Error at AdminPage',
  state: 'unresolved',
  tags: { route: '/en/admin', severity: 'critical' },
  tenant_id: 'tenant-1',
  title: 'Admin page failed',
  total_event_count: 7,
};

describe('SentryIngestionService — ingest', () => {
  it('creates a mirrored issue, records an hourly summary, links error logs, and emits critical alerts', async () => {
    const prisma = {
      platformErrorLog: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      platformSentryEventsSummary: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      platformSentryIssue: {
        create: jest.fn().mockResolvedValue({ id: 'mirror-1', sentry_issue_id: 'SENTRY-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    } as never;
    const tenantReadFacade = { findById: jest.fn().mockResolvedValue({ id: 'tenant-1' }) } as never;
    const correlation = {
      correlate: jest.fn().mockResolvedValue({
        correlated_deploy_id: 'deploy-1',
        correlation_ids: ['corr-2'],
        related_runbook_keys: ['agent-sentry-triage'],
        related_topology_keys: ['web'],
        severity_policy_match: 'critical',
      }),
    } as never;
    const alerts = { emit: jest.fn().mockResolvedValue(undefined) } as never;
    const service = new SentryIngestionService(prisma, tenantReadFacade, correlation, alerts);

    await expect(service.ingest(ISSUE)).resolves.toEqual({
      id: 'mirror-1',
      sentry_issue_id: 'SENTRY-1',
    });

    expect(prisma.platformSentryIssue.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        correlation_ids: ['corr-2'],
        sentry_issue_id: 'SENTRY-1',
        tenant_id: 'tenant-1',
      }),
    });
    expect(prisma.platformSentryEventsSummary.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        affected_tenant_ids: ['tenant-1'],
        hour_bucket: new Date('2026-05-17T10:00:00.000Z'),
        sentry_issue_id: 'mirror-1',
      }),
    });
    expect(prisma.platformErrorLog.updateMany).toHaveBeenCalledWith({
      data: { sentry_issue_id: 'mirror-1' },
      where: {
        OR: [
          { sentry_event_id: 'event-1' },
          { fingerprint: { in: ['fingerprint-1'] } },
          { correlation_id: { in: ['corr-1'] } },
        ],
      },
    });
    expect(alerts.emit).toHaveBeenCalledWith({
      key: 'issue.critical',
      message: 'Critical Sentry issue mirrored: Admin page failed',
      severity: 'critical',
    });
  });

  it('updates existing mirrors and hourly summaries without alerting resolved issues', async () => {
    const prisma = {
      platformErrorLog: { updateMany: jest.fn() },
      platformSentryEventsSummary: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          affected_tenant_ids: ['tenant-old'],
          affected_user_count: 1,
          event_count: BigInt(4),
          id: 'summary-1',
          sample_event_id: 'old-event',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      platformSentryIssue: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          correlation_ids: ['corr-old'],
          fingerprint: ['fingerprint-old'],
          first_seen_at: new Date('2026-05-17T08:00:00.000Z'),
          id: 'mirror-1',
          last_seen_at: new Date('2026-05-17T11:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue({ id: 'mirror-1', sentry_issue_id: 'SENTRY-1' }),
      },
    } as never;
    const tenantReadFacade = { findById: jest.fn().mockResolvedValue(null) } as never;
    const correlation = {
      correlate: jest.fn().mockResolvedValue({
        correlated_deploy_id: undefined,
        correlation_ids: ['corr-new'],
        related_runbook_keys: [],
        related_topology_keys: [],
        severity_policy_match: undefined,
      }),
    } as never;
    const alerts = { emit: jest.fn() } as never;
    const service = new SentryIngestionService(prisma, tenantReadFacade, correlation, alerts);
    const resolvedIssue = {
      ...ISSUE,
      correlation_ids: [],
      event_id: undefined,
      fingerprint: ['x'.repeat(65)],
      state: 'resolved' as const,
    };

    await service.ingest(resolvedIssue);

    expect(prisma.platformSentryIssue.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        correlation_ids: ['corr-old', 'corr-new'],
        fingerprint: ['fingerprint-old', 'x'.repeat(65)],
        tenant_id: undefined,
      }),
      where: { id: 'mirror-1' },
    });
    expect(prisma.platformSentryEventsSummary.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        affected_tenant_ids: ['tenant-old'],
        event_count: BigInt(5),
        sample_event_id: 'old-event',
      }),
      where: { id: 'summary-1' },
    });
    expect(prisma.platformErrorLog.updateMany).not.toHaveBeenCalled();
    expect(alerts.emit).not.toHaveBeenCalled();
  });
});
