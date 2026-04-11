import { Inbox as InboxIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

export default async function InboxIndexPage() {
  const t = await getTranslations();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-surface-secondary)]">
        <InboxIcon
          className="h-8 w-8 text-[var(--color-text-tertiary)]"
          aria-hidden="true"
          strokeWidth={1.5}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          {t('inbox.empty_state.title')}
        </h2>
        <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">
          {t('inbox.empty_state.body')}
        </p>
      </div>
    </div>
  );
}
