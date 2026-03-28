const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

/** Global error listener — set by the app to show toasts on API failures. */
export interface ApiErrorPayload {
  code: string;
  message: string;
  redirect?: string;
  status: number;
}

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
        const error = await retryResponse
          .json()
          .catch(() => ({
            error: { code: 'UNKNOWN', message: 'Request failed after token refresh' },
          }));
        throw error;
      }
      return parseResponse<T>(retryResponse);
    }
  }

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: { code: 'UNKNOWN', message: 'Unknown error' } }));
    if (!silent && onApiError && response.status !== 401) {
      onApiError({
        code: error?.error?.code ?? 'UNKNOWN',
        message: error?.error?.message ?? `Request failed (${response.status})`,
        redirect: error?.error?.redirect,
        status: response.status,
      });
    }
    throw error;
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
  } catch {
    return false;
  }
}
