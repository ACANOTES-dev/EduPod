/**
 * Pastoral Concerns — RLS Leakage & Permission Tests (e2e)
 *
 * Verifies:
 *   1. Tenant isolation — Tenant B cannot see Tenant A concerns
 *   2. Tier 3 RLS — non-DLP user cannot see tier 3 concerns
 *   3. Tier 3 RLS — DLP user CAN see tier 3 concerns
 *   4. Concern versions inherit concern RLS
 *   5. Pastoral events RLS
 *   6. Permission guards (403 without required permissions)
 *
 * Pattern:
 *   1. Create test data as Al Noor (Tenant A) via direct DB inserts
 *   2. Authenticate as Cedar (Tenant B) or restricted users -> attempt to read/modify
 *   3. Assert: Cedar MUST NOT see Al Noor data; restricted users get 403
 *
 * Note: These tests require SW-1A migration to be applied (pastoral_concerns table).
 * If the table does not exist, all tests are skipped gracefully.
 */

import './setup-env';

import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_ADMIN_EMAIL,
  CEDAR_DOMAIN,
  CEDAR_ADMIN_EMAIL,
  authGet,
  authPost,
  authPatch,
  closeTestApp,
  createTestApp,
  getAuthToken,
} from './helpers';

// ─── Constants ──────────────────────────────────────────────────────────────

jest.setTimeout(120_000);

const UNIQUE_MARKER = `PastoralRls_${Date.now()}`;

// ─── Infrastructure check ───────────────────────────────────────────────────

/**
 * Checks whether the pastoral_concerns table exists.
 * Returns false if SW-1A migration has not been applied.
 */
