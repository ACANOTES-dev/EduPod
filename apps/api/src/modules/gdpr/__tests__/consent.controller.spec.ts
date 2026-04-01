import { Test, TestingModule } from '@nestjs/testing';

import type {
  BulkGrantConsentsDto,
  GetConsentsByTypeQueryDto,
  GrantConsentDto,
  JwtPayload,
  TenantContext,
} from '@school/shared';
import { CONSENT_TYPES } from '@school/shared';

import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ConsentController } from '../consent.controller';
import { ConsentService } from '../consent.service';
import { ParentConsentController } from '../parent-consent.controller';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONSENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

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

describe('ConsentController', () => {
  let controller: ConsentController;
  const mockConsentService = {
    grantConsent: jest.fn(),
    withdrawConsent: jest.fn(),
    getConsentsForSubject: jest.fn(),
    getConsentsByType: jest.fn(),
    bulkGrantConsents: jest.fn(),
    getParentPortalConsents: jest.fn(),
    withdrawParentPortalConsent: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConsentController, ParentConsentController],
      providers: [{ provide: ConsentService, useValue: mockConsentService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ConsentController>(ConsentController);
  });

  it('should call grantConsent with tenant and user context', async () => {
    const dto: GrantConsentDto = {
      subject_type: 'student',
      subject_id: STUDENT_ID,
      consent_type: CONSENT_TYPES.AI_GRADING,
      evidence_type: 'registration_form',
    };
    mockConsentService.grantConsent.mockResolvedValue({ id: CONSENT_ID });

    const result = await controller.grantConsent(TENANT, USER, dto);

    expect(mockConsentService.grantConsent).toHaveBeenCalledWith(
      TENANT_ID,
      dto.subject_type,
      dto.subject_id,
      dto.consent_type,
      USER_ID,
      dto.evidence_type,
      dto.notes,
      dto.privacy_notice_version_id,
    );
    expect(result).toEqual({ id: CONSENT_ID });
  });

  it('should call withdrawConsent with tenant and user context', async () => {
    mockConsentService.withdrawConsent.mockResolvedValue({ id: CONSENT_ID });

    const result = await controller.withdrawConsent(TENANT, USER, CONSENT_ID);

    expect(mockConsentService.withdrawConsent).toHaveBeenCalledWith(TENANT_ID, CONSENT_ID, USER_ID);
    expect(result).toEqual({ id: CONSENT_ID });
  });

  it('should call getConsentsForSubject with tenant and subject context', async () => {
    mockConsentService.getConsentsForSubject.mockResolvedValue([{ id: CONSENT_ID }]);

    const result = await controller.getConsentsForSubject(TENANT, 'student', STUDENT_ID);

    expect(mockConsentService.getConsentsForSubject).toHaveBeenCalledWith(
      TENANT_ID,
      'student',
      STUDENT_ID,
    );
    expect(result).toEqual([{ id: CONSENT_ID }]);
  });

  it('should call getConsentsByType with tenant and pagination query', async () => {
    const query: GetConsentsByTypeQueryDto = { page: 1, pageSize: 20 };
    mockConsentService.getConsentsByType.mockResolvedValue({ data: [], meta: query });

    const result = await controller.getConsentsByType(TENANT, CONSENT_TYPES.HEALTH_DATA, query);

    expect(mockConsentService.getConsentsByType).toHaveBeenCalledWith(
      TENANT_ID,
      CONSENT_TYPES.HEALTH_DATA,
      query,
    );
    expect(result).toEqual({ data: [], meta: query });
  });

  it('should call bulkGrantConsents with tenant and user context', async () => {
    const dto: BulkGrantConsentsDto = {
      subject_type: 'student',
      subject_id: STUDENT_ID,
      consents: [
        {
          type: CONSENT_TYPES.HEALTH_DATA,
          evidence_type: 'registration_form',
        },
      ],
    };
    mockConsentService.bulkGrantConsents.mockResolvedValue([{ id: CONSENT_ID }]);

    const result = await controller.bulkGrantConsents(TENANT, USER, dto);

    expect(mockConsentService.bulkGrantConsents).toHaveBeenCalledWith(
      TENANT_ID,
      dto.subject_type,
      dto.subject_id,
      dto.consents,
      USER_ID,
    );
    expect(result).toEqual([{ id: CONSENT_ID }]);
  });

  it('should require consent.manage on grant, withdraw, and bulk routes', () => {
    expect(Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller.grantConsent)).toBe(
      'consent.manage',
    );
    expect(Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller.withdrawConsent)).toBe(
      'consent.manage',
    );
    expect(Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller.bulkGrantConsents)).toBe(
      'consent.manage',
    );
  });

  it('should require consent.view on the subject query route', () => {
    expect(Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller.getConsentsForSubject)).toBe(
      'consent.view',
    );
  });
});

describe('ParentConsentController', () => {
  let controller: ParentConsentController;
  const mockConsentService = {
    getParentPortalConsents: jest.fn(),
    withdrawParentPortalConsent: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentConsentController],
      providers: [{ provide: ConsentService, useValue: mockConsentService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ParentConsentController>(ParentConsentController);
  });

  it('should call getParentPortalConsents with tenant and user context', async () => {
    mockConsentService.getParentPortalConsents.mockResolvedValue({ data: [] });

    const result = await controller.getOwnConsents(TENANT, USER);

    expect(mockConsentService.getParentPortalConsents).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(result).toEqual({ data: [] });
  });

  it('should call withdrawParentPortalConsent with tenant and user context', async () => {
    mockConsentService.withdrawParentPortalConsent.mockResolvedValue({
      id: CONSENT_ID,
    });

    const result = await controller.withdrawOwnConsent(TENANT, USER, CONSENT_ID);

    expect(mockConsentService.withdrawParentPortalConsent).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      CONSENT_ID,
    );
    expect(result).toEqual({ id: CONSENT_ID });
  });

  it('should require parent.view_own_students on self-service routes', () => {
    expect(Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller.getOwnConsents)).toBe(
      'parent.view_own_students',
    );
    expect(Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller.withdrawOwnConsent)).toBe(
      'parent.view_own_students',
    );
  });
});
