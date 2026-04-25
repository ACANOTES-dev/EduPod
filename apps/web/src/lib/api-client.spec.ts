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
        new Response('', {
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
        new Response('', {
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
});
