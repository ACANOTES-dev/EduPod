const mockCaptureException = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: mockCaptureException,
}));

import { onMissingMessage } from '../../i18n/error-handler';

describe('onMissingMessage', () => {
  const originalEnv = process.env.NODE_ENV;

  function setNodeEnv(value: string | undefined): void {
    Object.defineProperty(process.env, 'NODE_ENV', {
      configurable: true,
      value,
      writable: true,
    });
  }

  afterEach(() => {
    mockCaptureException.mockClear();
    setNodeEnv(originalEnv);
  });

  it('throws synchronously in development', () => {
    setNodeEnv('development');

    expect(() => {
      onMissingMessage(new Error('MISSING_MESSAGE: parent.dashboard.heading is missing'));
    }).toThrow(/MISSING_MESSAGE/);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('reports to Sentry then throws in production', () => {
    setNodeEnv('production');
    const error = new Error('MISSING_MESSAGE: parent.dashboard.heading is missing');

    expect(() => {
      onMissingMessage(error);
    }).toThrow(/MISSING_MESSAGE/);
    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });
});
