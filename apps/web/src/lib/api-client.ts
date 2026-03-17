const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

export async function apiClient<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth = false, headers: customHeaders, ...rest } = options;

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
        const error = await retryResponse.json().catch(() => ({ error: { code: 'UNKNOWN', message: 'Request failed after token refresh' } }));
        throw error;
      }
      return retryResponse.json() as Promise<T>;
    }
  }

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: { code: 'UNKNOWN', message: 'Unknown error' } }));
    throw error;
  }

  return response.json() as Promise<T>;
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
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
