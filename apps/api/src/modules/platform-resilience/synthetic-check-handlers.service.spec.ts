import { resolveMx } from 'dns/promises';
import { connect as tlsConnect } from 'tls';

import { ConfigService } from '@nestjs/config';
import type { SyntheticCheckKind } from '@prisma/client';
import { Queue, QueueEvents } from 'bullmq';

import { SyntheticCheckHandlersService } from './synthetic-check-handlers.service';
import { SyntheticCredentialResolverService } from './synthetic-credential-resolver.service';

jest.mock('dns/promises', () => ({
  resolve4: jest.fn(),
  resolve6: jest.fn(),
  resolveCname: jest.fn(),
  resolveMx: jest.fn(),
  resolveTxt: jest.fn(),
}));

jest.mock('bullmq', () => ({
  Job: jest.fn(),
  Queue: jest.fn(),
  QueueEvents: jest.fn(),
}));

jest.mock('tls', () => ({
  connect: jest.fn(),
}));

const mockQueueAdd = jest.fn();
const mockQueueClose = jest.fn();
const mockQueueEventsClose = jest.fn();
const mockWaitUntilReady = jest.fn();
const mockWaitUntilFinished = jest.fn();
const mockTlsHandlers = new Map<string, (err?: Error) => void>();
const mockSocket = {
  destroy: jest.fn(),
  end: jest.fn(),
  getPeerCertificate: jest.fn(),
  on: jest.fn((event: string, handler: (err?: Error) => void) => {
    mockTlsHandlers.set(event, handler);
    return mockSocket;
  }),
};
const mockTlsConnect = jest.fn((_options: unknown, callback: () => void) => {
  setImmediate(callback);
  return mockSocket;
});

const ALL_KINDS: SyntheticCheckKind[] = [
  'http_get',
  'http_post',
  'websocket_handshake',
  'queue_canary',
  'notification_self_test',
  'dns_lookup',
  'tls_check',
  'external_dependency_status',
];

function buildHandlers() {
  const credentials = {
    resolveEnvKey: jest.fn((key: string) => `${key}-value`),
    resolveValue: jest.fn((value: unknown) => value),
  } as unknown as SyntheticCredentialResolverService;
  return new SyntheticCheckHandlersService(
    { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    credentials,
  );
}

function jsonResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, init);
}

