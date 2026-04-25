/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, type TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { PermissionCacheService } from '../../../common/services/permission-cache.service';

import { ReportSharingController } from './report-sharing.controller';
import { ReportSharingService } from './report-sharing.service';

const TENANT: TenantContext = {
  tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  slug: 'nhqs',
  name: 'NHQS',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  email: 'owner@nhqs.test',
  tenant_id: TENANT.tenant_id,
  membership_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  type: 'access',
  iat: 0,
  exp: 0,
};

const REPORT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SHARE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const RECIPIENT_ID = '11111111-1111-1111-1111-111111111111';

describe('ReportSharingController', () => {
  let controller: ReportSharingController;
  let sharing: {
    share: jest.Mock;
    getSharedSnapshot: jest.Mock;
    listSharesByReport: jest.Mock;
  };
  let permissionCache: { getPermissions: jest.Mock; isOwner: jest.Mock };

  beforeEach(async () => {
    sharing = {
      share: jest.fn(),
      getSharedSnapshot: jest.fn(),
      listSharesByReport: jest.fn(),
    };
    permissionCache = {
      getPermissions: jest.fn().mockResolvedValue(['reports.share', 'reports.view']),
      isOwner: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportSharingController],
      providers: [
        { provide: ReportSharingService, useValue: sharing },
        { provide: PermissionCacheService, useValue: permissionCache },
      ],
    })
      .overrideGuard(require('../../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReportSharingController>(ReportSharingController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('shareReport', () => {
    it('forwards the URL reportId, body, and resolved permissions to the service', async () => {
      sharing.share.mockResolvedValue({
        share_id: SHARE_ID,
        conversation_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        artifact_keys: { pdf: 's3-key-pdf' },
        recipients_count: 1,
      });

      const result = await controller.shareReport(TENANT, USER, REPORT_ID, {
        saved_report_id: REPORT_ID,
        format: 'pdf',
        audience: { user_ids: [RECIPIENT_ID], role_keys: [] },
        message_body: 'fyi',
      });

      expect(sharing.share).toHaveBeenCalledWith({
        tenantId: TENANT.tenant_id,
        sharerUserId: USER.sub,
        permissions: ['reports.share', 'reports.view'],
        savedReportId: REPORT_ID,
        format: 'pdf',
        audience: { user_ids: [RECIPIENT_ID], role_keys: [] },
        messageBody: 'fyi',
      });
      expect(result).toEqual({
        data: {
          share_id: SHARE_ID,
          conversation_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
          artifact_keys: { pdf: 's3-key-pdf' },
          recipients_count: 1,
        },
      });
    });

    it('appends the OWNER sentinel for school owner / principal users', async () => {
      permissionCache.isOwner.mockResolvedValue(true);
      sharing.share.mockResolvedValue({
        share_id: SHARE_ID,
        conversation_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        artifact_keys: { pdf: 's3-key-pdf' },
        recipients_count: 1,
      });

      await controller.shareReport(TENANT, USER, REPORT_ID, {
        saved_report_id: REPORT_ID,
        format: 'pdf',
        audience: { user_ids: [RECIPIENT_ID], role_keys: [] },
      });

      const call = sharing.share.mock.calls[0]?.[0] as { permissions: string[] };
      expect(call.permissions).toContain('reports.share');
      expect(call.permissions.some((p) => p.startsWith('__'))).toBe(true);
    });
  });

  describe('listShareHistory', () => {
    it('clamps pageSize and parses pagination defaults', async () => {
      sharing.listSharesByReport.mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });

      await controller.listShareHistory(TENANT, REPORT_ID, undefined, undefined);

      expect(sharing.listSharesByReport).toHaveBeenCalledWith({
        tenantId: TENANT.tenant_id,
        savedReportId: REPORT_ID,
        page: 1,
        pageSize: 20,
      });
    });

    it('uses caller-supplied pagination when provided', async () => {
      sharing.listSharesByReport.mockResolvedValue({
        data: [],
        meta: { page: 3, pageSize: 50, total: 0 },
      });

      await controller.listShareHistory(TENANT, REPORT_ID, '3', '50');

      expect(sharing.listSharesByReport).toHaveBeenCalledWith({
        tenantId: TENANT.tenant_id,
        savedReportId: REPORT_ID,
        page: 3,
        pageSize: 50,
      });
    });

    it('caps pageSize at 100', async () => {
      sharing.listSharesByReport.mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 100, total: 0 },
      });

      await controller.listShareHistory(TENANT, REPORT_ID, '1', '500');

      const call = sharing.listSharesByReport.mock.calls[0]?.[0] as { pageSize: number };
      expect(call.pageSize).toBe(100);
    });
  });

  describe('getSharedSnapshot', () => {
    it('passes the shareId, tenant, user, and resolved permissions to the service', async () => {
      sharing.getSharedSnapshot.mockResolvedValue({
        share_id: SHARE_ID,
        saved_report_id: REPORT_ID,
        saved_report_name: 'Year 5 Attendance',
        saved_report_description: null,
        shared_by_name: 'Yusuf Rahman',
        shared_at: '2026-04-25T10:00:00.000Z',
        format: 'pdf',
        filters_summary: 'Snapshot of "Year 5 Attendance"',
        message_body: null,
        artifacts: [
          { format: 'pdf', download_url: 'https://x', filename: 'r.pdf' },
        ],
        can_open_in_builder: false,
      });

      const result = await controller.getSharedSnapshot(TENANT, USER, SHARE_ID);

      expect(sharing.getSharedSnapshot).toHaveBeenCalledWith({
        tenantId: TENANT.tenant_id,
        userId: USER.sub,
        permissions: ['reports.share', 'reports.view'],
        shareId: SHARE_ID,
      });
      expect(result.data.share_id).toBe(SHARE_ID);
    });
  });
});
