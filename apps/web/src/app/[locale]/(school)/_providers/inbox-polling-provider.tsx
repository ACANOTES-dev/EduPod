'use client';

import * as React from 'react';

import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

export interface InboxPollingState {
  unread_total: number;
  latest_message_at: string | null;
}

interface InboxPollingContextValue {
  state: InboxPollingState | null;
  /** Forces an immediate refetch — used after sending/reading a message. */
  refresh: () => void;
}

const InboxPollingContext = React.createContext<InboxPollingContextValue | null>(null);

const POLL_INTERVAL_MS = 30_000;

export function InboxPollingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = React.useState<InboxPollingState | null>(null);
  const cancelledRef = React.useRef(false);
  const tickRef = React.useRef<() => Promise<void>>(async () => {});

  React.useEffect(() => {
    cancelledRef.current = false;

    if (!user) {
      setState(null);
      return;
    }

    const tick = async (): Promise<void> => {
      if (cancelledRef.current) return;
      try {
        const res = await apiClient<{ data: InboxPollingState } | InboxPollingState>(
          '/api/v1/inbox/state',
          { silent: true },
        );
        if (cancelledRef.current) return;
        const next =
          res && typeof res === 'object' && 'data' in res
            ? (res as { data: InboxPollingState }).data
            : (res as InboxPollingState);
        setState(next);
      } catch (err) {
        console.error('[useInboxPolling]', err);
      }
    };
    tickRef.current = tick;

    void tick();
    const interval = setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [user]);

  const refresh = React.useCallback(() => {
    void tickRef.current();
  }, []);

  const value = React.useMemo<InboxPollingContextValue>(
    () => ({ state, refresh }),
    [state, refresh],
  );

  return <InboxPollingContext.Provider value={value}>{children}</InboxPollingContext.Provider>;
}

export function useInboxPolling(): InboxPollingState | null {
  const ctx = React.useContext(InboxPollingContext);
  return ctx?.state ?? null;
}

export function useInboxPollingRefresh(): () => void {
  const ctx = React.useContext(InboxPollingContext);
  return ctx?.refresh ?? (() => {});
}
