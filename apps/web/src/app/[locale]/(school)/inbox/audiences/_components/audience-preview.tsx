'use client';

import { Loader2, RefreshCw, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { AudienceDefinition } from '@school/shared/inbox';
import { Badge, Button } from '@school/ui';

import { apiClient, unwrap } from '@/lib/api-client';

import type { AudiencePreviewResult } from './types';

interface AudiencePreviewProps {
  definition?: AudienceDefinition | null;
  staticUserIds?: string[];
  debounceMs?: number;
}

interface PreviewState {
  isLoading: boolean;
  error: string | null;
  data: AudiencePreviewResult | null;
}

export function AudiencePreview({
  definition,
  staticUserIds,
  debounceMs = 400,
}: AudiencePreviewProps) {
  const t = useTranslations('inbox.audiences.preview');
  const [state, setState] = React.useState<PreviewState>({
    isLoading: false,
    error: null,
    data: null,
  });
  const [refreshToken, setRefreshToken] = React.useState(0);

  const isStatic = !!staticUserIds;
  const definitionJson = React.useMemo(
    () => (definition ? JSON.stringify(definition) : null),
    [definition],
  );

  React.useEffect(() => {
    if (isStatic) {
      setState({
        isLoading: false,
        error: null,
        data: {
          count: staticUserIds?.length ?? 0,
          sample: [],
        },
      });
      return;
    }

    if (!definitionJson) {
      setState({ isLoading: false, error: null, data: null });
      return;
    }

    let cancelled = false;
    const handle = setTimeout(async () => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const res = await apiClient<AudiencePreviewResult | { data: AudiencePreviewResult }>(
          '/api/v1/inbox/audiences/preview',
          {
            method: 'POST',
            body: JSON.stringify({ definition: JSON.parse(definitionJson) }),
            silent: true,
          },
        );
        if (cancelled) return;
        const payload = unwrap<AudiencePreviewResult>(res);
        setState({ isLoading: false, error: null, data: payload });
      } catch (err) {
        if (cancelled) return;
        console.error('[AudiencePreview]', err);
        const message =
          (err as { message?: string; error?: { message?: string } })?.error?.message ??
          (err as { message?: string })?.message ??
          t('error');
        setState({ isLoading: false, error: message, data: null });
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [definitionJson, isStatic, staticUserIds, debounceMs, refreshToken, t]);

  const refresh = () => setRefreshToken((x) => x + 1);

  return (
    <div className="rounded-lg border border-border bg-surface-secondary p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-text-secondary" aria-hidden="true" />
          <p className="text-sm font-medium text-text-primary">{t('title')}</p>
        </div>
        {!isStatic && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={state.isLoading || !definitionJson}
          >
            <RefreshCw
              className={`me-1.5 h-3.5 w-3.5 ${state.isLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {t('refresh')}
          </Button>
        )}
      </div>

      <div className="mt-3">
        {state.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loading')}
          </div>
        ) : state.error ? (
          <p className="text-sm text-danger-text">{state.error}</p>
        ) : state.data ? (
          <div className="space-y-2">
            <p className="text-2xl font-semibold text-text-primary">
              {state.data.count.toLocaleString()}
            </p>
            <p className="text-xs text-text-secondary">
              {t('recipients', { count: state.data.count })}
            </p>
            {state.data.sample.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-2">
                {state.data.sample.map((entry) => (
                  <Badge key={entry.user_id} variant="secondary">
                    {entry.display_name}
                  </Badge>
                ))}
                {state.data.count > state.data.sample.length && (
                  <Badge variant="secondary">
                    {t('moreCount', { count: state.data.count - state.data.sample.length })}
                  </Badge>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">{t('empty')}</p>
        )}
      </div>
    </div>
  );
}
