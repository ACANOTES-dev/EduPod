import type { PrismaClient } from '@prisma/client';

import { SYSTEM_USER_SENTINEL } from '../../base/tenant-aware-job';

import {
  BreachDeadlineProcessor,
  BREACH_DEADLINE_JOB,
} from './breach-deadline.processor';

// ─── Constants ────────────────────────────────────────────────────────────────

const INCIDENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INCIDENT_ID_2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function buildIncident(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: INCIDENT_ID,
    incident_type: 'unusual_access',
    severity: 'high',
    status: 'detected',
    detected_at: hoursAgo(6),
    reported_to_dpc_at: null,
    ...overrides,
  };
}

function buildMockPrisma() {
  return {
    securityIncident: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    securityIncidentEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
  };
}

function buildJob(name: string = BREACH_DEADLINE_JOB) {
  return { name, data: {} };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('BreachDeadlineProcessor', () => {
  let processor: BreachDeadlineProcessor;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    processor = new BreachDeadlineProcessor(
      mockPrisma as unknown as PrismaClient,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Guard clause ─────────────────────────────────────────────────────

  it('should skip jobs with wrong name', async () => {
    await processor.process(buildJob('some-other-job') as never);

    expect(mockPrisma.securityIncident.findMany).not.toHaveBeenCalled();
  });

  // ─── 12-hour escalation ───────────────────────────────────────────────

  it('should add 12h escalation when incident is 12+ hours old', async () => {
    const incident = buildIncident({ detected_at: hoursAgo(13) });
    mockPrisma.securityIncident.findMany.mockResolvedValue([incident]);
    mockPrisma.securityIncidentEvent.findMany.mockResolvedValue([]);

    await processor.process(buildJob() as never);

    expect(mockPrisma.securityIncidentEvent.create).toHaveBeenCalledWith({
      data: {
        incident_id: INCIDENT_ID,
        event_type: 'escalation',
        description: '12-hour mark: incident not yet acknowledged',
        created_by_user_id: SYSTEM_USER_SENTINEL,
      },
    });
  });

  // ─── 48-hour escalation ───────────────────────────────────────────────

  it('should add 48h warning when incident is 48+ hours old', async () => {
    const incident = buildIncident({ detected_at: hoursAgo(50) });
    mockPrisma.securityIncident.findMany.mockResolvedValue([incident]);

    // Already has 12h escalation, but not 48h
    mockPrisma.securityIncidentEvent.findMany.mockResolvedValue([
      {
        id: 'esc-12',
        event_type: 'escalation',
        description: '12-hour mark: incident not yet acknowledged',
      },
    ]);

    await processor.process(buildJob() as never);

    // Should create both 48h (missing) escalation. 12h already exists.
    // 72h is not yet reached.
    const createCalls = mockPrisma.securityIncidentEvent.create.mock.calls;
    const descriptions = createCalls.map(
      (call: [{ data: { description: string } }]) => call[0].data.description,
    );

    expect(descriptions).toContain(
      '48-hour warning: 24 hours remaining for DPC notification',
    );
    expect(descriptions).not.toContain(
      '12-hour mark: incident not yet acknowledged',
    );
  });

  // ─── 72-hour escalation ───────────────────────────────────────────────

  it('should add 72h critical alert when DPC notification deadline reached', async () => {
    const incident = buildIncident({
      detected_at: hoursAgo(73),
      reported_to_dpc_at: null,
    });
    mockPrisma.securityIncident.findMany.mockResolvedValue([incident]);

    // Already has 12h and 48h escalations
    mockPrisma.securityIncidentEvent.findMany.mockResolvedValue([
      {
        id: 'esc-12',
        event_type: 'escalation',
        description: '12-hour mark: incident not yet acknowledged',
      },
      {
        id: 'esc-48',
        event_type: 'escalation',
        description: '48-hour warning: 24 hours remaining for DPC notification',
      },
    ]);

    await processor.process(buildJob() as never);

    expect(mockPrisma.securityIncidentEvent.create).toHaveBeenCalledWith({
      data: {
        incident_id: INCIDENT_ID,
        event_type: 'escalation',
        description: 'CRITICAL: 72-hour DPC notification deadline reached',
        created_by_user_id: SYSTEM_USER_SENTINEL,
      },
    });
  });

  // ─── Skips existing escalation ────────────────────────────────────────

  it('should skip escalation if already exists', async () => {
    const incident = buildIncident({ detected_at: hoursAgo(13) });
    mockPrisma.securityIncident.findMany.mockResolvedValue([incident]);

    // 12h escalation already exists
    mockPrisma.securityIncidentEvent.findMany.mockResolvedValue([
      {
        id: 'esc-12',
        event_type: 'escalation',
        description: '12-hour mark: incident not yet acknowledged',
      },
    ]);

    await processor.process(buildJob() as never);

    // No new escalation events should be created — 12h already exists,
    // and 48h/72h thresholds are not yet reached at 13 hours.
    expect(mockPrisma.securityIncidentEvent.create).not.toHaveBeenCalled();
  });

  // ─── Only high/critical severity ──────────────────────────────────────

  it('should only check high and critical severity incidents', async () => {
    await processor.process(buildJob() as never);

    expect(mockPrisma.securityIncident.findMany).toHaveBeenCalledWith({
      where: {
        status: { notIn: ['resolved', 'closed'] },
        severity: { in: ['high', 'critical'] },
      },
    });
  });

  // ─── 72h skipped when DPC already notified ────────────────────────────

  it('should skip 72h escalation when reported_to_dpc_at is set', async () => {
    const incident = buildIncident({
      detected_at: hoursAgo(73),
      reported_to_dpc_at: new Date('2026-03-26T10:00:00Z'),
    });
    mockPrisma.securityIncident.findMany.mockResolvedValue([incident]);

    // Has 12h and 48h but not 72h
    mockPrisma.securityIncidentEvent.findMany.mockResolvedValue([
      {
        id: 'esc-12',
        event_type: 'escalation',
        description: '12-hour mark: incident not yet acknowledged',
      },
      {
        id: 'esc-48',
        event_type: 'escalation',
        description: '48-hour warning: 24 hours remaining for DPC notification',
      },
    ]);

    await processor.process(buildJob() as never);

    // 72h escalation should NOT be created since DPC was already notified
    const createCalls = mockPrisma.securityIncidentEvent.create.mock.calls;
    const descriptions = createCalls.map(
      (call: [{ data: { description: string } }]) => call[0].data.description,
    );

    expect(descriptions).not.toContain(
      'CRITICAL: 72-hour DPC notification deadline reached',
    );
  });

  // ─── Multiple incidents ───────────────────────────────────────────────

  it('should process multiple incidents independently', async () => {
    const incident1 = buildIncident({
      id: INCIDENT_ID,
      detected_at: hoursAgo(13),
    });
    const incident2 = buildIncident({
      id: INCIDENT_ID_2,
      detected_at: hoursAgo(50),
    });
    mockPrisma.securityIncident.findMany.mockResolvedValue([
      incident1,
      incident2,
    ]);

    // No existing escalations for either
    mockPrisma.securityIncidentEvent.findMany.mockResolvedValue([]);

    await processor.process(buildJob() as never);

    // Incident 1 (13h): gets 12h escalation
    // Incident 2 (50h): gets 12h + 48h escalations
    // Total: 3 escalation events
    expect(mockPrisma.securityIncidentEvent.create).toHaveBeenCalledTimes(3);
  });
});
