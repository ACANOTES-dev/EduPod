import { INestApplication } from '@nestjs/common';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  authPost,
  authPatch,
  authDelete,
  login,
} from './helpers';

describe('Approval Workflows (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let teacherToken: string;

  // Populated during tests
  let createdWorkflowId: string;
  let approverRoleId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const teacherLogin = await login(app, AL_NOOR_TEACHER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    teacherToken = teacherLogin.accessToken;

    // Resolve a valid role_id to use as the approver role — use school_owner system role
    const rolesRes = await authGet(app, '/api/v1/roles', ownerToken, AL_NOOR_DOMAIN).expect(200);
    const ownerRole = rolesRes.body.data.find(
      (r: { role_key: string }) => r.role_key === 'school_principal',
    );
    expect(ownerRole).toBeDefined();
    approverRoleId = ownerRole.id;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('should list workflows', async () => {
    const res = await authGet(
      app,
      '/api/v1/approval-workflows',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should create workflow', async () => {
    const res = await authPost(
      app,
      '/api/v1/approval-workflows',
      ownerToken,
      {
        action_type: 'payroll_finalise',
        approver_role_id: approverRoleId,
        is_enabled: true,
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const body = res.body.data ?? res.body;
    expect(body.id).toBeDefined();
    expect(body.action_type).toBe('payroll_finalise');
    expect(body.is_enabled).toBe(true);
    expect(body.approver_role).toBeDefined();
    expect(body.approver_role.id).toBe(approverRoleId);

    createdWorkflowId = body.id;
  });

  it('should update workflow', async () => {
    expect(createdWorkflowId).toBeDefined();

    const res = await authPatch(
      app,
      `/api/v1/approval-workflows/${createdWorkflowId}`,
      ownerToken,
      { is_enabled: false },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.is_enabled).toBe(false);
    expect(body.id).toBe(createdWorkflowId);
  });

  it('should delete workflow', async () => {
    expect(createdWorkflowId).toBeDefined();

    const res = await authDelete(
      app,
      `/api/v1/approval-workflows/${createdWorkflowId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.deleted).toBe(true);

    // Verify the workflow is gone
    await authGet(
      app,
      '/api/v1/approval-workflows',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200).then((listRes) => {
      const found = listRes.body.data.find(
        (w: { id: string }) => w.id === createdWorkflowId,
      );
      expect(found).toBeUndefined();
    });
  });

  it('should reject without approvals.manage permission', async () => {
    await authPost(
      app,
      '/api/v1/approval-workflows',
      teacherToken,
      {
        action_type: 'invoice_issue',
        approver_role_id: approverRoleId,
        is_enabled: true,
      },
      AL_NOOR_DOMAIN,
    ).expect(403);
  });
});
