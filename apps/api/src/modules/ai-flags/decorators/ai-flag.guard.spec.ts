import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AiFlagsService } from '../ai-flags.service';

import { AiFlagGuard } from './ai-flag.guard';
import { REQUIRES_AI_FLAG_KEY } from './requires-ai-flag.decorator';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

function buildContext(tenantId: string | undefined): ExecutionContext {
  const request = { tenantContext: tenantId ? { tenant_id: tenantId } : null };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({}) as never,
    switchToWs: () => ({}) as never,
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

describe('AiFlagGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let aiFlags: jest.Mocked<AiFlagsService>;
  let guard: AiFlagGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    aiFlags = {
      isEnabled: jest.fn(),
    } as unknown as jest.Mocked<AiFlagsService>;
    guard = new AiFlagGuard(reflector, aiFlags);
  });

  afterEach(() => jest.clearAllMocks());

  it('allows routes without the @RequiresAiFlag decorator', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ok = await guard.canActivate(buildContext(TENANT_ID));
    expect(ok).toBe(true);
    expect(aiFlags.isEnabled).not.toHaveBeenCalled();
  });

  it('throws TENANT_REQUIRED when tenant context is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue('behaviour');
    await expect(guard.canActivate(buildContext(undefined))).rejects.toMatchObject({
      response: { code: 'TENANT_REQUIRED' },
    });
    expect(aiFlags.isEnabled).not.toHaveBeenCalled();
  });

  it('throws AI_DISABLED when the flag is off', async () => {
    reflector.getAllAndOverride.mockReturnValue('behaviour');
    aiFlags.isEnabled.mockResolvedValue(false);
    await expect(guard.canActivate(buildContext(TENANT_ID))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(guard.canActivate(buildContext(TENANT_ID))).rejects.toMatchObject({
      response: { code: 'AI_DISABLED' },
    });
    expect(aiFlags.isEnabled).toHaveBeenCalledWith(TENANT_ID, 'behaviour');
  });

  it('passes when the flag is on', async () => {
    reflector.getAllAndOverride.mockReturnValue('pastoral');
    aiFlags.isEnabled.mockResolvedValue(true);
    const ok = await guard.canActivate(buildContext(TENANT_ID));
    expect(ok).toBe(true);
    expect(aiFlags.isEnabled).toHaveBeenCalledWith(TENANT_ID, 'pastoral');
  });

  it('uses REQUIRES_AI_FLAG_KEY when reading metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue('behaviour');
    aiFlags.isEnabled.mockResolvedValue(true);
    await guard.canActivate(buildContext(TENANT_ID));
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      REQUIRES_AI_FLAG_KEY,
      expect.anything(),
    );
  });
});
