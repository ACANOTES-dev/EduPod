'use client';

import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

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
import { SearchPicker } from '@/components/pastoral/search-picker';
import { apiClient } from '@/lib/api-client';
import {
  formatPastoralValue,
  getLocaleFromPathname,
  PASTORAL_CATEGORY_SUGGESTIONS,
  PASTORAL_EDITABLE_TIERS,
  PASTORAL_SEVERITIES,
  searchStaff,
  searchStudents,
  type PastoralApiDetailResponse,
  type PastoralApiListResponse,
  type PastoralCaseListItem,
  type SearchOption,
} from '@/lib/pastoral';

function toLocalDateTimeValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function NewPastoralConcernPage() {
  const t = useTranslations('pastoral.newConcern');
  const sharedT = useTranslations('pastoral.shared');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const router = useRouter();
  const [primaryStudent, setPrimaryStudent] = React.useState<SearchOption[]>([]);
  const [studentsInvolved, setStudentsInvolved] = React.useState<SearchOption[]>([]);
  const [studentWitnesses, setStudentWitnesses] = React.useState<SearchOption[]>([]);
  const [staffWitnesses, setStaffWitnesses] = React.useState<SearchOption[]>([]);
  const [category, setCategory] = React.useState('');
  const [severity, setSeverity] = React.useState('routine');
  const [tier, setTier] = React.useState('1');
  const [occurredAt, setOccurredAt] = React.useState(() => toLocalDateTimeValue(new Date()));
  const [location, setLocation] = React.useState('');
  const [narrative, setNarrative] = React.useState('');
  const [actionsTaken, setActionsTaken] = React.useState('');
  const [followUpNeeded, setFollowUpNeeded] = React.useState(false);
  const [followUpSuggestion, setFollowUpSuggestion] = React.useState('');
  const [linkedCaseId, setLinkedCaseId] = React.useState('none');
  const [linkedCases, setLinkedCases] = React.useState<PastoralCaseListItem[]>([]);
  const [behaviourIncidentId, setBehaviourIncidentId] = React.useState('');
  const [authorMasked, setAuthorMasked] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const studentId = primaryStudent[0]?.id;

    if (!studentId) {
      setLinkedCases([]);
      setLinkedCaseId('none');
      return;
    }

    let cancelled = false;

    void apiClient<PastoralApiListResponse<PastoralCaseListItem>>(
      `/api/v1/pastoral/cases?page=1&pageSize=20&student_id=${studentId}`,
      { silent: true },
    )
      .then((response) => {
        if (cancelled) {
          return;
        }

        const openCases = (response.data ?? []).filter((caseItem) =>
          ['open', 'active', 'monitoring'].includes(caseItem.status),
        );
        setLinkedCases(openCases);
      })
      .catch((err) => {
        console.error('[ConcernsNewPage]', err);
        if (!cancelled) {
          setLinkedCases([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [primaryStudent]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!primaryStudent[0]) {
      setError(t('errors.primaryStudent'));
      return;
    }

    if (!category.trim()) {
      setError(t('errors.category'));
      return;
    }

    if (narrative.trim().length < 10) {
      setError(t('errors.narrative'));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiClient<PastoralApiDetailResponse<{ id: string }>>(
        '/api/v1/pastoral/concerns',
        {
          method: 'POST',
          body: JSON.stringify({
            student_id: primaryStudent[0].id,
            category: category.trim(),
            severity,
            tier: Number(tier),
            occurred_at: new Date(occurredAt).toISOString(),
            location: location.trim() || null,
            students_involved: studentsInvolved.map((student) => ({
              student_id: student.id,
            })),
            witnesses: [
              ...studentWitnesses.map((student) => ({
                type: 'student' as const,
                id: student.id,
                name: student.label,
              })),
              ...staffWitnesses.map((staff) => ({
                type: 'staff' as const,
                id: staff.id,
                name: staff.label,
              })),
            ],
            narrative: narrative.trim(),
            actions_taken: actionsTaken.trim() || null,
            follow_up_needed: followUpNeeded,
            follow_up_suggestion: followUpNeeded ? followUpSuggestion.trim() || null : null,
            case_id: linkedCaseId === 'none' ? null : linkedCaseId,
            behaviour_incident_id: behaviourIncidentId.trim() || null,
            author_masked: authorMasked,
          }),
        },
      );

      router.push(`/${locale}/pastoral/concerns/${response.data.id}`);
    } catch (submissionError: unknown) {
      const apiError = submissionError as { error?: { message?: string } };
      setError(apiError.error?.message ?? t('errors.generic'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link href={`/${locale}/pastoral/concerns`}>
            <Button variant="ghost">
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              {sharedT('backToConcerns')}
            </Button>
          </Link>
        }
      />

      <form
        onSubmit={handleSubmit}
        className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]"
      >
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('studentSection')}</h2>
            <div className="mt-4 grid gap-5">
              <SearchPicker
                label={t('fields.primaryStudent')}
                placeholder={t('fields.primaryStudentPlaceholder')}
                search={searchStudents}
                selected={primaryStudent}
                onChange={(next) => {
                  const selectedStudent = next.slice(0, 1);
                  setPrimaryStudent(selectedStudent);
                  const selectedId = selectedStudent[0]?.id;
                  setStudentsInvolved((current) =>
                    selectedId ? current.filter((student) => student.id !== selectedId) : current,
                  );
                  setStudentWitnesses((current) =>
                    selectedId ? current.filter((student) => student.id !== selectedId) : current,
                  );
                }}
                multiple={false}
                emptyText={sharedT('noStudents')}
                minSearchLengthText={sharedT('minSearchLength')}
              />

              <SearchPicker
                label={t('fields.studentsInvolved')}
                placeholder={t('fields.studentsInvolvedPlaceholder')}
                search={searchStudents}
                selected={studentsInvolved}
                onChange={setStudentsInvolved}
                emptyText={sharedT('noStudents')}
                minSearchLengthText={sharedT('minSearchLength')}
                helperText={t('fields.studentsInvolvedHelp')}
                disabledIds={primaryStudent[0] ? [primaryStudent[0].id] : []}
              />
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('detailsSection')}</h2>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="category">{t('fields.category')}</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder={t('fields.categoryPlaceholder')}
                />
                <div className="flex flex-wrap gap-2">
                  {PASTORAL_CATEGORY_SUGGESTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setCategory(option)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        category === option
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                          : 'border-border bg-surface-secondary text-text-secondary hover:bg-surface-secondary/80'
                      }`}
                    >
                      {t(`categories.${option}` as never)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('fields.severity')}</Label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PASTORAL_SEVERITIES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`severity.${option}` as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('fields.tier')}</Label>
                <Select value={tier} onValueChange={setTier}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PASTORAL_EDITABLE_TIERS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {t(`tier.tier${option}` as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-text-tertiary">{t('fields.tierHelp')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="occurred_at">{t('fields.occurredAt')}</Label>
                <Input
                  id="occurred_at"
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">{t('fields.location')}</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder={t('fields.locationPlaceholder')}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="narrative">{t('fields.narrative')}</Label>
                <Textarea
                  id="narrative"
                  value={narrative}
                  onChange={(event) => setNarrative(event.target.value)}
                  rows={8}
                  placeholder={t('fields.narrativePlaceholder')}
                />
                <p className="text-xs text-text-tertiary">
                  {t('fields.narrativeCount', { count: narrative.trim().length })}
                </p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="actions_taken">{t('fields.actionsTaken')}</Label>
                <Textarea
                  id="actions_taken"
                  value={actionsTaken}
                  onChange={(event) => setActionsTaken(event.target.value)}
                  rows={4}
                  placeholder={t('fields.actionsTakenPlaceholder')}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="behaviour_incident_id">{t('fields.behaviourIncidentId')}</Label>
                <Input
                  id="behaviour_incident_id"
                  value={behaviourIncidentId}
                  onChange={(event) => setBehaviourIncidentId(event.target.value)}
                  placeholder={t('fields.behaviourIncidentIdPlaceholder')}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('witnessSection')}</h2>
            <div className="mt-4 space-y-5">
              <SearchPicker
                label={t('fields.studentWitnesses')}
                placeholder={t('fields.studentWitnessesPlaceholder')}
                search={searchStudents}
                selected={studentWitnesses}
                onChange={setStudentWitnesses}
                emptyText={sharedT('noStudents')}
                minSearchLengthText={sharedT('minSearchLength')}
                disabledIds={primaryStudent[0] ? [primaryStudent[0].id] : []}
              />
              <SearchPicker
                label={t('fields.staffWitnesses')}
                placeholder={t('fields.staffWitnessesPlaceholder')}
                search={searchStaff}
                selected={staffWitnesses}
                onChange={setStaffWitnesses}
                emptyText={sharedT('noStaff')}
                minSearchLengthText={sharedT('minSearchLength')}
              />
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('workflowSection')}</h2>
            <div className="mt-4 space-y-5">
              <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={followUpNeeded}
                    onChange={(event) => setFollowUpNeeded(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-border text-emerald-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-text-primary">
                      {t('fields.followUpNeeded')}
                    </span>
                    <span className="mt-1 block text-xs text-text-tertiary">
                      {t('fields.followUpNeededHelp')}
                    </span>
                  </span>
                </label>
              </div>

              {followUpNeeded ? (
                <div className="space-y-2">
                  <Label htmlFor="follow_up_suggestion">{t('fields.followUpSuggestion')}</Label>
                  <Textarea
                    id="follow_up_suggestion"
                    value={followUpSuggestion}
                    onChange={(event) => setFollowUpSuggestion(event.target.value)}
                    rows={3}
                    placeholder={t('fields.followUpSuggestionPlaceholder')}
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>{t('fields.linkedCase')}</Label>
                <Select value={linkedCaseId} onValueChange={setLinkedCaseId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('fields.linkedCasePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('fields.noLinkedCase')}</SelectItem>
                    {linkedCases.map((caseItem) => (
                      <SelectItem key={caseItem.id} value={caseItem.id}>
                        {caseItem.case_number}
                        {' · '}
                        {formatPastoralValue(caseItem.status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={authorMasked}
                    onChange={(event) => setAuthorMasked(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-border text-emerald-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-text-primary">
                      {t('fields.maskedAuthorship')}
                    </span>
                    <span className="mt-1 block text-xs text-text-tertiary">
                      {t('fields.maskedAuthorshipHelp')}
                    </span>
                  </span>
                </label>
              </div>

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
