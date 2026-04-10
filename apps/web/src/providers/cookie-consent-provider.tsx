'use client';

import { Shield, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  getConsent,
  hasConsentExpired,
  setConsent,
  type ConsentCategories,
} from '@/lib/cookie-consent';

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('cookieConsent');
  const [visible, setVisible] = React.useState(false);
  const [showPreferences, setShowPreferences] = React.useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = React.useState(false);

  React.useEffect(() => {
    const consent = getConsent();
    if (!consent || hasConsentExpired()) {
      setVisible(true);
    }
  }, []);

  const handleAcceptAll = React.useCallback(() => {
    const categories: ConsentCategories = { essential: true, analytics: true };
    setConsent(categories);
    setVisible(false);
  }, []);

  const handleEssentialOnly = React.useCallback(() => {
    const categories: ConsentCategories = { essential: true, analytics: false };
    setConsent(categories);
    setVisible(false);
  }, []);

  const handleSavePreferences = React.useCallback(() => {
    const categories: ConsentCategories = { essential: true, analytics: analyticsEnabled };
    setConsent(categories);
    setVisible(false);
  }, [analyticsEnabled]);

  return (
    <>
      {children}
      {visible && (
        // The outer wrapper spans the full viewport width so the inner card
        // can be centred, but it must NOT swallow pointer events outside the
        // card itself — otherwise admins can't click anything in the lower
        // 100px of the page until they dismiss the banner. `pointer-events-
        // none` on the wrapper + `pointer-events-auto` on the card lets the
        // surface around the card pass clicks through to the page below.
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-4">
          <div className="pointer-events-auto mx-auto max-w-3xl rounded-xl border border-border bg-surface/95 p-5 shadow-lg backdrop-blur-md">
            {/* Header */}
            <div className="mb-3 flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-surface">
                <Shield className="h-4 w-4 text-brand" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-text-primary">{t('title')}</h2>
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                  {t('description')}{' '}
                  <Link
                    href="/cookie-policy"
                    className="text-brand underline underline-offset-2 hover:text-brand/80"
                  >
                    {t('cookiePolicy')}
                  </Link>
                </p>
              </div>
            </div>

            {/* Preferences expandable section */}
            {showPreferences && (
              <div className="mb-4 space-y-3 rounded-lg border border-border bg-background p-4">
                {/* Essential — always on */}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-primary">{t('essentialTitle')}</p>
                    <p className="text-xs text-text-secondary">{t('essentialDescription')}</p>
                  </div>
                  <button
                    type="button"
                    disabled
                    aria-label={t('essentialAlwaysOn')}
                    className="relative inline-flex h-5 w-9 shrink-0 cursor-not-allowed items-center rounded-full bg-brand opacity-60"
                  >
                    <span className="inline-block h-3.5 w-3.5 translate-x-[18px] rounded-full bg-white transition-transform" />
                  </button>
                </div>

                {/* Analytics / Monitoring — toggleable */}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-primary">{t('analyticsTitle')}</p>
                    <p className="text-xs text-text-secondary">{t('analyticsDescription')}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={analyticsEnabled}
                    aria-label={t('analyticsToggle')}
                    onClick={() => setAnalyticsEnabled((prev) => !prev)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                      analyticsEnabled ? 'bg-brand' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                        analyticsEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setShowPreferences((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
              >
                {showPreferences ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    {t('hidePreferences')}
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    {t('managePreferences')}
                  </>
                )}
              </button>

              <div className="flex flex-col gap-2 sm:flex-row">
                {showPreferences ? (
                  <button
                    type="button"
                    onClick={handleSavePreferences}
                    className="rounded-lg bg-brand px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-brand/90"
                  >
                    {t('savePreferences')}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleEssentialOnly}
                      className="rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-background"
                    >
                      {t('essentialOnly')}
                    </button>
                    <button
                      type="button"
                      onClick={handleAcceptAll}
                      className="rounded-lg bg-brand px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-brand/90"
                    >
                      {t('acceptAll')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
