export interface NotificationFanoutDraft {
  channel: string;
  idempotency_key?: string | null;
  locale?: string;
  template_key: string | null;
  variables?: Record<string, unknown>;
}

export interface HouseholdLocaleSnapshot {
  dual_language_opt_in: boolean;
  id: string;
  primary_billing_parent_locale?: string | null;
  secondary_locale: string | null;
  tenant_id: string;
}

export type FanoutNotificationResult<T extends NotificationFanoutDraft> = T & {
  idempotency_key?: string | null;
  locale: string;
};

function suffixIdempotencyKey(idempotencyKey: string | null | undefined, locale: string) {
  return idempotencyKey ? `${idempotencyKey}-${locale}` : idempotencyKey;
}

export function fanoutNotification<T extends NotificationFanoutDraft>(
  notification: T,
  household: HouseholdLocaleSnapshot,
  context: { defaultLocale: string; supportedLocales?: readonly string[] },
): FanoutNotificationResult<T>[] {
  const defaultLocale = household.primary_billing_parent_locale ?? context.defaultLocale;
  const result: FanoutNotificationResult<T>[] = [
    {
      ...notification,
      idempotency_key: suffixIdempotencyKey(notification.idempotency_key, defaultLocale),
      locale: defaultLocale,
    },
  ];

  if (!household.dual_language_opt_in || household.secondary_locale === null) {
    return result;
  }

  if (household.secondary_locale === defaultLocale) {
    return result;
  }

  if (
    context.supportedLocales !== undefined &&
    !context.supportedLocales.includes(household.secondary_locale)
  ) {
    return result;
  }

  result.push({
    ...notification,
    idempotency_key: suffixIdempotencyKey(notification.idempotency_key, household.secondary_locale),
    locale: household.secondary_locale,
  });

  return result;
}
