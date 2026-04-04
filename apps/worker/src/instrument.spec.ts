/* eslint-disable import/order -- jest.mock must precede mocked imports */

const mockInit = jest.fn();

jest.mock('@sentry/nestjs', () => ({
  init: mockInit,
}));

describe('Worker Instrumentation', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  function loadInstrument(): void {
    jest.isolateModules(() => {
      jest.mock('@sentry/nestjs', () => ({
        init: mockInit,
      }));
      require('./instrument');
    });
  }

  it('should initialize Sentry with correct config', () => {
    loadInstrument();

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        serverName: 'worker',
        sendDefaultPii: false,
      }),
    );
  });

  it('should include environment and release tags', () => {
    loadInstrument();

    const initCall = mockInit.mock.calls[0][0] as Record<string, unknown>;
    expect(initCall).toHaveProperty('environment');
    expect(initCall).toHaveProperty('release');
  });

  it('should redact PII keys in beforeSend', () => {
    loadInstrument();

    const initCall = mockInit.mock.calls[0][0] as Record<string, unknown>;
    const beforeSend = initCall.beforeSend as (
      event: Record<string, unknown>,
    ) => Record<string, unknown>;

    const event = {
      extra: {
        student_name: 'Alice',
        request_id: '123',
        parent_email: 'parent@test.com',
      } as Record<string, unknown>,
    };

    const result = beforeSend(event);
    const extra = result.extra as Record<string, unknown>;

    expect(extra.student_name).toBe('[REDACTED]');
    expect(extra.parent_email).toBe('[REDACTED]');
    expect(extra.request_id).toBe('123');
  });

  it('should strip UUIDs in beforeSendTransaction', () => {
    loadInstrument();

    const initCall = mockInit.mock.calls[0][0] as Record<string, unknown>;
    const beforeSendTransaction = initCall.beforeSendTransaction as (
      event: { transaction?: string },
    ) => { transaction?: string };

    const event = {
      transaction:
        'GET /api/v1/students/550e8400-e29b-41d4-a716-446655440000',
    };

    const result = beforeSendTransaction(event);
    expect(result.transaction).toBe('GET /api/v1/students/:id');
  });

  it('should strip UUIDs in breadcrumb URLs via beforeSend', () => {
    loadInstrument();

    const initCall = mockInit.mock.calls[0][0] as Record<string, unknown>;
    const beforeSend = initCall.beforeSend as (
      event: Record<string, unknown>,
    ) => Record<string, unknown>;

    const event = {
      breadcrumbs: [
        {
          data: {
            url: '/api/v1/students/550e8400-e29b-41d4-a716-446655440000/grades',
          },
        },
      ],
    };

    const result = beforeSend(event);
    const breadcrumbs = result.breadcrumbs as Array<{
      data?: { url?: string };
    }>;
    const first = breadcrumbs[0];
    expect(first).toBeDefined();
    expect(first?.data?.url).toBe('/api/v1/students/:id/grades');
  });
});
