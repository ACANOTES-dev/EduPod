'use client';

import { ArrowLeft, Check, Copy } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@school/ui';

import { StaffForm, type StaffFormValues } from '../_components/staff-form';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';


interface CreatedCredentials {
  name: string;
  email: string;
  staffNumber: string;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface-secondary px-4 py-3">
      <div>
        <p className="text-xs text-text-tertiary">{label}</p>
        <p className="font-mono text-sm font-medium text-text-primary" dir="ltr">
          {value}
        </p>
      </div>
      <Button variant="ghost" size="icon" onClick={() => void handleCopy()}>
        {copied ? <Check className="h-4 w-4 text-success-text" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export default function NewStaffPage() {
  const t = useTranslations('staff');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [credentials, setCredentials] = React.useState<CreatedCredentials | null>(null);

  const handleSubmit = async (values: StaffFormValues) => {
    const payload = {
      first_name: values.first_name,
      last_name: values.last_name,
      email: values.email,
      phone: values.phone,
      role_id: values.role_id,
      job_title: values.job_title || undefined,
      employment_status: values.employment_status,
      department: values.department || undefined,
      employment_type: values.employment_type,
      bank_name: values.bank_name || undefined,
      bank_account_number: values.bank_account_number || undefined,
      bank_iban: values.bank_iban || undefined,
    };
    await apiClient('/api/v1/staff-profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    setCredentials({
      name: `${values.first_name} ${values.last_name}`,
      email: values.email,
      staffNumber: values.staff_number,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('newStaff')}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {tc('back')}
          </Button>
        }
      />
      <StaffForm
        onSubmit={handleSubmit}
        showBankDetails={true}
        submitLabel={t('createStaff')}
        onCancel={() => router.push(`/${locale}/staff`)}
      />

      <Dialog open={!!credentials} onOpenChange={() => router.push(`/${locale}/staff`)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('credentialsTitle')}</DialogTitle>
          </DialogHeader>
          {credentials && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                {t('credentialsDescription', { name: credentials.name })}
              </p>
              <div className="space-y-3">
                <CopyField label={t('fieldEmail')} value={credentials.email} />
                <CopyField label={t('credentialsPassword')} value={credentials.staffNumber} />
              </div>
              <p className="text-xs text-text-tertiary">{t('credentialsNote')}</p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => router.push(`/${locale}/staff`)}>{tc('done')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
