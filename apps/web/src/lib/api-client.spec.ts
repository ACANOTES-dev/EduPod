import { apiClient } from './api-client';

describe('apiClient — autoUnwrap behaviour', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('unwraps { data: T } envelope for singleton responses', async () => {
    const mockData = { id: 'x', status: 'open' };
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: mockData }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await apiClient<{ id: string; status: string }>('/test');
    expect(result).toEqual(mockData);
  });

  it('passes through { data, meta } paginated envelope unchanged', async () => {
    const envelope = {
      data: [1, 2, 3],
      meta: { page: 1, pageSize: 20, total: 100 },
    };
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(envelope), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await apiClient<typeof envelope>('/test');
    expect(result).toEqual(envelope);
  });

  it('passes through raw arrays without unwrapping', async () => {
    const arrayData = [1, 2, 3];
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(arrayData), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await apiClient<number[]>('/test');
    expect(result).toEqual(arrayData);
  });

  it('passes through error envelopes unchanged (single-key but not data)', async () => {
    const errorEnvelope = { error: { code: 'NOT_FOUND', message: 'Resource not found' } };
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(errorEnvelope), {
          status: 200, // Note: testing the shape, not the status
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await apiClient<typeof errorEnvelope>('/test');
    expect(result).toEqual(errorEnvelope);
  });

  it('preserves { data: null } envelope without unwrapping null', async () => {
    const nullEnvelope = { data: null };
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(nullEnvelope), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await apiClient<typeof nullEnvelope>('/test');
    expect(result).toEqual(nullEnvelope);
  });

  it('passes through objects without data key unchanged', async () => {
    const plainObject = { id: 'x', name: 'Test' };
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(plainObject), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await apiClient<typeof plainObject>('/test');
    expect(result).toEqual(plainObject);
  });

  it('returns undefined for 204 No Content', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        // 204/205 responses must have a null body per the Fetch spec; passing
        // an empty string throws in Node's undici implementation.
        new Response(null, {
          status: 204,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await apiClient('/test');
    expect(result).toBeUndefined();
  });

  it('returns undefined for 205 Reset Content', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(null, {
          status: 205,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await apiClient('/test');
    expect(result).toBeUndefined();
  });

  it('returns undefined for zero content-length', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response('', {
          status: 200,
          headers: { 'content-type': 'application/json', 'content-length': '0' },
        }),
      ),
    );

    const result = await apiClient('/test');
    expect(result).toBeUndefined();
  });

  // ─── Backward-compat .data getter shim ───────────────────────────────────
  // The shim lets legacy callsites typed as apiClient<{ data: T }> keep
  // accessing response.data.field while new callsites typed as apiClient<T>
  // access response.field directly.

  it('exposes a non-enumerable .data getter on stripped object responses', async () => {
    const inner = { id: 'x', status: 'open', name: 'Foo' };
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: inner }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await apiClient<{ id: string; status: string; name: string }>('/test');

    // New access pattern works: result.field returns the value directly.
    expect(result.id).toBe('x');
    expect(result.status).toBe('open');
    expect(result.name).toBe('Foo');

    // Legacy access pattern works via the shim: result.data points back to result.
    const legacy = result as unknown as { data: { id: string; status: string; name: string } };
    expect(legacy.data).toBe(result);
    expect(legacy.data.id).toBe('x');
    expect(legacy.data.status).toBe('open');

    // The shim is non-enumerable: JSON.stringify, Object.keys, and spread
    // operators all see the original shape without a `data` key.
    expect(Object.keys(result)).toEqual(['id', 'status', 'name']);
    expect(JSON.parse(JSON.stringify(result))).toEqual(inner);
  });

  it('exposes a non-enumerable .data getter on stripped array responses', async () => {
    // Endpoints like /api/v1/year-groups that return a bare array are wrapped
    // by the interceptor into `{ data: [...] }`. After autoUnwrap the caller
    // gets the array directly, BUT legacy code typed as `apiClient<{ data:
    // T[] }>` and reading `res.data.map(...)` continues to work via the shim.
    const items = [
      { id: 'y1', name: 'Year 1' },
      { id: 'y2', name: 'Year 2' },
    ];
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: items }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await apiClient<Array<{ id: string; name: string }>>('/test');

    // New access pattern — array methods work directly.
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result.map((x) => x.id)).toEqual(['y1', 'y2']);

    // Legacy access pattern — res.data points back to result.
    const legacy = result as unknown as { data: Array<{ id: string; name: string }> };
    expect(legacy.data).toBe(result);
    expect(legacy.data.map((x) => x.id)).toEqual(['y1', 'y2']);
    expect(legacy.data.length).toBe(2);

    // Spread / serialization of the array doesn't include a `data` key.
    expect([...result]).toEqual(items);
    expect(JSON.parse(JSON.stringify(result))).toEqual(items);
  });

  it('does not shim when inner already has its own data field', async () => {
    // Nested { data: { data: ... } } — the inner's own data field wins,
    // matching historical wrapped-envelope behaviour.
    const nested = { data: 'inner-payload' };
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: nested }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await apiClient<{ data: string }>('/test');
    expect(result.data).toBe('inner-payload');
  });
});
