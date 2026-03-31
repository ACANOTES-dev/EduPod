/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, SubmitFormDto, TenantContext } from '@school/shared';

import { ConsentRecordsService } from './consent-records.service';
import { FormSubmissionsService } from './form-submissions.service';
import { ParentFormsController } from './parent-forms.controller';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT: TenantContext = {
  tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const PARENT_USER: JwtPayload = {
  sub: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  email: 'parent@test.com',
  tenant_id: TENANT.tenant_id,
  membership_id: 'mem-parent-1',
  type: 'access',
  iat: 0,
  exp: 0,
};
const SUBMISSION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONSENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── Mock factories ───────────────────────────────────────────────────────────

function buildMockSubmissionsService() {
  return {
    getPendingFormsForParent: jest.fn(),
    getSubmissionForParent: jest.fn(),
    submit: jest.fn(),
  };
}

function buildMockConsentRecordsService() {
  return {
    findAll: jest.fn(),
    findByStudent: jest.fn(),
    revoke: jest.fn(),
  };
}

function buildMockRequest(
  overrides: Partial<{
    ip: string;
    headers: Record<string, string>;
    socket: { remoteAddress: string };
  }> = {},
) {
  return {
    ip: overrides.ip ?? '127.0.0.1',
    headers: overrides.headers ?? { 'user-agent': 'jest-test-agent' },
    socket: overrides.socket ?? { remoteAddress: '127.0.0.1' },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ParentFormsController', () => {
  let controller: ParentFormsController;
  let submissionsService: ReturnType<typeof buildMockSubmissionsService>;
  let consentService: ReturnType<typeof buildMockConsentRecordsService>;

  beforeEach(async () => {
    submissionsService = buildMockSubmissionsService();
    consentService = buildMockConsentRecordsService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentFormsController],
      providers: [
        { provide: FormSubmissionsService, useValue: submissionsService },
        { provide: ConsentRecordsService, useValue: consentService },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ParentFormsController>(ParentFormsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call formSubmissionsService.getPendingFormsForParent with tenantId and userId', async () => {
    const expected = [{ id: SUBMISSION_ID, status: 'pending' }];
    submissionsService.getPendingFormsForParent.mockResolvedValue(expected);

    const result = await controller.getPendingForms(TENANT, PARENT_USER);

    expect(submissionsService.getPendingFormsForParent).toHaveBeenCalledWith(
      TENANT.tenant_id,
      PARENT_USER.sub,
    );
    expect(result).toBe(expected);
  });

  it('should call formSubmissionsService.getSubmissionForParent with tenantId, submissionId, and userId', async () => {
    const expected = { id: SUBMISSION_ID, status: 'pending', form_template: {} };
    submissionsService.getSubmissionForParent.mockResolvedValue(expected);

    const result = await controller.getSubmission(TENANT, PARENT_USER, SUBMISSION_ID);

    expect(submissionsService.getSubmissionForParent).toHaveBeenCalledWith(
      TENANT.tenant_id,
      SUBMISSION_ID,
      PARENT_USER.sub,
    );
    expect(result).toBe(expected);
  });

  it('should call formSubmissionsService.submit with tenantId, submissionId, dto, userId, ip, and user-agent', async () => {
    const dto: SubmitFormDto = {
      responses: { field_1: 'Yes', field_2: 'No' },
    };
    const expected = { id: SUBMISSION_ID, status: 'submitted' };
    submissionsService.submit.mockResolvedValue(expected);

    const req = buildMockRequest();

    const result = await controller.submitForm(
      TENANT,
      PARENT_USER,
      SUBMISSION_ID,
      dto,
      req as never,
    );

    expect(submissionsService.submit).toHaveBeenCalledWith(
      TENANT.tenant_id,
      SUBMISSION_ID,
      dto,
      PARENT_USER.sub,
      '127.0.0.1',
      'jest-test-agent',
    );
    expect(result).toBe(expected);
  });

  it('should call consentRecordsService.revoke with tenantId, consentId, and reason', async () => {
    const expected = { id: CONSENT_ID, status: 'revoked' };
    consentService.revoke.mockResolvedValue(expected);

    const result = await controller.revokeConsent(TENANT, CONSENT_ID, {
      reason: 'No longer needed',
    });

    expect(consentService.revoke).toHaveBeenCalledWith(
      TENANT.tenant_id,
      CONSENT_ID,
      'No longer needed',
    );
    expect(result).toBe(expected);
  });

  it('should call consentRecordsService.revoke with undefined reason when not provided', async () => {
    const expected = { id: CONSENT_ID, status: 'revoked' };
    consentService.revoke.mockResolvedValue(expected);

    const result = await controller.revokeConsent(TENANT, CONSENT_ID, {});

    expect(consentService.revoke).toHaveBeenCalledWith(TENANT.tenant_id, CONSENT_ID, undefined);
    expect(result).toBe(expected);
  });
});
