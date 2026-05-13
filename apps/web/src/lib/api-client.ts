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
        return handleErrorResponse<T>(retryResponse, {
          fallbackMessage: 'Request failed after token refresh',
          silent,
        });
      }
      return parseResponse<T>(retryResponse);
    }
  }

  if (!response.ok) {
    return handleErrorResponse<T>(response, {
      fallbackMessage: `Request failed (${response.status})`,
      silent,
    });
  }

  return parseResponse<T>(response);
}

async function handleErrorResponse<T>(
  response: Response,
  options: { fallbackMessage: string; silent: boolean },
): Promise<T> {
  const error = await response.json().catch(() => null);
  const normalizedError = handleApiError(error, {
    fallbackMessage: options.fallbackMessage,
    status: response.status,
  });

  if (response.status === 404 && normalizedError.code === 'MODULE_DISABLED') {
    if (!options.silent && onApiError) {
      onApiError(normalizedError);
    }
    redirectToDisabledModule(normalizedError.module);
    return new Promise<T>(() => {});
  }

  if (!options.silent && onApiError && response.status !== 401) {
    onApiError(normalizedError);
  }

  throw error ?? normalizedError;
}

function redirectToDisabledModule(moduleKey: string | undefined): void {
  if (typeof window === 'undefined') {
    return;
  }

  const segments = window.location.pathname.split('/').filter(Boolean);
  const locale = segments[0] ?? 'en';
  const pathWithoutLocale = '/' + segments.slice(1).join('/');
  if (pathWithoutLocale === '/disabled') {
    return;
  }

  window.location.href = `/${locale}/disabled?module=${encodeURIComponent(moduleKey ?? 'unknown')}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  if (response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  const body = (await response.json()) as unknown;
  return autoUnwrap<T>(body);
}

/**
 * Strip the API's `{ data: T }` response envelope when the body is a plain
 * single-key object whose only key is literally `data`. Pass-through for:
 *   - paginated responses ({ data, meta })
 *   - error envelopes ({ error: { code, message } })
 *   - raw arrays
 *   - already-unwrapped scalars or objects without a `data` key
 *   - { data: null } / { data: undefined } envelopes (endpoints that signal
 *     "found no record" by returning a null inner)
 *
 * The pass-through behaviour is critical because the existing `unwrap()` helper
 * (exported above) is idempotent on already-unwrapped values, so any callsite
 * that defensively chained `unwrap(await apiClient(...))` continues to behave
 * correctly after this change.
 *
 * Backward-compat shim: when the inner value is a plain object, we expose a
 * non-enumerable `.data` getter on it that returns the object itself. This
 * allows legacy callsites typed as `apiClient<{ data: T }>` and accessing
 * `response.data.field` to keep working — `response.data` returns the inner
 * object via the getter, and `.field` is then the real value. The getter is
 * non-enumerable so JSON.stringify, Object.keys, for-in, and spread operators
 * skip it, leaving the object's serialized shape unchanged. New callsites
 * typed as `apiClient<T>` get direct field access (`response.field`) without
 * any wrapper. The shim is intentionally a transitional behaviour that lets
 * the legacy and new patterns coexist while individual callsites migrate.
 */
function autoUnwrap<T>(body: unknown): T {
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const keys = Object.keys(body as object);
    if (keys.length === 1 && keys[0] === 'data') {
      const inner = (body as { data: unknown }).data;
      // null / undefined `data` envelopes are returned as-is so legacy code
      // that does `if (response.data)` keeps treating "no record" the same
      // way it always has.
      if (inner === undefined || inner === null) {
        return body as T;
      }
      if (typeof inner === 'object') {
        // Both plain objects and arrays get the back-compat shim. Arrays are
        // covered because endpoints like `/api/v1/year-groups` return a bare
        // array which the interceptor wraps into `{ data: [...] }`. Legacy
        // callers typed as `apiClient<{ data: YearGroup[] }>` expect to read
        // `res.data.map(...)` and we keep that working without touching the
        // call site.
        const innerObj = inner as Record<string, unknown>;
        // If the inner already carries its own `data` field (e.g. nested
        // `{ data: { data: ... } }`), do NOT shim — the inner's own field
        // wins and behaviour matches the historical wrapped path.
        if (!Object.prototype.hasOwnProperty.call(innerObj, 'data')) {
          Object.defineProperty(innerObj, 'data', {
            get() {
              return innerObj;
            },
            configurable: true,
            enumerable: false,
          });
        }
        return innerObj as T;
      }
      // Inner is a primitive (number / string / boolean) — primitives can't
      // carry a `.data` getter, so strip without a shim. The very small set
      // of call sites that hit primitive-returning endpoints (e.g.
      // notifications/unread-count) need to drop the `{ data: ... }` from
      // their type and read the value directly.
      return inner as T;
    }
  }
  return body as T;
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
