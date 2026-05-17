import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { PlatformIncidentService } from './platform-incident.service';

const ALERT_ID = '11111111-1111-4111-8111-111111111111';
const RELATED_ALERT_ID = '22222222-2222-4222-8222-222222222222';
const INCIDENT_ID = '33333333-3333-4333-8333-333333333333';
const RULE_ID = '44444444-4444-4444-8444-444444444444';
const FIRED_AT = new Date('2026-05-17T10:00:00.000Z');

function buildMockPrisma() {
  return {
    platformAiRecommendation: { findMany: jest.fn() },
    platformAlertHistory: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    platformIncident: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    platformIncidentTimelineEvent: {
      create: jest.fn(),
    },
  };
}

function buildRule(component = 'redis') {
  return {
    id: RULE_ID,
    condition_config: { component, operator: 'gt', threshold: 1 },
    cooldown_minutes: 15,
    created_at: FIRED_AT,
    is_enabled: true,
    is_security_critical: false,
    metric: 'health_status',
    name: `${component} down`,
    notify_emails: [],
    severity: 'critical',
    updated_at: FIRED_AT,
  };
}

function buildAlert(id = ALERT_ID, severity: 'critical' | 'warning' = 'critical') {
  return {
    id,
    acknowledged_at: null,
    acknowledged_by: null,
    channels_notified: [],
    fired_at: FIRED_AT,
    incident_id: null,
    message: `${severity} redis alert`,
    metric_value: new Prisma.Decimal(2),
    resolved_at: null,
    rule: buildRule(),
    rule_id: RULE_ID,
    severity,
    status: 'fired',
    suppressed_by_maintenance_window_id: null,
    suppressed_by_silence_id: null,
  };
}

function buildIncident(status: 'active' | 'monitoring' | 'resolved' = 'active') {
  return {
    id: INCIDENT_ID,
    affected_components: ['redis'],
    affected_tenants: [],
    auto_resolved: false,
    created_at: FIRED_AT,
    postmortem_draft: null,
    postmortem_final: null,
    postmortem_generated_at: null,
    postmortem_generations: 0,
    prevention_recommendation_ids: [],
    resolved_at: status === 'monitoring' ? new Date('2026-05-17T10:05:00.000Z') : null,
    resolved_by_user_id: null,
    root_cause_summary: null,
    seed_alert_history_id: ALERT_ID,
    severity: 'critical',
    started_at: FIRED_AT,
    status,
    title: 'redis down',
    updated_at: FIRED_AT,
  };
}

