import type { InboxChannel } from './constants';

/**
 * Estimated per-recipient cost labels surfaced by the compose dialog.
 *
 * These are a **UX nudge only** — they exist to remind senders that
 * external channels cost money per recipient and that the inbox is the
 * cheapest default channel. They are NOT wired to billing and must not
 * be treated as the source of truth for actual invoicing. When a
 * per-tenant cost model ships, the compose UI will read cost labels
 * from tenant settings instead of this file.
 */
export const INBOX_CHANNEL_ESTIMATED_COSTS: Record<InboxChannel, number> = {
  inbox: 0,
  email: 0.001,
  sms: 0.05,
  whatsapp: 0.02,
};

export const INBOX_CHANNEL_COST_CURRENCY = 'EUR';
