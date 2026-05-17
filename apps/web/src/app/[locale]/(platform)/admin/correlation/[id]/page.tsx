'use client';

import { Clock, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

interface CorrelationEvent {
  id: string;
  correlation_id: string;
  occurred_at: string;
  source: string;
  event_type: string;
  payload: unknown;
}

export default function PlatformCorrelationPage({ params }: { params: { id: string } }) {
  const [events, setEvents] = React.useState<CorrelationEvent[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadEvents = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient<CorrelationEvent[]>(
        `/api/v1/admin/correlation/${encodeURIComponent(params.id)}`,
      );
      setEvents(result);
    } catch (err) {
      console.error('[PlatformCorrelationPage.loadEvents]', err);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  React.useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  return (
    <main className="space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            Observability
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">Correlation timeline</h1>
          <p className="mt-1 break-all font-mono text-sm text-text-secondary">{params.id}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadEvents()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text-primary hover:bg-surface-hover"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </header>

      <section className="rounded-lg border border-border bg-surface p-4">
        {loading ? (
          <div className="text-sm text-text-secondary">Loading timeline...</div>
        ) : events.length === 0 ? (
          <div className="text-sm text-text-secondary">
            No events found for this correlation id.
          </div>
        ) : (
          <ol className="space-y-4">
            {events.map((event) => (
              <li key={event.id} className="border-s border-border ps-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Clock className="h-4 w-4 text-text-tertiary" />
                  <span className="text-sm font-semibold text-text-primary">
                    {event.source}:{event.event_type}
                  </span>
                  <span className="text-xs text-text-tertiary">
                    {new Date(event.occurred_at).toLocaleString()}
                  </span>
                </div>
                <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-surface-secondary p-3 text-xs text-text-secondary">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
