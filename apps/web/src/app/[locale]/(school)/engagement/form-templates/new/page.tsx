'use client';

import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/page-header';

import { FormTemplateEditor } from '../../_components/form-template-editor';

export default function NewEngagementFormTemplatePage() {
  const t = useTranslations('engagement');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pages.newFormTemplate.title')}
        description={t('pages.newFormTemplate.description')}
      />
      <FormTemplateEditor mode="create" />
    </div>
  );
}
