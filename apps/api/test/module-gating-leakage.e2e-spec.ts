import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { MODULE_REGISTRY } from '@school/shared/modules';
import type { ModuleKey } from '@school/shared/modules';

import { disableModuleForTenant, enableModuleForTenant } from './_helpers/module-gating-fixtures';
import { closeTestApp, createTestApp, login } from './helpers';
import {
  createTenantFixture,
  deleteTenantFixture,
  type TenantFixture,
} from './tenant-fixture.builder';

interface ModuleGatingProbe {
  key: ModuleKey;
  probes: Array<{ method: 'GET' | 'POST'; path: string; body?: unknown }>;
}

const PROBE_ENDPOINTS: Partial<Record<ModuleKey, ModuleGatingProbe['probes']>> = {
  admissions: [
    { method: 'GET', path: '/api/v1/admissions/dashboard-summary' },
    { method: 'GET', path: '/api/v1/applications' },
  ],
  ai_functions: [{ method: 'POST', path: '/api/v1/attendance/scan/confirm', body: {} }],
  auto_scheduling: [
    { method: 'GET', path: '/api/v1/scheduling/teachers' },
    {
      method: 'GET',
      path: '/api/v1/scheduling-dashboard/overview?academic_year_id=11111111-1111-1111-1111-111111111111',
    },
    { method: 'POST', path: '/api/v1/scheduling-runs', body: {} },
  ],
  behaviour: [{ method: 'GET', path: '/api/v1/behaviour/incidents' }],
  budgeting: [{ method: 'GET', path: '/api/v1/budgeting/financial-models' }],
  communications_outbound: [
    { method: 'GET', path: '/api/v1/announcements' },
    { method: 'GET', path: '/api/v1/notification-templates' },
  ],
  compliance_advanced: [
    { method: 'GET', path: '/api/v1/regulatory/des/readiness?academic_year=2025-2026' },
    { method: 'GET', path: '/api/v1/regulatory/tusla/threshold-monitor' },
    { method: 'GET', path: '/api/v1/regulatory/ppod/status?database_type=ppod' },
    { method: 'GET', path: '/api/v1/regulatory/cba/status?academic_year=2025-2026' },
    { method: 'GET', path: '/api/v1/retention-holds' },
  ],
  early_warning: [{ method: 'GET', path: '/api/v1/early-warning/students' }],
  engagement: [{ method: 'GET', path: '/api/v1/engagement/events' }],
  finance: [
    { method: 'GET', path: '/api/v1/finance/invoices' },
    { method: 'GET', path: '/api/v1/finance/dashboard' },
    { method: 'GET', path: '/api/v1/finance/payments' },
  ],
  gradebook: [
    { method: 'GET', path: '/api/v1/gradebook/assessments' },
    { method: 'GET', path: '/api/v1/report-cards' },
    { method: 'GET', path: '/api/v1/transcripts/students/11111111-1111-1111-1111-111111111111' },
  ],
  homework: [
    { method: 'GET', path: '/api/v1/homework' },
    { method: 'GET', path: '/api/v1/student/homework' },
    { method: 'GET', path: '/api/v1/homework/analytics/completion-rates' },
  ],
  leave: [{ method: 'GET', path: '/api/v1/leave/requests' }],
  parent_inquiries: [{ method: 'GET', path: '/api/v1/inquiries' }],
  pastoral: [{ method: 'GET', path: '/api/v1/pastoral/cases' }],
  payroll: [{ method: 'GET', path: '/api/v1/payroll/runs' }],
  school_closures: [{ method: 'GET', path: '/api/v1/school-closures' }],
  sen: [{ method: 'GET', path: '/api/v1/sen/overview' }],
  staff_wellbeing: [{ method: 'GET', path: '/api/v1/staff-wellbeing/surveys' }],
  website: [{ method: 'GET', path: '/api/v1/website/pages' }],
};

const ACTIVE_MODULE_GATING_CASES = new Set<ModuleKey>([
  'ai_functions',
  'admissions',
  'auto_scheduling',
  'behaviour',
  'communications_outbound',
  'compliance_advanced',
  'finance',
  'gradebook',
  'homework',
  'parent_inquiries',
  'pastoral',
  'payroll',
  'sen',
  'staff_wellbeing',
  'website',
]);

