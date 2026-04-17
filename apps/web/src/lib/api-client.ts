import { handleApiError, type ApiErrorPayload } from './handle-api-error';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

let onApiError: ((error: ApiErrorPayload) => void) | null = null;

export function setApiErrorHandler(handler: ((error: ApiErrorPayload) => void) | null) {
  onApiError = handler;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Unwrap a response envelope. The API's ResponseTransformInterceptor wraps
 * every successful response in `{ data: T }`. Callers that expect a single
 * payload (not a paginated list) can pipe the apiClient result through this
 * helper to get the inner object, while still tolerating legacy un-wrapped
 * responses for forward-compat.
 */
export function unwrap<T>(value: { data: T } | T): T {
  if (value && typeof value === 'object' && 'data' in (value as object)) {
    const inner = (value as { data: T }).data;
    if (inner !== undefined && inner !== null) return inner;
  }
  return value as T;
}

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
  /** If true, suppress the global error toast. Callers handle the error themselves. */
  silent?: boolean;
}

export async function apiClient<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth = false, silent = false, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  if (!skipAuth && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && !skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      const retryResponse = await fetch(`${API_URL}${path}`, {
        ...rest,
        headers,
        credentials: 'include',
      });
      if (!retryResponse.ok) {
        const error = await retryResponse.json().catch(() => null);
        throw (
          error ??
          handleApiError(null, {
            fallbackMessage: 'Request failed after token refresh',
            status: retryResponse.status,
          })
        );
      }
      return parseResponse<T>(retryResponse);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const normalizedError = handleApiError(error, {
      fallbackMessage: `Request failed (${response.status})`,
      status: response.status,
    });

    if (!silent && onApiError && response.status !== 401) {
      onApiError(normalizedError);
    }

    throw error ?? normalizedError;
  }

  return parseResponse<T>(response);
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  if (response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/**
 * Trigger an eager token refresh. Callers that run long-lived polling
 * loops (e.g. the solver-progress-provider during a 60-minute solve)
 * call this on a timer so the access token is rotated BEFORE it
 * expires rather than after a 401 round-trip. Returns true when the
 * new token was installed; false on any refresh error (the next
 * 401-driven retry will try again).
 *
 * Use this over ``apiClient`` when you want to pre-emptively rotate
 * without issuing an API call — unauthenticated refresh success does
 * not consume a request budget against any business endpoint and
 * avoids the transient "Failed to load resource: 401" entries that
 * show up in devtools when the passive refresh fires mid-poll.
 */
export async function refreshAuthToken(): Promise<boolean> {
  return refreshAccessToken();
}

async function doRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (response.ok) {
      const data = await response.json();
      accessToken = data.data?.access_token || null;
      return !!accessToken;
    }
    return false;
  } catch (err) {
    console.error('[apiClient.doRefresh]', err);
    return false;
  }
}
