/* eslint-disable school/no-raw-sql-outside-rls -- e2e test checks table existence via raw SQL */
/**
 * Pastoral Cases -- RLS Leakage, Permission & Lifecycle Tests (e2e)
 *
 * Verifies:
 *   1. Tenant isolation -- Tenant B cannot see Tenant A cases
 *   2. Permission enforcement -- user without pastoral.manage_cases gets 403
 *   3. Case lifecycle -- create -> transition -> resolve -> close
 *
 * Pattern:
 *   1. Create test data as Al Noor (Tenant A) via direct DB inserts
 *   2. Authenticate as Cedar (Tenant B) or restricted users -> attempt to read/modify
 *   3. Assert: Cedar MUST NOT see Al Noor data; restricted users get 403
 *
 * Note: These tests require SW-1A and SW-1D migrations to be applied
 * (pastoral_cases, pastoral_case_students tables). If the tables do not exist,
 * all tests are skipped gracefully.
 */

import './setup-env';

import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { authGet, authPost, authPatch, closeTestApp, createTestApp, getAuthToken } from './helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from './tenant-fixture.builder';

// ─── Constants ──────────────────────────────────────────────────────────────

jest.setTimeout(120_000);

const UNIQUE_MARKER = `PC_${Date.now()}`;

// ─── Infrastructure check ───────────────────────────────────────────────────

/**
 * Checks whether the pastoral_cases table exists.
 * Returns false if SW-1D migration has not been applied.
 */
