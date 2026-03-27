import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { BLOCK_IMPERSONATION_KEY } from '../decorators/block-impersonation.decorator';

import { BlockImpersonationGuard } from './block-impersonation.guard';

function makeGuardAndContext(
  currentUser: Record<string, unknown> | undefined,
  metadataValue: boolean | undefined,
): { guard: BlockImpersonationGuard; context: ExecutionContext } {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
    if (key === BLOCK_IMPERSONATION_KEY) return metadataValue;
    return undefined;
  });

  const request: Record<string, unknown> = { currentUser };

  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  const guard = new BlockImpersonationGuard(reflector);

  return { guard, context };
}

describe('BlockImpersonationGuard', () => {
  it('should throw ForbiddenException when impersonating is true', () => {
    const { guard, context } = makeGuardAndContext({ impersonating: true }, true);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);

    try {
      guard.canActivate(context);
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const response = (e as ForbiddenException).getResponse() as {
        error: { code: string; message: string };
      };
      expect(response.error.code).toBe('IMPERSONATION_BLOCKED');
      expect(response.error.message).toBe(
        'This endpoint cannot be accessed during impersonation.',
      );
    }
  });

  it('should allow when impersonating is false', () => {
    const { guard, context } = makeGuardAndContext({ impersonating: false }, true);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow when impersonating is absent', () => {
    const { guard, context } = makeGuardAndContext({}, true);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow when currentUser is undefined', () => {
    const { guard, context } = makeGuardAndContext(undefined, true);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow when no decorator metadata is set', () => {
    const { guard, context } = makeGuardAndContext({ impersonating: true }, undefined);

    expect(guard.canActivate(context)).toBe(true);
  });
});