describe('PlatformIncidentService', () => {
  let service: PlatformIncidentService;
  let prisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-17T11:10:00.000Z'));
    prisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PlatformIncidentService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(PlatformIncidentService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('lists incidents with filters and pagination metadata', async () => {
    const incident = buildIncident();
    const from = new Date('2026-05-17T00:00:00.000Z');
    const to = new Date('2026-05-18T00:00:00.000Z');
    prisma.platformIncident.findMany.mockResolvedValueOnce([incident]);
    prisma.platformIncident.count.mockResolvedValueOnce(1);

    await expect(
      service.list({ from, page: 2, pageSize: 10, severity: 'critical', status: 'active', to }),
    ).resolves.toEqual({ data: [incident], meta: { page: 2, pageSize: 10, total: 1 } });

    expect(prisma.platformIncident.findMany).toHaveBeenCalledWith({
      where: {
        severity: 'critical',
        started_at: { gte: from, lte: to },
        status: 'active',
      },
      orderBy: { started_at: 'desc' },
      skip: 10,
      take: 10,
    });
  });

  it('returns incident details with linked prevention recommendations', async () => {
    const incident = {
      ...buildIncident(),
      alerts: [],
      handoffs: [],
      prevention_recommendation_ids: ['rec-1'],
      timeline: [],
    };
    prisma.platformIncident.findUnique.mockResolvedValueOnce(incident);
    prisma.platformAiRecommendation.findMany.mockResolvedValueOnce([{ id: 'rec-1' }]);

    await expect(service.get(INCIDENT_ID)).resolves.toEqual({
      ...incident,
      prevention_recommendations: [{ id: 'rec-1' }],
    });
  });

  it('throws when incident detail lookup misses', async () => {
    prisma.platformIncident.findUnique.mockResolvedValueOnce(null);

    await expect(service.get(INCIDENT_ID)).rejects.toThrow('Platform incident');
  });

  it('updates incident status to resolved with an operator resolver', async () => {
    const incident = buildIncident();
    const userId = '99999999-9999-4999-8999-999999999999';
    prisma.platformIncident.findUnique.mockResolvedValueOnce(incident);
    prisma.platformIncident.update.mockResolvedValueOnce({ ...incident, status: 'resolved' });
    prisma.platformIncidentTimelineEvent.create.mockResolvedValueOnce({});

    await service.update(
      INCIDENT_ID,
      { status: 'resolved', title: 'Recovered Redis incident' },
      userId,
    );

    expect(prisma.platformIncident.update).toHaveBeenCalledWith({
      where: { id: INCIDENT_ID },
      data: expect.objectContaining({
        auto_resolved: false,
        resolved_by: { connect: { id: userId } },
        status: 'resolved',
        title: 'Recovered Redis incident',
      }),
    });
    expect(prisma.platformIncidentTimelineEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'Incident status changed from active to resolved.',
        event_type: 'status_changed',
      }),
    });
  });

  it('reopens a monitoring incident by clearing resolution metadata', async () => {
    const incident = buildIncident('monitoring');
    prisma.platformIncident.findUnique.mockResolvedValueOnce(incident);
    prisma.platformIncident.update.mockResolvedValueOnce({ ...incident, status: 'active' });
    prisma.platformIncidentTimelineEvent.create.mockResolvedValueOnce({});

    await service.update(INCIDENT_ID, { status: 'active' }, 'user-1');

    expect(prisma.platformIncident.update).toHaveBeenCalledWith({
      where: { id: INCIDENT_ID },
      data: expect.objectContaining({
        auto_resolved: false,
        resolved_at: null,
        resolved_by: { disconnect: true },
        status: 'active',
      }),
    });
  });

  it('adds operator notes and saves final postmortems only after the incident exists', async () => {
    prisma.platformIncident.count.mockResolvedValue(1);
    prisma.platformIncidentTimelineEvent.create.mockResolvedValueOnce({ id: 'event-1' });
    prisma.platformIncident.update.mockResolvedValueOnce({
      ...buildIncident(),
      postmortem_final: '## Final',
    });

    await service.addOperatorNote(INCIDENT_ID, { description: 'Operator note' });
    await service.saveFinalPostmortem(INCIDENT_ID, '## Final');

    expect(prisma.platformIncidentTimelineEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'Operator note',
        event_type: 'operator_note',
      }),
    });
    expect(prisma.platformIncident.update).toHaveBeenCalledWith({
      where: { id: INCIDENT_ID },
      data: { postmortem_final: '## Final' },
    });
  });

  it('returns null for suppressed or non-critical unrelated alerts', async () => {
    prisma.platformAlertHistory.findUnique.mockResolvedValueOnce({
      ...buildAlert(ALERT_ID, 'critical'),
      suppressed_by_silence_id: 'silence-1',
    });
    await expect(service.createOrAttachFromAlert(ALERT_ID)).resolves.toBeNull();

    prisma.platformAlertHistory.findUnique.mockResolvedValueOnce(
      buildAlert(RELATED_ALERT_ID, 'warning'),
    );
    prisma.platformIncident.findMany.mockResolvedValueOnce([]);
    await expect(service.createOrAttachFromAlert(RELATED_ALERT_ID)).resolves.toBeNull();

    expect(prisma.platformIncident.create).not.toHaveBeenCalled();
  });

  it('creates a new incident when a critical alert fires with no related incident', async () => {
    const alert = buildAlert();
    const incident = buildIncident();
    prisma.platformAlertHistory.findUnique.mockResolvedValueOnce(alert);
    prisma.platformIncident.findMany.mockResolvedValueOnce([]);
    prisma.platformIncident.create.mockResolvedValueOnce(incident);
    prisma.platformAlertHistory.update.mockResolvedValueOnce({
      ...alert,
      incident_id: INCIDENT_ID,
    });
    prisma.platformIncident.update.mockResolvedValueOnce(incident);
    prisma.platformIncidentTimelineEvent.create.mockResolvedValueOnce({});

    await expect(service.createOrAttachFromAlert(ALERT_ID)).resolves.toEqual(incident);

    expect(prisma.platformIncident.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        seed_alert_history_id: ALERT_ID,
        severity: 'critical',
      }),
    });
    expect(prisma.platformAlertHistory.update).toHaveBeenCalledWith({
      where: { id: ALERT_ID },
      data: { incident_id: INCIDENT_ID },
    });
  });

  it('attaches a related warning alert without downgrading the incident severity', async () => {
    const relatedAlert = buildAlert(RELATED_ALERT_ID, 'warning');
    const incident = buildIncident();
    prisma.platformAlertHistory.findUnique.mockResolvedValueOnce(relatedAlert);
    prisma.platformIncident.findMany.mockResolvedValueOnce([
      { ...incident, alerts: [buildAlert()] },
    ]);
    prisma.platformAlertHistory.update.mockResolvedValueOnce({
      ...relatedAlert,
      incident_id: INCIDENT_ID,
    });
    prisma.platformIncident.update.mockResolvedValueOnce(incident);
    prisma.platformIncidentTimelineEvent.create.mockResolvedValueOnce({});

    await expect(service.createOrAttachFromAlert(RELATED_ALERT_ID)).resolves.toMatchObject({
      severity: 'critical',
    });

    expect(prisma.platformIncident.create).not.toHaveBeenCalled();
    expect(prisma.platformIncident.update).toHaveBeenCalledWith({
      where: { id: INCIDENT_ID },
      data: expect.objectContaining({ status: 'active' }),
    });
  });

  it('returns an existing incident when the alert is already attached', async () => {
    const incident = buildIncident();
    prisma.platformAlertHistory.findUnique.mockResolvedValueOnce({
      ...buildAlert(),
      incident_id: INCIDENT_ID,
    });
    prisma.platformIncident.findUnique.mockResolvedValueOnce(incident);

    await expect(service.createOrAttachFromAlert(ALERT_ID)).resolves.toEqual(incident);

    expect(prisma.platformIncident.findMany).not.toHaveBeenCalled();
    expect(prisma.platformIncident.create).not.toHaveBeenCalled();
  });

  it('records alert acknowledgements in the incident timeline', async () => {
    prisma.platformAlertHistory.findUnique.mockResolvedValueOnce({
      ...buildAlert(),
      incident_id: INCIDENT_ID,
    });
    prisma.platformIncidentTimelineEvent.create.mockResolvedValueOnce({});

    await service.recordAlertAcknowledged(ALERT_ID, FIRED_AT);

    expect(prisma.platformIncidentTimelineEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        alert_history_id: ALERT_ID,
        description: 'Alert acknowledged: critical redis alert',
        event_type: 'alert_acknowledged',
      }),
    });
  });

  it('moves an incident to monitoring after all contributing alerts resolve', async () => {
    const resolvedAt = new Date('2026-05-17T10:05:00.000Z');
    prisma.platformAlertHistory.findUnique.mockResolvedValueOnce({
      ...buildAlert(),
      incident_id: INCIDENT_ID,
      resolved_at: resolvedAt,
      status: 'resolved',
    });
    prisma.platformIncidentTimelineEvent.create.mockResolvedValue({});
    prisma.platformIncident.findUnique.mockResolvedValueOnce({
      ...buildIncident(),
      alerts: [{ ...buildAlert(), status: 'resolved' }],
    });
    prisma.platformIncident.update.mockResolvedValueOnce({
      ...buildIncident('monitoring'),
      resolved_at: resolvedAt,
    });

    await service.recordAlertResolved(ALERT_ID, resolvedAt);

    expect(prisma.platformIncident.update).toHaveBeenCalledWith({
      where: { id: INCIDENT_ID },
      data: { resolved_at: resolvedAt, status: 'monitoring' },
    });
  });

  it('auto-resolves a monitoring incident after one quiet hour', async () => {
    const oldResolvedAt = new Date('2026-05-17T10:05:00.000Z');
    prisma.platformIncident.findMany.mockResolvedValueOnce([
      {
        ...buildIncident('monitoring'),
        resolved_at: oldResolvedAt,
        alerts: [{ ...buildAlert(), fired_at: FIRED_AT, status: 'resolved' }],
      },
    ]);
    prisma.platformIncident.update.mockResolvedValueOnce({
      ...buildIncident('resolved'),
      auto_resolved: true,
    });
    prisma.platformIncidentTimelineEvent.create.mockResolvedValueOnce({});

    await expect(service.autoResolveMonitoringIncidents()).resolves.toBe(1);

    expect(prisma.platformIncident.update).toHaveBeenCalledWith({
      where: { id: INCIDENT_ID },
      data: {
        auto_resolved: true,
        resolved_at: new Date('2026-05-17T11:10:00.000Z'),
        status: 'resolved',
      },
    });
  });

  it('does not auto-resolve monitoring incidents before the quiet period is over', async () => {
    prisma.platformIncident.findMany.mockResolvedValueOnce([
      {
        ...buildIncident('monitoring'),
        resolved_at: new Date('2026-05-17T10:30:00.000Z'),
        alerts: [
          {
            ...buildAlert(),
            fired_at: new Date('2026-05-17T10:30:00.000Z'),
            status: 'resolved',
          },
        ],
      },
    ]);

    await expect(service.autoResolveMonitoringIncidents()).resolves.toBe(0);

    expect(prisma.platformIncident.update).not.toHaveBeenCalled();
  });

  it('links prevention recommendations without duplicating existing links', async () => {
    prisma.platformIncident.findUnique.mockResolvedValueOnce({
      ...buildIncident(),
      prevention_recommendation_ids: ['rec-1'],
    });
    prisma.platformIncident.update.mockResolvedValueOnce({
      ...buildIncident(),
      prevention_recommendation_ids: ['rec-1', 'rec-2'],
    });
    prisma.platformIncidentTimelineEvent.create.mockResolvedValue({});

    await expect(
      service.linkPreventionRecommendations(INCIDENT_ID, ['rec-1', 'rec-2']),
    ).resolves.toMatchObject({ prevention_recommendation_ids: ['rec-1', 'rec-2'] });

    expect(prisma.platformIncident.update).toHaveBeenCalledWith({
      where: { id: INCIDENT_ID },
      data: { prevention_recommendation_ids: ['rec-1', 'rec-2'] },
    });
    expect(prisma.platformIncidentTimelineEvent.create).toHaveBeenCalledTimes(2);
  });
});
