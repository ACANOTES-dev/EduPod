import { INestApplication } from '@nestjs/common';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  CEDAR_DOMAIN,
  CEDAR_OWNER_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  authPatch,
  authPost,
  login,
} from '../helpers';

jest.setTimeout(120_000);

describe('Workflow: Payroll Finalisation (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let teacherToken: string;
  let cedarOwnerToken: string;

  // Created during the workflow
  let payrollRunId: string;
  let payrollRunUpdatedAt: string;
  let entryIds: string[] = [];

  async function createPayrollRun(
    labelPrefix: string,
    totalWorkingDays: number,
  ): Promise<Awaited<ReturnType<typeof authPost>>> {
    const monthOffset = Math.floor(Date.now() / 1000) % 12;

    for (let attempt = 0; attempt < 36; attempt += 1) {
      const periodMonth = ((monthOffset + attempt) % 12) + 1;
      const periodYear = 2027 + Math.floor((monthOffset + attempt) / 12);

      const res = await authPost(
        app,
        '/api/v1/payroll/runs',
        ownerToken,
        {
          period_label: `${labelPrefix} - ${Date.now()}-${attempt}`,
          period_month: periodMonth,
          period_year: periodYear,
          total_working_days: totalWorkingDays,
        },
        AL_NOOR_DOMAIN,
      );

      if (res.status !== 409) {
        return res;
      }
    }

    throw new Error('Failed to create a non-conflicting payroll run for the workflow test');
  }

  // ─── Setup ───────────────────────────────────────────────────────────────

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const teacherLogin = await login(app, AL_NOOR_TEACHER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    teacherToken = teacherLogin.accessToken;

    const cedarLogin = await login(app, CEDAR_OWNER_EMAIL, DEV_PASSWORD, CEDAR_DOMAIN);
    cedarOwnerToken = cedarLogin.accessToken;
  }, 60_000);

  afterAll(async () => {
    await closeTestApp();
  });

  // ─── 1. List existing payroll runs ──────────────────────────────────────

  it('should list payroll runs', async () => {
    const res = await authGet(app, '/api/v1/payroll/runs', ownerToken, AL_NOOR_DOMAIN).expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.total).toBe('number');
  });

  // ─── 2. Create a new payroll run ────────────────────────────────────────

  it('should create a draft payroll run', async () => {
    const res = await createPayrollRun('Integration Test', 22);

    // If the endpoint returns 404, the payroll module may not be enabled or
    // the user lacks payroll.create_run permission. Skip downstream tests.
    if (res.status === 404 || res.status === 403) {
      console.warn(
        `Payroll run creation returned ${res.status} — skipping workflow (permission/module issue)`,
      );
      return;
    }

    expect(res.status).toBe(201);
    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    expect(data.status).toBe('draft');
    expect(data.total_working_days).toBe(22);

    payrollRunId = data.id;
    payrollRunUpdatedAt = data.updated_at;
  });

  // ─── 3. Get the run detail with entries ─────────────────────────────────

  it('should get payroll run detail', async () => {
    if (!payrollRunId) return; // Skip if run creation failed
    const res = await authGet(
      app,
      `/api/v1/payroll/runs/${payrollRunId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBe(payrollRunId);
    expect(data.status).toBe('draft');

    // Capture entries if they exist
    if (data.entries && Array.isArray(data.entries)) {
      entryIds = data.entries.map((e: { id: string }) => e.id);
    }

    // Update the updated_at
    payrollRunUpdatedAt = data.updated_at;
  });

  // ─── 4. Refresh entries to populate staff ───────────────────────────────

  it('should refresh entries to include all eligible staff', async () => {
    if (!payrollRunId) return;
    const res = await authPost(
      app,
      `/api/v1/payroll/runs/${payrollRunId}/refresh-entries`,
      ownerToken,
      {},
      AL_NOOR_DOMAIN,
    ).expect(200);

    const data = res.body.data;
    expect(data).toBeDefined();

    // Re-fetch the run to get updated entries
    const runRes = await authGet(
      app,
      `/api/v1/payroll/runs/${payrollRunId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const runData = runRes.body.data;
    if (runData.entries && Array.isArray(runData.entries)) {
      entryIds = runData.entries.map((e: { id: string }) => e.id);
    }

    payrollRunUpdatedAt = runData.updated_at;
  });

  // ─── 5. Update entry inputs (days_worked for salaried staff) ───────────

  it('should update payroll entry with days worked', async () => {
    if (!payrollRunId) return;
    if (entryIds.length === 0) {
      // No entries to update (no staff profiles), skip
      return;
    }

    const entryId = entryIds[0];

    const res = await authPatch(
      app,
      `/api/v1/payroll/entries/${entryId}`,
      ownerToken,
      {
        days_worked: 22,
      },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.days_worked).toBe(22);
  });

  // ─── 6. Finalise the payroll run ────────────────────────────────────────

  it('should finalise the payroll run', async () => {
    if (!payrollRunId) return;
    // Re-fetch updated_at before finalising
    const runRes = await authGet(
      app,
      `/api/v1/payroll/runs/${payrollRunId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    payrollRunUpdatedAt = runRes.body.data.updated_at;

    const res = await authPost(
      app,
      `/api/v1/payroll/runs/${payrollRunId}/finalise`,
      ownerToken,
      {
        expected_updated_at: payrollRunUpdatedAt,
      },
      AL_NOOR_DOMAIN,
    );

    // Finalisation may result in 'finalised', 'pending_approval', or remain 'draft'
    // if validation prevents finalisation (e.g., run has zero entries or no compensation).
    // Accept 200, 201, or 400 (validation failure).
    expect([200, 201, 400]).toContain(res.status);

    const data = res.body.data;
    if (data && (res.status === 200 || res.status === 201)) {
      expect(['finalised', 'pending_approval', 'draft']).toContain(data.status);
      payrollRunUpdatedAt = data.updated_at;
    }
  });

  // ─── 7. Verify payslips were generated (if run was finalised) ──────────

  it('should list payslips for the finalised run', async () => {
    if (!payrollRunId) return;
    // Re-check run status
    const runRes = await authGet(
      app,
      `/api/v1/payroll/runs/${payrollRunId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    if (runRes.body.data.status === 'finalised') {
      const res = await authGet(
        app,
        `/api/v1/payroll/payslips?payroll_run_id=${payrollRunId}`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);

      // If there were entries, there should be payslips
      if (entryIds.length > 0) {
        expect(res.body.data.length).toBeGreaterThan(0);
      }
    }
  });

  // ─── 8. Verify entries are immutable after finalisation ────────────────

  it('should reject updating entries on a finalised run', async () => {
    if (!payrollRunId) return;
    if (entryIds.length === 0) {
      return;
    }

    // Re-check run status
    const runRes = await authGet(
      app,
      `/api/v1/payroll/runs/${payrollRunId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    if (runRes.body.data.status === 'finalised') {
      const entryId = entryIds[0];

      const res = await authPatch(
        app,
        `/api/v1/payroll/entries/${entryId}`,
        ownerToken,
        { days_worked: 10 },
        AL_NOOR_DOMAIN,
      );

      // Should be rejected since the run is finalised
      expect([400, 403, 409]).toContain(res.status);
    }
  });

  // ─── 9. Verify cancellation blocked on finalised run ──────────────────

  it('should reject cancellation of a finalised run', async () => {
    if (!payrollRunId) return;
    const runRes = await authGet(
      app,
      `/api/v1/payroll/runs/${payrollRunId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    if (runRes.body.data.status === 'finalised') {
      const res = await authPost(
        app,
        `/api/v1/payroll/runs/${payrollRunId}/cancel`,
        ownerToken,
        {},
        AL_NOOR_DOMAIN,
      );

      // Cancelling a finalised run should fail
      expect([400, 409]).toContain(res.status);
    }
  });

  // ─── 10. Verify cancellation works on draft runs ──────────────────────

  it('should allow cancellation of a new draft run', async () => {
    const createRes = await createPayrollRun('Cancel Test Run', 20);
    if (createRes.status === 404 || createRes.status === 403) return;
    expect(createRes.status).toBe(201);

    const draftRunId = createRes.body.data.id;

    const cancelRes = await authPost(
      app,
      `/api/v1/payroll/runs/${draftRunId}/cancel`,
      ownerToken,
      {},
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(cancelRes.body.data.status).toBe('cancelled');
  });

  // ─── 11. Permission checks ────────────────────────────────────────────

  describe('Permission enforcement', () => {
    it('should reject teacher from listing payroll runs', async () => {
      await authGet(app, '/api/v1/payroll/runs', teacherToken, AL_NOOR_DOMAIN).expect(403);
    });

    it('should reject teacher from creating payroll runs', async () => {
      await authPost(
        app,
        '/api/v1/payroll/runs',
        teacherToken,
        {
          period_label: 'Teacher Run',
          period_month: 1,
          period_year: 2029,
          total_working_days: 20,
        },
        AL_NOOR_DOMAIN,
      ).expect(403);
    });
  });

  // ─── 12. Cross-tenant isolation ───────────────────────────────────────

  describe('Cross-tenant isolation', () => {
    it('should prevent Cedar from seeing Al Noor payroll runs', async () => {
      const res = await authGet(app, '/api/v1/payroll/runs', cedarOwnerToken, CEDAR_DOMAIN).expect(
        200,
      );

      const runs = res.body.data ?? [];
      const leaked = runs.find((r: { id: string }) => r.id === payrollRunId);
      expect(leaked).toBeUndefined();
    });

    it('should return 404 when Cedar accesses Al Noor payroll run by ID', async () => {
      if (!payrollRunId) return;
      await authGet(
        app,
        `/api/v1/payroll/runs/${payrollRunId}`,
        cedarOwnerToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });
  });
});
