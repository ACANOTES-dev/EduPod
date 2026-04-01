'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { RegulatoryNav } from '../../../_components/regulatory-nav';
import { TransferForm } from '../../_components/transfer-form';

import { PageHeader } from '@/components/page-header';

// ─── Page ───────────────────────────────────────────────────────────────────

export default function NewTransferPage() {
  const t = useTranslations('regulatory');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/')[1] ?? 'en';

  const transfersPath = `/${locale}/regulatory/ppod/transfers`;

  const handleSuccess = React.useCallback(() => {
    router.push(transfersPath);
  }, [router, transfersPath]);

  const handleCancel = React.useCallback(() => {
    router.push(transfersPath);
  }, [router, transfersPath]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('transfers.newTitle')}
        description={t('transfers.newDescription')}
        actions={
          <Link href={transfersPath}>
            <Button variant="outline" className="min-h-[44px]">
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              {t('transfers.backToList')}
            </Button>
          </Link>
        }
      />

      <RegulatoryNav />

      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <TransferForm onSuccess={handleSuccess} onCancel={handleCancel} />
      </div>
    </div>
  );
}
