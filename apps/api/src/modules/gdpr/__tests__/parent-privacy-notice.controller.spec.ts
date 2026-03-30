import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../../common/guards/auth.guard';
import { ParentPrivacyNoticeController } from '../parent-privacy-notice.controller';
import { PrivacyNoticesService } from '../privacy-notices.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  email: 'parent@test-school.ie',
  tenant_id: TENANT_ID,
  membership_id: 'membership-id',
  type: 'access',
  iat: 0,
  exp: 0,
};

// ─── Mock Service ───────────────────────────────────────────────────────────

const mockPrivacyNoticesService = {
  getParentPortalCurrent: jest.fn(),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('ParentPrivacyNoticeController', () => {
  let controller: ParentPrivacyNoticeController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentPrivacyNoticeController],
      providers: [{ provide: PrivacyNoticesService, useValue: mockPrivacyNoticesService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ParentPrivacyNoticeController>(ParentPrivacyNoticeController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('ParentPrivacyNoticeController -- getCurrent', () => {
    it('should call getParentPortalCurrent with tenant and user context', async () => {
      const expected = {
        current_version: { id: 'version-id', version_number: 1 },
        acknowledged: false,
        acknowledged_at: null,
        requires_acknowledgement: true,
      };
      mockPrivacyNoticesService.getParentPortalCurrent.mockResolvedValue(expected);

      const result = await controller.getCurrent(TENANT, USER);

      expect(mockPrivacyNoticesService.getParentPortalCurrent).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
      );
      expect(result).toBe(expected);
    });

    it('should return acknowledged=true when parent has acknowledged', async () => {
      const expected = {
        current_version: { id: 'version-id', version_number: 1, user_has_acknowledged: true },
        acknowledged: true,
        acknowledged_at: new Date('2026-03-28T10:00:00Z'),
        requires_acknowledgement: false,
      };
      mockPrivacyNoticesService.getParentPortalCurrent.mockResolvedValue(expected);

      const result = await controller.getCurrent(TENANT, USER);

      expect(result.acknowledged).toBe(true);
      expect(result.requires_acknowledgement).toBe(false);
    });
  });
});