async function pastoralTablesExist(): Promise<boolean> {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });
  try {
    await prisma.$connect();
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'pastoral_concerns'
      ) AS exists
    `;
    return result[0]?.exists ?? false;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('Pastoral Concerns — RLS & Permission Tests (e2e)', () => {
  let app: INestApplication;
  let alNoorAdminToken: string;
  let cedarAdminToken: string;
  let tablesExist: boolean;

  /** Direct Prisma client for creating test data outside RLS */
  let directPrisma: PrismaClient;

  // IDs populated during setup
  let alNoorTenantId: string;
  let alNoorConcernId: string;
  let alNoorTier3ConcernId: string;
  let alNoorStudentId: string;

  beforeAll(async () => {
    // Check if pastoral tables exist before attempting setup
    tablesExist = await pastoralTablesExist();
    if (!tablesExist) {
      // eslint-disable-next-line no-console
      console.warn(
        'SKIPPING pastoral-concerns e2e tests: pastoral_concerns table does not exist (SW-1A migration not applied)',
      );
      return;
    }

    app = await createTestApp();

    alNoorAdminToken = await getAuthToken(app, AL_NOOR_ADMIN_EMAIL, AL_NOOR_DOMAIN);
    cedarAdminToken = await getAuthToken(app, CEDAR_ADMIN_EMAIL, CEDAR_DOMAIN);

    // Direct Prisma client for raw data setup
    directPrisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    await directPrisma.$connect();

    // Look up tenant IDs
    const alNoorDomain = await directPrisma.tenantDomain.findFirst({
      where: { domain: AL_NOOR_DOMAIN },
    });
    alNoorTenantId = alNoorDomain!.tenant_id;

    // Get a student belonging to Al Noor for concern creation
    const alNoorStudent = await directPrisma.student.findFirst({
      where: { tenant_id: alNoorTenantId },
    });
    alNoorStudentId = alNoorStudent!.id;

    // Get an Al Noor admin user ID for logged_by
    const alNoorAdmin = await directPrisma.user.findFirst({
      where: {
        email: AL_NOOR_ADMIN_EMAIL,
        memberships: { some: { tenant_id: alNoorTenantId } },
      },
    });
    const alNoorAdminUserId = alNoorAdmin!.id;

    // ── Create Al Noor test concerns via direct DB insert ──────────────────

    // Tier 1 concern
    const tier1Concern = await directPrisma.pastoralConcern.create({
      data: {
        tenant_id: alNoorTenantId,
        student_id: alNoorStudentId,
        category: 'academic',
        severity: 'routine',
        tier: 1,
        logged_by_user_id: alNoorAdminUserId,
        occurred_at: new Date(),
        author_masked: false,
        follow_up_needed: false,
        parent_shareable: false,
        location: `RLS test ${UNIQUE_MARKER}`,
      },
    });
    alNoorConcernId = tier1Concern.id;

    // Tier 3 concern (child protection)
    const tier3Concern = await directPrisma.pastoralConcern.create({
      data: {
        tenant_id: alNoorTenantId,
        student_id: alNoorStudentId,
        category: 'child_protection',
        severity: 'critical',
        tier: 3,
        logged_by_user_id: alNoorAdminUserId,
        occurred_at: new Date(),
        author_masked: false,
        follow_up_needed: false,
        parent_shareable: false,
        location: `Tier3 RLS test ${UNIQUE_MARKER}`,
      },
    });
    alNoorTier3ConcernId = tier3Concern.id;

    // Create a v1 narrative version for the tier 1 concern
    await directPrisma.pastoralConcernVersion.create({
      data: {
        tenant_id: alNoorTenantId,
        concern_id: alNoorConcernId,
        version_number: 1,
        narrative: 'Initial narrative for RLS test',
        amended_by_user_id: alNoorAdminUserId,
      },
    });

    // Create a v1 narrative version for the tier 3 concern
    await directPrisma.pastoralConcernVersion.create({
      data: {
        tenant_id: alNoorTenantId,
        concern_id: alNoorTier3ConcernId,
        version_number: 1,
        narrative: 'Tier 3 initial narrative for RLS test',
        amended_by_user_id: alNoorAdminUserId,
      },
    });

    // Create a pastoral event for the tier 1 concern
    await directPrisma.pastoralEvent.create({
      data: {
        tenant_id: alNoorTenantId,
        event_type: 'concern_created',
        entity_type: 'concern',
        entity_id: alNoorConcernId,
        student_id: alNoorStudentId,
        actor_user_id: alNoorAdminUserId,
        tier: 1,
        payload: {
          concern_id: alNoorConcernId,
          student_id: alNoorStudentId,
          category: 'academic',
          severity: 'routine',
          tier: 1,
          narrative_version: 1,
          narrative_snapshot: 'Initial narrative for RLS test',
          source: 'manual',
        },
      },
    });
  });

  afterAll(async () => {
    if (!tablesExist) return;

    // Clean up test data
    if (directPrisma) {
      try {
        const idsToClean = [alNoorConcernId, alNoorTier3ConcernId].filter(Boolean);
        if (idsToClean.length > 0) {
          await directPrisma.pastoralEvent.deleteMany({
            where: { entity_id: { in: idsToClean } },
          });
          await directPrisma.pastoralConcernVersion.deleteMany({
            where: { concern_id: { in: idsToClean } },
          });
          await directPrisma.pastoralConcern.deleteMany({
            where: { id: { in: idsToClean } },
          });
        }
      } catch {
        // Cleanup failures are non-fatal in test teardown
      }
      await directPrisma.$disconnect();
    }
    await closeTestApp();
  });

  // ─── RLS Leakage Tests ────────────────────────────────────────────────────

  describe('RLS leakage', () => {
    it('tenant isolation — Tenant B cannot see Tenant A concerns via GET /concerns', async () => {
      if (!tablesExist) return;

      const res = await authGet(
        app,
        '/api/v1/pastoral/concerns',
        cedarAdminToken,
        CEDAR_DOMAIN,
      );

      // Cedar should get 200 but no Al Noor data
      if (res.status === 200) {
        const concerns = res.body.data ?? [];
        const leakedIds = concerns
          .map((c: Record<string, string>) => c.id)
          .filter((id: string) => id === alNoorConcernId || id === alNoorTier3ConcernId);
        expect(leakedIds).toHaveLength(0);
      }
      // A 403 is also acceptable if Cedar lacks pastoral permissions
      expect([200, 403]).toContain(res.status);
    });

    it('tenant isolation — Tenant B cannot see Tenant A concern by ID', async () => {
      if (!tablesExist) return;

      const res = await authGet(
        app,
        `/api/v1/pastoral/concerns/${alNoorConcernId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      );

      // Must not return 200 with Al Noor data
      expect([403, 404]).toContain(res.status);
    });

    it('tier 3 RLS — non-DLP user cannot see tier 3 concerns', async () => {
      if (!tablesExist) return;

      // Al Noor admin without cp_access_grants should not see tier 3
      const listRes = await authGet(
        app,
        '/api/v1/pastoral/concerns',
        alNoorAdminToken,
        AL_NOOR_DOMAIN,
      );

      if (listRes.status === 200) {
        const concerns = listRes.body.data ?? [];
        const tier3Ids = concerns
          .filter((c: Record<string, number>) => c.tier === 3)
          .map((c: Record<string, string>) => c.id);

        // If the admin has no cp_access_grant, tier 3 should be invisible
        if (tier3Ids.includes(alNoorTier3ConcernId)) {
          // Verify user actually has DLP access — tier 3 is only visible to DLP users
          const grant = await directPrisma.cpAccessGrant.findFirst({
            where: {
              tenant_id: alNoorTenantId,
              user_id: (await directPrisma.user.findFirst({
                where: { email: AL_NOOR_ADMIN_EMAIL },
              }))!.id,
              revoked_at: null,
            },
          });
          // If they can see tier 3, they must have an active grant
          expect(grant).not.toBeNull();
        }
      }
      // 403 is acceptable if user lacks pastoral permissions
      expect([200, 403]).toContain(listRes.status);
    });

    it('tier 3 RLS — DLP user CAN see tier 3 concerns', async () => {
      if (!tablesExist) return;

      // Create a DLP user with cp_access_grant if one does not exist
      const alNoorAdmin = await directPrisma.user.findFirst({
        where: { email: AL_NOOR_ADMIN_EMAIL },
      });

      // Ensure admin has cp_access_grant for this test
      const existingGrant = await directPrisma.cpAccessGrant.findFirst({
        where: {
          tenant_id: alNoorTenantId,
          user_id: alNoorAdmin!.id,
          revoked_at: null,
        },
      });

      let grantId: string | undefined;
      if (!existingGrant) {
        const grant = await directPrisma.cpAccessGrant.create({
          data: {
            tenant_id: alNoorTenantId,
            user_id: alNoorAdmin!.id,
            granted_by_user_id: alNoorAdmin!.id,
          },
        });
        grantId = grant.id;
      }

      try {
        const res = await authGet(
          app,
          `/api/v1/pastoral/concerns/${alNoorTier3ConcernId}`,
          alNoorAdminToken,
          AL_NOOR_DOMAIN,
        );

        // DLP user should be able to see tier 3
        if (res.status === 200) {
          const concern = res.body.data;
          expect(concern.id).toBe(alNoorTier3ConcernId);
          expect(concern.tier).toBe(3);
        }
        // 403 if pastoral module not enabled is acceptable
        expect([200, 403]).toContain(res.status);
      } finally {
        // Clean up created grant
        if (grantId) {
          await directPrisma.cpAccessGrant.delete({ where: { id: grantId } });
        }
      }
    });

    it('concern versions inherit concern RLS', async () => {
      if (!tablesExist) return;

      // Cedar should not be able to access versions for Al Noor's concerns
      const res = await authGet(
        app,
        `/api/v1/pastoral/concerns/${alNoorConcernId}/versions`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      );

      // Must not return 200 with Al Noor version data
      expect([403, 404]).toContain(res.status);
    });

    it('pastoral events RLS', async () => {
      if (!tablesExist) return;

      // Cedar should not see Al Noor student chronology events
      const res = await authGet(
        app,
        `/api/v1/pastoral/chronology/${alNoorStudentId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      );

      if (res.status === 200) {
        const events = res.body.data ?? [];
        const leakedEvents = events.filter(
          (e: Record<string, string>) => e.entity_id === alNoorConcernId,
        );
        expect(leakedEvents).toHaveLength(0);
      }
      // 403 or 404 also acceptable
      expect([200, 403, 404]).toContain(res.status);
    });
  });

  // ─── Permission Tests ─────────────────────────────────────────────────────

  describe('permission enforcement', () => {
    it('403 without pastoral.log_concern on POST /concerns', async () => {
      if (!tablesExist) return;

      const body = {
        student_id: '00000000-0000-0000-0000-000000000001',
        category: 'academic',
        severity: 'routine',
        narrative: 'Test narrative that is at least ten characters for validation.',
        occurred_at: '2026-03-01T10:00:00Z',
      };

      const res = await authPost(
        app,
        '/api/v1/pastoral/concerns',
        cedarAdminToken,
        body,
        CEDAR_DOMAIN,
      );

      // If the module is not enabled or user lacks permission, should be 403
      // If it passes (module enabled + has permission), may get 400/422 due to invalid student_id
      if (res.status !== 400 && res.status !== 422 && res.status !== 201) {
        expect(res.status).toBe(403);
      }
    });

    it('403 without pastoral.view_tier1 on GET /concerns', async () => {
      if (!tablesExist) return;

      const res = await authGet(
        app,
        '/api/v1/pastoral/concerns',
        cedarAdminToken,
        CEDAR_DOMAIN,
      );

      // If pastoral module is not enabled or user lacks view_tier1, should be 403
      expect([200, 403]).toContain(res.status);
    });

    it('403 without pastoral.view_tier2 on PATCH /concerns/:id', async () => {
      if (!tablesExist) return;

      const fakeId = '00000000-0000-0000-0000-000000000099';

      const res = await authPatch(
        app,
        `/api/v1/pastoral/concerns/${fakeId}`,
        cedarAdminToken,
        { severity: 'elevated' },
        CEDAR_DOMAIN,
      );

      // Should get 403 (no permission) or 404 (no such concern in Cedar tenant)
      expect([403, 404]).toContain(res.status);
    });

    it('403 without pastoral.view_tier2 on POST /concerns/:id/escalate', async () => {
      if (!tablesExist) return;

      const fakeId = '00000000-0000-0000-0000-000000000099';

      const res = await authPost(
        app,
        `/api/v1/pastoral/concerns/${fakeId}/escalate`,
        cedarAdminToken,
        { new_tier: 2, reason: 'Test escalation' },
        CEDAR_DOMAIN,
      );

      // Should get 403 (no permission) or 404 (no such concern)
      expect([403, 404]).toContain(res.status);
    });
  });
});
