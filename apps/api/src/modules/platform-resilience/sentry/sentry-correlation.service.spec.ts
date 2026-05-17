import { SentryIssueState } from '@prisma/client';

import { SentryCorrelationService } from './sentry-correlation.service';
import type { NormalizedSentryIssue } from './sentry-types';

describe('SentryCorrelationService', () => {
  function buildPrisma() {
    return {
      platformCorrelationEvent: {
        findMany: jest.fn().mockResolvedValue([{ correlation_id: 'corr-db' }]),
      },
      platformDeployEvent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'deploy-1' }),
      },
      platformRunbookIndex: {
        findMany: jest.fn().mockResolvedValue([{ path: 'docs/runbooks/agent-sentry-triage.md' }]),
      },
      platformServiceTopology: {
        findMany: jest.fn().mockResolvedValue([{ key: 'api' }]),
      },
      platformSeverityPolicy: {
        findFirst: jest.fn().mockResolvedValue({ key: 'api-critical' }),
      },
    };
  }

  it('correlates deploys, correlation events, runbooks, topology, and severity policy', async () => {
    const prisma = buildPrisma();
    const service = new SentryCorrelationService(prisma as never);
    const issue = buildIssue();

    const result = await service.correlate(issue);

    expect(result).toEqual({
      correlated_deploy_id: 'deploy-1',
      correlation_ids: ['corr-tag', 'corr-db'],
      related_runbook_keys: ['docs/runbooks/agent-sentry-triage.md'],
      related_topology_keys: ['api'],
      severity_policy_match: 'api-critical',
    });
    expect(prisma.platformCorrelationEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          event_type: 'error_captured',
          OR: expect.arrayContaining([
            { correlation_id: { in: ['corr-tag'] } },
            { tenant_id: '11111111-1111-4111-8111-111111111111' },
          ]),
        }),
      }),
    );
  });
});

function buildIssue(): NormalizedSentryIssue {
  return {
    affected_user_count: 1,
    component: 'api',
    correlation_ids: ['corr-tag'],
    environment: 'production',
    fingerprint: ['fp-1'],
    first_seen_at: new Date('2026-05-17T10:00:00.000Z'),
    kind: 'issue_alert',
    last_seen_at: new Date('2026-05-17T10:02:00.000Z'),
    level: 'error',
    organization: 'edupod',
    permalink: 'https://sentry.example/issues/1',
    project: 'api',
    release: 'abc1234-build',
    sentry_issue_id: 'ISSUE-1',
    state: SentryIssueState.unresolved,
    tags: { component: 'api' },
    tenant_id: '11111111-1111-4111-8111-111111111111',
    title: 'Boom',
    total_event_count: 1,
  };
}
