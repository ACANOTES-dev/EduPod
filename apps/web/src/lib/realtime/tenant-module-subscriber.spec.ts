import * as React from 'react';

import { TenantModuleSubscriber } from './tenant-module-subscriber';

jest.mock('react', () => ({
  ...jest.requireActual<typeof React>('react'),
  useEffect: jest.fn((effect: React.EffectCallback) => effect()),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: jest.fn(),
}));

const { useAuth } = jest.requireMock('@/providers/auth-provider') as {
  useAuth: jest.Mock;
};

describe('TenantModuleSubscriber', () => {
  const refreshUser = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('polls /me for authenticated tenant sessions', () => {
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
    setIntervalSpy.mockImplementation((handler: TimerHandler) => {
      if (typeof handler === 'function') {
        handler();
      }
      return 42 as unknown as NodeJS.Timeout;
    });
    useAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      refreshUser,
      user: {
        memberships: [
          {
            tenant_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            membership_status: 'active',
          },
        ],
      },
    });

    expect(TenantModuleSubscriber()).toBeNull();

    expect(React.useEffect).toHaveBeenCalled();
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(refreshUser).toHaveBeenCalled();

    setIntervalSpy.mockRestore();
  });

  it('does not poll before authentication resolves', () => {
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval');
    useAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      refreshUser,
      user: null,
    });

    TenantModuleSubscriber();

    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(clearIntervalSpy).not.toHaveBeenCalled();

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
