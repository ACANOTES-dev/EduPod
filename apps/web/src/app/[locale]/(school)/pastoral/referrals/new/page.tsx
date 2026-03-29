'use client';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { SearchPicker } from '@/components/pastoral/search-picker';
import { apiClient } from '@/lib/api-client';
import {
  getLocaleFromPathname,
  PASTORAL_REFERRAL_TYPES,
  searchStudents,
  type PastoralApiDetailResponse,
  type PastoralApiListResponse,
  type PastoralCaseDetail,
  type PastoralCaseListItem,
  type SearchOption,
} from '@/lib/pastoral';

export default function NewPastoralReferralPage() {
  const t = useTranslations('pastoral.newReferral');
  const sharedT = useTranslations('pastoral.shared');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCaseId = searchParams?.get('caseId') ?? '';
  const [cases, setCases] = React.useState<PastoralCaseListItem[]>([]);
  const [caseId, setCaseId] = React.useState(preselectedCaseId);
  const [student, setStudent] = React.useState<SearchOption[]>([]);
  const [referralType, setReferralType] = React.useState('neps');
  const [referralBodyName, setReferralBodyName] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;

    void apiClient<PastoralApiListResponse<PastoralCaseListItem>>(
      '/api/v1/pastoral/cases?page=1&pageSize=100',
      {
        silent: true,
      },
    )
      .then((response) => {
        if (!cancelled) {
          setCases(response.data ?? []);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!caseId) {
      return;
    }

    let cancelled = false;

    void apiClient<PastoralApiDetailResponse<PastoralCaseDetail>>(
      `/api/v1/pastoral/cases/${caseId}`,
      {
        silent: true,
      },
    )
      .then((response) => {
        if (!cancelled) {
          setStudent([
            {
              id: response.data.student_id,
              label: response.data.student_name,
            },
          ]);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!student[0]) {
      setError(t('errors.student'));
      return;
    }

    if (referralType === 'other_external' && !referralBodyName.trim()) {
      setError(t('errors.body'));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiClient<PastoralApiDetailResponse<{ id: string }>>(
        '/api/v1/pastoral/referrals',
        {
          method: 'POST',
          body: JSON.stringify({
            student_id: student[0].id,
            case_id: caseId || undefined,
            referral_type: referralType,
            referral_body_name: referralBodyName.trim() || undefined,
          }),
        },
      );

      router.push(`/${locale}/pastoral/referrals/${response.data.id}`);
    } catch (submissionError: unknown) {
      const apiError = submissionError as { error?: { message?: string } };
      setError(apiError.error?.message ?? t('errors.generic'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <form
        onSubmit={handleSubmit}
        className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]"
      >
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('studentSection')}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <SearchPicker
                label={t('fields.student')}
                placeholder={t('fields.studentPlaceholder')}
                search={searchStudents}
                selected={student}
                onChange={(next) => setStudent(next.slice(0, 1))}
                multiple={false}
                emptyText={sharedT('noStudents')}
                minSearchLengthText={sharedT('minSearchLength')}
              />

              <div className="space-y-2">
                <Label>{t('fields.case')}</Label>
                <Select
                  value={caseId || 'none'}
                  onValueChange={(value) => setCaseId(value === 'none' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('fields.casePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('fields.noCase')}</SelectItem>
                    {cases.map((caseItem) => (
                      <SelectItem key={caseItem.id} value={caseItem.id}>
                        {caseItem.case_number}
                        {' · '}
                        {caseItem.student_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('referralSection')}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('fields.type')}</Label>
                <Select value={referralType} onValueChange={setReferralType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PASTORAL_REFERRAL_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`types.${option}` as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="referral_body_name">{t('fields.referralBodyName')}</Label>
                <Input
                  id="referral_body_name"
                  value={referralBodyName}
                  onChange={(event) => setReferralBodyName(event.target.value)}
                  placeholder={t('fields.referralBodyNamePlaceholder')}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('submitSection')}</h2>
            <div className="mt-4 space-y-4">
              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {error}
                </div>
              ) : null}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                <Save className="me-2 h-4 w-4" />
                {isSubmitting ? t('saving') : t('submit')}
              </Button>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
