'use client';

import * as React from 'react';

import { LOCALE_REGISTRY, type LocaleEntry } from '../../i18n/registry';

import { apiClient } from './api-client';

type TenantLocaleConfig = {
  id: string;
  default_locale: string;
  supported_locales: string[];
};

export function useTenantSupportedLocales(): {
  locales: LocaleEntry[];
  defaultLocale: string;
  loading: boolean;
} {
  const [config, setConfig] = React.useState<TenantLocaleConfig | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const result = await apiClient<TenantLocaleConfig>('/api/v1/tenants/me');
        if (!cancelled) {
          setConfig(result);
        }
      } catch (err) {
        console.error('[useTenantSupportedLocales]', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const locales = React.useMemo(() => {
    if (!config) return [];
    const supported = new Set(config.supported_locales);
    return LOCALE_REGISTRY.filter((entry) => entry.active && supported.has(entry.code));
  }, [config]);

  return {
    locales,
    defaultLocale: config?.default_locale ?? 'en',
    loading,
  };
}
