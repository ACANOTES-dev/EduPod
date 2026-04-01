'use client';

import { FileText, Shield, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';

import { RegulatoryNav } from '../_components/regulatory-nav';



// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLocaleFromPathname(pathname: string): string {
  const segments = pathname.split('/');
  return segments[1] === 'ar' ? 'ar' : 'en';
}

// ─── Link card data ───────────────────────────────────────────────────────────

interface SafeguardingLink {
  titleKey: 'childProtection' | 'staffVetting' | 'mandatoryReporting';
  descriptionKey: string;
  icon: typeof Shield;
  href: string;
}

const SAFEGUARDING_LINKS: SafeguardingLink[] = [
  {
    titleKey: 'childProtection',
    descriptionKey: 'Manage child protection concerns and designated liaison person records.',
    icon: Shield,
    href: '/safeguarding',
  },
  {
    titleKey: 'staffVetting',
    descriptionKey: 'Track Garda vetting status and staff clearance documentation.',
    icon: Users,
    href: '/safeguarding',
  },
  {
    titleKey: 'mandatoryReporting',
    descriptionKey:
      'Submit and track mandatory reports to Tusla under the Children First Act 2015.',
    icon: FileText,
    href: '/safeguarding',
  },
];

// ─── Page Component ───────────────────────────────────────────────────────────

export default function RegulatorySafeguardingPage() {
  const t = useTranslations('regulatory.safeguarding');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname ?? '');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <RegulatoryNav />

      {/* Info card */}
      <div className="rounded-2xl border border-border bg-surface-secondary px-4 py-4 sm:px-6 sm:py-5">
        <p className="text-sm text-text-secondary leading-relaxed">{t('safeguardingInfo')}</p>
      </div>

      {/* Link cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SAFEGUARDING_LINKS.map((link) => {
          const Icon = link.icon;

          return (
            <div
              key={link.titleKey}
              className="flex flex-col rounded-2xl border border-border bg-surface px-4 py-5 sm:px-6"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-text-primary">{t(link.titleKey)}</h3>
                  <p className="mt-1 text-xs text-text-tertiary leading-relaxed">
                    {link.descriptionKey}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Link href={`/${locale}${link.href}`}>
                  <Button variant="outline" size="sm" className="min-h-[44px] min-w-[44px]">
                    {t('goToSafeguarding')}
                  </Button>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
