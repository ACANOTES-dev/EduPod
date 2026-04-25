import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AuthReadFacade } from '../../auth/auth-read.facade';
import { ConversationsService } from '../../inbox/conversations/conversations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomReportBuilderService } from '../custom-report-builder.service';
import { ReportExportService } from '../exports/report-export.service';
import { QueryEngineService } from '../query-engine/query-engine.service';

import { ReportSharingService } from './report-sharing.service';
import { SnapshotStorageService } from './snapshot-storage.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SHARER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const RECIPIENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const REPORT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CONVERSATION_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const SHARE_LOG_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const OTHER_USER_ID = '11111111-1111-1111-1111-111111111111';

// ─── Mock Prisma transaction ──────────────────────────────────────────────

interface MockTx {
  reportShareLog: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  conversationParticipant: { findFirst: jest.Mock };
  savedReport: { findFirst: jest.Mock };
}

const mockTx: MockTx = {
  reportShareLog: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  conversationParticipant: { findFirst: jest.fn() },
  savedReport: { findFirst: jest.fn() },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────

const validSavedReport = {
  id: REPORT_ID,
  name: 'Year 5 Attendance',
  data_source: 'student',
  dimensions_json: [{ field_id: 'student.identity.first_name' }],
  measures_json: {},
  filters_json: { combinator: 'and', conditions: [] },
  chart_type: null,
  is_shared: false,
  created_by_user_id: SHARER_ID,
  created_at: new Date('2026-04-01').toISOString(),
  updated_at: new Date('2026-04-20').toISOString(),
};

const validQueryResult = {
  rows: [{ 'student.identity.first_name': 'Alice' }],
  columns: [
    {
      id: 'student.identity.first_name',
      label_key: 'reports.fields.student.identity.first_name',
      type: 'string' as const,
    },
  ],
  meta: {
    row_count: 1,
    truncated: false,
    execution_ms: 12,
  },
};

const sharerRow = {
  id: SHARER_ID,
  first_name: 'Yusuf',
  last_name: 'Rahman',
};

const branding = {
  tenant_id: TENANT_ID,
  school_name: 'Nurul Huda',
  logo_url: null,
  primary_color: '#000',
  secondary_color: '#fff',
  locale: 'en' as const,
  currency_code: 'GBP',
};

describe('ReportSharingService', () => {
  let service: ReportSharingService;
  let module: TestingModule;
  let builder: { getSavedReport: jest.Mock; executeReport: jest.Mock };
  let queryEngine: { execute: jest.Mock };
  let exportSvc: { exportByFormat: jest.Mock; getTenantBranding: jest.Mock };
  let snapshotStorage: { upload: jest.Mock; getDownloadUrl: jest.Mock };
  let conversations: { createBroadcast: jest.Mock };
  let authReadFacade: { findUserSummary: jest.Mock; findUsersByIds: jest.Mock };

  beforeEach(async () => {
    builder = {
      getSavedReport: jest.fn().mockResolvedValue(validSavedReport),
      executeReport: jest.fn().mockResolvedValue(validQueryResult),
    };
    queryEngine = { execute: jest.fn().mockResolvedValue(validQueryResult) };
    exportSvc = {
      exportByFormat: jest.fn().mockResolvedValue(Buffer.from('fake-bytes')),
      getTenantBranding: jest.fn().mockResolvedValue(branding),
    };
    snapshotStorage = {
      upload: jest
        .fn()
        .mockImplementation(async (input: { format: string }) => `s3-key-${input.format}`),
      getDownloadUrl: jest.fn().mockResolvedValue('https://example.test/signed'),
    };
    conversations = {
      createBroadcast: jest.fn().mockResolvedValue({
        conversation_id: CONVERSATION_ID,
        message_id: 'message-id',
        resolved_recipient_count: 1,
        original_recipient_count: 1,
      }),
    };
    authReadFacade = {
      findUserSummary: jest.fn().mockResolvedValue({
        id: SHARER_ID,
        email: 'yusuf@example.com',
        first_name: 'Yusuf',
        last_name: 'Rahman',
      }),
      findUsersByIds: jest.fn().mockResolvedValue([
        {
          id: SHARER_ID,
          email: 'yusuf@example.com',
          first_name: 'Yusuf',
          last_name: 'Rahman',
        },
      ]),
    };

    // Reset Prisma mocks to a healthy default.
    mockTx.reportShareLog.create.mockResolvedValue({
      id: SHARE_LOG_ID,
      tenant_id: TENANT_ID,
      saved_report_id: REPORT_ID,
      shared_by: SHARER_ID,
      shared_at: new Date(),
      format: 'pdf',
      conversation_id: CONVERSATION_ID,
      recipients_json: { user_ids: [RECIPIENT_ID], role_keys: [] },
      message_body: null,
    });
    mockTx.conversationParticipant.findFirst.mockResolvedValue(null);
    mockTx.reportShareLog.findFirst.mockResolvedValue(null);
    mockTx.reportShareLog.findMany.mockResolvedValue([]);
    mockTx.reportShareLog.count.mockResolvedValue(0);

    module = await Test.createTestingModule({
      providers: [
        ReportSharingService,
        { provide: PrismaService, useValue: {} },
        { provide: CustomReportBuilderService, useValue: builder },
        { provide: QueryEngineService, useValue: queryEngine },
        { provide: ReportExportService, useValue: exportSvc },
        { provide: SnapshotStorageService, useValue: snapshotStorage },
        { provide: ConversationsService, useValue: conversations },
        { provide: AuthReadFacade, useValue: authReadFacade },
      ],
    }).compile();

    service = module.get<ReportSharingService>(ReportSharingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── share — happy path ─────────────────────────────────────────────────

  describe('share', () => {
    it('exports the requested format, uploads, creates a broadcast, and audits', async () => {
      const result = await service.share({
        tenantId: TENANT_ID,
        sharerUserId: SHARER_ID,
        permissions: ['reports.share', 'reports.view'],
        savedReportId: REPORT_ID,
        format: 'pdf',
        audience: { user_ids: [RECIPIENT_ID], role_keys: [] },
      });

      expect(builder.getSavedReport).toHaveBeenCalledWith(TENANT_ID, REPORT_ID);
      // ReportSharingService funnels execution through builder.executeReport
      // (which delegates to QueryEngineService internally so RLS, the row
      // cap, and the timeout budget all apply).
      expect(builder.executeReport).toHaveBeenCalledTimes(1);
      expect(exportSvc.exportByFormat).toHaveBeenCalledWith('pdf', expect.any(Object));
      expect(snapshotStorage.upload).toHaveBeenCalledTimes(1);
      expect(conversations.createBroadcast).toHaveBeenCalledTimes(1);

      const broadcastCall = conversations.createBroadcast.mock.calls[0]?.[0] as {
        attachments: Array<{ storage_key: string; mime_type: string }>;
      };
      expect(broadcastCall.attachments).toHaveLength(1);
      expect(broadcastCall.attachments[0]?.storage_key).toBe('s3-key-pdf');
      expect(broadcastCall.attachments[0]?.mime_type).toBe('application/pdf');

      expect(mockTx.reportShareLog.create).toHaveBeenCalledTimes(1);
      const logCall = mockTx.reportShareLog.create.mock.calls[0]?.[0] as {
        data: { format: string; conversation_id: string; shared_by: string };
      };
      expect(logCall.data.format).toBe('pdf');
      expect(logCall.data.conversation_id).toBe(CONVERSATION_ID);
      expect(logCall.data.shared_by).toBe(SHARER_ID);

      expect(result.share_id).toBe(SHARE_LOG_ID);
      expect(result.conversation_id).toBe(CONVERSATION_ID);
      expect(result.artifact_keys).toEqual({ pdf: 's3-key-pdf' });
      expect(result.recipients_count).toBe(1);
    });

    it('generates all three formats when format = all', async () => {
      const result = await service.share({
        tenantId: TENANT_ID,
        sharerUserId: SHARER_ID,
        permissions: ['reports.share', 'reports.view'],
        savedReportId: REPORT_ID,
        format: 'all',
        audience: { user_ids: [RECIPIENT_ID], role_keys: [] },
      });

      expect(exportSvc.exportByFormat).toHaveBeenCalledTimes(3);
      const formats = exportSvc.exportByFormat.mock.calls.map((c) => c[0]);
      expect(new Set(formats)).toEqual(new Set(['pdf', 'excel', 'word']));

      expect(snapshotStorage.upload).toHaveBeenCalledTimes(3);

      const broadcastCall = conversations.createBroadcast.mock.calls[0]?.[0] as {
        attachments: unknown[];
      };
      expect(broadcastCall.attachments).toHaveLength(3);

      expect(result.artifact_keys).toEqual({
        pdf: 's3-key-pdf',
        excel: 's3-key-excel',
        word: 's3-key-word',
      });
    });

    it('rejects when the caller lacks reports.share permission', async () => {
      await expect(
        service.share({
          tenantId: TENANT_ID,
          sharerUserId: SHARER_ID,
          permissions: ['reports.view'],
          savedReportId: REPORT_ID,
          format: 'pdf',
          audience: { user_ids: [RECIPIENT_ID], role_keys: [] },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(builder.getSavedReport).not.toHaveBeenCalled();
      expect(conversations.createBroadcast).not.toHaveBeenCalled();
    });

    it('rejects when the caller is not the owner of a private report', async () => {
      builder.getSavedReport.mockResolvedValue({
        ...validSavedReport,
        created_by_user_id: OTHER_USER_ID,
        is_shared: false,
      });

      await expect(
        service.share({
          tenantId: TENANT_ID,
          sharerUserId: SHARER_ID,
          permissions: ['reports.share', 'reports.view'],
          savedReportId: REPORT_ID,
          format: 'pdf',
          audience: { user_ids: [RECIPIENT_ID], role_keys: [] },
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'REPORT_SHARE_NOT_OWNER' }),
      });
    });

    it('allows non-owner to share when the report visibility is shared', async () => {
      builder.getSavedReport.mockResolvedValue({
        ...validSavedReport,
        created_by_user_id: OTHER_USER_ID,
        is_shared: true,
      });

      const result = await service.share({
        tenantId: TENANT_ID,
        sharerUserId: SHARER_ID,
        permissions: ['reports.share', 'reports.view'],
        savedReportId: REPORT_ID,
        format: 'pdf',
        audience: { user_ids: [RECIPIENT_ID], role_keys: [] },
      });
      expect(result.share_id).toBe(SHARE_LOG_ID);
    });

    it('translates user_ids + role_keys to a combined OR audience', async () => {
      await service.share({
        tenantId: TENANT_ID,
        sharerUserId: SHARER_ID,
        permissions: ['reports.share', 'reports.view'],
        savedReportId: REPORT_ID,
        format: 'pdf',
        audience: {
          user_ids: [RECIPIENT_ID],
          role_keys: ['school_principal', 'school_vice_principal'],
        },
      });

      const broadcastCall = conversations.createBroadcast.mock.calls[0]?.[0] as {
        audienceDefinition: unknown;
      };
      expect(broadcastCall.audienceDefinition).toMatchObject({
        operator: 'or',
        operands: expect.any(Array),
      });
      const def = broadcastCall.audienceDefinition as {
        operands: Array<{ provider: string; params?: { user_ids?: string[]; roles?: string[] } }>;
      };
      const handpicked = def.operands.find((o) => o.provider === 'handpicked');
      const staffRole = def.operands.find((o) => o.provider === 'staff_role');
      expect(handpicked?.params?.user_ids).toEqual([RECIPIENT_ID]);
      expect(staffRole?.params?.roles).toEqual(['school_principal', 'school_vice_principal']);
    });

    it('uses a single-leaf audience when only one of user_ids/role_keys is non-empty', async () => {
      await service.share({
        tenantId: TENANT_ID,
        sharerUserId: SHARER_ID,
        permissions: ['reports.share', 'reports.view'],
        savedReportId: REPORT_ID,
        format: 'pdf',
        audience: { user_ids: [], role_keys: ['school_principal'] },
      });

      const broadcastCall = conversations.createBroadcast.mock.calls[0]?.[0] as {
        audienceDefinition: { provider: string; params?: { roles?: string[] } };
      };
      expect(broadcastCall.audienceDefinition.provider).toBe('staff_role');
      expect(broadcastCall.audienceDefinition.params?.roles).toEqual(['school_principal']);
    });

    it('falls back to a default message body when none is provided', async () => {
      await service.share({
        tenantId: TENANT_ID,
        sharerUserId: SHARER_ID,
        permissions: ['reports.share', 'reports.view'],
        savedReportId: REPORT_ID,
        format: 'pdf',
        audience: { user_ids: [RECIPIENT_ID], role_keys: [] },
      });

      const broadcastCall = conversations.createBroadcast.mock.calls[0]?.[0] as {
        body: string;
        subject: string | null;
      };
      expect(broadcastCall.body).toContain('Yusuf Rahman');
      expect(broadcastCall.body).toContain('Year 5 Attendance');
      expect(broadcastCall.subject).toContain('Year 5 Attendance');
    });

    it('respects an explicit message body and includes it on the audit row', async () => {
      await service.share({
        tenantId: TENANT_ID,
        sharerUserId: SHARER_ID,
        permissions: ['reports.share', 'reports.view'],
        savedReportId: REPORT_ID,
        format: 'pdf',
        audience: { user_ids: [RECIPIENT_ID], role_keys: [] },
        messageBody: 'fyi — thoughts?',
      });

      const broadcastCall = conversations.createBroadcast.mock.calls[0]?.[0] as { body: string };
      expect(broadcastCall.body).toContain('fyi — thoughts?');

      const logCall = mockTx.reportShareLog.create.mock.calls[0]?.[0] as {
        data: { message_body: string };
      };
      expect(logCall.data.message_body).toBe('fyi — thoughts?');
    });
  });

  // ─── getSharedSnapshot ─────────────────────────────────────────────────

  describe('getSharedSnapshot', () => {
    const SHARE_RECORD = {
      id: SHARE_LOG_ID,
      tenant_id: TENANT_ID,
      saved_report_id: REPORT_ID,
      shared_by: SHARER_ID,
      shared_at: new Date('2026-04-25T10:00:00.000Z'),
      format: 'pdf' as const,
      conversation_id: CONVERSATION_ID,
      recipients_json: {
        user_ids: [RECIPIENT_ID],
        role_keys: [],
        artifact_keys: { pdf: 's3-key-pdf' },
      },
      message_body: null,
      saved_report: {
        id: REPORT_ID,
        name: 'Year 5 Attendance',
        is_shared: false,
      },
      sharer: { id: SHARER_ID, first_name: 'Yusuf', last_name: 'Rahman' },
    };

    it('returns the snapshot view with signed URLs when the user is a participant', async () => {
      mockTx.reportShareLog.findFirst.mockResolvedValue(SHARE_RECORD);
      mockTx.conversationParticipant.findFirst.mockResolvedValue({ id: 'participant-id' });

      const view = await service.getSharedSnapshot({
        tenantId: TENANT_ID,
        userId: RECIPIENT_ID,
        permissions: ['reports.view'],
        shareId: SHARE_LOG_ID,
      });

      expect(view.share_id).toBe(SHARE_LOG_ID);
      expect(view.saved_report_name).toBe('Year 5 Attendance');
      expect(view.shared_by_name).toBe('Yusuf Rahman');
      expect(view.format).toBe('pdf');
      expect(view.artifacts).toHaveLength(1);
      expect(view.artifacts[0]?.format).toBe('pdf');
      expect(view.artifacts[0]?.download_url).toBe('https://example.test/signed');
      expect(view.can_open_in_builder).toBe(false);
    });

    it('flips can_open_in_builder when the user has reports.builder AND the report is shared', async () => {
      mockTx.reportShareLog.findFirst.mockResolvedValue({
        ...SHARE_RECORD,
        saved_report: { ...SHARE_RECORD.saved_report, is_shared: true },
      });
      mockTx.conversationParticipant.findFirst.mockResolvedValue({ id: 'participant-id' });

      const view = await service.getSharedSnapshot({
        tenantId: TENANT_ID,
        userId: RECIPIENT_ID,
        permissions: ['reports.view', 'reports.builder'],
        shareId: SHARE_LOG_ID,
      });

      expect(view.can_open_in_builder).toBe(true);
    });

    it('rejects when the user is not a participant in the conversation', async () => {
      mockTx.reportShareLog.findFirst.mockResolvedValue(SHARE_RECORD);
      mockTx.conversationParticipant.findFirst.mockResolvedValue(null);

      await expect(
        service.getSharedSnapshot({
          tenantId: TENANT_ID,
          userId: '99999999-9999-9999-9999-999999999999',
          permissions: ['reports.view'],
          shareId: SHARE_LOG_ID,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws when the share id is not found for this tenant', async () => {
      mockTx.reportShareLog.findFirst.mockResolvedValue(null);

      await expect(
        service.getSharedSnapshot({
          tenantId: TENANT_ID,
          userId: RECIPIENT_ID,
          permissions: ['reports.view'],
          shareId: SHARE_LOG_ID,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── listSharesByReport ────────────────────────────────────────────────

  describe('listSharesByReport', () => {
    it('returns paginated history entries with sharer display names', async () => {
      mockTx.reportShareLog.findMany.mockResolvedValue([
        {
          id: SHARE_LOG_ID,
          shared_at: new Date('2026-04-25'),
          shared_by: SHARER_ID,
          format: 'pdf',
          conversation_id: CONVERSATION_ID,
          recipients_json: { user_ids: [RECIPIENT_ID], role_keys: [] },
          message_body: null,
        },
      ]);
      mockTx.reportShareLog.count.mockResolvedValue(1);
      authReadFacade.findUsersByIds.mockResolvedValue([sharerRow]);

      const out = await service.listSharesByReport({
        tenantId: TENANT_ID,
        savedReportId: REPORT_ID,
        page: 1,
        pageSize: 20,
      });

      expect(out.data).toHaveLength(1);
      expect(out.data[0]?.shared_by_name).toBe('Yusuf Rahman');
      expect(out.data[0]?.recipients_count).toBe(1);
      expect(out.meta.total).toBe(1);
    });
  });
});