describe('SyntheticCheckHandlersService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTlsHandlers.clear();
    global.fetch = jest.fn();
    mockQueueAdd.mockResolvedValue({ waitUntilFinished: mockWaitUntilFinished });
    mockQueueClose.mockResolvedValue(undefined);
    mockQueueEventsClose.mockResolvedValue(undefined);
    mockWaitUntilReady.mockResolvedValue(undefined);
    mockWaitUntilFinished.mockResolvedValue(undefined);
    jest.mocked(Queue).mockImplementation(
      () =>
        ({
          add: mockQueueAdd,
          close: mockQueueClose,
        }) as never,
    );
    jest.mocked(QueueEvents).mockImplementation(
      () =>
        ({
          close: mockQueueEventsClose,
          waitUntilReady: mockWaitUntilReady,
        }) as never,
    );
    jest.mocked(tlsConnect).mockImplementation(mockTlsConnect as never);
  });

  it('registers one deterministic handler for every synthetic check kind', () => {
    const handlers = buildHandlers();

    for (const kind of ALL_KINDS) {
      expect(handlers.get(kind).kind).toBe(kind);
    }
  });

  it('executes HTTP GET checks and returns response body metadata', async () => {
    const fetchMock = jest
      .mocked(global.fetch)
      .mockResolvedValue(jsonResponse('ready ok', { status: 200 }));
    const handlers = buildHandlers();

    const result = await handlers.get('http_get').execute({
      expected: { body_regex: 'ready', max_latency_ms: 5000, status_codes: [200] },
      target: { url: 'https://example.test/health' },
      timeout_ms: 1000,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/health',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toMatchObject({
      response_body: 'ready ok',
      response_status_code: 200,
      status: 'passed',
    });
  });

  it('executes HTTP POST checks with env-resolved bodies and logout cleanup', async () => {
    const fetchMock = jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(
        jsonResponse('logged in', {
          headers: { 'set-cookie': 'sid=abc' },
          status: 201,
        }),
      )
      .mockResolvedValueOnce(jsonResponse('', { status: 200 }));
    const handlers = buildHandlers();

    const result = await handlers.get('http_post').execute({
      expected: { logout_url: 'https://example.test/logout', status_codes: [201] },
      target: {
        body: { password: { env: 'SYNTHETIC_PASSWORD' } },
        url: 'https://example.test/login',
      },
      timeout_ms: 1000,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://example.test/login',
      expect.objectContaining({
        body: '{"password":{"env":"SYNTHETIC_PASSWORD"}}',
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.test/logout',
      expect.objectContaining({ headers: { Cookie: 'sid=abc' }, method: 'POST' }),
    );
    expect(result.status).toBe('passed');
  });

  it('marks HTTP checks failed when status or body expectations miss', async () => {
    jest.mocked(global.fetch).mockResolvedValue(jsonResponse('not ready', { status: 503 }));
    const handlers = buildHandlers();

    const result = await handlers.get('http_get').execute({
      expected: { body_regex: '^ready$', status_codes: [200] },
      target: { url: 'https://example.test/health' },
      timeout_ms: 1000,
    });

    expect(result.status).toBe('failed');
    expect(result.failure_detail).toEqual(
      expect.objectContaining({ body_regex_matched: false, status_code: 503 }),
    );
  });

  it('executes websocket handshake checks through the polling handshake endpoint', async () => {
    const fetchMock = jest
      .mocked(global.fetch)
      .mockResolvedValue(jsonResponse('0{"sid":"abc"}', { status: 200 }));
    const handlers = buildHandlers();

    const result = await handlers.get('websocket_handshake').execute({
      expected: { max_latency_ms: 5000 },
      target: { auth_env: { token: 'SYNTHETIC_WS_TOKEN' }, url: 'wss://example.test/platform' },
      timeout_ms: 1000,
    });

    expect(String(fetchMock.mock.calls[0][0])).toContain('/platform/socket.io/');
    expect(String(fetchMock.mock.calls[0][0])).toContain('token=SYNTHETIC_WS_TOKEN-value');
    expect(result.status).toBe('passed');
  });

  it('runs queue canaries on the dedicated synthetic queue', async () => {
    const handlers = buildHandlers();

    const result = await handlers.get('queue_canary').execute({
      expected: { max_latency_ms: 5000 },
      target: { queue_kind: 'synthetic_canary' },
      timeout_ms: 1000,
    });

    expect(mockQueueAdd).toHaveBeenCalledWith(
      'synthetic-canary:ping',
      expect.objectContaining({
        _synthetic: true,
        tenant_id: '00000000-0000-0000-0000-000000000000',
      }),
      expect.objectContaining({ removeOnComplete: 10 }),
    );
    expect(result.status).toBe('passed');
  });

  it('rejects critical queue canaries outside the allowlisted queues', async () => {
    const handlers = buildHandlers();

    const result = await handlers.get('queue_canary').execute({
      expected: {},
      target: { queue_kind: 'critical_queue_canary', queue_name: 'unknown' },
      timeout_ms: 1000,
    });

    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(result.status).toBe('failed');
  });

  it('executes resend notification self-tests through the configured sink', async () => {
    const fetchMock = jest
      .mocked(global.fetch)
      .mockResolvedValue(jsonResponse('{"id":"email-1"}', { status: 200 }));
    const handlers = buildHandlers();

    const result = await handlers.get('notification_self_test').execute({
      expected: {},
      target: { channel: 'resend', sink_env: 'SYNTHETIC_RESEND_SINK_EMAIL' },
      timeout_ms: 1000,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer RESEND_API_KEY-value' }),
      }),
    );
    expect(result.status).toBe('passed');
  });

  it('returns degraded for configured non-resend notification self-tests', async () => {
    const handlers = buildHandlers();

    const result = await handlers.get('notification_self_test').execute({
      expected: {},
      target: { channel: 'twilio_sms', sink_env: 'SYNTHETIC_SMS_SINK' },
      timeout_ms: 1000,
    });

    expect(result.status).toBe('degraded');
    expect(result.failure_detail).toEqual(
      expect.objectContaining({ message: expect.stringContaining('not enabled in 5A') }),
    );
  });

  it('executes DNS lookup checks with the selected record type', async () => {
    jest.mocked(resolveMx).mockResolvedValue([{ exchange: 'mail.example.test', priority: 10 }]);
    const handlers = buildHandlers();

    const result = await handlers.get('dns_lookup').execute({
      expected: { record_count_min: 1 },
      target: { hostname: 'example.test', record_type: 'MX' },
      timeout_ms: 1000,
    });

    expect(resolveMx).toHaveBeenCalledWith('example.test');
    expect(result).toMatchObject({ response_body: '["10 mail.example.test"]', status: 'passed' });
  });

  it('executes TLS checks and reports certificate metadata', async () => {
    mockSocket.getPeerCertificate.mockReturnValue({
      issuer: { CN: 'issuer' },
      subject: { CN: 'example.test' },
      valid_from: 'Jan 01 00:00:00 2026 GMT',
      valid_to: 'Jan 01 00:00:00 2027 GMT',
    });
    const handlers = buildHandlers();

    const result = await handlers.get('tls_check').execute({
      expected: { critical_days: 3, warning_days: 14 },
      target: { hostname: 'example.test', port: 443 },
      timeout_ms: 1000,
    });

    expect(mockTlsConnect).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'example.test', servername: 'example.test' }),
      expect.any(Function),
    );
    expect(result.certificate).toEqual(
      expect.objectContaining({ check_status: 'ok', hostname: 'example.test' }),
    );
  });

  it('normalizes external dependency statuspage responses', async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValue(jsonResponse('{"status":{"indicator":"minor"}}', { status: 200 }));
    const handlers = buildHandlers();

    const result = await handlers.get('external_dependency_status').execute({
      expected: { operational_indicators: ['operational'] },
      target: {
        display_name: 'Provider',
        provider_key: 'provider',
        source: 'statuspage',
        url: 'https://status.example.test/api/v2/status.json',
      },
      timeout_ms: 1000,
    });

    expect(result.status).toBe('failed');
    expect(result.external_dependency).toEqual(
      expect.objectContaining({ provider_key: 'provider', status: 'minor' }),
    );
  });
});
