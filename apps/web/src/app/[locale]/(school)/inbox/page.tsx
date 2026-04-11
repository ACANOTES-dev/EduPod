import { Inbox as InboxIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

export default async function InboxIndexPage() {
  const t = await getTranslations();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
      <InboxIcon className="h-12 w-12 text-[var(--color-text-tertiary)]" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        {t('inbox.empty_state.title')}
      </h2>
      <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">
        {t('inbox.empty_state.body')}
      </p>
    </div>
  );
}
