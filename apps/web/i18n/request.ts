import type { AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { defaultLocale, isLocale } from './config';
import { onMissingMessage } from './error-handler';

type MessageModule = { default: AbstractIntlMessages };

const MESSAGE_LOADERS = {
  ar: async () => ({ default: (await import('../messages/ar.json')).default }),
  de: async () => ({ default: (await import('../messages/de.json')).default }),
  en: async () => ({ default: (await import('../messages/en.json')).default }),
  es: async () => ({ default: (await import('../messages/es.json')).default }),
  fr: async () => ({ default: (await import('../messages/fr.json')).default }),
  ga: async () => ({ default: (await import('../messages/ga.json')).default }),
  it: async () => ({ default: (await import('../messages/it.json')).default }),
  ro: async () => ({ default: (await import('../messages/ro.json')).default }),
} satisfies Record<string, () => Promise<MessageModule>>;

const MESSAGE_LOADERS_BY_LOCALE: Record<string, () => Promise<MessageModule>> = MESSAGE_LOADERS;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isLocale(requested) ? requested : defaultLocale;
  const loadMessages = MESSAGE_LOADERS_BY_LOCALE[locale] ?? MESSAGE_LOADERS.en;

  return {
    locale,
    messages: (await loadMessages()).default,
    onError: onMissingMessage,
  };
});
