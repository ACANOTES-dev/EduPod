'use client';

/**
 * Re-exports the polling hook from the school-shell level provider so inbox
 * components can import it from this local folder. The single polling instance
 * lives in `_providers/inbox-polling-provider.tsx` — this module just hides
 * the path so components under `inbox/_components/` don't reach out two
 * folders up.
 */
export {
  useInboxPolling,
  useInboxPollingRefresh,
  type InboxPollingState,
} from '../../_providers/inbox-polling-provider';