const PROBES: ReadonlyArray<ModuleGatingProbe> = MODULE_REGISTRY.filter(
  (definition) => definition.default_enabled || ACTIVE_MODULE_GATING_CASES.has(definition.key),
).map((definition) => ({
  key: definition.key,
  probes: PROBE_ENDPOINTS[definition.key] ?? [],
}));

describe('Module gating leakage', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.$connect();
    fixture = await createTenantFixture(prisma);
    const auth = await login(app, fixture.ownerEmail, fixture.password, fixture.domainName);
    token = auth.accessToken;
  }, 60_000);

  afterAll(async () => {
    if (prisma && fixture) {
      await deleteTenantFixture(prisma, fixture);
    }
    if (prisma) {
      await prisma.$disconnect();
    }
    await closeTestApp();
  });

  describe.each(PROBES)('module: $key', ({ key, probes }) => {
    const itForModule = ACTIVE_MODULE_GATING_CASES.has(key) ? it : it.skip;

    itForModule('returns 404 MODULE_DISABLED when the module is disabled', async () => {
      await disableModuleForTenant(prisma, fixture.tenantId, key);
      for (const probe of probes) {
        const req =
          probe.method === 'GET'
            ? request(app.getHttpServer()).get(probe.path)
            : request(app.getHttpServer())
                .post(probe.path)
                .send(probe.body ?? {});
        const res = await req
          .set('Authorization', `Bearer ${token}`)
          .set('Host', fixture.domainName);

        expect(res.status).toBe(404);
        expect(res.body.error?.code).toBe('MODULE_DISABLED');
        expect(res.body.error?.module).toBe(key);
      }
    });

    itForModule('does not return MODULE_DISABLED when the module is enabled', async () => {
      await enableModuleForTenant(prisma, fixture.tenantId, key);
      for (const probe of probes) {
        const req =
          probe.method === 'GET'
            ? request(app.getHttpServer()).get(probe.path)
            : request(app.getHttpServer())
                .post(probe.path)
                .send(probe.body ?? {});
        const res = await req
          .set('Authorization', `Bearer ${token}`)
          .set('Host', fixture.domainName);

        expect(res.body.error?.code).not.toBe('MODULE_DISABLED');
      }
    });

    const itInboxStaysCore = key === 'communications_outbound' ? it : it.skip;

    itInboxStaysCore('keeps the in-app notification inbox available when disabled', async () => {
      await disableModuleForTenant(prisma, fixture.tenantId, key);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${token}`)
        .set('Host', fixture.domainName);

      expect(res.status).not.toBe(404);
      expect(res.body.error?.code).not.toBe('MODULE_DISABLED');
    });

    const itTimetableStaysCore = key === 'auto_scheduling' ? it : it.skip;

    itTimetableStaysCore('keeps personal timetable reads available when disabled', async () => {
      await disableModuleForTenant(prisma, fixture.tenantId, key);

      const res = await request(app.getHttpServer())
        .get('/api/v1/scheduling/timetable/my?week_date=2026-03-20')
        .set('Authorization', `Bearer ${token}`)
        .set('Host', fixture.domainName);

      expect(res.body.error?.code).not.toBe('MODULE_DISABLED');
    });

    const itComplianceCoreStaysCore = key === 'compliance_advanced' ? it : it.skip;

    itComplianceCoreStaysCore(
      'keeps legally required compliance and GDPR endpoints available when disabled',
      async () => {
        await disableModuleForTenant(prisma, fixture.tenantId, key);

        const complianceRes = await request(app.getHttpServer())
          .get('/api/v1/compliance-requests')
          .set('Authorization', `Bearer ${token}`)
          .set('Host', fixture.domainName);

        const privacyNoticeRes = await request(app.getHttpServer())
          .get('/api/v1/privacy-notices/current')
          .set('Authorization', `Bearer ${token}`)
          .set('Host', fixture.domainName);

        expect(complianceRes.body.error?.code).not.toBe('MODULE_DISABLED');
        expect(privacyNoticeRes.body.error?.code).not.toBe('MODULE_DISABLED');
      },
    );
  });
});
