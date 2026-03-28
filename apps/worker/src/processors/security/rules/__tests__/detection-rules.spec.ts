import type { PrismaClient } from '@prisma/client';

import { AuthSpikeRule } from '../auth-spike.rule';
import { BruteForceClusterRule } from '../brute-force-cluster.rule';
import { CrossTenantAttemptRule } from '../cross-tenant-attempt.rule';
import { DataExportSpikeRule } from '../data-export-spike.rule';
import { OffHoursBulkAccessRule } from '../off-hours-bulk-access.rule';
import { PermissionProbeRule } from '../permission-probe.rule';
import { UnusualAccessRule } from '../unusual-access.rule';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A = '00000000-0000-0000-0000-000000000001';
const USER_A = '00000000-0000-0000-0000-00000000000a';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma(): { $queryRaw: jest.Mock } & PrismaClient {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
  } as unknown as { $queryRaw: jest.Mock } & PrismaClient;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Detection Rules', () => {
  let mockPrisma: { $queryRaw: jest.Mock } & PrismaClient;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
  });

  afterEach(() => jest.clearAllMocks());

  // ─── UnusualAccessRule ────────────────────────────────────────────────────

  describe('UnusualAccessRule', () => {
    const rule = new UnusualAccessRule();

    it('should have the correct name', () => {
      expect(rule.name).toBe('unusual_access');
    });

    it('should detect 100+ student record accesses by single user', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { actor_user_id: USER_A, tenant_id: TENANT_A, access_count: BigInt(150) },
      ]);

      const violations = await rule.evaluate(mockPrisma);

      expect(violations).toHaveLength(1);
      expect(violations[0]!.incident_type).toBe('unusual_access');
      expect(violations[0]!.severity).toBe('high');
      expect(violations[0]!.affected_tenants).toEqual([TENANT_A]);
      expect(violations[0]!.metadata.actor_user_id).toBe(USER_A);
      expect(violations[0]!.metadata.access_count).toBe(150);
    });

    it('should not flag normal access patterns', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const violations = await rule.evaluate(mockPrisma);

      expect(violations).toHaveLength(0);
    });
  });

  // ─── AuthSpikeRule ────────────────────────────────────────────────────────

  describe('AuthSpikeRule', () => {
    const rule = new AuthSpikeRule();

    it('should have the correct name', () => {
      expect(rule.name).toBe('auth_spike');
    });

    it('should detect 10+ failed logins for same email', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { email: 'victim@school.ie', failure_count: BigInt(25) },
      ]);

      const violations = await rule.evaluate(mockPrisma);

      expect(violations).toHaveLength(1);
      expect(violations[0]!.incident_type).toBe('auth_spike');
      expect(violations[0]!.severity).toBe('medium');
      expect(violations[0]!.metadata.email).toBe('victim@school.ie');
      expect(violations[0]!.metadata.failure_count).toBe(25);
    });

    it('should not flag normal login failure rates', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const violations = await rule.evaluate(mockPrisma);

      expect(violations).toHaveLength(0);
    });
  });

  // ─── CrossTenantAttemptRule ───────────────────────────────────────────────

  describe('CrossTenantAttemptRule', () => {
    const rule = new CrossTenantAttemptRule();

    it('should have the correct name', () => {
      expect(rule.name).toBe('cross_tenant_attempt');
    });

    it('should flag every RLS violation as critical', async () => {
      const now = new Date();
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'log-1',
          actor_user_id: USER_A,
          tenant_id: TENANT_A,
          ip_address: '192.168.1.100',
          created_at: now,
        },
      ]);

      const violations = await rule.evaluate(mockPrisma);

      expect(violations).toHaveLength(1);
      expect(violations[0]!.incident_type).toBe('cross_tenant_attempt');
      expect(violations[0]!.severity).toBe('critical');
      expect(violations[0]!.affected_tenants).toEqual([TENANT_A]);
      expect(violations[0]!.metadata.audit_log_id).toBe('log-1');
      expect(violations[0]!.metadata.ip_address).toBe('192.168.1.100');
    });

    it('should handle null actor_user_id gracefully', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'log-2',
          actor_user_id: null,
          tenant_id: TENANT_A,
          ip_address: null,
          created_at: new Date(),
        },
      ]);

      const violations = await rule.evaluate(mockPrisma);

      expect(violations).toHaveLength(1);
      expect(violations[0]!.description).toContain('unknown');
      expect(violations[0]!.metadata.actor_user_id).toBeNull();
    });

    it('should return empty when no RLS violations exist', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const violations = await rule.evaluate(mockPrisma);

      expect(violations).toHaveLength(0);
    });
  });

  // ─── PermissionProbeRule ──────────────────────────────────────────────────

  describe('PermissionProbeRule', () => {
    const rule = new PermissionProbeRule();

    it('should have the correct name', () => {
      expect(rule.name).toBe('permission_probe');
    });

    it('should detect 20+ permission denials from single user', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { actor_user_id: USER_A, tenant_id: TENANT_A, denied_count: BigInt(35) },
      ]);

      const violations = await rule.evaluate(mockPrisma);

      expect(violations).toHaveLength(1);
      expect(violations[0]!.incident_type).toBe('permission_probe');
      expect(violations[0]!.severity).toBe('high');
      expect(violations[0]!.metadata.denied_count).toBe(35);
    });

    it('should not flag normal permission denial rates', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const violations = await rule.evaluate(mockPrisma);

      expect(violations).toHaveLength(0);
    });
  });

  // ─── BruteForceClusterRule ────────────────────────────────────────────────

  describe('BruteForceClusterRule', () => {
    const rule = new BruteForceClusterRule();

    it('should have the correct name', () => {
      expect(rule.name).toBe('brute_force_cluster');
    });

    it('should detect 5+ lockouts from same IP', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { ip_address: '10.0.0.50', lockout_count: BigInt(8) },
      ]);

      const violations = await rule.evaluate(mockPrisma);

      expect(violations).toHaveLength(1);
      expect(violations[0]!.incident_type).toBe('brute_force_cluster');
      expect(violations[0]!.severity).toBe('high');
      expect(violations[0]!.affected_tenants).toEqual([]);
      expect(violations[0]!.metadata.ip_address).toBe('10.0.0.50');
      expect(violations[0]!.metadata.lockout_count).toBe(8);
    });

    it('should not flag isolated lockout events', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const violations = await rule.evaluate(mockPrisma);

      expect(violations).toHaveLength(0);
    });
  });

  // ─── OffHoursBulkAccessRule ───────────────────────────────────────────────

  describe('OffHoursBulkAccessRule', () => {
    const rule = new OffHoursBulkAccessRule();

    it('should have the correct name', () => {
      expect(rule.name).toBe('off_hours_bulk_access');
    });

    it('should detect 50+ off-hours accesses by single user', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { actor_user_id: USER_A, tenant_id: TENANT_A, access_count: BigInt(75) },
      ]);

      const violations = await rule.evaluate(mockPrisma);

      expect(violations).toHaveLength(1);
      expect(violations[0]!.incident_type).toBe('off_hours_bulk_access');
      expect(violations[0]!.severity).toBe('medium');
      expect(violations[0]!.affected_tenants).toEqual([TENANT_A]);
      expect(violations[0]!.metadata.access_count).toBe(75);
      expect(violations[0]!.metadata.off_hours_range_utc).toBe('0:00\u20135:00');
    });

    it('should not flag normal off-hours activity', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const violations = await rule.evaluate(mockPrisma);

      expect(violations).toHaveLength(0);
    });
  });

  // ─── DataExportSpikeRule ──────────────────────────────────────────────────

  describe('DataExportSpikeRule', () => {
    const rule = new DataExportSpikeRule();

    it('should have the correct name', () => {
      expect(rule.name).toBe('data_export_spike');
    });

    it('should detect 3+ exports by single user in 1 hour', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { actor_user_id: USER_A, tenant_id: TENANT_A, export_count: BigInt(5) },
      ]);

      const violations = await rule.evaluate(mockPrisma);

      expect(violations).toHaveLength(1);
      expect(violations[0]!.incident_type).toBe('data_export_spike');
      expect(violations[0]!.severity).toBe('medium');
      expect(violations[0]!.affected_tenants).toEqual([TENANT_A]);
      expect(violations[0]!.metadata.export_count).toBe(5);
      expect(violations[0]!.metadata.window_minutes).toBe(60);
    });

    it('should not flag normal export activity', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const violations = await rule.evaluate(mockPrisma);

      expect(violations).toHaveLength(0);
    });
  });

  // ─── Multiple violations ──────────────────────────────────────────────────

  describe('Multiple violations per rule', () => {
    it('should return multiple violations when multiple users exceed threshold', async () => {
      const rule = new UnusualAccessRule();
      const userB = '00000000-0000-0000-0000-00000000000b';
      const tenantB = '00000000-0000-0000-0000-000000000002';

      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { actor_user_id: USER_A, tenant_id: TENANT_A, access_count: BigInt(200) },
        { actor_user_id: userB, tenant_id: tenantB, access_count: BigInt(120) },
      ]);

      const violations = await rule.evaluate(mockPrisma);

      expect(violations).toHaveLength(2);
      expect(violations[0]!.affected_tenants).toEqual([TENANT_A]);
      expect(violations[1]!.affected_tenants).toEqual([tenantB]);
    });
  });
});
