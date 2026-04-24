import { Test, TestingModule } from '@nestjs/testing';

import { ComplianceReadFacade } from '../compliance/compliance-read.facade';
import { RetentionPoliciesService } from '../compliance/retention-policies.service';
import { GdprReadFacade } from '../gdpr/gdpr-read.facade';

import { RegulatoryGdprService } from './regulatory-gdpr.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const buildMockCompliance = () => ({
  countOpenDsarRequests: jest.fn().mockResolvedValue(0),
  countOverdueDsarRequests: jest.fn().mockResolvedValue(0),
  findRecentDsarRequests: jest.fn().mockResolvedValue([]),
});

const buildMockGdpr = () => ({
  findActivePrivacyNoticeVersion: jest.fn().mockResolvedValue(null),
  findDpaAcceptanceStatus: jest.fn().mockResolvedValue({ accepted: false, current_version: null }),
});

const buildMockRetention = () => ({
  countItemsPastRetention: jest.fn().mockResolvedValue(0),
});

describe('RegulatoryGdprService', () => {
  let service: RegulatoryGdprService;
  let mockCompliance: ReturnType<typeof buildMockCompliance>;
  let mockGdpr: ReturnType<typeof buildMockGdpr>;
  let mockRetention: ReturnType<typeof buildMockRetention>;

  beforeEach(async () => {
    mockCompliance = buildMockCompliance();
    mockGdpr = buildMockGdpr();
    mockRetention = buildMockRetention();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatoryGdprService,
        { provide: ComplianceReadFacade, useValue: mockCompliance },
        { provide: GdprReadFacade, useValue: mockGdpr },
        { provide: RetentionPoliciesService, useValue: mockRetention },
      ],
    }).compile();

    service = module.get(RegulatoryGdprService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('RegulatoryGdprService — getDashboard', () => {
    it('returns zero-state when the tenant has no GDPR activity', async () => {
      const dashboard = await service.getDashboard(TENANT_ID);

      expect(dashboard.open_dsar_count).toBe(0);
      expect(dashboard.overdue_dsar_count).toBe(0);
      expect(dashboard.active_privacy_notice_version).toBeNull();
      expect(dashboard.active_privacy_notice_effective_date).toBeNull();
      expect(dashboard.data_items_past_retention_count).toBe(0);
      expect(dashboard.active_dpa_accepted).toBe(false);
      expect(dashboard.active_dpa_version).toBeNull();
      expect(dashboard.recent_dsar_activity).toEqual([]);
    });

    it('maps recent DSAR activity with anonymised subject references', async () => {
      const created = new Date('2026-04-20T10:00:00Z');
      mockCompliance.findRecentDsarRequests.mockResolvedValueOnce([
        {
          id: '11111111-1111-1111-1111-111111111111',
          request_type: 'data_export',
          subject_type: 'student',
          subject_id: 'abcdef12-1234-5678-9abc-def012345678',
          status: 'submitted',
          created_at: created,
        },
      ]);

      const dashboard = await service.getDashboard(TENANT_ID);

      expect(dashboard.recent_dsar_activity).toHaveLength(1);
      expect(dashboard.recent_dsar_activity[0]).toMatchObject({
        id: '11111111-1111-1111-1111-111111111111',
        request_type: 'data_export',
        subject_type: 'student',
        subject_reference: 'abcdef12',
        status: 'submitted',
        created_at: created.toISOString(),
      });
      expect(dashboard.recent_dsar_activity[0]?.subject_reference).not.toContain('-');
    });

    it('surfaces the active privacy notice version', async () => {
      const effective = new Date('2026-01-01');
      mockGdpr.findActivePrivacyNoticeVersion.mockResolvedValueOnce({
        id: '22222222-2222-2222-2222-222222222222',
        version_number: 4,
        effective_date: effective,
        published_at: new Date('2026-01-01'),
      });

      const dashboard = await service.getDashboard(TENANT_ID);

      expect(dashboard.active_privacy_notice_version).toBe(4);
      expect(dashboard.active_privacy_notice_effective_date).toBe(effective.toISOString());
    });

    it('flags DPA acceptance from the read facade', async () => {
      mockGdpr.findDpaAcceptanceStatus.mockResolvedValueOnce({
        accepted: true,
        current_version: '1.2.0',
      });

      const dashboard = await service.getDashboard(TENANT_ID);

      expect(dashboard.active_dpa_accepted).toBe(true);
      expect(dashboard.active_dpa_version).toBe('1.2.0');
    });

    it('passes tenant id through to every backing read source', async () => {
      await service.getDashboard(TENANT_ID);

      expect(mockCompliance.countOpenDsarRequests).toHaveBeenCalledWith(TENANT_ID);
      expect(mockCompliance.countOverdueDsarRequests).toHaveBeenCalledWith(TENANT_ID);
      expect(mockCompliance.findRecentDsarRequests).toHaveBeenCalledWith(TENANT_ID, 5);
      expect(mockGdpr.findActivePrivacyNoticeVersion).toHaveBeenCalledWith(TENANT_ID);
      expect(mockGdpr.findDpaAcceptanceStatus).toHaveBeenCalledWith(TENANT_ID);
      expect(mockRetention.countItemsPastRetention).toHaveBeenCalledWith(TENANT_ID);
    });
  });
});
