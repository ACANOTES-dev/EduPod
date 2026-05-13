import * as React from 'react';

import { IfModuleEnabled } from './if-module-enabled';

jest.mock('@/hooks/use-module-enabled', () => ({
  useModuleEnabled: jest.fn(),
}));

const { useModuleEnabled } = jest.requireMock('@/hooks/use-module-enabled') as {
  useModuleEnabled: jest.Mock;
};

describe('IfModuleEnabled', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns children when the module is enabled', () => {
    useModuleEnabled.mockReturnValue(true);

    const result = IfModuleEnabled({
      module: 'pastoral',
      children: React.createElement('span', null, 'visible'),
    });

    expect(result).toEqual(React.createElement(React.Fragment, null, result.props.children));
    expect(result.props.children.props.children).toBe('visible');
  });

  it('returns fallback when the module is disabled', () => {
    useModuleEnabled.mockReturnValue(false);

    const result = IfModuleEnabled({
      module: 'pastoral',
      children: React.createElement('span', null, 'visible'),
      fallback: React.createElement('span', null, 'hidden'),
    });

    expect(result.props.children.props.children).toBe('hidden');
  });
});
