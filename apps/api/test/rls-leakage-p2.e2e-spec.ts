/**
 * RLS Leakage Tests — Phase 2
 *
 * Verifies that tenant isolation holds at both the API level and the database
 * layer for all P2 entities: households, parents, students, staff profiles,
 * academic years, academic periods, year groups, subjects, classes,
 * class staff, and class enrolments.
 *
 * Two test categories:
 *   1. API-level — create data as Al Noor, authenticate as Cedar, call each
 *      endpoint, assert only Cedar data is returned.
 *   2. Table-level — open a Prisma transaction as the rls_test_user role,
 *      SET LOCAL app.current_tenant_id to Cedar, query each table, and assert
 *      that no Al Noor rows are returned.
 */

import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  CEDAR_DOMAIN,
  CEDAR_OWNER_EMAIL,
  DEV_PASSWORD,
  authGet,
  authPost,
  closeTestApp,
  createTestApp,
  login,
} from './helpers';

jest.setTimeout(120_000);

// ─── Constants ───────────────────────────────────────────────────────────────

let AL_NOOR_TENANT_ID = 'aa08873c-40a5-4bba-a9e3-8bd0f6d5e696';
let CEDAR_TENANT_ID = 'a032c7be-a0c3-4375-add7-174afa46e046';
const RLS_TEST_ROLE = 'rls_test_user';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('RLS Leakage P2 (e2e)', () => {
  let app: INestApplication;

  /** Cedar owner token — used for every API-level test. */
  let cedarToken: string;

  /** Al Noor owner token — used to create test data. */
  let alNoorToken: string;

  /** Direct Prisma client for table-level RLS tests. */
  let directPrisma: PrismaClient;

  async function execWithRetry(prisma: PrismaClient, sql: string, maxRetries = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await prisma.$executeRawUnsafe(sql);
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('tuple concurrently updated') && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 200 * attempt));
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * IDs of entities created in Al Noor during beforeAll.
   * Used to verify they do NOT appear in Cedar responses.
   */
  let alNoorHouseholdId: string;
  let alNoorParentId: string;
  let alNoorStudentId: string;
  let alNoorAcademicYearId: string;
  let alNoorYearGroupId: string;
  let alNoorSubjectId: string;
  let alNoorClassId: string;

  /** Unique search term embedded in Al Noor data for the search leakage test. */
  const UNIQUE_SEARCH_TERM = 'RlsLeakTestXyz';

  beforeAll(async () => {
    app = await createTestApp();

    // Authenticate as both tenants
    const cedarLogin = await login(app, CEDAR_OWNER_EMAIL, DEV_PASSWORD, CEDAR_DOMAIN);
    cedarToken = cedarLogin.accessToken;

    const alNoorLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    alNoorToken = alNoorLogin.accessToken;

    // ── Create test data in Al Noor ───────────────────────────────────────────

    // 1. Create a household with emergency contacts
    const householdRes = await authPost(
      app,
      '/api/v1/households',
      alNoorToken,
      {
        household_name: `${UNIQUE_SEARCH_TERM} Household`,
        emergency_contacts: [
          {
            contact_name: 'Emergency Contact One',
            phone: '+971509876543',
            display_order: 1,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    );
    alNoorHouseholdId = householdRes.body.data?.id ?? householdRes.body.id;

    // 2. Create a parent
    const parentRes = await authPost(
      app,
      '/api/v1/parents',
      alNoorToken,
      {
        first_name: UNIQUE_SEARCH_TERM,
        last_name: 'ParentTest',
        first_name_ar: 'والد',
        last_name_ar: 'اختبار',
        email: 'rls-test-parent@alnoor.test',
        phone: '+971502345678',
        preferred_contact_channels: ['email'],
        household_id: alNoorHouseholdId,
      },
      AL_NOOR_DOMAIN,
    );
    alNoorParentId = parentRes.body.data?.id ?? parentRes.body.id;

    // 3. Create a student
    const ts = Date.now();
    const studentRes = await authPost(
      app,
      '/api/v1/students',
      alNoorToken,
      {
        first_name: UNIQUE_SEARCH_TERM,
        last_name: 'StudentTest',
        first_name_ar: 'طالب',
        last_name_ar: 'اختبار',
        date_of_birth: '2015-06-15',
        gender: 'male',
        national_id: `NID-RLS-${ts}`,
        nationality: 'Irish',
        household_id: alNoorHouseholdId,
      },
      AL_NOOR_DOMAIN,
    );
    alNoorStudentId = studentRes.body.data?.id ?? studentRes.body.id;

    // 4. Create an academic year
    const academicYearRes = await authPost(
      app,
      '/api/v1/academic-years',
      alNoorToken,
      {
        name: `${UNIQUE_SEARCH_TERM} Year 2099-2100`,
        start_date: '2099-09-01',
        end_date: '2100-06-30',
      },
      AL_NOOR_DOMAIN,
    );
    alNoorAcademicYearId = academicYearRes.body.data?.id ?? academicYearRes.body.id;

    // 5. Create a year group
    const yearGroupRes = await authPost(
      app,
      '/api/v1/year-groups',
      alNoorToken,
      {
        name: `${UNIQUE_SEARCH_TERM} Grade 1`,
        display_order: 999,
      },
      AL_NOOR_DOMAIN,
    );
    alNoorYearGroupId = yearGroupRes.body.data?.id ?? yearGroupRes.body.id;

    // 6. Create a subject
    const subjectRes = await authPost(
      app,
      '/api/v1/subjects',
      alNoorToken,
      {
        name: `${UNIQUE_SEARCH_TERM} Mathematics`,
        type: 'core',
      },
      AL_NOOR_DOMAIN,
    );
    alNoorSubjectId = subjectRes.body.data?.id ?? subjectRes.body.id;

    // 7. Create a class
    const classRes = await authPost(
      app,
      '/api/v1/classes',
      alNoorToken,
      {
        name: `${UNIQUE_SEARCH_TERM} Class 1A`,
        academic_year_id: alNoorAcademicYearId,
        year_group_id: alNoorYearGroupId,
        max_capacity: 30,
        class_type: 'floating',
      },
      AL_NOOR_DOMAIN,
    );
    alNoorClassId = classRes.body.data?.id ?? classRes.body.id;

    // ── Table-level RLS setup ─────────────────────────────────────────────────

    directPrisma = new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_URL },
      },
    });
    await directPrisma.$connect();

    // Dynamically resolve tenant IDs (they are auto-generated by seed)
    const tenants = await directPrisma.$queryRawUnsafe<Array<{ id: string; slug: string }>>(
      `SELECT id::text, slug FROM tenants WHERE slug IN ('al-noor', 'cedar')`,
    );
    for (const t of tenants) {
      if (t.slug === 'al-noor') AL_NOOR_TENANT_ID = t.id;
      if (t.slug === 'cedar') CEDAR_TENANT_ID = t.id;
    }

    // Create the non-superuser role for RLS testing (idempotent).
    await directPrisma.$executeRawUnsafe(
      `DO $$ BEGIN
         CREATE ROLE ${RLS_TEST_ROLE} NOLOGIN;
       EXCEPTION WHEN duplicate_object THEN NULL;
       END $$`,
    );

    // Grant enough privileges for the role to SELECT from tenant tables.
    await execWithRetry(directPrisma, `GRANT USAGE ON SCHEMA public TO ${RLS_TEST_ROLE}`);
    await execWithRetry(
      directPrisma,
      `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${RLS_TEST_ROLE}`,
    );
  }, 120_000);

  afterAll(async () => {
    if (directPrisma) {
      try {
        await execWithRetry(
          directPrisma,
          `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${RLS_TEST_ROLE}`,
        );
        await execWithRetry(directPrisma, `REVOKE USAGE ON SCHEMA public FROM ${RLS_TEST_ROLE}`);
        await execWithRetry(directPrisma, `DROP ROLE IF EXISTS ${RLS_TEST_ROLE}`);
      } catch (err) {
        console.error('[RLS-P2 cleanup]', err);
      }
      await directPrisma.$disconnect();
    }
    await closeTestApp();
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Runs a raw SELECT against `tableName` inside a transaction that:
   *   1. Sets app.current_tenant_id to the Cedar tenant ID.
   *   2. Switches the active role to rls_test_user (no BYPASSRLS).
   *
   * Any row whose tenant_id equals AL_NOOR_TENANT_ID is a policy violation.
   */
  async function queryAsCedar(tableName: string): Promise<Array<{ tenant_id: string | null }>> {
    return directPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant_id', '${CEDAR_TENANT_ID}', true)`,
      );
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return tx.$queryRawUnsafe(`SELECT tenant_id::text FROM "${tableName}"`) as Promise<
        Array<{ tenant_id: string | null }>
      >;
    });
  }

  /**
   * Shared assertion: no row in `rows` should carry the Al Noor tenant_id.
   */
  function assertNoAlNoorRows(rows: Array<{ tenant_id: string | null }>, context: string): void {
    const leaks = rows.filter((r) => r.tenant_id === AL_NOOR_TENANT_ID);
    expect(leaks).toHaveLength(0);
    if (leaks.length > 0) {
      throw new Error(
        `RLS LEAK in ${context}: ${leaks.length} Al Noor row(s) returned when querying as Cedar`,
      );
    }
  }

  // ── 1. API-Level RLS Tests ──────────────────────────────────────────────────

  describe('API-level: Tenant B (Cedar) must not see Tenant A (Al Noor) P2 data', () => {
    /**
     * Test 1 — Households
     */
    it('GET /v1/households as Cedar should not return Al Noor households', async () => {
      const res = await authGet(app, '/api/v1/households', cedarToken, CEDAR_DOMAIN).expect(200);

      const items: Array<{ id: string; tenant_id?: string }> = res.body.data ?? [];

      // No item should have Al Noor's tenant_id
      for (const item of items) {
        expect(item.tenant_id).not.toBe(AL_NOOR_TENANT_ID);
        expect(item.id).not.toBe(alNoorHouseholdId);
      }
      // The unique search term should not appear anywhere in the response
      expect(JSON.stringify(res.body)).not.toContain(UNIQUE_SEARCH_TERM);
    });

    /**
     * Test 2 — Parents
     */
    it('GET /v1/parents as Cedar should not return Al Noor parents', async () => {
      const res = await authGet(app, '/api/v1/parents', cedarToken, CEDAR_DOMAIN).expect(200);

      const items: Array<{ id: string; tenant_id?: string }> = res.body.data ?? [];

      for (const item of items) {
        expect(item.tenant_id).not.toBe(AL_NOOR_TENANT_ID);
        expect(item.id).not.toBe(alNoorParentId);
      }
      expect(JSON.stringify(res.body)).not.toContain(UNIQUE_SEARCH_TERM);
    });

    /**
     * Test 3 — Students
     */
    it('GET /v1/students as Cedar should not return Al Noor students', async () => {
      const res = await authGet(app, '/api/v1/students', cedarToken, CEDAR_DOMAIN).expect(200);

      const items: Array<{ id: string; tenant_id?: string }> = res.body.data ?? [];

      for (const item of items) {
        expect(item.tenant_id).not.toBe(AL_NOOR_TENANT_ID);
        expect(item.id).not.toBe(alNoorStudentId);
      }
      expect(JSON.stringify(res.body)).not.toContain(UNIQUE_SEARCH_TERM);
    });

    /**
     * Test 4 — Staff Profiles
     */
    it('GET /v1/staff-profiles as Cedar should not return Al Noor staff', async () => {
      const res = await authGet(app, '/api/v1/staff-profiles', cedarToken, CEDAR_DOMAIN).expect(
        200,
      );

      const items: Array<{ id: string; tenant_id?: string }> = res.body.data ?? [];

      for (const item of items) {
        expect(item.tenant_id).not.toBe(AL_NOOR_TENANT_ID);
      }
      // Staff profiles are seeded, so just verify no Al Noor identifiers
      expect(JSON.stringify(res.body)).not.toContain(AL_NOOR_TENANT_ID);
    });

    /**
     * Test 5 — Academic Years
     */
    it('GET /v1/academic-years as Cedar should not return Al Noor academic years', async () => {
      const res = await authGet(app, '/api/v1/academic-years', cedarToken, CEDAR_DOMAIN).expect(
        200,
      );

      const items: Array<{ id: string; tenant_id?: string }> = res.body.data ?? [];

      for (const item of items) {
        expect(item.tenant_id).not.toBe(AL_NOOR_TENANT_ID);
        expect(item.id).not.toBe(alNoorAcademicYearId);
      }
      expect(JSON.stringify(res.body)).not.toContain(UNIQUE_SEARCH_TERM);
    });

    /**
     * Test 6 — Year Groups
     */
    it('GET /v1/year-groups as Cedar should not return Al Noor year groups', async () => {
      const res = await authGet(app, '/api/v1/year-groups', cedarToken, CEDAR_DOMAIN).expect(200);

      const items: Array<{ id: string; tenant_id?: string }> = res.body.data ?? [];

      for (const item of items) {
        expect(item.tenant_id).not.toBe(AL_NOOR_TENANT_ID);
        expect(item.id).not.toBe(alNoorYearGroupId);
      }
      expect(JSON.stringify(res.body)).not.toContain(UNIQUE_SEARCH_TERM);
    });

    /**
     * Test 7 — Subjects
     */
    it('GET /v1/subjects as Cedar should not return Al Noor subjects', async () => {
      const res = await authGet(app, '/api/v1/subjects', cedarToken, CEDAR_DOMAIN).expect(200);

      const items: Array<{ id: string; tenant_id?: string }> = res.body.data ?? [];

      for (const item of items) {
        expect(item.tenant_id).not.toBe(AL_NOOR_TENANT_ID);
        expect(item.id).not.toBe(alNoorSubjectId);
      }
      expect(JSON.stringify(res.body)).not.toContain(UNIQUE_SEARCH_TERM);
    });

    /**
     * Test 8 — Classes
     */
    it('GET /v1/classes as Cedar should not return Al Noor classes', async () => {
      const res = await authGet(app, '/api/v1/classes', cedarToken, CEDAR_DOMAIN).expect(200);

      const items: Array<{ id: string; tenant_id?: string }> = res.body.data ?? [];

      for (const item of items) {
        expect(item.tenant_id).not.toBe(AL_NOOR_TENANT_ID);
        expect(item.id).not.toBe(alNoorClassId);
      }
      expect(JSON.stringify(res.body)).not.toContain(UNIQUE_SEARCH_TERM);
    });

    /**
     * Test 9 — Search
     *
     * Search for the unique term that was embedded in Al Noor data.
     * Cedar must get zero results for it.
     */
    it('GET /v1/search as Cedar should not return Al Noor entities', async () => {
      // Search endpoint requires 'search.view' permission.
      // If the user has it, verify no cross-tenant results.
      // If they don't, 403 is equally valid for RLS isolation.
      const res = await authGet(
        app,
        `/api/v1/search?q=${UNIQUE_SEARCH_TERM}`,
        cedarToken,
        CEDAR_DOMAIN,
      );

      if (res.status === 403) {
        // Permission denied — no cross-tenant leakage possible
        return;
      }

      expect(res.status).toBe(200);
      // res.body.data is { data: { results: [...], total: N } } after interceptor
      const searchData = res.body.data?.data ?? res.body.data ?? {};
      const results: Array<{ id: string }> = searchData.results ?? [];

      expect(results).toHaveLength(0);
      expect(JSON.stringify(res.body)).not.toContain(AL_NOOR_TENANT_ID);
    });

    /**
     * Test 10 — Dashboard
     *
     * The school-admin dashboard returns aggregate stats for the current
     * tenant. Cedar's dashboard must not include Al Noor counts.
     */
    it('GET /v1/dashboard/school-admin as Cedar should show Cedar stats only', async () => {
      const res = await authGet(
        app,
        '/api/v1/dashboard/school-admin',
        cedarToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const dashboard = res.body.data ?? res.body;

      // Dashboard must not reference Al Noor tenant or unique test data
      expect(JSON.stringify(dashboard)).not.toContain(AL_NOOR_TENANT_ID);
      expect(JSON.stringify(dashboard)).not.toContain(UNIQUE_SEARCH_TERM);
    });
  });

  // ── 2. Table-Level RLS Tests ────────────────────────────────────────────────

  describe('Table-level: RLS policy enforcement for P2 tables (direct DB verification)', () => {
    it('households: querying as Cedar returns no Al Noor rows', async () => {
      const rows = await queryAsCedar('households');
      assertNoAlNoorRows(rows, 'households');
    });

    it('household_emergency_contacts: querying as Cedar returns no Al Noor rows', async () => {
      const rows = await queryAsCedar('household_emergency_contacts');
      assertNoAlNoorRows(rows, 'household_emergency_contacts');
    });

    it('parents: querying as Cedar returns no Al Noor rows', async () => {
      const rows = await queryAsCedar('parents');
      assertNoAlNoorRows(rows, 'parents');
    });

    it('household_parents: querying as Cedar returns no Al Noor rows', async () => {
      const rows = await queryAsCedar('household_parents');
      assertNoAlNoorRows(rows, 'household_parents');
    });

    it('students: querying as Cedar returns no Al Noor rows', async () => {
      const rows = await queryAsCedar('students');
      assertNoAlNoorRows(rows, 'students');
    });

    it('student_parents: querying as Cedar returns no Al Noor rows', async () => {
      const rows = await queryAsCedar('student_parents');
      assertNoAlNoorRows(rows, 'student_parents');
    });

    it('staff_profiles: querying as Cedar returns no Al Noor rows', async () => {
      const rows = await queryAsCedar('staff_profiles');
      assertNoAlNoorRows(rows, 'staff_profiles');
    });

    it('academic_years: querying as Cedar returns no Al Noor rows', async () => {
      const rows = await queryAsCedar('academic_years');
      assertNoAlNoorRows(rows, 'academic_years');
    });

    it('academic_periods: querying as Cedar returns no Al Noor rows', async () => {
      const rows = await queryAsCedar('academic_periods');
      assertNoAlNoorRows(rows, 'academic_periods');
    });

    it('year_groups: querying as Cedar returns no Al Noor rows', async () => {
      const rows = await queryAsCedar('year_groups');
      assertNoAlNoorRows(rows, 'year_groups');
    });

    it('subjects: querying as Cedar returns no Al Noor rows', async () => {
      const rows = await queryAsCedar('subjects');
      assertNoAlNoorRows(rows, 'subjects');
    });

    it('classes: querying as Cedar returns no Al Noor rows', async () => {
      const rows = await queryAsCedar('classes');
      assertNoAlNoorRows(rows, 'classes');
    });

    it('class_staff: querying as Cedar returns no Al Noor rows', async () => {
      const rows = await queryAsCedar('class_staff');
      assertNoAlNoorRows(rows, 'class_staff');
    });

    it('class_enrolments: querying as Cedar returns no Al Noor rows', async () => {
      const rows = await queryAsCedar('class_enrolments');
      assertNoAlNoorRows(rows, 'class_enrolments');
    });
  });
});
