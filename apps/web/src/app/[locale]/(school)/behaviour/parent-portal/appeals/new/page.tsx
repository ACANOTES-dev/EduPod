'use client';

import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChildSummary {
  student_id: string;
  student_name: string;
}

interface SummaryResponse {
  children: ChildSummary[];
}

const GROUNDS_CATEGORY_OPTIONS = [
  { value: 'factual_inaccuracy', labelKey: 'groundsFactual' },
  { value: 'disproportionate_consequence', labelKey: 'groundsDisproportionate' },
  { value: 'procedural_error', labelKey: 'groundsProcedural' },
  { value: 'mitigating_circumstances', labelKey: 'groundsMitigating' },
  { value: 'mistaken_identity', labelKey: 'groundsMistaken' },
  { value: 'other', labelKey: 'groundsOther' },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParentAppealNewPage() {
  const t = useTranslations('parentAppeal');
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();

  const preIncidentId = searchParams?.get('incident_id') ?? '';
  const preStudentId = searchParams?.get('student_id') ?? '';

  const [children, setChildren] = React.useState<ChildSummary[]>([]);
  const [incidentId, setIncidentId] = React.useState(preIncidentId);
  const [studentId, setStudentId] = React.useState(preStudentId);
  const [groundsCategory, setGroundsCategory] = React.useState<string>('');
  const [grounds, setGrounds] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');
  const [submittedId, setSubmittedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiClient<SummaryResponse>('/api/v1/parent/behaviour/summary', { silent: true })
      .then((res) => {
        const list = res.children ?? [];
        setChildren(list);
        if (!preStudentId && list.length === 1 && list[0]) {
          setStudentId(list[0].student_id);
        }
      })
      .catch((err) => {
        console.error('[ParentAppealNewPage]', err);
      })
      .finally(() => setLoading(false));
  }, [preStudentId]);

  const canSubmit =
    studentId.length > 0 &&
    incidentId.length > 0 &&
    groundsCategory.length > 0 &&
    grounds.trim().length >= 20 &&
    grounds.trim().length <= 5000;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await apiClient<{ data: { id: string } }>('/api/v1/parent/behaviour/appeal', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: 'incident',
          incident_id: incidentId,
          student_id: studentId,
          grounds: grounds.trim(),
          grounds_category: groundsCategory,
        }),
      });
      setSubmittedId(res.data?.id ?? 'submitted');
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setSubmitError(ex.error?.message ?? t('errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (submittedId) {
    return (
      <div className="mx-auto max-w-xl space-y-6 p-4 sm:p-6">
        <PageHeader title={t('submittedTitle')} />
        <div className="rounded-xl border border-success-200 bg-success-50 p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success-700" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-text-primary">{t('submittedBodyTitle')}</p>
          <p className="mt-1 text-xs text-text-secondary">{t('submittedBody')}</p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => router.push(`/${locale}/behaviour/parent-portal`)}
          >
            {t('backToPortal')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4 sm:p-6">
      <Link
        href={`/${locale}/behaviour/parent-portal`}
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('backToPortal')}
      </Link>

      <PageHeader title={t('title')} description={t('description')} />

      <div className="space-y-5 rounded-2xl border border-border bg-surface p-5 sm:p-6">
        {/* Student picker */}
        {children.length > 1 && (
          <div className="space-y-1.5">
            <Label>{t('studentLabel')}</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger>
                <SelectValue placeholder={t('studentPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {children.map((c) => (
                  <SelectItem key={c.student_id} value={c.student_id}>
                    {c.student_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Incident reference */}
        <div className="space-y-1.5">
          <Label htmlFor="appeal-incident">{t('incidentLabel')}</Label>
          <input
            id="appeal-incident"
            type="text"
            value={incidentId}
            onChange={(e) => setIncidentId(e.target.value.trim())}
            placeholder={t('incidentPlaceholder')}
            className="flex h-10 w-full rounded-md border border-border bg-surface px-3 text-base text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            dir="ltr"
          />
          <p className="text-xs text-text-tertiary">{t('incidentHint')}</p>
        </div>

        {/* Grounds category */}
        <div className="space-y-1.5">
          <Label>{t('groundsCategoryLabel')}</Label>
          <Select value={groundsCategory} onValueChange={setGroundsCategory}>
            <SelectTrigger>
              <SelectValue placeholder={t('groundsCategoryPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {GROUNDS_CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey as never)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Grounds (free text) */}
        <div className="space-y-1.5">
          <Label htmlFor="appeal-grounds">{t('groundsLabel')}</Label>
          <Textarea
            id="appeal-grounds"
            value={grounds}
            onChange={(e) => setGrounds(e.target.value.slice(0, 5000))}
            placeholder={t('groundsPlaceholder')}
            className="min-h-[160px] text-base"
            maxLength={5000}
          />
          <p className="text-end text-xs text-text-tertiary">
            {grounds.trim().length}/5000 · {t('groundsMinHint')}
          </p>
        </div>

        {submitError && (
          <p className="text-sm text-danger-text" role="alert">
            {submitError}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => router.push(`/${locale}/behaviour/parent-portal`)}
            disabled={submitting}
          >
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? t('submitting') : t('submit')}
          </Button>
        </div>
      </div>
    </div>
  );
}
