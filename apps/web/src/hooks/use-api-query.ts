'use client';

import * as React from 'react';

import { apiClient } from '@/lib/api-client';
import { handleApiError, type ApiErrorPayload } from '@/lib/handle-api-error';

interface ApiRequestOptions extends RequestInit {
  skipAuth?: boolean;
  silent?: boolean;
}

interface UseApiQueryOptions<TResponse, TData> {
  enabled?: boolean;
  fallbackMessage?: string;
  initialData?: TData | null;
  onError?: (error: ApiErrorPayload) => void;
  onSuccess?: (data: TData) => void;
  requestInit?: ApiRequestOptions;
  select?: (response: TResponse) => TData;
}

interface UseApiQueryResult<TData> {
  data: TData | null;
  error: ApiErrorPayload | null;
  isLoading: boolean;
  refetch: () => Promise<TData | null>;
  setData: React.Dispatch<React.SetStateAction<TData | null>>;
  setError: React.Dispatch<React.SetStateAction<ApiErrorPayload | null>>;
}

export function useApiQuery<TResponse, TData = TResponse>(
  path: string | null,
  options: UseApiQueryOptions<TResponse, TData> = {},
): UseApiQueryResult<TData> {
  const {
    enabled = true,
    fallbackMessage,
    initialData = null,
    onError,
    onSuccess,
    requestInit,
    select,
  } = options;

  const [data, setData] = React.useState<TData | null>(initialData);
  const [error, setError] = React.useState<ApiErrorPayload | null>(null);
  const [isLoading, setIsLoading] = React.useState(enabled && !!path && initialData === null);
  const latestOptionsRef = React.useRef({
    fallbackMessage,
    onError,
    onSuccess,
    requestInit,
    select,
  });

  // Keep the latest options available to refetch() without letting inline
  // callbacks or request objects retrigger the auto-fetch effect on every render.
  latestOptionsRef.current = {
    fallbackMessage,
    onError,
    onSuccess,
    requestInit,
    select,
  };

  const refetch = React.useCallback(async () => {
    if (!path || !enabled) {
      setIsLoading(false);
      return null;
    }

    const {
      fallbackMessage: latestFallbackMessage,
      onError: latestOnError,
      onSuccess: latestOnSuccess,
      requestInit: latestRequestInit,
      select: latestSelect,
    } = latestOptionsRef.current;

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient<TResponse>(path, latestRequestInit);
      const nextData = latestSelect ? latestSelect(response) : (response as unknown as TData);

      setData(nextData);
      latestOnSuccess?.(nextData);
      return nextData;
    } catch (err) {
      const normalizedError = handleApiError(err, { fallbackMessage: latestFallbackMessage });
      setError(normalizedError);
      latestOnError?.(normalizedError);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [enabled, path]);

  React.useEffect(() => {
    if (!enabled || !path) {
      setIsLoading(false);
      return;
    }

    void refetch();
  }, [enabled, path, refetch]);

  return {
    data,
    error,
    isLoading,
    refetch,
    setData,
    setError,
  };
}
