'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Award, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { createManualAwardSchema, type CreateManualAwardDto } from '@school/shared/behaviour';
import {
  Button,
  Input,
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

interface AwardType {
  id: string;
  name: string;
  points: number;
  icon: string | null;
  color: string | null;
}

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  year_group: { name: string } | null;
}

interface AwardResponse {
  data: { id: string };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RecognitionNewPage() {
  const t = useTranslations('behaviour.recognitionNew');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillStudentId = searchParams?.get('student_id') ?? '';

  const [awardTypes, setAwardTypes] = React.useState<AwardType[]>([]);
  const [students, setStudents] = React.useState<StudentRow[]>([]);
  const [studentQuery, setStudentQuery] = React.useState('');
  const [loadingOptions, setLoadingOptions] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');

  const form = useForm<CreateManualAwardDto>({
    resolver: zodResolver(createManualAwardSchema),
    defaultValues: {
      student_id: prefillStudentId,
      award_type_id: '',
      notes: null,
    },
  });

  React.useEffect(() => {
    (async () => {
      try {
        const [awardsRes, studentsRes] = await Promise.all([
          apiClient<{ data: AwardType[] }>('/api/v1/behaviour/award-types?page=1&pageSize=100', {
            silent: true,
          }).catch(() => ({ data: [] as AwardType[] })),
          apiClient<{ data: StudentRow[] }>('/api/v1/students?page=1&pageSize=100&status=active', {
            silent: true,
          }).catch(() => ({ data: [] as StudentRow[] })),
        ]);
        setAwardTypes(awardsRes.data ?? []);
        setStudents(studentsRes.data ?? []);
      } finally {
        setLoadingOptions(false);
      }
    })().catch((err) => console.error('[RecognitionNewPage]', err));
  }, []);

  const selectedAwardType = awardTypes.find((a) => a.id === form.watch('award_type_id'));
  const filteredStudents = React.useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return students.slice(0, 30);
    return students
      .filter((s) => `${s.first_name} ${s.last_name}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [students, studentQuery]);

  const onSubmit = async (values: CreateManualAwardDto) => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await apiClient<AwardResponse>('/api/v1/behaviour/recognition/awards', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      router.push(`/${locale}/behaviour/recognition?tab=wall&awarded=${res.data.id}`);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string; code?: string } };
      setSubmitError(ex.error?.message ?? t('errorGeneric'));
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <Link
          href={`/${locale}/behaviour/recognition`}
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-3 w-3" />
          {t('backToList')}
        </Link>
      </div>
      <PageHeader title={t('title')} description={t('description')} />

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div className="space-y-5">
            {/* Student */}
            <div className="space-y-1.5">
              <Label htmlFor="student_search">{t('student')}</Label>
              <Input
                id="student_search"
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                placeholder={t('studentPlaceholder')}
                className="text-base"
                disabled={loadingOptions}
              />
              {filteredStudents.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface-secondary">
                  {filteredStudents.map((s) => {
                    const isSelected = form.watch('student_id') === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          form.setValue('student_id', s.id);
                          setStudentQuery(`${s.first_name} ${s.last_name}`);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-start text-sm transition-colors ${
                          isSelected ? 'bg-primary-50 text-primary-700' : 'hover:bg-surface'
                        }`}
                      >
                        <span>
                          {s.first_name} {s.last_name}
                        </span>
                        <span className="text-xs text-text-tertiary">
                          {s.year_group?.name ?? '—'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {form.formState.errors.student_id && (
                <p className="text-xs text-danger-text">{t('studentRequired')}</p>
              )}
            </div>

            {/* Award type */}
            <div className="space-y-1.5">
              <Label htmlFor="award_type_id">{t('awardType')}</Label>
              <Select
                value={form.watch('award_type_id')}
                onValueChange={(v) => form.setValue('award_type_id', v)}
                disabled={loadingOptions || awardTypes.length === 0}
              >
                <SelectTrigger id="award_type_id">
                  <SelectValue
                    placeholder={
                      awardTypes.length === 0 && !loadingOptions
                        ? t('noAwardTypes')
                        : t('awardTypePlaceholder')
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {awardTypes.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.icon ? `${a.icon} ` : ''}
                      {a.name} · +{a.points} {t('points')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedAwardType && (
                <p className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <Award
                    className="h-3 w-3"
                    style={{ color: selectedAwardType.color ?? undefined }}
                    aria-hidden="true"
                  />
                  {t('pointsSummary', { points: selectedAwardType.points })}
                </p>
              )}
              {form.formState.errors.award_type_id && (
                <p className="text-xs text-danger-text">{t('awardTypeRequired')}</p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">{t('notes')}</Label>
              <Textarea
                id="notes"
                placeholder={t('notesPlaceholder')}
                className="min-h-[96px] text-base"
                maxLength={500}
                {...form.register('notes')}
              />
            </div>
          </div>
        </div>

        {submitError && (
          <div className="rounded-xl border border-danger-300 bg-danger-50 p-4">
            <p className="text-sm text-text-primary">{submitError}</p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Link href={`/${locale}/behaviour/recognition`}>
            <Button type="button" variant="outline">
              {t('cancel')}
            </Button>
          </Link>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
                {t('submitting')}
              </>
            ) : (
              t('submit')
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
