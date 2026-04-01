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

  const refetch = React.useCallback(async () => {
    if (!path || !enabled) {
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient<TResponse>(path, requestInit);
      const nextData = select ? select(response) : (response as unknown as TData);

      setData(nextData);
      onSuccess?.(nextData);
      return nextData;
    } catch (err) {
      const normalizedError = handleApiError(err, { fallbackMessage });
      setError(normalizedError);
      onError?.(normalizedError);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [enabled, fallbackMessage, onError, onSuccess, path, requestInit, select]);

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
