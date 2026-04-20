import type { WellbeingEventKey } from '../events/wellbeing-event-keys';

export interface WellbeingDispatchRecipient {
  user_id: string;
  email?: string | null;
  phone?: string | null;
}

export type WellbeingDispatchSeverity = 'info' | 'warning' | 'critical';

export interface WellbeingDispatchInput {
  tenantId: string;
  event: WellbeingEventKey;
  recipients: WellbeingDispatchRecipient[];
  title: string;
  body: string;
  href?: string;
  severity: WellbeingDispatchSeverity;
  /** Optional source entity for audit + UI linking. */
  source_entity_type?: string;
  source_entity_id?: string;
  /** Locale to render the in-app payload under (defaults to 'en'). */
  locale?: 'en' | 'ar';
}

export interface WellbeingChannelProvider {
  send(input: WellbeingDispatchInput): Promise<void>;
}
