/* eslint-disable import/order -- jest.mock must precede mocked imports */
jest.mock('./rules/unusual-access.rule');
jest.mock('./rules/auth-spike.rule');
jest.mock('./rules/cross-tenant-attempt.rule');
jest.mock('./rules/permission-probe.rule');
jest.mock('./rules/brute-force-cluster.rule');
jest.mock('./rules/off-hours-bulk-access.rule');
jest.mock('./rules/data-export-spike.rule');

import type { PrismaClient } from '@prisma/client';

import { SYSTEM_USER_SENTINEL } from '../../base/tenant-aware-job';

import { AnomalyScanProcessor, ANOMALY_SCAN_JOB } from './anomaly-scan.processor';
import { AuthSpikeRule } from './rules/auth-spike.rule';
import { BruteForceClusterRule } from './rules/brute-force-cluster.rule';
import { CrossTenantAttemptRule } from './rules/cross-tenant-attempt.rule';
import { DataExportSpikeRule } from './rules/data-export-spike.rule';
import type { Violation } from './rules/detection-rule.interface';
import { OffHoursBulkAccessRule } from './rules/off-hours-bulk-access.rule';
import { PermissionProbeRule } from './rules/permission-probe.rule';
import { UnusualAccessRule } from './rules/unusual-access.rule';

// ─── Constants ────────────────────────────────────────────────────────────────

const INCIDENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildViolation(overrides: Partial<Violation> = {}): Violation {
  return {
    incident_type: 'unusual_access',
    severity: 'high',
    description: 'Test violation detected',
    affected_tenants: [TENANT_ID],
    metadata: {},
    ...overrides,
  };
}

function buildMockPrisma() {
  return {
    securityIncident: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: INCIDENT_ID }),
      update: jest.fn().mockResolvedValue({ id: INCIDENT_ID }),
    },
    securityIncidentEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
  };
}

function buildJob(name: string = ANOMALY_SCAN_JOB) {
  return { name, data: {} };
}

/** Configure all 7 mocked rule classes to return empty violations by default */
function configureRuleMocks(violations: Violation[] = []) {
  const ruleClasses = [
    UnusualAccessRule,
    AuthSpikeRule,
    CrossTenantAttemptRule,
    PermissionProbeRule,
    BruteForceClusterRule,
    OffHoursBulkAccessRule,
    DataExportSpikeRule,
  ];

  for (const RuleClass of ruleClasses) {
    (RuleClass as jest.Mock).mockImplementation(() => ({
      name: RuleClass.name,
      evaluate: jest.fn().mockResolvedValue(violations),
    }));
  }
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('AnomalyScanProcessor', () => {
  let processor: AnomalyScanProcessor;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    configureRuleMocks();
    processor = new AnomalyScanProcessor(
      mockPrisma as unknown as PrismaClient,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Guard clause ─────────────────────────────────────────────────────

  it('should skip jobs with wrong name', async () => {
    await processor.process(buildJob('some-other-job') as never);

    expect(mockPrisma.securityIncident.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.securityIncident.create).not.toHaveBeenCalled();
  });

  // ─── All rules evaluated ──────────────────────────────────────────────

  it('should run all 7 detection rules', async () => {
    await processor.process(buildJob() as never);

    // Each mocked class should have been instantiated exactly once
    expect(UnusualAccessRule).toHaveBeenCalledTimes(1);
    expect(AuthSpikeRule).toHaveBeenCalledTimes(1);
    expect(CrossTenantAttemptRule).toHaveBeenCalledTimes(1);
    expect(PermissionProbeRule).toHaveBeenCalledTimes(1);
    expect(BruteForceClusterRule).toHaveBeenCalledTimes(1);
    expect(OffHoursBulkAccessRule).toHaveBeenCalledTimes(1);
    expect(DataExportSpikeRule).toHaveBeenCalledTimes(1);
  });

  // ─── New incident creation ────────────────────────────────────────────

  it('should create new incident for new violation', async () => {
    const violation = buildViolation();

    // Only the first rule returns a violation; others return empty
    (UnusualAccessRule as jest.Mock).mockImplementation(() => ({
      name: 'unusual_access',
      evaluate: jest.fn().mockResolvedValue([violation]),
    }));

    // Recreate processor so it picks up the new mock
    processor = new AnomalyScanProcessor(
      mockPrisma as unknown as PrismaClient,
    );

    // findFirst returns null — no existing open incident
    mockPrisma.securityIncident.findFirst.mockResolvedValue(null);

    await processor.process(buildJob() as never);

    expect(mockPrisma.securityIncident.findFirst).toHaveBeenCalledWith({
      where: {
        incident_type: 'unusual_access',
        status: { notIn: ['resolved', 'closed'] },
      },
      orderBy: { detected_at: 'desc' },
    });

    expect(mockPrisma.securityIncident.create).toHaveBeenCalledWith({
      data: {
        severity: 'high',
        incident_type: 'unusual_access',
        description: 'Test violation detected',
        affected_tenants: [TENANT_ID],
        data_categories_affected: [],
        status: 'detected',
        created_by_user_id: SYSTEM_USER_SENTINEL,
      },
    });
  });

  // ─── Deduplication — update existing incident ─────────────────────────

  it('should update existing open incident instead of creating duplicate', async () => {
    const violation = buildViolation();

    (UnusualAccessRule as jest.Mock).mockImplementation(() => ({
      name: 'unusual_access',
      evaluate: jest.fn().mockResolvedValue([violation]),
    }));

    processor = new AnomalyScanProcessor(
      mockPrisma as unknown as PrismaClient,
    );

    const existingIncident = {
      id: INCIDENT_ID,
      incident_type: 'unusual_access',
      status: 'detected',
      detected_at: new Date('2026-03-27T10:00:00Z'),
    };

    mockPrisma.securityIncident.findFirst.mockResolvedValue(existingIncident);

    await processor.process(buildJob() as never);

    // Should NOT create a new incident
    expect(mockPrisma.securityIncident.create).not.toHaveBeenCalled();

    // Should add evidence event
    expect(mockPrisma.securityIncidentEvent.create).toHaveBeenCalledWith({
      data: {
        incident_id: INCIDENT_ID,
        event_type: 'evidence',
        description: 'Anomaly re-detected: Test violation detected',
        created_by_user_id: SYSTEM_USER_SENTINEL,
      },
    });

    // Should update detected_at
    expect(mockPrisma.securityIncident.update).toHaveBeenCalledWith({
      where: { id: INCIDENT_ID },
      data: { detected_at: expect.any(Date) },
    });
  });

  // ─── Rule failure isolation ───────────────────────────────────────────

  it('should continue scanning after a rule throws', async () => {
    // First rule throws; remaining rules return empty violations
    (UnusualAccessRule as jest.Mock).mockImplementation(() => ({
      name: 'unusual_access',
      evaluate: jest.fn().mockRejectedValue(new Error('rule error')),
    }));

    processor = new AnomalyScanProcessor(
      mockPrisma as unknown as PrismaClient,
    );

    // Should not throw — other rules continue
    await expect(processor.process(buildJob() as never)).resolves.toBeUndefined();

    // No incidents created since the only violation came from the failing rule
    expect(mockPrisma.securityIncident.create).not.toHaveBeenCalled();
  });
});
