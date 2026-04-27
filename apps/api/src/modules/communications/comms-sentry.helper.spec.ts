/* eslint-disable import/order -- jest.mock must precede mocked imports */
jest.mock('@sentry/nestjs', () => {
  const setTag = jest.fn();
  return {
    __esModule: true,
    setTag,
    withScope: jest.fn((fn: (scope: { setTag: typeof setTag }) => unknown) => fn({ setTag })),
    captureException: jest.fn(),
  };
});

import * as Sentry from '@sentry/nestjs';

import { withCommsContext, withCommsContextSync } from './comms-sentry.helper';

describe('withCommsContext', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets the comms tags on success and returns the value', async () => {
    const result = await withCommsContext(
      {
        tenant_id: 'T1',
        channel: 'email',
        template_key: 'k',
        notification_id: 'N1',
      },
      async () => 'ok',
    );
    expect(result).toBe('ok');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('captures + re-throws on error', async () => {
    const err = new Error('boom');
    await expect(
      withCommsContext({ tenant_id: 'T1' }, async () => {
        throw err;
      }),
    ).rejects.toBe(err);
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it('synchronous variant captures + re-throws', () => {
    const err = new Error('sync-boom');
    expect(() =>
      withCommsContextSync({ tenant_id: 'T1' }, () => {
        throw err;
      }),
    ).toThrow(err);
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });
});
