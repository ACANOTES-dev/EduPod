'use client';

import { useTranslations } from 'next-intl';

import { EventWizard } from '../../_components/event-wizard';

import { PageHeader } from '@/components/page-header';


export default function NewEngagementEventPage() {
  const t = useTranslations('engagement');

  return (
    <div className="space-y-6">
      <PageHeader title={t('pages.newEvent.title')} description={t('pages.newEvent.description')} />
      <EventWizard />
    </div>
  );
}
