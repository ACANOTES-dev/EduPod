'use client';

import { Button } from '@school/ui';
import { ArrowLeft, Edit } from 'lucide-react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { RecordHub } from '@/components/record-hub';
import { apiClient } from '@/lib/api-client';

import { EnrolmentManagement } from '../_components/enrolment-management';
import { StaffAssignment } from '../_components/staff-assignment';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassDetail {
  id: string;
  name: string;
  status: string;
  academic_year: { id: string; name: string };
  year_group: { id: string; name: string };
  subject: { id: string; name: string } | null;
  _count?: {
    class_enrolments: number;
    class_staff: number;
  };
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ cls }: { cls: ClassDetail }) {
  const t = useTranslations('classes');
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-text-tertiary">{t('colAcademicYear')}</dt>
          <dd className="mt-0.5 text-sm text-text-primary">{cls.academic_year.name}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">{t('colYearGroup')}</dt>
          <dd className="mt-0.5 text-sm text-text-primary">{cls.year_group.name}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">{t('colSubject')}</dt>
          <dd className="mt-0.5 text-sm text-text-primary">{cls.subject?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">{t('colStatus')}</dt>
          <dd className="mt-0.5 text-sm capitalize text-text-primary">{cls.status}</dd>
        </div>
      </dl>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClassDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('classes');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [cls, setCls] = React.useState<ClassDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    apiClient<{ data: ClassDetail }>(`/api/v1/classes/${id}`)
      .then((res) => setCls(res.data))
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

  if (error || !cls) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
        </Button>
        <p className="text-sm text-danger-text">{error || t('notFound')}</p>
      </div>
    );
  }

  const statusVariantMap: Record<string, 'success' | 'warning' | 'neutral'> = {
    active: 'success',
    inactive: 'warning',
    archived: 'neutral',
  };

  const tabs = [
    {
      key: 'overview',
      label: t('tabOverview'),
      content: <OverviewTab cls={cls} />,
    },
    {
      key: 'students',
      label: `${t('tabStudents')} (${cls._count?.class_enrolments ?? 0})`,
      content: <EnrolmentManagement classId={id} />,
    },
    {
      key: 'staff',
      label: `${t('tabStaff')} (${cls._count?.class_staff ?? 0})`,
      content: <StaffAssignment classId={id} />,
    },
  ];

  return (
    <RecordHub
      title={cls.name}
      subtitle={cls.academic_year.name}
      status={{
        label: cls.status,
        variant: statusVariantMap[cls.status] ?? 'neutral',
      }}
      reference={cls.year_group.name}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {tc('back')}
          </Button>
          <Button onClick={() => router.push(`/${locale}/classes/${id}/edit`)}>
            <Edit className="me-2 h-4 w-4" />
            {tc('edit')}
          </Button>
        </div>
      }
      metrics={[
        { label: t('colStudents'), value: cls._count?.class_enrolments ?? 0 },
        { label: t('tabStaff'), value: cls._count?.class_staff ?? 0 },
        { label: t('colSubject'), value: cls.subject?.name ?? '—' },
      ]}
      tabs={tabs}
    />
  );
}
