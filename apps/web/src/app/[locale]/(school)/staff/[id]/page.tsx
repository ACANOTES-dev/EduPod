'use client';

import { ArrowLeft, Edit, Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import * as React from 'react';

import { Button } from '@school/ui';

import { RecordHub } from '@/components/record-hub';
import { DataTable } from '@/components/data-table';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassStaffAssignment {
  id: string;
  role: string;
  class: {
    id: string;
    name: string;
    academic_year?: { name: string };
  };
}

interface BankDetails {
  bank_name: string | null;
  bank_account_number: string | null;
  bank_iban: string | null;
}

interface StaffDetail {
  id: string;
  staff_number: string | null;
  job_title: string | null;
  department: string | null;
  employment_status: string;
  employment_type: string;
  user: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  class_staff?: ClassStaffAssignment[];
}

// ─── Bank Details Tab ─────────────────────────────────────────────────────────

function BankDetailsTab({ staffId }: { staffId: string }) {
  const t = useTranslations('staff');
  const [data, setData] = React.useState<BankDetails | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    apiClient<BankDetails>(`/api/v1/staff-profiles/${staffId}/bank-details`)
      .then((res) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [staffId]);

  if (loading) {
    return <div className="h-20 animate-pulse rounded-lg bg-surface-secondary" />;
  }

  if (!data) {
    return <p className="text-sm text-text-tertiary">{t('noBankDetails')}</p>;
  }

  const mask = (val: string | null) =>
    val ? (visible ? val : `****${val.slice(-4)}`) : '—';

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{t('sectionBank')}</h3>
        <Button variant="ghost" size="sm" onClick={() => setVisible((v) => !v)}>
          {visible ? <EyeOff className="me-1.5 h-4 w-4" /> : <Eye className="me-1.5 h-4 w-4" />}
          {visible ? t('hideDetails') : t('showDetails')}
        </Button>
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-text-tertiary">{t('fieldBankName')}</dt>
          <dd className="mt-0.5 text-sm text-text-primary">{data.bank_name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">{t('fieldBankAccountNumber')}</dt>
          <dd className="mt-0.5 text-sm font-mono text-text-primary" dir="ltr">
            {mask(data.bank_account_number)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">{t('fieldBankIban')}</dt>
          <dd className="mt-0.5 text-sm font-mono text-text-primary" dir="ltr">
            {mask(data.bank_iban)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ staff }: { staff: StaffDetail }) {
  const t = useTranslations('staff');
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-text-tertiary">{t('fieldUser')}</dt>
          <dd className="mt-0.5 text-sm text-text-primary">
            {staff.user.first_name} {staff.user.last_name}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">{t('colName')}</dt>
          <dd className="mt-0.5 text-sm text-text-primary" dir="ltr">
            {staff.user.email}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">{t('fieldJobTitle')}</dt>
          <dd className="mt-0.5 text-sm text-text-primary">{staff.job_title ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">{t('fieldDepartment')}</dt>
          <dd className="mt-0.5 text-sm text-text-primary">{staff.department ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">{t('fieldEmploymentType')}</dt>
          <dd className="mt-0.5 text-sm capitalize text-text-primary">
            {staff.employment_type.replace('_', ' ')}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">{t('fieldStaffNumber')}</dt>
          <dd className="mt-0.5 text-sm font-mono text-text-primary" dir="ltr">
            {staff.staff_number ?? '—'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ─── Classes Tab ──────────────────────────────────────────────────────────────

function ClassesTab({ assignments }: { assignments: ClassStaffAssignment[] }) {
  const t = useTranslations('staff');
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';

  const columns = [
    {
      key: 'class_name',
      header: t('colClassName'),
      render: (row: ClassStaffAssignment) => (
        <span className="font-medium text-text-primary">{row.class.name}</span>
      ),
    },
    {
      key: 'academic_year',
      header: t('colAcademicYear'),
      render: (row: ClassStaffAssignment) => (
        <span className="text-text-secondary">{row.class.academic_year?.name ?? '—'}</span>
      ),
    },
    {
      key: 'role',
      header: t('colRole'),
      render: (row: ClassStaffAssignment) => (
        <span className="capitalize text-text-secondary">{row.role}</span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={assignments}
      page={1}
      pageSize={assignments.length || 1}
      total={assignments.length}
      onPageChange={() => undefined}
      keyExtractor={(row) => row.id}
      onRowClick={(row) => router.push(`/${locale}/classes/${row.class.id}`)}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: { id: string };
}

export default function StaffDetailPage({ params }: PageProps) {
  const t = useTranslations('staff');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';
  const { id } = params;

  const [staff, setStaff] = React.useState<StaffDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    apiClient<StaffDetail>(`/api/v1/staff-profiles/${id}`)
      .then((res) => setStaff(res))
      .catch(() => setError(t('loadError')))
      .finally(() => setLoading(false));
  }, [id, t]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="me-2 h-4 w-4" /> {tc('back')}
        </Button>
        <p className="text-sm text-danger-text">{error || t('notFound')}</p>
      </div>
    );
  }

  const statusVariant = staff.employment_status === 'active' ? 'success' : 'neutral';

  const tabs = [
    {
      key: 'overview',
      label: t('tabOverview'),
      content: <OverviewTab staff={staff} />,
    },
    {
      key: 'classes',
      label: t('tabClasses'),
      content: <ClassesTab assignments={staff.class_staff ?? []} />,
    },
    {
      key: 'bank',
      label: t('tabBank'),
      content: <BankDetailsTab staffId={id} />,
    },
  ];

  return (
    <RecordHub
      title={`${staff.user.first_name} ${staff.user.last_name}`}
      subtitle={staff.job_title ?? undefined}
      status={{ label: staff.employment_status, variant: statusVariant }}
      reference={staff.staff_number ? `#${staff.staff_number}` : undefined}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4" />
            {tc('back')}
          </Button>
          <Button onClick={() => router.push(`/${locale}/staff/${id}/edit`)}>
            <Edit className="me-2 h-4 w-4" />
            {tc('edit')}
          </Button>
        </div>
      }
      metrics={[
        { label: t('colDepartment'), value: staff.department ?? '—' },
        { label: t('fieldEmploymentType'), value: staff.employment_type.replace('_', ' ') },
        { label: t('fieldStaffNumber'), value: staff.staff_number ?? '—' },
      ]}
      tabs={tabs}
    />
  );
}
