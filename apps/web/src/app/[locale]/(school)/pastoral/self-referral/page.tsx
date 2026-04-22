'use client';

import { CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
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

interface ChildSummary {
  student_id: string;
  student_name: string;
}

interface SummaryResponse {
  children: ChildSummary[];
}

const CATEGORY_OPTIONS = [
  { value: 'academic', labelKey: 'catAcademic' },
  { value: 'social', labelKey: 'catSocial' },
  { value: 'emotional', labelKey: 'catEmotional' },
  { value: 'behaviour', labelKey: 'catBehaviour' },
  { value: 'family', labelKey: 'catFamily' },
  { value: 'other', labelKey: 'catOther' },
] as const;

export default function ParentSelfReferralPage() {
  const t = useTranslations('parentSelfReferral');
  const router = useRouter();
  const locale = useLocale();

  const [children, setChildren] = React.useState<ChildSummary[]>([]);
  const [studentId, setStudentId] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [narrative, setNarrative] = React.useState('');
  const [preferredContact, setPreferredContact] = React.useState('email');
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    apiClient<SummaryResponse>('/api/v1/parent/behaviour/summary', { silent: true })
      .then((res) => {
        const list = res.children ?? [];
        setChildren(list);
        if (list.length === 1 && list[0]) setStudentId(list[0].student_id);
      })
      .catch((err) => {
        console.error('[ParentSelfReferralPage]', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const canSubmit =
    studentId.length > 0 &&
    category.length > 0 &&
    narrative.trim().length >= 30 &&
    narrative.trim().length <= 10000;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      // Pastoral self-referral endpoint uses `description` as the narrative
      // field; prepend the preferred-contact note so the pastoral lead knows
      // how to follow up (the endpoint schema doesn't yet accept a separate
      // preferred_contact field — this keeps the write within spec).
      const body = {
        student_id: studentId,
        description: `${narrative.trim()}\n\n---\nPreferred contact: ${preferredContact}`,
        category,
      };
      await apiClient('/api/v1/parent/pastoral/self-referral', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setSubmitted(true);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setSubmitError(ex.error?.message ?? t('errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <div className="h-8 w-48 animate-pulse rounded bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl space-y-6 p-4 sm:p-6">
        <PageHeader
          title={t('submittedTitle')}
          back={{ href: `/${locale}/behaviour/parent-portal`, label: t('backToPortal') }}
        />
        <div className="rounded-xl border border-success-200 bg-success-50 p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success-700" aria-hidden="true" />
          <p className="mt-3 text-sm text-text-primary">{t('submittedBody')}</p>
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
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/behaviour/parent-portal`, label: t('backToPortal') }}
      />

      <div className="space-y-5 rounded-2xl border border-border bg-surface p-5 sm:p-6">
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

        <div className="space-y-1.5">
          <Label>{t('categoryLabel')}</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder={t('categoryPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey as never)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sr-narrative">{t('narrativeLabel')}</Label>
          <Textarea
            id="sr-narrative"
            value={narrative}
            onChange={(e) => setNarrative(e.target.value.slice(0, 10000))}
            placeholder={t('narrativePlaceholder')}
            className="min-h-[160px] text-base"
            maxLength={10000}
          />
          <p className="text-end text-xs text-text-tertiary">
            {narrative.trim().length}/10000 · {t('narrativeMinHint')}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>{t('preferredContactLabel')}</Label>
          <Select value={preferredContact} onValueChange={setPreferredContact}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">{t('contactEmail')}</SelectItem>
              <SelectItem value="phone">{t('contactPhone')}</SelectItem>
              <SelectItem value="in_person">{t('contactInPerson')}</SelectItem>
            </SelectContent>
          </Select>
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
