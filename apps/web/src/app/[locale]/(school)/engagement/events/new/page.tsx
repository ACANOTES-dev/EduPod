'use client';

import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/page-header';

import { EventWizard } from '../../_components/event-wizard';

export default function NewEngagementEventPage() {
  const t = useTranslations('engagement');

  return (
    <div className="space-y-6">
      <PageHeader title={t('pages.newEvent.title')} description={t('pages.newEvent.description')} />
      <EventWizard />
    </div>
  );
}