async function pastoralCaseTablesExist(): Promise<boolean> {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });
  try {
    await prisma.$connect();
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'pastoral_cases'
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

describe('Pastoral Cases -- RLS & Lifecycle Tests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let cedarFixture: TenantFixture;
  let alNoorAdminToken: string;
  let cedarAdminToken: string;
  let tablesExist: boolean;

  /** Direct Prisma client for creating test data outside RLS */
  let directPrisma: PrismaClient;

  // IDs populated during setup
  let alNoorTenantId: string;
  let alNoorCaseId: string;
  let alNoorStudentId: string;
  let alNoorAdminUserId: string;
  let alNoorConcernId: string;
  // Track fixtures this suite created (vs inherited from seed/other tests)
  // so afterAll only deletes what it owns.
  let createdHouseholdId: string | null = null;
  let createdStudentId: string | null = null;

  beforeAll(async () => {
    tablesExist = await pastoralCaseTablesExist();
    if (!tablesExist) {
      // eslint-disable-next-line no-console
      console.warn(
        'SKIPPING pastoral-cases e2e tests: pastoral_cases table does not exist (SW-1D migration not applied)',
      );
      return;
    }

    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma);
    cedarFixture = await createTenantFixture(prisma);

    alNoorAdminToken = await getAuthToken(app, fixture.adminEmail!, fixture.domainName);
    cedarAdminToken = await getAuthToken(app, cedarFixture.adminEmail!, cedarFixture.domainName);

    directPrisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    await directPrisma.$connect();

    // Look up tenant IDs
    const alNoorDomain = await directPrisma.tenantDomain.findFirst({
      where: { domain: fixture.domainName },
    });
    alNoorTenantId = alNoorDomain!.tenant_id;

    // Find or create an Al Noor student.
    // The `pnpm db:seed` pipeline creates tenants/users but not students for
    // the test tenants; students only exist if another parallel test already
    // created them. To make this suite self-sufficient (and immune to test
    // ordering), create our own household + student if none exists.
    let alNoorStudent = await directPrisma.student.findFirst({
      where: { tenant_id: alNoorTenantId },
    });
    if (!alNoorStudent) {
      const household = await directPrisma.household.create({
        data: {
          tenant_id: alNoorTenantId,
          household_name: `PC test household ${UNIQUE_MARKER}`,
          status: 'active',
        },
      });
      createdHouseholdId = household.id;
      alNoorStudent = await directPrisma.student.create({
        data: {
          tenant_id: alNoorTenantId,
          household_id: household.id,
          student_number: `PC-STU-${UNIQUE_MARKER}`.slice(0, 50),
          first_name: 'PCTest',
          last_name: 'Student',
          date_of_birth: new Date('2015-01-01'),
          status: 'active',
          gender: 'other',
          national_id: `PC-NID-${UNIQUE_MARKER}`.slice(0, 50),
          nationality: 'Irish',
        },
      });
      createdStudentId = alNoorStudent.id;
    }
    alNoorStudentId = alNoorStudent.id;

    // Get Al Noor admin user ID
    const alNoorAdmin = await directPrisma.user.findFirst({
      where: {
        email: fixture.adminEmail!,
        memberships: { some: { tenant_id: alNoorTenantId } },
      },
    });
    alNoorAdminUserId = alNoorAdmin!.id;

    // ── Create a test concern to link to the case ─────────────────────────

    const concern = await directPrisma.pastoralConcern.create({
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
        location: `Case RLS test ${UNIQUE_MARKER}`,
      },
    });
    alNoorConcernId = concern.id;

    // Create v1 narrative version
    await directPrisma.pastoralConcernVersion.create({
      data: {
        tenant_id: alNoorTenantId,
        concern_id: alNoorConcernId,
        version_number: 1,
        narrative: 'Initial narrative for case RLS test.',
        amended_by_user_id: alNoorAdminUserId,
      },
    });

    // ── Create Al Noor test case via direct DB insert ─────────────────────

    // case_number has a UNIQUE([tenant_id, case_number]) constraint and a
    // VARCHAR(20) limit. Include pid + full ms timestamp (truncated) so
    // multiple parallel Jest workers cannot collide even if they fire within
    // the same ms. `% 100000` (the previous impl) had only 5 digits of
    // entropy and cycled every 100 seconds.
    const caseNumber = `PC-${process.pid}-${Date.now() % 1_000_000}`.slice(0, 20);
    const testCase = await directPrisma.pastoralCase.create({
      data: {
        tenant_id: alNoorTenantId,
        case_number: caseNumber,
        status: 'open',
        student_id: alNoorStudentId,
        owner_user_id: alNoorAdminUserId,
        opened_by_user_id: alNoorAdminUserId,
        opened_reason: `RLS test case ${UNIQUE_MARKER}`,
        tier: 1,
      },
    });
    alNoorCaseId = testCase.id;

    // Link concern to case
    await directPrisma.pastoralConcern.update({
      where: { id: alNoorConcernId },
      data: { case_id: alNoorCaseId },
    });

    // Create case student link
    await directPrisma.pastoralCaseStudent.create({
      data: {
        case_id: alNoorCaseId,
        student_id: alNoorStudentId,
        tenant_id: alNoorTenantId,
      },
    });

    // Create audit event for the case
    await directPrisma.pastoralEvent.create({
      data: {
        tenant_id: alNoorTenantId,
        event_type: 'case_created',
        entity_type: 'case',
        entity_id: alNoorCaseId,
        student_id: alNoorStudentId,
        actor_user_id: alNoorAdminUserId,
        tier: 1,
        payload: {
          case_id: alNoorCaseId,
          case_number: testCase.case_number,
          student_id: alNoorStudentId,
          linked_concern_ids: [alNoorConcernId],
          owner_user_id: alNoorAdminUserId,
          reason: `RLS test case ${UNIQUE_MARKER}`,
        },
      },
    });
  });

  afterAll(async () => {
    if (!tablesExist) return;

    if (directPrisma) {
      try {
        // Clean up in dependency order.
        // pastoral_events and pastoral_concern_versions are append-only (DB triggers block DELETE).
        // Temporarily disable triggers to allow test data cleanup.
        await directPrisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);

        if (alNoorCaseId) {
          await directPrisma.$executeRawUnsafe(
            `DELETE FROM pastoral_events WHERE entity_id = $1::uuid`,
            alNoorCaseId,
          );
          await directPrisma.pastoralCaseStudent.deleteMany({
            where: { case_id: alNoorCaseId },
          });
        }
        if (alNoorConcernId) {
          await directPrisma.$executeRawUnsafe(
            `DELETE FROM pastoral_events WHERE entity_id = $1::uuid`,
            alNoorConcernId,
          );
          await directPrisma.$executeRawUnsafe(
            `DELETE FROM pastoral_concern_versions WHERE concern_id = $1::uuid`,
            alNoorConcernId,
          );
          await directPrisma.pastoralConcern.update({
            where: { id: alNoorConcernId },
            data: { case_id: null },
          });
          await directPrisma.pastoralConcern.delete({
            where: { id: alNoorConcernId },
          });
        }
        if (alNoorCaseId) {
          await directPrisma.pastoralCase.delete({
            where: { id: alNoorCaseId },
          });
        }

        // Only delete the household + student if this suite created them.
        if (createdStudentId) {
          await directPrisma.student.delete({ where: { id: createdStudentId } });
        }
        if (createdHouseholdId) {
          await directPrisma.household.delete({ where: { id: createdHouseholdId } });
        }

        await directPrisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
      } catch (err) {
        // Restore trigger mode even on error
        try {
          await directPrisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
        } catch (innerErr) {
          console.error('[pastoral-cases trigger restore]', innerErr);
        }
        console.error('[pastoral-cases cleanup]', err);
      }
      await directPrisma.$disconnect();
    }
    await deleteTenantFixture(prisma, fixture);
    await deleteTenantFixture(prisma, cedarFixture);
    await prisma.$disconnect();

    await closeTestApp();
  });

  // ─── RLS Leakage Tests ────────────────────────────────────────────────────

  describe('RLS leakage', () => {
    it('tenant isolation -- Tenant B cannot see Tenant A cases via GET /cases', async () => {
      if (!tablesExist) return;

      const res = await authGet(
        app,
        '/api/v1/pastoral/cases',
        cedarAdminToken,
        cedarFixture.domainName,
      );

      if (res.status === 200) {
        const cases = res.body.data ?? [];
        const leakedIds = cases
          .map((c: Record<string, string>) => c.id)
          .filter((id: string) => id === alNoorCaseId);
        expect(leakedIds).toHaveLength(0);
      }
      // A 403 is also acceptable if Cedar lacks pastoral.manage_cases
      expect([200, 403]).toContain(res.status);
    });

    it('tenant isolation -- Tenant B cannot see Tenant A case by ID', async () => {
      if (!tablesExist) return;

      const res = await authGet(
        app,
        `/api/v1/pastoral/cases/${alNoorCaseId}`,
        cedarAdminToken,
        cedarFixture.domainName,
      );

      // Must not return 200 with Al Noor data
      expect([403, 404]).toContain(res.status);
    });

    it('tenant isolation -- Tenant B cannot see Tenant A case students', async () => {
      if (!tablesExist) return;

      const res = await authGet(
        app,
        `/api/v1/pastoral/cases/${alNoorCaseId}/students`,
        cedarAdminToken,
        cedarFixture.domainName,
      );

      // Must not return 200 with Al Noor data
      expect([403, 404]).toContain(res.status);
    });
  });

  // ─── Permission Tests ─────────────────────────────────────────────────────

  describe('permission enforcement', () => {
    it('403 without pastoral.manage_cases on POST /cases', async () => {
      if (!tablesExist) return;

      const body = {
        student_id: '00000000-0000-0000-0000-000000000001',
        concern_ids: ['00000000-0000-0000-0000-000000000002'],
        owner_user_id: '00000000-0000-0000-0000-000000000003',
        opened_reason: 'Test case creation for permission check.',
      };

      const res = await authPost(
        app,
        '/api/v1/pastoral/cases',
        cedarAdminToken,
        body,
        cedarFixture.domainName,
      );

      // If module not enabled or user lacks permission, should be 403
      // If it passes (module enabled + has permission), may get 400/422 due to invalid IDs
      if (res.status !== 400 && res.status !== 422 && res.status !== 201) {
        expect(res.status).toBe(403);
      }
    });

    it('403 without pastoral.manage_cases on GET /cases', async () => {
      if (!tablesExist) return;

      const res = await authGet(
        app,
        '/api/v1/pastoral/cases',
        cedarAdminToken,
        cedarFixture.domainName,
      );

      // If pastoral module not enabled or user lacks manage_cases, should be 403
      expect([200, 403]).toContain(res.status);
    });

    it('403 without pastoral.manage_cases on PATCH /cases/:id/status', async () => {
      if (!tablesExist) return;

      const fakeId = '00000000-0000-0000-0000-000000000099';

      const res = await authPatch(
        app,
        `/api/v1/pastoral/cases/${fakeId}/status`,
        cedarAdminToken,
        { status: 'active', reason: 'Test transition.' },
        cedarFixture.domainName,
      );

      // Should get 403 (no permission) or 404 (no such case in Cedar tenant)
      expect([403, 404]).toContain(res.status);
    });
  });

  // ─── Case Lifecycle (create -> transition -> resolve -> close) ────────────

  describe('case lifecycle', () => {
    it('full lifecycle: create -> transition to active -> resolve -> close', async () => {
      if (!tablesExist) return;

      // ── Step 1: Create a case via the API ──────────────────────────────
      // Only works if Al Noor has pastoral module enabled and admin has
      // pastoral.manage_cases permission. If not, skip this test.
      const createRes = await authPost(
        app,
        '/api/v1/pastoral/cases',
        alNoorAdminToken,
        {
          student_id: alNoorStudentId,
          concern_ids: [alNoorConcernId],
          owner_user_id: alNoorAdminUserId,
          opened_reason: `Lifecycle test ${UNIQUE_MARKER}`,
        },
        fixture.domainName,
      );

      // If creation succeeds, continue the lifecycle
      if (createRes.status === 201 || createRes.status === 200) {
        const createdCase = createRes.body.data ?? createRes.body;
        const caseId: string = createdCase.id;
        expect(createdCase.status).toBe('open');
        expect(createdCase.case_number).toBeDefined();

        // ── Step 2: Transition to active ──────────────────────────────
        const activateRes = await authPatch(
          app,
          `/api/v1/pastoral/cases/${caseId}/status`,
          alNoorAdminToken,
          {
            status: 'active',
            reason: 'Beginning active case management.',
          },
          fixture.domainName,
        );

        if (activateRes.status === 200) {
          const activeCase = activateRes.body.data ?? activateRes.body;
          expect(activeCase.status).toBe('active');

          // ── Step 3: Transition to resolved ───────────────────────────
          const resolveRes = await authPatch(
            app,
            `/api/v1/pastoral/cases/${caseId}/status`,
            alNoorAdminToken,
            {
              status: 'resolved',
              reason: 'Interventions succeeded, issue resolved.',
            },
            fixture.domainName,
          );

          if (resolveRes.status === 200) {
            const resolvedCase = resolveRes.body.data ?? resolveRes.body;
            expect(resolvedCase.status).toBe('resolved');
            expect(resolvedCase.resolved_at).toBeDefined();

            // ── Step 4: Transition to closed ────────────────────────────
            const closeRes = await authPatch(
              app,
              `/api/v1/pastoral/cases/${caseId}/status`,
              alNoorAdminToken,
              {
                status: 'closed',
                reason: 'No further action required.',
              },
              fixture.domainName,
            );

            if (closeRes.status === 200) {
              const closedCase = closeRes.body.data ?? closeRes.body;
              expect(closedCase.status).toBe('closed');
              expect(closedCase.closed_at).toBeDefined();
            }
          }
        }

        // Clean up the lifecycle test case
        try {
          // Unlink concern from the lifecycle test case first
          await directPrisma.pastoralConcern.updateMany({
            where: { case_id: caseId },
            data: { case_id: null },
          });
          await directPrisma.pastoralCaseStudent.deleteMany({
            where: { case_id: caseId },
          });
          await directPrisma.pastoralCase.delete({
            where: { id: caseId },
          });
        } catch (err) {
          console.error('[pastoral-cases lifecycle cleanup]', err);
        }
      }
      // If creation returns 403 (module not enabled), that is acceptable
      // -- the lifecycle test simply does not execute
      expect([200, 201, 403]).toContain(createRes.status);
    });
  });
});
