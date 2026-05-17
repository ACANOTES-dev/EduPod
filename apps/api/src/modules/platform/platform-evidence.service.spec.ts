import { PlatformEvidenceService } from './platform-evidence.service';

const NOW = new Date('2026-05-17T12:00:00.000Z');
const TENANT_ID = '11111111-1111-4111-8111-111111111111';

function buildService() {
  const prisma = {
    platformAlertHistory: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'alert-1',
          fired_at: NOW,
          message: 'API latency high',
          severity: 'critical',
        },
      ]),
      findUnique: jest.fn().mockResolvedValue({
        id: 'alert-1',
        fired_at: NOW,
        severity: 'critical',
        rule: { name: 'API latency' },
      }),
    },
    platformAuditLog: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'audit-1',
          action: 'tenant.view',
          created_at: NOW,
        },
      ]),
    },
    platformCorrelationEvent: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'event-1',
          correlation_id: 'corr-1',
          source: 'api',
          event_type: 'http_request',
          occurred_at: NOW,
        },
      ]),
    },
    platformDeployEvent: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'deploy-1',
          short_sha: 'abcdef1',
          status: 'succeeded',
          deployed_at: NOW,
        },
      ]),
    },
    platformErrorLog: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'error-1',
          fingerprint: 'fingerprint-1',
          level: 'error',
          last_seen_at: NOW,
          message_redacted: 'Something broke in the API worker path',
        },
      ]),
    },
    platformRunbookIndex: {
      findMany: jest.fn().mockResolvedValue([{ id: 'runbook-1', title: 'API Recovery' }]),
    },
    platformServiceTopology: {
      findMany: jest.fn().mockResolvedValue([{ id: 'topology-1', display_name: 'API' }]),
    },
    platformSeverityPolicy: {
      findMany: jest.fn().mockResolvedValue([{ id: 'severity-1', severity: 'critical' }]),
    },
    platformTenantMetric: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'metric-1',
          snapshot_date: NOW,
        },
      ]),
    },
  };
  return {
    prisma,
    service: new PlatformEvidenceService(
      prisma as unknown as ConstructorParameters<typeof PlatformEvidenceService>[0],
    ),
  };
}

describe('PlatformEvidenceService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('maps correlation, alert, error, deploy, tenant, and audit rows into evidence items', async () => {
    const { prisma, service } = buildService();

    const correlation = await service.forCorrelationId('corr-1');
    const window = await service.forTimeWindow(
      new Date('2026-05-17T11:00:00.000Z'),
      new Date('2026-05-17T13:00:00.000Z'),
      { tenantId: TENANT_ID, components: ['api'] },
    );
    const error = await service.forErrorFingerprint('fingerprint-1');
    const alert = await service.forAlert('alert-1');
    const tenant = await service.forTenant(TENANT_ID, {
      since: new Date('2026-05-17T00:00:00.000Z'),
    });

    expect(correlation.items[0]).toMatchObject({
      kind: 'correlation_event',
      link: '/admin/correlation/corr-1',
    });
    expect(window.items.map((item) => item.kind)).toEqual([
      'alert',
      'error_fingerprint',
      'deploy_event',
    ]);
    expect(error.items[0].link).toBe('/admin/errors?fingerprint=fingerprint-1');
    expect(alert.items[0].snippet).toBe('critical alert from API latency');
    expect(tenant.items.map((item) => item.kind)).toEqual([
      'tenant_metric',
      'error_fingerprint',
      'audit_entry',
    ]);
    expect(prisma.platformErrorLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: { in: ['api'] } }),
      }),
    );
  });

  it('returns empty evidence for unknown alerts and exposes runbook/topology/severity helpers', async () => {
    const { prisma, service } = buildService();
    prisma.platformAlertHistory.findUnique.mockResolvedValueOnce(null);

    await expect(service.forAlert('missing-alert')).resolves.toEqual({ items: [] });
    await service.runbooksForAlert('health.api');
    await service.runbooksForError('fingerprint-1');
    await service.runbooksForAuditAction('tenant.view');
    await service.deploysInWindow(new Date('2026-05-17T11:00:00.000Z'), NOW);
    await service.topologyForEvidence({
      items: [
        {
          kind: 'alert',
          id: 'alert-1',
          link: '/admin/alerts',
          occurred_at: NOW.toISOString(),
          snippet: 'critical alert',
          raw: { severity: 'critical' },
        },
      ],
    });
    await service.severityForEvidence({
      items: [
        {
          kind: 'alert',
          id: 'alert-1',
          link: '/admin/alerts',
          occurred_at: NOW.toISOString(),
          snippet: 'critical alert',
          raw: { severity: 'critical' },
        },
      ],
    });

    expect(prisma.platformRunbookIndex.findMany).toHaveBeenCalledWith({
      where: { alert_keys: { has: 'health.api' } },
      orderBy: { title: 'asc' },
    });
    expect(prisma.platformServiceTopology.findMany).toHaveBeenCalledWith({
      where: { related_components: { hasSome: ['bullmq'] } },
      orderBy: { display_name: 'asc' },
    });
    expect(prisma.platformSeverityPolicy.findMany).toHaveBeenCalledWith({
      where: { severity: 'critical' },
      orderBy: { title: 'asc' },
    });
  });
});
