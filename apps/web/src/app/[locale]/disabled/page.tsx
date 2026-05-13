import { getTranslations } from 'next-intl/server';

import { DisabledContent } from './_components/disabled-content';

export default async function DisabledPage() {
  const t = await getTranslations('disabled');

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <DisabledContent title={t('title')} body={t('body')} returnHome={t('return_home')} />
    </main>
  );
}
