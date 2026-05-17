import { NotFoundException } from '@nestjs/common';

import { SentryIssuesService } from './sentry-issues.service';

const ISSUE_ROW = {
  affected_user_count: BigInt(2),
  correlated_deploy_id: 'deploy-1',
  correlation_ids: ['corr-1'],
  culprit: 'AdminPage',
  environment: 'production',
  error_logs: [{ id: 'error-1', last_seen_at: new Date('2026-05-17T11:00:00.000Z') }],
  events_summary: [
    {
      event_count: BigInt(3),
      hour_bucket: new Date('2026-05-17T10:00:00.000Z'),
      id: 'summary-1',
    },
  ],
  first_seen_at: new Date('2026-05-17T09:00:00.000Z'),
  id: 'issue-1',
  last_seen_at: new Date('2026-05-17T10:00:00.000Z'),
  level: 'error',
  permalink: 'https://sentry.example/issues/1',
  related_runbook_keys: ['agent-sentry-triage'],
  related_topology_keys: ['web'],
  release: 'web@1',
  sentry_issue_id: 'SENTRY-1',
  sentry_project: 'web',
  severity_policy_match: 'critical',
  stack_summary: 'Stack summary',
  state: 'unresolved',
  tags: { route: '/admin' },
  tenant_id: 'tenant-1',
  title: 'Admin failed',
  total_event_count: BigInt(5),
};

describe('SentryIssuesService', () => {
  it('lists issues with filters and serializes bigint counters', async () => {
    const prisma = {
      platformSentryIssue: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([ISSUE_ROW]),
      },
    } as never;
    const service = new SentryIssuesService(prisma);

    await expect(
      service.list({
        environment: 'production',
        page: 2,
        pageSize: 10,
        q: 'Admin',
        state: 'unresolved',
      }),
    ).resolves.toMatchObject({
      data: [{ affected_user_count: 2, total_event_count: 5 }],
      meta: { page: 2, pageSize: 10, total: 1 },
    });
    expect(prisma.platformSentryIssue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({
          environment: 'production',
          state: 'unresolved',
        }),
      }),
    );
  });

  it('returns issue detail with event summaries and linked error logs', async () => {
    const prisma = {
      platformSentryIssue: { findUnique: jest.fn().mockResolvedValue(ISSUE_ROW) },
    } as never;
    const service = new SentryIssuesService(prisma);

    await expect(service.get('issue-1')).resolves.toMatchObject({
      affected_user_count: 2,
      error_logs: [{ id: 'error-1' }],
      events_summary: [{ event_count: 3 }],
      total_event_count: 5,
    });
  });

  it('throws for missing detail records', async () => {
    const prisma = {
      platformSentryIssue: { findUnique: jest.fn().mockResolvedValue(null) },
    } as never;
    const service = new SentryIssuesService(prisma);

    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists webhook audit rows with signature filter', async () => {
    const prisma = {
      platformSentryWebhookAudit: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ id: 'audit-1', signature_valid: false }]),
      },
    } as never;
    const service = new SentryIssuesService(prisma);

    await expect(
      service.audit({ page: 1, pageSize: 25, signature_valid: false }),
    ).resolves.toMatchObject({
      data: [{ id: 'audit-1' }],
      meta: { total: 1 },
    });
    expect(prisma.platformSentryWebhookAudit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { signature_valid: false } }),
    );
  });

  it('prepares a static triage prompt without executing the runbook', async () => {
    const prisma = {
      platformSentryIssue: { findUnique: jest.fn().mockResolvedValue(ISSUE_ROW) },
    } as never;
    const service = new SentryIssuesService(prisma);

    await expect(service.preparePrompt('issue-1')).resolves.toMatchObject({
      prompt_markdown: expect.stringContaining('docs/runbooks/agent-sentry-triage.md'),
    });
  });
});
