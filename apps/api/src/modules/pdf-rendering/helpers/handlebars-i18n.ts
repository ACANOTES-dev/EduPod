import type * as Handlebars from 'handlebars';

type MessageCatalogue = Record<string, Record<string, string>>;

export function registerI18nHelpers(
  hbs: typeof Handlebars,
  options: { messages: MessageCatalogue },
): void {
  hbs.registerHelper('t', (key: string, locale: string) => {
    const msg = options.messages[locale]?.[key];
    if (msg === undefined) {
      throw new Error(`MISSING_PDF_MESSAGE: "${key}" missing for locale "${locale}"`);
    }
    return msg;
  });

  hbs.registerHelper('formatDate', (date: Date | string | number, locale: string) => {
    const value = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    return new Intl.DateTimeFormat(formatLocale(locale), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(value);
  });

  hbs.registerHelper('formatCurrency', (value: number, locale: string, currency: string) => {
    return new Intl.NumberFormat(formatLocale(locale), {
      currency,
      style: 'currency',
    }).format(value);
  });

  hbs.registerHelper('formatNumber', (value: number, locale: string) => {
    return new Intl.NumberFormat(formatLocale(locale)).format(value);
  });

  hbs.registerHelper(
    'getLocalizedSchoolName',
    (tenant: Record<string, unknown>, locale: string) => {
      const localized = tenant[`school_name_${locale}`];
      if (typeof localized === 'string' && localized.trim().length > 0) {
        return localized;
      }
      return typeof tenant.name === 'string' ? tenant.name : '';
    },
  );
}

function formatLocale(locale: string): string {
  if (locale === 'ar') {
    return 'ar-u-nu-latn-ca-gregory';
  }
  return locale;
}
