import { runVerify, type VerifyDeps } from './verify-tenant-communications-configs';

function makeFetchMock(
  responder: (url: string, init?: RequestInit) => { ok: boolean; status?: number; body: unknown },
): jest.Mock {
  return jest.fn(async (url: string, init?: RequestInit) => {
    const result = responder(url, init);
    return {
      ok: result.ok,
      status: result.status ?? (result.ok ? 200 : 400),
      json: async () => result.body,
    } as Response;
  });
}

const RECIPIENT = { email: 'dev@example.test', phone: '+15551234567' };

describe('runVerify', () => {
  let originalLog: typeof console.log;
  let originalErr: typeof console.error;

  beforeEach(() => {
    originalLog = console.log;
    originalErr = console.error;
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalErr;
  });

  it('reports 15 successes when every channel succeeds', async () => {
    const fetchMock = makeFetchMock((url) => {
      if (url.endsWith('/auth/login')) {
        return { ok: true, body: { access_token: 'token-fixture' } };
      }
      return { ok: true, body: { success: true, provider_message_id: 'msg_xyz' } };
    });
    const deps: VerifyDeps = { fetch: fetchMock as unknown as typeof fetch, apiBase: 'http://api' };

    const summary = await runVerify(deps, RECIPIENT);

    expect(summary.attempted).toBe(15);
    expect(summary.succeeded).toBe(15);
    expect(summary.failed).toBe(0);
  });

  it('skips a tenant when login fails and continues with the rest', async () => {
    const fetchMock = makeFetchMock((url) => {
      if (url.endsWith('/auth/login')) {
        // Fail login for stress-c only
        const isStressC = (fetchMock.mock.calls.at(-1)?.[1] as RequestInit | undefined)?.body
          ?.toString()
          .includes('owner@stress-c.test');
        if (isStressC) return { ok: false, status: 401, body: {} };
        return { ok: true, body: { access_token: 'token-fixture' } };
      }
      return { ok: true, body: { success: true, provider_message_id: 'msg_xyz' } };
    });
    const deps: VerifyDeps = { fetch: fetchMock as unknown as typeof fetch, apiBase: 'http://api' };

    const summary = await runVerify(deps, RECIPIENT);

    // 4 tenants × 3 channels = 12 results (stress-c skipped)
    expect(summary.attempted).toBe(12);
    expect(summary.succeeded).toBe(12);
  });

  it('counts provider failures separately from successes', async () => {
    const fetchMock = makeFetchMock((url) => {
      if (url.endsWith('/auth/login')) {
        return { ok: true, body: { access_token: 'token-fixture' } };
      }
      // WhatsApp always fails (the dev shortcut HX_DEV_VERIFY scenario)
      if (url.includes('/whatsapp-config/test')) {
        return {
          ok: true,
          body: { success: false, provider_error: 'Template HX_DEV_VERIFY not found' },
        };
      }
      return { ok: true, body: { success: true, provider_message_id: 'msg_xyz' } };
    });
    const deps: VerifyDeps = { fetch: fetchMock as unknown as typeof fetch, apiBase: 'http://api' };

    const summary = await runVerify(deps, RECIPIENT);

    expect(summary.attempted).toBe(15);
    expect(summary.succeeded).toBe(10); // email + sms succeed
    expect(summary.failed).toBe(5); // whatsapp × 5 fail
  });

  it('extracts access token from {data: {accessToken}} response shape', async () => {
    const fetchMock = makeFetchMock((url) => {
      if (url.endsWith('/auth/login')) {
        return { ok: true, body: { data: { accessToken: 'nested-token' } } };
      }
      return { ok: true, body: { success: true } };
    });
    const deps: VerifyDeps = { fetch: fetchMock as unknown as typeof fetch, apiBase: 'http://api' };

    const summary = await runVerify(deps, RECIPIENT);
    expect(summary.attempted).toBe(15);
  });
});
