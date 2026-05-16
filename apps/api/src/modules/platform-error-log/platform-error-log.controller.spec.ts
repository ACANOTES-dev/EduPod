import type { JwtPayload } from '@school/shared';

import { PlatformErrorLogController } from './platform-error-log.controller';
import { PlatformErrorLogService } from './platform-error-log.service';

const ACTOR: JwtPayload = {
  sub: '11111111-1111-4111-8111-111111111111',
  email: 'owner@example.com',
  tenant_id: null,
  memberships: [],
  platform_roles: ['platform_owner'],
};

describe('PlatformErrorLogController', () => {
  const platformErrorLogService = {
    createRule: jest.fn(),
    deleteRule: jest.fn(),
    listRedacted: jest.fn(),
    listRules: jest.fn(),
    preview: jest.fn(),
  } satisfies Pick<
    PlatformErrorLogService,
    'createRule' | 'deleteRule' | 'listRedacted' | 'listRules' | 'preview'
  >;

  let controller: PlatformErrorLogController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PlatformErrorLogController(platformErrorLogService as PlatformErrorLogService);
  });

  it('lists redacted errors', async () => {
    const query = { page: 1, pageSize: 20 };
    const response = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    platformErrorLogService.listRedacted.mockResolvedValueOnce(response);

    await expect(controller.list(query)).resolves.toBe(response);

    expect(platformErrorLogService.listRedacted).toHaveBeenCalledWith(query);
  });

  it('lists redaction rules', async () => {
    const response = { built_in: [], custom: [] };
    platformErrorLogService.listRules.mockResolvedValueOnce(response);

    await expect(controller.listRules()).resolves.toBe(response);

    expect(platformErrorLogService.listRules).toHaveBeenCalledWith();
  });

  it('creates a redaction rule for the current platform user', async () => {
    const dto = {
      name: 'token',
      pattern: 'secret_[a-z]+',
      pattern_flags: 'gi',
      replacement: '[SECRET]',
      severity: 'high' as const,
    };
    const response = { id: '22222222-2222-4222-8222-222222222222' };
    platformErrorLogService.createRule.mockResolvedValueOnce(response as never);

    await expect(controller.createRule(dto, ACTOR)).resolves.toBe(response);

    expect(platformErrorLogService.createRule).toHaveBeenCalledWith(dto, ACTOR.sub);
  });

  it('previews a redaction rule without persisting it', async () => {
    const dto = {
      name: 'email',
      pattern: 'test@example\\.com',
      replacement: '[EMAIL]',
      sample: 'Email test@example.com',
    };
    const response = {
      sample: dto.sample,
      redacted: 'Email [EMAIL]',
      rules_applied: ['email'],
    };
    platformErrorLogService.preview.mockResolvedValueOnce(response);

    await expect(controller.preview(dto)).resolves.toBe(response);

    expect(platformErrorLogService.preview).toHaveBeenCalledWith(dto);
  });

  it('deletes a redaction rule for the current platform user', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    platformErrorLogService.deleteRule.mockResolvedValueOnce(undefined);

    await expect(controller.deleteRule(id, ACTOR)).resolves.toBeUndefined();

    expect(platformErrorLogService.deleteRule).toHaveBeenCalledWith(id, ACTOR.sub);
  });
});
